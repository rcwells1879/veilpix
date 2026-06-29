/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useMemo, useState } from 'react';
import { VideoIcon } from './icons';

type VideoProvider = 'wan' | 'seedance';
type SeedanceVariant = 'regular' | 'fast' | 'mini';

interface VideoGenerateOptions {
  provider: VideoProvider;
  prompt: string;
  duration: number;
  resolution: string;
  ratio: string;
  wanAudio?: boolean;
  wanMultiShots?: boolean;
  seedanceVariant?: SeedanceVariant;
  seedanceGenerateAudio?: boolean;
  seedanceWebSearch?: boolean;
}

interface VideoControlsPanelProps {
  isLoading: boolean;
  onGenerate: (options: VideoGenerateOptions) => void;
  videoProvider: VideoProvider;
  onVideoProviderChange: (provider: VideoProvider) => void;
  videoUrl?: string | null;
  videoError?: string | null;
  referenceImage?: File | null;
  wanReferenceImages?: File[];
  referenceVideoFile?: File | null;
  referenceVideoUrl?: string | null;
  referenceVideoDuration?: number | null;
  seedanceReferenceImages: File[];
  seedanceReferenceVideoFile?: File | null;
  seedanceReferenceVideoUrl?: string | null;
  seedanceReferenceVideoDuration?: number | null;
  seedanceReferenceAudioFile?: File | null;
  onReferenceImageSelect?: (file: File | null) => void;
  onWanReferenceImagesChange?: (files: File[]) => void;
  onReferenceVideoSelect?: (file: File | null) => void;
  onSeedanceReferenceImagesChange: (files: File[]) => void;
  onSeedanceReferenceVideoSelect: (file: File | null) => void;
  onSeedanceReferenceVideoUrlRemove: () => void;
  onSeedanceReferenceAudioSelect: (file: File | null) => void;
  onUseGeneratedVideoAsReference?: () => void;
}

const WAN_26_DURATIONS = [5, 10, 15] as const;
const WAN_27_DURATIONS = [5, 10] as const;
const WAN_RESOLUTIONS = ['720p', '1080p'] as const;
const WAN_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const;
const SEEDANCE_VARIANTS: SeedanceVariant[] = ['regular', 'fast', 'mini'];
const SEEDANCE_RATIOS: Record<SeedanceVariant, string[]> = {
  regular: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
  fast: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
  mini: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
};
const SEEDANCE_RESOLUTIONS: Record<SeedanceVariant, string[]> = {
  regular: ['480p', '720p', '1080p'],
  fast: ['480p', '720p'],
  mini: ['480p', '720p'],
};
const SEEDANCE_DURATION_LIMITS: Record<SeedanceVariant, { min: number; max: number; defaultValue: number }> = {
  regular: { min: 4, max: 15, defaultValue: 5 },
  fast: { min: 4, max: 15, defaultValue: 5 },
  mini: { min: 4, max: 15, defaultValue: 5 },
};

const WAN_VIDEO_CREDIT_TABLE: Record<number, Record<string, number>> = {
  5:  { '720p': 7,  '1080p': 10 },
  10: { '720p': 13, '1080p': 19 },
  15: { '720p': 19, '1080p': 29 },
};

const SEEDANCE_PRICING: Record<SeedanceVariant, Record<string, { noVideo: number; withVideo: number }>> = {
  fast: {
    '480p': { noVideo: 15.5, withVideo: 9 },
    '720p': { noVideo: 33, withVideo: 20 },
  },
  mini: {
    '480p': { noVideo: 9.5, withVideo: 6 },
    '720p': { noVideo: 20.5, withVideo: 12.5 },
  },
  regular: {
    '480p': { noVideo: 19, withVideo: 11.5 },
    '720p': { noVideo: 41, withVideo: 25 },
    '1080p': { noVideo: 102, withVideo: 62 },
  },
};

const KIE_CREDIT_USD = 0.005;
const BILLABLE_USD_PER_VEILPIX_CREDIT = 0.0699 * 0.88;

