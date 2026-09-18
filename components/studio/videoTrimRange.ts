export interface VideoTimeline {
  /** Presentation timestamps, followed by the exclusive end of the last frame. */
  boundaries: number[];
}

export interface VideoTrimRange { start: number; end: number }

export function fullTrimRange(timeline: VideoTimeline): VideoTrimRange {
  return { start: 0, end: timeline.boundaries.length - 1 };
}

export function initialTrimRange(timeline: VideoTimeline): VideoTrimRange {
  const count = timeline.boundaries.length - 1;
  return { start: Math.floor(count / 3), end: Math.max(Math.floor(count / 3) + 1, Math.min(count - 1, Math.ceil(count * 2 / 3))) };
}

export function trimTimes(timeline: VideoTimeline, range: VideoTrimRange) {
  const { boundaries } = timeline;
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end)
    || range.start < 0 || range.end >= boundaries.length || range.start >= range.end) {
    throw new Error('Select at least one video frame to remove.');
  }
  const start = boundaries[range.start];
  const end = boundaries[range.end];
  return { start, end, duration: end - start, frameCount: range.end - range.start };
}

/** Both sides of the cut, in presentation order. End boundaries are exclusive. */
export function retainedRanges(timeline: VideoTimeline, removed: VideoTrimRange): VideoTrimRange[] {
  trimTimes(timeline, removed);
  const last = timeline.boundaries.length - 1;
  if (removed.start === 0 && removed.end === last) throw new Error('Keep at least one frame. The entire video cannot be removed.');
  return [
    ...(removed.start > 0 ? [{ start: 0, end: removed.start }] : []),
    ...(removed.end < last ? [{ start: removed.end, end: last }] : []),
  ];
}

export function nearestBoundary(timeline: VideoTimeline, seconds: number): number {
  const values = timeline.boundaries;
  let lo = 0;
  let hi = values.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (values[mid] < seconds) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && seconds - values[lo - 1] <= values[lo] - seconds ? lo - 1 : lo;
}

export function moveTrimBoundary(timeline: VideoTimeline, range: VideoTrimRange, edge: 'start' | 'end', index: number): VideoTrimRange {
  if (!Number.isFinite(index)) return range;
  return edge === 'start'
    ? { ...range, start: Math.max(0, Math.min(range.end - 1, Math.round(index))) }
    : { ...range, end: Math.max(range.start + 1, Math.min(timeline.boundaries.length - 1, Math.round(index))) };
}

export function boundaryFraction(timeline: VideoTimeline, index: number): number {
  const values = timeline.boundaries;
  return (values[index] - values[0]) / (values[values.length - 1] - values[0]);
}

export function boundaryAtFraction(timeline: VideoTimeline, fraction: number): number {
  const values = timeline.boundaries;
  const time = values[0] + Math.max(0, Math.min(1, fraction)) * (values[values.length - 1] - values[0]);
  return nearestBoundary(timeline, time);
}

export function preciseTimecode(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, '0')}`;
}
