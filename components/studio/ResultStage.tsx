/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The result stage: whatever you create appears here, directly above the
 * composer. Hosts the compare slider, retouch hotspot, crop overlay, and
 * video follow-up actions.
 */

import React, { Suspense, lazy } from 'react';
import type { Crop, PixelCrop } from 'react-image-crop';
import Spinner from '../Spinner';
import Wan3Announcement from '../Wan3Announcement';
import {
  UndoIcon,
  RedoIcon,
  EyeIcon,
  SlidersIcon,
  DownloadIcon,
  BullseyeIcon,
  CropIcon,
  ResetIcon,
  PhotoIcon,
  VideoIcon,
} from '../icons';
import type { StudioMode, StageTool } from './types';

const BeforeAfterSlider = lazy(() => import('../BeforeAfterSlider'));
const CropEditor = lazy(() => import('../CropEditor'));

interface ToolButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  holdHandlers?: React.HTMLAttributes<HTMLButtonElement>;
  children: React.ReactNode;
}

const ToolButton: React.FC<ToolButtonProps> = ({ label, active = false, disabled = false, onClick, holdHandlers, children }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    {...holdHandlers}
    className={`edge glass-chip flex h-10 w-10 items-center justify-center rounded-full text-gray-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35 ${
      active ? 'glass-chip-active text-accent-200' : ''
    }`}
  >
    {children}
  </button>
);

export interface ResultStageProps {
  mode: StudioMode;
  isLoading: boolean;
  loadingLabel: string;

  /* image */
  currentImageUrl: string | null;
  originalImageUrl: string | null;
  previousImageUrl: string | null;
  canUndo: boolean;
  canRedo: boolean;
  isComparing: boolean;
  onComparingChange: (comparing: boolean) => void;
  showSlider: boolean;
  onToggleSlider: () => void;
  sliderCompareMode: 'original' | 'previous';
  onSliderCompareModeChange: (mode: 'original' | 'previous') => void;
  activeTool: StageTool;
  supportsImageEditing: boolean;
  onToolChange: (tool: StageTool) => void;
  displayHotspot: { x: number; y: number } | null;
  onImageClick: (event: React.MouseEvent<HTMLImageElement>) => void;
  imgRef: React.RefObject<HTMLImageElement | null>;
  crop: Crop | undefined;
  onCropChange: (crop: PixelCrop) => void;
  onCropComplete: (crop: PixelCrop) => void;
  aspect: number | undefined;
  onAspectChange: (aspect: number | undefined) => void;
  onApplyCrop: () => void;
  cropReady: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onDownload: () => void;

  /* video */
  videoUrl: string | null;
  onVideoDownload: () => void;
  onContinueFromLastFrame: () => void;
  onOpenVideoEditor: () => void;
  isExtractingLastFrame: boolean;
}

const CROP_ASPECTS: { name: string; value: number | undefined }[] = [
  { name: 'Free', value: undefined },
  { name: '1:1', value: 1 },
  { name: '16:9', value: 16 / 9 },
];

