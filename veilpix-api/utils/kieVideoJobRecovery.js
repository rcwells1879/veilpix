const { db } = require('./database');
const { veilpixCreditsFromKieCredits } = require('./creditEconomics');
const { deleteTemporaryImage } = require('./imageUpload');
const { deleteProviderInputs } = require('./providerInput');
const {
    normalizeSeedanceResponse
} = require('./seedanceAdapter');
const { normalizeVideoResponse } = require('./wanAdapter');
const {
    normalizeWan3Response
} = require('./wan3Adapter');
const { parsePendingVideoGeneration } = require('./videoGenerationJob');
const {
    OPENROUTER_ACTIVE_STATES,
    OPENROUTER_FAILED_STATES,
    getOpenRouterSeedanceTask,
    isOpenRouterContentPolicyError,
    normalizeOpenRouterCompletedVideo
} = require('./openRouterSeedance');

const PENDING_VIDEO_JOB_TTL_MS = 48 * 60 * 60 * 1000;
const ACTIVE_KIE_STATES = new Set(['waiting', 'queuing', 'generating']);
const recoveryInFlight = new Set();

function kieConfig(provider) {
    if (provider === 'seedance') {
        return {
            apiKey: process.env.KIE_API_KEY || process.env.SEEDREAM_API_KEY,
            apiUrl: process.env.KIE_API_BASE_URL || process.env.SEEDREAM_API_BASE_URL || 'https://api.kie.ai'
        };
    }
    return {
        apiKey: process.env.SEEDREAM_API_KEY,
        apiUrl: process.env.SEEDREAM_API_BASE_URL || 'https://api.kie.ai'
    };
}