function getWanCreditCost(duration: number, resolution: string): number {
  return WAN_VIDEO_CREDIT_TABLE[duration]?.[resolution] ?? Math.ceil(duration * (resolution === '1080p' ? 2.0 : 1.4));
}

function clampSeedanceDuration(variant: SeedanceVariant, duration: number): number {
  const limits = SEEDANCE_DURATION_LIMITS[variant];
  if (!Number.isFinite(duration)) return limits.defaultValue;
  return Math.max(limits.min, Math.min(limits.max, Math.round(duration)));
}

function getSeedanceCreditCost(
  variant: SeedanceVariant,
  resolution: string,
  duration: number,
  hasVideoReference: boolean,
  referenceVideoDuration?: number | null
): number {
  const pricing = SEEDANCE_PRICING[variant][resolution] ?? SEEDANCE_PRICING[variant][SEEDANCE_RESOLUTIONS[variant][0]];
  const outputSeconds = clampSeedanceDuration(variant, duration);
  const inputSeconds = hasVideoReference
    ? Math.max(0, Math.min(SEEDANCE_DURATION_LIMITS[variant].max, Math.round(referenceVideoDuration ?? SEEDANCE_DURATION_LIMITS[variant].max)))
    : 0;
  const rate = hasVideoReference ? pricing.withVideo : pricing.noVideo;
  const kieCredits = Math.ceil(rate * (outputSeconds + inputSeconds));
  return Math.max(1, Math.ceil((kieCredits * KIE_CREDIT_USD) / BILLABLE_USD_PER_VEILPIX_CREDIT));
}

function getWanMaxReferenceImages(hasVideoReference: boolean): number {
  return hasVideoReference ? 4 : 5;
}

