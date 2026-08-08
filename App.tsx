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
  useGenerateVideo,
  useGenerateReferenceToVideo,
  useGenerateTextToVideo,
  useGenerateSeedanceVideo,
  useVideoGenerationRecovery,
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
import GalleryRail, { type GalleryReferenceTarget } from './components/studio/GalleryRail';
import type { StudioMode, StageTool, VideoProvider, SeedanceVariant, SeedanceInputMode, SeedanceOutputFormat, VideoGenerateOptions } from './components/studio/types';
import { getWanMaxReferenceImages, getSeedanceReferenceLimits, SEEDANCE_MAX_REFERENCE_IMAGES } from './components/studio/videoPricing';
import { debouncedSaveWorkflow, saveToGallery, saveVideoToGallery, type GalleryVideoDetails } from './src/utils/workflowStorage';
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
      finish(Number.isFinite(video.duration) ? Math.ceil(video.duration) : null);
    };
    video.onerror = () => finish(null);
    video.src = objectUrl || (source as string);
  });
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
    'not approved', 'moderation provider', 'failed the review'
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
const PENDING_VIDEO_STORAGE_KEY = 'veilpix-pending-video-generation';
const VIDEO_RECOVERY_TIMEOUT_MS = 30 * 60 * 1000;

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
  createdAt: number;
}

interface PendingVideoFiles {
  generationId: string;
  referenceImages: File[];
  referenceVideoFiles: File[];
  referenceVideoUrl: string | null;
}

