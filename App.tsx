/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * VeilPix Studio - single-page AI image & video workspace.
 *
 * Architecture:
 * - One screen: result stage above a prompt composer, gallery rail on the right.
 * - Two modes (image / video); composer dropdowns adapt to the selected model.
 * - History-based undo/redo with File objects; compare slider; retouch; crop.
 * - Authentication-gated features via Clerk; all AI calls proxied by the backend.
 */

import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, Suspense, lazy } from 'react';
import type { Crop, PixelCrop } from 'react-image-crop';
import { useUser, useClerk } from '@clerk/clerk-react';
import {
  useGenerateEditNanoBanana2,
  useGenerateAdjustNanoBanana2,
  useGenerateCompositeNanoBanana2,
  useGenerateTextToImage,
  useGenerateEditSeeDream,
  useGenerateAdjustSeeDream,
  useGenerateCompositeSeeDream,
  useGenerateEditWanImage,
  useGenerateAdjustWanImage,
  useGenerateCompositeWanImage,
  useGenerateTextToImageSeeDream,
  useGenerateTextToImageWanImage,
  useGenerateTextToImageZImage,
  useImageGenerationRecovery,
  useGenerateVideo,
  useGenerateReferenceToVideo,
  useGenerateTextToVideo,
  useGenerateSeedanceVideo,
  useGenerateWan3Video,
  useVideoGenerationRecovery,
  useMediaDeliveryRecovery,
  type ImageGenerationResponse,
  type VideoGenerationResponse,
  useUsageStats
} from './src/hooks/useImageGeneration';
import Header from './components/Header';
import Footer from './components/Footer';
import Spinner from './components/Spinner';
import type { SettingsState } from './components/SettingsMenu';
import {
  getImageCreditCost,
  imageProviderSupportsReferences,
  normalizeImageGenerationOptions,
  type ImageGenerationOptions,
  type ImageProvider,
  type ImageWorkflow,
} from './components/ImageModelControlsPanel';
import Composer from './components/studio/Composer';
import ResultStage from './components/studio/ResultStage';
import GalleryRail, { type GalleryReferenceTarget, type PendingGalleryItem } from './components/studio/GalleryRail';
import type { StudioMode, StageTool, VideoProvider, SeedanceVariant, SeedanceInputMode, SeedanceOutputFormat, Wan3Variant, Wan3InputMode, VideoGenerateOptions, VideoModelRestoreRequest } from './components/studio/types';
import {
  getWanMaxReferenceImages,
  getSeedanceReferenceLimits,
  SEEDANCE_MAX_REFERENCE_AUDIOS,
  SEEDANCE_MAX_REFERENCE_IMAGES,
  SEEDANCE_MAX_REFERENCE_VIDEOS,
  WAN3_REFERENCE_LIMITS,
} from './components/studio/videoPricing';
import {
  clearPendingVideoReferenceImages,
  debouncedSaveWorkflow,
  getPendingVideoReferenceImages,
  hasGalleryArtifact,
  hasGalleryVideoReferences,
  hasLocalDeliveryReceipt,
  markLocalDeliveryReceipt,
  savePendingVideoReferenceImages,
  saveToGallery,
  saveVideoToGallery,
  type GalleryVideoDetails,
} from './src/utils/workflowStorage';
import { extractLastVideoFrame } from './src/utils/videoFrameExtraction';

/* ------------------------------------------------------------------ */
/* Lazy-loaded chunks                                                   */
/* ------------------------------------------------------------------ */
const WebcamCapture = lazy(() => import('./components/WebcamCapture'));
const SignupPromptModal = lazy(() => import('./components/SignupPromptModal'));
const PaymentSuccess = lazy(() => import('./components/PaymentSuccess').then(module => ({ default: module.PaymentSuccess })));
const PaymentCancelled = lazy(() => import('./components/PaymentCancelled').then(module => ({ default: module.PaymentCancelled })));
const PricingModal = lazy(() => import('./components/PricingModal').then(module => ({ default: module.PricingModal })));
const VideoEditor = lazy(() => import('./components/studio/VideoEditor'));
const StudioBelowFold = lazy(() => import('./components/studio/StudioBelowFold'));

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function getVideoDurationSeconds(source: File | string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source);
    const timeout = window.setTimeout(() => finish(null), 5000);
    let done = false;

    const finish = (duration: number | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
      resolve(duration);
    };

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      // Keep the measured duration instead of rounding up. Encoders commonly
      // add a fraction of a second of container padding, so a nominal 30s clip
      // must not become 31s before Seedance validation runs.
      finish(Number.isFinite(video.duration) ? Math.round(video.duration * 1000) / 1000 : null);
    };
    video.onerror = () => finish(null);
    video.src = objectUrl || (source as string);
  });
}

function areSameFiles(left: File[], right: File[]): boolean {
  return left.length === right.length && left.every((file, index) => {
    const other = right[index];
    return file === other || (
      file.name === other.name
      && file.size === other.size
      && file.type === other.type
      && file.lastModified === other.lastModified
    );
  });
}

function seedanceVariantFromDeliveryProvider(provider: string): SeedanceVariant | undefined {
  const normalized = provider.toLowerCase();
  if (normalized.includes('seedance-v2-5')) return 'v2_5';
  if (normalized.includes('seedance-regular')) return 'regular';
  if (normalized.includes('seedance-fast')) return 'fast';
  if (normalized.includes('seedance-mini')) return 'mini';
  return undefined;
}

function wan3VariantFromDeliveryProvider(provider: string): Wan3Variant | undefined {
  const normalized = provider.toLowerCase();
  if (normalized.includes('wan3-prime')) return 'prime';
  if (normalized.includes('wan3-standard')) return 'standard';
  return undefined;
}

const dataURLtoFile = (dataurl: string, filename: string): File => {
  const arr = dataurl.split(',');
  if (arr.length < 2) throw new Error('Invalid data URL');
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch || !mimeMatch[1]) throw new Error('Could not parse MIME type from data URL');

  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};

const generatedImageToFile = async (
  image: { data: string; mimeType?: string },
  filenamePrefix: string
): Promise<File> => {
  const reportedMimeType = image.mimeType?.split(';')[0].trim().toLowerCase();
  const mimeType = reportedMimeType?.startsWith('image/') ? reportedMimeType : 'image/png';
  const extensionByMimeType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
  };
  const extension = extensionByMimeType[mimeType]
    || mimeType.slice('image/'.length).replace('+xml', '')
    || 'png';
  const imageBlob = await fetch(`data:${mimeType};base64,${image.data}`)
    .then(response => response.blob());

  return new File(
    [imageBlob],
    `${filenamePrefix}-${Date.now()}.${extension}`,
    { type: mimeType }
  );
};