const ResultStage: React.FC<ResultStageProps> = (props) => {
  const {
    mode, isLoading, loadingLabel,
    currentImageUrl, originalImageUrl, previousImageUrl,
    canUndo, canRedo, isComparing, onComparingChange,
    showSlider, onToggleSlider, sliderCompareMode, onSliderCompareModeChange,
    activeTool, supportsImageEditing, onToolChange, displayHotspot, onImageClick, imgRef,
    crop, onCropChange, onCropComplete, aspect, onAspectChange, onApplyCrop, cropReady,
    onUndo, onRedo, onReset, onDownload,
    videoUrl, onVideoDownload, onContinueFromLastFrame, onOpenVideoEditor, isExtractingLastFrame,
  } = props;

  const showVideo = mode === 'video' && Boolean(videoUrl);
  const showImage = !showVideo && Boolean(currentImageUrl);
  const isEmpty = !showVideo && !showImage;
  const sliderBeforeImage = sliderCompareMode === 'original' ? originalImageUrl : previousImageUrl;
  const sliderActive = showImage && showSlider && canUndo && activeTool === 'none' && Boolean(sliderBeforeImage);

  return (
    <div className={`studio-result-stage relative flex w-full max-w-3xl flex-col items-center justify-center gap-3 self-center py-4 ${
      isEmpty ? 'min-h-[38vh] flex-1' : 'min-h-0 shrink-0'
    }`}>
      {/* Empty state - the serene hero over the wallpaper */}
      <Wan3Announcement />
      {isEmpty && !isLoading && (
        <div className="flex flex-col items-center gap-3 px-4 text-center animate-fade-in">
          <h1 className="text-3xl font-semibold tracking-tight text-[#E04F67] sm:text-5xl">
            What will you create?
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-gray-500 sm:text-base">
            Describe an image or a video below. Add references to edit photos,
            combine elements, or guide motion.
          </p>
        </div>
      )}

      {/* Video result */}
      {showVideo && (
        <div className="flex w-full flex-col items-center gap-3 animate-fade-in">
          <div className="edge relative inline-flex max-w-full overflow-hidden rounded-2xl shadow-2xl">
            <video
              src={videoUrl || undefined}
              controls
              playsInline
              className="studio-result-media block h-auto w-auto max-w-full object-contain"
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onContinueFromLastFrame}
              disabled={isExtractingLastFrame || isLoading}
              className="edge glass-chip flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium text-gray-200 hover:text-white disabled:cursor-wait disabled:opacity-50"
            >
              {isExtractingLastFrame ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
              ) : (
                <PhotoIcon className="h-4 w-4" />
              )}
              {isExtractingLastFrame ? 'Extracting…' : 'Continue from last frame'}
            </button>
            <button
              type="button"
              onClick={onOpenVideoEditor}
              disabled={isLoading}
              className="edge glass-chip flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium text-gray-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <VideoIcon className="h-4 w-4" />
              Video Editor
              <span className="rounded-full bg-accent-300/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-accent-300">
                New
              </span>
            </button>
            <ToolButton label="Download video" onClick={onVideoDownload}>
              <DownloadIcon className="h-4.5 w-4.5" />
            </ToolButton>
          </div>
        </div>
      )}

      {/* Image result */}
      {showImage && currentImageUrl && (
        <div className="flex w-full flex-col items-center gap-3 animate-fade-in">
          <div className="relative flex w-full items-center justify-center">
            {activeTool === 'crop' ? (
              <Suspense fallback={<img src={currentImageUrl} alt="Crop this image" className="studio-result-media max-h-[48dvh] w-auto max-w-full rounded-2xl object-contain" />}>
                <CropEditor
                  src={currentImageUrl}
                  imageRef={imgRef}
                  crop={crop as Crop}
                  onChange={onCropChange}
                  onComplete={onCropComplete}
                  aspect={aspect}
                />
              </Suspense>
            ) : sliderActive && sliderBeforeImage ? (
              <Suspense fallback={<div className="min-h-40 w-full rounded-2xl bg-black/20" />}>
                <div className="w-full">
                  <BeforeAfterSlider
                    beforeImage={sliderBeforeImage}
                    afterImage={currentImageUrl}
                    beforeLabel={sliderCompareMode === 'original' ? 'Original' : 'Previous'}
                    afterLabel="Current"
                  />
                </div>
              </Suspense>
            ) : (
              <div className="relative inline-block">
                {originalImageUrl && isComparing && canUndo && (
                  <img
                    key={originalImageUrl}
                    src={originalImageUrl}
                    alt="Original"
                    className="studio-result-media pointer-events-none max-h-[48dvh] w-auto max-w-full rounded-2xl object-contain"
                  />
                )}
                <img
                  ref={imgRef}
                  key={currentImageUrl}
                  src={currentImageUrl}
                  alt="Current result"
                  onClick={onImageClick}
                  className={`${originalImageUrl && isComparing && canUndo ? 'absolute left-0 top-0' : ''} studio-result-media max-h-[48dvh] w-auto max-w-full rounded-2xl object-contain transition-opacity duration-200 ${
                    isComparing && canUndo ? 'opacity-0' : 'opacity-100'
                  } ${activeTool === 'retouch' ? 'cursor-crosshair' : ''}`}
                />
                {displayHotspot && activeTool === 'retouch' && !isLoading && (
                  <div
                    className="pointer-events-none absolute z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent-400/50"
                    style={{ left: `${displayHotspot.x}px`, top: `${displayHotspot.y}px` }}
                  >
                    <div className="absolute inset-0 h-6 w-6 animate-ping rounded-full bg-accent-300" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Crop controls */}
          {activeTool === 'crop' ? (
            <div className="flex flex-wrap items-center justify-center gap-2 animate-fade-in-fast">
              {CROP_ASPECTS.map(({ name, value }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onAspectChange(value)}
                  disabled={isLoading}
                  className={`edge glass-chip h-9 rounded-full px-3.5 text-xs font-medium text-gray-300 hover:text-white disabled:opacity-45 ${
                    aspect === value ? 'glass-chip-active text-white' : ''
                  }`}
                >
                  {name}
                </button>
              ))}
              <button
                type="button"
                onClick={onApplyCrop}
                disabled={isLoading || !cropReady}
                className="btn-porcelain edge-strong h-9 rounded-full px-4 text-xs font-semibold"
              >
                Apply crop
              </button>
              <button
                type="button"
                onClick={() => onToolChange('none')}
                disabled={isLoading}
                className="edge glass-chip h-9 rounded-full px-3.5 text-xs font-medium text-gray-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <ToolButton label="Undo" disabled={!canUndo || isLoading} onClick={onUndo}>
                <UndoIcon className="h-4.5 w-4.5" />
              </ToolButton>
              <ToolButton label="Redo" disabled={!canRedo || isLoading} onClick={onRedo}>
                <RedoIcon className="h-4.5 w-4.5" />
              </ToolButton>
              {canUndo && (
                <ToolButton
                  label="Hold to compare with original"
                  holdHandlers={{
                    onMouseDown: () => onComparingChange(true),
                    onMouseUp: () => onComparingChange(false),
                    onMouseLeave: () => onComparingChange(false),
                    onTouchStart: () => onComparingChange(true),
                    onTouchEnd: () => onComparingChange(false),
                  }}
                >
                  <EyeIcon className="h-4.5 w-4.5" />
                </ToolButton>
              )}
              {canUndo && (
                <ToolButton label="Comparison slider" active={showSlider} onClick={onToggleSlider}>
                  <SlidersIcon className="h-4.5 w-4.5" />
                </ToolButton>
              )}
              {showSlider && canUndo && (
                <div className="flex items-center gap-1">
                  {(['original', 'previous'] as const).map((compareMode) => (
                    <button
                      key={compareMode}
                      type="button"
                      onClick={() => onSliderCompareModeChange(compareMode)}
                      className={`edge glass-chip h-8 rounded-full px-3 text-[11px] font-medium capitalize text-gray-400 hover:text-white ${
                        sliderCompareMode === compareMode ? 'glass-chip-active text-white' : ''
                      }`}
                    >
                      vs {compareMode}
                    </button>
                  ))}
                </div>
              )}
              <ToolButton
                label={supportsImageEditing ? 'Point edit - tap a spot on the image' : 'Point edit is not available with this model'}
                active={activeTool === 'retouch'}
                disabled={isLoading || !supportsImageEditing}
                onClick={() => onToolChange(activeTool === 'retouch' ? 'none' : 'retouch')}
              >
                <BullseyeIcon className="h-4.5 w-4.5" />
              </ToolButton>
              <ToolButton
                label="Crop"
                active={false}
                disabled={isLoading}
                onClick={() => onToolChange('crop')}
              >
                <CropIcon className="h-4.5 w-4.5" />
              </ToolButton>
              <ToolButton label="Download" onClick={onDownload}>
                <DownloadIcon className="h-4.5 w-4.5" />
              </ToolButton>
              <ToolButton label="Reset to original" disabled={!canUndo || isLoading} onClick={onReset}>
                <ResetIcon className="h-4.5 w-4.5" />
              </ToolButton>
            </div>
          )}

          {activeTool === 'retouch' && (
            <p className="text-xs text-gray-500 animate-fade-in-fast">
              {displayHotspot ? 'Point selected - describe the edit below.' : 'Tap a point on the image to edit precisely.'}
            </p>
          )}
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-3xl bg-black/60 backdrop-blur-sm animate-fade-in-fast">
          <div className="[&>svg]:text-gray-200 [&>svg]:h-10 [&>svg]:w-10">
            <Spinner />
          </div>
          <p className="px-6 text-center text-sm text-gray-300">{loadingLabel}</p>
        </div>
      )}
    </div>
  );
};

export default ResultStage;