function readPendingVideoGeneration(): PendingVideoGeneration | null {
  try {
    const raw = localStorage.getItem(PENDING_VIDEO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingVideoGeneration>;
    if (
      typeof parsed.id !== 'string' ||
      (parsed.provider !== 'wan' && parsed.provider !== 'seedance') ||
      typeof parsed.prompt !== 'string' ||
      typeof parsed.duration !== 'number' ||
      typeof parsed.resolution !== 'string' ||
      typeof parsed.ratio !== 'string' ||
      typeof parsed.createdAt !== 'number'
    ) {
      localStorage.removeItem(PENDING_VIDEO_STORAGE_KEY);
      return null;
    }
    return parsed as PendingVideoGeneration;
  } catch {
    return null;
  }
}

function storePendingVideoGeneration(job: PendingVideoGeneration | null): void {
  try {
    if (job) localStorage.setItem(PENDING_VIDEO_STORAGE_KEY, JSON.stringify(job));
    else localStorage.removeItem(PENDING_VIDEO_STORAGE_KEY);
  } catch {
    // Recovery still works during this page lifetime when storage is unavailable.
  }
}

function isNetworkInterruption(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { status?: number }).status === 0);
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

  const activeEditableImageMutations = imageGenerationOptions.provider === 'zimage'
    ? null
    : editableImageMutationsByProvider[imageGenerationOptions.provider];
  const activeTextToImageMutation = textToImageMutationsByProvider[imageGenerationOptions.provider]
    ?? textToImageMutationsByProvider.seedream;

  const videoMutation = useGenerateVideo();
  const referenceVideoMutation = useGenerateReferenceToVideo();
  const textToVideoMutation = useGenerateTextToVideo();
  const seedanceVideoMutation = useGenerateSeedanceVideo();
  const getVideoGenerationStatus = useVideoGenerationRecovery();

  /* ---------------- video state ---------------- */
  const [videoProvider, setVideoProvider] = useState<VideoProvider>(() => {
    try {
      const stored = localStorage.getItem('veilpix-video-provider');
      if (stored === 'wan' || stored === 'seedance') return stored;
    } catch { /* storage unavailable */ }
    return 'seedance';
  });

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
  const [pendingVideoGeneration, setPendingVideoGeneration] = useState<PendingVideoGeneration | null>(
    () => readPendingVideoGeneration()
  );
  const pendingVideoFilesRef = useRef<PendingVideoFiles | null>(null);
  const finalizingVideoJobsRef = useRef(new Set<string>());
  const recoveryRequestInFlightRef = useRef(false);
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

  const isVideoPending = Boolean(pendingVideoGeneration)
    || videoMutation.isPending
    || referenceVideoMutation.isPending
    || textToVideoMutation.isPending
    || seedanceVideoMutation.isPending;
  const isImagePending = editNB2.isPending || editSeeDream.isPending || editWan.isPending
    || adjustNB2.isPending || adjustSeeDream.isPending || adjustWan.isPending
    || compositeNB2.isPending || compositeSeeDream.isPending || compositeWan.isPending
    || textToImageNB2.isPending || textToImageSeeDream.isPending || textToImageWan.isPending
    || textToImageZImage.isPending;
  const isLoading = isImagePending || isVideoPending || isProcessingFile;

  const loadingLabel = isProcessingFile
    ? 'Processing image…'
    : isVideoPending
      ? 'Rendering your video — you can leave this tab and return later.'
      : 'Creating…';

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
    setPendingVideoGeneration(current => current?.id === generationId ? null : current);
    const stored = readPendingVideoGeneration();
    if (stored?.id === generationId) storePendingVideoGeneration(null);
    if (pendingVideoFilesRef.current?.generationId === generationId) {
      pendingVideoFilesRef.current = null;
    }
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
      : pendingVideoFilesRef.current?.generationId === job.id
        ? pendingVideoFilesRef.current
        : null;

    setStudioMode('video');
    setVideoProvider(job.provider);
    setVideoPrompt(job.prompt);
    if (job.provider === 'seedance' && job.seedanceInputMode) {
      setSeedanceInputMode(job.seedanceInputMode);
    }
    setVideoOutputFormat(job.provider === 'seedance' ? job.seedanceOutputFormat ?? 'mp4' : 'mp4');
    setVideoLastFrameUrl(response.lastFrameUrl ?? null);
    showRemoteVideoResult(response.videoUrl);
    setVideoError(null);
    const finalizedVideoDuration = job.duration === -1
      ? await getVideoDurationSeconds(response.videoUrl) ?? 30
      : job.duration;

    await saveVideoToGallery({
      videoUrl: response.videoUrl,
      generationId: job.id,
      provider: job.provider,
      referenceImage: files?.referenceImages[0] ?? null,
      referenceImages: files?.referenceImages ?? [],
      referenceVideoFile: files?.referenceVideoFiles[0] ?? null,
      referenceVideoUrl: files?.referenceVideoUrl ?? null,
      videoDuration: finalizedVideoDuration,
      seedanceInputMode: job.provider === 'seedance' ? job.seedanceInputMode : undefined,
      seedanceVariant: job.provider === 'seedance' ? job.seedanceVariant : undefined,
      videoOutputFormat: job.provider === 'seedance' ? job.seedanceOutputFormat : 'mp4',
      prompt: job.prompt,
    });
    setGalleryRefreshTrigger(count => count + 1);
    clearPendingVideoJob(job.id);
  }, [clearPendingVideoJob, showRemoteVideoResult]);

  const recoverPendingVideo = useCallback(async (job: PendingVideoGeneration) => {
    if (recoveryRequestInFlightRef.current || finalizingVideoJobsRef.current.has(job.id)) return;
    recoveryRequestInFlightRef.current = true;

    try {
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
        setVideoError(`Failed to generate video. ${status.message || 'The provider could not complete it.'}`);
        return;
      }

      if (Date.now() - job.createdAt > VIDEO_RECOVERY_TIMEOUT_MS) {
        clearPendingVideoJob(job.id);
        setVideoError('We could not recover that video after 30 minutes. Please contact support so the generation and credit charge can be reviewed.');
      }
    } catch {
      // A status check can also be suspended on mobile. Keep the durable job
      // and try again when the page becomes visible or the timer fires.
    } finally {
      recoveryRequestInFlightRef.current = false;
    }
  }, [clearPendingVideoJob, finalizeVideoGeneration, getVideoGenerationStatus]);

  useEffect(() => {
    if (!pendingVideoGeneration || !isLoaded || !isSignedIn) return;

    let timer: number | null = null;
    let disposed = false;

    const scheduleCheck = () => {
      if (disposed) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (document.visibilityState === 'visible') {
          await recoverPendingVideo(pendingVideoGeneration);
        }
        scheduleCheck();
      }, 5000);
    };

    const checkNow = () => {
      if (document.visibilityState === 'visible') {
        void recoverPendingVideo(pendingVideoGeneration);
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
  }, [isLoaded, isSignedIn, pendingVideoGeneration, recoverPendingVideo]);

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

  const addImageToHistory = useCallback((newImageFile: File, prompt = historyPrompts[historyIndex] ?? '') => {
    const newHistory = history.slice(0, historyIndex + 1);
    const newHistoryPrompts = historyPrompts.slice(0, historyIndex + 1);
    newHistory.push(newImageFile);
    newHistoryPrompts.push(prompt);
    setHistory(newHistory);
    setHistoryPrompts(newHistoryPrompts);
    setHistoryIndex(newHistory.length - 1);
    setCrop(undefined);
    setCompletedCrop(undefined);
    saveToGallery(newImageFile, prompt).then(() => setGalleryRefreshTrigger(n => n + 1));
  }, [history, historyIndex, historyPrompts]);

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

  /* ---------------- image generation ---------------- */
  const handleGenerateImage = useCallback(async (submittedPrompt: string) => {
    if (!requireAuth()) return;

    const trimmedPrompt = submittedPrompt.trim();
    if (!trimmedPrompt) {
      setError('Describe what you want to create.');
      return;
    }
    setImagePrompt(trimmedPrompt);

    const supportsReferences = imageProviderSupportsReferences(imageGenerationOptions.provider);
    const workflow: ImageWorkflow = supportsReferences && currentImage ? 'image-to-image' : 'text-to-image';
    const options = normalizeImageGenerationOptions(imageGenerationOptions, workflow);
    if (options.provider === 'zimage' && (trimmedPrompt.length < 3 || trimmedPrompt.length > 1000)) {
      setError('Z-Image prompts must be between 3 and 1000 characters.');
      return;
    }
    const requestBase = {
      resolution: options.resolution,
      aspectRatio: options.aspectRatio,
      seedreamTier: options.seedreamTier,
      outputFormat: options.outputFormat,
      nsfwFilterEnabled: settings.nsfwFilterEnabled,
    };

    setError(null);

    try {
      if (!supportsReferences || !currentImage) {
        const response = await activeTextToImageMutation.mutateAsync({
          prompt: trimmedPrompt,
          ...requestBase,
        });
        if (response.success && response.image) {
          const newImageFile = await generatedImageToFile(response.image, 'text-to-image');
          setHistory([newImageFile]);
          setHistoryPrompts([trimmedPrompt]);
          setHistoryIndex(0);
          setStyleImage(null);
          resetImageTools();
          saveToGallery(newImageFile, trimmedPrompt).then(() => setGalleryRefreshTrigger(n => n + 1));
        } else {
          throw new Error(response.message || 'Failed to generate image from text');
        }
      } else if (activeTool === 'retouch' && currentImage) {
        if (!editHotspot) {
          setError('Tap a point on the image to select an area to edit.');
          return;
        }
        const response = await activeEditableImageMutations!.edit.mutateAsync({
          image: currentImage,
          prompt: trimmedPrompt,
          x: editHotspot.x,
          y: editHotspot.y,
          ...requestBase,
        });
        if (response.success && response.image) {
          const newImageFile = await generatedImageToFile(response.image, 'edited');
          addImageToHistory(newImageFile, trimmedPrompt);
          setEditHotspot(null);
          setDisplayHotspot(null);
          setActiveTool('none');
        } else {
          throw new Error(response.message || 'Failed to generate image');
        }
      } else if (currentImage && styleImage) {
        const response = await activeEditableImageMutations!.composite.mutateAsync({
          image1: currentImage,
          image2: styleImage,
          prompt: trimmedPrompt,
          ...requestBase,
        });
        if (response.success && response.image) {
          const newImageFile = await generatedImageToFile(response.image, 'composite');
          addImageToHistory(newImageFile, trimmedPrompt);
          setStyleImage(null);
        } else {
          throw new Error(response.message || 'Failed to combine the images');
        }
      } else if (currentImage) {
        const response = await activeEditableImageMutations!.adjust.mutateAsync({
          image: currentImage,
          prompt: trimmedPrompt,
          ...requestBase,
        });
        if (response.success && response.image) {
          const newImageFile = await generatedImageToFile(response.image, 'adjusted');
          addImageToHistory(newImageFile, trimmedPrompt);
        } else {
          throw new Error(response.message || 'Failed to apply the edit');
        }
      }
    } catch (err) {
      setError(getGenerationErrorMessage(err, 'Failed to generate the image.'));
      console.error(err);
    }
  }, [
    requireAuth, currentImage, styleImage, activeTool, editHotspot,
    imageGenerationOptions, settings.nsfwFilterEnabled, activeEditableImageMutations,
    activeTextToImageMutation, addImageToHistory, resetImageTools,
  ]);

  /* ---------------- video generation ---------------- */
  const handleGenerateVideo = useCallback(async (options: VideoGenerateOptions) => {
    if (!requireAuth()) return;
    if (pendingVideoGeneration) {
      setVideoError('Your previous video is still being recovered. Please wait for it to finish.');
      return;
    }

    const {
      provider,
      prompt,
      duration,
      resolution,
      ratio,
      wanAudio = true,
      wanMultiShots = false,
      seedanceVariant = 'regular',
      seedanceInputMode: selectedSeedanceInputMode = 'references',
      seedanceGenerateAudio = false,
      seedanceWebSearch = false,
      seedanceReturnLastFrame = false,
      seedanceOutputFormat = 'mp4'
    } = options;

    const generationId = crypto.randomUUID();
    const pendingJob: PendingVideoGeneration = {
      id: generationId,
      provider,
      prompt,
      duration,
      resolution,
      ratio,
      seedanceVariant: provider === 'seedance' ? seedanceVariant : undefined,
      seedanceInputMode: provider === 'seedance' ? selectedSeedanceInputMode : undefined,
      seedanceOutputFormat: provider === 'seedance' ? seedanceOutputFormat : undefined,
      createdAt: Date.now(),
    };
    const wanHasReferenceVideo = Boolean(referenceVideoFile || referenceVideoUrl);
    const wanReferenceImagesForRequest = wanReferenceImages.slice(0, wanHasReferenceVideo ? 4 : 5);
    const usesSeedanceFrameMode = selectedSeedanceInputMode === 'frames';
    const seedanceReferenceLimits = getSeedanceReferenceLimits(seedanceVariant);
    const selectedSeedanceReferenceImages = seedanceReferenceImages.slice(0, seedanceReferenceLimits.images);
    const maxUploadedSeedanceVideos = Math.max(0, seedanceReferenceLimits.videos - (seedanceReferenceVideoUrl ? 1 : 0));
    const selectedSeedanceReferenceVideos = seedanceReferenceVideoFiles.slice(0, maxUploadedSeedanceVideos);
    const selectedSeedanceReferenceAudios = seedanceReferenceAudioFiles.slice(0, seedanceReferenceLimits.audios);
    const pendingFiles: PendingVideoFiles = {
      generationId,
      referenceImages: provider === 'seedance'
        ? usesSeedanceFrameMode
          ? [seedanceFirstFrame, seedanceLastFrame].filter((file): file is File => Boolean(file))
          : selectedSeedanceReferenceImages
        : wanReferenceImagesForRequest,
      referenceVideoFiles: provider === 'seedance'
        ? usesSeedanceFrameMode ? [] : selectedSeedanceReferenceVideos
        : referenceVideoFile ? [referenceVideoFile] : [],
      referenceVideoUrl: provider === 'seedance'
        ? usesSeedanceFrameMode ? null : seedanceReferenceVideoUrl
        : referenceVideoUrl,
    };

    setVideoError(null);
    setError(null);
    setVideoPrompt(prompt);
    clearVideoResult();
    pendingVideoFilesRef.current = pendingFiles;
    setPendingVideoGeneration(pendingJob);
    storePendingVideoGeneration(pendingJob);

    try {
      let response: VideoGenerationResponse;

      if (provider === 'seedance') {
        response = await seedanceVideoMutation.mutateAsync({
          generationId,
          firstFrame: usesSeedanceFrameMode ? seedanceFirstFrame : null,
          lastFrame: usesSeedanceFrameMode ? seedanceLastFrame : null,
          referenceImages: usesSeedanceFrameMode ? [] : selectedSeedanceReferenceImages,
          referenceVideos: usesSeedanceFrameMode ? [] : selectedSeedanceReferenceVideos,
          referenceVideoUrl: usesSeedanceFrameMode ? null : seedanceReferenceVideoUrl,
          referenceVideoDuration: usesSeedanceFrameMode ? null : seedanceReferenceVideoDuration,
          referenceAudios: usesSeedanceFrameMode ? [] : selectedSeedanceReferenceAudios,
          referenceAudioDuration: usesSeedanceFrameMode ? null : seedanceReferenceAudioDuration,
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
          nsfwFilterEnabled: settings.nsfwFilterEnabled
        });
      } else if (wanReferenceImagesForRequest.length === 0 && !wanHasReferenceVideo) {
        response = await textToVideoMutation.mutateAsync({
          generationId,
          prompt,
          duration,
          resolution,
          ratio,
          multiShots: wanMultiShots,
          nsfwFilterEnabled: settings.nsfwFilterEnabled
        });
      } else if (wanReferenceImagesForRequest.length === 1 && !wanHasReferenceVideo) {
        response = await videoMutation.mutateAsync({
          generationId,
          image: wanReferenceImagesForRequest[0],
          prompt,
          duration,
          resolution,
          audio: wanAudio,
          multiShots: wanMultiShots,
          nsfwFilterEnabled: settings.nsfwFilterEnabled
        });
      } else {
        response = await referenceVideoMutation.mutateAsync({
          generationId,
          images: wanReferenceImagesForRequest,
          video: referenceVideoFile,
          referenceVideoUrl,
          prompt,
          duration,
          resolution,
          ratio,
          nsfwFilterEnabled: settings.nsfwFilterEnabled
        });
      }

      if (response.success && response.videoUrl) {
        await finalizeVideoGeneration(response, pendingJob, pendingFiles);
      } else {
        throw new Error(response.message || 'Failed to generate video');
      }
    } catch (err) {
      if (isNetworkInterruption(err)) {
        setVideoError(null);
        void recoverPendingVideo(pendingJob);
        console.warn('Video response was interrupted; recovery will continue in the background.', err);
        return;
      }

      clearPendingVideoJob(generationId);
      const errorMessage = getApiErrorMessage(err);
      if (isSafetyFilterError(err)) {
        setError(CONTENT_POLICY_ERROR_MESSAGE);
      } else {
        setVideoError(`Failed to generate video. ${errorMessage}`);
      }
      console.error('Video generation error:', err);
    }
  }, [
    requireAuth,
    pendingVideoGeneration,
    referenceVideoFile,
    referenceVideoUrl,
    wanReferenceImages,
    seedanceReferenceAudioDuration,
    seedanceReferenceAudioFiles,
    seedanceFirstFrame,
    seedanceLastFrame,
    seedanceReferenceImages,
    seedanceReferenceVideoDuration,
    seedanceReferenceVideoFiles,
    seedanceReferenceVideoUrl,
    clearVideoResult,
    clearPendingVideoJob,
    finalizeVideoGeneration,
    recoverPendingVideo,
    videoMutation,
    referenceVideoMutation,
    textToVideoMutation,
    seedanceVideoMutation,
    settings.nsfwFilterEnabled
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

  const handleUseGeneratedVideoAsReference = useCallback(() => {
    if (!videoUrl) return;
    if (videoProvider === 'seedance') {
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
    const source = videoLastFrameUrl || galleryVideoFile || videoUrl;
    if (!source) return;

    setIsExtractingLastFrame(true);
    setVideoError(null);

    try {
      const frameFile = videoLastFrameUrl
        ? await fetch(videoLastFrameUrl).then(async response => {
            if (!response.ok) throw new Error(`Could not download the returned frame (HTTP ${response.status})`);
            const blob = await response.blob();
            return new File([blob], `seedance-last-frame-${Date.now()}.png`, { type: blob.type || 'image/png' });
          })
        : await extractLastVideoFrame(source);
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
  }, [clearVideoResult, galleryVideoFile, videoLastFrameUrl, videoUrl]);

  /* ---------------- mode + session ---------------- */
  const handleModeChange = useCallback((mode: StudioMode) => {
    setStudioMode(mode);
    setError(null);

    // Flow the current image into the video workflow as the start-image reference
    if (mode === 'video' && currentImage) {
      if (videoProvider === 'seedance') {
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
    setVideoPrompt(details.prompt);
    setVideoOutputFormat(details.videoOutputFormat ?? 'mp4');
    setVideoLastFrameUrl(null);
    setReferenceVideoFile(null);
    setReferenceVideoUrl(null);
    setReferenceVideoDuration(null);
    setSeedanceReferenceVideoFiles([]);
    setSeedanceReferenceVideoUrl(null);
    setSeedanceReferenceVideoDuration(null);
    setSeedanceReferenceAudioFiles([]);
    setSeedanceReferenceAudioDuration(null);
    if (selectedProvider === 'seedance') {
      const restoredInputMode = details.seedanceInputMode ?? 'references';
      setSeedanceInputMode(restoredInputMode);
      setSeedanceFirstFrame(restoredInputMode === 'frames' ? referenceImages[0] ?? null : null);
      setSeedanceLastFrame(restoredInputMode === 'frames' ? referenceImages[1] ?? null : null);
      setSeedanceReferenceImages(
        restoredInputMode === 'references'
          ? referenceImages.slice(0, SEEDANCE_MAX_REFERENCE_IMAGES)
          : []
      );
      setWanReferenceImages([]);
    } else {
      setSeedanceFirstFrame(null);
      setSeedanceLastFrame(null);
      setWanReferenceImages(referenceImages.slice(0, 5));
      setSeedanceReferenceImages([]);
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
    if (videoProvider === 'seedance') {
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
                completed when you purchase credits.
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
        <main className="flex min-h-full min-w-0 shrink-0 flex-col overflow-visible px-3 pb-9 sm:px-6 sm:pb-12 md:min-h-0 md:flex-1 md:shrink md:overflow-y-auto md:overflow-x-hidden md:px-[11.5rem] lg:px-[13.5rem]">
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
            isLoading={isLoading}
            loadingLabel={loadingLabel}
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

          <div className="mx-auto mb-[25px] w-full max-w-[62rem] shrink-0">
            <Composer
              mode={studioMode}
              onModeChange={handleModeChange}
              isLoading={isLoading}
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
              onVideoProviderChange={setVideoProvider}
              onGenerateVideo={handleGenerateVideo}
              hasGeneratedVideo={Boolean(videoUrl)}
              onUseGeneratedVideoAsReference={handleUseGeneratedVideoAsReference}
              wanReferenceImages={wanReferenceImages}
              onWanReferenceImagesChange={handleWanReferenceImagesChange}
              referenceVideoFile={referenceVideoFile}
              referenceVideoUrl={referenceVideoUrl}
              onReferenceVideoSelect={handleReferenceVideoSelect}
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
