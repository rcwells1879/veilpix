/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PhotoIcon } from './icons';

export type ImageProvider = 'nanobanana2' | 'seedream' | 'wanimage';
export type ImageResolution = '1K' | '2K' | '4K';
export type ImageWorkflow = 'text-to-image' | 'image-to-image';

export interface ImageGenerationOptions {
  provider: ImageProvider;
  resolution: ImageResolution;
  aspectRatio: string;
}

interface RatioOption {
  value: string;
  label: string;
}

interface ResolutionOption {
  value: ImageResolution;
  label: string;
  workflows?: ImageWorkflow[];
}

interface ImageModelConfig {
  id: ImageProvider;
  label: string;
  shortLabel: string;
  sublabel: string;
  settingsLabel: string;
  defaultResolution: ImageResolution;
  defaultAspectRatio: string;
  aspectRatios: RatioOption[];
  resolutions: ResolutionOption[];
}

const VEILPIX_CREDIT_USD = 0.0699;
const TARGET_MARGIN = 0.12;
const BILLABLE_USD_PER_VEILPIX_CREDIT = VEILPIX_CREDIT_USD * (1 - TARGET_MARGIN);
const KIE_CREDIT_USD = 0.005;

export const IMAGE_KIE_CREDIT_PRICING: Record<ImageProvider, Partial<Record<ImageResolution, number>>> = {
  nanobanana2: {
    '1K': 8,
    '2K': 12,
    '4K': 18,
  },
  seedream: {
    '2K': 6.5,
    '4K': 6.5,
  },
  wanimage: {
    '1K': 4.8,
    '2K': 4.8,
    '4K': 12,
  },
};

export const IMAGE_MODEL_CONFIGS: Record<ImageProvider, ImageModelConfig> = {
  nanobanana2: {
    id: 'nanobanana2',
    label: 'Nano Banana 2',
    shortLabel: 'Nano 2',
    sublabel: 'Gemini 3.1 Flash',
    settingsLabel: 'Resolution',
    defaultResolution: '2K',
    defaultAspectRatio: '1:1',
    aspectRatios: [
      { value: '1:1', label: '1:1' },
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
      { value: '4:3', label: '4:3' },
      { value: '3:4', label: '3:4' },
      { value: '3:2', label: '3:2' },
      { value: '2:3', label: '2:3' },
      { value: '4:5', label: '4:5' },
      { value: '5:4', label: '5:4' },
      { value: '21:9', label: '21:9' },
      { value: '4:1', label: '4:1' },
      { value: '1:4', label: '1:4' },
      { value: '8:1', label: '8:1' },
      { value: '1:8', label: '1:8' },
      { value: 'auto', label: 'Auto' },
    ],
    resolutions: [
      { value: '1K', label: '1K' },
      { value: '2K', label: '2K' },
      { value: '4K', label: '4K' },
    ],
  },
  seedream: {
    id: 'seedream',
    label: 'Seedream 4.5',
    shortLabel: 'Seedream',
    sublabel: 'ByteDance',
    settingsLabel: 'Quality',
    defaultResolution: '2K',
    defaultAspectRatio: '1:1',
    aspectRatios: [
      { value: '1:1', label: '1:1' },
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
      { value: '4:3', label: '4:3' },
      { value: '3:4', label: '3:4' },
      { value: '3:2', label: '3:2' },
      { value: '2:3', label: '2:3' },
      { value: '21:9', label: '21:9' },
    ],
    resolutions: [
      { value: '2K', label: 'Basic' },
      { value: '4K', label: 'High' },
    ],
  },
  wanimage: {
    id: 'wanimage',
    label: 'Wan 2.7 Image',
    shortLabel: 'Wan 2.7',
    sublabel: 'Kie image',
    settingsLabel: 'Resolution',
    defaultResolution: '2K',
    defaultAspectRatio: '1:1',
    aspectRatios: [
      { value: '1:1', label: '1:1' },
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
      { value: '4:3', label: '4:3' },
      { value: '3:4', label: '3:4' },
      { value: '21:9', label: '21:9' },
      { value: '8:1', label: '8:1' },
      { value: '1:8', label: '1:8' },
    ],
    resolutions: [
      { value: '1K', label: '1K' },
      { value: '2K', label: '2K' },
      { value: '4K', label: 'Pro 4K', workflows: ['text-to-image'] },
    ],
  },
};