function FileImagePreview({ file, className }: { file: File; className: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return null;
  return <img src={url} alt={file.name} className={className} />;
}

const VideoControlsPanel: React.FC<VideoControlsPanelProps> = ({
  isLoading,
  onGenerate,
  videoProvider,
  onVideoProviderChange,
  videoUrl,
  videoError,
  referenceImage,
  wanReferenceImages,
  referenceVideoFile,
  referenceVideoUrl,
  referenceVideoDuration,
  seedanceReferenceImages,
  seedanceReferenceVideoFile,
  seedanceReferenceVideoUrl,
  seedanceReferenceVideoDuration,
  seedanceReferenceAudioFile,
  onReferenceImageSelect,
  onWanReferenceImagesChange,
  onReferenceVideoSelect,
  onSeedanceReferenceImagesChange,
  onSeedanceReferenceVideoSelect,
  onSeedanceReferenceVideoUrlRemove,
  onSeedanceReferenceAudioSelect,
  onUseGeneratedVideoAsReference,
}) => {
  const [videoPrompt, setVideoPrompt] = useState('');
  const [wanDuration, setWanDuration] = useState<number>(5);
  const [wanResolution, setWanResolution] = useState<string>('1080p');
  const [wanRatio, setWanRatio] = useState<string>('16:9');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [multiShotsEnabled, setMultiShotsEnabled] = useState(false);
  const [seedanceVariant, setSeedanceVariant] = useState<SeedanceVariant>('regular');
  const [seedanceDuration, setSeedanceDuration] = useState(5);
  const [seedanceResolution, setSeedanceResolution] = useState('720p');
  const [seedanceRatio, setSeedanceRatio] = useState('16:9');
  const [seedanceGenerateAudio, setSeedanceGenerateAudio] = useState(false);
  const [seedanceWebSearch, setSeedanceWebSearch] = useState(false);
  const [referenceVideoPreviewUrl, setReferenceVideoPreviewUrl] = useState<string | null>(null);
  const [seedanceVideoPreviewUrl, setSeedanceVideoPreviewUrl] = useState<string | null>(null);

  const hasSeedanceVideoReference = Boolean(seedanceReferenceVideoFile || seedanceReferenceVideoUrl);
  const displayedReferenceVideoUrl = referenceVideoPreviewUrl || referenceVideoUrl;
  const displayedSeedanceVideoUrl = seedanceVideoPreviewUrl || seedanceReferenceVideoUrl;
  const activeWanReferenceImages = wanReferenceImages ?? (referenceImage ? [referenceImage] : []);
  const hasWanVideoReference = Boolean(referenceVideoFile || referenceVideoUrl);
  const maxWanReferenceImages = getWanMaxReferenceImages(hasWanVideoReference);
  const canAddWanReferenceImages = Boolean(onWanReferenceImagesChange || onReferenceImageSelect);
  const wanUsesTextToVideo = activeWanReferenceImages.length === 0 && !hasWanVideoReference;
  const wanUsesReferenceToVideo = activeWanReferenceImages.length > 1 || hasWanVideoReference;
  const wanSupportsAudioToggle = !wanUsesTextToVideo && !wanUsesReferenceToVideo;
  const wanSupportsMultiShotToggle = !wanUsesReferenceToVideo;
  const wanDurationOptions = wanUsesReferenceToVideo ? WAN_27_DURATIONS : WAN_26_DURATIONS;
  const seedanceDurationLimits = SEEDANCE_DURATION_LIMITS[seedanceVariant];
  const seedanceRatioOptions = SEEDANCE_RATIOS[seedanceVariant];

  const wanCreditCost = useMemo(() => getWanCreditCost(wanDuration, wanResolution), [wanDuration, wanResolution]);
  const seedanceCreditCost = useMemo(() => getSeedanceCreditCost(
    seedanceVariant,
    seedanceResolution,
    seedanceDuration,
    hasSeedanceVideoReference,
    seedanceReferenceVideoDuration
  ), [hasSeedanceVideoReference, seedanceDuration, seedanceReferenceVideoDuration, seedanceResolution, seedanceVariant]);

  useEffect(() => {
    if (!SEEDANCE_RESOLUTIONS[seedanceVariant].includes(seedanceResolution)) {
      setSeedanceResolution(SEEDANCE_RESOLUTIONS[seedanceVariant][SEEDANCE_RESOLUTIONS[seedanceVariant].length - 1]);
    }
  }, [seedanceResolution, seedanceVariant]);

  useEffect(() => {
    if (!seedanceRatioOptions.includes(seedanceRatio)) {
      setSeedanceRatio('16:9');
    }
  }, [seedanceRatio, seedanceRatioOptions]);

  useEffect(() => {
    const clampedDuration = clampSeedanceDuration(seedanceVariant, seedanceDuration);
    if (clampedDuration !== seedanceDuration) {
      setSeedanceDuration(clampedDuration);
    }
  }, [seedanceDuration, seedanceVariant]);

  useEffect(() => {
    if (!referenceVideoFile) {
      setReferenceVideoPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(referenceVideoFile);
    setReferenceVideoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [referenceVideoFile]);

  useEffect(() => {
    if (!seedanceReferenceVideoFile) {
      setSeedanceVideoPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(seedanceReferenceVideoFile);
    setSeedanceVideoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [seedanceReferenceVideoFile]);

  useEffect(() => {
    if (videoProvider === 'wan' && onWanReferenceImagesChange && activeWanReferenceImages.length > maxWanReferenceImages) {
      onWanReferenceImagesChange(activeWanReferenceImages.slice(0, maxWanReferenceImages));
    }
  }, [activeWanReferenceImages, maxWanReferenceImages, onWanReferenceImagesChange, videoProvider]);

  useEffect(() => {
    if (videoProvider === 'wan' && wanUsesReferenceToVideo && wanDuration > 10) {
      setWanDuration(10);
    }
  }, [videoProvider, wanDuration, wanUsesReferenceToVideo]);

  const handleGenerate = () => {
    const prompt = videoPrompt.trim();
    if (!prompt) return;

    if (videoProvider === 'seedance') {
      onGenerate({
        provider: 'seedance',
        prompt,
        duration: seedanceDuration,
        resolution: seedanceResolution,
        ratio: seedanceRatio,
        seedanceVariant,
        seedanceGenerateAudio,
        seedanceWebSearch,
      });
      return;
    }

    onGenerate({
      provider: 'wan',
      prompt,
      duration: wanDuration,
      resolution: wanResolution,
      ratio: wanRatio,
      wanAudio: audioEnabled,
      wanMultiShots: multiShotsEnabled,
    });
  };

  const handleSeedanceImagesInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = (Array.from(event.currentTarget.files ?? []) as File[]).filter((file) => file.type.startsWith('image/'));
    if (files.length > 0) {
      onSeedanceReferenceImagesChange([...seedanceReferenceImages, ...files].slice(0, 4));
    }
    event.currentTarget.value = '';
  };

  const handleWanImagesInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = (Array.from(event.currentTarget.files ?? []) as File[]).filter((file) => file.type.startsWith('image/'));
    if (files.length > 0) {
      if (onWanReferenceImagesChange) {
        onWanReferenceImagesChange([...activeWanReferenceImages, ...files].slice(0, maxWanReferenceImages));
      } else {
        onReferenceImageSelect?.(files[0]);
      }
    }
    event.currentTarget.value = '';
  };

  const activeCreditCost = videoProvider === 'seedance' ? seedanceCreditCost : wanCreditCost;
  const activeModelName = videoProvider === 'seedance'
    ? seedanceVariant === 'mini' ? 'Seedance 2.0 Mini' : seedanceVariant === 'fast' ? 'Seedance 2.0 Fast' : 'Seedance 2.0'
    : wanUsesTextToVideo ? 'Wan 2.6' : wanUsesReferenceToVideo ? 'Wan 2.7' : 'Wan 2.6 Flash';

  return (
    <div className="w-full flex flex-col gap-4 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <VideoIcon className="h-6 w-6 text-blue-400" />
          <h3 className="text-lg font-semibold text-gray-200">Video Generation</h3>
        </div>
        <div className="grid grid-cols-2 rounded-lg border border-white/10 bg-gray-900/60 p-1">
          <button
            type="button"
            onClick={() => onVideoProviderChange('wan')}
            className={`rounded-md px-4 py-2 text-sm font-bold transition ${
              videoProvider === 'wan'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                : 'text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
            disabled={isLoading}
          >
            Wan
          </button>
          <button
            type="button"
            onClick={() => onVideoProviderChange('seedance')}
            className={`rounded-md px-4 py-2 text-sm font-bold transition ${
              videoProvider === 'seedance'
                ? 'bg-[#E04F67] text-white shadow-lg shadow-[#E04F67]/25'
                : 'text-[#F3A2AF] hover:bg-[#E04F67]/15 hover:text-white'
            }`}
            disabled={isLoading}
          >
            Seedance <span className="ml-1 rounded bg-white/15 px-1.5 py-0.5 text-[10px] uppercase">New</span>
          </button>
        </div>
      </div>

      {videoError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm text-red-300">{videoError}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-gray-300">Describe your video</label>
        <textarea
          value={videoPrompt}
          onChange={(e) => setVideoPrompt(e.target.value)}
          placeholder="Describe the motion, action, camera movement, and style you want..."
          className={`w-full resize-none rounded-lg border border-gray-700 bg-gray-800 p-4 text-base text-gray-200 transition focus:outline-none focus:ring-2 ${
            videoProvider === 'seedance' ? 'focus:ring-[#E04F67]' : 'focus:ring-blue-500'
          }`}
          rows={3}
          disabled={isLoading}
          maxLength={5000}
        />
      </div>

      {videoProvider === 'wan' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="text-sm font-semibold text-gray-300">Reference Images</label>
            <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {activeWanReferenceImages.slice(0, maxWanReferenceImages).map((file, index) => (
                  <div key={`${file.name}-${file.lastModified}-${index}`} className="relative aspect-square overflow-hidden rounded-md bg-black/40">
                    <FileImagePreview file={file} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        if (onWanReferenceImagesChange) {
                          onWanReferenceImagesChange(activeWanReferenceImages.filter((_, imageIndex) => imageIndex !== index));
                        } else {
                          onReferenceImageSelect?.(null);
                        }
                      }}
                      disabled={isLoading}
                      className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-1 text-[10px] font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {canAddWanReferenceImages && activeWanReferenceImages.length < maxWanReferenceImages && (
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-blue-400/40 bg-blue-500/5 p-3 text-center transition hover:border-blue-400 hover:bg-blue-500/10">
                    <span className="text-sm font-bold text-blue-200">Add Image</span>
                    <span className="text-xs text-gray-500">{maxWanReferenceImages - activeWanReferenceImages.length} slots left</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={isLoading}
                      onChange={handleWanImagesInput}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-semibold text-gray-300">Reference Video</label>
              {videoUrl && onUseGeneratedVideoAsReference && (
                <button
                  type="button"
                  onClick={onUseGeneratedVideoAsReference}
                  disabled={isLoading}
                  className="rounded-md border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1.5 text-xs font-bold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-50"
                >
                  Use Generated
                </button>
              )}
            </div>
            {onReferenceVideoSelect && (
              <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
                {displayedReferenceVideoUrl ? (
                  <div className="flex flex-col gap-2">
                    <video src={displayedReferenceVideoUrl} controls className="max-h-40 w-full rounded bg-black object-contain" />
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-gray-400">
                        {referenceVideoFile ? referenceVideoFile.name : 'Album video reference'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onReferenceVideoSelect(null)}
                        disabled={isLoading}
                        className="text-sm font-semibold text-red-300 hover:text-red-200 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-600 py-6 text-center transition hover:border-blue-500 hover:bg-gray-700/30">
                    <VideoIcon className="h-7 w-7 text-blue-300" />
                    <span className="text-sm font-semibold text-gray-200">Add Video</span>
                    <span className="text-xs text-gray-500">Motion reference</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      disabled={isLoading}
                      onChange={(event) => onReferenceVideoSelect(event.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="text-sm font-semibold text-gray-300">Reference Images</label>
            <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {seedanceReferenceImages.map((file, index) => (
                  <div key={`${file.name}-${file.lastModified}-${index}`} className="relative aspect-square overflow-hidden rounded-md bg-black/40">
                    <FileImagePreview file={file} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => onSeedanceReferenceImagesChange(seedanceReferenceImages.filter((_, imageIndex) => imageIndex !== index))}
                      disabled={isLoading}
                      className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-1 text-[10px] font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {seedanceReferenceImages.length < 4 && (
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-[#E04F67]/40 bg-[#E04F67]/5 p-3 text-center transition hover:border-[#E04F67] hover:bg-[#E04F67]/10">
                    <span className="text-sm font-bold text-[#F3A2AF]">Add Image</span>
                    <span className="text-xs text-gray-500">{4 - seedanceReferenceImages.length} slots left</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={isLoading}
                      onChange={handleSeedanceImagesInput}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-300">Reference Video</label>
              <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
                {displayedSeedanceVideoUrl ? (
                  <div className="flex flex-col gap-2">
                    <video src={displayedSeedanceVideoUrl} controls className="max-h-40 w-full rounded bg-black object-contain" />
                    <button
                      type="button"
                      onClick={() => seedanceReferenceVideoFile ? onSeedanceReferenceVideoSelect(null) : onSeedanceReferenceVideoUrlRemove()}
                      disabled={isLoading}
                      className="text-sm font-semibold text-red-300 hover:text-red-200 disabled:opacity-50"
                    >
                      Remove Video
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-600 py-6 text-center transition hover:border-[#E04F67] hover:bg-[#E04F67]/10">
                    <VideoIcon className="h-7 w-7 text-[#F3A2AF]" />
                    <span className="text-sm font-semibold text-gray-200">Add Video</span>
                    <span className="text-xs text-gray-500">Up to 15s input</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      disabled={isLoading}
                      onChange={(event) => onSeedanceReferenceVideoSelect(event.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-300">Reference Audio</label>
              <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
                {seedanceReferenceAudioFile ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm text-gray-300">{seedanceReferenceAudioFile.name}</span>
                    <button
                      type="button"
                      onClick={() => onSeedanceReferenceAudioSelect(null)}
                      disabled={isLoading}
                      className="text-sm font-semibold text-red-300 hover:text-red-200 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-600 py-5 text-center transition hover:border-[#E04F67] hover:bg-[#E04F67]/10">
                    <span className="text-sm font-semibold text-gray-200">Add Audio</span>
                    <span className="text-xs text-gray-500">Music, voice, or rhythm guide</span>
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.aac,.m4a,.ogg"
                      className="hidden"
                      disabled={isLoading}
                      onChange={(event) => onSeedanceReferenceAudioSelect(event.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {videoProvider === 'wan' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-300">Duration</label>
            <div className="flex gap-2">
              {wanDurationOptions.map((duration) => (
                <button
                  key={duration}
                  type="button"
                  onClick={() => setWanDuration(duration)}
                  className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition ${
                    wanDuration === duration
                      ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg'
                      : 'border border-white/20 bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
                  }`}
                  disabled={isLoading}
                >
                  {duration}s
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-300">Resolution</label>
            <div className="flex gap-2">
              {WAN_RESOLUTIONS.map((resolution) => (
                <button
                  key={resolution}
                  type="button"
                  onClick={() => setWanResolution(resolution)}
                  className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition ${
                    wanResolution === resolution
                      ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg'
                      : 'border border-white/20 bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
                  }`}
                  disabled={isLoading}
                >
                  {resolution}
                </button>
              ))}
            </div>
          </div>

          {wanUsesReferenceToVideo && (
            <div className="flex flex-col gap-2 sm:col-span-2">
              <label className="text-sm font-semibold text-gray-300">Aspect Ratio</label>
              <div className="grid grid-cols-5 gap-2">
                {WAN_RATIOS.map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setWanRatio(ratio)}
                    className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                      wanRatio === ratio
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg'
                        : 'border border-white/20 bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
                    }`}
                    disabled={isLoading}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(wanSupportsAudioToggle || wanSupportsMultiShotToggle) && (
            <>
              {wanSupportsAudioToggle && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-gray-300">Audio</label>
                  <div className="flex gap-2">
                    {([true, false] as const).map((enabled) => (
                      <button
                        key={String(enabled)}
                        type="button"
                        onClick={() => setAudioEnabled(enabled)}
                        className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition ${
                          audioEnabled === enabled
                            ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg'
                            : 'border border-white/20 bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
                        }`}
                        disabled={isLoading}
                      >
                        {enabled ? 'On' : 'Off'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {wanSupportsMultiShotToggle && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-gray-300">Multi-Shot</label>
                  <div className="flex gap-2">
                    {([false, true] as const).map((enabled) => (
                      <button
                        key={String(enabled)}
                        type="button"
                        onClick={() => setMultiShotsEnabled(enabled)}
                        className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition ${
                          multiShotsEnabled === enabled
                            ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg'
                            : 'border border-white/20 bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
                        }`}
                        disabled={isLoading}
                      >
                        {enabled ? 'On' : 'Off'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-300">Seedance Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {SEEDANCE_VARIANTS.map((variant) => (
                <button
                  key={variant}
                  type="button"
                  onClick={() => setSeedanceVariant(variant)}
                  className={`rounded-md px-4 py-2.5 text-sm font-semibold capitalize transition ${
                    seedanceVariant === variant
                      ? 'bg-[#E04F67] text-white shadow-lg shadow-[#E04F67]/25'
                      : 'border border-[#E04F67]/25 bg-[#E04F67]/5 text-[#F3A2AF] hover:bg-[#E04F67]/15'
                  }`}
                  disabled={isLoading}
                >
                  {variant === 'regular' ? 'Regular' : variant === 'fast' ? 'Fast' : 'Mini'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-300">Duration</label>
            <input
              type="number"
              min={seedanceDurationLimits.min}
              max={seedanceDurationLimits.max}
              step={1}
              value={seedanceDuration}
              onChange={(event) => setSeedanceDuration(clampSeedanceDuration(seedanceVariant, Number(event.target.value)))}
              disabled={isLoading}
              className="rounded-md border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm font-semibold text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#E04F67]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-300">Resolution</label>
            <div className="grid grid-cols-3 gap-2">
              {SEEDANCE_RESOLUTIONS[seedanceVariant].map((resolution) => (
                <button
                  key={resolution}
                  type="button"
                  onClick={() => setSeedanceResolution(resolution)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    seedanceResolution === resolution
                      ? 'bg-[#E04F67] text-white shadow-lg shadow-[#E04F67]/25'
                      : 'border border-[#E04F67]/25 bg-[#E04F67]/5 text-[#F3A2AF] hover:bg-[#E04F67]/15'
                  }`}
                  disabled={isLoading}
                >
                  {resolution}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-300">Aspect Ratio</label>
            <div className="grid grid-cols-3 gap-2">
              {seedanceRatioOptions.map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setSeedanceRatio(ratio)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    seedanceRatio === ratio
                      ? 'bg-[#E04F67] text-white shadow-lg shadow-[#E04F67]/25'
                      : 'border border-[#E04F67]/25 bg-[#E04F67]/5 text-[#F3A2AF] hover:bg-[#E04F67]/15'
                  }`}
                  disabled={isLoading}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/40 p-3">
            <span>
              <span className="block text-sm font-semibold text-gray-300">Generate Audio</span>
              <span className="block text-xs text-gray-500">Create synchronized AI audio when supported.</span>
            </span>
            <input
              type="checkbox"
              checked={seedanceGenerateAudio}
              onChange={(event) => setSeedanceGenerateAudio(event.target.checked)}
              disabled={isLoading}
              className="h-5 w-5 accent-[#E04F67]"
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/40 p-3">
            <span>
              <span className="block text-sm font-semibold text-gray-300">Web Search</span>
              <span className="block text-xs text-gray-500">Allow online context for prompt grounding.</span>
            </span>
            <input
              type="checkbox"
              checked={seedanceWebSearch}
              onChange={(event) => setSeedanceWebSearch(event.target.checked)}
              disabled={isLoading}
              className="h-5 w-5 accent-[#E04F67]"
            />
          </label>
        </div>
      )}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={isLoading || !videoPrompt.trim()}
        className={`w-full rounded-lg px-8 py-4 text-lg font-bold text-white shadow-lg transition-all duration-300 ease-in-out hover:-translate-y-px hover:shadow-xl active:scale-95 active:shadow-inner disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none ${
          videoProvider === 'seedance'
            ? 'bg-gradient-to-br from-[#E04F67] to-[#B83D8A] shadow-[#E04F67]/20 disabled:from-[#7B3140] disabled:to-[#6F2A55]'
            : 'bg-gradient-to-br from-blue-600 to-blue-500 shadow-blue-500/20 disabled:from-blue-800 disabled:to-blue-700'
        }`}
      >
        {isLoading ? 'Generating Video...' : `Generate ${activeModelName} - ${activeCreditCost} credits`}
      </button>

      {isLoading && (
        <div className="flex items-start gap-3 rounded-lg border border-gray-700/50 bg-black/20 p-4">
          <div className="mt-0.5 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
          </div>
          <div className="text-sm text-gray-400">
            <p className="mb-1 font-semibold text-gray-300">Generating your video...</p>
            <p>Video generation can take a few minutes. You can leave the references in place while the model works.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoControlsPanel;
