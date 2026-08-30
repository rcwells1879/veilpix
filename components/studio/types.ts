/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared types for the single-page VeilPix Studio workflow.
 */

export type StudioMode = 'image' | 'video';

export type VideoProvider = 'wan' | 'wan3' | 'seedance';
export type SeedanceVariant = 'v2_5' | 'regular' | 'fast' | 'mini';
export type SeedanceInputMode = 'frames' | 'references';
export type SeedanceOutputFormat = 'mp4' | 'mov';
export type Wan3Variant = 'standard' | 'prime';
export type Wan3InputMode = 'frames' | 'references' | 'file' | 'link';

export interface VideoModelRestoreRequest {
  revision: number;
  provider: VideoProvider;
  seedanceVariant?: SeedanceVariant;
  wan3Variant?: Wan3Variant;
}

export type StageTool = 'none' | 'retouch' | 'crop';

export interface VideoGenerateOptions {
  provider: VideoProvider;
  prompt: string;
  duration: number;
  resolution: string;
  ratio: string;
  wanAudio?: boolean;
  wanMultiShots?: boolean;
  wan3Variant?: Wan3Variant;
  wan3InputMode?: Wan3InputMode;
  wan3Audio?: boolean;
  wan3Seed?: number | null;
  seedanceVariant?: SeedanceVariant;
  seedanceInputMode?: SeedanceInputMode;
  seedanceGenerateAudio?: boolean;
  seedanceWebSearch?: boolean;
  seedanceReturnLastFrame?: boolean;
  seedanceOutputFormat?: SeedanceOutputFormat;
}