const downloadDeliveryFile = async (downloadUrl: string, fileName: string, mimeType: string): Promise<File> => {
  const response = await fetch(downloadUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Delivery download returned ${response.status}`);
  const blob = await response.blob();
  if (!blob.size) throw new Error('The delivered media file was empty.');
  return new File([blob], fileName, { type: blob.type || mimeType || 'application/octet-stream' });
};

const CONTENT_POLICY_ERROR_CODE = 'CONTENT_POLICY_VIOLATION';
const CONTENT_POLICY_ERROR_MESSAGE = 'Content policy violation: this request was flagged by the content moderation provider.';

const getApiErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;

  if (error && typeof error === 'object') {
    const apiError = error as {
      message?: string;
      data?: { message?: string; error?: string };
    };

    return apiError.data?.message
      || apiError.data?.error
      || apiError.message
      || 'An unknown error occurred.';
  }

  return 'An unknown error occurred.';
};

const isSafetyFilterError = (error: unknown): boolean => {
  if (error && typeof error === 'object') {
    const apiError = error as { data?: { code?: string } };
    if (apiError.data?.code === CONTENT_POLICY_ERROR_CODE) return true;
  }

  const safetyKeywords = [
    'safety', 'blocked', 'flagged', 'inappropriate', 'policy', 'violation',
    'nsfw', 'harmful', 'terms of service', 'content policy', 'not allowed',
    'not approved', 'moderation provider', 'failed the review',
    'sensitivecontentdetected', 'contentriskblocked'
  ];

  const lowerError = getApiErrorMessage(error).toLowerCase();
  if (safetyKeywords.some(keyword => lowerError.includes(keyword))) return true;

  // Kie.ai returns generic "Internal Error" for content-filtered requests.
  if (lowerError.includes('internal error') || lowerError.includes('500')) return true;

  return false;
};

const getGenerationErrorMessage = (error: unknown, fallbackPrefix: string): string => {
  if (isSafetyFilterError(error)) return CONTENT_POLICY_ERROR_MESSAGE;
  return `${fallbackPrefix} ${getApiErrorMessage(error)}`;
};

/* ------------------------------------------------------------------ */
/* Settings persistence                                                 */
/* ------------------------------------------------------------------ */

const SETTINGS_STORAGE_KEY = 'veilpix-settings';
const PENDING_IMAGE_STORAGE_KEY = 'veilpix-pending-image-generations';
const PENDING_VIDEO_STORAGE_KEY = 'veilpix-pending-video-generations';
const LEGACY_PENDING_IMAGE_STORAGE_KEY = 'veilpix-pending-image-generation';
const LEGACY_PENDING_VIDEO_STORAGE_KEY = 'veilpix-pending-video-generation';
const GENERATION_RECOVERY_TIMEOUT_MS = 48 * 60 * 60 * 1000;
const MAX_CONCURRENT_GENERATIONS = 3;

type RecoverableImageWorkflow = 'text-to-image' | 'retouch' | 'composite' | 'adjust';

interface PendingImageGeneration {
  id: string;
  provider: ImageProvider;
  prompt: string;
  workflow: RecoverableImageWorkflow;
  createdAt: number;
}

interface PendingVideoGeneration {
  id: string;
  provider: VideoProvider;
  prompt: string;
  duration: number;
  resolution: string;
  ratio: string;
  seedanceVariant?: SeedanceVariant;
  seedanceInputMode?: SeedanceInputMode;
  seedanceOutputFormat?: SeedanceOutputFormat;
  wan3Variant?: Wan3Variant;
  wan3InputMode?: Wan3InputMode;
  createdAt: number;
}

interface PendingVideoFiles {
  generationId: string;
  referenceImages: File[];
  referenceVideoFiles: File[];
  referenceVideoUrl: string | null;
}

interface ImageGenerationSubmission {
  kind: 'image';
  job: PendingImageGeneration;
  options: ImageGenerationOptions;
  sourceImage: File | null;
  styleImage: File | null;
  hotspot: { x: number; y: number } | null;
  nsfwFilterEnabled: boolean;
}

interface VideoGenerationSubmission {
  kind: 'video';
  job: PendingVideoGeneration;
  options: VideoGenerateOptions;
  wanReferenceImages: File[];
  referenceVideoFile: File | null;
  referenceVideoUrl: string | null;
  seedanceFirstFrame: File | null;
  seedanceLastFrame: File | null;
  seedanceReferenceImages: File[];
  seedanceReferenceVideoFiles: File[];
  seedanceReferenceVideoUrl: string | null;
  seedanceReferenceVideoDuration: number | null;
  seedanceReferenceAudioFiles: File[];
  seedanceReferenceAudioDuration: number | null;
  wan3FirstFrame: File | null;
  wan3LastFrame: File | null;
  wan3ReferenceImages: File[];
  wan3ReferenceVideoFiles: File[];
  wan3ReferenceVideoDuration: number | null;
  wan3ReferenceAudioFiles: File[];
  wan3ReferenceAudioDuration: number | null;
  wan3ReferenceFile: File | null;
  wan3ReferenceLink: string;
  nsfwFilterEnabled: boolean;
}

type GenerationSubmission = ImageGenerationSubmission | VideoGenerationSubmission;

function isPendingImageGeneration(value: unknown): value is PendingImageGeneration {
  if (!value || typeof value !== 'object') return false;
  const parsed = value as Partial<PendingImageGeneration>;
  return (
    typeof parsed.id === 'string' &&
    ['nanobanana2', 'seedream', 'wanimage', 'zimage'].includes(parsed.provider || '') &&
    typeof parsed.prompt === 'string' &&
    ['text-to-image', 'retouch', 'composite', 'adjust'].includes(parsed.workflow || '') &&
    typeof parsed.createdAt === 'number'
  );
}

function storePendingImageGenerations(jobs: PendingImageGeneration[]): void {
  try {
    if (jobs.length > 0) localStorage.setItem(PENDING_IMAGE_STORAGE_KEY, JSON.stringify(jobs));
    else localStorage.removeItem(PENDING_IMAGE_STORAGE_KEY);
  } catch {
    // Recovery still works during this page lifetime when storage is unavailable.
  }
}

function readPendingImageGenerations(): PendingImageGeneration[] {
  try {
    const raw = localStorage.getItem(PENDING_IMAGE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.filter(isPendingImageGeneration);
      localStorage.removeItem(PENDING_IMAGE_STORAGE_KEY);
    }

    const legacyRaw = localStorage.getItem(LEGACY_PENDING_IMAGE_STORAGE_KEY);
    if (!legacyRaw) return [];
    const legacy = JSON.parse(legacyRaw) as unknown;
    localStorage.removeItem(LEGACY_PENDING_IMAGE_STORAGE_KEY);
    if (!isPendingImageGeneration(legacy)) return [];
    storePendingImageGenerations([legacy]);
    return [legacy];
  } catch {
    return [];
  }
}

function isPendingVideoGeneration(value: unknown): value is PendingVideoGeneration {
  if (!value || typeof value !== 'object') return false;
  const parsed = value as Partial<PendingVideoGeneration>;
  return (
    typeof parsed.id === 'string' &&
    (parsed.provider === 'wan' || parsed.provider === 'wan3' || parsed.provider === 'seedance') &&
    typeof parsed.prompt === 'string' &&
    typeof parsed.duration === 'number' &&
    typeof parsed.resolution === 'string' &&
    typeof parsed.ratio === 'string' &&
    typeof parsed.createdAt === 'number'
  );
}

function storePendingVideoGenerations(jobs: PendingVideoGeneration[]): void {
  try {
    if (jobs.length > 0) localStorage.setItem(PENDING_VIDEO_STORAGE_KEY, JSON.stringify(jobs));
    else localStorage.removeItem(PENDING_VIDEO_STORAGE_KEY);
  } catch {
    // Recovery still works during this page lifetime when storage is unavailable.
  }
}

function readPendingVideoGenerations(): PendingVideoGeneration[] {
  try {
    const raw = localStorage.getItem(PENDING_VIDEO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.filter(isPendingVideoGeneration);
      localStorage.removeItem(PENDING_VIDEO_STORAGE_KEY);
    }

    const legacyRaw = localStorage.getItem(LEGACY_PENDING_VIDEO_STORAGE_KEY);
    if (!legacyRaw) return [];
    const legacy = JSON.parse(legacyRaw) as unknown;
    localStorage.removeItem(LEGACY_PENDING_VIDEO_STORAGE_KEY);
    if (!isPendingVideoGeneration(legacy)) return [];
    storePendingVideoGenerations([legacy]);
    return [legacy];
  } catch {
    return [];
  }
}

function shouldRecoverGeneration(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = Number((error as { status?: number }).status);
  return status === 0 || status === 408 || status >= 500;
}

const DEFAULT_SETTINGS: SettingsState = {
  apiProvider: 'seedream',
  resolution: '2K',
  imageAspectRatio: '1:1',
  seedreamTier: 'lite',
  imageOutputFormat: 'png',
  nsfwFilterEnabled: true
};

/* ------------------------------------------------------------------ */

const App: React.FC = () => {
  const { isSignedIn, isLoaded } = useUser();
  const clerk = useClerk();
  const openedProfileRef = useRef(false);
  const { data: usageStats } = useUsageStats();
  const hasPurchasedCredits = (usageStats?.totalCreditsPurchased ?? 0) > 0;

  /* ---------------- studio state ---------------- */
  const [studioMode, setStudioMode] = useState<StudioMode>('image');
  const [history, setHistory] = useState<File[]>([]);
  const [historyPrompts, setHistoryPrompts] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [imagePrompt, setImagePrompt] = useState<string>('');
  const [videoPrompt, setVideoPrompt] = useState<string>('');
  const [styleImage, setStyleImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<StageTool>('none');
  const [editHotspot, setEditHotspot] = useState<{ x: number; y: number } | null>(null);
  const [displayHotspot, setDisplayHotspot] = useState<{ x: number; y: number } | null>(null);
  const [showSignupPrompt, setShowSignupPrompt] = useState<boolean>(false);
  const [webcamTarget, setWebcamTarget] = useState<'base' | 'style' | null>(null);
  const [galleryRefreshTrigger, setGalleryRefreshTrigger] = useState(0);
  const [isVideoEditorOpen, setIsVideoEditorOpen] = useState(false);
  const [isVideoEditorRendering, setIsVideoEditorRendering] = useState(false);
  const [incomingEditorVideo, setIncomingEditorVideo] = useState<GalleryVideoDetails | null>(null);
  const [isProcessingFile] = useState(false);

  /* crop */
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>();
  const imgRef = useRef<HTMLImageElement>(null);

  /* compare */
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [showSlider, setShowSlider] = useState<boolean>(false);
  const [sliderCompareMode, setSliderCompareMode] = useState<'original' | 'previous'>('original');

  /* Hide the static SEO hero once the app owns the screen */
  useLayoutEffect(() => {
    const startHero = document.getElementById('veilpix-start-hero');
    if (startHero) startHero.hidden = true;
  }, []);

  /* ---------------- settings ---------------- */
  const [settings, setSettings] = useState<SettingsState>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Stored values are kept as-is; provider/workflow clamping happens at
        // read time so user preferences survive model and workflow switches.
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (storageError) {
      console.error('Failed to load settings from localStorage:', storageError);
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (storageError) {
      console.error('Failed to save settings to localStorage:', storageError);
    }
  }, [settings]);

  // Enforce NSFW filter for confirmed non-purchasers only. While usage stats
  // are still loading (undefined), do nothing — otherwise every page load
  // would momentarily see "no purchases" and wipe a purchaser's After Dark
  // setting before the stats arrive.
  useEffect(() => {
    if (usageStats && !hasPurchasedCredits && !settings.nsfwFilterEnabled) {
      setSettings(prev => ({ ...prev, nsfwFilterEnabled: true }));
    }
  }, [usageStats, hasPurchasedCredits, settings.nsfwFilterEnabled]);

  const handleSettingsChange = useCallback((newSettings: SettingsState) => {
    setSettings(newSettings);
  }, []);

  const handleImageOptionsChange = useCallback((options: ImageGenerationOptions) => {
    setSettings(prev => ({
      ...prev,
      apiProvider: options.provider,
      resolution: options.resolution,
      imageAspectRatio: options.aspectRatio,
      seedreamTier: options.seedreamTier,
      imageOutputFormat: options.outputFormat,
    }));
  }, []);

  // Raw user preferences — normalization/clamping happens where requests are
  // built and where options are displayed, never against the stored values.
  const imageGenerationOptions: ImageGenerationOptions = {
    provider: settings.apiProvider,
    resolution: settings.resolution,
    aspectRatio: settings.imageAspectRatio,
    seedreamTier: settings.seedreamTier,
    outputFormat: settings.imageOutputFormat,
  };

  /* ---------------- clerk / payment plumbing ---------------- */
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [showPaymentCancelled, setShowPaymentCancelled] = useState(false);
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null);
  const [showPricingModal, setShowPricingModal] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const isSSOCallback = window.location.hash.includes('/sso-callback') ||
      window.location.pathname.includes('/sso-callback') ||
      searchParams.has('__clerk_status') ||
      searchParams.has('__clerk_created_session') ||
      searchParams.has('__clerk_ticket');

    if (isSSOCallback && clerk.loaded) {
      clerk.handleRedirectCallback({
        signInForceRedirectUrl: '/veilpix/',
        signUpForceRedirectUrl: '/veilpix/',
      }).then(() => {
        window.history.replaceState({}, '', window.location.pathname);
      }).catch((err) => {
        console.error('SSO callback error:', err);
      });
    }
  }, [clerk.loaded]);

  useEffect(() => {
    if (!isLoaded || !clerk.loaded || openedProfileRef.current) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get('clerk_ui') !== 'profile') return;

    openedProfileRef.current = true;
    url.searchParams.delete('clerk_ui');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);

    if (isSignedIn) {
      clerk.openUserProfile();
    }
  }, [clerk, isLoaded, isSignedIn]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const cancelled = urlParams.get('cancelled');

    if (sessionId) {
      setPaymentSessionId(sessionId);
      setShowPaymentSuccess(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (cancelled === 'true') {
      setShowPaymentCancelled(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  /* ---------------- mutations ---------------- */
  const editNB2 = useGenerateEditNanoBanana2();
  const editSeeDream = useGenerateEditSeeDream();
  const editWan = useGenerateEditWanImage();

  const adjustNB2 = useGenerateAdjustNanoBanana2();
  const adjustSeeDream = useGenerateAdjustSeeDream();
  const adjustWan = useGenerateAdjustWanImage();

  const compositeNB2 = useGenerateCompositeNanoBanana2();
  const compositeSeeDream = useGenerateCompositeSeeDream();
  const compositeWan = useGenerateCompositeWanImage();

  const textToImageNB2 = useGenerateTextToImage();
  const textToImageSeeDream = useGenerateTextToImageSeeDream();
  const textToImageWan = useGenerateTextToImageWanImage();
  const textToImageZImage = useGenerateTextToImageZImage();

  const editableImageMutationsByProvider = {
    nanobanana2: { edit: editNB2, adjust: adjustNB2, composite: compositeNB2 },
    seedream: { edit: editSeeDream, adjust: adjustSeeDream, composite: compositeSeeDream },
    wanimage: { edit: editWan, adjust: adjustWan, composite: compositeWan },
  } satisfies Record<Exclude<ImageProvider, 'zimage'>, {
    edit: typeof editNB2;
    adjust: typeof adjustNB2;
    composite: typeof compositeNB2;
  }>;

  const textToImageMutationsByProvider = {
    nanobanana2: textToImageNB2,
    seedream: textToImageSeeDream,
    wanimage: textToImageWan,
    zimage: textToImageZImage,
  } satisfies Record<ImageProvider, {
    mutateAsync: typeof textToImageNB2.mutateAsync;
  }>;

  const getImageGenerationStatus = useImageGenerationRecovery();

  const videoMutation = useGenerateVideo();
  const referenceVideoMutation = useGenerateReferenceToVideo();
  const textToVideoMutation = useGenerateTextToVideo();
  const seedanceVideoMutation = useGenerateSeedanceVideo();
  const wan3VideoMutation = useGenerateWan3Video();
  const getVideoGenerationStatus = useVideoGenerationRecovery();
  const mediaDeliveryRecovery = useMediaDeliveryRecovery();

  /* ---------------- video state ---------------- */
  const [videoProvider, setVideoProvider] = useState<VideoProvider>(() => {
    try {
      const stored = localStorage.getItem('veilpix-video-provider');
      if (stored === 'wan' || stored === 'wan3' || stored === 'seedance') return stored;
    } catch { /* storage unavailable */ }
    return 'seedance';
  });
  const [videoModelRestoreRequest, setVideoModelRestoreRequest] = useState<VideoModelRestoreRequest | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('veilpix-video-provider', videoProvider);
    } catch { /* storage unavailable */ }
  }, [videoProvider]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoOutputFormat, setVideoOutputFormat] = useState<SeedanceOutputFormat>('mp4');
  const [videoLastFrameUrl, setVideoLastFrameUrl] = useState<string | null>(null);
  const [galleryVideoFile, setGalleryVideoFile] = useState<File | null>(null);
  const galleryVideoObjectUrlRef = useRef<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [pendingImageGenerations, setPendingImageGenerations] = useState<PendingImageGeneration[]>(
    () => readPendingImageGenerations()
  );
  const pendingImageGenerationsRef = useRef(pendingImageGenerations);
  const finalizingImageJobsRef = useRef(new Set<string>());
  const imageRecoveryRequestInFlightRef = useRef(new Set<string>());
  const [pendingVideoGenerations, setPendingVideoGenerations] = useState<PendingVideoGeneration[]>(
    () => readPendingVideoGenerations()
  );
  const pendingVideoGenerationsRef = useRef(pendingVideoGenerations);
  const activeGenerationIdsRef = useRef(new Set([
    ...pendingImageGenerations.map(job => job.id),
    ...pendingVideoGenerations.map(job => job.id),
  ]));
  const pendingVideoFilesRef = useRef(new Map<string, PendingVideoFiles>());
  const finalizingVideoJobsRef = useRef(new Set<string>());
  const recoveryRequestInFlightRef = useRef(new Set<string>());
  const deliveryRecoveryInFlightRef = useRef(false);
  const [isExtractingLastFrame, setIsExtractingLastFrame] = useState(false);
  const [referenceVideoFile, setReferenceVideoFile] = useState<File | null>(null);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState<string | null>(null);
  const [referenceVideoDuration, setReferenceVideoDuration] = useState<number | null>(null);
  const [wanReferenceImages, setWanReferenceImages] = useState<File[]>([]);
  const [seedanceInputMode, setSeedanceInputMode] = useState<SeedanceInputMode>('references');
  const [seedanceFirstFrame, setSeedanceFirstFrame] = useState<File | null>(null);
  const [seedanceLastFrame, setSeedanceLastFrame] = useState<File | null>(null);
  const [seedanceReferenceImages, setSeedanceReferenceImages] = useState<File[]>([]);
  const [seedanceReferenceVideoFiles, setSeedanceReferenceVideoFiles] = useState<File[]>([]);
  const [seedanceReferenceVideoUrl, setSeedanceReferenceVideoUrl] = useState<string | null>(null);
  const [seedanceReferenceVideoDuration, setSeedanceReferenceVideoDuration] = useState<number | null>(null);
  const [seedanceReferenceAudioFiles, setSeedanceReferenceAudioFiles] = useState<File[]>([]);
  const [seedanceReferenceAudioDuration, setSeedanceReferenceAudioDuration] = useState<number | null>(null);
  const [wan3InputMode, setWan3InputMode] = useState<Wan3InputMode>('references');
  const [wan3FirstFrame, setWan3FirstFrame] = useState<File | null>(null);
  const [wan3LastFrame, setWan3LastFrame] = useState<File | null>(null);
  const [wan3ReferenceImages, setWan3ReferenceImages] = useState<File[]>([]);
  const [wan3ReferenceVideoFiles, setWan3ReferenceVideoFiles] = useState<File[]>([]);
  const [wan3ReferenceVideoDuration, setWan3ReferenceVideoDuration] = useState<number | null>(null);
  const [wan3ReferenceAudioFiles, setWan3ReferenceAudioFiles] = useState<File[]>([]);
  const [wan3ReferenceAudioDuration, setWan3ReferenceAudioDuration] = useState<number | null>(null);
  const [wan3ReferenceFile, setWan3ReferenceFile] = useState<File | null>(null);
  const [wan3ReferenceLink, setWan3ReferenceLink] = useState('');

  const activeGenerationCount = pendingImageGenerations.length + pendingVideoGenerations.length;
  const displayedActiveGenerationCount = Math.min(
    MAX_CONCURRENT_GENERATIONS,
    activeGenerationCount,
  );
  const pendingGalleryItems: PendingGalleryItem[] = [
    ...pendingImageGenerations.map(job => ({
      id: job.id,
      type: 'image' as const,
      status: 'generating' as const,
    })),
    ...pendingVideoGenerations.map(job => ({
      id: job.id,
      type: 'video' as const,
      status: 'generating' as const,
    })),
  ];

  /* ---------------- derived image state ---------------- */
  const currentImage = history[historyIndex] ?? null;
  const originalImage = history[0] ?? null;
  const previousImage = historyIndex > 0 ? history[historyIndex - 1] : null;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [previousImageUrl, setPreviousImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (currentImage) {
      const url = URL.createObjectURL(currentImage);
      setCurrentImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setCurrentImageUrl(null);
  }, [currentImage]);

  useEffect(() => {
    if (originalImage) {
      const url = URL.createObjectURL(originalImage);
      setOriginalImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setOriginalImageUrl(null);
  }, [originalImage]);

  useEffect(() => {
    if (previousImage) {
      const url = URL.createObjectURL(previousImage);
      setPreviousImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviousImageUrl(null);
  }, [previousImage]);

  // Auto-close slider when history changes
  useEffect(() => {
    setShowSlider(false);
  }, [historyIndex]);

  // Recall the prompt that produced the displayed image on undo/redo
  useEffect(() => {
    if (historyIndex >= 0) {
      setImagePrompt(historyPrompts[historyIndex] ?? '');
    }
  }, [historyIndex, historyPrompts]);

  // Persist workflow locally
  useEffect(() => {
    if (history.length > 0) {
      debouncedSaveWorkflow(history, historyIndex, historyPrompts);
    }
  }, [history, historyIndex, historyPrompts]);

  /* ---------------- video result helpers ---------------- */
  const revokeGalleryVideoObjectUrl = useCallback(() => {
    if (galleryVideoObjectUrlRef.current) {
      URL.revokeObjectURL(galleryVideoObjectUrlRef.current);
      galleryVideoObjectUrlRef.current = null;
    }
  }, []);

  const clearVideoResult = useCallback(() => {
    revokeGalleryVideoObjectUrl();
    setGalleryVideoFile(null);
    setVideoUrl(null);
    setVideoLastFrameUrl(null);
  }, [revokeGalleryVideoObjectUrl]);

  const showRemoteVideoResult = useCallback((url: string) => {
    revokeGalleryVideoObjectUrl();
    setGalleryVideoFile(null);
    setVideoUrl(url);
  }, [revokeGalleryVideoObjectUrl]);

  const showGalleryVideoResult = useCallback((file: File) => {
    revokeGalleryVideoObjectUrl();
    const objectUrl = URL.createObjectURL(file);
    galleryVideoObjectUrlRef.current = objectUrl;
    setGalleryVideoFile(file);
    setVideoUrl(objectUrl);
  }, [revokeGalleryVideoObjectUrl]);

  const clearPendingVideoJob = useCallback((generationId: string) => {
    const next = pendingVideoGenerationsRef.current.filter(job => job.id !== generationId);
    pendingVideoGenerationsRef.current = next;
    setPendingVideoGenerations(next);
    storePendingVideoGenerations(next);
    activeGenerationIdsRef.current.delete(generationId);
    pendingVideoFilesRef.current.delete(generationId);
    void clearPendingVideoReferenceImages(generationId).catch((storageError) => {
      console.warn('Could not clear completed video reference images from local storage:', storageError);
    });
  }, []);

  const finalizeVideoGeneration = useCallback(async (
    response: VideoGenerationResponse,
    job: PendingVideoGeneration,
    suppliedFiles?: PendingVideoFiles | null,
  ) => {
    if (!response.success || !response.videoUrl || finalizingVideoJobsRef.current.has(job.id)) return;
    finalizingVideoJobsRef.current.add(job.id);

    const files = suppliedFiles?.generationId === job.id
      ? suppliedFiles
      : pendingVideoFilesRef.current.get(job.id) ?? null;
    let referenceImages = files?.referenceImages ?? [];
    if (referenceImages.length === 0) {
      try {
        referenceImages = await getPendingVideoReferenceImages(job.id);
      } catch (storageError) {
        console.warn('Could not restore pending video reference images:', storageError);
      }
    }

    setVideoError(null);
    const finalizedVideoDuration = job.duration === -1
      ? await getVideoDurationSeconds(response.videoUrl) ?? 30
      : job.duration;

    const savedLocally = await saveVideoToGallery({
      videoUrl: response.videoUrl,
      generationId: job.id,
      provider: job.provider,
      referenceImage: referenceImages[0] ?? null,
      referenceImages,
      referenceVideoFile: files?.referenceVideoFiles[0] ?? null,
      referenceVideoUrl: files?.referenceVideoUrl ?? null,
      videoDuration: finalizedVideoDuration,
      wan3InputMode: job.provider === 'wan3' ? job.wan3InputMode : undefined,
      wan3Variant: job.provider === 'wan3' ? job.wan3Variant : undefined,
      seedanceInputMode: job.provider === 'seedance' ? job.seedanceInputMode : undefined,
      seedanceVariant: job.provider === 'seedance' ? job.seedanceVariant : undefined,
      videoOutputFormat: job.provider === 'seedance' ? job.seedanceOutputFormat : 'mp4',
      prompt: job.prompt,
    });
    if (
      !savedLocally
      || !await hasGalleryArtifact(job.id, 'video')
      || !await hasGalleryVideoReferences(job.id, referenceImages.length)
    ) {
      finalizingVideoJobsRef.current.delete(job.id);
      throw new Error('The video finished, but VeilPix could not verify its video and references in this browser\'s Album.');
    }
    markLocalDeliveryReceipt(job.id);
    try {
      await mediaDeliveryRecovery.acknowledgeGeneration(job.id);
    } catch {
      // The private delivery copy remains available and will be acknowledged
      // during the next startup recovery pass.
    }
    setGalleryRefreshTrigger(count => count + 1);
    clearPendingVideoJob(job.id);
  }, [clearPendingVideoJob, mediaDeliveryRecovery]);

  const recoverPendingVideo = useCallback(async (job: PendingVideoGeneration) => {
    if (recoveryRequestInFlightRef.current.has(job.id) || finalizingVideoJobsRef.current.has(job.id)) return;
    recoveryRequestInFlightRef.current.add(job.id);

    try {
      if (hasLocalDeliveryReceipt(job.id) || await hasGalleryArtifact(job.id, 'video')) {
        markLocalDeliveryReceipt(job.id);
        clearPendingVideoJob(job.id);
        return;
      }
      const status = await getVideoGenerationStatus(job.id);
      if (status.status === 'succeeded' && status.videoUrl) {
        await finalizeVideoGeneration({
          success: true,
          videoUrl: status.videoUrl,
          creditsUsed: status.creditsUsed,
          processingTime: status.processingTime,
        }, job);
        return;
      }

      if (status.status === 'failed') {
        clearPendingVideoJob(job.id);
        const failureMessage = status.message || 'The provider could not complete it.';
        if (isSafetyFilterError(failureMessage)) {
          setVideoError(null);
          setError(CONTENT_POLICY_ERROR_MESSAGE);
        } else {
          setVideoError(`Failed to generate video. ${failureMessage}`);
        }
        return;
      }

      if (status.delivered) {
        clearPendingVideoJob(job.id);
        setVideoError('This video was delivered to another browser before multi-browser delivery was enabled. It remains in that browser\'s Album.');
        return;
      }

      if (Date.now() - job.createdAt > GENERATION_RECOVERY_TIMEOUT_MS) {
        clearPendingVideoJob(job.id);
        setVideoError('We could not recover that video within 48 hours. Please contact support so the generation and credit charge can be reviewed.');
      }
    } catch {
      // A status check can also be suspended on mobile. Keep the durable job
      // and try again when the page becomes visible or the timer fires.
    } finally {
      recoveryRequestInFlightRef.current.delete(job.id);
    }
  }, [clearPendingVideoJob, finalizeVideoGeneration, getVideoGenerationStatus]);

  useEffect(() => {
    if (pendingVideoGenerations.length === 0 || !isLoaded || !isSignedIn) return;

    let timer: number | null = null;
    let disposed = false;

    const scheduleCheck = () => {
      if (disposed) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (document.visibilityState === 'visible') {
          await Promise.allSettled(pendingVideoGenerations.map(recoverPendingVideo));
        }
        scheduleCheck();
      }, 5000);
    };

    const checkNow = () => {
      if (document.visibilityState === 'visible') {
        for (const job of pendingVideoGenerations) void recoverPendingVideo(job);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkNow();
    };

    checkNow();
    scheduleCheck();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', checkNow);

    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', checkNow);
    };
  }, [isLoaded, isSignedIn, pendingVideoGenerations, recoverPendingVideo]);

  useEffect(() => {
    return () => revokeGalleryVideoObjectUrl();
  }, [revokeGalleryVideoObjectUrl]);

  /* ---------------- shared helpers ---------------- */
  const requireAuth = useCallback((): boolean => {
    if (isLoaded && !isSignedIn) {
      setShowSignupPrompt(true);
      return false;
    }
    return true;
  }, [isLoaded, isSignedIn]);

  const resetImageTools = useCallback(() => {
    setActiveTool('none');
    setEditHotspot(null);
    setDisplayHotspot(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
  }, []);

  useEffect(() => {
    if (!imageProviderSupportsReferences(imageGenerationOptions.provider) && activeTool === 'retouch') {
      resetImageTools();
    }
  }, [activeTool, imageGenerationOptions.provider, resetImageTools]);

  const addImageToHistory = useCallback((
    newImageFile: File,
    prompt = historyPrompts[historyIndex] ?? '',
    generationId?: string,
  ) => {
    const newHistory = history.slice(0, historyIndex + 1);
    const newHistoryPrompts = historyPrompts.slice(0, historyIndex + 1);
    newHistory.push(newImageFile);
    newHistoryPrompts.push(prompt);
    setHistory(newHistory);
    setHistoryPrompts(newHistoryPrompts);
    setHistoryIndex(newHistory.length - 1);
    setCrop(undefined);
    setCompletedCrop(undefined);
    saveToGallery(newImageFile, prompt, generationId).then(() => setGalleryRefreshTrigger(n => n + 1));
  }, [history, historyIndex, historyPrompts]);

  const clearPendingImageJob = useCallback((generationId: string) => {
    const next = pendingImageGenerationsRef.current.filter(job => job.id !== generationId);
    pendingImageGenerationsRef.current = next;
    setPendingImageGenerations(next);
    storePendingImageGenerations(next);
    activeGenerationIdsRef.current.delete(generationId);
  }, []);

  const finalizeImageGeneration = useCallback(async (
    response: ImageGenerationResponse,
    job: PendingImageGeneration,
  ) => {
    if (!response.success || !response.image || finalizingImageJobsRef.current.has(job.id)) return;
    finalizingImageJobsRef.current.add(job.id);

    try {
      const newImageFile = await generatedImageToFile(response.image, job.workflow);
      const savedLocally = await saveToGallery(newImageFile, job.prompt, job.id);
      if (!savedLocally || !await hasGalleryArtifact(job.id, 'image')) {
        throw new Error('The image finished, but VeilPix could not verify it in this browser\'s Album.');
      }
      markLocalDeliveryReceipt(job.id);
      try {
        await mediaDeliveryRecovery.acknowledgeGeneration(job.id);
      } catch {
        // Startup recovery will retry the acknowledgement without duplicating
        // the already-saved local Album item.
      }
      setGalleryRefreshTrigger(count => count + 1);

      setError(null);
      clearPendingImageJob(job.id);
    } catch (finalizeError) {
      finalizingImageJobsRef.current.delete(job.id);
      setError(getGenerationErrorMessage(finalizeError, 'The image finished, but VeilPix could not save it.'));
    }
  }, [clearPendingImageJob, mediaDeliveryRecovery]);

  const recoverPendingImage = useCallback(async (job: PendingImageGeneration) => {
    if (imageRecoveryRequestInFlightRef.current.has(job.id) || finalizingImageJobsRef.current.has(job.id)) return;
    imageRecoveryRequestInFlightRef.current.add(job.id);

    try {
      if (hasLocalDeliveryReceipt(job.id) || await hasGalleryArtifact(job.id, 'image')) {
        markLocalDeliveryReceipt(job.id);
        clearPendingImageJob(job.id);
        return;
      }
      const status = await getImageGenerationStatus(job.id);
      if (status.status === 'succeeded' && status.image) {
        await finalizeImageGeneration({
          success: true,
          image: status.image,
          creditsUsed: status.creditsUsed,
          processingTime: status.processingTime,
        }, job);
        return;
      }

      if (status.status === 'failed') {
        clearPendingImageJob(job.id);
        setError(`Failed to generate the image. ${status.message || 'The provider could not complete it.'}`);
        return;
      }

      if (status.delivered) {
        clearPendingImageJob(job.id);
        setError('This image was delivered to another browser before multi-browser delivery was enabled. It remains in that browser\'s Album.');
        return;
      }

      if (Date.now() - job.createdAt > GENERATION_RECOVERY_TIMEOUT_MS) {
        clearPendingImageJob(job.id);
        setError('We could not recover that image within 48 hours. Please contact support so the generation and credit charge can be reviewed.');
      }
    } catch {
      // Mobile browsers can suspend this status request too. Keep the job and
      // check it again when the page becomes visible or the timer fires.
    } finally {
      imageRecoveryRequestInFlightRef.current.delete(job.id);
    }
  }, [clearPendingImageJob, finalizeImageGeneration, getImageGenerationStatus]);

  useEffect(() => {
    if (pendingImageGenerations.length === 0 || !isLoaded || !isSignedIn) return;

    let timer: number | null = null;
    let disposed = false;

    const scheduleCheck = () => {
      if (disposed) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (document.visibilityState === 'visible') {
          await Promise.allSettled(pendingImageGenerations.map(recoverPendingImage));
        }
        scheduleCheck();
      }, 5000);
    };

    const checkNow = () => {
      if (document.visibilityState === 'visible') {
        for (const job of pendingImageGenerations) void recoverPendingImage(job);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkNow();
    };

    checkNow();
    scheduleCheck();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', checkNow);

    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', checkNow);
    };
  }, [isLoaded, isSignedIn, pendingImageGenerations, recoverPendingImage]);

  const restorePendingMediaDeliveries = useCallback(async () => {
    if (deliveryRecoveryInFlightRef.current || !isLoaded || !isSignedIn) return;
    deliveryRecoveryInFlightRef.current = true;
    let restoredCount = 0;

    try {
      const deliveries = await mediaDeliveryRecovery.list();
      for (const delivery of deliveries) {
        if (delivery.artifactType !== 'image' && delivery.artifactType !== 'video') continue;

        if (hasLocalDeliveryReceipt(delivery.generationId)) {
          if (pendingImageGenerations.some(job => job.id === delivery.generationId)) {
            clearPendingImageJob(delivery.generationId);
          }
          if (pendingVideoGenerations.some(job => job.id === delivery.generationId)) {
            clearPendingVideoJob(delivery.generationId);
          }
          continue;
        }

        let storedLocally = await hasGalleryArtifact(delivery.generationId, delivery.artifactType);
        let expectedVideoReferenceCount = 0;
        if (delivery.artifactType === 'image') {
          if (!storedLocally) {
            const file = await downloadDeliveryFile(
              delivery.downloadUrl,
              delivery.fileName,
              delivery.mimeType,
            );
            const prompt = pendingImageGenerations.find(job => job.id === delivery.generationId)?.prompt ?? '';
            storedLocally = await saveToGallery(file, prompt, delivery.generationId);
          }
        } else {
          const pendingJob = pendingVideoGenerations.find(job => job.id === delivery.generationId) ?? null;
          const provider = pendingJob?.provider ?? (delivery.provider.includes('seedance')
            ? 'seedance'
            : delivery.provider.includes('wan3') || delivery.provider.includes('wan-3')
              ? 'wan3'
              : 'wan');
          const deliveredSeedanceVariant = seedanceVariantFromDeliveryProvider(delivery.provider);
          const deliveredWan3Variant = wan3VariantFromDeliveryProvider(delivery.provider);
          let referenceImages: File[] = [];
          try {
            referenceImages = await getPendingVideoReferenceImages(delivery.generationId);
          } catch (storageError) {
            console.warn('Could not restore delivered video reference images:', storageError);
          }
          expectedVideoReferenceCount = referenceImages.length;
          const file = storedLocally
            ? null
            : await downloadDeliveryFile(
              delivery.downloadUrl,
              delivery.fileName,
              delivery.mimeType,
            );

          // Always call the video saver. If another recovery path already put
          // the output in the Album, this merges the reusable prompt/reference
          // context into that record without downloading the video again.
          storedLocally = await saveVideoToGallery({
            videoUrl: delivery.downloadUrl,
            videoFile: file,
            generationId: delivery.generationId,
            provider,
            referenceImage: referenceImages[0] ?? null,
            referenceImages,
            videoDuration: pendingJob && pendingJob.duration !== -1 ? pendingJob.duration : undefined,
            wan3InputMode: provider === 'wan3' ? pendingJob?.wan3InputMode : undefined,
            wan3Variant: provider === 'wan3' ? pendingJob?.wan3Variant ?? deliveredWan3Variant : undefined,
            seedanceInputMode: provider === 'seedance' ? pendingJob?.seedanceInputMode : undefined,
            seedanceVariant: provider === 'seedance' ? pendingJob?.seedanceVariant ?? deliveredSeedanceVariant : undefined,
            videoOutputFormat: provider === 'seedance' ? pendingJob?.seedanceOutputFormat : 'mp4',
            prompt: pendingJob?.prompt ?? '',
          });
        }

        const verified = storedLocally
          && await hasGalleryArtifact(delivery.generationId, delivery.artifactType)
          && (delivery.artifactType !== 'video'
            || await hasGalleryVideoReferences(delivery.generationId, expectedVideoReferenceCount));
        if (!verified) continue;

        markLocalDeliveryReceipt(delivery.generationId, delivery.expiresAt);
        await mediaDeliveryRecovery.acknowledge(delivery.id);
        if (pendingImageGenerations.some(job => job.id === delivery.generationId)) {
          clearPendingImageJob(delivery.generationId);
        }
        if (pendingVideoGenerations.some(job => job.id === delivery.generationId)) {
          clearPendingVideoJob(delivery.generationId);
        }
        restoredCount += 1;
      }

      if (restoredCount > 0) setGalleryRefreshTrigger(count => count + 1);
    } catch (deliveryError) {
      console.warn('Pending media delivery recovery will retry later:', deliveryError);
    } finally {
      deliveryRecoveryInFlightRef.current = false;
    }
  }, [
    clearPendingImageJob,
    clearPendingVideoJob,
    isLoaded,
    isSignedIn,
    mediaDeliveryRecovery,
    pendingImageGenerations,
    pendingVideoGenerations,
  ]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let timer: number | null = null;
    let disposed = false;

    const check = () => {
      if (!disposed && document.visibilityState === 'visible') {
        void restorePendingMediaDeliveries();
      }
    };
    const schedule = () => {
      if (disposed) return;
      timer = window.setTimeout(() => {
        check();
        schedule();
      }, 30_000);
    };

    check();
    schedule();
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [isLoaded, isSignedIn, restorePendingMediaDeliveries]);

  /* ---------------- image reference handlers ---------------- */
  const handleBaseImageSelect = useCallback((file: File | null) => {
    if (file && !requireAuth()) return;

    if (file) {
      setHistory([file]);
      setHistoryPrompts(['']);
      setHistoryIndex(0);
      setImagePrompt('');
      saveToGallery(file).then(() => setGalleryRefreshTrigger(n => n + 1));
    } else {
      setHistory([]);
      setHistoryPrompts([]);
      setHistoryIndex(-1);
      setStyleImage(null);
    }
    resetImageTools();
    setError(null);
  }, [requireAuth, resetImageTools]);

  const handleStyleImageSelect = useCallback((file: File | null) => {
    if (file && !requireAuth()) return;
    setStyleImage(file);
  }, [requireAuth]);

  const handleOpenWebcam = useCallback((target: 'base' | 'style') => {
    if (!requireAuth()) return;
    setWebcamTarget(target);
  }, [requireAuth]);

  const handleWebcamCapture = useCallback((file: File) => {
    if (webcamTarget === 'style') {
      setStyleImage(file);
    } else {
      handleBaseImageSelect(file);
    }
    setWebcamTarget(null);
  }, [webcamTarget, handleBaseImageSelect]);

  /* ---------------- concurrent generation registration ---------------- */
  const registerGeneration = useCallback((generation: GenerationSubmission): boolean => {
    if (activeGenerationIdsRef.current.size >= MAX_CONCURRENT_GENERATIONS) {
      const message = `You can have up to ${MAX_CONCURRENT_GENERATIONS} generations active at once.`;
      if (generation.kind === 'video') setVideoError(message);
      else setError(message);
      return false;
    }

    if (activeGenerationIdsRef.current.has(generation.job.id)) return false;
    activeGenerationIdsRef.current.add(generation.job.id);

    if (generation.kind === 'video') {
      const next = [...pendingVideoGenerationsRef.current, generation.job];
      pendingVideoGenerationsRef.current = next;
      setPendingVideoGenerations(next);
      storePendingVideoGenerations(next);
      setVideoError(null);
    } else {
      const next = [...pendingImageGenerationsRef.current, generation.job];
      pendingImageGenerationsRef.current = next;
      setPendingImageGenerations(next);
      storePendingImageGenerations(next);
      setError(null);
    }
    return true;
  }, []);

  const executeImageGeneration = useCallback(async (queued: ImageGenerationSubmission) => {
    const activeJob = queued.job;
    const { options, sourceImage, styleImage: queuedStyleImage, hotspot } = queued;
    const requestBase = {
      generationId: activeJob.id,
      resolution: options.resolution,
      aspectRatio: options.aspectRatio,
      seedreamTier: options.seedreamTier,
      outputFormat: options.outputFormat,
      nsfwFilterEnabled: queued.nsfwFilterEnabled,
    };
    const textMutation = textToImageMutationsByProvider[options.provider];
    const editableMutations = options.provider === 'zimage'
      ? null
      : editableImageMutationsByProvider[options.provider];

    try {
      let response: ImageGenerationResponse;

      if (activeJob.workflow === 'text-to-image') {
        response = await textMutation.mutateAsync({
          prompt: activeJob.prompt,
          ...requestBase,
        });
      } else if (activeJob.workflow === 'retouch' && sourceImage && hotspot && editableMutations) {
        response = await editableMutations.edit.mutateAsync({
          image: sourceImage,
          prompt: activeJob.prompt,
          x: hotspot.x,
          y: hotspot.y,
          ...requestBase,
        });
      } else if (activeJob.workflow === 'composite' && sourceImage && queuedStyleImage && editableMutations) {
        response = await editableMutations.composite.mutateAsync({
          image1: sourceImage,
          image2: queuedStyleImage,
          prompt: activeJob.prompt,
          ...requestBase,
        });
      } else if (sourceImage && editableMutations) {
        response = await editableMutations.adjust.mutateAsync({
          image: sourceImage,
          prompt: activeJob.prompt,
          ...requestBase,
        });
      } else {
        throw new Error('The selected image was unavailable.');
      }

      if (response.success && response.image) {
        await finalizeImageGeneration(response, activeJob);
      } else {
        throw new Error(response.message || 'Failed to generate image');
      }
    } catch (err) {
      if (shouldRecoverGeneration(err)) {
        setError(null);
        void recoverPendingImage(activeJob);
        console.warn('Image response was interrupted; recovery will continue in the background.', err);
        return;
      }

      clearPendingImageJob(activeJob.id);
      setError(getGenerationErrorMessage(err, 'Failed to generate the image.'));
      console.error(err);
    }
  }, [
    editableImageMutationsByProvider,
    textToImageMutationsByProvider,
    clearPendingImageJob,
    finalizeImageGeneration,
    recoverPendingImage,
  ]);

  const executeVideoGeneration = useCallback(async (queued: VideoGenerationSubmission) => {
    const {
      provider,
      prompt,
      duration,
      resolution,
      ratio,
      wanAudio = true,
      wanMultiShots = false,
      wan3Variant = 'standard',
      wan3InputMode: selectedWan3InputMode = 'references',
      wan3Audio = true,
      wan3Seed = null,
      seedanceVariant = 'regular',
      seedanceInputMode: selectedSeedanceInputMode = 'references',
      seedanceGenerateAudio = false,
      seedanceWebSearch = false,
      seedanceReturnLastFrame = false,
      seedanceOutputFormat = 'mp4',
    } = queued.options;
    const activeJob = queued.job;
    const wanHasReferenceVideo = Boolean(queued.referenceVideoFile || queued.referenceVideoUrl);
    const wanReferenceImagesForRequest = queued.wanReferenceImages.slice(0, wanHasReferenceVideo ? 4 : 5);
    const usesSeedanceFrameMode = selectedSeedanceInputMode === 'frames';
    const seedanceReferenceLimits = getSeedanceReferenceLimits(seedanceVariant);
    const selectedSeedanceReferenceImages = queued.seedanceReferenceImages.slice(0, seedanceReferenceLimits.images);
    const maxUploadedSeedanceVideos = Math.max(0, seedanceReferenceLimits.videos - (queued.seedanceReferenceVideoUrl ? 1 : 0));
    const selectedSeedanceReferenceVideos = queued.seedanceReferenceVideoFiles.slice(0, maxUploadedSeedanceVideos);
    const selectedSeedanceReferenceAudios = queued.seedanceReferenceAudioFiles.slice(0, seedanceReferenceLimits.audios);
    const selectedWan3ReferenceImages = queued.wan3ReferenceImages.slice(0, WAN3_REFERENCE_LIMITS.images);
    const selectedWan3ReferenceVideos = queued.wan3ReferenceVideoFiles.slice(0, WAN3_REFERENCE_LIMITS.videos);
    const selectedWan3ReferenceAudios = queued.wan3ReferenceAudioFiles.slice(0, WAN3_REFERENCE_LIMITS.audios);
    const pendingFiles: PendingVideoFiles = {
      generationId: activeJob.id,
      referenceImages: provider === 'seedance'
        ? usesSeedanceFrameMode
          ? [queued.seedanceFirstFrame, queued.seedanceLastFrame].filter((file): file is File => Boolean(file))
          : selectedSeedanceReferenceImages
        : provider === 'wan3'
          ? selectedWan3InputMode === 'frames'
            ? [queued.wan3FirstFrame, queued.wan3LastFrame].filter((file): file is File => Boolean(file))
            : selectedWan3ReferenceImages
        : wanReferenceImagesForRequest,
      referenceVideoFiles: provider === 'seedance'
        ? usesSeedanceFrameMode ? [] : selectedSeedanceReferenceVideos
        : provider === 'wan3'
          ? selectedWan3InputMode === 'references' ? selectedWan3ReferenceVideos : []
        : queued.referenceVideoFile ? [queued.referenceVideoFile] : [],
      referenceVideoUrl: provider === 'seedance'
        ? usesSeedanceFrameMode ? null : queued.seedanceReferenceVideoUrl
        : provider === 'wan3'
          ? null
        : queued.referenceVideoUrl,
    };

    try {
      await savePendingVideoReferenceImages(activeJob.id, pendingFiles.referenceImages);
    } catch (storageError) {
      // Do not block a paid generation if browser storage is unavailable. The
      // in-memory path can still preserve the references for this page load.
      console.warn('Could not persist pending video reference images:', storageError);
    }

    setVideoError(null);
    setError(null);
    pendingVideoFilesRef.current.set(activeJob.id, pendingFiles);

    try {
      let response: VideoGenerationResponse;

      if (provider === 'wan3') {
        response = await wan3VideoMutation.mutateAsync({
          generationId: activeJob.id,
          prompt,
          variant: wan3Variant,
          inputMode: selectedWan3InputMode,
          duration,
          resolution,
          aspectRatio: ratio,
          firstFrame: selectedWan3InputMode === 'frames' ? queued.wan3FirstFrame : null,
          lastFrame: selectedWan3InputMode === 'frames' ? queued.wan3LastFrame : null,
          referenceImages: selectedWan3InputMode === 'references' ? selectedWan3ReferenceImages : [],
          referenceVideos: selectedWan3InputMode === 'references' ? selectedWan3ReferenceVideos : [],
          referenceVideoDuration: selectedWan3InputMode === 'references' ? queued.wan3ReferenceVideoDuration : null,
          referenceAudios: selectedWan3InputMode === 'references' ? selectedWan3ReferenceAudios : [],
          referenceAudioDuration: selectedWan3InputMode === 'references' ? queued.wan3ReferenceAudioDuration : null,
          referenceFile: selectedWan3InputMode === 'file' ? queued.wan3ReferenceFile : null,
          referenceLink: selectedWan3InputMode === 'link' ? queued.wan3ReferenceLink : '',
          audio: wan3Audio,
          seed: wan3Seed,
          nsfwFilterEnabled: queued.nsfwFilterEnabled,
        });
      } else if (provider === 'seedance') {
        response = await seedanceVideoMutation.mutateAsync({
          generationId: activeJob.id,
          firstFrame: usesSeedanceFrameMode ? queued.seedanceFirstFrame : null,
          lastFrame: usesSeedanceFrameMode ? queued.seedanceLastFrame : null,
          referenceImages: usesSeedanceFrameMode ? [] : selectedSeedanceReferenceImages,
          referenceVideos: usesSeedanceFrameMode ? [] : selectedSeedanceReferenceVideos,
          referenceVideoUrl: usesSeedanceFrameMode ? null : queued.seedanceReferenceVideoUrl,
          referenceVideoDuration: usesSeedanceFrameMode ? null : queued.seedanceReferenceVideoDuration,
          referenceAudios: usesSeedanceFrameMode ? [] : selectedSeedanceReferenceAudios,
          referenceAudioDuration: usesSeedanceFrameMode ? null : queued.seedanceReferenceAudioDuration,
          prompt,
          variant: seedanceVariant,
          inputMode: selectedSeedanceInputMode,
          duration,
          resolution,
          aspectRatio: ratio,
          generateAudio: seedanceGenerateAudio,
          webSearch: seedanceWebSearch,
          returnLastFrame: seedanceReturnLastFrame,
          outputFormat: seedanceOutputFormat,
          nsfwFilterEnabled: queued.nsfwFilterEnabled,
        });
      } else if (wanReferenceImagesForRequest.length === 0 && !wanHasReferenceVideo) {
        response = await textToVideoMutation.mutateAsync({
          generationId: activeJob.id,
          prompt,
          duration,
          resolution,
          ratio,
          multiShots: wanMultiShots,
          nsfwFilterEnabled: queued.nsfwFilterEnabled,
        });
      } else if (wanReferenceImagesForRequest.length === 1 && !wanHasReferenceVideo) {
        response = await videoMutation.mutateAsync({
          generationId: activeJob.id,
          image: wanReferenceImagesForRequest[0],
          prompt,
          duration,
          resolution,
          audio: wanAudio,
          multiShots: wanMultiShots,
          nsfwFilterEnabled: queued.nsfwFilterEnabled,
        });
      } else {
        response = await referenceVideoMutation.mutateAsync({
          generationId: activeJob.id,
          images: wanReferenceImagesForRequest,
          video: queued.referenceVideoFile,
          referenceVideoUrl: queued.referenceVideoUrl,
          prompt,
          duration,
          resolution,
          ratio,
          nsfwFilterEnabled: queued.nsfwFilterEnabled,
        });
      }

      if (response.pending) {
        setVideoError(null);
        void recoverPendingVideo(activeJob);
      } else if (response.success && response.videoUrl) {
        await finalizeVideoGeneration(response, activeJob, pendingFiles);
      } else {
        throw new Error(response.message || 'Failed to generate video');
      }
    } catch (err) {
      if (shouldRecoverGeneration(err)) {
        setVideoError(null);
        void recoverPendingVideo(activeJob);
        console.warn('Video response was interrupted; recovery will continue in the background.', err);
        return;
      }

      clearPendingVideoJob(activeJob.id);
      const errorMessage = getApiErrorMessage(err);
      if (isSafetyFilterError(err)) {
        setError(CONTENT_POLICY_ERROR_MESSAGE);
      } else {
        setVideoError(`Failed to generate video. ${errorMessage}`);
      }
      console.error('Video generation error:', err);
    }
  }, [
    clearPendingVideoJob,
    finalizeVideoGeneration,
    recoverPendingVideo,
    videoMutation,
    referenceVideoMutation,
    textToVideoMutation,
    seedanceVideoMutation,
    wan3VideoMutation,
  ]);

  /* ---------------- image generation ---------------- */
  const handleGenerateImage = useCallback((submittedPrompt: string) => {
    if (!requireAuth()) return;

    const trimmedPrompt = submittedPrompt.trim();
    if (!trimmedPrompt) {
      setError('Describe what you want to create.');
      return;
    }

    const supportsReferences = imageProviderSupportsReferences(imageGenerationOptions.provider);
    const workflow: ImageWorkflow = supportsReferences && currentImage ? 'image-to-image' : 'text-to-image';
    const options = normalizeImageGenerationOptions(imageGenerationOptions, workflow);
    if (options.provider === 'zimage' && (trimmedPrompt.length < 3 || trimmedPrompt.length > 1000)) {
      setError('Z-Image prompts must be between 3 and 1000 characters.');
      return;
    }

    let recoverableWorkflow: RecoverableImageWorkflow;
    if (!supportsReferences || !currentImage) {
      recoverableWorkflow = 'text-to-image';
    } else if (activeTool === 'retouch') {
      if (!editHotspot) {
        setError('Tap a point on the image to select an area to edit.');
        return;
      }
      recoverableWorkflow = 'retouch';
    } else if (styleImage) {
      recoverableWorkflow = 'composite';
    } else {
      recoverableWorkflow = 'adjust';
    }

    const generationId = crypto.randomUUID();
    const generation: ImageGenerationSubmission = {
      kind: 'image',
      job: {
        id: generationId,
        provider: options.provider,
        prompt: trimmedPrompt,
        workflow: recoverableWorkflow,
        createdAt: Date.now(),
      },
      options: { ...options },
      sourceImage: currentImage,
      styleImage,
      hotspot: editHotspot ? { ...editHotspot } : null,
      nsfwFilterEnabled: settings.nsfwFilterEnabled,
    };
    if (registerGeneration(generation)) void executeImageGeneration(generation);
  }, [
    requireAuth,
    imageGenerationOptions,
    currentImage,
    activeTool,
    editHotspot,
    styleImage,
    settings.nsfwFilterEnabled,
    registerGeneration,
    executeImageGeneration,
  ]);

  /* ---------------- video generation ---------------- */
  const handleGenerateVideo = useCallback((options: VideoGenerateOptions) => {
    if (!requireAuth()) return;

    const generationId = crypto.randomUUID();
    const selectedSeedanceInputMode = options.seedanceInputMode ?? 'references';
    const generation: VideoGenerationSubmission = {
      kind: 'video',
      job: {
        id: generationId,
        provider: options.provider,
        prompt: options.prompt,
        duration: options.duration,
        resolution: options.resolution,
        ratio: options.ratio,
        seedanceVariant: options.provider === 'seedance' ? options.seedanceVariant ?? 'regular' : undefined,
        seedanceInputMode: options.provider === 'seedance' ? selectedSeedanceInputMode : undefined,
        seedanceOutputFormat: options.provider === 'seedance' ? options.seedanceOutputFormat ?? 'mp4' : undefined,
        wan3Variant: options.provider === 'wan3' ? options.wan3Variant ?? 'standard' : undefined,
        wan3InputMode: options.provider === 'wan3' ? options.wan3InputMode ?? 'references' : undefined,
        createdAt: Date.now(),
      },
      options: { ...options },
      wanReferenceImages: [...wanReferenceImages],
      referenceVideoFile,
      referenceVideoUrl,
      seedanceFirstFrame,
      seedanceLastFrame,
      seedanceReferenceImages: [...seedanceReferenceImages],
      seedanceReferenceVideoFiles: [...seedanceReferenceVideoFiles],
      seedanceReferenceVideoUrl,
      seedanceReferenceVideoDuration,
      seedanceReferenceAudioFiles: [...seedanceReferenceAudioFiles],
      seedanceReferenceAudioDuration,
      wan3FirstFrame,
      wan3LastFrame,
      wan3ReferenceImages: [...wan3ReferenceImages],
      wan3ReferenceVideoFiles: [...wan3ReferenceVideoFiles],
      wan3ReferenceVideoDuration,
      wan3ReferenceAudioFiles: [...wan3ReferenceAudioFiles],
      wan3ReferenceAudioDuration,
      wan3ReferenceFile,
      wan3ReferenceLink,
      nsfwFilterEnabled: settings.nsfwFilterEnabled,
    };
    if (registerGeneration(generation)) void executeVideoGeneration(generation);
  }, [
    requireAuth,
    registerGeneration,
    executeVideoGeneration,
    wanReferenceImages,
    referenceVideoFile,
    referenceVideoUrl,
    seedanceFirstFrame,
    seedanceLastFrame,
    seedanceReferenceImages,
    seedanceReferenceVideoFiles,
    seedanceReferenceVideoUrl,
    seedanceReferenceVideoDuration,
    seedanceReferenceAudioFiles,
    seedanceReferenceAudioDuration,
    wan3FirstFrame,
    wan3LastFrame,
    wan3ReferenceImages,
    wan3ReferenceVideoFiles,
    wan3ReferenceVideoDuration,
    wan3ReferenceAudioFiles,
    wan3ReferenceAudioDuration,
    wan3ReferenceFile,
    wan3ReferenceLink,
    settings.nsfwFilterEnabled,
  ]);

  /* ---------------- video reference handlers ---------------- */
  const handleWanReferenceImagesChange = useCallback((images: File[]) => {
    const hasReferenceVideo = Boolean(referenceVideoFile || referenceVideoUrl);
    setWanReferenceImages(images.slice(0, getWanMaxReferenceImages(hasReferenceVideo)));
    setVideoError(null);
  }, [referenceVideoFile, referenceVideoUrl]);

  const handleReferenceVideoSelect = useCallback(async (file: File | null) => {
    setReferenceVideoFile(file);
    setReferenceVideoUrl(null);
    setReferenceVideoDuration(file ? await getVideoDurationSeconds(file) : null);
    if (file) {
      setWanReferenceImages(prev => prev.slice(0, 4));
    }
    setVideoError(null);
  }, []);

  const handleSeedanceInputModeChange = useCallback((mode: SeedanceInputMode) => {
    setSeedanceInputMode(mode);
    if (mode === 'frames') {
      setSeedanceReferenceImages([]);
      setSeedanceReferenceVideoFiles([]);
      setSeedanceReferenceVideoUrl(null);
      setSeedanceReferenceVideoDuration(null);
      setSeedanceReferenceAudioFiles([]);
      setSeedanceReferenceAudioDuration(null);
    } else {
      setSeedanceFirstFrame(null);
      setSeedanceLastFrame(null);
    }
    setVideoError(null);
  }, []);

  const handleSeedanceFirstFrameSelect = useCallback((file: File | null) => {
    setSeedanceFirstFrame(file);
    if (!file) setSeedanceLastFrame(null);
    setVideoError(null);
  }, []);

  const handleSeedanceLastFrameSelect = useCallback((file: File | null) => {
    setSeedanceLastFrame(file);
    setVideoError(null);
  }, []);

  const handleSeedanceReferenceImagesChange = useCallback((images: File[]) => {
    setSeedanceReferenceImages(images.slice(0, SEEDANCE_MAX_REFERENCE_IMAGES));
    setVideoError(null);
  }, []);

  const handleSeedanceReferenceVideosChange = useCallback(async (files: File[]) => {
    setSeedanceInputMode('references');
    const selectedFiles = files.slice(0, 10);
    setSeedanceReferenceVideoFiles(selectedFiles);
    setSeedanceReferenceVideoUrl(null);
    const durations = await Promise.all(selectedFiles.map(getVideoDurationSeconds));
    setSeedanceReferenceVideoDuration(
      durations.length > 0 && durations.every((duration): duration is number => duration !== null)
        ? durations.reduce((total, duration) => total + duration, 0)
        : null
    );
    setVideoError(null);
  }, []);

  const handleSeedanceReferenceVideoUrlRemove = useCallback(() => {
    setSeedanceReferenceVideoUrl(null);
    if (seedanceReferenceVideoFiles.length === 0) setSeedanceReferenceVideoDuration(null);
    setVideoError(null);
  }, [seedanceReferenceVideoFiles.length]);

  const handleSeedanceReferenceAudiosChange = useCallback(async (files: File[]) => {
    setSeedanceInputMode('references');
    const selectedFiles = files.slice(0, 10);
    setSeedanceReferenceAudioFiles(selectedFiles);
    const durations = await Promise.all(selectedFiles.map(getVideoDurationSeconds));
    setSeedanceReferenceAudioDuration(
      durations.length > 0 && durations.every((duration): duration is number => duration !== null)
        ? durations.reduce((total, duration) => total + duration, 0)
        : null
    );
    setVideoError(null);
  }, []);

  const handleWan3InputModeChange = useCallback((mode: Wan3InputMode) => {
    setWan3InputMode(mode);
    if (mode !== 'frames') { setWan3FirstFrame(null); setWan3LastFrame(null); }
    if (mode !== 'references') {
      setWan3ReferenceImages([]);
      setWan3ReferenceVideoFiles([]);
      setWan3ReferenceVideoDuration(null);
      setWan3ReferenceAudioFiles([]);
      setWan3ReferenceAudioDuration(null);
    }
    if (mode !== 'file') setWan3ReferenceFile(null);
    if (mode !== 'link') setWan3ReferenceLink('');
    setVideoError(null);
  }, []);

  const handleWan3FirstFrameSelect = useCallback((file: File | null) => {
    setWan3FirstFrame(file);
    if (!file) setWan3LastFrame(null);
    setVideoError(null);
  }, []);

  const handleWan3ReferenceVideosChange = useCallback(async (files: File[]) => {
    const selectedFiles = files.slice(0, WAN3_REFERENCE_LIMITS.videos);
    setWan3ReferenceVideoFiles(selectedFiles);
    const durations = await Promise.all(selectedFiles.map(getVideoDurationSeconds));
    if (durations.some((value) => value !== null && (value < 1 || value > 15.25))) {
      setVideoError('Each Wan 3.0 reference video must be between 1 and 15 seconds.');
    }
    setWan3ReferenceVideoDuration(durations.length > 0 && durations.every((value): value is number => value !== null)
      ? durations.reduce((total, value) => total + value, 0)
      : null);
    if (!durations.some((value) => value !== null && (value < 1 || value > 15.25))) setVideoError(null);
  }, []);

  const handleWan3ReferenceAudiosChange = useCallback(async (files: File[]) => {
    const selectedFiles = files.slice(0, WAN3_REFERENCE_LIMITS.audios);
    setWan3ReferenceAudioFiles(selectedFiles);
    const durations = await Promise.all(selectedFiles.map(getVideoDurationSeconds));
    if (durations.some((value) => value !== null && (value < 1 || value > 15.25))) {
      setVideoError('Each Wan 3.0 reference audio file must be between 1 and 15 seconds.');
    }
    setWan3ReferenceAudioDuration(durations.length > 0 && durations.every((value): value is number => value !== null)
      ? durations.reduce((total, value) => total + value, 0)
      : null);
    if (!durations.some((value) => value !== null && (value < 1 || value > 15.25))) setVideoError(null);
  }, []);

  const handleVideoProviderChange = useCallback((nextProvider: VideoProvider) => {
    // A manual model choice supersedes any one-shot Album restoration request.
    setVideoModelRestoreRequest(null);
    if (nextProvider === videoProvider) return;

    if (videoProvider === 'seedance' && nextProvider === 'wan3') {
      if (seedanceInputMode === 'frames') {
        setWan3InputMode('frames');
        setWan3FirstFrame(seedanceFirstFrame);
        setWan3LastFrame(seedanceLastFrame);
      } else {
        setWan3InputMode('references');
        setWan3ReferenceImages(seedanceReferenceImages.slice(0, WAN3_REFERENCE_LIMITS.images));
        setWan3ReferenceVideoFiles(seedanceReferenceVideoFiles.slice(0, WAN3_REFERENCE_LIMITS.videos));
        setWan3ReferenceVideoDuration(seedanceReferenceVideoDuration);
        setWan3ReferenceAudioFiles(seedanceReferenceAudioFiles.slice(0, WAN3_REFERENCE_LIMITS.audios));
        setWan3ReferenceAudioDuration(seedanceReferenceAudioDuration);
      }
    } else if (videoProvider === 'wan3' && nextProvider === 'seedance') {
      if (wan3InputMode === 'frames') {
        setSeedanceInputMode('frames');
        setSeedanceFirstFrame(wan3FirstFrame);
        setSeedanceLastFrame(wan3LastFrame);
      } else if (wan3InputMode === 'references') {
        setSeedanceInputMode('references');
        const seedanceImagesWereCopiedToWan3 = areSameFiles(
          wan3ReferenceImages,
          seedanceReferenceImages.slice(0, WAN3_REFERENCE_LIMITS.images),
        );
        const seedanceVideosWereCopiedToWan3 = areSameFiles(
          wan3ReferenceVideoFiles,
          seedanceReferenceVideoFiles.slice(0, WAN3_REFERENCE_LIMITS.videos),
        );
        const seedanceAudiosWereCopiedToWan3 = areSameFiles(
          wan3ReferenceAudioFiles,
          seedanceReferenceAudioFiles.slice(0, WAN3_REFERENCE_LIMITS.audios),
        );
        if (!seedanceImagesWereCopiedToWan3) {
          setSeedanceReferenceImages(wan3ReferenceImages.slice(0, SEEDANCE_MAX_REFERENCE_IMAGES));
        }
        if (!seedanceVideosWereCopiedToWan3) {
          setSeedanceReferenceVideoFiles(wan3ReferenceVideoFiles.slice(0, SEEDANCE_MAX_REFERENCE_VIDEOS));
          setSeedanceReferenceVideoUrl(null);
        }
        setSeedanceReferenceVideoDuration(wan3ReferenceVideoDuration);
        if (!seedanceAudiosWereCopiedToWan3) {
          setSeedanceReferenceAudioFiles(wan3ReferenceAudioFiles.slice(0, SEEDANCE_MAX_REFERENCE_AUDIOS));
        }
        setSeedanceReferenceAudioDuration(wan3ReferenceAudioDuration);
      }
    }

    setVideoProvider(nextProvider);
    setVideoError(null);
  }, [
    seedanceFirstFrame,
    seedanceInputMode,
    seedanceLastFrame,
    seedanceReferenceAudioDuration,
    seedanceReferenceAudioFiles,
    seedanceReferenceImages,
    seedanceReferenceVideoDuration,
    seedanceReferenceVideoFiles,
    videoProvider,
    wan3FirstFrame,
    wan3InputMode,
    wan3LastFrame,
    wan3ReferenceAudioDuration,
    wan3ReferenceAudioFiles,
    wan3ReferenceImages,
    wan3ReferenceVideoDuration,
    wan3ReferenceVideoFiles,
  ]);

  const handleUseGeneratedVideoAsReference = useCallback(() => {
    if (!videoUrl) return;
    if (videoProvider === 'wan3') {
      setWan3InputMode('references');
      setWan3ReferenceVideoFiles(galleryVideoFile ? [galleryVideoFile] : []);
      setWan3ReferenceVideoDuration(null);
    } else if (videoProvider === 'seedance') {
      setSeedanceInputMode('references');
      setSeedanceReferenceVideoFiles(galleryVideoFile ? [galleryVideoFile] : []);
      setSeedanceReferenceVideoUrl(galleryVideoFile ? null : videoUrl);
      setSeedanceReferenceVideoDuration(null);
    } else {
      setReferenceVideoFile(galleryVideoFile);
      setReferenceVideoUrl(galleryVideoFile ? null : videoUrl);
      setReferenceVideoDuration(null);
      setWanReferenceImages(prev => prev.slice(0, 4));
    }
    clearVideoResult();
    setVideoError(null);
  }, [clearVideoResult, galleryVideoFile, videoProvider, videoUrl]);

  const handleContinueFromLastFrame = useCallback(async () => {
    const videoSource = galleryVideoFile || videoUrl;
    if (!videoLastFrameUrl && !videoSource) return;

    setIsExtractingLastFrame(true);
    setVideoError(null);

    try {
      let frameFile: File | null = null;

      if (videoLastFrameUrl) {
        try {
          const response = await fetch(videoLastFrameUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          if (blob.type && !blob.type.startsWith('image/')) {
            throw new Error(`unexpected content type ${blob.type}`);
          }
          const mimeType = blob.type || 'image/png';
          const extension = mimeType === 'image/jpeg'
            ? 'jpg'
            : mimeType === 'image/webp'
              ? 'webp'
              : 'png';
          const timestamp = Date.now();
          frameFile = new File([blob], `seedance-last-frame-${timestamp}.${extension}`, {
            type: mimeType,
            lastModified: timestamp,
          });
        } catch (providerFrameError) {
          console.warn('Could not download the provider-returned last frame; extracting it from the video instead.', providerFrameError);
        }
      }

      if (!frameFile) {
        if (!videoSource) throw new Error('The video is unavailable for fallback frame extraction.');
        frameFile = await extractLastVideoFrame(videoSource);
      }

      await saveToGallery(frameFile, videoPrompt);
      setGalleryRefreshTrigger(count => count + 1);
      setVideoProvider('seedance');
      setSeedanceInputMode('frames');
      setSeedanceFirstFrame(frameFile);
      setSeedanceLastFrame(null);
      clearVideoResult();
    } catch (extractError) {
      const details = extractError instanceof Error ? extractError.message : 'Please try again.';
      setVideoError(`Could not extract the last frame. ${details}`);
    } finally {
      setIsExtractingLastFrame(false);
    }
  }, [clearVideoResult, galleryVideoFile, videoLastFrameUrl, videoPrompt, videoUrl]);

  /* ---------------- mode + session ---------------- */
  const handleModeChange = useCallback((mode: StudioMode) => {
    setStudioMode(mode);
    setError(null);

    // Flow the current image into the video workflow as the start-image reference
    if (mode === 'video' && currentImage) {
      if (videoProvider === 'wan3') {
        const wan3HasInputs = Boolean(wan3FirstFrame)
          || wan3ReferenceImages.length > 0
          || wan3ReferenceVideoFiles.length > 0
          || Boolean(wan3ReferenceFile)
          || Boolean(wan3ReferenceLink);
        if (!wan3HasInputs) {
          setWan3InputMode('frames');
          setWan3FirstFrame(currentImage);
        }
      } else if (videoProvider === 'seedance') {
        const seedanceHasInputs = Boolean(seedanceFirstFrame)
          || seedanceReferenceImages.length > 0
          || Boolean(seedanceReferenceVideoFiles.length > 0 || seedanceReferenceVideoUrl);
        if (!seedanceHasInputs) {
          setSeedanceInputMode('frames');
          setSeedanceFirstFrame(currentImage);
        }
      } else if (wanReferenceImages.length === 0 && !referenceVideoFile && !referenceVideoUrl) {
        setWanReferenceImages([currentImage]);
      }
    }
  }, [
    videoProvider, currentImage, wanReferenceImages.length, referenceVideoFile, referenceVideoUrl,
    seedanceFirstFrame, seedanceReferenceImages.length, seedanceReferenceVideoFiles.length, seedanceReferenceVideoUrl,
    wan3FirstFrame, wan3ReferenceImages.length, wan3ReferenceVideoFiles.length, wan3ReferenceFile, wan3ReferenceLink,
  ]);

  const handleNewSession = useCallback(() => {
    setHistory([]);
    setHistoryPrompts([]);
    setHistoryIndex(-1);
    setImagePrompt('');
    setVideoPrompt('');
    setStyleImage(null);
    setError(null);
    setVideoError(null);
    resetImageTools();
    clearVideoResult();
    setWanReferenceImages([]);
    setReferenceVideoFile(null);
    setReferenceVideoUrl(null);
    setReferenceVideoDuration(null);
    setSeedanceInputMode('references');
    setSeedanceFirstFrame(null);
    setSeedanceLastFrame(null);
    setSeedanceReferenceImages([]);
    setSeedanceReferenceVideoFiles([]);
    setSeedanceReferenceVideoUrl(null);
    setSeedanceReferenceVideoDuration(null);
    setSeedanceReferenceAudioFiles([]);
    setSeedanceReferenceAudioDuration(null);
    setWan3InputMode('references');
    setWan3FirstFrame(null);
    setWan3LastFrame(null);
    setWan3ReferenceImages([]);
    setWan3ReferenceVideoFiles([]);
    setWan3ReferenceVideoDuration(null);
    setWan3ReferenceAudioFiles([]);
    setWan3ReferenceAudioDuration(null);
    setWan3ReferenceFile(null);
    setWan3ReferenceLink('');
  }, [clearVideoResult, resetImageTools]);

  /* ---------------- stage tools ---------------- */
  const handleToolChange = useCallback((tool: StageTool) => {
    if (tool === 'retouch' && !imageProviderSupportsReferences(imageGenerationOptions.provider)) {
      return;
    }
    setActiveTool(tool);
    setEditHotspot(null);
    setDisplayHotspot(null);
    if (tool !== 'crop') {
      setCrop(undefined);
      setCompletedCrop(undefined);
    }
    if (tool !== 'none') setShowSlider(false);
  }, [imageGenerationOptions.provider]);

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (activeTool !== 'retouch') return;

    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    setDisplayHotspot({ x: offsetX, y: offsetY });

    const { naturalWidth, naturalHeight, clientWidth, clientHeight } = img;
    const scaleX = naturalWidth / clientWidth;
    const scaleY = naturalHeight / clientHeight;

    setEditHotspot({ x: Math.round(offsetX * scaleX), y: Math.round(offsetY * scaleY) });
  }, [activeTool]);

  const handleApplyCrop = useCallback(() => {
    if (!completedCrop || !imgRef.current) {
      setError('Select an area to crop first.');
      return;
    }

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Could not process the crop.');
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = completedCrop.width * pixelRatio;
    canvas.height = completedCrop.height * pixelRatio;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height,
    );

    const croppedImageUrl = canvas.toDataURL('image/png');
    const newImageFile = dataURLtoFile(croppedImageUrl, `cropped-${Date.now()}.png`);
    addImageToHistory(newImageFile);
    setActiveTool('none');
  }, [completedCrop, addImageToHistory]);

  const handleUndo = useCallback(() => {
    if (canUndo) {
      setHistoryIndex(historyIndex - 1);
      setEditHotspot(null);
      setDisplayHotspot(null);
    }
  }, [canUndo, historyIndex]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      setHistoryIndex(historyIndex + 1);
      setEditHotspot(null);
      setDisplayHotspot(null);
    }
  }, [canRedo, historyIndex]);

  const handleReset = useCallback(() => {
    if (history.length > 0) {
      setHistoryIndex(0);
      setError(null);
      setEditHotspot(null);
      setDisplayHotspot(null);
    }
  }, [history]);

  const handleDownload = useCallback(() => {
    if (currentImage) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(currentImage);
      link.download = `edited-${currentImage.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }
  }, [currentImage]);

  const handleVideoDownload = useCallback(async () => {
    if (!videoUrl) return;

    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `veilpix-video-${Date.now()}.${videoOutputFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      window.open(videoUrl, '_blank', 'noopener,noreferrer');
    }
  }, [videoOutputFormat, videoUrl]);

  /* ---------------- gallery handlers ---------------- */
  const handleGallerySelectImage = useCallback((file: File, savedPrompt: string) => {
    if (isVideoEditorRendering) return;
    setIsVideoEditorOpen(false);
    setIncomingEditorVideo(null);
    setStudioMode('image');
    setHistory([file]);
    setHistoryPrompts([savedPrompt]);
    setHistoryIndex(0);
    setImagePrompt(savedPrompt);
    setStyleImage(null);
    resetImageTools();
    setError(null);
  }, [isVideoEditorRendering, resetImageTools]);

  const handleGallerySelectVideo = useCallback((details: GalleryVideoDetails) => {
    const selectedProvider = details.provider ?? videoProvider;
    const referenceImages = details.referenceImages.length > 0
      ? details.referenceImages
      : details.referenceImage
        ? [details.referenceImage]
        : [];

    setStudioMode('video');
    setVideoProvider(selectedProvider);
    setVideoModelRestoreRequest(current => ({
      revision: (current?.revision ?? 0) + 1,
      provider: selectedProvider,
      seedanceVariant: selectedProvider === 'seedance' ? details.seedanceVariant : undefined,
      wan3Variant: selectedProvider === 'wan3' ? details.wan3Variant : undefined,
    }));
    setVideoPrompt(details.prompt);
    setVideoOutputFormat(details.videoOutputFormat ?? 'mp4');
    setVideoLastFrameUrl(null);
    setReferenceVideoFile(null);
    setReferenceVideoUrl(null);
    setReferenceVideoDuration(null);
    setWanReferenceImages([]);
    setWan3ReferenceImages([]);
    setWan3ReferenceVideoFiles([]);
    setWan3ReferenceVideoDuration(null);
    setWan3ReferenceAudioFiles([]);
    setWan3ReferenceAudioDuration(null);
    setWan3ReferenceFile(null);
    setWan3ReferenceLink('');
    setWan3FirstFrame(null);
    setWan3LastFrame(null);
    setSeedanceReferenceImages([]);
    setSeedanceReferenceVideoFiles([]);
    setSeedanceReferenceVideoUrl(null);
    setSeedanceReferenceVideoDuration(null);
    setSeedanceReferenceAudioFiles([]);
    setSeedanceReferenceAudioDuration(null);
    if (selectedProvider === 'wan3') {
      const restoredInputMode = details.wan3InputMode ?? 'references';
      setWan3InputMode(restoredInputMode);
      setWan3FirstFrame(restoredInputMode === 'frames' ? referenceImages[0] ?? null : null);
      setWan3LastFrame(restoredInputMode === 'frames' ? referenceImages[1] ?? null : null);
      setWan3ReferenceImages(
        restoredInputMode === 'references'
          ? referenceImages.slice(0, WAN3_REFERENCE_LIMITS.images)
          : []
      );
    } else if (selectedProvider === 'seedance') {
      const restoredInputMode = details.seedanceInputMode ?? 'references';
      setSeedanceInputMode(restoredInputMode);
      setSeedanceFirstFrame(restoredInputMode === 'frames' ? referenceImages[0] ?? null : null);
      setSeedanceLastFrame(restoredInputMode === 'frames' ? referenceImages[1] ?? null : null);
      setSeedanceReferenceImages(
        restoredInputMode === 'references'
          ? referenceImages.slice(0, SEEDANCE_MAX_REFERENCE_IMAGES)
          : []
      );
    } else {
      setSeedanceFirstFrame(null);
      setSeedanceLastFrame(null);
      setWanReferenceImages(referenceImages.slice(0, 5));
    }
    if (details.videoFile) {
      showGalleryVideoResult(details.videoFile);
    } else {
      showRemoteVideoResult(details.videoUrl);
    }
    setVideoError(null);
  }, [showGalleryVideoResult, showRemoteVideoResult, videoProvider]);

  const handleEditorGallerySelectVideo = useCallback((details: GalleryVideoDetails) => {
    if (isVideoEditorRendering) return;
    setIncomingEditorVideo(details);
  }, [isVideoEditorRendering]);

  const handleOpenVideoEditor = useCallback(() => {
    setIncomingEditorVideo(null);
    setIsVideoEditorRendering(false);
    setIsVideoEditorOpen(true);
  }, []);

  const handleCloseVideoEditor = useCallback(() => {
    if (isVideoEditorRendering) return;
    setIncomingEditorVideo(null);
    setIsVideoEditorOpen(false);
  }, [isVideoEditorRendering]);

  const handleGalleryUseImageAsReference = useCallback((file: File, savedPrompt: string) => {
    if (studioMode === 'image') {
      if (!imageProviderSupportsReferences(imageGenerationOptions.provider)) return;
      if (!currentImage) {
        handleGallerySelectImage(file, savedPrompt);
        return;
      }
      setStyleImage(file);
    } else if (videoProvider === 'wan3') {
      setWan3InputMode('references');
      setWan3ReferenceImages(prev => [...prev, file].slice(0, WAN3_REFERENCE_LIMITS.images));
    } else if (videoProvider === 'seedance') {
      setSeedanceInputMode('references');
      setSeedanceReferenceImages(prev => [...prev, file].slice(0, SEEDANCE_MAX_REFERENCE_IMAGES));
    } else {
      const maxImages = getWanMaxReferenceImages(Boolean(referenceVideoFile || referenceVideoUrl));
      setWanReferenceImages(prev => [...prev, file].slice(0, maxImages));
    }
  }, [studioMode, imageGenerationOptions.provider, currentImage, handleGallerySelectImage, videoProvider, referenceVideoFile, referenceVideoUrl]);

  const handleGalleryUseVideoAsReference = useCallback((details: GalleryVideoDetails) => {
    setStudioMode('video');
    setVideoPrompt(details.prompt);
    if (videoProvider === 'wan3') {
      setWan3InputMode('references');
      setWan3ReferenceVideoFiles(details.videoFile ? [details.videoFile] : []);
      setWan3ReferenceVideoDuration(details.videoDuration ?? null);
    } else if (videoProvider === 'seedance') {
      setSeedanceInputMode('references');
      setSeedanceReferenceVideoFiles(details.videoFile ? [details.videoFile] : []);
      setSeedanceReferenceVideoUrl(details.videoFile ? null : details.videoUrl);
      setSeedanceReferenceVideoDuration(details.videoDuration ?? null);
    } else {
      setReferenceVideoFile(details.videoFile);
      setReferenceVideoUrl(details.videoFile ? null : details.videoUrl);
      setReferenceVideoDuration(details.videoDuration ?? null);
      setWanReferenceImages(prev => prev.slice(0, 4));
    }
    clearVideoResult();
    setVideoError(null);
  }, [clearVideoResult, videoProvider]);

  /* Right-click "send to" targets — adapt to the active mode, model, and settings */
  const galleryImageReferenceTargets: GalleryReferenceTarget[] = isVideoEditorOpen
    ? []
    : studioMode === 'image' && imageProviderSupportsReferences(imageGenerationOptions.provider)
    ? [
        { id: 'image-base', label: 'Use as base image' },
        ...(currentImage ? [{ id: 'image-style', label: 'Use as style reference' }] : []),
      ]
    : videoProvider === 'wan3'
      ? [
          { id: 'wan3-first', label: 'Use as first frame' },
          ...(wan3FirstFrame ? [{ id: 'wan3-last', label: 'Use as last frame' }] : []),
          { id: 'wan3-ref', label: 'Add as reference image' },
        ]
    : videoProvider === 'seedance'
      ? [
          { id: 'seedance-first', label: 'Use as first frame' },
          ...(seedanceFirstFrame ? [{ id: 'seedance-last', label: 'Use as last frame' }] : []),
          { id: 'seedance-ref', label: 'Add as reference image' },
        ]
      : [{ id: 'wan-ref', label: 'Add as reference image' }];

  const galleryVideoReferenceTargets: GalleryReferenceTarget[] = isVideoEditorOpen
    ? [{ id: 'video-editor-add', label: 'Add to Video Editor' }]
    : studioMode === 'video'
      ? [{ id: 'video-ref', label: 'Use as reference video' }]
      : [];

  const handleGalleryImageReferenceAction = useCallback((targetId: string, file: File, _prompt: string) => {
    switch (targetId) {
      case 'image-base':
        handleBaseImageSelect(file);
        break;
      case 'image-style':
        handleStyleImageSelect(file);
        break;
      case 'wan-ref': {
        const maxImages = getWanMaxReferenceImages(Boolean(referenceVideoFile || referenceVideoUrl));
        setWanReferenceImages(prev => [...prev, file].slice(0, maxImages));
        setVideoError(null);
        break;
      }
      case 'wan3-first':
        setWan3InputMode('frames');
        setWan3FirstFrame(file);
        setVideoError(null);
        break;
      case 'wan3-last':
        setWan3InputMode('frames');
        setWan3LastFrame(file);
        setVideoError(null);
        break;
      case 'wan3-ref':
        setWan3InputMode('references');
        setWan3ReferenceImages(prev => [...prev, file].slice(0, WAN3_REFERENCE_LIMITS.images));
        setVideoError(null);
        break;
      case 'seedance-first':
        setSeedanceInputMode('frames');
        setSeedanceFirstFrame(file);
        setVideoError(null);
        break;
      case 'seedance-last':
        setSeedanceInputMode('frames');
        setSeedanceLastFrame(file);
        setVideoError(null);
        break;
      case 'seedance-ref':
        setSeedanceInputMode('references');
        setSeedanceReferenceImages(prev => [...prev, file].slice(0, SEEDANCE_MAX_REFERENCE_IMAGES));
        setVideoError(null);
        break;
    }
  }, [handleBaseImageSelect, handleStyleImageSelect, referenceVideoFile, referenceVideoUrl]);

  const handleGalleryVideoReferenceAction = useCallback((targetId: string, details: GalleryVideoDetails) => {
    if (targetId === 'video-editor-add') {
      handleEditorGallerySelectVideo(details);
      return;
    }
    handleGalleryUseVideoAsReference(details);
  }, [handleEditorGallerySelectVideo, handleGalleryUseVideoAsReference]);

  /* ---------------- credit costs ---------------- */
  const imageWorkflow: ImageWorkflow = imageProviderSupportsReferences(imageGenerationOptions.provider) && currentImage
    ? 'image-to-image'
    : 'text-to-image';
  const normalizedImageOptions = normalizeImageGenerationOptions(imageGenerationOptions, imageWorkflow);
  const imageActionCreditCost = getImageCreditCost(
    normalizedImageOptions.provider,
    normalizedImageOptions.resolution,
    imageWorkflow,
    normalizedImageOptions.seedreamTier,
    currentImage && styleImage ? 2 : 0
  );

  /* ---------------- error banner ---------------- */
  const activeError = error || videoError;
  const isSafetyIssue = Boolean(error) && error === CONTENT_POLICY_ERROR_MESSAGE;

  const errorBanner = activeError ? (
    <div className={`glass-panel edge mx-auto mb-3 w-full max-w-3xl shrink-0 rounded-2xl p-4 animate-fade-in ${isSafetyIssue ? '' : ''}`} role="alert">
      <div className="flex flex-col gap-2.5">
        <p className={`text-sm font-semibold ${isSafetyIssue ? 'text-amber-200' : 'text-red-300'}`}>
          {isSafetyIssue
            ? (hasPurchasedCredits ? 'Content warning' : 'Age verification required')
            : 'Something went wrong'}
        </p>

        {isSafetyIssue ? (
          <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-gray-300">
            {hasPurchasedCredits && !settings.nsfwFilterEnabled ? (
              <p>
                Your request was blocked by the AI provider's built-in content filter. Although VeilStudio's
                content filter is disabled, the underlying model may enforce restrictions that cannot be
                overridden. Try rephrasing your prompt or switching models.
              </p>
            ) : hasPurchasedCredits ? (
              <p>
                Your request was flagged while the content filter is enabled. For supported consensual adult
                content, you can turn on After Dark by disabling the content filter in Settings. Individual
                providers may still enforce their own restrictions.
              </p>
            ) : (
              <p>
                Your request appears to contain adult content. VeilPix requires an account and age
                verification before supported consensual adult content can be generated. Age verification is
                completed when you purchase credits. After purchasing, open Settings and turn on After Dark by
                disabling the content filter.
              </p>
            )}
            <p className="text-xs font-medium text-gray-400">
              VeilPix strictly prohibits child sexual abuse material (CSAM) and non-consensual intimate
              imagery under all circumstances.
            </p>
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-gray-300">{activeError}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => { setError(null); setVideoError(null); }}
            className="edge glass-chip h-9 rounded-full px-4 text-xs font-semibold text-gray-200 hover:text-white"
          >
            Dismiss
          </button>
          {isSafetyIssue && !hasPurchasedCredits && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setShowPricingModal(true);
              }}
              className="btn-porcelain edge-strong h-9 rounded-full px-4 text-xs font-semibold"
            >
              Verify age &amp; purchase credits
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  /* ---------------- render ---------------- */
  return (
    <div className="min-h-dvh text-gray-100">
      {isLoaded && isSignedIn && (
        <link rel="preconnect" href="https://api.veilstudio.io" crossOrigin="anonymous" />
      )}
      {/* Mobile uses one document-level scroll so the studio, creations, and
          supporting content cannot move independently. Desktop keeps the
          fixed-height workspace and its separate creations rail. */}
      <div className="flex min-h-dvh flex-col md:h-dvh md:min-h-0">
      <Header
        onShowPricing={() => setShowPricingModal(true)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        hasPurchasedCredits={hasPurchasedCredits}
        onToggleGallery={() => document.getElementById('creations-gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />

      <div className="relative flex flex-1 flex-col overflow-visible md:min-h-0 md:flex-row md:overflow-hidden">
        {/* Main column: stage + composer */}
        <main className="studio-main flex min-h-full min-w-0 shrink-0 flex-col overflow-visible px-3 pb-9 sm:px-6 sm:pb-12 md:min-h-0 md:flex-1 md:shrink md:overflow-y-auto md:overflow-x-hidden md:ps-6 md:pe-[11.5rem] lg:ps-8 lg:pe-[13.5rem] xl:px-[13.5rem]">
          {isVideoEditorOpen ? (
            <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Spinner /></div>}>
              <VideoEditor
                onClose={handleCloseVideoEditor}
                incomingVideo={incomingEditorVideo}
                onIncomingVideoConsumed={() => setIncomingEditorVideo(null)}
                onSaved={() => setGalleryRefreshTrigger(n => n + 1)}
                onRenderingChange={setIsVideoEditorRendering}
              />
            </Suspense>
          ) : (
            <>
          <ResultStage
            mode={studioMode}
            isLoading={isProcessingFile}
            loadingLabel="Processing image…"
            currentImageUrl={currentImageUrl}
            originalImageUrl={originalImageUrl}
            previousImageUrl={previousImageUrl}
            canUndo={canUndo}
            canRedo={canRedo}
            isComparing={isComparing}
            onComparingChange={setIsComparing}
            showSlider={showSlider}
            onToggleSlider={() => setShowSlider(prev => !prev)}
            sliderCompareMode={sliderCompareMode}
            onSliderCompareModeChange={setSliderCompareMode}
            activeTool={activeTool}
            supportsImageEditing={imageProviderSupportsReferences(imageGenerationOptions.provider)}
            onToolChange={handleToolChange}
            displayHotspot={displayHotspot}
            onImageClick={handleImageClick}
            imgRef={imgRef}
            crop={crop}
            onCropChange={(c) => setCrop(c)}
            onCropComplete={setCompletedCrop}
            aspect={aspect}
            onAspectChange={setAspect}
            onApplyCrop={handleApplyCrop}
            cropReady={!!completedCrop?.width && completedCrop.width > 0}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onReset={handleReset}
            onDownload={handleDownload}
            videoUrl={videoUrl}
            onVideoDownload={handleVideoDownload}
            onContinueFromLastFrame={handleContinueFromLastFrame}
            onOpenVideoEditor={handleOpenVideoEditor}
            isExtractingLastFrame={isExtractingLastFrame}
          />

          {errorBanner}

          <div className="studio-composer-wrap mx-auto mb-[25px] w-full max-w-[62rem] shrink-0">
            <Composer
              mode={studioMode}
              onModeChange={handleModeChange}
              isLoading={isProcessingFile}
              activeGenerationCount={displayedActiveGenerationCount}
              activeGenerationLimit={MAX_CONCURRENT_GENERATIONS}
              prompt={studioMode === 'video' ? videoPrompt : imagePrompt}
              onPromptChange={studioMode === 'video' ? setVideoPrompt : setImagePrompt}
              onNewSession={handleNewSession}
              imageOptions={imageGenerationOptions}
              onImageOptionsChange={handleImageOptionsChange}
              baseImage={currentImage}
              onBaseImageSelect={handleBaseImageSelect}
              styleImage={styleImage}
              onStyleImageSelect={handleStyleImageSelect}
              onOpenWebcam={handleOpenWebcam}
              retouchActive={activeTool === 'retouch'}
              hasHotspot={Boolean(editHotspot)}
              imageCreditCost={imageActionCreditCost}
              onGenerateImage={handleGenerateImage}
              videoProvider={videoProvider}
              onVideoProviderChange={handleVideoProviderChange}
              videoModelRestoreRequest={videoModelRestoreRequest}
              onGenerateVideo={handleGenerateVideo}
              hasGeneratedVideo={Boolean(videoUrl)}
              onUseGeneratedVideoAsReference={handleUseGeneratedVideoAsReference}
              wanReferenceImages={wanReferenceImages}
              onWanReferenceImagesChange={handleWanReferenceImagesChange}
              referenceVideoFile={referenceVideoFile}
              referenceVideoUrl={referenceVideoUrl}
              onReferenceVideoSelect={handleReferenceVideoSelect}
              wan3InputMode={wan3InputMode}
              onWan3InputModeChange={handleWan3InputModeChange}
              wan3FirstFrame={wan3FirstFrame}
              onWan3FirstFrameSelect={handleWan3FirstFrameSelect}
              wan3LastFrame={wan3LastFrame}
              onWan3LastFrameSelect={setWan3LastFrame}
              wan3ReferenceImages={wan3ReferenceImages}
              onWan3ReferenceImagesChange={(files) => setWan3ReferenceImages(files.slice(0, WAN3_REFERENCE_LIMITS.images))}
              wan3ReferenceVideoFiles={wan3ReferenceVideoFiles}
              onWan3ReferenceVideosChange={handleWan3ReferenceVideosChange}
              wan3ReferenceVideoDuration={wan3ReferenceVideoDuration}
              wan3ReferenceAudioFiles={wan3ReferenceAudioFiles}
              onWan3ReferenceAudiosChange={handleWan3ReferenceAudiosChange}
              wan3ReferenceAudioDuration={wan3ReferenceAudioDuration}
              wan3ReferenceFile={wan3ReferenceFile}
              onWan3ReferenceFileChange={setWan3ReferenceFile}
              wan3ReferenceLink={wan3ReferenceLink}
              onWan3ReferenceLinkChange={setWan3ReferenceLink}
              seedanceInputMode={seedanceInputMode}
              onSeedanceInputModeChange={handleSeedanceInputModeChange}
              seedanceFirstFrame={seedanceFirstFrame}
              onSeedanceFirstFrameSelect={handleSeedanceFirstFrameSelect}
              seedanceLastFrame={seedanceLastFrame}
              onSeedanceLastFrameSelect={handleSeedanceLastFrameSelect}
              seedanceReferenceImages={seedanceReferenceImages}
              onSeedanceReferenceImagesChange={handleSeedanceReferenceImagesChange}
              seedanceReferenceVideoFiles={seedanceReferenceVideoFiles}
              seedanceReferenceVideoUrl={seedanceReferenceVideoUrl}
              onSeedanceReferenceVideosChange={handleSeedanceReferenceVideosChange}
              onSeedanceReferenceVideoUrlRemove={handleSeedanceReferenceVideoUrlRemove}
              seedanceReferenceVideoDuration={seedanceReferenceVideoDuration}
              seedanceReferenceAudioFiles={seedanceReferenceAudioFiles}
              seedanceReferenceAudioDuration={seedanceReferenceAudioDuration}
              onSeedanceReferenceAudiosChange={handleSeedanceReferenceAudiosChange}
            />
          </div>
            </>
          )}
        </main>

        {/* Creations rail (desktop) */}
        <GalleryRail
          refreshTrigger={galleryRefreshTrigger}
          pendingItems={pendingGalleryItems}
          onSelectImage={handleGallerySelectImage}
          onSelectVideo={isVideoEditorOpen ? handleEditorGallerySelectVideo : handleGallerySelectVideo}
          onUseImageAsReference={handleGalleryUseImageAsReference}
          onUseVideoAsReference={!isVideoEditorOpen && studioMode === 'video' ? handleGalleryUseVideoAsReference : undefined}
          showReferenceActions={!isVideoEditorOpen && !(studioMode === 'image' && !imageProviderSupportsReferences(imageGenerationOptions.provider))}
          imageReferenceTargets={galleryImageReferenceTargets}
          videoReferenceTargets={galleryVideoReferenceTargets}
          onImageReferenceAction={handleGalleryImageReferenceAction}
          onVideoReferenceAction={handleGalleryVideoReferenceAction}
        />
      </div>
      </div>

      {/* Crawlable supporting content begins below the complete studio viewport. */}
      <Suspense fallback={null}>
        <StudioBelowFold />
      </Suspense>

      <Footer onShowPricing={() => setShowPricingModal(true)} />

      {/* Webcam overlay */}
      {webcamTarget && (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/85 p-4 backdrop-blur-sm">
          <div className="flex min-h-full items-center justify-center">
            <Suspense fallback={<Spinner />}>
              <WebcamCapture onCapture={handleWebcamCapture} onBack={() => setWebcamTarget(null)} />
            </Suspense>
          </div>
        </div>
      )}

      {/* Payment Success Modal */}
      {showPaymentSuccess && (
        <Suspense fallback={null}>
          <PaymentSuccess
            sessionId={paymentSessionId || undefined}
            onClose={() => {
              setShowPaymentSuccess(false);
              setPaymentSessionId(null);
            }}
          />
        </Suspense>
      )}

      {/* Payment Cancelled Modal */}
      {showPaymentCancelled && (
        <Suspense fallback={null}>
          <PaymentCancelled
            onClose={() => setShowPaymentCancelled(false)}
            onRetry={() => setShowPaymentCancelled(false)}
          />
        </Suspense>
      )}

      {/* Pricing Modal */}
      {showPricingModal && (
        <Suspense fallback={null}>
          <PricingModal
            isOpen={showPricingModal}
            onClose={() => setShowPricingModal(false)}
          />
        </Suspense>
      )}

      {/* Signup Prompt Modal */}
      {showSignupPrompt && (
        <Suspense fallback={null}>
          <SignupPromptModal
            isOpen={showSignupPrompt}
            onClose={() => setShowSignupPrompt(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default App;
