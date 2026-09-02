/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Video model capability tables + credit pricing.
 * Extracted from VideoControlsPanel so the studio composer can share them.
 */

import type { SeedanceVariant, Wan3Variant } from './types';
import { veilpixCreditsFromKieCredits } from '../../src/utils/creditEconomics';

export const WAN_26_DURATIONS = [5, 10, 15] as const;
export const WAN_27_DURATIONS = [5, 10] as const;
export const WAN_RESOLUTIONS = ['720p', '1080p'] as const;
export const WAN_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const;
export const WAN3_RESOLUTIONS = ['480P', '720P', '1080P'] as const;
export const WAN3_RATIOS = ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'] as const;
export const WAN3_DURATION_LIMITS = { min: 2, max: 30, defaultValue: 5 } as const;
export const WAN3_REFERENCE_LIMITS = { images: 10, videos: 5, audios: 5, mediaSeconds: 15 } as const;

export const SEEDANCE_VARIANTS: SeedanceVariant[] = ['v2_5', 'regular', 'fast', 'mini'];
export const SEEDANCE_MAX_REFERENCE_IMAGES = 30;
export const SEEDANCE_MAX_REFERENCE_VIDEOS = 10;
export const SEEDANCE_MAX_REFERENCE_AUDIOS = 10;
export const SEEDANCE_MEDIA_DURATION_TOLERANCE_SECONDS = 0.25;

const SEEDANCE_REFERENCE_LIMITS: Record<SeedanceVariant, { images: number; videos: number; audios: number; mediaSeconds: number }> = {
  v2_5: { images: 30, videos: 10, audios: 10, mediaSeconds: 30 },
  regular: { images: 9, videos: 1, audios: 1, mediaSeconds: 15 },
  fast: { images: 9, videos: 1, audios: 1, mediaSeconds: 15 },
  mini: { images: 9, videos: 1, audios: 1, mediaSeconds: 15 },
};

export const SEEDANCE_RATIOS: Record<SeedanceVariant, string[]> = {
  v2_5: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
  regular: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
  fast: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
  mini: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
};

export const SEEDANCE_RESOLUTIONS: Record<SeedanceVariant, string[]> = {
  v2_5: ['480p', '720p', '1080p'],
  regular: ['480p', '720p', '1080p'],
  fast: ['480p', '720p'],
  mini: ['480p', '720p'],
};

export const SEEDANCE_DURATION_LIMITS: Record<SeedanceVariant, { min: number; max: number; defaultValue: number }> = {
  v2_5: { min: 4, max: 30, defaultValue: 5 },
  regular: { min: 4, max: 15, defaultValue: 5 },
  fast: { min: 4, max: 15, defaultValue: 5 },
  mini: { min: 4, max: 15, defaultValue: 5 },
};

const WAN_VIDEO_KIE_PRICING = {
  standard: {
    5: { '720p': 70, '1080p': 104.5 },
    10: { '720p': 140, '1080p': 209.5 },
    15: { '720p': 210, '1080p': 315 },
  },
  referencePerSecond: { '720p': 16, '1080p': 24 },
} as const;

const SEEDANCE_PRICING: Record<SeedanceVariant, Record<string, { noVideo: number; withVideo: number }>> = {
  v2_5: {
    '480p': { noVideo: 28, withVideo: 17 },
    '720p': { noVideo: 63, withVideo: 38 },
    '1080p': { noVideo: 114, withVideo: 68.5 },
  },
  fast: {
    '480p': { noVideo: 11.7, withVideo: 6.8 },
    '720p': { noVideo: 24.8, withVideo: 15 },
  },
  mini: {
    '480p': { noVideo: 3.8, withVideo: 2.4 },
    '720p': { noVideo: 8.2, withVideo: 5 },
  },
  regular: {
    '480p': { noVideo: 19, withVideo: 11.5 },
    '720p': { noVideo: 41, withVideo: 25 },
    '1080p': { noVideo: 102, withVideo: 62 },
  },
};

