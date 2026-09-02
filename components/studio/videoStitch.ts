/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Client-side video stitching: filmstrip thumbnail extraction and sequential
 * canvas + MediaRecorder rendering (video + mixed audio) with no server round
 * trip. Works on local File/Blob sources so the canvas is never tainted.
 */

const LOAD_TIMEOUT_MS = 30_000;
const FRAME_DECODE_TIMEOUT_MS = 30_000;

export interface StitchProgress {
  phase: 'preparing' | 'rendering' | 'finalizing';
  /** 0..1 across the whole job */
  progress: number;
}

export interface FilmstripResult {
  frames: string[];
  duration: number;
  width: number;
  height: number;
}

function waitForEvent(video: HTMLVideoElement, eventName: string, timeoutMs = LOAD_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('The video took too long to load.'));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener('error', onError);
    };
    const onEvent = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('The video could not be decoded by this browser.')); };

    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

function waitForPresentedFrame(video: HTMLVideoElement, timeoutMs = FRAME_DECODE_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    let videoFrameHandle: number | null = null;
    let animationFrameHandle: number | null = null;

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('The browser took too long to decode a video frame.'));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('error', onError);
      if (videoFrameHandle !== null && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(videoFrameHandle);
      }
      if (animationFrameHandle !== null) cancelAnimationFrame(animationFrameHandle);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('The video could not be decoded by this browser.'));
    };
    const onLoadedData = () => {
      animationFrameHandle = requestAnimationFrame(finish);
    };

    video.addEventListener('error', onError, { once: true });
    if (typeof video.requestVideoFrameCallback === 'function') {
      videoFrameHandle = video.requestVideoFrameCallback(() => finish());
      return;
    }

    // Older browsers do not expose frame callbacks. Wait for decoded data and
    // then yield one paint so drawImage sees the newly presented frame.
    video.addEventListener('loadeddata', onLoadedData, { once: true });
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onLoadedData();
  });
}

async function loadVideoElement(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  const metadataReady = waitForEvent(video, 'loadedmetadata');
  const firstFrameReady = waitForPresentedFrame(video);
  video.src = url;
  await Promise.all([metadataReady, firstFrameReady]);
  return video;
}

async function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.min(Math.max(time, 0), Math.max(video.duration - 0.05, 0));
  if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
  const seeked = waitForEvent(video, 'seeked');
  const frameReady = waitForPresentedFrame(video);
  video.currentTime = target;
  await Promise.all([seeked, frameReady]);
}

async function prepareVideoForPlayback(video: HTMLVideoElement): Promise<void> {
  video.pause();

  const metadataReady = waitForEvent(video, 'loadedmetadata');
  const firstFrameReady = waitForPresentedFrame(video);
  video.load();
  await Promise.all([metadataReady, firstFrameReady]);
  if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
    await waitForEvent(video, 'canplay');
  }

  // Briefly start playback to wake the decoder, then return to an actually
  // decoded frame at time zero before this clip is rendered.
  const playing = waitForEvent(video, 'playing');
  const playbackFrameReady = waitForPresentedFrame(video);
  await Promise.all([video.play(), playing, playbackFrameReady]);
  video.pause();
  await seekTo(video, 0);
}

/**
 * Extract evenly spaced thumbnails ("film roll") from a local video file.
 */
export async function extractFilmstrip(file: File | Blob, frameCount = 8): Promise<FilmstripResult> {
  const url = URL.createObjectURL(file);
  try {
    const video = await loadVideoElement(url);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) throw new Error('Could not read the video duration.');

    const cellHeight = 72;
    const cellWidth = 128; // 16:9-ish cells; frames are cover-cropped
    const canvas = document.createElement('canvas');
    canvas.width = cellWidth;
    canvas.height = cellHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable in this browser.');

    const frames: string[] = [];
    for (let i = 0; i < frameCount; i++) {
      const t = duration * ((i + 0.5) / frameCount);
      await seekTo(video, t);
      // Cover-crop the frame into the cell
      const scale = Math.max(cellWidth / video.videoWidth, cellHeight / video.videoHeight);
      const dw = video.videoWidth * scale;
      const dh = video.videoHeight * scale;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cellWidth, cellHeight);
      ctx.drawImage(video, (cellWidth - dw) / 2, (cellHeight - dh) / 2, dw, dh);
      frames.push(canvas.toDataURL('image/jpeg', 0.72));
    }

    const result: FilmstripResult = {
      frames,
      duration,
      width: video.videoWidth,
      height: video.videoHeight,
    };
    video.removeAttribute('src');
    video.load();
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pickRecorderMimeType(): string {
  const candidates = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function stitchedFileExtension(blob: Blob): string {
  return blob.type.includes('mp4') ? 'mp4' : 'webm';
}

function drawContain(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number) {
  const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
  const dw = video.videoWidth * scale;
  const dh = video.videoHeight * scale;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

function playThrough(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  onTime: (currentTime: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let rafHandle: number | null = null;
    let videoFrameHandle: number | null = null;
    let settled = false;

    const cleanup = () => {
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      if (videoFrameHandle !== null && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(videoFrameHandle);
      }
      video.removeEventListener('ended', finish);
      video.removeEventListener('error', onError);
      video.removeEventListener('playing', beginDrawing);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      // Draw the very last frame so the cut is clean
      drawContain(ctx, video, width, height);
      resolve();
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const scheduleFrame = () => {
      if (typeof video.requestVideoFrameCallback === 'function') {
        videoFrameHandle = video.requestVideoFrameCallback(() => tick());
      } else {
        rafHandle = requestAnimationFrame(tick);
      }
    };

    const tick = () => {
      if (settled) return;
      drawContain(ctx, video, width, height);
      onTime(video.currentTime);
      if (video.ended) {
        finish();
        return;
      }
      scheduleFrame();
    };

    const onError = () => fail('Playback failed while rendering.');
    const beginDrawing = () => {
      try {
        scheduleFrame();
      } catch {
        fail('The browser could not continue rendering the clip.');
      }
    };

    video.addEventListener('ended', finish, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.addEventListener('playing', beginDrawing, { once: true });
    video.play().catch(() => fail('The browser blocked video playback during rendering.'));
  });
}

function waitForRecorderEvent(
  recorder: MediaRecorder,
  eventName: 'start',
  timeoutMs = LOAD_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`The browser took too long to ${eventName} video recording.`));
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('The browser could not continue recording the stitched video.'));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      recorder.removeEventListener(eventName, onEvent);
      recorder.removeEventListener('error', onError);
    };

    recorder.addEventListener(eventName, onEvent, { once: true });
    recorder.addEventListener('error', onError, { once: true });
  });
}

