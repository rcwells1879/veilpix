/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The studio composer: a single prompt dock whose dropdown settings adapt in
 * real time to the selected model, for both image and video workflows.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { formatCreditAmount } from '../../src/utils/creditFormatting';
import {
  getImageCreditCost,
  getImageModelResolutions,
  normalizeImageGenerationOptions,
  IMAGE_MODEL_CONFIGS,
  type ImageGenerationOptions,
  type ImageProvider,
  type ImageWorkflow,
  type SeedreamTier,
  type ImageOutputFormat,
} from '../ImageModelControlsPanel';
import { PhotoIcon, VideoIcon, SlidersIcon, CombineIcon } from '../icons';
import {
  Dropdown,
  OptionRow,
  PanelHeading,
  RatioGlyph,
  SegmentedControl,
  StepperRow,
  ToggleRow,
  PlusIcon,
} from './controls';
import { ImageSlot, ImageGrid, VideoSlot, AudioSlot } from './ReferenceInputs';
import {
  WAN_26_DURATIONS,
  WAN_27_DURATIONS,
  WAN_RESOLUTIONS,
  WAN_RATIOS,
  SEEDANCE_RATIOS,
  SEEDANCE_RESOLUTIONS,
  SEEDANCE_DURATION_LIMITS,
  SEEDANCE_MAX_REFERENCE_IMAGES,
  getWanCreditCost,
  getSeedanceCreditCost,
  getWanMaxReferenceImages,
  clampSeedanceDuration,
} from './videoPricing';
import type { StudioMode, VideoProvider, SeedanceVariant, SeedanceInputMode, VideoGenerateOptions } from './types';

/* ------------------------------------------------------------------ */

type ImageModelId = 'nanobanana2' | 'seedream-lite' | 'seedream-pro' | 'wanimage';
type VideoModelId = 'wan' | 'seedance-regular' | 'seedance-fast' | 'seedance-mini';

const IMAGE_MODELS: { id: ImageModelId; provider: ImageProvider; tier: SeedreamTier; label: string; sublabel: string }[] = [
  { id: 'nanobanana2', provider: 'nanobanana2', tier: 'lite', label: 'Nano Banana 2', sublabel: 'Gemini 3.1 Flash' },
  { id: 'seedream-lite', provider: 'seedream', tier: 'lite', label: 'Seedream 5 Lite', sublabel: 'ByteDance' },
  { id: 'seedream-pro', provider: 'seedream', tier: 'pro', label: 'Seedream 5 Pro', sublabel: 'ByteDance' },
  { id: 'wanimage', provider: 'wanimage', tier: 'lite', label: 'Wan 2.7 Image', sublabel: 'Alibaba' },
];

const VIDEO_MODELS: { id: VideoModelId; provider: VideoProvider; variant: SeedanceVariant; label: string; sublabel: string }[] = [
  { id: 'wan', provider: 'wan', variant: 'regular', label: 'Wan Video', sublabel: '2.6 / 2.7 · auto' },
  { id: 'seedance-regular', provider: 'seedance', variant: 'regular', label: 'Seedance 2.0', sublabel: 'ByteDance' },
  { id: 'seedance-fast', provider: 'seedance', variant: 'fast', label: 'Seedance 2.0 Fast', sublabel: 'ByteDance' },
  { id: 'seedance-mini', provider: 'seedance', variant: 'mini', label: 'Seedance 2.0 Mini', sublabel: 'ByteDance' },
];

const STYLE_PRESETS = [
  { name: 'Synthwave', prompt: 'Apply a vibrant 80s synthwave aesthetic with neon magenta and cyan glows, and subtle scan lines.' },
  { name: 'Anime', prompt: 'Give the image a vibrant Japanese anime style, with bold outlines, cel-shading, and saturated colors.' },
  { name: 'Lomo', prompt: 'Apply a Lomography-style cross-processing film effect with high-contrast, oversaturated colors, and dark vignetting.' },
  { name: 'Glitch', prompt: 'Transform the image into a futuristic holographic projection with digital glitch effects and chromatic aberration.' },
];

