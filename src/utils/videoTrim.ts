import {
  AudioSampleSink, AudioSampleSource, BlobSource, BufferTarget, canEncodeAudio, canEncodeVideo,
  EncodedAudioPacketSource, EncodedPacketSink, EncodedVideoPacketSource, Input, MP4, Mp4OutputFormat,
  Output, QTFF, QUALITY_HIGH, VideoSampleSink, VideoSampleSource, WEBM,
  type InputVideoTrack,
} from 'mediabunny';
import { nearestBoundary, retainedRanges, trimTimes, type VideoTimeline, type VideoTrimRange } from '../../components/studio/videoTrimRange';

const open = (file: Blob) => new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM] });
const micros = (seconds: number) => Math.round(seconds * 1e6) / 1e6;

async function readTrackTimeline(track: InputVideoTrack): Promise<VideoTimeline> {
  const frames: { start: number; end: number }[] = [];
  for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) {
    if (packet.timestamp + packet.duration > 0) {
      frames.push({ start: micros(Math.max(0, packet.timestamp)), end: micros(packet.timestamp + packet.duration) });
    }
  }
  // H.264 B-frames arrive in decode order, not the order seen on screen.
  frames.sort((a, b) => a.start - b.start);
  const boundaries = [...new Set(frames.map(frame => frame.start))];
  const end = frames.at(-1)?.end;
  if (!boundaries.length || !Number.isFinite(end) || end! <= boundaries.at(-1)!) {
    throw new Error('This video does not contain readable frame timing. Try an MP4, MOV, or WebM file.');
  }
  boundaries.push(end!);
  return { boundaries };
}

export async function readVideoTimeline(file: Blob): Promise<VideoTimeline> {
  const input = open(file);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('The file has no video track.');
    return await readTrackTimeline(track);
  } finally { input.dispose(); }
}

// Encoders can append audio padding. Bound packet durations to the visual end,
// without changing any encoded bytes, so the container agrees with the slider.
export async function boundAudioToVideo(blob: Blob, duration: number): Promise<Blob> {
  const input = open(blob);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  try {
    const video = (await input.getPrimaryVideoTrack())!;
    const videoSource = new EncodedVideoPacketSource((await video.getCodec())!);
    output.addVideoTrack(videoSource);
    const audioTracks = await input.getAudioTracks();
    const audioSources = await Promise.all(audioTracks.map(async track => {
      const source = new EncodedAudioPacketSource((await track.getCodec())!);
      output.addAudioTrack(source);
      return source;
    }));
    await output.start();
    const videoConfig = (await video.getDecoderConfig())!;
    for await (const packet of new EncodedPacketSink(video).packets()) await videoSource.add(packet, { decoderConfig: videoConfig });
    videoSource.close();
    for (let i = 0; i < audioTracks.length; i++) {
      const config = (await audioTracks[i].getDecoderConfig())!;
      for await (const packet of new EncodedPacketSink(audioTracks[i]).packets()) {
        if (packet.timestamp >= duration) continue;
        await audioSources[i].add(packet.clone({ duration: Math.min(packet.duration, duration - packet.timestamp) }), { decoderConfig: config });
      }
      audioSources[i].close();
    }
    await output.finalize();
    return new Blob([output.target.buffer!], { type: 'video/mp4' });
  } finally {
    input.dispose();
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel();
  }
}

/** Re-encode the retained frames; packet-copy cuts can snap to unrelated keyframes. */
export async function removeVideoSection(file: File, timeline: VideoTimeline, removed: VideoTrimRange, onProgress?: (value: number) => void) {
  try { return await renderCut(file, timeline, removed, onProgress, false); }
  catch (error) {
    // Some platform AAC encoders advertise support but fail on very short
    // clips. Retry with Opus, keeping audio and the same frame boundaries.
    if (!(error instanceof Error) || !/encod|flush/i.test(error.message)) throw error;
    return renderCut(file, timeline, removed, onProgress, true);
  }
}

