import React, { useEffect, useRef, useState } from 'react';
import { boundaryAtFraction, boundaryFraction, moveTrimBoundary, nearestBoundary, preciseTimecode, trimTimes, type VideoTimeline, type VideoTrimRange } from './videoTrimRange';

interface Props {
  slot: number;
  frames: string[];
  timeline: VideoTimeline;
  range: VideoTrimRange;
  disabled: boolean;
  onChange: (range: VideoTrimRange, previewTime: number) => void;
}

export default function VideoTrimSelection({ slot, frames, timeline, range, disabled, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<'start' | 'end' | null>(null);
  const grabOffset = useRef(0);
  const [activeEdge, setActiveEdge] = useState<'start' | 'end'>('start');
  const times = trimTimes(timeline, range);
  const [startText, setStartText] = useState(times.start.toFixed(3));
  const [endText, setEndText] = useState(times.end.toFixed(3));
  useEffect(() => { setStartText(times.start.toFixed(3)); setEndText(times.end.toFixed(3)); }, [times.start, times.end]);
  const left = boundaryFraction(timeline, range.start) * 100;
  const right = boundaryFraction(timeline, range.end) * 100;

  const move = (edge: 'start' | 'end', index: number) => {
    if (disabled) return;
    setActiveEdge(edge);
    const next = moveTrimBoundary(timeline, range, edge, index);
    // Seek inside the selected frame so floating-point boundaries never show
    // its neighbor. The actual cut still uses the exact frame boundary.
    const frame = edge === 'start' ? next.start : next.end - 1;
    onChange(next, (timeline.boundaries[frame] + timeline.boundaries[frame + 1]) / 2);
  };
  const movePointer = (edge: 'start' | 'end', clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect?.width) move(edge, boundaryAtFraction(timeline, (clientX - grabOffset.current - rect.left) / rect.width));
  };
  const commitTime = (edge: 'start' | 'end', text: string) => {
    const seconds = Number(text);
    if (text.trim() && Number.isFinite(seconds)) move(edge, nearestBoundary(timeline, seconds));
    setStartText(times.start.toFixed(3));
    setEndText(times.end.toFixed(3));
  };

  return <div className="flex flex-col gap-3 p-3" aria-label={`Trim clip ${slot + 1}`}>
    <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
      <span className="font-semibold text-gray-200">Select section to remove</span>
      <span className="tabular-nums">{preciseTimecode(times.duration)} · {times.frameCount} frames</span>
    </div>
    <div className="px-3">
      <div ref={trackRef} className="relative h-20 touch-none select-none" data-trim-track={slot}>
        <div className="absolute inset-0 flex overflow-hidden rounded-lg">
          {frames.map((frame, index) => <img key={index} src={frame} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover" />)}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 rounded-l-lg bg-black/75" style={{ width: `${left}%` }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 rounded-r-lg bg-black/75" style={{ width: `${100 - right}%` }} />
        <div data-trim-highlight={slot} className="pointer-events-none absolute inset-y-0 border-y-2 border-white/90 bg-white/5" style={{ left: `${left}%`, width: `${right - left}%` }} />
        {(['start', 'end'] as const).map(edge => <button
          key={edge} type="button" role="slider" disabled={disabled}
          aria-label={`${edge === 'start' ? 'Start' : 'End'} of section to remove in clip ${slot + 1}`}
          aria-valuemin={timeline.boundaries[edge === 'start' ? 0 : range.start + 1]}
          aria-valuemax={timeline.boundaries[edge === 'start' ? range.end - 1 : timeline.boundaries.length - 1]}
          aria-valuenow={timeline.boundaries[range[edge]]}
          aria-valuetext={`${preciseTimecode(timeline.boundaries[range[edge]])}, ${edge === 'start' ? `first removed frame ${range.start + 1}` : `after removed frame ${range.end}`}`}
          title={`${edge === 'start' ? 'Start' : 'End'} · Arrow keys move one frame`}
          className={`absolute -bottom-2 -top-2 flex w-7 -translate-x-1/2 touch-none items-center justify-center rounded-lg border border-white/50 bg-[#d8d8dc] text-black shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${activeEdge === edge ? 'z-20' : 'z-10'}`}
          style={{ left: `${edge === 'start' ? left : right}%` }}
          onPointerDown={event => {
            if (disabled) return;
            event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = edge;
            const rect = trackRef.current!.getBoundingClientRect();
            grabOffset.current = event.clientX - (rect.left + boundaryFraction(timeline, range[edge]) * rect.width);
            move(edge, range[edge]);
          }}
          onPointerMove={event => { if (dragRef.current === edge && event.currentTarget.hasPointerCapture(event.pointerId)) movePointer(edge, event.clientX); }}
          onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
          onKeyDown={event => {
            let index = range[edge];
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') index -= event.shiftKey ? 10 : 1;
            else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') index += event.shiftKey ? 10 : 1;
            else if (event.key === 'Home') index = 0;
            else if (event.key === 'End') index = timeline.boundaries.length - 1;
            else return;
            event.preventDefault(); move(edge, index);
          }}
        ><span aria-hidden="true" className="h-7 w-1 rounded-full bg-black/45" /></button>)}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 pt-1">
      {(['start', 'end'] as const).map(edge => <label key={edge} className="flex min-w-0 flex-col gap-1 text-[10px] text-gray-400">
        {edge === 'start' ? 'Start' : 'End'} (seconds)
        <div className="flex items-center gap-1">
          <button type="button" disabled={disabled || (edge === 'start' ? range.start === 0 : range.end === range.start + 1)} aria-label={`Move ${edge} back one frame for clip ${slot + 1}`} onClick={() => move(edge, range[edge] - 1)} className="edge glass-chip h-8 w-7 shrink-0 rounded-lg text-sm text-gray-200 disabled:opacity-30">−</button>
          <input type="number" step="0.001" inputMode="decimal" aria-label={`${edge === 'start' ? 'Start' : 'End'} time for clip ${slot + 1}`} disabled={disabled}
            value={edge === 'start' ? startText : endText}
            onChange={event => (edge === 'start' ? setStartText : setEndText)(event.target.value)}
            onBlur={event => commitTime(edge, event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            className="edge h-8 w-full min-w-0 rounded-lg bg-black/35 px-1.5 text-center text-[11px] tabular-nums text-gray-200" />
          <button type="button" disabled={disabled || (edge === 'start' ? range.start === range.end - 1 : range.end === timeline.boundaries.length - 1)} aria-label={`Move ${edge} forward one frame for clip ${slot + 1}`} onClick={() => move(edge, range[edge] + 1)} className="edge glass-chip h-8 w-7 shrink-0 rounded-lg text-sm text-gray-200 disabled:opacity-30">+</button>
        </div>
      </label>)}
    </div>
    <p className="text-[10px] leading-relaxed text-gray-500">Highlight marks what will be removed. Handles and times snap to frames; Start previews the first selected frame, End the last. Nothing changes until you press Remove.</p>
  </div>;
}
