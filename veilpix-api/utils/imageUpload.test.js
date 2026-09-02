const test = require('node:test');
const assert = require('node:assert/strict');

const {
    TimedHttpStack,
    TUS_CHUNK_SIZE_BYTES,
    uploadTemporaryFile
} = require('./imageUpload');
const { isValidProviderMediaSignature } = require('./providerMediaUrl');

class SuccessfulUpload {
    static instances = [];

    constructor(file, options) {
        this.file = file;
        this.options = options;
        SuccessfulUpload.instances.push(this);
    }

    start() {
        setImmediate(() => this.options.onSuccess({}));
    }
}

class FailedUpload {
    constructor(_file, options) {
        this.options = options;
    }

    start() {
        setImmediate(() => this.options.onError(new Error('storage edge unavailable')));
    }
}

const storageOptions = {
    supabaseUrl: 'https://project-ref.supabase.co',
    serviceRoleKey: 'test-service-role-key',
    UploadClass: SuccessfulUpload,
    httpStack: { getName: () => 'test-stack' },
    retryDelays: [0]
};

test.beforeEach(() => {
    SuccessfulUpload.instances = [];
});

test('uploads through direct Storage and returns a signed provider relay URL', async () => {
    const source = Buffer.from('provider-reference-bytes');
    const nowMs = 1_787_350_000_000;
    const result = await uploadTemporaryFile(source, 'image/png', 'user-id', 'image', {
        ...storageOptions,
        providerMediaBaseUrl: 'https://api.example.com/api/provider-media',
        providerMediaSigningSecret: 'test-signing-secret',
        nowMs
    });
    const upload = SuccessfulUpload.instances[0];
    const providerUrl = new URL(result.url);

    assert.equal(result.success, true);
    assert.match(result.filename, /^\d+_[a-f0-9]{16}\.png$/);
    assert.equal(providerUrl.origin, 'https://api.example.com');
    assert.equal(providerUrl.pathname, `/api/provider-media/${result.filename}`);
    assert.equal(providerUrl.searchParams.get('expires'), String(Math.floor(nowMs / 1000) + 900));
    assert.equal(
        isValidProviderMediaSignature(
            result.filename,
            providerUrl.searchParams.get('expires'),
            providerUrl.searchParams.get('signature'),
            { signingSecret: 'test-signing-secret', nowMs }
        ),
        true
    );
    assert.equal(upload.file, source);
    assert.equal(
        upload.options.endpoint,
        'https://project-ref.storage.supabase.co/storage/v1/upload/resumable'
    );
    assert.equal(upload.options.chunkSize, TUS_CHUNK_SIZE_BYTES);
    assert.equal(upload.options.uploadDataDuringCreation, true);
    assert.equal(upload.options.storeFingerprintForResuming, false);
    assert.equal(upload.options.headers.authorization, 'Bearer test-service-role-key');
    assert.equal(upload.options.headers['x-upsert'], 'true');
    assert.deepEqual(upload.options.metadata, {
        bucketName: 'temp-images',
        objectName: result.filename,
        contentType: 'image/png',
        cacheControl: '3600'
    });
});

test('returns a stable retryable error when resumable Storage exhausts its retries', async () => {
    const result = await uploadTemporaryFile(
        Buffer.from('provider-reference-bytes'),
        'image/jpeg',
        'user-id',
        'image',
        {
            ...storageOptions,
            UploadClass: FailedUpload
        }
    );

    assert.deepEqual(result, {
        success: false,
        error: 'Temporary storage is unavailable. Please try again.',
        errorCode: 'TEMPORARY_STORAGE_UNAVAILABLE'
    });
});

test('aborts a stalled TUS request at the per-request timeout', async () => {
    let aborted = false;
    const innerRequest = {
        getMethod: () => 'POST',
        getURL: () => 'https://storage.example/upload',
        setHeader: () => {},
        getHeader: () => undefined,
        setProgressHandler: () => {},
        send: () => new Promise(() => {}),
        abort: async () => {
            aborted = true;
        },
        getUnderlyingObject: () => null
    };
    const stack = new TimedHttpStack(5);
    stack.stack = {
        createRequest: () => innerRequest
    };

    await assert.rejects(
        stack.createRequest('POST', 'https://storage.example/upload').send(Buffer.from('x')),
        error => error.code === 'TEMPORARY_STORAGE_TIMEOUT'
    );
    assert.equal(aborted, true);
});

test('rejects empty album references before attempting an upload', async () => {
    const result = await uploadTemporaryFile(
        Buffer.alloc(0),
        'image/png',
        'user-id',
        'image',
        storageOptions
    );

    assert.equal(result.success, false);
    assert.equal(SuccessfulUpload.instances.length, 0);
});