async function renderCut(file: File, timeline: VideoTimeline, removed: VideoTrimRange, onProgress: ((value: number) => void) | undefined, useFallback: boolean) {
  const ranges = retainedRanges(timeline, removed);
  const kept = ranges.map(range => trimTimes(timeline, range));
  const duration = micros(kept.reduce((sum, range) => sum + range.duration, 0));
  const frameCount = kept.reduce((sum, range) => sum + range.frameCount, 0);
  const input = open(file);
  let output: Output<Mp4OutputFormat, BufferTarget> | undefined;
  try {
    const video = await input.getPrimaryVideoTrack();
    const audioTracks = await input.getAudioTracks();
    if (!video || !(await video.canDecode()) || (await Promise.all(audioTracks.map(track => track.canDecode()))).some(value => !value)) {
      throw new Error('This browser cannot decode this video for precise cutting. Try a current Chrome, Edge, or Safari browser.');
    }
    const width = await video.getDisplayWidth();
    const height = await video.getDisplayHeight();
    const audioOptions = await Promise.all(audioTracks.map(async track => ({ sampleRate: await track.getSampleRate(), numberOfChannels: await track.getNumberOfChannels() })));
    const videoCodec = await canEncodeVideo('avc', { width, height, quality: QUALITY_HIGH }) ? 'avc' : 'vp9';
    const audioCodec = !useFallback && (await Promise.all(audioOptions.map(options => canEncodeAudio('aac', options)))).every(Boolean) ? 'aac' : 'opus';
    if (!(await canEncodeVideo(videoCodec, { width, height, quality: QUALITY_HIGH }))
      || !(await Promise.all(audioOptions.map(options => canEncodeAudio(audioCodec, options)))).every(Boolean)) {
      throw new Error('Precise cutting is not supported by this browser. Try a current Chrome, Edge, or Safari browser.');
    }
    // MP4 stores each frame's duration, including a single-frame or VFR tail.
    // WebM SimpleBlocks cannot reliably represent those exact end boundaries.
    const mime = 'video/mp4';
    output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const videoSource = new VideoSampleSource({ codec: videoCodec, quality: QUALITY_HIGH, transform: { width, height, fit: 'fill' } });
    output.addVideoTrack(videoSource);
    const audioSources = audioTracks.map(() => {
      const source = new AudioSampleSource({ codec: audioCodec, quality: QUALITY_HIGH });
      output!.addAudioTrack(source);
      return source;
    });
    await output.start();
    const sink = new VideoSampleSink(video);
    let offset = 0;
    let renderedFrames = 0;
    const expectedBoundaries: number[] = [];
    for (let i = 0; i < kept.length; i++) {
      const segment = kept[i];
      let expectedFrame = ranges[i].start;
      // A small margin allows for container-to-WebCodecs microsecond rounding.
      for await (const sample of sink.samples(Math.max(0, segment.start - 0.000002), segment.end + 0.000002)) {
        try {
          const index = nearestBoundary(timeline, sample.timestamp);
          if (index < ranges[i].start || index >= ranges[i].end) continue;
          if (index !== expectedFrame || Math.abs(sample.timestamp - timeline.boundaries[index]) > 0.001) {
            throw new Error('The decoded frames did not match the selection. The original clip has been kept.');
          }
          sample.setTimestamp(micros(offset + timeline.boundaries[index] - segment.start));
          sample.setDuration(micros(timeline.boundaries[index + 1] - timeline.boundaries[index]));
          expectedBoundaries.push(sample.timestamp);
          await videoSource.add(sample, { keyFrame: index === ranges[i].start });
          expectedFrame++; renderedFrames++;
          onProgress?.(renderedFrames / frameCount * 0.75);
        } finally { sample.close(); }
      }
      if (expectedFrame !== ranges[i].end) throw new Error('Some selected frames could not be decoded. The original clip has been kept.');
      offset += segment.duration;
    }
    videoSource.close();
    for (let trackIndex = 0; trackIndex < audioTracks.length; trackIndex++) {
      const audioSink = new AudioSampleSink(audioTracks[trackIndex]);
      offset = 0;
      for (const segment of kept) {
        for await (const sample of audioSink.samples(segment.start, segment.end)) {
          try {
            const start = Math.max(0, Math.round((segment.start - sample.timestamp) * sample.sampleRate));
            const end = Math.min(sample.numberOfFrames, Math.round((segment.end - sample.timestamp) * sample.sampleRate));
            if (start >= end) continue;
            const trimmed = sample.trim(start, end);
            try {
              trimmed.setTimestamp(micros(Math.max(offset, offset + trimmed.timestamp - segment.start)));
              await audioSources[trackIndex].add(trimmed);
            } finally { trimmed.close(); }
          } finally { sample.close(); }
        }
        offset += segment.duration;
      }
      audioSources[trackIndex].close();
      onProgress?.(0.75 + (trackIndex + 1) / audioTracks.length * 0.15);
    }
    await output.finalize();
    let blob = new Blob([output.target.buffer!], { type: mime });
    if (audioTracks.length) blob = await boundAudioToVideo(blob, duration);
    expectedBoundaries.push(duration);
    const check = open(blob);
    try {
      const resultTimeline = await readTrackTimeline((await check.getPrimaryVideoTrack())!);
      const resultDuration = resultTimeline.boundaries.at(-1)!;
      if (resultTimeline.boundaries.length - 1 !== frameCount
        || resultTimeline.boundaries.some((time, index) => Math.abs(time - expectedBoundaries[index]) > 0.000002)
        || Math.abs(await check.computeDuration() - duration) > 0.000002
        || (await check.getAudioTracks()).length !== audioTracks.length) {
        throw new Error('The export did not match the selected cut. The original clip has been kept.');
      }
      onProgress?.(1);
      return { blob, duration: resultDuration, timeline: resultTimeline };
    } finally {
      check.dispose();
    }
  } finally {
    input.dispose();
    if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel();
  }
}
