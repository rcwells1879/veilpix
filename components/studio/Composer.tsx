/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The studio composer: a single prompt dock whose dropdown settings adapt in
 * real time to the selected model, for both image and video workflows.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatCreditAmount } from '../../src/utils/creditFormatting';
import { getSubmittedPrompt } from '../../src/utils/promptSubmission';
import {
  getImageCreditCost,
  getImageModelResolutions,
  imageProviderSupportsReferences,
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
import { ImageSlot, ImageGrid, VideoSlot, VideoGrid, AudioGrid, ReferenceFileSlot } from './ReferenceInputs';
import {
  WAN_26_DURATIONS,
  WAN_27_DURATIONS,
  WAN_RESOLUTIONS,
  WAN_RATIOS,
  SEEDANCE_RATIOS,
  SEEDANCE_RESOLUTIONS,
  SEEDANCE_DURATION_LIMITS,
  getWanCreditCost,
  getSeedanceCreditCost,
  getWanMaxReferenceImages,
  getSeedanceReferenceLimits,
  clampSeedanceDuration,
  exceedsSeedanceMediaDurationLimit,
  WAN3_RESOLUTIONS,
  WAN3_RATIOS,
  WAN3_DURATION_LIMITS,
  WAN3_REFERENCE_LIMITS,
  getWan3CreditCost,
  clampWan3Duration,
} from './videoPricing';
import type { StudioMode, VideoProvider, SeedanceVariant, SeedanceInputMode, SeedanceOutputFormat, Wan3Variant, Wan3InputMode, VideoGenerateOptions } from './types';

/* ------------------------------------------------------------------ */

type ImageModelId = 'nanobanana2' | 'seedream-lite' | 'seedream-pro' | 'wanimage' | 'zimage';
type VideoModelId = 'wan3-standard' | 'wan3-prime' | 'wan' | 'seedance-2-5' | 'seedance-regular' | 'seedance-fast' | 'seedance-mini';

const IMAGE_MODELS: { id: ImageModelId; provider: ImageProvider; tier: SeedreamTier; label: string; sublabel: string }[] = [
  { id: 'nanobanana2', provider: 'nanobanana2', tier: 'lite', label: 'Nano Banana 2', sublabel: 'Gemini 3.1 Flash' },
  { id: 'seedream-lite', provider: 'seedream', tier: 'lite', label: 'Seedream 5 Lite', sublabel: 'ByteDance' },
  { id: 'seedream-pro', provider: 'seedream', tier: 'pro', label: 'Seedream 5 Pro', sublabel: 'ByteDance' },
  { id: 'wanimage', provider: 'wanimage', tier: 'lite', label: 'Wan 2.7 Image', sublabel: 'Alibaba' },
  { id: 'zimage', provider: 'zimage', tier: 'lite', label: 'Z-Image Turbo', sublabel: 'Tongyi-MAI · text only' },
];

const VIDEO_MODELS: { id: VideoModelId; provider: VideoProvider; seedanceVariant?: SeedanceVariant; wan3Variant?: Wan3Variant; label: string; sublabel: string }[] = [
  { id: 'wan3-standard', provider: 'wan3', wan3Variant: 'standard', label: 'Wan 3.0 Standard', sublabel: 'Lower cost · full feature set' },
  { id: 'wan3-prime', provider: 'wan3', wan3Variant: 'prime', label: 'Wan 3.0 Prime', sublabel: 'Faster generation' },
  { id: 'seedance-2-5', provider: 'seedance', seedanceVariant: 'v2_5', label: 'Seedance 2.5', sublabel: 'ByteDance · new' },
  { id: 'wan', provider: 'wan', label: 'Wan Video', sublabel: '2.6 / 2.7 · auto' },
  { id: 'seedance-regular', provider: 'seedance', seedanceVariant: 'regular', label: 'Seedance 2.0', sublabel: 'ByteDance' },
  { id: 'seedance-fast', provider: 'seedance', seedanceVariant: 'fast', label: 'Seedance 2.0 Fast', sublabel: 'ByteDance' },
  { id: 'seedance-mini', provider: 'seedance', seedanceVariant: 'mini', label: 'Seedance 2.0 Mini', sublabel: 'ByteDance' },
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
  generationQueueCount: number;
  generationQueueLimit: number;
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
  onGenerateImage: (prompt: string) => void;

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

  wan3InputMode: Wan3InputMode;
  onWan3InputModeChange: (mode: Wan3InputMode) => void;
  wan3FirstFrame: File | null;
  onWan3FirstFrameSelect: (file: File | null) => void;
  wan3LastFrame: File | null;
  onWan3LastFrameSelect: (file: File | null) => void;
  wan3ReferenceImages: File[];
  onWan3ReferenceImagesChange: (files: File[]) => void;
  wan3ReferenceVideoFiles: File[];
  onWan3ReferenceVideosChange: (files: File[]) => void;
  wan3ReferenceVideoDuration: number | null;
  wan3ReferenceAudioFiles: File[];
  onWan3ReferenceAudiosChange: (files: File[]) => void;
  wan3ReferenceAudioDuration: number | null;
  wan3ReferenceFile: File | null;
  onWan3ReferenceFileChange: (file: File | null) => void;
  wan3ReferenceLink: string;
  onWan3ReferenceLinkChange: (value: string) => void;

  seedanceInputMode: SeedanceInputMode;
  onSeedanceInputModeChange: (mode: SeedanceInputMode) => void;
  seedanceFirstFrame: File | null;
  onSeedanceFirstFrameSelect: (file: File | null) => void;
  seedanceLastFrame: File | null;
  onSeedanceLastFrameSelect: (file: File | null) => void;
  seedanceReferenceImages: File[];
  onSeedanceReferenceImagesChange: (files: File[]) => void;
  seedanceReferenceVideoFiles: File[];
  seedanceReferenceVideoUrl: string | null;
  onSeedanceReferenceVideosChange: (files: File[]) => void;
  onSeedanceReferenceVideoUrlRemove: () => void;
  seedanceReferenceVideoDuration: number | null;
  seedanceReferenceAudioFiles: File[];
  seedanceReferenceAudioDuration: number | null;
  onSeedanceReferenceAudiosChange: (files: File[]) => void;
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
  wan3Variant: Wan3Variant;
  wan3Duration: number;
  wan3Resolution: string;
  wan3Ratio: string;
  wan3Audio: boolean;
  wan3Seed: number | null;
  seedanceVariant: SeedanceVariant;
  seedanceDuration: number;
  seedanceResolution: string;
  seedanceRatio: string;
  seedanceGenerateAudio: boolean;
  seedanceWebSearch: boolean;
  seedanceReturnLastFrame: boolean;
  seedanceOutputFormat: SeedanceOutputFormat;
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
    mode, onModeChange, isLoading, generationQueueCount, generationQueueLimit,
    prompt, onPromptChange, onNewSession,
    imageOptions, onImageOptionsChange, baseImage, onBaseImageSelect, styleImage, onStyleImageSelect,
    onOpenWebcam, retouchActive, hasHotspot, imageCreditCost, onGenerateImage,
    videoProvider, onVideoProviderChange, onGenerateVideo, hasGeneratedVideo, onUseGeneratedVideoAsReference,
    wanReferenceImages, onWanReferenceImagesChange, referenceVideoFile, referenceVideoUrl, onReferenceVideoSelect,
    wan3InputMode, onWan3InputModeChange, wan3FirstFrame, onWan3FirstFrameSelect, wan3LastFrame, onWan3LastFrameSelect,
    wan3ReferenceImages, onWan3ReferenceImagesChange, wan3ReferenceVideoFiles, onWan3ReferenceVideosChange,
    wan3ReferenceVideoDuration, wan3ReferenceAudioFiles, onWan3ReferenceAudiosChange, wan3ReferenceAudioDuration,
    wan3ReferenceFile, onWan3ReferenceFileChange, wan3ReferenceLink, onWan3ReferenceLinkChange,
    seedanceInputMode, onSeedanceInputModeChange,
    seedanceFirstFrame, onSeedanceFirstFrameSelect, seedanceLastFrame, onSeedanceLastFrameSelect,
    seedanceReferenceImages, onSeedanceReferenceImagesChange,
    seedanceReferenceVideoFiles, seedanceReferenceVideoUrl, onSeedanceReferenceVideosChange, onSeedanceReferenceVideoUrlRemove,
    seedanceReferenceVideoDuration, seedanceReferenceAudioFiles, seedanceReferenceAudioDuration, onSeedanceReferenceAudiosChange,
  } = props;
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const latestPromptRef = useRef(prompt);

  /* --------------------------- video settings --------------------------- */
  const [wanDuration, setWanDuration] = useState<number>(storedVideoSettings.wanDuration ?? 5);
  const [wanResolution, setWanResolution] = useState<string>(storedVideoSettings.wanResolution ?? '1080p');
  const [wanRatio, setWanRatio] = useState<string>(storedVideoSettings.wanRatio ?? '16:9');
  const [wanAudio, setWanAudio] = useState(storedVideoSettings.wanAudio ?? true);
  const [wanMultiShots, setWanMultiShots] = useState(storedVideoSettings.wanMultiShots ?? false);
  const [wan3Variant, setWan3Variant] = useState<Wan3Variant>(storedVideoSettings.wan3Variant === 'prime' ? 'prime' : 'standard');
  const [wan3Duration, setWan3Duration] = useState(storedVideoSettings.wan3Duration ?? 5);
  const [wan3Resolution, setWan3Resolution] = useState(storedVideoSettings.wan3Resolution ?? '480P');
  const [wan3Ratio, setWan3Ratio] = useState(storedVideoSettings.wan3Ratio ?? 'adaptive');
  const [wan3Audio, setWan3Audio] = useState(storedVideoSettings.wan3Audio ?? true);
  const [wan3Seed, setWan3Seed] = useState<number | null>(Number.isInteger(storedVideoSettings.wan3Seed) ? storedVideoSettings.wan3Seed! : null);
  const [seedanceVariant, setSeedanceVariant] = useState<SeedanceVariant>(
    storedVideoSettings.seedanceVariant === 'v2_5' || storedVideoSettings.seedanceVariant === 'regular' || storedVideoSettings.seedanceVariant === 'fast' || storedVideoSettings.seedanceVariant === 'mini'
      ? storedVideoSettings.seedanceVariant
      : 'mini'
  );
  const [seedanceDuration, setSeedanceDuration] = useState(storedVideoSettings.seedanceDuration ?? 5);
  const [seedanceResolution, setSeedanceResolution] = useState(storedVideoSettings.seedanceResolution ?? '720p');
  const [seedanceRatio, setSeedanceRatio] = useState(storedVideoSettings.seedanceRatio ?? '16:9');
  const [seedanceGenerateAudio, setSeedanceGenerateAudio] = useState(storedVideoSettings.seedanceGenerateAudio ?? false);
  const [seedanceWebSearch, setSeedanceWebSearch] = useState(storedVideoSettings.seedanceWebSearch ?? false);
  const [seedanceReturnLastFrame, setSeedanceReturnLastFrame] = useState(storedVideoSettings.seedanceReturnLastFrame ?? false);
  const [seedanceOutputFormat, setSeedanceOutputFormat] = useState<SeedanceOutputFormat>(
    storedVideoSettings.seedanceOutputFormat === 'mov' ? 'mov' : 'mp4'
  );

  /* --------------------------- derived: image --------------------------- */
  const imageSupportsReferences = imageProviderSupportsReferences(imageOptions.provider);
  const imageWorkflow: ImageWorkflow = imageSupportsReferences && baseImage ? 'image-to-image' : 'text-to-image';
  const normalizedImage = normalizeImageGenerationOptions(imageOptions, imageWorkflow);
  const imageConfig = IMAGE_MODEL_CONFIGS[normalizedImage.provider];
  const imageResolutions = getImageModelResolutions(normalizedImage.provider, imageWorkflow, normalizedImage.seedreamTier);
  const activeImageModel = IMAGE_MODELS.find((model) =>
    model.provider === normalizedImage.provider
    && (model.provider !== 'seedream' || model.tier === normalizedImage.seedreamTier)
  ) ?? IMAGE_MODELS[1];
  const imageReferenceCount = imageSupportsReferences ? (baseImage ? 1 : 0) + (styleImage ? 1 : 0) : 0;

  /* --------------------------- derived: video --------------------------- */
  const hasWanVideoReference = Boolean(referenceVideoFile || referenceVideoUrl);
  const maxWanReferenceImages = getWanMaxReferenceImages(hasWanVideoReference);
  const wanUsesTextToVideo = wanReferenceImages.length === 0 && !hasWanVideoReference;
  const wanUsesReferenceToVideo = wanReferenceImages.length > 1 || hasWanVideoReference;
  const wanUsesSingleImage = !wanUsesTextToVideo && !wanUsesReferenceToVideo;
  const wanDurationOptions = wanUsesReferenceToVideo ? WAN_27_DURATIONS : WAN_26_DURATIONS;
  const hasSeedanceVideoReference = seedanceInputMode === 'references' && Boolean(seedanceReferenceVideoFiles.length > 0 || seedanceReferenceVideoUrl);
  const seedanceDurationLimits = SEEDANCE_DURATION_LIMITS[seedanceVariant];
  const seedanceReferenceLimits = getSeedanceReferenceLimits(seedanceVariant);
  const seedanceMediaDurationInvalid = seedanceInputMode === 'references' && (
    exceedsSeedanceMediaDurationLimit(seedanceReferenceVideoDuration, seedanceVariant)
    || exceedsSeedanceMediaDurationLimit(seedanceReferenceAudioDuration, seedanceVariant)
  );
  const wan3MediaDurationInvalid = wan3InputMode === 'references' && (
    (wan3ReferenceVideoDuration ?? 0) > WAN3_REFERENCE_LIMITS.mediaSeconds + 0.25
    || (wan3ReferenceAudioDuration ?? 0) > WAN3_REFERENCE_LIMITS.mediaSeconds + 0.25
    || ((wan3ReferenceVideoDuration ?? 0) > 0 && (wan3ReferenceVideoDuration ?? 0) + (wan3Duration === -1 ? 30 : clampWan3Duration(wan3Duration)) > 30.25)
  );
  const activeVideoModel = VIDEO_MODELS.find((model) =>
    model.provider === videoProvider
    && (model.provider !== 'seedance' || model.seedanceVariant === seedanceVariant)
    && (model.provider !== 'wan3' || model.wan3Variant === wan3Variant)
  ) ?? VIDEO_MODELS[0];

  const videoReferenceCount = videoProvider === 'wan3'
    ? wan3InputMode === 'frames'
      ? (wan3FirstFrame ? 1 : 0) + (wan3LastFrame ? 1 : 0)
      : wan3InputMode === 'references'
        ? wan3ReferenceImages.length + wan3ReferenceVideoFiles.length + wan3ReferenceAudioFiles.length
        : wan3InputMode === 'file' ? Number(Boolean(wan3ReferenceFile)) : Number(Boolean(wan3ReferenceLink.trim()))
    : videoProvider === 'seedance'
    ? seedanceInputMode === 'frames'
      ? (seedanceFirstFrame ? 1 : 0) + (seedanceLastFrame ? 1 : 0)
      : seedanceReferenceImages.length + seedanceReferenceVideoFiles.length + (seedanceReferenceVideoUrl ? 1 : 0) + seedanceReferenceAudioFiles.length
    : wanReferenceImages.length + (hasWanVideoReference ? 1 : 0);

  /* Effective (clamped-at-read) values. Stored preferences are never mutated
     by these clamps, so switching models and back restores what you had. */
  const seedanceResolutionOptions = SEEDANCE_RESOLUTIONS[seedanceVariant];
  const effectiveSeedanceResolution = seedanceResolutionOptions.includes(seedanceResolution)
    ? seedanceResolution
    : seedanceResolutionOptions[seedanceResolutionOptions.length - 1];
  const effectiveSeedanceRatio = SEEDANCE_RATIOS[seedanceVariant].includes(seedanceRatio)
    ? seedanceRatio
    : seedanceVariant === 'v2_5' ? 'adaptive' : '16:9';
  const effectiveSeedanceDuration = clampSeedanceDuration(seedanceVariant, seedanceDuration);
  const effectiveWanDuration = wanUsesReferenceToVideo && wanDuration > 10 ? 10 : wanDuration;
  const effectiveWan3Duration = clampWan3Duration(wan3Duration);

  const wanCreditCost = useMemo(() => getWanCreditCost(effectiveWanDuration, wanResolution), [effectiveWanDuration, wanResolution]);
  const seedanceCreditCost = useMemo(
    () => getSeedanceCreditCost(seedanceVariant, effectiveSeedanceResolution, effectiveSeedanceDuration, hasSeedanceVideoReference, seedanceReferenceVideoDuration),
    [seedanceVariant, effectiveSeedanceResolution, effectiveSeedanceDuration, hasSeedanceVideoReference, seedanceReferenceVideoDuration]
  );
  const wan3CreditCost = useMemo(
    () => getWan3CreditCost(wan3Variant, wan3Resolution, effectiveWan3Duration),
    [wan3Variant, wan3Resolution, effectiveWan3Duration]
  );
  const videoCreditCost = videoProvider === 'wan3' ? wan3CreditCost : videoProvider === 'seedance' ? seedanceCreditCost : wanCreditCost;

  /* Persist video settings whenever the user changes them */
  useEffect(() => {
    const snapshot: StoredVideoSettings = {
      wanDuration, wanResolution, wanRatio, wanAudio, wanMultiShots,
      wan3Variant, wan3Duration, wan3Resolution, wan3Ratio, wan3Audio, wan3Seed,
      seedanceVariant, seedanceDuration, seedanceResolution, seedanceRatio,
      seedanceGenerateAudio, seedanceWebSearch, seedanceReturnLastFrame, seedanceOutputFormat,
    };
    Object.assign(storedVideoSettings, snapshot);
    try {
      localStorage.setItem(VIDEO_SETTINGS_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage unavailable — settings simply won't persist across reloads.
    }
  }, [
    wanDuration, wanResolution, wanRatio, wanAudio, wanMultiShots,
    wan3Variant, wan3Duration, wan3Resolution, wan3Ratio, wan3Audio, wan3Seed,
    seedanceVariant, seedanceDuration, seedanceResolution, seedanceRatio,
    seedanceGenerateAudio, seedanceWebSearch, seedanceReturnLastFrame, seedanceOutputFormat,
  ]);

  useEffect(() => {
    if (seedanceReferenceImages.length > seedanceReferenceLimits.images) {
      onSeedanceReferenceImagesChange(seedanceReferenceImages.slice(0, seedanceReferenceLimits.images));
    }
    const maxUploadedVideos = Math.max(0, seedanceReferenceLimits.videos - (seedanceReferenceVideoUrl ? 1 : 0));
    if (seedanceReferenceVideoFiles.length > maxUploadedVideos) {
      onSeedanceReferenceVideosChange(seedanceReferenceVideoFiles.slice(0, maxUploadedVideos));
    }
    if (seedanceReferenceAudioFiles.length > seedanceReferenceLimits.audios) {
      onSeedanceReferenceAudiosChange(seedanceReferenceAudioFiles.slice(0, seedanceReferenceLimits.audios));
    }
  }, [
    onSeedanceReferenceAudiosChange,
    onSeedanceReferenceImagesChange,
    onSeedanceReferenceVideosChange,
    seedanceReferenceAudioFiles,
    seedanceReferenceImages,
    seedanceReferenceLimits,
    seedanceReferenceVideoFiles,
    seedanceReferenceVideoUrl,
  ]);

  useEffect(() => {
    latestPromptRef.current = prompt;
  }, [prompt]);

  /* --------------------------- handlers --------------------------- */
  const updateImageOptions = (partial: Partial<ImageGenerationOptions>) => {
    // Merge onto the raw stored options (not the workflow-clamped view) so a
    // temporary clamp never overwrites the user's saved preference.
    onImageOptionsChange({ ...imageOptions, ...partial });
  };

  const handleGenerate = () => {
    const trimmed = getSubmittedPrompt(promptInputRef.current?.value, latestPromptRef.current);
    if (mode === 'image') {
      if (!trimmed) return;
      onGenerateImage(trimmed);
      return;
    }
    if (!trimmed) return;
    if (videoProvider === 'wan3') {
      onGenerateVideo({
        provider: 'wan3',
        prompt: trimmed,
        duration: effectiveWan3Duration,
        resolution: wan3Resolution,
        ratio: wan3Ratio,
        wan3Variant,
        wan3InputMode,
        wan3Audio,
        wan3Seed,
      });
    } else if (videoProvider === 'seedance') {
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
        seedanceReturnLastFrame,
        seedanceOutputFormat,
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
    || generationQueueCount >= generationQueueLimit
    || !prompt.trim()
    || (mode === 'video' && videoProvider === 'wan3' && wan3InputMode === 'frames' && !wan3FirstFrame)
    || (mode === 'video' && videoProvider === 'wan3' && wan3InputMode === 'file' && !wan3ReferenceFile)
    || (mode === 'video' && videoProvider === 'wan3' && wan3InputMode === 'link' && !/^https?:\/\//i.test(wan3ReferenceLink.trim()))
    || (mode === 'video' && videoProvider === 'wan3' && wan3MediaDurationInvalid)
    || (mode === 'video' && videoProvider === 'seedance' && seedanceInputMode === 'frames' && !seedanceFirstFrame)
    || (mode === 'video' && videoProvider === 'seedance' && seedanceMediaDurationInvalid)
    || (mode === 'image' && imageSupportsReferences && retouchActive && !hasHotspot);

  const placeholder = mode === 'video'
    ? 'Describe the motion, camera movement, and style of your video…'
    : imageSupportsReferences && retouchActive
      ? hasHotspot
        ? 'Describe the edit for the selected point…'
        : 'Tap a point on the image above, then describe the edit…'
      : imageSupportsReferences && baseImage && styleImage
        ? 'Describe how to combine the two images…'
        : imageSupportsReferences && baseImage
          ? 'Describe how to transform this image…'
          : 'Describe the image you want to create…';

  const creditCost = mode === 'video' ? videoCreditCost : imageCreditCost;

  const showWanRatio = videoProvider === 'wan' && !wanUsesSingleImage;
  const showImageOptionsPill = normalizedImage.provider === 'seedream' || (imageSupportsReferences && Boolean(baseImage));
  const showWanOptionsPill = wanUsesSingleImage || !wanUsesReferenceToVideo;

  /* ------------------------------------------------------------------ */
  return (
    <section className="studio-composer glass-panel edge flex w-full flex-col gap-2.5 rounded-3xl p-3 sm:p-4" aria-label="Prompt composer">
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
        ref={promptInputRef}
        value={prompt}
        onChange={(event) => {
          latestPromptRef.current = event.target.value;
          onPromptChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !generateDisabled) {
            event.preventDefault();
            handleGenerate();
          }
        }}
        placeholder={placeholder}
        rows={3}
        maxLength={mode === 'image' && normalizedImage.provider === 'zimage'
          ? 1000
          : mode === 'video' && videoProvider === 'wan3'
            ? 20000
          : mode === 'video' && videoProvider === 'seedance' && seedanceVariant === 'v2_5'
            ? 30000
            : 5000}
        disabled={isLoading}
        className="composer-prompt-input max-h-64 min-h-24 w-full resize-none bg-transparent px-1.5 py-1 text-base leading-relaxed text-gray-100 placeholder:text-gray-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-28"
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
                        if (model.provider === 'seedance' && model.seedanceVariant) setSeedanceVariant(model.seedanceVariant);
                        if (model.provider === 'wan3' && model.wan3Variant) setWan3Variant(model.wan3Variant);
                        close();
                      }}
                    />
                  ))}
            </div>
          )}
        </Dropdown>

        {/* Aspect ratio */}
        {(mode === 'image' || showWanRatio || videoProvider === 'seedance' || videoProvider === 'wan3') && (
          <Dropdown
            label={mode === 'image' ? normalizedImage.aspectRatio === 'auto' ? 'Auto' : normalizedImage.aspectRatio : videoProvider === 'wan3' ? wan3Ratio : videoProvider === 'seedance' ? effectiveSeedanceRatio : wanRatio}
            icon={<RatioGlyph ratio={mode === 'image' ? normalizedImage.aspectRatio : videoProvider === 'wan3' ? wan3Ratio : videoProvider === 'seedance' ? effectiveSeedanceRatio : wanRatio} />}
            title="Aspect ratio"
            disabled={isLoading}
            panelWidthClassName="sm:w-56"
          >
            {(close) => (
              <div className="flex flex-col gap-0.5">
                <PanelHeading>Aspect ratio</PanelHeading>
                {(mode === 'image'
                  ? imageConfig.aspectRatios.map((ratio) => ({ value: ratio.value, label: ratio.label }))
                  : (videoProvider === 'wan3' ? [...WAN3_RATIOS] : videoProvider === 'seedance' ? SEEDANCE_RATIOS[seedanceVariant] : [...WAN_RATIOS]).map((ratio) => ({ value: ratio, label: ratio }))
                ).map((ratio) => {
                  const selected = mode === 'image'
                    ? normalizedImage.aspectRatio === ratio.value
                    : videoProvider === 'wan3' ? wan3Ratio === ratio.value : videoProvider === 'seedance' ? effectiveSeedanceRatio === ratio.value : wanRatio === ratio.value;
                  return (
                    <OptionRow
                      key={ratio.value}
                      selected={selected}
                      label={ratio.label === 'auto' || ratio.label === 'adaptive' ? ratio.label.charAt(0).toUpperCase() + ratio.label.slice(1) : ratio.label}
                      leading={<RatioGlyph ratio={ratio.value} />}
                      onSelect={() => {
                        if (mode === 'image') updateImageOptions({ aspectRatio: ratio.value });
                        else if (videoProvider === 'wan3') setWan3Ratio(ratio.value);
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
        {(mode !== 'image' || normalizedImage.provider !== 'zimage') && (
          <Dropdown
            label={mode === 'image' ? normalizedImage.resolution : videoProvider === 'wan3' ? wan3Resolution : videoProvider === 'seedance' ? effectiveSeedanceResolution : wanResolution}
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
                  : (videoProvider === 'wan3' ? [...WAN3_RESOLUTIONS] : videoProvider === 'seedance' ? SEEDANCE_RESOLUTIONS[seedanceVariant] : [...WAN_RESOLUTIONS]).map((resolution) => (
                      <OptionRow
                        key={resolution}
                        selected={videoProvider === 'wan3' ? wan3Resolution === resolution : videoProvider === 'seedance' ? effectiveSeedanceResolution === resolution : wanResolution === resolution}
                        label={resolution}
                        trailing={videoProvider === 'wan3'
                          ? `${getWan3CreditCost(wan3Variant, resolution, effectiveWan3Duration)} cr`
                          : videoProvider === 'wan'
                          ? `${getWanCreditCost(effectiveWanDuration, resolution)} cr`
                          : `${getSeedanceCreditCost(seedanceVariant, resolution, effectiveSeedanceDuration, hasSeedanceVideoReference, seedanceReferenceVideoDuration)} cr`}
                        onSelect={() => {
                          if (videoProvider === 'wan3') setWan3Resolution(resolution);
                          else if (videoProvider === 'seedance') setSeedanceResolution(resolution);
                          else setWanResolution(resolution);
                          close();
                        }}
                      />
                    ))}
              </div>
            )}
          </Dropdown>
        )}

        {/* Duration (video only) */}
        {mode === 'video' && (
          <Dropdown
            label={(videoProvider === 'seedance' && effectiveSeedanceDuration === -1) || (videoProvider === 'wan3' && effectiveWan3Duration === -1)
              ? 'Auto'
              : `${videoProvider === 'wan3' ? effectiveWan3Duration : videoProvider === 'seedance' ? effectiveSeedanceDuration : effectiveWanDuration}s`}
            title="Duration"
            disabled={isLoading}
            panelWidthClassName="sm:w-60"
          >
            {(close) => (
              <div className="flex flex-col gap-0.5">
                <PanelHeading>Duration</PanelHeading>
                {videoProvider === 'wan3' ? (
                  <>
                    <OptionRow selected={effectiveWan3Duration === -1} label="Automatic" sublabel="Model chooses the length, up to 30 seconds" onSelect={() => { setWan3Duration(-1); close(); }} />
                    <StepperRow
                      label="Exact length"
                      value={effectiveWan3Duration === -1 ? WAN3_DURATION_LIMITS.defaultValue : effectiveWan3Duration}
                      min={WAN3_DURATION_LIMITS.min}
                      max={WAN3_DURATION_LIMITS.max}
                      onChange={setWan3Duration}
                      disabled={isLoading}
                    />
                    <p className="px-3 pb-1.5 text-[11px] text-gray-500">
                      {effectiveWan3Duration === -1 ? 'Up to 30s' : `${effectiveWan3Duration}s`} at {wan3Resolution} · <span className="font-semibold text-gray-300">{effectiveWan3Duration === -1 ? 'up to ' : ''}{wan3CreditCost} cr</span>
                    </p>
                  </>
                ) : videoProvider === 'seedance' ? (
                  <>
                    {seedanceVariant === 'v2_5' && (
                      <OptionRow
                        selected={effectiveSeedanceDuration === -1}
                        label="Automatic"
                        sublabel="Model chooses 4–30 seconds"
                        onSelect={() => { setSeedanceDuration(-1); close(); }}
                      />
                    )}
                    <StepperRow
                      label={seedanceVariant === 'v2_5' ? 'Exact length' : 'Length'}
                      value={effectiveSeedanceDuration === -1 ? seedanceDurationLimits.defaultValue : effectiveSeedanceDuration}
                      min={seedanceDurationLimits.min}
                      max={seedanceDurationLimits.max}
                      onChange={setSeedanceDuration}
                      disabled={isLoading}
                    />
                    {effectiveSeedanceDuration === -1 ? (
                      <p className="px-3 pb-1.5 text-[11px] text-gray-500">
                        Up to 30s at {effectiveSeedanceResolution} · <span className="font-semibold text-gray-300">up to {seedanceCreditCost} cr</span>
                      </p>
                    ) : (
                    <p className="px-3 pb-1.5 text-[11px] text-gray-500">
                      {effectiveSeedanceDuration}s at {effectiveSeedanceResolution} · <span className="font-semibold text-gray-300">{seedanceCreditCost} cr</span>
                    </p>
                    )}
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
          allowMobileBackgroundInteraction
        >
          <div className="flex flex-col gap-3 p-1.5">
            {mode === 'image' && !imageSupportsReferences ? (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 text-sm leading-relaxed text-gray-400">
                Image references are not available with this model.
              </p>
            ) : mode === 'image' ? (
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
            ) : videoProvider === 'wan3' ? (
              <>
                <SegmentedControl<Wan3InputMode>
                  value={wan3InputMode}
                  onChange={onWan3InputModeChange}
                  disabled={isLoading}
                  size="sm"
                  ariaLabel="Wan 3.0 input mode"
                  options={[
                    { value: 'references', label: 'References' },
                    { value: 'frames', label: 'Start / end' },
                    { value: 'file', label: 'File' },
                    { value: 'link', label: 'Link' },
                  ]}
                />
                {wan3InputMode === 'frames' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <ImageSlot
                      file={wan3FirstFrame}
                      label="Start frame"
                      helper="Exact first frame"
                      disabled={isLoading}
                      pastePriority={wan3FirstFrame ? 1 : 0}
                      onChange={(file) => { onWan3FirstFrameSelect(file); if (!file && wan3LastFrame) onWan3LastFrameSelect(null); }}
                    />
                    <ImageSlot
                      file={wan3LastFrame}
                      label="End frame"
                      helper={wan3FirstFrame ? 'Optional final frame' : 'Add a start frame first'}
                      disabled={isLoading || !wan3FirstFrame}
                      pastePriority={wan3FirstFrame ? 0 : 2}
                      onChange={onWan3LastFrameSelect}
                    />
                  </div>
                ) : wan3InputMode === 'references' ? (
                  <>
                    <ImageGrid files={wan3ReferenceImages} maxFiles={WAN3_REFERENCE_LIMITS.images} label="Reference images" helper="Use Image1, Image2, and so on in your prompt." disabled={isLoading} onChange={onWan3ReferenceImagesChange} />
                    <VideoGrid files={wan3ReferenceVideoFiles} maxFiles={WAN3_REFERENCE_LIMITS.videos} label="Reference videos" helper="MP4 or MOV · 15s total" accept="video/mp4,video/quicktime,.mp4,.mov" disabled={isLoading} onChange={onWan3ReferenceVideosChange} action={hasGeneratedVideo ? (
                      <button type="button" onClick={onUseGeneratedVideoAsReference} disabled={isLoading} className="text-[11px] font-semibold text-accent-300 transition hover:text-accent-200 disabled:opacity-50">Use generated</button>
                    ) : undefined} />
                    <AudioGrid files={wan3ReferenceAudioFiles} maxFiles={WAN3_REFERENCE_LIMITS.audios} helper="MP3 or WAV · 15s total" accept="audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" disabled={isLoading} onChange={onWan3ReferenceAudiosChange} />
                    {wan3MediaDurationInvalid && (
                      <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
                        Reference video and audio are limited to 15 seconds each, and reference video plus output must fit within 30 seconds.
                      </p>
                    )}
                    {videoReferenceCount === 0 && <p className="px-1 text-[11px] text-gray-600">No references creates a text-to-video clip.</p>}
                  </>
                ) : wan3InputMode === 'file' ? (
                  <ReferenceFileSlot file={wan3ReferenceFile} disabled={isLoading} onChange={onWan3ReferenceFileChange} />
                ) : (
                  <label className="flex flex-col gap-1.5">
                    <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Public webpage</span>
                    <input
                      type="url"
                      value={wan3ReferenceLink}
                      onChange={(event) => onWan3ReferenceLinkChange(event.target.value)}
                      placeholder="https://example.com/article"
                      disabled={isLoading}
                      className="edge rounded-xl bg-white/[0.04] px-3 py-3 text-sm text-gray-200 outline-none placeholder:text-gray-600 focus:ring-2 focus:ring-accent-400/35"
                    />
                    <span className="px-1 text-[11px] text-gray-600">Must be public and available without signing in.</span>
                  </label>
                )}
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
                      maxFiles={seedanceReferenceLimits.images}
                      label="Style & character images"
                      helper="Image roles are guided by your prompt."
                      disabled={isLoading}
                      onChange={onSeedanceReferenceImagesChange}
                    />
                    <VideoGrid
                      files={seedanceReferenceVideoFiles}
                      url={seedanceReferenceVideoUrl}
                      maxFiles={seedanceReferenceLimits.videos}
                      label="Reference videos"
                      helper={`Up to ${seedanceReferenceLimits.mediaSeconds}s total`}
                      accept={seedanceVariant === 'v2_5' ? 'video/mp4,video/quicktime,video/x-matroska,.mp4,.mov,.mkv' : 'video/mp4,video/quicktime,.mp4,.mov'}
                      disabled={isLoading}
                      onChange={onSeedanceReferenceVideosChange}
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
                    <AudioGrid
                      files={seedanceReferenceAudioFiles}
                      maxFiles={seedanceReferenceLimits.audios}
                      helper={`Up to ${seedanceReferenceLimits.mediaSeconds}s total`}
                      accept={seedanceVariant === 'v2_5' ? 'audio/mpeg,audio/wav,audio/x-wav,audio/aac,audio/mp4,audio/ogg,.mp3,.wav,.aac,.m4a,.ogg' : 'audio/mpeg,audio/wav,.mp3,.wav'}
                      disabled={isLoading}
                      onChange={onSeedanceReferenceAudiosChange}
                    />
                    {seedanceMediaDurationInvalid && (
                      <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
                        Reference video and audio must each total {seedanceReferenceLimits.mediaSeconds} seconds or less.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </Dropdown>

        {/* Options */}
        {((mode === 'image' && showImageOptionsPill) || (mode === 'video' && (videoProvider === 'wan3' || videoProvider === 'seedance' || showWanOptionsPill))) && (
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
                ) : videoProvider === 'wan3' ? (
                  <>
                    <PanelHeading>Wan 3.0 options</PanelHeading>
                    <ToggleRow label="Generate audio" description="Create synchronized audio" checked={wan3Audio} onChange={setWan3Audio} disabled={isLoading} />
                    <div className="px-3 py-2">
                      <label className="mb-1 block text-xs font-medium text-gray-300" htmlFor="wan3-seed">Seed (optional)</label>
                      <input
                        id="wan3-seed"
                        type="number"
                        min={0}
                        step={1}
                        value={wan3Seed ?? ''}
                        onChange={(event) => setWan3Seed(event.target.value === '' ? null : Math.max(0, Math.round(Number(event.target.value))))}
                        placeholder="Random"
                        disabled={isLoading}
                        className="edge w-full rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-gray-200 outline-none placeholder:text-gray-600 focus:ring-2 focus:ring-accent-400/35"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <PanelHeading>Seedance options</PanelHeading>
                    {seedanceVariant === 'v2_5' && (
                      <>
                        <PanelHeading>Output format</PanelHeading>
                        {(['mp4', 'mov'] as SeedanceOutputFormat[]).map((format) => (
                          <OptionRow
                            key={format}
                            selected={seedanceOutputFormat === format}
                            label={format.toUpperCase()}
                            sublabel={format === 'mov' ? 'Editing-friendly container' : 'Most compatible'}
                            onSelect={() => { setSeedanceOutputFormat(format); close(); }}
                          />
                        ))}
                        <PanelHeading>Generation</PanelHeading>
                      </>
                    )}
                    <ToggleRow
                      label="Generate audio"
                      description="Synchronized AI audio when supported"
                      checked={seedanceGenerateAudio}
                      onChange={setSeedanceGenerateAudio}
                      disabled={isLoading}
                    />
                    {seedanceVariant === 'v2_5' && (
                      <ToggleRow
                        label="Return last frame"
                        description="Include a final-frame image for chaining"
                        checked={seedanceReturnLastFrame}
                        onChange={setSeedanceReturnLastFrame}
                        disabled={isLoading}
                      />
                    )}
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

        {generationQueueCount > 0 && (
          <span className="text-[11px] font-medium text-gray-400" role="status" aria-live="polite">
            {generationQueueCount === 1
              ? '1 generation active'
              : `${generationQueueCount} generations active or queued`}
          </span>
        )}

        {/* Generate / queue — same row as the pills, pinned right */}
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
              {generationQueueCount > 0 ? 'Add to queue' : 'Generate'}
              <span className="text-[12px] font-medium opacity-60">{formatCreditAmount(creditCost)} cr</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
};

export default Composer;
