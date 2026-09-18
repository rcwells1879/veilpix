import { BlobSource, BufferTarget, Conversion, Input, MP4, Mp4OutputFormat, Output, QTFF } from 'mediabunny';
import { WAN3_REFERENCE_LIMITS, SEEDANCE_MEDIA_DURATION_TOLERANCE_SECONDS } from '../../components/studio/videoPricing';

// Kie checks the actual file, even though our UI permits small encoder overruns.
// Copy encoded packets locally so normalizing a reference does not re-encode it
// or send its bytes through the API server.
const TRIM_HEADROOM_SECONDS = 0.1;
const MAX_SECONDS = WAN3_REFERENCE_LIMITS.mediaSeconds;

function openVideo(file: File): Input {
  return new Input({ source: new BlobSource(file), formats: [MP4, QTFF] });
}

async function measureVideo(input: Input): Promise<number> {
  if (!(await input.getVideoTracks()).length) throw new Error('The file has no video track.');
  const duration = Math.max(await input.computeDuration(), await input.getDurationFromMetadata() ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('The video duration could not be read.');
  return duration;
}

async function trimVideo(file: File, end: number): Promise<{ file: File; duration: number }> {
  const input = openVideo(file);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  try {
    const conversion = await Conversion.init({
      input,
      output,
      trim: { end },
      copy: { mode: 'forced', boundaryPolicy: 'shrink' },
      showWarnings: false,
    });
    // Never silently lose audio or a video track to make a reference fit.
    if (!conversion.isValid || conversion.discardedTracks.length > 0) {
      throw new Error('This video cannot be shortened without dropping a track.');
    }
    await conversion.execute();
    if (!output.target.buffer) throw new Error('The shortened video is empty.');
    const trimmed = new File([output.target.buffer], `${file.name.replace(/\.[^.]+$/, '')}-wan3.mp4`, {
      type: 'video/mp4', lastModified: file.lastModified,
    });
    const check = openVideo(trimmed);
    try {
      const duration = await measureVideo(check);
      if (duration < 1 || duration > end + 0.001) throw new Error('The shortened video is outside its duration limit.');
      return { file: trimmed, duration };
    } finally {
      check.dispose();
    }
  } finally {
    input.dispose();
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel();
  }
}

export async function prepareWan3ReferenceVideos(files: File[]): Promise<{ files: File[]; duration: number }> {
  if (files.length > WAN3_REFERENCE_LIMITS.videos) throw new Error('Wan 3.0 accepts up to five reference videos.');
  const durations: number[] = [];
  for (const file of files) {
    const input = openVideo(file);
    try {
      durations.push(await measureVideo(input));
    } catch {
      throw new Error(`Could not read reference video "${file.name}". Use a playable MP4 or MOV file.`);
    } finally {
      input.dispose();
    }
  }

  if (durations.some(duration => duration < 1)) {
    throw new Error('Each Wan 3.0 reference video must be at least 1 second long.');
  }
  let total = durations.reduce((sum, duration) => sum + duration, 0);
  if (total > MAX_SECONDS + SEEDANCE_MEDIA_DURATION_TOLERANCE_SECONDS) {
    throw new Error('Wan 3.0 reference videos must total 15 seconds or less. Shorten the selected videos and try again.');
  }
  const prepared = [...files];
  if (total > MAX_SECONDS) {
    // Correct only the small overrun already accepted by the UI. For several
    // references, shorten the longest one and preserve their upload order.
    const index = durations.indexOf(Math.max(...durations));
    const end = durations[index] - (total - MAX_SECONDS) - TRIM_HEADROOM_SECONDS;
    try {
      const trimmed = await trimVideo(files[index], end);
      prepared[index] = trimmed.file;
      total += trimmed.duration - durations[index];
    } catch {
      throw new Error(`Could not automatically shorten reference video "${files[index].name}". Shorten the selected videos so their total is below 15 seconds and try again.`);
    }
  }
  if (total > MAX_SECONDS) throw new Error('Wan 3.0 reference videos must total 15 seconds or less.');
  return { files: prepared, duration: total };
}