async function getKieTask(provider, taskId) {
    const { apiKey, apiUrl } = kieConfig(provider);
    if (!apiKey) throw new Error(`${provider} API key is unavailable`);
    const response = await fetch(`${apiUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30 * 1000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.code !== 200 || !result?.data) {
        throw new Error(`${provider} task query failed (${response.status}): ${result?.message || result?.msg || 'unknown error'}`);
    }
    return result.data;
}

function parsedResultJson(value) {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string' || !value.trim()) return {};
    return JSON.parse(value);
}

function normalizeCompletedVideo(provider, taskData, upstreamProvider = 'kie') {
    if (provider === 'seedance') {
        if (upstreamProvider === 'openrouter') return normalizeOpenRouterCompletedVideo(taskData);
        const normalized = normalizeSeedanceResponse(parsedResultJson(taskData.resultJson));
        if (!normalized.success) throw new Error(normalized.error || 'Seedance output was unavailable');
        return normalized;
    }
    if (provider === 'wan3') return normalizeWan3Response(taskData.resultJson);
    if (provider === 'wan') {
        const normalized = normalizeVideoResponse(parsedResultJson(taskData.resultJson));
        if (!normalized.success) throw new Error(normalized.error || 'Wan output was unavailable');
        return normalized;
    }
    throw new Error(`Unsupported recoverable video provider: ${provider}`);
}

function creditsForCompletedVideo(state, taskData) {
    const estimatedCredits = Math.max(0, Number(state.estimatedCredits) || 0);
    if (state.provider === 'seedance' && state.upstreamProvider === 'openrouter') {
        // Keep OpenRouter on the same Kie-baseline price displayed before the
        // generation starts. Provider savings help fund complimentary credits
        // and operating costs instead of changing the user price at settlement.
        return estimatedCredits;
    }
    const providerKieCredits = Number(taskData.creditsConsumed);
    const hasProviderCredits = Number.isFinite(providerKieCredits) && providerKieCredits > 0;
    if (['seedance', 'wan', 'wan3'].includes(state.provider)) {
        const providerCredits = hasProviderCredits ? veilpixCreditsFromKieCredits(providerKieCredits) : 0;
        return providerCredits > 0 ? providerCredits : estimatedCredits;
    }
    return estimatedCredits;
}

async function getProviderTask(state) {
    if (state.provider === 'seedance' && state.upstreamProvider === 'openrouter') {
        return getOpenRouterSeedanceTask(state);
    }
    return getKieTask(state.provider, state.providerTaskId);
}

function providerTaskState(state, taskData) {
    return String(state.upstreamProvider === 'openrouter' ? taskData.status : taskData.state || '').toLowerCase();
}

function providerFailureMessage(state, taskData) {
    if (state.upstreamProvider === 'openrouter') {
        const providerError = taskData?.error;
        if (isOpenRouterContentPolicyError(providerError)) {
            return 'Content policy violation: this request was flagged by the content moderation provider.';
        }
        const providerMessage = providerError?.message || providerError;
        return typeof providerMessage === 'string' && providerMessage.trim()
            ? providerMessage
            : `OpenRouter video generation ${taskData?.status || 'failed'}.`;
    }
    return taskData.failMsg || taskData.failCode || 'The video provider could not complete this generation.';
}

async function cleanupProviderInputs(record, state) {
    const cleanup = state.cleanup;
    if (!cleanup || typeof cleanup !== 'object') return;
    if (cleanup.kind === 'provider-input') {
        await deleteProviderInputs(record.clerk_user_id, cleanup.objectPaths || []);
        return;
    }
    if (cleanup.kind === 'temporary-media') {
        for (const filename of cleanup.filenames || []) {
            await deleteTemporaryImage(filename);
        }
    }
}

function processingTimeMs(record) {
    const createdAt = Date.parse(record.created_at);
    return Number.isFinite(createdAt) ? Math.max(0, Date.now() - createdAt) : 0;
}

async function failPendingJob(record, state, message) {
    await cleanupProviderInputs(record, state).catch(error => {
        console.warn(`Could not clean inputs for video generation ${record.gemini_request_id}:`, error.message);
    });
    await db.failPendingVideoGenerationJob({
        jobId: record.id,
        clerkUserId: record.clerk_user_id,
        generationId: record.gemini_request_id,
        message,
        processingTimeMs: processingTimeMs(record)
    });
}

async function recoverPendingKieVideoJob(record) {
    const state = parsePendingVideoGeneration(record.error_message);
    if (!state?.providerTaskId || !['seedance', 'wan', 'wan3'].includes(state.provider)) return;

    const createdAt = Date.parse(record.created_at);
    if (Number.isFinite(createdAt) && Date.now() - createdAt >= PENDING_VIDEO_JOB_TTL_MS) {
        await failPendingJob(
            record,
            state,
            'The video provider did not complete this generation within the 48-hour recovery window.'
        );
        return;
    }

    const taskData = await getProviderTask(state);
    const taskState = providerTaskState(state, taskData);
    const isActive = state.upstreamProvider === 'openrouter'
        ? OPENROUTER_ACTIVE_STATES.has(taskState)
        : ACTIVE_KIE_STATES.has(taskState);
    if (isActive) return;
    const isFailure = state.upstreamProvider === 'openrouter'
        ? OPENROUTER_FAILED_STATES.has(taskState)
        : taskState === 'fail';
    if (isFailure) {
        await failPendingJob(record, state, providerFailureMessage(state, taskData));
        return;
    }
    const isSuccess = state.upstreamProvider === 'openrouter'
        ? taskState === 'completed'
        : taskState === 'success';
    if (!isSuccess) return;

    const normalized = normalizeCompletedVideo(state.provider, taskData, state.upstreamProvider);
    const creditsUsed = creditsForCompletedVideo(state, taskData);
    const completion = await db.completePendingVideoGenerationJob({
        jobId: record.id,
        clerkUserId: record.clerk_user_id,
        generationId: record.gemini_request_id,
        requestType: record.request_type,
        sourceUrl: normalized.videoUrl,
        sourceHeaders: normalized.sourceHeaders,
        creditsUsed,
        processingTimeMs: processingTimeMs(record)
    });

    if (completion.updated && creditsUsed > 0) {
        const deduction = await db.deductUserCredits(record.clerk_user_id, creditsUsed);
        if (!deduction.success) {
            console.error(`Could not deduct ${creditsUsed} credits for recovered generation ${record.gemini_request_id}`);
        }
    }
    await cleanupProviderInputs(record, state).catch(error => {
        console.warn(`Could not clean inputs for completed generation ${record.gemini_request_id}:`, error.message);
    });
    console.log(`Recovered ${state.provider} video generation ${record.gemini_request_id} into the 48-hour delivery outbox`);
}

function queuePendingKieVideoJob(record) {
    if (!record?.id || recoveryInFlight.has(record.id)) return;
    recoveryInFlight.add(record.id);
    void recoverPendingKieVideoJob(record)
        .catch(error => {
            console.warn(`Pending video generation ${record.gemini_request_id} will retry:`, error.message);
        })
        .finally(() => recoveryInFlight.delete(record.id));
}

async function recoverPendingKieVideoJobs() {
    const records = await db.listPendingVideoGenerationJobs();
    for (const record of records) queuePendingKieVideoJob(record);
    return records.length;
}

module.exports = {
    PENDING_VIDEO_JOB_TTL_MS,
    creditsForCompletedVideo,
    normalizeCompletedVideo,
    providerFailureMessage,
    queuePendingKieVideoJob,
    recoverPendingKieVideoJob,
    recoverPendingKieVideoJobs
};