export interface ComposerProps {
  mode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
  isLoading: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  onNewSession: () => void;

  /* image workflow */
  imageOptions: ImageGenerationOptions;
  onImageOptionsChange: (options: ImageGenerationOptions) => void;
  baseImage: File | null;
  onBaseImageSelect: (file: File | null) => void;
  styleImage: File | null;
  onStyleImageSelect: (file: File | null) => void;
  onOpenWebcam: (target: 'base' | 'style') => void;
  retouchActive: boolean;
  hasHotspot: boolean;
  imageCreditCost: number;
  onGenerateImage: () => void;

  /* video workflow */
  videoProvider: VideoProvider;
  onVideoProviderChange: (provider: VideoProvider) => void;
  onGenerateVideo: (options: VideoGenerateOptions) => void;
  hasGeneratedVideo: boolean;
  onUseGeneratedVideoAsReference: () => void;

  wanReferenceImages: File[];
  onWanReferenceImagesChange: (files: File[]) => void;
  referenceVideoFile: File | null;
  referenceVideoUrl: string | null;
  onReferenceVideoSelect: (file: File | null) => void;

  seedanceInputMode: SeedanceInputMode;
  onSeedanceInputModeChange: (mode: SeedanceInputMode) => void;
  seedanceFirstFrame: File | null;
  onSeedanceFirstFrameSelect: (file: File | null) => void;
  seedanceLastFrame: File | null;
  onSeedanceLastFrameSelect: (file: File | null) => void;
  seedanceReferenceImages: File[];
  onSeedanceReferenceImagesChange: (files: File[]) => void;
  seedanceReferenceVideoFile: File | null;
  seedanceReferenceVideoUrl: string | null;
  onSeedanceReferenceVideoSelect: (file: File | null) => void;
  onSeedanceReferenceVideoUrlRemove: () => void;
  seedanceReferenceVideoDuration: number | null;
  seedanceReferenceAudioFile: File | null;
  onSeedanceReferenceAudioSelect: (file: File | null) => void;
}

/* ------------------------------------------------------------------ */
/* Persisted video settings — survive reloads, remounts, and model     */
/* switches. Values are only written when the user changes them.       */
/* ------------------------------------------------------------------ */
const VIDEO_SETTINGS_STORAGE_KEY = 'veilpix-video-settings';

interface StoredVideoSettings {
  wanDuration: number;
  wanResolution: string;
  wanRatio: string;
  wanAudio: boolean;
  wanMultiShots: boolean;
  seedanceVariant: SeedanceVariant;
  seedanceDuration: number;
  seedanceResolution: string;
  seedanceRatio: string;
  seedanceGenerateAudio: boolean;
  seedanceWebSearch: boolean;
}