export const IMAGE_PROVIDER_OPTIONS: ImageProvider[] = ['nanobanana2', 'seedream', 'wanimage'];

function isImageProvider(value: unknown): value is ImageProvider {
  return typeof value === 'string' && value in IMAGE_MODEL_CONFIGS;
}

function isImageResolution(value: unknown): value is ImageResolution {
  return value === '1K' || value === '2K' || value === '4K';
}

export function getImageModelResolutions(provider: ImageProvider, workflow?: ImageWorkflow): ResolutionOption[] {
  const config = IMAGE_MODEL_CONFIGS[provider] ?? IMAGE_MODEL_CONFIGS.seedream;
  if (!workflow) return config.resolutions;
  return config.resolutions.filter((resolution) => !resolution.workflows || resolution.workflows.includes(workflow));
}

function veilpixCreditsFromKieCredits(kieCredits: number): number {
  return Math.max(1, Math.ceil((kieCredits * KIE_CREDIT_USD) / BILLABLE_USD_PER_VEILPIX_CREDIT));
}

export function getImageKieCreditCost(provider: ImageProvider, resolution?: ImageResolution, workflow?: ImageWorkflow): number {
  const config = IMAGE_MODEL_CONFIGS[provider] ?? IMAGE_MODEL_CONFIGS.seedream;
  const availableResolutions = getImageModelResolutions(config.id, workflow);
  const selectedResolution = resolution && availableResolutions.some((item) => item.value === resolution)
    ? resolution
    : config.defaultResolution;
  return IMAGE_KIE_CREDIT_PRICING[config.id][selectedResolution] ?? IMAGE_KIE_CREDIT_PRICING.seedream['2K'] ?? 6.5;
}

export function getImageCreditCost(provider: ImageProvider, resolution?: ImageResolution, workflow?: ImageWorkflow): number {
  return veilpixCreditsFromKieCredits(getImageKieCreditCost(provider, resolution, workflow));
}

export function normalizeImageGenerationOptions(options?: Partial<ImageGenerationOptions>, workflow?: ImageWorkflow): ImageGenerationOptions {
  const provider = isImageProvider(options?.provider) ? options.provider : 'seedream';
  const config = IMAGE_MODEL_CONFIGS[provider];
  const availableResolutions = getImageModelResolutions(provider, workflow);
  const resolution = isImageResolution(options?.resolution) && availableResolutions.some((item) => item.value === options.resolution)
    ? options.resolution
    : config.defaultResolution;
  const aspectRatio = typeof options?.aspectRatio === 'string' && config.aspectRatios.some((item) => item.value === options.aspectRatio)
    ? options.aspectRatio
    : config.defaultAspectRatio;

  return {
    provider,
    resolution,
    aspectRatio,
  };
}

function modelButtonClass(provider: ImageProvider, active: boolean): string {
  if (active) {
    if (provider === 'seedream') return 'bg-[#E04F67] text-white shadow-lg shadow-[#E04F67]/25';
    if (provider === 'wanimage') return 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20';
    return 'bg-blue-500 text-white shadow-lg shadow-blue-500/20';
  }

  if (provider === 'seedream') return 'text-[#F3A2AF] hover:bg-[#E04F67]/15 hover:text-white';
  if (provider === 'wanimage') return 'text-cyan-200 hover:bg-cyan-500/15 hover:text-white';
  return 'text-gray-400 hover:bg-white/10 hover:text-white';
}

function settingButtonClass(provider: ImageProvider, active: boolean): string {
  if (active) {
    if (provider === 'seedream') return 'bg-[#E04F67] text-white shadow-lg shadow-[#E04F67]/25';
    if (provider === 'wanimage') return 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/20';
    return 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-500/20';
  }

  if (provider === 'seedream') return 'border-[#E04F67]/25 bg-[#E04F67]/5 text-[#F3A2AF] hover:bg-[#E04F67]/15';
  if (provider === 'wanimage') return 'border-cyan-300/25 bg-cyan-500/5 text-cyan-100 hover:bg-cyan-500/15';
  return 'border-white/20 bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white';
}