/**
 * Render the given clips back-to-back into a single video blob.
 * Rendering happens in real time (sum of clip durations).
 */
export async function stitchVideos(
  files: (File | Blob)[],
  onProgress?: (progress: StitchProgress) => void,
): Promise<{ blob: Blob; duration: number }> {
  if (files.length < 2) throw new Error('Add two clips to stitch.');

  const mimeType = pickRecorderMimeType();
  if (!mimeType) throw new Error('This browser does not support in-browser video rendering.');

  onProgress?.({ phase: 'preparing', progress: 0 });

  const urls = files.map((file) => URL.createObjectURL(file));
  const videos: HTMLVideoElement[] = [];
  let audioContext: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;

  try {
    for (const url of urls) {
      const video = await loadVideoElement(url);
      // `canplay` may fire before metadata loading resolves, so only wait when
      // the element has not already reached HAVE_FUTURE_DATA.
      if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        await waitForEvent(video, 'canplay');
      }
      videos.push(video);
    }

    const width = videos[0].videoWidth || 1280;
    const height = videos[0].videoHeight || 720;
    const totalDuration = videos.reduce((sum, video) => sum + (video.duration || 0), 0);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable in this browser.');

    if (typeof canvas.captureStream !== 'function') {
      throw new Error('This browser does not support in-browser video rendering.');
    }
    const stream = canvas.captureStream(30);

    // Mix clip audio into the recording (silent clips are fine)
    audioContext = new AudioContext();
    const audioDestination = audioContext.createMediaStreamDestination();
    const audioGains = videos.map((video, index) => {
      try {
        const source = audioContext!.createMediaElementSource(video);
        const gain = audioContext!.createGain();
        gain.gain.value = index === 0 ? 1 : 0;
        source.connect(gain);
        gain.connect(audioDestination);
        return gain;
      } catch {
        // No usable audio on this element — video-only is fine.
        return null;
      }
    });
    audioDestination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    await audioContext.resume().catch(() => undefined);

    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 12_000_000,
      audioBitsPerSecond: 192_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    // Prepare later clips first, then clip one last so its decoder is hottest
    // when recording begins. Upcoming audio remains gated off by its gain node.
    for (let index = videos.length - 1; index >= 0; index--) {
      await prepareVideoForPlayback(videos[index]);
    }
    drawContain(ctx, videos[0], width, height);

    const started = waitForRecorderEvent(recorder, 'start');
    recorder.start(250);
    await started;

    let renderedSeconds = 0;
    for (let index = 0; index < videos.length; index++) {
      const video = videos[index];
      if (index > 0) {
        drawContain(ctx, video, width, height);
        const gainTime = audioContext.currentTime;
        audioGains.forEach((gain, gainIndex) => {
          gain?.gain.setValueAtTime(gainIndex === index ? 1 : 0, gainTime);
        });
      }

      await playThrough(video, ctx, width, height, (currentTime) => {
        onProgress?.({
          phase: 'rendering',
          progress: totalDuration > 0 ? Math.min((renderedSeconds + currentTime) / totalDuration, 1) : 0,
        });
      });
      renderedSeconds += video.duration || 0;
    }

    onProgress?.({ phase: 'finalizing', progress: 1 });
    recorder.stop();
    await stopped;

    const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
    if (blob.size === 0) throw new Error('Rendering produced no data. Try a different browser.');
    return { blob, duration: totalDuration };
  } finally {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    videos.forEach((video) => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
    if (audioContext) await audioContext.close().catch(() => undefined);
    urls.forEach((url) => URL.revokeObjectURL(url));
  }
}

/** Format seconds as m:ss.t for scrub readouts. */
export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = safe - minutes * 60;
  return `${minutes}:${secs.toFixed(1).padStart(4, '0')}`;
}
