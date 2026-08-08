/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Video Editor: stitch two generated clips into one seamless video.
 * Drop a video into each slot (from the gallery rail or your computer),
 * scrub the film rolls to inspect frames, then render them back-to-back.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getGalleryVideoDetails, saveVideoToGallery, type GalleryVideoDetails } from '../../src/utils/workflowStorage';
import { getGalleryVideoDragId } from '../../src/utils/imageTransfer';
import { extractFilmstrip, stitchVideos, stitchedFileExtension, formatTimecode, type StitchProgress } from './videoStitch';
import { XIcon, PlusIcon } from './controls';

interface EditorClip {
  file: File;
  url: string;
  duration: number;
  frames: string[];
  name: string;
}

export interface VideoEditorProps {
  onClose: () => void;
  /** A gallery video routed into the editor (click or context menu). */
  incomingVideo: GalleryVideoDetails | null;
  onIncomingVideoConsumed: () => void;
  /** Called after a stitched video is saved so the gallery can refresh. */
  onSaved: () => void;
  /** Lets the shell prevent closing/replacing clips during a render. */
  onRenderingChange?: (isRendering: boolean) => void;
}

const FRAME_COUNT = 8;

const VideoEditor: React.FC<VideoEditorProps> = ({
  onClose,
  incomingVideo,
  onIncomingVideoConsumed,
  onSaved,
  onRenderingChange,
}) => {
  const [clips, setClips] = useState<(EditorClip | null)[]>([null, null]);
  const [loadingSlot, setLoadingSlot] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [previewSlot, setPreviewSlot] = useState<number | null>(null);
  const [scrub, setScrub] = useState<{ slot: number; fraction: number } | null>(null);
  const [isStitching, setIsStitching] = useState(false);
  const [stitchProgress, setStitchProgress] = useState<StitchProgress | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob; duration: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const clipUrlsRef = useRef<Set<string>>(new Set());
  const resultUrlRef = useRef<string | null>(null);

  const clipCount = clips.filter(Boolean).length;

  useEffect(() => {
    onRenderingChange?.(isStitching);
    return () => onRenderingChange?.(false);
  }, [isStitching, onRenderingChange]);

  const clearResult = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);
    setSaved(false);
  }, []);

  /* ------------------------- clip loading ------------------------- */

  const loadClipIntoSlot = useCallback(async (slot: number, file: File) => {
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
      setError('That file is not a video.');
      return;
    }
    setError(null);
    setLoadingSlot(slot);
    try {
      const strip = await extractFilmstrip(file, FRAME_COUNT);
      const url = URL.createObjectURL(file);
      clipUrlsRef.current.add(url);
      setClips((prev) => {
        const next = [...prev];
        const existing = next[slot];
        if (existing) {
          URL.revokeObjectURL(existing.url);
          clipUrlsRef.current.delete(existing.url);
        }
        next[slot] = { file, url, duration: strip.duration, frames: strip.frames, name: file.name };
        return next;
      });
      clearResult();
      setPreviewSlot(slot);
      setScrub(null);
    } catch (loadError) {
      const details = loadError instanceof Error ? loadError.message : 'Please try a different file.';
      setError(`Could not load that video. ${details}`);
    } finally {
      setLoadingSlot(null);
    }
  }, [clearResult]);

  const loadGalleryDetailsIntoSlot = useCallback(async (slot: number, details: GalleryVideoDetails) => {
    if (details.videoFile) {
      await loadClipIntoSlot(slot, details.videoFile);
      return;
    }
    // Remote-only entry — try to download it
    setLoadingSlot(slot);
    try {
      const response = await fetch(details.videoUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      await loadClipIntoSlot(slot, new File([blob], `gallery-video-${Date.now()}.mp4`, { type: blob.type || 'video/mp4' }));
    } catch {
      setError('This video could not be downloaded for editing. Try re-generating it.');
      setLoadingSlot(null);
    }
  }, [loadClipIntoSlot]);

  /* Route videos sent from the gallery into the first empty slot */
  useEffect(() => {
    if (!incomingVideo) return;
    const emptySlot = clips.findIndex((clip, index) => clip === null && loadingSlot !== index);
    const slot = emptySlot === -1 ? 1 : emptySlot;
    loadGalleryDetailsIntoSlot(slot, incomingVideo);
    onIncomingVideoConsumed();
  }, [incomingVideo]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Cleanup object URLs on unmount without scheduling state updates. */
  useEffect(() => {
    return () => {
      clipUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      clipUrlsRef.current.clear();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    };
  }, []);

  const removeClip = useCallback((slot: number) => {
    setClips((prev) => {
      const next = [...prev];
      const existing = next[slot];
      if (existing) {
        URL.revokeObjectURL(existing.url);
        clipUrlsRef.current.delete(existing.url);
      }
      next[slot] = null;
      return next;
    });
    clearResult();
    setPreviewSlot((prev) => (prev === slot ? null : prev));
    setScrub(null);
  }, [clearResult]);

  const swapClips = useCallback(() => {
    setClips(([a, b]) => [b, a]);
    clearResult();
    setPreviewSlot((prev) => (prev === null ? null : prev === 0 ? 1 : 0));
    setScrub(null);
  }, [clearResult]);

  /* ------------------------- drag & drop ------------------------- */

  const handleDrop = useCallback(async (event: React.DragEvent, slot: number) => {
    event.preventDefault();
    setDragOverSlot(null);

    const galleryVideoId = getGalleryVideoDragId(event.dataTransfer);
    if (galleryVideoId) {
      setLoadingSlot(slot);
      try {
        const details = await getGalleryVideoDetails(galleryVideoId);
        if (details) {
          await loadGalleryDetailsIntoSlot(slot, details);
        } else {
          setError('That gallery item is not a video.');
          setLoadingSlot(null);
        }
      } catch {
        setError('Could not load that gallery video.');
        setLoadingSlot(null);
      }
      return;
    }

    const file = Array.from(event.dataTransfer.files as FileList).find(
      (item: File) => item.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(item.name)
    );
    if (file) {
      loadClipIntoSlot(slot, file);
    }
  }, [loadClipIntoSlot, loadGalleryDetailsIntoSlot]);

  /* ------------------------- scrubbing ------------------------- */

  const handleStripPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>, slot: number) => {
    const clip = clips[slot];
    if (!clip) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    setPreviewSlot(slot);
    setScrub({ slot, fraction });
  }, [clips]);

  /* Keep the preview element in sync with the selected clip */
  const previewClip = previewSlot !== null ? clips[previewSlot] : null;
  const isSourcePreviewVisible = !result || Boolean(scrub);
  useEffect(() => {
    const video = previewVideoRef.current;
    if (video && previewClip && !isStitching && video.src !== previewClip.url) {
      video.src = previewClip.url;
      video.load();
    }
  }, [previewClip, isSourcePreviewVisible, isStitching]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || !previewClip || !scrub || scrub.slot !== previewSlot) return;

    const seekPreview = () => {
      if (!video.seeking) {
        video.currentTime = Math.min(scrub.fraction * previewClip.duration, Math.max(previewClip.duration - 0.01, 0));
      }
    };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      seekPreview();
      return;
    }
    video.addEventListener('loadedmetadata', seekPreview, { once: true });
    return () => video.removeEventListener('loadedmetadata', seekPreview);
  }, [previewClip, previewSlot, scrub]);

  /* ------------------------- stitching ------------------------- */

  const handleStitch = useCallback(async () => {
    const [first, second] = clips;
    if (!first || !second) return;

    setError(null);
    setIsStitching(true);
    setStitchProgress({ phase: 'preparing', progress: 0 });
    clearResult();

    try {
      // Release the visible preview decoder before allocating the two render
      // decoders. This materially reduces media pressure on iOS/WebKit.
      const previewVideo = previewVideoRef.current;
      if (previewVideo) {
        previewVideo.pause();
        previewVideo.removeAttribute('src');
        previewVideo.load();
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const { blob, duration } = await stitchVideos([first.file, second.file], setStitchProgress);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult({ blob, url, duration });
    } catch (stitchError) {
      const details = stitchError instanceof Error ? stitchError.message : 'Please try again.';
      setError(`Stitching failed. ${details}`);
    } finally {
      setIsStitching(false);
      setStitchProgress(null);
    }
  }, [clips, clearResult]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = result.url;
    link.download = `veilpix-stitched-${Date.now()}.${stitchedFileExtension(result.blob)}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [result]);

  const handleSaveToGallery = useCallback(async () => {
    if (!result || saved) return;
    setIsSaving(true);
    try {
      await saveVideoToGallery({
        videoUrl: result.url,
        prompt: 'Stitched video',
        videoDuration: Math.round(result.duration),
      });
      setSaved(true);
      onSaved();
    } catch {
      setError('Could not save to the gallery.');
    } finally {
      setIsSaving(false);
    }
  }, [result, saved, onSaved]);

  /* ------------------------- render ------------------------- */

  const renderSlot = (slot: number) => {
    const clip = clips[slot];
    const isLoading = loadingSlot === slot;

    return (
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
            Clip {slot + 1}
          </span>
          {clip && (
            <span className="flex items-center gap-2">
              <span className="max-w-40 truncate text-[11px] text-gray-500" title={clip.name}>{clip.name}</span>
              <span className="text-[11px] font-medium text-gray-400">{formatTimecode(clip.duration)}</span>
              <button
                type="button"
                onClick={() => removeClip(slot)}
                aria-label={`Remove clip ${slot + 1}`}
                className="edge glass-chip flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:text-white"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>

        <div
          onDragOver={(event) => { event.preventDefault(); setDragOverSlot(slot); }}
          onDragLeave={() => setDragOverSlot((prev) => (prev === slot ? null : prev))}
          onDrop={(event) => handleDrop(event, slot)}
          className={`edge relative overflow-hidden rounded-2xl transition ${
            dragOverSlot === slot ? 'bg-accent-300/10 ring-1 ring-accent-300/40' : 'bg-white/[0.03]'
          }`}
        >
          {clip ? (
            /* Film roll */
            <div
              className="relative flex h-18 cursor-crosshair touch-none select-none"
              onPointerMove={(event) => handleStripPointerMove(event, slot)}
              onPointerDown={(event) => handleStripPointerMove(event, slot)}
              onPointerLeave={() => setScrub((prev) => (prev?.slot === slot ? null : prev))}
            >
              {clip.frames.map((frame, index) => (
                <img
                  key={index}
                  src={frame}
                  alt=""
                  draggable={false}
                  className="h-full min-w-0 flex-1 object-cover"
                />
              ))}
              {/* Playhead */}
              {scrub?.slot === slot && (
                <>
                  <div
                    className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]"
                    style={{ left: `${scrub.fraction * 100}%` }}
                  />
                  <span
                    className="pointer-events-none absolute bottom-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    style={{ left: `min(max(${scrub.fraction * 100}% - 20px, 4px), calc(100% - 44px))` }}
                  >
                    {formatTimecode(scrub.fraction * clip.duration)}
                  </span>
                </>
              )}
            </div>
          ) : (
            /* Empty drop zone */
            <button
              type="button"
              onClick={() => fileInputRefs[slot].current?.click()}
              disabled={isLoading}
              className="flex h-18 w-full flex-col items-center justify-center gap-1 text-gray-500 transition hover:text-gray-300"
            >
              {isLoading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
              ) : (
                <>
                  <span className="flex items-center gap-1.5 text-[12px] font-medium">
                    <PlusIcon className="h-3.5 w-3.5" />
                    Drag a video from your creations
                  </span>
                  <span className="text-[10px] text-gray-600">or click to browse files</span>
                </>
              )}
            </button>
          )}

          {isLoading && clip && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
            </span>
          )}
        </div>

        <input
          ref={fileInputRefs[slot]}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) loadClipIntoSlot(slot, file);
            event.target.value = '';
          }}
        />
      </div>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[62rem] flex-1 flex-col gap-3 animate-fade-in">
      {/* Title bar */}
      <div className="flex shrink-0 items-center justify-between px-1 pt-2">
        <span className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-200">Video Editor</h2>
          <span className="edge rounded-full bg-accent-300/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-300">
            Beta
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          disabled={isStitching}
          className="edge glass-chip flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-medium text-gray-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <XIcon className="h-3 w-3" />
          Close editor
        </button>
      </div>

      {/* Preview stage */}
      <div className="glass-panel edge relative flex min-h-[34vh] flex-1 items-center justify-center overflow-hidden rounded-3xl">
        {result && !scrub ? (
          <video
            key={result.url}
            src={result.url}
            controls
            autoPlay
            loop
            playsInline
            className="max-h-[52vh] w-auto max-w-full"
          />
        ) : !isStitching && previewClip ? (
          <>
            <video
              ref={previewVideoRef}
              muted
              playsInline
              preload="auto"
              className="max-h-[52vh] w-auto max-w-full"
            />
            <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-gray-200 backdrop-blur-sm">
              Clip {previewSlot! + 1} · scrub the film roll below
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <p className="text-base font-medium text-gray-300">Stitch two clips into one seamless video</p>
            <p className="max-w-md text-[13px] leading-relaxed text-gray-500">
              Drag videos from your creations on the right into the two slots below.
              Tip: generate the second clip with &ldquo;Continue from last frame&rdquo; so the cut is invisible.
            </p>
          </div>
        )}

        {isStitching && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            <p className="text-sm font-medium text-gray-200">
              {stitchProgress?.phase === 'rendering'
                ? `Rendering… ${Math.round((stitchProgress.progress || 0) * 100)}%`
                : stitchProgress?.phase === 'finalizing'
                  ? 'Finalizing…'
                  : 'Preparing clips…'}
            </p>
            <p className="text-[11px] text-gray-500">Rendering plays both clips through once — keep this tab open.</p>
          </div>
        )}
      </div>

      {error && (
        <div className="glass-panel edge flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 animate-fade-in-fast" role="alert">
          <p className="text-[13px] text-red-300">{error}</p>
          <button type="button" onClick={() => setError(null)} className="text-xs font-semibold text-gray-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Clip slots + actions */}
      <section className={`glass-panel edge flex w-full flex-col gap-3 rounded-3xl p-3 transition sm:p-4 ${isStitching ? 'pointer-events-none opacity-70' : ''}`} aria-label="Video stitching timeline">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
          {renderSlot(0)}

          {/* Swap */}
          <button
            type="button"
            onClick={swapClips}
            disabled={clipCount === 0 || isStitching}
            title="Swap clip order"
            className="edge glass-chip mx-auto flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-gray-400 transition hover:text-white disabled:opacity-40 sm:mb-4.5 sm:self-end"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>

          {renderSlot(1)}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
          <p className="text-[11px] text-gray-600">
            {clipCount === 2
              ? `Total ${formatTimecode((clips[0]?.duration ?? 0) + (clips[1]?.duration ?? 0))} · clips play in order, left to right`
              : `Add ${2 - clipCount} more clip${clipCount === 1 ? '' : 's'} to stitch`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {result && (
              <>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="edge glass-chip flex h-11 items-center gap-2 rounded-full px-5 text-[13px] font-semibold text-gray-200 hover:text-white"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={handleSaveToGallery}
                  disabled={isSaving || saved}
                  className="edge glass-chip flex h-11 items-center gap-2 rounded-full px-5 text-[13px] font-semibold text-gray-200 hover:text-white disabled:opacity-60"
                >
                  {saved ? 'Saved ✓' : isSaving ? 'Saving…' : 'Save to gallery'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleStitch}
              disabled={clipCount < 2 || isStitching}
              className="btn-porcelain edge-strong flex h-11 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold"
            >
              {isStitching ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                  Stitching…
                </>
              ) : result ? 'Stitch again' : 'Stitch videos'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default VideoEditor;