function focusRingClass(provider: ImageProvider): string {
  if (provider === 'seedream') return 'focus:ring-[#E04F67]';
  if (provider === 'wanimage') return 'focus:ring-cyan-400';
  return 'focus:ring-blue-500';
}

interface ImageModelSelectorProps {
  title: string;
  value: ImageGenerationOptions;
  onChange: (options: ImageGenerationOptions) => void;
  isLoading?: boolean;
  workflow?: ImageWorkflow;
}

export const ImageModelSelector: React.FC<ImageModelSelectorProps> = ({ title, value, onChange, isLoading = false, workflow }) => {
  const normalizedValue = normalizeImageGenerationOptions(value, workflow);

  const handleProviderChange = (provider: ImageProvider) => {
    onChange(normalizeImageGenerationOptions({ ...normalizedValue, provider }, workflow));
  };

  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <PhotoIcon className="h-6 w-6 text-blue-400" />
        <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
      </div>
      <div className="grid w-full grid-cols-3 rounded-lg border border-white/10 bg-gray-900/60 p-1 sm:w-auto sm:min-w-[420px]">
        {IMAGE_PROVIDER_OPTIONS.map((provider) => {
          const config = IMAGE_MODEL_CONFIGS[provider];
          const active = normalizedValue.provider === provider;
          return (
            <button
              key={provider}
              type="button"
              onClick={() => handleProviderChange(provider)}
              className={`min-w-0 rounded-md px-2 py-2 text-center text-xs font-bold transition sm:px-3 sm:text-sm ${modelButtonClass(provider, active)}`}
              disabled={isLoading}
              title={`${config.label} - ${config.sublabel}`}
            >
              <span className="block truncate sm:hidden">{config.shortLabel}</span>
              <span className="hidden truncate sm:block">{config.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface ImageModelSettingsProps {
  value: ImageGenerationOptions;
  onChange: (options: ImageGenerationOptions) => void;
  isLoading?: boolean;
  workflow?: ImageWorkflow;
}

export const ImageModelSettings: React.FC<ImageModelSettingsProps> = ({ value, onChange, isLoading = false, workflow }) => {
  const normalizedValue = normalizeImageGenerationOptions(value, workflow);
  const config = IMAGE_MODEL_CONFIGS[normalizedValue.provider];
  const availableResolutions = getImageModelResolutions(normalizedValue.provider, workflow);

  React.useEffect(() => {
    if (
      normalizedValue.provider !== value.provider ||
      normalizedValue.resolution !== value.resolution ||
      normalizedValue.aspectRatio !== value.aspectRatio
    ) {
      onChange(normalizedValue);
    }
  }, [normalizedValue, onChange, value.aspectRatio, value.provider, value.resolution]);

  const updateOption = (partial: Partial<ImageGenerationOptions>) => {
    onChange(normalizeImageGenerationOptions({ ...normalizedValue, ...partial }, workflow));
  };
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-2 ${focusRingClass(normalizedValue.provider)}`}>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <label className="text-sm font-semibold text-gray-300">Aspect Ratio</label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          {config.aspectRatios.map((ratio) => (
            <button
              key={ratio.value}
              type="button"
              onClick={() => updateOption({ aspectRatio: ratio.value })}
              className={`rounded-md border px-2 py-2 text-xs font-semibold transition sm:text-sm ${settingButtonClass(normalizedValue.provider, normalizedValue.aspectRatio === ratio.value)}`}
              disabled={isLoading}
            >
              {ratio.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:max-w-md">
        <label className="text-sm font-semibold text-gray-300">{config.settingsLabel}</label>
        <div className={`grid gap-2 ${availableResolutions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {availableResolutions.map((resolution) => {
            const creditCost = getImageCreditCost(normalizedValue.provider, resolution.value, workflow);
            return (
              <button
                key={resolution.value}
                type="button"
                onClick={() => updateOption({ resolution: resolution.value })}
                className={`min-w-0 rounded-md border px-2 py-2 text-sm font-semibold transition sm:px-3 ${settingButtonClass(normalizedValue.provider, normalizedValue.resolution === resolution.value)}`}
                disabled={isLoading}
              >
                <span className="block truncate">{resolution.label}</span>
                <span className="block text-[10px] font-medium opacity-75">{creditCost} cr</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
