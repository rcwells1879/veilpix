const CONTENT_POLICY_ERROR_CODE = 'CONTENT_POLICY_VIOLATION';

class KieApiError extends Error {
    constructor(message, upstreamStatus, details = null) {
        super(message);
        this.name = 'KieApiError';
        this.provider = 'kie.ai';
        this.upstreamStatus = Number(upstreamStatus) || 0;
        this.details = details;

        if (this.upstreamStatus === 400) {
            this.code = CONTENT_POLICY_ERROR_CODE;
        }
    }
}

function createKieApiError(context, upstreamStatus, details = null) {
    const detailText = typeof details === 'string'
        ? details
        : details?.message || details?.msg || '';
    const message = detailText ? `${context}: ${detailText}` : context;

    return new KieApiError(message, upstreamStatus, details);
}

function isKieContentPolicyError(error) {
    return error?.code === CONTENT_POLICY_ERROR_CODE
        || (error?.provider === 'kie.ai' && Number(error?.upstreamStatus) === 400);
}

function getKieErrorHttpResponse(error, fallbackError) {
    if (isKieContentPolicyError(error)) {
        return {
            status: 400,
            body: {
                error: 'Content policy violation',
                code: CONTENT_POLICY_ERROR_CODE,
                message: 'This request was flagged by the content moderation provider.'
            }
        };
    }

    return {
        status: 500,
        body: {
            error: fallbackError,
            message: error?.message || 'An unknown provider error occurred.'
        }
    };
}

module.exports = {
    CONTENT_POLICY_ERROR_CODE,
    KieApiError,
    createKieApiError,
    getKieErrorHttpResponse,
    isKieContentPolicyError
};
