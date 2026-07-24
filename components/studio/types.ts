/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared types for the single-page VeilPix Studio workflow.
 */

export type StudioMode = 'image' | 'video';

export type VideoProvider = 'wan' | 'seedance';
export type SeedanceVariant = 'regular' | 'fast' | 'mini';
export type SeedanceInputMode = 'frames' | 'references';

export type StageTool = 'none' | 'retouch' | 'crop';

export interface VideoGenerateOptions {
  provider: VideoProvider;
  prompt: string;
  duration: number;
  resolution: string;
  ratio: string;
  wanAudio?: boolean;
  wanMultiShots?: boolean;
  seedanceVariant?: SeedanceVariant;
  seedanceInputMode?: SeedanceInputMode;
  seedanceGenerateAudio?: boolean;
  seedanceWebSearch?: boolean;
}