const storedVideoSettings: Partial<StoredVideoSettings> = (() => {
  try {
    const raw = localStorage.getItem(VIDEO_SETTINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
})();

const Composer: React.FC<ComposerProps> = (props) => {
  const {
    mode, onModeChange, isLoading, prompt, onPromptChange, onNewSession,
    imageOptions, onImageOptionsChange, baseImage, onBaseImageSelect, styleImage, onStyleImageSelect,
    onOpenWebcam, retouchActive, hasHotspot, imageCreditCost, onGenerateImage,
    videoProvider, onVideoProviderChange, onGenerateVideo, hasGeneratedVideo, onUseGeneratedVideoAsReference,
    wanReferenceImages, onWanReferenceImagesChange, referenceVideoFile, referenceVideoUrl, onReferenceVideoSelect,
    seedanceInputMode, onSeedanceInputModeChange,
    seedanceFirstFrame, onSeedanceFirstFrameSelect, seedanceLastFrame, onSeedanceLastFrameSelect,
    seedanceReferenceImages, onSeedanceReferenceImagesChange,
    seedanceReferenceVideoFile, seedanceReferenceVideoUrl, onSeedanceReferenceVideoSelect, onSeedanceReferenceVideoUrlRemove,
    seedanceReferenceVideoDuration, seedanceReferenceAudioFile, onSeedanceReferenceAudioSelect,
  } = props;

  /* --------------------------- video settings --------------------------- */
  const [wanDuration, setWanDuration] = useState<number>(storedVideoSettings.wanDuration ?? 5);
  const [wanResolution, setWanResolution] = useState<string>(storedVideoSettings.wanResolution ?? '1080p');
  const [wanRatio, setWanRatio] = useState<string>(storedVideoSettings.wanRatio ?? '16:9');
  const [wanAudio, setWanAudio] = useState(storedVideoSettings.wanAudio ?? true);
  const [wanMultiShots, setWanMultiShots] = useState(storedVideoSettings.wanMultiShots ?? false);
  const [seedanceVariant, setSeedanceVariant] = useState<SeedanceVariant>(
    storedVideoSettings.seedanceVariant === 'regular' || storedVideoSettings.seedanceVariant === 'fast' || storedVideoSettings.seedanceVariant === 'mini'
      ? storedVideoSettings.seedanceVariant
      : 'mini'
  );
  const [seedanceDuration, setSeedanceDuration] = useState(storedVideoSettings.seedanceDuration ?? 5);
  const [seedanceResolution, setSeedanceResolution] = useState(storedVideoSettings.seedanceResolution ?? '720p');
  const [seedanceRatio, setSeedanceRatio] = useState(storedVideoSettings.seedanceRatio ?? '16:9');
  const [seedanceGenerateAudio, setSeedanceGenerateAudio] = useState(storedVideoSettings.seedanceGenerateAudio ?? false);
  const [seedanceWebSearch, setSeedanceWebSearch] = useState(storedVideoSettings.seedanceWebSearch ?? false);

  /* --------------------------- derived: image --------------------------- */
  const imageWorkflow: ImageWorkflow = baseImage ? 'image-to-image' : 'text-to-image';
  const normalizedImage = normalizeImageGenerationOptions(imageOptions, imageWorkflow);
  const imageConfig = IMAGE_MODEL_CONFIGS[normalizedImage.provider];
  const imageResolutions = getImageModelResolutions(normalizedImage.provider, imageWorkflow, normalizedImage.seedreamTier);
  const activeImageModel = IMAGE_MODELS.find((model) =>
    model.provider === normalizedImage.provider
    && (model.provider !== 'seedream' || model.tier === normalizedImage.seedreamTier)
  ) ?? IMAGE_MODELS[1];
  const imageReferenceCount = (baseImage ? 1 : 0) + (styleImage ? 1 : 0);

  /* --------------------------- derived: video --------------------------- */
  const hasWanVideoReference = Boolean(referenceVideoFile || referenceVideoUrl);
  const maxWanReferenceImages = getWanMaxReferenceImages(hasWanVideoReference);
  const wanUsesTextToVideo = wanReferenceImages.length === 0 && !hasWanVideoReference;
  const wanUsesReferenceToVideo = wanReferenceImages.length > 1 || hasWanVideoReference;
  const wanUsesSingleImage = !wanUsesTextToVideo && !wanUsesReferenceToVideo;
  const wanDurationOptions = wanUsesReferenceToVideo ? WAN_27_DURATIONS : WAN_26_DURATIONS;
  const hasSeedanceVideoReference = seedanceInputMode === 'references' && Boolean(seedanceReferenceVideoFile || seedanceReferenceVideoUrl);
  const seedanceDurationLimits = SEEDANCE_DURATION_LIMITS[seedanceVariant];
  const activeVideoModel = VIDEO_MODELS.find((model) =>
    model.provider === videoProvider && (model.provider !== 'seedance' || model.variant === seedanceVariant)
  ) ?? VIDEO_MODELS[0];

  const videoReferenceCount = videoProvider === 'seedance'
    ? seedanceInputMode === 'frames'
      ? (seedanceFirstFrame ? 1 : 0) + (seedanceLastFrame ? 1 : 0)
      : seedanceReferenceImages.length + (hasSeedanceVideoReference ? 1 : 0) + (seedanceReferenceAudioFile ? 1 : 0)
    : wanReferenceImages.length + (hasWanVideoReference ? 1 : 0);

  /* Effective (clamped-at-read) values. Stored preferences are never mutated
     by these clamps, so switching models and back restores what you had. */
  const seedanceResolutionOptions = SEEDANCE_RESOLUTIONS[seedanceVariant];
  const effectiveSeedanceResolution = seedanceResolutionOptions.includes(seedanceResolution)
    ? seedanceResolution
    : seedanceResolutionOptions[seedanceResolutionOptions.length - 1];
  const effectiveSeedanceRatio = SEEDANCE_RATIOS[seedanceVariant].includes(seedanceRatio) ? seedanceRatio : '16:9';
  const effectiveSeedanceDuration = clampSeedanceDuration(seedanceVariant, seedanceDuration);
  const effectiveWanDuration = wanUsesReferenceToVideo && wanDuration > 10 ? 10 : wanDuration;

  const wanCreditCost = useMemo(() => getWanCreditCost(effectiveWanDuration, wanResolution), [effectiveWanDuration, wanResolution]);
  const seedanceCreditCost = useMemo(
    () => getSeedanceCreditCost(seedanceVariant, effectiveSeedanceResolution, effectiveSeedanceDuration, hasSeedanceVideoReference, seedanceReferenceVideoDuration),
    [seedanceVariant, effectiveSeedanceResolution, effectiveSeedanceDuration, hasSeedanceVideoReference, seedanceReferenceVideoDuration]
  );
  const videoCreditCost = videoProvider === 'seedance' ? seedanceCreditCost : wanCreditCost;

  /* Persist video settings whenever the user changes them */
  useEffect(() => {
    const snapshot: StoredVideoSettings = {
      wanDuration, wanResolution, wanRatio, wanAudio, wanMultiShots,
      seedanceVariant, seedanceDuration, seedanceResolution, seedanceRatio,
      seedanceGenerateAudio, seedanceWebSearch,
    };
    Object.assign(storedVideoSettings, snapshot);
    try {
      localStorage.setItem(VIDEO_SETTINGS_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage unavailable — settings simply won't persist across reloads.
    }
  }, [
    wanDuration, wanResolution, wanRatio, wanAudio, wanMultiShots,
    seedanceVariant, seedanceDuration, seedanceResolution, seedanceRatio,
    seedanceGenerateAudio, seedanceWebSearch,
  ]);

  /* --------------------------- handlers --------------------------- */
  const updateImageOptions = (partial: Partial<ImageGenerationOptions>) => {
    // Merge onto the raw stored options (not the workflow-clamped view) so a
    // temporary clamp never overwrites the user's saved preference.
    onImageOptionsChange({ ...imageOptions, ...partial });
  };

  const handleGenerate = () => {
    const trimmed = prompt.trim();
    if (mode === 'image') {
      onGenerateImage();
      return;
    }
    if (!trimmed) return;
    if (videoProvider === 'seedance') {
      onGenerateVideo({
        provider: 'seedance',
        prompt: trimmed,
        duration: effectiveSeedanceDuration,
        resolution: effectiveSeedanceResolution,
        ratio: effectiveSeedanceRatio,
        seedanceVariant,
        seedanceInputMode,
        seedanceGenerateAudio,
        seedanceWebSearch,
      });
    } else {
      onGenerateVideo({
        provider: 'wan',
        prompt: trimmed,
        duration: effectiveWanDuration,
        resolution: wanResolution,
        ratio: wanRatio,
        wanAudio,
        wanMultiShots,
      });
    }
  };

  const generateDisabled = isLoading
    || !prompt.trim()
    || (mode === 'image' && retouchActive && !hasHotspot);

  const placeholder = mode === 'video'
    ? 'Describe the motion, camera movement, and style of your video…'
    : retouchActive
      ? hasHotspot
        ? 'Describe the edit for the selected point…'
        : 'Tap a point on the image above, then describe the edit…'
      : baseImage && styleImage
        ? 'Describe how to combine the two images…'
        : baseImage
          ? 'Describe how to transform this image…'
          : 'Describe the image you want to create…';

  const creditCost = mode === 'video' ? videoCreditCost : imageCreditCost;

  const showWanRatio = videoProvider === 'wan' && !wanUsesSingleImage;
  const showImageOptionsPill = normalizedImage.provider === 'seedream' || Boolean(baseImage);
  const showWanOptionsPill = wanUsesSingleImage || !wanUsesReferenceToVideo;

  /* ------------------------------------------------------------------ */
  return (
    <section className="glass-panel edge flex w-full flex-col gap-2.5 rounded-3xl p-3 sm:p-4" aria-label="Prompt composer">
      {/* Mode toggle + new session */}
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl<StudioMode>
          value={mode}
          onChange={onModeChange}
          disabled={isLoading}
          ariaLabel="Creation mode"
          options={[
            { value: 'image', label: 'Image', icon: <PhotoIcon /> },
            { value: 'video', label: 'Video', icon: <VideoIcon /> },
          ]}
        />
        <button
          type="button"
          onClick={onNewSession}
          disabled={isLoading}
          title="Start over"
          className="edge glass-chip flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-gray-400 hover:text-white disabled:opacity-45"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {/* Prompt */}
      <textarea
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !generateDisabled) {
            event.preventDefault();
            handleGenerate();
          }
        }}
        placeholder={placeholder}
        rows={3}
        maxLength={5000}
        disabled={isLoading}
        className="max-h-64 min-h-24 w-full resize-none bg-transparent px-1.5 py-1 text-base leading-relaxed text-gray-100 placeholder:text-gray-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-28"
      />

      {/* Settings pills + generate */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Model */}
        <Dropdown
          label={mode === 'image' ? activeImageModel.label : activeVideoModel.label}
          title="Model"
          disabled={isLoading}
          panelWidthClassName="sm:w-72"
        >
          {(close) => (
            <div className="flex flex-col gap-0.5">
              <PanelHeading>Model</PanelHeading>
              {mode === 'image'
                ? IMAGE_MODELS.map((model) => (
                    <OptionRow
                      key={model.id}
                      selected={model.id === activeImageModel.id}
                      label={model.label}
                      sublabel={model.sublabel}
                      onSelect={() => {
                        updateImageOptions({ provider: model.provider, seedreamTier: model.tier });
                        close();
                      }}
                    />
                  ))
                : VIDEO_MODELS.map((model) => (
                    <OptionRow
                      key={model.id}
                      selected={model.id === activeVideoModel.id}
                      label={model.label}
                      sublabel={model.sublabel}
                      onSelect={() => {
                        onVideoProviderChange(model.provider);
                        if (model.provider === 'seedance') setSeedanceVariant(model.variant);
                        close();
                      }}
                    />
                  ))}
            </div>
          )}
        </Dropdown>

        {/* Aspect ratio */}
        {(mode === 'image' || showWanRatio || videoProvider === 'seedance') && (
          <Dropdown
            label={mode === 'image' ? normalizedImage.aspectRatio === 'auto' ? 'Auto' : normalizedImage.aspectRatio : videoProvider === 'seedance' ? effectiveSeedanceRatio : wanRatio}
            icon={<RatioGlyph ratio={mode === 'image' ? normalizedImage.aspectRatio : videoProvider === 'seedance' ? effectiveSeedanceRatio : wanRatio} />}
            title="Aspect ratio"
            disabled={isLoading}
            panelWidthClassName="sm:w-56"
          >
            {(close) => (
              <div className="flex flex-col gap-0.5">
                <PanelHeading>Aspect ratio</PanelHeading>
                {(mode === 'image'
                  ? imageConfig.aspectRatios.map((ratio) => ({ value: ratio.value, label: ratio.label }))
                  : (videoProvider === 'seedance' ? SEEDANCE_RATIOS[seedanceVariant] : [...WAN_RATIOS]).map((ratio) => ({ value: ratio, label: ratio }))
                ).map((ratio) => {
                  const selected = mode === 'image'
                    ? normalizedImage.aspectRatio === ratio.value
                    : videoProvider === 'seedance' ? effectiveSeedanceRatio === ratio.value : wanRatio === ratio.value;
                  return (
                    <OptionRow
                      key={ratio.value}
                      selected={selected}
                      label={ratio.label === 'auto' || ratio.label === 'adaptive' ? ratio.label.charAt(0).toUpperCase() + ratio.label.slice(1) : ratio.label}
                      leading={<RatioGlyph ratio={ratio.value} />}
                      onSelect={() => {
                        if (mode === 'image') updateImageOptions({ aspectRatio: ratio.value });
                        else if (videoProvider === 'seedance') setSeedanceRatio(ratio.value);
                        else setWanRatio(ratio.value);
                        close();
                      }}
                    />
                  );
                })}
              </div>
            )}
          </Dropdown>
        )}

        {/* Resolution */}
        <Dropdown
          label={mode === 'image' ? normalizedImage.resolution : videoProvider === 'seedance' ? effectiveSeedanceResolution : wanResolution}
          title="Resolution"
          disabled={isLoading}
          panelWidthClassName="sm:w-60"
        >
          {(close) => (
            <div className="flex flex-col gap-0.5">
              <PanelHeading>Resolution</PanelHeading>
              {mode === 'image'
                ? imageResolutions.map((resolution) => (
                    <OptionRow
                      key={resolution.value}
                      selected={normalizedImage.resolution === resolution.value}
                      label={resolution.label}
                      trailing={`${formatCreditAmount(getImageCreditCost(normalizedImage.provider, resolution.value, imageWorkflow, normalizedImage.seedreamTier, styleImage && baseImage ? 2 : 0))} cr`}
                      onSelect={() => { updateImageOptions({ resolution: resolution.value }); close(); }}
                    />
                  ))
                : (videoProvider === 'seedance' ? SEEDANCE_RESOLUTIONS[seedanceVariant] : [...WAN_RESOLUTIONS]).map((resolution) => (
                    <OptionRow
                      key={resolution}
                      selected={videoProvider === 'seedance' ? effectiveSeedanceResolution === resolution : wanResolution === resolution}
                      label={resolution}
                      trailing={videoProvider === 'wan'
                        ? `${getWanCreditCost(effectiveWanDuration, resolution)} cr`
                        : `${getSeedanceCreditCost(seedanceVariant, resolution, effectiveSeedanceDuration, hasSeedanceVideoReference, seedanceReferenceVideoDuration)} cr`}
                      onSelect={() => {
                        if (videoProvider === 'seedance') setSeedanceResolution(resolution);
                        else setWanResolution(resolution);
                        close();
                      }}
                    />
                  ))}
            </div>
          )}
        </Dropdown>

        {/* Duration (video only) */}
        {mode === 'video' && (
          <Dropdown
            label={`${videoProvider === 'seedance' ? effectiveSeedanceDuration : effectiveWanDuration}s`}
            title="Duration"
            disabled={isLoading}
            panelWidthClassName="sm:w-60"
          >
            {(close) => (
              <div className="flex flex-col gap-0.5">
                <PanelHeading>Duration</PanelHeading>
                {videoProvider === 'seedance' ? (
                  <>
                    <StepperRow
                      label="Length"
                      value={effectiveSeedanceDuration}
                      min={seedanceDurationLimits.min}
                      max={seedanceDurationLimits.max}
                      onChange={setSeedanceDuration}
                      disabled={isLoading}
                    />
                    <p className="px-3 pb-1.5 text-[11px] text-gray-500">
                      {effectiveSeedanceDuration}s at {effectiveSeedanceResolution} · <span className="font-semibold text-gray-300">{seedanceCreditCost} cr</span>
                    </p>
                  </>
                ) : (
                  wanDurationOptions.map((duration) => (
                    <OptionRow
                      key={duration}
                      selected={effectiveWanDuration === duration}
                      label={`${duration} seconds`}
                      trailing={`${getWanCreditCost(duration, wanResolution)} cr`}
                      onSelect={() => { setWanDuration(duration); close(); }}
                    />
                  ))
                )}
              </div>
            )}
          </Dropdown>
        )}

        {/* References */}
        <Dropdown
          label="References"
          icon={<CombineIcon />}
          title="Reference images, frames, video, and audio"
          disabled={isLoading}
          badge={mode === 'image' ? imageReferenceCount : videoReferenceCount}
          panelWidthClassName="sm:w-96"
        >
          <div className="flex flex-col gap-3 p-1.5">
            {mode === 'image' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <ImageSlot
                    file={baseImage}
                    label="Base image"
                    helper="Photo to edit"
                    disabled={isLoading}
                    pastePriority={baseImage ? 2 : 0}
                    onChange={onBaseImageSelect}
                    onWebcamClick={() => onOpenWebcam('base')}
                  />
                  <ImageSlot
                    file={styleImage}
                    label="Style / element"
                    helper={baseImage ? 'Blend into the base' : 'Add a base image first'}
                    disabled={isLoading || !baseImage}
                    pastePriority={!baseImage ? 3 : styleImage ? 2 : 1}
                    onChange={onStyleImageSelect}
                    onWebcamClick={() => onOpenWebcam('style')}
                  />
                </div>
                <p className="px-1 text-[11px] leading-relaxed text-gray-600">
                  No references creates from text alone. A base image is edited by your prompt. Add both to combine two photos into one.
                </p>
              </>
            ) : videoProvider === 'wan' ? (
              <>
                <ImageGrid
                  files={wanReferenceImages}
                  maxFiles={maxWanReferenceImages}
                  label="Reference images"
                  helper="One image animates it. Several guide characters and style."
                  disabled={isLoading}
                  onChange={onWanReferenceImagesChange}
                />
                <VideoSlot
                  file={referenceVideoFile}
                  url={referenceVideoUrl}
                  label="Reference video"
                  helper="Motion reference"
                  disabled={isLoading}
                  onSelect={onReferenceVideoSelect}
                  onRemoveUrl={() => onReferenceVideoSelect(null)}
                  action={hasGeneratedVideo ? (
                    <button
                      type="button"
                      onClick={onUseGeneratedVideoAsReference}
                      disabled={isLoading}
                      className="text-[11px] font-semibold text-accent-300 transition hover:text-accent-200 disabled:opacity-50"
                    >
                      Use generated
                    </button>
                  ) : undefined}
                />
              </>
            ) : (
              <>
                <SegmentedControl<SeedanceInputMode>
                  value={seedanceInputMode}
                  onChange={onSeedanceInputModeChange}
                  disabled={isLoading}
                  size="sm"
                  ariaLabel="Seedance reference type"
                  options={[
                    { value: 'frames', label: 'Start / end frames' },
                    { value: 'references', label: 'Style & characters' },
                  ]}
                />
                {seedanceInputMode === 'frames' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <ImageSlot
                      file={seedanceFirstFrame}
                      label="Start frame"
                      helper="Exact first frame"
                      disabled={isLoading}
                      pastePriority={seedanceFirstFrame ? 1 : 0}
                      onChange={(file) => {
                        onSeedanceFirstFrameSelect(file);
                        if (!file && seedanceLastFrame) onSeedanceLastFrameSelect(null);
                      }}
                    />
                    <ImageSlot
                      file={seedanceLastFrame}
                      label="End frame"
                      helper={seedanceFirstFrame ? 'Optional final frame' : 'Add a start frame first'}
                      disabled={isLoading || !seedanceFirstFrame}
                      pastePriority={seedanceFirstFrame ? 0 : 2}
                      onChange={onSeedanceLastFrameSelect}
                    />
                  </div>
                ) : (
                  <>
                    <ImageGrid
                      files={seedanceReferenceImages}
                      maxFiles={SEEDANCE_MAX_REFERENCE_IMAGES}
                      label="Style & character images"
                      helper="Image roles are guided by your prompt."
                      disabled={isLoading}
                      onChange={onSeedanceReferenceImagesChange}
                    />
                    <VideoSlot
                      file={seedanceReferenceVideoFile}
                      url={seedanceReferenceVideoUrl}
                      label="Reference video"
                      helper="Up to 15s input"
                      disabled={isLoading}
                      onSelect={onSeedanceReferenceVideoSelect}
                      onRemoveUrl={onSeedanceReferenceVideoUrlRemove}
                      action={hasGeneratedVideo ? (
                        <button
                          type="button"
                          onClick={onUseGeneratedVideoAsReference}
                          disabled={isLoading}
                          className="text-[11px] font-semibold text-accent-300 transition hover:text-accent-200 disabled:opacity-50"
                        >
                          Use generated
                        </button>
                      ) : undefined}
                    />
                    <AudioSlot
                      file={seedanceReferenceAudioFile}
                      disabled={isLoading}
                      onSelect={onSeedanceReferenceAudioSelect}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </Dropdown>

        {/* Options */}
        {((mode === 'image' && showImageOptionsPill) || (mode === 'video' && (videoProvider === 'seedance' || showWanOptionsPill))) && (
          <Dropdown
            label="Options"
            icon={<SlidersIcon />}
            title="Model options"
            disabled={isLoading}
            panelWidthClassName="sm:w-72"
          >
            {(close) => (
              <div className="flex flex-col gap-0.5">
                {mode === 'image' ? (
                  <>
                    {normalizedImage.provider === 'seedream' && (
                      <>
                        <PanelHeading>Output format</PanelHeading>
                        {(['png', 'jpeg'] as ImageOutputFormat[]).map((format) => (
                          <OptionRow
                            key={format}
                            selected={normalizedImage.outputFormat === format}
                            label={format.toUpperCase()}
                            onSelect={() => { updateImageOptions({ outputFormat: format }); close(); }}
                          />
                        ))}
                      </>
                    )}
                    {baseImage && (
                      <>
                        <PanelHeading>Style presets</PanelHeading>
                        {STYLE_PRESETS.map((preset) => (
                          <OptionRow
                            key={preset.name}
                            selected={prompt === preset.prompt}
                            label={preset.name}
                            sublabel="Fills the prompt - edit freely"
                            onSelect={() => { onPromptChange(preset.prompt); close(); }}
                          />
                        ))}
                      </>
                    )}
                  </>
                ) : videoProvider === 'wan' ? (
                  <>
                    <PanelHeading>Wan options</PanelHeading>
                    {wanUsesSingleImage && (
                      <ToggleRow
                        label="Audio"
                        description="Generate synchronized audio"
                        checked={wanAudio}
                        onChange={setWanAudio}
                        disabled={isLoading}
                      />
                    )}
                    {!wanUsesReferenceToVideo && (
                      <ToggleRow
                        label="Multi-shot"
                        description="Allow scene cuts in one clip"
                        checked={wanMultiShots}
                        onChange={setWanMultiShots}
                        disabled={isLoading}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <PanelHeading>Seedance options</PanelHeading>
                    <ToggleRow
                      label="Generate audio"
                      description="Synchronized AI audio when supported"
                      checked={seedanceGenerateAudio}
                      onChange={setSeedanceGenerateAudio}
                      disabled={isLoading}
                    />
                    <ToggleRow
                      label="Web search"
                      description="Allow online context for grounding"
                      checked={seedanceWebSearch}
                      onChange={setSeedanceWebSearch}
                      disabled={isLoading}
                    />
                  </>
                )}
              </div>
            )}
          </Dropdown>
        )}

        {/* Generate — same row as the pills, pinned right */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generateDisabled}
          className="btn-porcelain edge-strong ms-auto flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold sm:w-auto"
        >
          {isLoading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
              Generating…
            </>
          ) : (
            <>
              Generate
              <span className="text-[12px] font-medium opacity-60">{formatCreditAmount(creditCost)} cr</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
};

export default Composer;