const WAN3_PRICING: Record<Wan3Variant, Record<string, number>> = {
  standard: { '480P': 8, '720P': 16, '1080P': 32 },
  prime: { '480P': 12.2, '720P': 25.2, '1080P': 50.4 },
};

export function getWanCreditCost(duration: number, resolution: string, usesReferenceToVideo = false): number {
  const selectedResolution = resolution === '720p' ? '720p' : '1080p';
  const kieCredits = usesReferenceToVideo
    ? duration * WAN_VIDEO_KIE_PRICING.referencePerSecond[selectedResolution]
    : WAN_VIDEO_KIE_PRICING.standard[duration as keyof typeof WAN_VIDEO_KIE_PRICING.standard]?.[selectedResolution]
      ?? duration * (WAN_VIDEO_KIE_PRICING.standard[15][selectedResolution] / 15);
  return veilpixCreditsFromKieCredits(kieCredits);
}

export function clampSeedanceDuration(variant: SeedanceVariant, duration: number): number {
  const limits = SEEDANCE_DURATION_LIMITS[variant];
  if (!Number.isFinite(duration)) return limits.defaultValue;
  if (variant === 'v2_5' && duration === -1) return -1;
  return Math.max(limits.min, Math.min(limits.max, Math.round(duration)));
}

export function clampWan3Duration(duration: number): number {
  if (duration === -1) return -1;
  if (!Number.isFinite(duration)) return WAN3_DURATION_LIMITS.defaultValue;
  return Math.max(WAN3_DURATION_LIMITS.min, Math.min(WAN3_DURATION_LIMITS.max, Math.round(duration)));
}

export function getWan3CreditCost(
  variant: Wan3Variant,
  resolution: string,
  duration: number,
  hasVideoReference = false,
  referenceVideoDuration?: number | null
): number {
  const rate = WAN3_PRICING[variant][resolution] ?? WAN3_PRICING[variant]['1080P'];
  const outputSeconds = duration === -1 ? WAN3_DURATION_LIMITS.max : clampWan3Duration(duration);
  const inputSeconds = hasVideoReference
    ? Math.max(0, Math.min(WAN3_REFERENCE_LIMITS.mediaSeconds, referenceVideoDuration ?? WAN3_REFERENCE_LIMITS.mediaSeconds))
    : 0;
  return veilpixCreditsFromKieCredits(rate * (outputSeconds + inputSeconds));
}

export function getSeedanceCreditCost(
  variant: SeedanceVariant,
  resolution: string,
  duration: number,
  hasVideoReference: boolean,
  referenceVideoDuration?: number | null
): number {
  const pricing = SEEDANCE_PRICING[variant][resolution] ?? SEEDANCE_PRICING[variant][SEEDANCE_RESOLUTIONS[variant][0]];
  const selectedDuration = clampSeedanceDuration(variant, duration);
  const outputSeconds = selectedDuration === -1 ? SEEDANCE_DURATION_LIMITS[variant].max : selectedDuration;
  const inputSeconds = hasVideoReference
    ? Math.max(0, Math.min(SEEDANCE_DURATION_LIMITS[variant].max, Number(referenceVideoDuration ?? SEEDANCE_DURATION_LIMITS[variant].max)))
    : 0;
  const rate = hasVideoReference ? pricing.withVideo : pricing.noVideo;
  const kieCredits = rate * (outputSeconds + inputSeconds);
  return veilpixCreditsFromKieCredits(kieCredits);
}

export function getSeedanceReferenceLimits(variant: SeedanceVariant) {
  return SEEDANCE_REFERENCE_LIMITS[variant];
}

export function exceedsSeedanceMediaDurationLimit(duration: number | null | undefined, variant: SeedanceVariant): boolean {
  if (duration === null || duration === undefined || !Number.isFinite(duration)) return false;
  return duration > SEEDANCE_REFERENCE_LIMITS[variant].mediaSeconds + SEEDANCE_MEDIA_DURATION_TOLERANCE_SECONDS;
}

export function getWanMaxReferenceImages(hasVideoReference: boolean): number {
  return hasVideoReference ? 4 : 5;
}
