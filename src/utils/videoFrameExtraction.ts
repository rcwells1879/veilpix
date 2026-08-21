type VideoFrameMetadata = {
  mediaTime?: number;
};

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameMetadata) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const LOAD_TIMEOUT_MS = 15_000;
const FRAME_PRESENT_TIMEOUT_MS = 1_500;
const BLACK_LUMINANCE_THRESHOLD = 16;
const BLACK_AVERAGE_LUMINANCE = 10;
const BLACK_PIXEL_RATIO = 0.98;

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

function waitForPresentedFrameAt(video: VideoWithFrameCallback, targetTime: number): Promise<void> {
  if (!video.requestVideoFrameCallback) {
    return new Promise<void>(resolve => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  }

  return new Promise<void>((resolve) => {
    let callbackHandle: number | null = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (callbackHandle !== null) video.cancelVideoFrameCallback?.(callbackHandle);
      resolve();
    };

    const requestFrame = () => {
      callbackHandle = video.requestVideoFrameCallback?.((_now, metadata) => {
        const mediaTime = metadata?.mediaTime;
        // Ignore an already queued frame from before the seek. This was the
        // source of intermittent all-black captures on otherwise valid videos.
        if (typeof mediaTime === 'number' && mediaTime < targetTime - 0.12) {
          requestFrame();
          return;
        }
        finish();
      }) ?? null;
    };

    const timeout = window.setTimeout(finish, FRAME_PRESENT_TIMEOUT_MS);
    requestFrame();
  });
}

async function seekToPresentedFrame(video: VideoWithFrameCallback, targetTime: number): Promise<void> {
  const maxTime = Math.max(0, video.duration - 0.03);
  const clampedTime = Math.min(Math.max(targetTime, 0), maxTime);

  if (Math.abs(video.currentTime - clampedTime) < 0.005 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForPresentedFrameAt(video, clampedTime);
    return;
  }

  const presentedFrame = waitForPresentedFrameAt(video, clampedTime);
  const seeked = waitForVideoEvent(video, 'seeked');
  video.currentTime = clampedTime;
  await seeked;
  await presentedFrame;

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForVideoEvent(video, 'loadeddata');
  }
}

function isPixelBufferNearlyBlack(data: Uint8ClampedArray): boolean {
  const pixelCount = data.length / 4;
  if (pixelCount === 0) return true;

  let darkPixels = 0;
  let luminanceTotal = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    const luminance = alpha < 8
      ? 0
      : (data[index] * 0.2126) + (data[index + 1] * 0.7152) + (data[index + 2] * 0.0722);
    luminanceTotal += luminance;
    if (luminance <= BLACK_LUMINANCE_THRESHOLD) darkPixels += 1;
  }

  return darkPixels / pixelCount >= BLACK_PIXEL_RATIO
    && luminanceTotal / pixelCount <= BLACK_AVERAGE_LUMINANCE;
}

function isCurrentVideoFrameNearlyBlack(video: HTMLVideoElement): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return isPixelBufferNearlyBlack(context.getImageData(0, 0, canvas.width, canvas.height).data);
}

export async function isImageBlobNearlyBlack(blob: Blob): Promise<boolean> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The image could not be decoded.'));
    });
    image.src = url;
    await loaded;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return isPixelBufferNearlyBlack(context.getImageData(0, 0, canvas.width, canvas.height).data);
  } finally {
    URL.revokeObjectURL(url);
  }
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

function uniqueFrameTimes(times: number[], duration: number): number[] {
  const maxTime = Math.max(0, duration - 0.03);
  const seen = new Set<number>();
  return times
    .map(time => Math.min(Math.max(time, 0), maxTime))
    .filter(time => {
      const key = Math.round(time * 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function lastFrameCandidates(duration: number): number[] {
  return uniqueFrameTimes([
    duration - 0.08,
    duration - 0.25,
    duration - 0.5,
    duration - 1,
    duration * 0.85,
    duration * 0.7,
  ], duration);
}

function thumbnailFrameCandidates(duration: number): number[] {
  return uniqueFrameTimes([
    Math.max(0.25, duration * 0.15),
    duration * 0.3,
    duration * 0.5,
    duration * 0.7,
  ], duration);
}

async function seekToUsableFrame(video: VideoWithFrameCallback, candidates: number[]): Promise<void> {
  for (const candidate of candidates) {
    await seekToPresentedFrame(video, candidate);
    if (!isCurrentVideoFrameNearlyBlack(video)) return;
  }

  throw new Error('No usable non-black frame was found in this video.');
}

function captureCurrentFrame(
  video: HTMLVideoElement,
  options: { maxSize?: number; type: 'image/jpeg' | 'image/png'; quality?: number },
): Promise<Blob> {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) {
    throw new Error('The video frame dimensions are unavailable.');
  }

  const scale = options.maxSize
    ? Math.min(1, options.maxSize / Math.max(sourceWidth, sourceHeight))
    : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the video frame.');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('The video frame could not be converted to an image.')),
      options.type,
      options.quality,
    );
  });
}

async function withLoadedVideo<T>(source: File | string, useVideo: (video: VideoWithFrameCallback) => Promise<T>): Promise<T> {
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
      throw new Error('The video duration is unavailable, so its frames cannot be located.');
    }
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForVideoEvent(video, 'loadeddata');
    }

    return await useVideo(video);
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

/** Creates a representative, non-black gallery thumbnail from a video. */
export async function extractVideoThumbnailFrame(source: File | string): Promise<Blob> {
  return withLoadedVideo(source, async (video) => {
    await seekToUsableFrame(video, thumbnailFrameCandidates(video.duration));
    return captureCurrentFrame(video, { maxSize: 320, type: 'image/jpeg', quality: 0.82 });
  });
}

/** Extracts the exact presented frame nearest a requested playback time. */
export async function extractVideoFrameAtTime(source: File | string, timeSeconds: number): Promise<File> {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
    throw new Error('The selected video time is invalid.');
  }

  const frameBlob = await withLoadedVideo(source, async (video) => {
    await seekToPresentedFrame(video, timeSeconds);
    return captureCurrentFrame(video, { type: 'image/png' });
  });

  const timestamp = Date.now();
  return new File([frameBlob], `video-frame-${timestamp}.png`, {
    type: 'image/png',
    lastModified: timestamp,
  });
}

/**
 * Extracts the latest usable, non-black frame from a local or remote video.
 * Boundary frames are checked from newest to oldest so encoder padding or a
 * fade to black does not become the next generation's starting image.
 */
export async function extractLastVideoFrame(source: File | string): Promise<File> {
  const frameBlob = await withLoadedVideo(source, async (video) => {
    await seekToUsableFrame(video, lastFrameCandidates(video.duration));
    return captureCurrentFrame(video, { type: 'image/png' });
  });

  const timestamp = Date.now();
  return new File([frameBlob], `video-last-frame-${timestamp}.png`, {
    type: 'image/png',
    lastModified: timestamp,
  });
}
