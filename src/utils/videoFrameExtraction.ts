type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const LOAD_TIMEOUT_MS = 15_000;

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'loadeddata' | 'seeked',
  timeoutMs = LOAD_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('The video took too long to load. Please try again.'));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, handleEvent);
      video.removeEventListener('error', handleError);
    };

    const handleEvent = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error('The video could not be decoded by this browser.'));
    };

    video.addEventListener(eventName, handleEvent, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

async function waitForPresentedFrame(video: VideoWithFrameCallback): Promise<void> {
  if (!video.requestVideoFrameCallback) {
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
    return;
  }

  await new Promise<void>((resolve) => {
    let callbackHandle: number | null = null;
    const timeout = window.setTimeout(() => {
      if (callbackHandle !== null) video.cancelVideoFrameCallback?.(callbackHandle);
      resolve();
    }, 1_000);

    callbackHandle = video.requestVideoFrameCallback?.(() => {
      window.clearTimeout(timeout);
      resolve();
    }) ?? null;
  });
}

async function createLocalVideoUrl(source: File | string): Promise<string> {
  if (source instanceof File) return URL.createObjectURL(source);

  let response: Response;
  try {
    response = await fetch(source);
  } catch {
    throw new Error('This video host did not allow the video to be read. Try loading it from your album.');
  }

  if (!response.ok) {
    throw new Error(`The video could not be loaded (HTTP ${response.status}).`);
  }

  return URL.createObjectURL(await response.blob());
}

/**
 * Extracts the final decodable frame from a local or remote video as a PNG File.
 * Remote videos are first copied to a Blob URL so drawing them to canvas does
 * not taint the canvas when the storage provider allows CORS fetches.
 */
export async function extractLastVideoFrame(source: File | string): Promise<File> {
  const objectUrl = await createLocalVideoUrl(source);
  const video = document.createElement('video') as VideoWithFrameCallback;

  try {
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForVideoEvent(video, 'loadedmetadata');
    }

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('The video duration is unavailable, so its last frame cannot be located.');
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForVideoEvent(video, 'loadeddata');
    }

    const presentedFrame = waitForPresentedFrame(video);
    const seeked = waitForVideoEvent(video, 'seeked');
    video.currentTime = Math.max(0, video.duration - Math.min(0.001, video.duration / 2));
    await seeked;
    await presentedFrame;

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('The video frame dimensions are unavailable.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the video frame.');

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frameBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('The last frame could not be converted to an image.')),
        'image/png',
      );
    });

    const timestamp = Date.now();
    return new File([frameBlob], `video-last-frame-${timestamp}.png`, {
      type: 'image/png',
      lastModified: timestamp,
    });
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
