/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * VeilPix - AI-Powered Image Editor
 * Main application component managing the entire image editing workflow
 *
 * Architecture:
 * - State management via React hooks (no external state library)
 * - History-based undo/redo system with File objects
 * - Optimistic UI updates for perceived performance
 * - Authentication-gated features via Clerk
 * - Backend API for all AI operations (Nano Banana 2, Seedream 5, Wan 2.7 Image)
 */

import React, { useState, useCallback, useRef, useEffect, useOptimistic, startTransition, Suspense, lazy } from 'react';
import { formatCreditLabel } from './src/utils/creditFormatting';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { useUser, useClerk } from '@clerk/clerk-react';
import {
  useGenerateEditNanoBanana2,
  useGenerateFilterNanoBanana2,
  useGenerateAdjustNanoBanana2,
  useGenerateCompositeNanoBanana2,
  useGenerateTextToImage,
  useGenerateEditSeeDream,
  useGenerateFilterSeeDream,
  useGenerateAdjustSeeDream,
  useGenerateCompositeSeeDream,
  useGenerateEditWanImage,
  useGenerateFilterWanImage,
  useGenerateAdjustWanImage,
  useGenerateCompositeWanImage,
  useGenerateTextToImageSeeDream,
  useGenerateTextToImageWanImage,
  useGenerateVideo,
  useGenerateReferenceToVideo,
  useGenerateTextToVideo,
  useGenerateSeedanceVideo,
  useUsageStats
} from './src/hooks/useImageGeneration';
import Header from './components/Header';
import Footer from './components/Footer';
import Spinner from './components/Spinner';
import FilterPanel from './components/FilterPanel';
import AdjustmentPanel from './components/AdjustmentPanel';
import CropPanel from './components/CropPanel';
import { UndoIcon, RedoIcon, EyeIcon, SlidersIcon, DownloadIcon } from './components/icons';
import StartScreen from './components/StartScreen';
import BeforeAfterSlider from './components/BeforeAfterSlider';
import SignupPromptModal from './components/SignupPromptModal';
import ModeSelector, { type CreativeMode } from './components/ModeSelector';
import { SettingsState } from './components/SettingsMenu';
import {
  getImageCreditCost,
  ImageModelSelector,
  ImageModelSettings,
  normalizeImageGenerationOptions,
  type ImageGenerationOptions,
  type ImageProvider,
} from './components/ImageModelControlsPanel';
import Gallery from './components/Gallery';
import { debouncedSaveWorkflow, saveToGallery, saveVideoToGallery, type GalleryVideoDetails } from './src/utils/workflowStorage';

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

// Lazy-loaded components for video and composite-from-editor modes
const VideoControlsPanel = lazy(() => import('./components/VideoControlsPanel'));
const CompositeEditorOverlay = lazy(() => import('./components/CompositeEditorOverlay'));

/**
 * Lazy-loaded components for better initial bundle size
 * These components are only loaded when their respective features are accessed
 * - WebcamCapture: Heavy library (react-webcam) only needed for webcam mode
 * - CompositeScreen: Only needed for multi-image composition workflow
 * - Payment/Pricing modals: Rarely used, safe to code-split
 */
const WebcamCapture = lazy(() => import('./components/WebcamCapture'));
const CompositeScreen = lazy(() => import('./components/CompositeScreen'));
const PaymentSuccess = lazy(() => import('./components/PaymentSuccess').then(module => ({ default: module.PaymentSuccess })));
const PaymentCancelled = lazy(() => import('./components/PaymentCancelled').then(module => ({ default: module.PaymentCancelled })));
const PricingModal = lazy(() => import('./components/PricingModal').then(module => ({ default: module.PricingModal })));
// HEIC converter is dynamically imported only when HEIC files are detected (rare on web)

/**
 * Converts a data URL string to a File object
 * Used primarily for crop operations where canvas.toDataURL() produces a data URL
 * that needs to be converted back to a File for consistency with history management
 *
 * @param dataurl - Base64 encoded data URL (format: "data:image/png;base64,...")
 * @param filename - Desired filename for the resulting File object
 * @returns File object suitable for storing in history array
 * @throws Error if data URL format is invalid or MIME type cannot be parsed
 */
const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]); // Decode base64 string
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    // Convert binary string to byte array (working backwards for efficiency)
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

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

/**
 * Detects if an error message indicates a content safety filter violation
 * Google's Gemini API filters content for safety (NSFW, violence, policy violations)
 * This helps provide user-friendly messaging for safety-related failures vs technical errors
 *
 * @param errorMessage - The error message string to analyze
 * @returns true if the error appears to be safety-related, false otherwise
 *
 * Note: Includes '500' and 'internal server error' as safety keywords because
 * Google's API sometimes returns 500 errors for safety violations without clear messaging
 */
const isSafetyFilterError = (errorMessage: string, nsfwFilterEnabled: boolean): boolean => {
    const safetyKeywords = [
        'safety',
        'blocked',
        'inappropriate',
        'policy',
        'violation',
        'nsfw',
        'harmful',
        'terms of service',
        'content policy',
        'not allowed',
        'failed the review'
    ];

    const lowerError = errorMessage.toLowerCase();

    // Direct safety keyword match
    if (safetyKeywords.some(keyword => lowerError.includes(keyword))) {
        return true;
    }

    // Kie.ai returns generic "Internal Error" for content-filtered requests.
    // When the NSFW filter is ON: "Internal Error" likely means content was blocked by kie.ai's filter.
    // When the NSFW filter is OFF (After Dark): "Internal Error" likely means the underlying model
    // (e.g., SeeDream/ByteDance) has its own content filter that can't be disabled via nsfw_checker.
    // In both cases, treat as a safety error since normal prompts work fine with the same settings.
    if (lowerError.includes('internal error') || lowerError.includes('500')) {
        return true;
    }

    return false;
}

/**
 * DEPRECATED - Legacy function no longer used in production
 * Previously attempted to parse natural language adjustment prompts into structured values
 * Now replaced by direct prompt-to-API approach where Gemini interprets prompts natively
 *
 * Kept for reference but not actively called in the codebase
 */
const parseAdjustmentPrompt = (prompt: string) => {
  const adjustments: any = {};

  // Simple parsing logic - in production you might want more sophisticated parsing
  if (prompt.toLowerCase().includes('bright')) {
    adjustments.brightness = 0.2; // Default adjustment value
  }
  if (prompt.toLowerCase().includes('contrast')) {
    adjustments.contrast = 0.2;
  }
  if (prompt.toLowerCase().includes('saturat')) {
    adjustments.saturation = 0.2;
  }
  if (prompt.toLowerCase().includes('warm') || prompt.toLowerCase().includes('cool')) {
    adjustments.temperature = prompt.toLowerCase().includes('warm') ? 0.2 : -0.2;
  }

  return adjustments;
}

type Tab = 'retouch' | 'adjust' | 'filters' | 'crop';
type View = 'start' | 'webcam' | 'editor' | 'composite';

// LocalStorage keys for settings persistence
const SETTINGS_STORAGE_KEY = 'veilpix-settings';

// Default settings
const DEFAULT_SETTINGS: SettingsState = {
  apiProvider: 'seedream',
  resolution: '2K',
  imageAspectRatio: '1:1',
  seedreamTier: 'lite',
  imageOutputFormat: 'png',
  nsfwFilterEnabled: true
};

const App: React.FC = () => {
  const { isSignedIn, isLoaded } = useUser();
  const clerk = useClerk();
  const { data: usageStats } = useUsageStats();
  const hasPurchasedCredits = (usageStats?.totalCreditsPurchased ?? 0) > 0;
  const [view, setView] = useState<View>('start');
  const [history, setHistory] = useState<File[]>([]);
  const [historyPrompts, setHistoryPrompts] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [prompt, setPrompt] = useState<string>('');
  const [restoredVideoPrompt, setRestoredVideoPrompt] = useState<string>('');
  const [videoPromptRecallKey, setVideoPromptRecallKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editHotspot, setEditHotspot] = useState<{ x: number, y: number } | null>(null);
  const [displayHotspot, setDisplayHotspot] = useState<{ x: number, y: number } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('adjust');
  const [showSignupPrompt, setShowSignupPrompt] = useState<boolean>(false);

  // Settings state with localStorage persistence
  const [settings, setSettings] = useState<SettingsState>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('📋 Loaded settings from localStorage:', parsed);
        const normalizedImageOptions = normalizeImageGenerationOptions({
          provider: parsed.apiProvider,
          resolution: parsed.resolution,
          aspectRatio: parsed.imageAspectRatio,
          seedreamTier: parsed.seedreamTier,
          outputFormat: parsed.imageOutputFormat,
        });
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          apiProvider: normalizedImageOptions.provider,
          resolution: normalizedImageOptions.resolution,
          imageAspectRatio: normalizedImageOptions.aspectRatio,
          seedreamTier: normalizedImageOptions.seedreamTier,
          imageOutputFormat: normalizedImageOptions.outputFormat,
        };
      }
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error);
    }
    return DEFAULT_SETTINGS;
  });
  const imageGenerationOptions = normalizeImageGenerationOptions({
    provider: settings.apiProvider,
    resolution: settings.resolution,
    aspectRatio: settings.imageAspectRatio,
    seedreamTier: settings.seedreamTier,
    outputFormat: settings.imageOutputFormat,
  });
  const imageCreditCost = getImageCreditCost(imageGenerationOptions.provider, imageGenerationOptions.resolution, 'text-to-image', imageGenerationOptions.seedreamTier);
  const imageEditCreditCost = getImageCreditCost(imageGenerationOptions.provider, imageGenerationOptions.resolution, 'image-to-image', imageGenerationOptions.seedreamTier);
  const imageEditCreditLabel = formatCreditLabel(imageEditCreditCost);

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      console.log('💾 Saved settings to localStorage:', settings);
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  }, [settings]);

  // Enforce NSFW filter for non-purchasers: if user hasn't bought credits,
  // force the filter ON regardless of what's stored in localStorage
  useEffect(() => {
    if (!hasPurchasedCredits && !settings.nsfwFilterEnabled) {
      setSettings(prev => ({ ...prev, nsfwFilterEnabled: true }));
    }
  }, [hasPurchasedCredits, settings.nsfwFilterEnabled]);

  // Workflow restoration disabled - app always starts at landing page
  // Users requested fresh start on every visit instead of session persistence
  // useEffect(() => {
  //   const restoreWorkflow = async () => {
  //     try {
  //       const savedWorkflow = await loadWorkflow();
  //       if (savedWorkflow && savedWorkflow.history.length > 0) {
  //         console.log('🔄 Restoring workflow from IndexedDB:', savedWorkflow.history.length, 'images');
  //         setHistory(savedWorkflow.history);
  //         setHistoryIndex(savedWorkflow.historyIndex);
  //         setView('editor');
  //       }
  //     } catch (error) {
  //       console.error('Failed to restore workflow:', error);
  //     }
  //   };
  //   restoreWorkflow();
  // }, []);

  // Auto-save workflow to IndexedDB when history changes (debounced)
  useEffect(() => {
    if (history.length > 0) {
      debouncedSaveWorkflow(history, historyIndex, historyPrompts);
    }
  }, [history, historyIndex, historyPrompts]);

  const handleSettingsChange = useCallback((newSettings: SettingsState) => {
    const normalizedImageOptions = normalizeImageGenerationOptions({
      provider: newSettings.apiProvider,
      resolution: newSettings.resolution,
      aspectRatio: newSettings.imageAspectRatio,
      seedreamTier: newSettings.seedreamTier,
      outputFormat: newSettings.imageOutputFormat,
    });
    const normalizedSettings = {
      ...newSettings,
      apiProvider: normalizedImageOptions.provider,
      resolution: normalizedImageOptions.resolution,
      imageAspectRatio: normalizedImageOptions.aspectRatio,
      seedreamTier: normalizedImageOptions.seedreamTier,
      imageOutputFormat: normalizedImageOptions.outputFormat,
    };
    setSettings(normalizedSettings);
    console.log('⚙️ Settings updated:', newSettings);
  }, []);

  const handleImageOptionsChange = useCallback((options: ImageGenerationOptions) => {
    const normalizedImageOptions = normalizeImageGenerationOptions(options);
    setSettings(prev => ({
      ...prev,
      apiProvider: normalizedImageOptions.provider,
      resolution: normalizedImageOptions.resolution,
      imageAspectRatio: normalizedImageOptions.aspectRatio,
      seedreamTier: normalizedImageOptions.seedreamTier,
      imageOutputFormat: normalizedImageOptions.outputFormat,
    }));
  }, []);

  // Smart preloading for lazy components
  useEffect(() => {
    // Preload CompositeScreen when user first uploads an image
    if (history.length > 0) {
      import('./components/CompositeScreen');
    }
  }, [history.length]);

  // Debug: Log auth state on every load to diagnose OAuth redirects
  useEffect(() => {
    console.log('🔍 Auth debug:', {
      url: window.location.href,
      search: window.location.search,
      hash: window.location.hash,
      isSignedIn,
      isLoaded,
      clerkLoaded: clerk.loaded
    });
  }, [isSignedIn, isLoaded, clerk.loaded]);

  // Handle SSO callback from OAuth providers (Google, GitHub, etc.)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const isSSOCallback = window.location.hash.includes('/sso-callback') ||
                          window.location.pathname.includes('/sso-callback') ||
                          searchParams.has('__clerk_status') ||
                          searchParams.has('__clerk_created_session') ||
                          searchParams.has('__clerk_ticket');

    console.log('🔄 SSO check:', { isSSOCallback, clerkLoaded: clerk.loaded });

    if (isSSOCallback && clerk.loaded) {
      console.log('🔄 Handling SSO callback...');
      clerk.handleRedirectCallback({
        signInForceRedirectUrl: '/veilpix/',
        signUpForceRedirectUrl: '/veilpix/',
      }).then(() => {
        console.log('✅ SSO callback handled successfully');
        window.history.replaceState({}, '', window.location.pathname);
      }).catch((err) => {
        console.error('❌ SSO callback error:', err);
      });
    }
  }, [clerk.loaded]);

  // Payment flow state
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [showPaymentCancelled, setShowPaymentCancelled] = useState(false);
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // TanStack Query mutations — call ALL hooks unconditionally (Rules of Hooks compliant),
  // then select the active one based on the chosen provider
  const editNB2 = useGenerateEditNanoBanana2();
  const editSeeDream = useGenerateEditSeeDream();
  const editWan = useGenerateEditWanImage();

  const filterNB2 = useGenerateFilterNanoBanana2();
  const filterSeeDream = useGenerateFilterSeeDream();
  const filterWan = useGenerateFilterWanImage();

  const adjustNB2 = useGenerateAdjustNanoBanana2();
  const adjustSeeDream = useGenerateAdjustSeeDream();
  const adjustWan = useGenerateAdjustWanImage();

  const compositeNB2 = useGenerateCompositeNanoBanana2();
  const compositeSeeDream = useGenerateCompositeSeeDream();
  const compositeWan = useGenerateCompositeWanImage();

  const textToImageNB2 = useGenerateTextToImage();
  const textToImageSeeDream = useGenerateTextToImageSeeDream();
  const textToImageWan = useGenerateTextToImageWanImage();

  const imageMutationsByProvider = {
    nanobanana2: {
      edit: editNB2,
      filter: filterNB2,
      adjust: adjustNB2,
      composite: compositeNB2,
      textToImage: textToImageNB2,
    },
    seedream: {
      edit: editSeeDream,
      filter: filterSeeDream,
      adjust: adjustSeeDream,
      composite: compositeSeeDream,
      textToImage: textToImageSeeDream,
    },
    wanimage: {
      edit: editWan,
      filter: filterWan,
      adjust: adjustWan,
      composite: compositeWan,
      textToImage: textToImageWan,
    },
  } satisfies Record<ImageProvider, {
    edit: typeof editNB2;
    filter: typeof filterNB2;
    adjust: typeof adjustNB2;
    composite: typeof compositeNB2;
    textToImage: typeof textToImageNB2;
  }>;

  // Select active mutation based on provider
  const activeImageMutations = imageMutationsByProvider[imageGenerationOptions.provider] ?? imageMutationsByProvider.seedream;
  const editMutation = activeImageMutations.edit;
  const filterMutation = activeImageMutations.filter;
  const adjustMutation = activeImageMutations.adjust;
  const compositeMutation = activeImageMutations.composite;

  const videoMutation = useGenerateVideo();
  const referenceVideoMutation = useGenerateReferenceToVideo();
  const textToVideoMutation = useGenerateTextToVideo();
  const seedanceVideoMutation = useGenerateSeedanceVideo();

  // Video generation state
  const [videoProvider, setVideoProvider] = useState<VideoProvider>('wan');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [galleryVideoFile, setGalleryVideoFile] = useState<File | null>(null);
  const galleryVideoObjectUrlRef = useRef<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [referenceVideoFile, setReferenceVideoFile] = useState<File | null>(null);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState<string | null>(null);
  const [referenceVideoDuration, setReferenceVideoDuration] = useState<number | null>(null);
  const [wanReferenceImages, setWanReferenceImages] = useState<File[]>([]);
  const [seedanceReferenceImages, setSeedanceReferenceImages] = useState<File[]>([]);
  const [seedanceReferenceVideoFile, setSeedanceReferenceVideoFile] = useState<File | null>(null);
  const [seedanceReferenceVideoUrl, setSeedanceReferenceVideoUrl] = useState<string | null>(null);
  const [seedanceReferenceVideoDuration, setSeedanceReferenceVideoDuration] = useState<number | null>(null);
  const [seedanceReferenceAudioFile, setSeedanceReferenceAudioFile] = useState<File | null>(null);

  // React 19 optimistic state for immediate UI feedback
  const [optimisticHistory, setOptimisticHistory] = useOptimistic(
    history,
    (currentHistory, newImage: File) => [...currentHistory, newImage]
  );

  // Combined loading state from mutations and file processing
  const isLoading = editMutation.isPending || filterMutation.isPending || adjustMutation.isPending || compositeMutation.isPending || textToImageNB2.isPending || textToImageSeeDream.isPending || textToImageWan.isPending || videoMutation.isPending || referenceVideoMutation.isPending || textToVideoMutation.isPending || seedanceVideoMutation.isPending || isProcessingFile;

  const [sourceImage1, setSourceImage1] = useState<File | null>(null);
  const [sourceImage2, setSourceImage2] = useState<File | null>(null);
  const [isWebcamForComposite, setIsWebcamForComposite] = useState(false);
  const [isWebcamForCompositeSecond, setIsWebcamForCompositeSecond] = useState(false);
  const [creativeMode, setCreativeMode] = useState<CreativeMode>('single');
  const [galleryRefreshTrigger, setGalleryRefreshTrigger] = useState(0);
  
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>();
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [showSlider, setShowSlider] = useState<boolean>(false);
  const [sliderCompareMode, setSliderCompareMode] = useState<'original' | 'previous'>('original');
  const imgRef = useRef<HTMLImageElement>(null);

  // Optimistic history is display-only. Provider requests use canonical history.
  const displayHistory = optimisticHistory.length > history.length ? optimisticHistory : history;
  const currentImage = history[historyIndex] ?? null;
  const displayedImage = displayHistory[historyIndex] ?? currentImage;
  const originalImage = history[0] ?? null;

  useEffect(() => {
    if (historyIndex >= 0) {
      setPrompt(historyPrompts[historyIndex] ?? '');
    }
  }, [historyIndex, historyPrompts]);

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

  useEffect(() => {
    return () => revokeGalleryVideoObjectUrl();
  }, [revokeGalleryVideoObjectUrl]);

  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

  // Effect to create and revoke object URLs safely for the current image
  useEffect(() => {
    if (displayedImage) {
      const url = URL.createObjectURL(displayedImage);
      setCurrentImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCurrentImageUrl(null);
    }
  }, [displayedImage]);
  
  // Effect to create and revoke object URLs safely for the original image
  useEffect(() => {
    if (originalImage) {
      const url = URL.createObjectURL(originalImage);
      setOriginalImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setOriginalImageUrl(null);
    }
  }, [originalImage]);

  // Previous image for slider comparison (one step back in history)
  const previousImage = historyIndex > 0 ? history[historyIndex - 1] : null;
  const [previousImageUrl, setPreviousImageUrl] = useState<string | null>(null);

  // Effect to create and revoke object URLs safely for the previous image
  useEffect(() => {
    if (previousImage) {
      const url = URL.createObjectURL(previousImage);
      setPreviousImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviousImageUrl(null);
    }
  }, [previousImage]);

  // Auto-close slider when history changes (new edit made)
  useEffect(() => {
    setShowSlider(false);
  }, [historyIndex]);

  // Effect to handle URL parameters for payment success/cancel
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const cancelled = urlParams.get('cancelled');
    
    if (sessionId) {
      setPaymentSessionId(sessionId);
      setShowPaymentSuccess(true);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (cancelled === 'true') {
      setShowPaymentCancelled(true);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const addImageToHistory = useCallback((newImageFile: File, imagePrompt = historyPrompts[historyIndex] ?? '') => {
    const newHistory = history.slice(0, historyIndex + 1);
    const newHistoryPrompts = historyPrompts.slice(0, historyIndex + 1);
    newHistory.push(newImageFile);
    newHistoryPrompts.push(imagePrompt);
    setHistory(newHistory);
    setHistoryPrompts(newHistoryPrompts);
    setHistoryIndex(newHistory.length - 1);
    // Reset transient states after an action
    setCrop(undefined);
    setCompletedCrop(undefined);
    // Save AI-generated image to gallery
    saveToGallery(newImageFile, imagePrompt).then(() => setGalleryRefreshTrigger(n => n + 1));
  }, [history, historyIndex, historyPrompts]);

  const handleImageUpload = useCallback(async (file: File) => {
    setError(null);

    // Dynamically import HEIC converter when needed
    const { isHEIC, processFileForUpload } = await import('./src/utils/heicConverter');

    // Check if it's a HEIC file
    const isHeicFile = await isHEIC(file);

    if (isHeicFile) {
      setIsProcessingFile(true);
      try {
        // Process file (convert HEIC to WebP)
        const processedFile = await processFileForUpload(file);

        setHistory([processedFile]);
        setHistoryPrompts(['']);
        setHistoryIndex(0);
        setPrompt('');
        setEditHotspot(null);
        setDisplayHotspot(null);
        setActiveTab('adjust');
        setCrop(undefined);
        setCompletedCrop(undefined);
        setView('editor');
        // Save to gallery
        saveToGallery(processedFile).then(() => setGalleryRefreshTrigger(n => n + 1));
      } catch (error) {
        console.error('Failed to process HEIC file:', error);
        setError(`Failed to process HEIC image: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsProcessingFile(false);
      }
    } else {
      // For non-HEIC files, use directly
      setHistory([file]);
      setHistoryPrompts(['']);
      setHistoryIndex(0);
      setPrompt('');
      setEditHotspot(null);
      setDisplayHotspot(null);
      setActiveTab('adjust');
      setCrop(undefined);
      setCompletedCrop(undefined);
      setView('editor');
      // Save to gallery
      saveToGallery(file).then(() => setGalleryRefreshTrigger(n => n + 1));
    }
  }, []);

  // Handle selecting an image from the gallery
  const handleSelectGalleryImage = useCallback((file: File, savedPrompt: string) => {
    clearVideoResult();
    setCreativeMode('single');
    setHistory([file]);
    setHistoryPrompts([savedPrompt]);
    setHistoryIndex(0);
    setPrompt(savedPrompt);
    setEditHotspot(null);
    setDisplayHotspot(null);
    setActiveTab('adjust');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setView('editor');
  }, [clearVideoResult]);

  const handleMakeGalleryImageReference = useCallback((file: File, savedPrompt: string) => {
    setPrompt(savedPrompt);
    setRestoredVideoPrompt(savedPrompt);
    setVideoPromptRecallKey(key => key + 1);
    if (creativeMode === 'single') {
      clearVideoResult();
      setHistory([file]);
      setHistoryPrompts([savedPrompt]);
      setHistoryIndex(0);
      setEditHotspot(null);
      setDisplayHotspot(null);
      setActiveTab('adjust');
      setCrop(undefined);
      setCompletedCrop(undefined);
      setView('editor');
      return;
    }

    if (creativeMode === 'composite') {
      const baseImage = sourceImage1 ?? currentImage;
      if (!baseImage) {
        setSourceImage1(file);
        setView('start');
        return;
      }
      setSourceImage1(baseImage);
      setSourceImage2(file);
      setView('composite');
      return;
    }

    setCreativeMode('video');
    if (videoProvider === 'seedance') {
      setSeedanceReferenceImages(prev => [...prev, file].slice(0, 4));
    } else {
      const maxImages = referenceVideoFile || referenceVideoUrl ? 4 : 5;
      setWanReferenceImages(prev => [...prev, file].slice(0, maxImages));
    }
    clearVideoResult();
    setVideoError(null);
    setView('editor');
  }, [clearVideoResult, creativeMode, currentImage, referenceVideoFile, referenceVideoUrl, sourceImage1, videoProvider]);

  // Handle selecting a generated video from the gallery for viewing/reuse
  const handleSelectGalleryVideo = useCallback((details: GalleryVideoDetails) => {
    const selectedProvider = details.provider ?? videoProvider;
    const referenceImages = details.referenceImages.length > 0
      ? details.referenceImages
      : details.referenceImage
        ? [details.referenceImage]
        : [];

    setHistory([]);
    setHistoryPrompts([]);
    setHistoryIndex(-1);
    setRestoredVideoPrompt(details.prompt);
    setVideoPromptRecallKey(key => key + 1);
    setEditHotspot(null);
    setDisplayHotspot(null);
    setCreativeMode('video');
    setVideoProvider(selectedProvider);
    setReferenceVideoFile(null);
    setReferenceVideoUrl(null);
    setReferenceVideoDuration(null);
    setSeedanceReferenceVideoFile(null);
    setSeedanceReferenceVideoUrl(null);
    setSeedanceReferenceVideoDuration(null);
    setSeedanceReferenceAudioFile(null);
    if (selectedProvider === 'seedance') {
      setSeedanceReferenceImages(referenceImages.slice(0, 4));
      setWanReferenceImages([]);
    } else {
      setWanReferenceImages(referenceImages.slice(0, 5));
      setSeedanceReferenceImages([]);
    }
    if (details.videoFile) {
      showGalleryVideoResult(details.videoFile);
    } else {
      showRemoteVideoResult(details.videoUrl);
    }
    setVideoError(null);
    setView('editor');
  }, [showGalleryVideoResult, showRemoteVideoResult, videoProvider]);

  // Start a new reference-to-video flow from an existing gallery video
  const handleMakeGalleryVideoReference = useCallback((details: GalleryVideoDetails) => {
    setEditHotspot(null);
    setDisplayHotspot(null);
    setCreativeMode('video');
    setRestoredVideoPrompt(details.prompt);
    setVideoPromptRecallKey(key => key + 1);
    if (videoProvider === 'seedance') {
      setSeedanceReferenceVideoFile(details.videoFile);
      setSeedanceReferenceVideoUrl(details.videoFile ? null : details.videoUrl);
      setSeedanceReferenceVideoDuration(details.videoDuration ?? null);
    } else {
      setHistory([]);
      setHistoryPrompts([]);
      setHistoryIndex(-1);
      setReferenceVideoFile(details.videoFile);
      setReferenceVideoUrl(details.videoFile ? null : details.videoUrl);
      setReferenceVideoDuration(details.videoDuration ?? null);
      setWanReferenceImages(prev => prev.slice(0, 4));
    }
    clearVideoResult();
    setVideoError(null);
    setView('editor');
  }, [clearVideoResult, videoProvider]);

  const generateCompositeFromFiles = useCallback(async (
    image1: File | null,
    image2: File | null,
    compositePrompt: string,
    options: ImageGenerationOptions = imageGenerationOptions
  ) => {
    console.log('ðŸŽ¯ generateCompositeFromFiles called with prompt:', compositePrompt);
    console.log('ðŸ–¼ï¸ Source image 1:', image1?.name, image1?.size);
    console.log('ðŸ–¼ï¸ Source image 2:', image2?.name, image2?.size);

    if (isLoaded && !isSignedIn) {
      setShowSignupPrompt(true);
      return;
    }

    if (!image1 || !image2) {
        setError('Two source images are required to generate a composite.');
        return;
    }

    const normalizedImageOptions = normalizeImageGenerationOptions(options, 'image-to-image');
    const selectedCompositeMutation = imageMutationsByProvider[normalizedImageOptions.provider].composite;

    setError(null);

    try {
        console.log('ðŸš€ About to call composite mutation...');
        const response = await selectedCompositeMutation.mutateAsync({
            image1,
            image2,
            prompt: compositePrompt,
            resolution: normalizedImageOptions.resolution,
            aspectRatio: normalizedImageOptions.aspectRatio,
            seedreamTier: normalizedImageOptions.seedreamTier,
            outputFormat: normalizedImageOptions.outputFormat,
            nsfwFilterEnabled: settings.nsfwFilterEnabled
        });
        console.log('âœ… composite mutation returned:', response);

        if (response.success && response.image) {
            const newImageFile = await generatedImageToFile(response.image, 'composite');

            setHistory([newImageFile]);
            setHistoryPrompts([compositePrompt]);
            setHistoryIndex(0);
            setPrompt(compositePrompt);
            setCreativeMode('single');
            setView('editor');
            setSourceImage1(null);
            setSourceImage2(null);
            saveToGallery(newImageFile, compositePrompt).then(() => setGalleryRefreshTrigger(n => n + 1));
        } else {
            throw new Error(response.message || 'Failed to generate composite image');
        }
    } catch (err: any) {
        const errorMessage = err?.data?.message || err?.data?.error || err.message || 'An unknown error occurred.';
        setError(`Failed to generate the composite image. ${errorMessage}`);
        console.error(err);
    }
  }, [imageGenerationOptions, imageMutationsByProvider, isLoaded, isSignedIn, settings.nsfwFilterEnabled]);

  const handleCompositeSelect = useCallback(async (
    file1: File,
    file2: File,
    compositePrompt = '',
    options: ImageGenerationOptions = imageGenerationOptions
  ) => {
    // Check if user is authenticated, if not show signup prompt
    if (isLoaded && !isSignedIn) {
      setShowSignupPrompt(true);
      return;
    }

    setError(null);

    // Dynamically import HEIC converter when needed
    const { isHEIC, processFileForUpload } = await import('./src/utils/heicConverter');

    const needsProcessing = await isHEIC(file1) || await isHEIC(file2);

    if (needsProcessing) {
      setIsProcessingFile(true);
      try {
        // Process both files (convert HEIC to WebP if needed)
        const [processedFile1, processedFile2] = await Promise.all([
          processFileForUpload(file1),
          processFileForUpload(file2)
        ]);

        setSourceImage1(processedFile1);
        setSourceImage2(processedFile2);
        setHistory([]);
        setHistoryPrompts([]);
        setHistoryIndex(-1);
        if (compositePrompt.trim()) {
          await generateCompositeFromFiles(processedFile1, processedFile2, compositePrompt.trim(), options);
        } else {
          setView('composite');
        }
      } catch (error) {
        console.error('Failed to process composite files:', error);
        setError(`Failed to process images: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsProcessingFile(false);
      }
    } else {
      // No processing needed for non-HEIC files
      setSourceImage1(file1);
      setSourceImage2(file2);
      setHistory([]);
      setHistoryPrompts([]);
      setHistoryIndex(-1);
      if (compositePrompt.trim()) {
        await generateCompositeFromFiles(file1, file2, compositePrompt.trim(), options);
      } else {
        setView('composite');
      }
    }
  }, [generateCompositeFromFiles, imageGenerationOptions, isLoaded, isSignedIn]);

  const handleWebcamCapture = useCallback((file: File) => {
    if (isWebcamForCompositeSecond) {
      // Webcam capture for composite second image from editor overlay
      setIsWebcamForCompositeSecond(false);
      if (currentImage) {
        setSourceImage1(currentImage);
        setSourceImage2(file);
        setView('composite');
      }
    } else if (isWebcamForComposite) {
      setSourceImage1(file);
      setIsWebcamForComposite(false);
      setView('start'); // This will show the start screen but with composite tab active and sourceImage1 set
    } else {
      handleImageUpload(file);
    }
  }, [isWebcamForComposite, isWebcamForCompositeSecond, currentImage, handleImageUpload]);

  const handleUseWebcamClick = useCallback(() => {
    // Debug authentication state
    console.log('🔍 Webcam Debug:', { isLoaded, isSignedIn, showSignupPrompt });

    // Check if user is authenticated, if not show signup prompt
    if (isLoaded && !isSignedIn) {
      console.log('🚨 User not authenticated, showing signup prompt for webcam');
      setShowSignupPrompt(true);
      return;
    }
    console.log('✅ User authenticated, opening webcam');
    setView('webcam');
  }, [isLoaded, isSignedIn]);

  const handleUseWebcamForCompositeClick = useCallback(() => {
    // Check if user is authenticated, if not show signup prompt
    if (isLoaded && !isSignedIn) {
      setShowSignupPrompt(true);
      return;
    }
    setIsWebcamForComposite(true);
    setCreativeMode('composite');
    setView('webcam');
  }, [isLoaded, isSignedIn]);

  const handleGenerate = useCallback(async () => {
    if (!currentImage) {
      setError('No image loaded to edit.');
      return;
    }
    
    if (!prompt.trim()) {
        setError('Please enter a description for your edit.');
        return;
    }

    if (!editHotspot) {
        setError('Please click on the image to select an area to edit.');
        return;
    }

    setError(null);
    
    // Create optimistic preview file
    const optimisticFile = new File([currentImage], `optimistic-${Date.now()}.png`, { type: currentImage.type });
    
    startTransition(() => {
      // Add optimistic update immediately for UI feedback
      setOptimisticHistory(optimisticFile);
    });

    try {
      const normalizedImageOptions = normalizeImageGenerationOptions(imageGenerationOptions, 'image-to-image');
      const response = await editMutation.mutateAsync({
        image: currentImage,
        prompt,
        x: editHotspot.x,
        y: editHotspot.y,
        resolution: normalizedImageOptions.resolution,
        aspectRatio: normalizedImageOptions.aspectRatio,
        seedreamTier: normalizedImageOptions.seedreamTier,
        outputFormat: normalizedImageOptions.outputFormat,
        nsfwFilterEnabled: settings.nsfwFilterEnabled
      });

      if (response.success && response.image) {
        const newImageFile = await generatedImageToFile(response.image, 'edited');
        addImageToHistory(newImageFile, prompt);
        setEditHotspot(null);
        setDisplayHotspot(null);
      } else {
        throw new Error(response.message || 'Failed to generate image');
      }
    } catch (err: any) {
      const errorMessage = err?.data?.message || err?.data?.error || err.message || 'An unknown error occurred.';
      setError(`Failed to generate the image. ${errorMessage}`);
      console.error(err);
    }
  }, [currentImage, prompt, editHotspot, addImageToHistory, editMutation, setOptimisticHistory, imageGenerationOptions, settings.nsfwFilterEnabled]);

  const handleGenerateComposite = useCallback(async (
    compositePrompt: string,
    options: ImageGenerationOptions = imageGenerationOptions
  ) => {
    await generateCompositeFromFiles(sourceImage1, sourceImage2, compositePrompt, options);
  }, [generateCompositeFromFiles, imageGenerationOptions, sourceImage1, sourceImage2]);
  
  const handleApplyFilter = useCallback(async (filterPrompt: string) => {
    if (!currentImage) {
      setError('No image loaded to apply a filter to.');
      return;
    }
    
    setError(null);
    
    // Add optimistic update for immediate feedback
    const optimisticFile = new File([currentImage], `optimistic-filtered-${Date.now()}.png`, { type: currentImage.type });
    startTransition(() => {
      setOptimisticHistory(optimisticFile);
    });

    try {
      const normalizedImageOptions = normalizeImageGenerationOptions(imageGenerationOptions, 'image-to-image');
      const response = await filterMutation.mutateAsync({
        image: currentImage,
        filterType: filterPrompt,
        resolution: normalizedImageOptions.resolution,
        aspectRatio: normalizedImageOptions.aspectRatio,
        seedreamTier: normalizedImageOptions.seedreamTier,
        outputFormat: normalizedImageOptions.outputFormat,
        nsfwFilterEnabled: settings.nsfwFilterEnabled
      });

      if (response.success && response.image) {
        const newImageFile = await generatedImageToFile(response.image, 'filtered');
        addImageToHistory(newImageFile, filterPrompt);
      } else {
        throw new Error(response.message || 'Failed to apply filter');
      }
    } catch (err: any) {
      const errorMessage = err?.data?.message || err?.data?.error || err.message || 'An unknown error occurred.';
      setError(`Failed to apply the filter. ${errorMessage}`);
      console.error(err);
    }
  }, [currentImage, addImageToHistory, filterMutation, setOptimisticHistory, imageGenerationOptions, settings.nsfwFilterEnabled]);
  
  const handleApplyAdjustment = useCallback(async (adjustmentPrompt: string) => {
    if (!currentImage) {
      setError('No image loaded to apply an adjustment to.');
      return;
    }

    setError(null);

    // Add optimistic update for immediate feedback
    const optimisticFile = new File([currentImage], `optimistic-adjusted-${Date.now()}.png`, { type: currentImage.type });
    startTransition(() => {
      setOptimisticHistory(optimisticFile);
    });

    try {
      const normalizedImageOptions = normalizeImageGenerationOptions(imageGenerationOptions, 'image-to-image');
      // Send the prompt directly to the API
      const response = await adjustMutation.mutateAsync({
        image: currentImage,
        prompt: adjustmentPrompt,
        resolution: normalizedImageOptions.resolution,
        aspectRatio: normalizedImageOptions.aspectRatio,
        seedreamTier: normalizedImageOptions.seedreamTier,
        outputFormat: normalizedImageOptions.outputFormat,
        nsfwFilterEnabled: settings.nsfwFilterEnabled
      });

      if (response.success && response.image) {
        const newImageFile = await generatedImageToFile(response.image, 'adjusted');
        addImageToHistory(newImageFile, adjustmentPrompt);
      } else {
        throw new Error(response.message || 'Failed to apply adjustment');
      }
    } catch (err: any) {
      const errorMessage = err?.data?.message || err?.data?.error || err.message || 'An unknown error occurred.';
      setError(`Failed to apply the adjustment. ${errorMessage}`);
      console.error(err);
    }
  }, [currentImage, addImageToHistory, adjustMutation, setOptimisticHistory, imageGenerationOptions, settings.nsfwFilterEnabled]);

  const handleTextToImageGenerate = useCallback(async (
    textPrompt: string,
    onSuccess?: (file: File) => void,
    options: ImageGenerationOptions = imageGenerationOptions
  ) => {
    const normalizedImageOptions = normalizeImageGenerationOptions(options, 'text-to-image');
    const selectedTextToImageMutation = imageMutationsByProvider[normalizedImageOptions.provider].textToImage;

    console.log('🎨 Starting text-to-image generation with provider:', normalizedImageOptions.provider, 'prompt:', textPrompt);

    setError(null);

    // Add optimistic update for immediate feedback (only if not using callback)
    if (!onSuccess) {
      const optimisticFile = new File([new Blob()], `optimistic-text-to-image-${Date.now()}.png`, { type: 'image/png' });
      startTransition(() => {
        setOptimisticHistory(optimisticFile);
      });
    }

    try {
      const response = await selectedTextToImageMutation.mutateAsync({
        prompt: textPrompt,
        resolution: normalizedImageOptions.resolution,
        aspectRatio: normalizedImageOptions.aspectRatio,
        seedreamTier: normalizedImageOptions.seedreamTier,
        outputFormat: normalizedImageOptions.outputFormat,
        nsfwFilterEnabled: settings.nsfwFilterEnabled
      });

      if (response.success && response.image) {
        const newImageFile = await generatedImageToFile(response.image, 'text-to-image');

        if (onSuccess) {
          // Callback mode: Pass the file to the callback (for composite mode)
          onSuccess(newImageFile);
          console.log('✅ Text-to-image generation successful, file passed to callback');
        } else {
          // Default mode: Start a new editing session with the generated image (for single photo mode)
          setHistory([newImageFile]);
          setHistoryPrompts([textPrompt]);
          setHistoryIndex(0);
          setPrompt(textPrompt);
          setActiveTab('adjust');
          setView('editor');
          // Save text-to-image result to gallery
          saveToGallery(newImageFile, textPrompt).then(() => setGalleryRefreshTrigger(n => n + 1));
          console.log('✅ Text-to-image generation successful, image added to history');
        }
      } else {
        throw new Error(response.message || 'Failed to generate image from text');
      }
    } catch (err: any) {
      const errorMessage = err?.data?.message || err?.data?.error || err.message || 'An unknown error occurred.';
      setError(`Failed to generate image from text. ${errorMessage}`);
      console.error('💥 Text-to-image generation failed:', err);
    }
  }, [imageGenerationOptions, imageMutationsByProvider, setOptimisticHistory, settings.nsfwFilterEnabled]);

  const handleApplyCrop = useCallback(() => {
    if (!completedCrop || !imgRef.current) {
        setError('Please select an area to crop.');
        return;
    }

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
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

  const handleToggleSlider = useCallback(() => {
    setShowSlider(prev => !prev);
  }, []);

  const handleReset = useCallback(() => {
    if (history.length > 0) {
      setHistoryIndex(0);
      setError(null);
      setEditHotspot(null);
      setDisplayHotspot(null);
    }
  }, [history]);

  const handleUploadNew = useCallback(() => {
      setHistory([]);
      setHistoryPrompts([]);
      setHistoryIndex(-1);
      setError(null);
      setPrompt('');
      setRestoredVideoPrompt('');
      setVideoPromptRecallKey(key => key + 1);
      setEditHotspot(null);
      setDisplayHotspot(null);
      setSourceImage1(null);
      setSourceImage2(null);
      setCreativeMode('single');
      clearVideoResult();
      setVideoError(null);
      setWanReferenceImages([]);
      setReferenceVideoFile(null);
      setReferenceVideoUrl(null);
      setReferenceVideoDuration(null);
      setSeedanceReferenceImages([]);
      setSeedanceReferenceVideoFile(null);
      setSeedanceReferenceVideoUrl(null);
      setSeedanceReferenceVideoDuration(null);
      setSeedanceReferenceAudioFile(null);
      setView('start');
  }, [clearVideoResult]);

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
      link.download = `veilpix-video-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      window.open(videoUrl, '_blank', 'noopener,noreferrer');
    }
  }, [videoUrl]);

  // Handle creative mode switching (single/composite/video)
  const handleModeChange = useCallback((newMode: CreativeMode) => {
    setCreativeMode(newMode);

    // Clear video state when leaving video mode
    if (newMode !== 'video') {
      clearVideoResult();
      setVideoError(null);
      setReferenceVideoFile(null);
      setReferenceVideoUrl(null);
      setReferenceVideoDuration(null);
      setSeedanceReferenceImages([]);
      setSeedanceReferenceVideoFile(null);
      setSeedanceReferenceVideoUrl(null);
      setSeedanceReferenceVideoDuration(null);
      setSeedanceReferenceAudioFile(null);
    }

    if (view === 'editor' && currentImage) {
      if (newMode === 'composite') {
        // Current image becomes base image for composite
        setSourceImage1(currentImage);
        setSourceImage2(null);
      }
      // For 'single' and 'video' — just switch the panel, no state changes
    }

    if (newMode === 'video' && view === 'editor' && currentImage && videoProvider === 'wan') {
      setWanReferenceImages(prev => prev.length > 0 ? prev : [currentImage]);
    }

    if (newMode === 'video' && view === 'editor' && currentImage) {
      setRestoredVideoPrompt(historyPrompts[historyIndex] ?? '');
      setVideoPromptRecallKey(key => key + 1);
    }
  }, [clearVideoResult, view, currentImage, videoProvider, historyIndex, historyPrompts]);

  // Handle combining from the editor overlay
  const handleCompositeFromEditor = useCallback((file2: File) => {
    if (currentImage) {
      setSourceImage1(currentImage);
      setSourceImage2(file2);
      setView('composite');
    }
  }, [currentImage]);

  // Handle webcam for composite second image (from editor overlay)
  const handleWebcamForCompositeSecond = useCallback(() => {
    if (isLoaded && !isSignedIn) {
      setShowSignupPrompt(true);
      return;
    }
    setIsWebcamForCompositeSecond(true);
    setView('webcam');
  }, [isLoaded, isSignedIn]);

  // Handle video generation
  const handleGenerateVideo = useCallback(async (options: VideoGenerateOptions) => {
    const {
      provider,
      prompt,
      duration,
      resolution,
      ratio,
      wanAudio = true,
      wanMultiShots = false,
      seedanceVariant = 'regular',
      seedanceGenerateAudio = false,
      seedanceWebSearch = false
    } = options;

    setVideoError(null);
    setRestoredVideoPrompt(prompt);
    setVideoPromptRecallKey(key => key + 1);
    clearVideoResult();

    try {
      const wanHasReferenceVideo = Boolean(referenceVideoFile || referenceVideoUrl);
      const wanReferenceImagesForRequest = wanReferenceImages.slice(0, wanHasReferenceVideo ? 4 : 5);
      let response: any;

      if (provider === 'seedance') {
        response = await seedanceVideoMutation.mutateAsync({
            referenceImages: seedanceReferenceImages,
            referenceVideo: seedanceReferenceVideoFile,
            referenceVideoUrl: seedanceReferenceVideoUrl,
            referenceVideoDuration: seedanceReferenceVideoDuration,
            referenceAudio: seedanceReferenceAudioFile,
            prompt,
            variant: seedanceVariant,
            duration,
            resolution,
            aspectRatio: ratio,
            generateAudio: seedanceGenerateAudio,
            webSearch: seedanceWebSearch,
            nsfwFilterEnabled: settings.nsfwFilterEnabled
        });
      } else if (wanReferenceImagesForRequest.length === 0 && !wanHasReferenceVideo) {
        response = await textToVideoMutation.mutateAsync({
          prompt,
          duration,
          resolution,
          ratio,
          multiShots: wanMultiShots,
          nsfwFilterEnabled: settings.nsfwFilterEnabled
        });
      } else if (wanReferenceImagesForRequest.length === 1 && !wanHasReferenceVideo) {
        response = await videoMutation.mutateAsync({
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
        showRemoteVideoResult(response.videoUrl);
        saveVideoToGallery({
          videoUrl: response.videoUrl,
          provider,
          referenceImage: provider === 'seedance' ? seedanceReferenceImages[0] ?? null : wanReferenceImagesForRequest[0] ?? null,
          referenceImages: provider === 'seedance' ? seedanceReferenceImages : wanReferenceImagesForRequest,
          referenceVideoFile: provider === 'seedance' ? seedanceReferenceVideoFile : referenceVideoFile,
          referenceVideoUrl: provider === 'seedance' ? seedanceReferenceVideoUrl : referenceVideoUrl,
          videoDuration: duration,
          prompt
        }).then(() => setGalleryRefreshTrigger(n => n + 1));
      } else {
        throw new Error(response.message || 'Failed to generate video');
      }
    } catch (err: any) {
      const errorMessage = err?.data?.message || err?.data?.error || err.message || 'An unknown error occurred.';
      if (isSafetyFilterError(errorMessage, settings.nsfwFilterEnabled)) {
        setError(errorMessage);
      } else {
        setVideoError(`Failed to generate video. ${errorMessage}`);
      }
      console.error('Video generation error:', err);
    }
  }, [
    currentImage,
    referenceVideoFile,
    referenceVideoUrl,
    wanReferenceImages,
    seedanceReferenceAudioFile,
    seedanceReferenceImages,
    seedanceReferenceVideoDuration,
    seedanceReferenceVideoFile,
    seedanceReferenceVideoUrl,
    clearVideoResult,
    showRemoteVideoResult,
    videoMutation,
    referenceVideoMutation,
    textToVideoMutation,
    seedanceVideoMutation,
    settings.nsfwFilterEnabled
  ]);

  const handleStartScreenVideoGenerate = useCallback((options: VideoGenerateOptions) => {
    setCreativeMode('video');
    setView('editor');
    handleGenerateVideo(options);
  }, [handleGenerateVideo]);

  const handleReferenceImageSelect = useCallback((file: File | null) => {
    if (file) {
      setHistory([file]);
      setHistoryPrompts(['']);
      setHistoryIndex(0);
      setPrompt('');
      setRestoredVideoPrompt('');
      setVideoPromptRecallKey(key => key + 1);
      setEditHotspot(null);
      setDisplayHotspot(null);
      setCrop(undefined);
      setCompletedCrop(undefined);
    } else {
      setHistory([]);
      setHistoryPrompts([]);
      setHistoryIndex(0);
    }
  }, []);

  const handleWanReferenceImagesChange = useCallback((images: File[]) => {
    const hasReferenceVideo = Boolean(referenceVideoFile || referenceVideoUrl);
    setWanReferenceImages(images.slice(0, hasReferenceVideo ? 4 : 5));
    clearVideoResult();
    setVideoError(null);
  }, [clearVideoResult, referenceVideoFile, referenceVideoUrl]);

  const handleReferenceVideoSelect = useCallback(async (file: File | null) => {
    setReferenceVideoFile(file);
    setReferenceVideoUrl(null);
    setReferenceVideoDuration(file ? await getVideoDurationSeconds(file) : null);
    if (file) {
      setWanReferenceImages(prev => prev.slice(0, 4));
    }
    clearVideoResult();
    setVideoError(null);
  }, [clearVideoResult]);

  const handleSeedanceReferenceImagesChange = useCallback((images: File[]) => {
    setSeedanceReferenceImages(images.slice(0, 4));
    clearVideoResult();
    setVideoError(null);
  }, [clearVideoResult]);

  const handleSeedanceReferenceVideoSelect = useCallback(async (file: File | null) => {
    setSeedanceReferenceVideoFile(file);
    setSeedanceReferenceVideoUrl(null);
    setSeedanceReferenceVideoDuration(file ? await getVideoDurationSeconds(file) : null);
    clearVideoResult();
    setVideoError(null);
  }, [clearVideoResult]);

  const handleSeedanceReferenceVideoUrlRemove = useCallback(() => {
    setSeedanceReferenceVideoFile(null);
    setSeedanceReferenceVideoUrl(null);
    setSeedanceReferenceVideoDuration(null);
    clearVideoResult();
    setVideoError(null);
  }, [clearVideoResult]);

  const handleSeedanceReferenceAudioSelect = useCallback((file: File | null) => {
    setSeedanceReferenceAudioFile(file);
    clearVideoResult();
    setVideoError(null);
  }, [clearVideoResult]);

  const handleUseGeneratedVideoAsReference = useCallback(() => {
    if (!videoUrl) return;
    if (videoProvider === 'seedance') {
      setSeedanceReferenceVideoFile(galleryVideoFile);
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

  const handleFileSelect = async (files: FileList | null) => {
    if (files && files[0]) {
      // Debug authentication state
      console.log('🔍 Authentication Debug:', { isLoaded, isSignedIn, showSignupPrompt });

      // Check if user is authenticated, if not show signup prompt
      if (isLoaded && !isSignedIn) {
        console.log('🚨 User not authenticated, showing signup prompt');
        setShowSignupPrompt(true);
        return;
      }
      console.log('✅ User authenticated, proceeding with upload');
      if (creativeMode === 'video' && videoProvider === 'seedance') {
        const file = files[0];
        setIsProcessingFile(true);
        try {
          const { isHEIC, processFileForUpload } = await import('./src/utils/heicConverter');
          const processedFile = await isHEIC(file) ? await processFileForUpload(file) : file;
          setSeedanceReferenceImages(prev => [...prev, processedFile].slice(0, 4));
          clearVideoResult();
          setVideoError(null);
          setView('editor');
          saveToGallery(processedFile).then(() => setGalleryRefreshTrigger(n => n + 1));
        } catch (error) {
          console.error('Failed to process Seedance reference image:', error);
          setError(`Failed to process reference image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
          setIsProcessingFile(false);
        }
        return;
      }

      if (creativeMode === 'video' && videoProvider === 'wan') {
        const file = files[0];
        setIsProcessingFile(true);
        try {
          const { isHEIC, processFileForUpload } = await import('./src/utils/heicConverter');
          const processedFile = await isHEIC(file) ? await processFileForUpload(file) : file;
          const maxImages = referenceVideoFile || referenceVideoUrl ? 4 : 5;
          setWanReferenceImages(prev => [...prev, processedFile].slice(0, maxImages));
          clearVideoResult();
          setVideoError(null);
          saveToGallery(processedFile).then(() => setGalleryRefreshTrigger(n => n + 1));
        } catch (error) {
          console.error('Failed to process Wan reference image:', error);
          setError(`Failed to process reference image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
          setIsProcessingFile(false);
        }
        return;
      }

      await handleImageUpload(files[0]);
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (activeTab !== 'retouch') return;
    
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();

    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    setDisplayHotspot({ x: offsetX, y: offsetY });

    const { naturalWidth, naturalHeight, clientWidth, clientHeight } = img;
    const scaleX = naturalWidth / clientWidth;
    const scaleY = naturalHeight / clientHeight;

    const originalX = Math.round(offsetX * scaleX);
    const originalY = Math.round(offsetY * scaleY);

    setEditHotspot({ x: originalX, y: originalY });
};

  const renderContent = () => {
    if (error) {
       const isSafetyIssue = isSafetyFilterError(error, settings.nsfwFilterEnabled);

       return (
           <div className={`text-center animate-fade-in p-8 rounded-lg max-w-2xl mx-auto flex flex-col items-center gap-4 ${
             isSafetyIssue
               ? 'bg-yellow-500/10 border border-yellow-500/20'
               : 'bg-red-500/10 border border-red-500/20'
           }`}>
            <h2 className={`text-2xl font-bold ${isSafetyIssue ? 'text-yellow-300' : 'text-red-300'}`}>
              {isSafetyIssue ? 'Content Not Allowed' : 'An Error Occurred'}
            </h2>

            {isSafetyIssue ? (
              <div className="flex flex-col gap-3 text-md text-yellow-200">
                {hasPurchasedCredits && !settings.nsfwFilterEnabled ? (
                  <>
                    <p>
                      Your request was blocked by the AI provider's built-in content filter. Although VeilStudio's content filter is disabled, the underlying model may enforce its own restrictions that cannot be overridden.
                    </p>
                    <p className="text-sm text-yellow-300/80">
                      Try rephrasing your prompt, or switch to a different AI provider in the Settings menu. Different models have different content policies.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      Your request was flagged by our content filter. Please note that VeilStudio strictly prohibits the creation of child sexual abuse material (CSAM) and non-consensual imagery of real individuals under all circumstances.
                    </p>
                    <p className="text-sm text-yellow-300/80">
                      Outside of those restrictions, VeilStudio does not prohibit the creation of adult content. Once you verify your age by purchasing credits, the content filter can be toggled on or off in the Settings menu.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <p className="text-md text-red-400">{error}</p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                  onClick={() => {
                    setError(null);
                    if (!currentImage) {
                      handleUploadNew();
                    }
                  }}
                  className={`font-bold py-2 px-6 rounded-lg text-md transition-colors ${
                    isSafetyIssue
                      ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  Try Again
              </button>
              {isSafetyIssue && !hasPurchasedCredits && (
                <button
                  onClick={() => {
                    setError(null);
                    setShowPricingModal(true);
                  }}
                  className="font-bold py-2 px-6 rounded-lg text-md transition-all bg-gradient-to-br from-purple-600 to-pink-600 text-white hover:shadow-lg hover:-translate-y-px active:scale-95"
                >
                  Purchase Credits
                </button>
              )}
            </div>
          </div>
        );
    }
    
    if (view === 'start') {
      return <StartScreen
        onFileSelect={handleFileSelect}
        onCompositeSelect={handleCompositeSelect}
        onUseWebcamClick={handleUseWebcamClick}
        onUseWebcamForCompositeClick={handleUseWebcamForCompositeClick}
        onTextToImageGenerate={handleTextToImageGenerate}
        imageOptions={imageGenerationOptions}
        onImageOptionsChange={handleImageOptionsChange}
        onVideoGenerate={handleStartScreenVideoGenerate}
        onReferenceVideoSelect={handleReferenceVideoSelect}
        onWanReferenceImagesChange={handleWanReferenceImagesChange}
        wanReferenceImages={wanReferenceImages}
        referenceVideoFile={referenceVideoFile}
        referenceVideoUrl={referenceVideoUrl}
        referenceVideoDuration={referenceVideoDuration}
        onSeedanceReferenceVideoSelect={handleSeedanceReferenceVideoSelect}
        seedanceReferenceImages={seedanceReferenceImages}
        seedanceReferenceVideoFile={seedanceReferenceVideoFile}
        seedanceReferenceVideoUrl={seedanceReferenceVideoUrl}
        seedanceReferenceVideoDuration={seedanceReferenceVideoDuration}
        seedanceReferenceAudioFile={seedanceReferenceAudioFile}
        onSeedanceReferenceImagesChange={handleSeedanceReferenceImagesChange}
        onSeedanceReferenceVideoUrlRemove={handleSeedanceReferenceVideoUrlRemove}
        onSeedanceReferenceAudioSelect={handleSeedanceReferenceAudioSelect}
        videoProvider={videoProvider}
        onVideoProviderChange={setVideoProvider}
        activeMode={creativeMode}
        onModeChange={handleModeChange}
        compositeFile1={sourceImage1}
        isAuthenticated={isLoaded && isSignedIn}
        onShowSignupPrompt={() => setShowSignupPrompt(true)}
        isGeneratingImage={isLoading}
        imageCreditCost={getImageCreditCost(
          imageGenerationOptions.provider,
          imageGenerationOptions.resolution,
          creativeMode === 'composite' ? 'image-to-image' : 'text-to-image',
          imageGenerationOptions.seedreamTier,
          creativeMode === 'composite' ? 2 : 0
        )}
        onSelectGalleryImage={handleSelectGalleryImage}
        onSelectGalleryVideo={handleSelectGalleryVideo}
        onMakeGalleryImageReference={handleMakeGalleryImageReference}
        onMakeGalleryVideoReference={handleMakeGalleryVideoReference}
        galleryRefreshTrigger={galleryRefreshTrigger}
        videoError={videoError}
      />;
    }

    if (view === 'webcam') {
        return (
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Spinner /></div>}>
            <WebcamCapture onCapture={handleWebcamCapture} onBack={handleUploadNew} />
          </Suspense>
        );
    }

    if (view === 'composite' && sourceImage1 && sourceImage2) {
      return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Spinner /></div>}>
          <CompositeScreen
            sourceImage1={sourceImage1}
            sourceImage2={sourceImage2}
            imageOptions={imageGenerationOptions}
            onImageOptionsChange={handleImageOptionsChange}
            imageCreditCost={getImageCreditCost(imageGenerationOptions.provider, imageGenerationOptions.resolution, 'image-to-image', imageGenerationOptions.seedreamTier, 2)}
            onGenerate={handleGenerateComposite}
            isLoading={isLoading}
            onBack={handleUploadNew}
          />
        </Suspense>
      );
    }

    if (view === 'editor' && (currentImageUrl || creativeMode === 'video')) {
      // Determine which "before" image to show in slider based on compare mode
      const sliderBeforeImage = sliderCompareMode === 'original' ? originalImageUrl : previousImageUrl;
      const sliderBeforeLabel = sliderCompareMode === 'original' ? 'Original' : 'Previous';
      const hasGeneratedVideoPreview = creativeMode === 'video' && Boolean(videoUrl);

      const imageDisplay = currentImageUrl && showSlider && canUndo && activeTab !== 'crop' && sliderBeforeImage ? (
        <BeforeAfterSlider
          beforeImage={sliderBeforeImage}
          afterImage={currentImageUrl}
          beforeLabel={sliderBeforeLabel}
          afterLabel="Current"
        />
      ) : currentImageUrl ? (
        <div className="relative">
          {/* Base image is the original, only shown when comparing and current image exists */}
          {originalImageUrl && isComparing && canUndo && (
              <img
                  key={originalImageUrl}
                  src={originalImageUrl}
                  alt="Original"
                  className="w-full h-auto object-contain max-h-[60vh] rounded-xl pointer-events-none"
              />
          )}
          {/* The current image */}
          <img
              ref={imgRef}
              key={currentImageUrl}
              src={currentImageUrl}
              alt="Current"
              onClick={handleImageClick}
              className={`${originalImageUrl && isComparing && canUndo ? 'absolute top-0 left-0' : ''} w-full h-auto object-contain max-h-[60vh] rounded-xl transition-opacity duration-200 ease-in-out ${isComparing && canUndo ? 'opacity-0' : 'opacity-100'} ${activeTab === 'retouch' ? 'cursor-crosshair' : ''}`}
          />
        </div>
      ) : null;
      
      // For ReactCrop, we need a single image element. We'll use the current one.
      const cropImageElement = currentImageUrl ? (
        <img 
          ref={imgRef}
          key={`crop-${currentImageUrl}`}
          src={currentImageUrl} 
          alt="Crop this image"
          className="w-full h-auto object-contain max-h-[60vh] rounded-xl"
        />
      ) : null;


      return (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-6 animate-fade-in">
          {/* Persistent Mode Selector */}
          <div className="w-full bg-gray-800/50 border border-gray-700/80 rounded-xl p-2 backdrop-blur-sm">
            <ModeSelector activeMode={creativeMode} onModeChange={handleModeChange} />
          </div>

          {hasGeneratedVideoPreview ? (
            <div className="relative w-full overflow-hidden rounded-xl bg-black/30 shadow-2xl">
              <video
                src={videoUrl || undefined}
                controls
                playsInline
                className="max-h-[70vh] w-full bg-black object-contain"
              />
              <div className="absolute left-3 top-3 rounded-md bg-black/60 px-3 py-1 text-sm text-gray-200 backdrop-blur-sm">
                Generated Video
              </div>
              <button
                onClick={handleVideoDownload}
                className="absolute bottom-3 right-3 rounded-md border border-white bg-black/30 p-2 transition-all duration-200 ease-in-out hover:bg-white/10 active:scale-95"
                aria-label="Download video"
              >
                <DownloadIcon className="h-5 w-5 text-white" />
              </button>
            </div>
          ) : currentImageUrl ? (
            <div className="relative w-full overflow-hidden rounded-xl bg-black/20 shadow-2xl">
                {isLoading && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/70 animate-fade-in">
                        <Spinner />
                        <p className="text-gray-300">
                          {isProcessingFile
                            ? 'Processing image...'
                            : creativeMode === 'video'
                              ? 'AI is generating your video...'
                              : 'AI is working its magic...'}
                        </p>
                    </div>
                )}

                {activeTab === 'crop' && creativeMode === 'single' ? (
                  <div className="flex w-full items-center justify-center">
                    <ReactCrop
                      crop={crop}
                      onChange={c => setCrop(c)}
                      onComplete={c => setCompletedCrop(c)}
                      aspect={aspect}
                      className="max-h-[60vh]"
                    >
                      {cropImageElement}
                    </ReactCrop>
                  </div>
                ) : imageDisplay }

                {displayHotspot && !isLoading && activeTab === 'retouch' && creativeMode === 'single' && (
                    <div
                        className="absolute z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500/50 pointer-events-none"
                        style={{ left: `${displayHotspot.x}px`, top: `${displayHotspot.y}px` }}
                    >
                        <div className="absolute inset-0 h-6 w-6 rounded-full bg-blue-400 animate-ping"></div>
                    </div>
                )}

                {creativeMode === 'video' && !isLoading && (
                  <div className="absolute left-3 top-3 z-20 rounded-md bg-black/60 px-3 py-1 text-sm text-gray-300 backdrop-blur-sm">
                    Reference Image
                  </div>
                )}

                {!isLoading && activeTab !== 'crop' && creativeMode === 'single' && (
                  <button
                    onClick={handleDownload}
                    className="absolute bottom-3 right-3 z-20 rounded-md border border-white bg-transparent p-2 transition-all duration-200 ease-in-out hover:bg-white/10 active:scale-95"
                    aria-label="Download image"
                  >
                    <DownloadIcon className="h-5 w-5 text-white" />
                  </button>
                )}
            </div>
          ) : creativeMode === 'video' && isLoading ? (
            /* Loading state for text-to-video (no reference image) */
            <div className="relative w-full shadow-2xl rounded-xl overflow-hidden bg-black/20 min-h-[200px] flex items-center justify-center">
              <div className="flex flex-col items-center gap-4 animate-fade-in">
                <Spinner />
                <p className="text-gray-300">AI is generating your video...</p>
              </div>
            </div>
          ) : null}

          {/* Image editing toolbar */}
          {creativeMode === 'single' && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                  aria-label="Undo last action"
              >
                  <UndoIcon className="w-5 h-5 mr-2" />
                  Undo
              </button>
              <button
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                  aria-label="Redo last action"
              >
                  <RedoIcon className="w-5 h-5 mr-2" />
                  Redo
              </button>

              <div className="h-6 w-px bg-gray-600 mx-1 hidden sm:block"></div>

              {canUndo && (
                <button
                    onMouseDown={() => setIsComparing(true)}
                    onMouseUp={() => setIsComparing(false)}
                    onMouseLeave={() => setIsComparing(false)}
                    onTouchStart={() => setIsComparing(true)}
                    onTouchEnd={() => setIsComparing(false)}
                    className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
                    aria-label="Press and hold to see original image"
                >
                    <EyeIcon className="w-5 h-5 mr-2" />
                    Compare
                </button>
              )}

              {/* Slider toggle and mode selector */}
              {canUndo && activeTab !== 'crop' && (
                <>
                  <button
                    onClick={handleToggleSlider}
                    className={`flex items-center justify-center text-center ${showSlider ? 'bg-blue-600/30 border-blue-400 text-blue-300' : 'bg-white/10 border-white/20 text-gray-200'} border font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base`}
                    aria-label="Toggle comparison slider"
                    aria-pressed={showSlider}
                  >
                    <SlidersIcon className="w-5 h-5 mr-2" />
                    Slider
                  </button>

                  {showSlider && (
                    <select
                      value={sliderCompareMode}
                      onChange={(e) => setSliderCompareMode(e.target.value as 'original' | 'previous')}
                      className="bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-3 rounded-md text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                      aria-label="Select comparison mode"
                    >
                      <option value="original" className="bg-gray-800">vs Original</option>
                      <option value="previous" className="bg-gray-800">vs Previous</option>
                    </select>
                  )}
                </>
              )}

              <button
                  onClick={handleReset}
                  disabled={!canUndo}
                  className="text-center bg-transparent border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/10 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-transparent"
                >
                  Reset
              </button>
              <button
                  onClick={handleUploadNew}
                  className="text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
              >
                  Home/Gallery
              </button>
            </div>
          )}

          {creativeMode === 'video' && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                  onClick={handleUploadNew}
                  className="text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
              >
                  Home/Gallery
              </button>
            </div>
          )}

          {(creativeMode === 'single' || creativeMode === 'composite') && (
            <div className="w-full bg-gray-800/80 border border-gray-700/80 rounded-lg p-4 sm:p-5 flex flex-col gap-4 backdrop-blur-sm">
              <ImageModelSelector
                title={creativeMode === 'composite' ? 'Combined Photos' : 'Single Photo'}
                value={imageGenerationOptions}
                onChange={handleImageOptionsChange}
                isLoading={isLoading}
                workflow="image-to-image"
              />
              <ImageModelSettings
                value={imageGenerationOptions}
                onChange={handleImageOptionsChange}
                isLoading={isLoading}
                workflow="image-to-image"
              />
            </div>
          )}

          {/* Mode-specific panels */}
          {creativeMode === 'single' && (
            <>
              <div className="w-full bg-gray-800/80 border border-gray-700/80 rounded-lg p-2 flex items-center justify-center gap-1 sm:gap-2 backdrop-blur-sm">
                  {(['adjust', 'crop', 'retouch', 'filters'] as Tab[]).map(tab => (
                       <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`flex-1 capitalize font-semibold py-3 px-2 sm:px-5 rounded-md transition-all duration-200 text-sm sm:text-base ${
                              activeTab === tab
                              ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/40'
                              : 'text-gray-300 hover:text-white hover:bg-white/10'
                          }`}
                      >
                          {tab}
                      </button>
                  ))}
              </div>

              <div className="w-full">
                  {activeTab === 'retouch' && (
                      <div className="flex flex-col items-center gap-4">
                          <p className="text-md text-gray-400">
                              {editHotspot ? 'Great! Now describe your localized edit below.' : 'Click an area on the image to make a precise edit.'}
                          </p>
                          <form onSubmit={(e) => { e.preventDefault(); handleGenerate(); }} className="w-full flex flex-col gap-2 sm:flex-row sm:items-center">
                              <input
                                  type="text"
                                  value={prompt}
                                  onChange={(e) => setPrompt(e.target.value)}
                                  placeholder={editHotspot ? "e.g., 'change my shirt color to blue'" : "First click a point on the image"}
                                  className="flex-grow bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-5 text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={isLoading || !editHotspot}
                              />
                              <button
                                  type="submit"
                                  className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-5 px-6 text-base rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none sm:w-auto sm:px-8 sm:text-lg"
                                  disabled={isLoading || !prompt.trim() || !editHotspot}
                              >
                                  {isLoading ? `Generating... (${imageEditCreditLabel})` : `Generate - ${imageEditCreditLabel}`}
                              </button>
                          </form>
                      </div>
                  )}
                  {activeTab === 'crop' && <CropPanel onApplyCrop={handleApplyCrop} onSetAspect={setAspect} isLoading={isLoading} isCropping={!!completedCrop?.width && completedCrop.width > 0} />}
                  {activeTab === 'adjust' && <AdjustmentPanel key={`adjust-${historyIndex}-${history.length}`} onApplyAdjustment={handleApplyAdjustment} isLoading={isLoading} imageCreditCost={imageEditCreditCost} initialPrompt={prompt} />}
                  {activeTab === 'filters' && <FilterPanel key={`filter-${historyIndex}-${history.length}`} onApplyFilter={handleApplyFilter} isLoading={isLoading} imageCreditCost={imageEditCreditCost} initialPrompt={prompt} />}
              </div>
            </>
          )}

          {creativeMode === 'composite' && currentImageUrl && (
            <Suspense fallback={<div className="flex items-center justify-center py-8"><Spinner /></div>}>
              <CompositeEditorOverlay
                baseImageUrl={currentImageUrl}
                onCombine={handleCompositeFromEditor}
                onCancel={() => setCreativeMode('single')}
                onHomeGallery={handleUploadNew}
                onWebcamClick={handleWebcamForCompositeSecond}
                onTextToImageGenerate={handleTextToImageGenerate}
                isAuthenticated={!!(isLoaded && isSignedIn)}
                onShowSignupPrompt={() => setShowSignupPrompt(true)}
                isGeneratingImage={isLoading}
                imageCreditCost={imageCreditCost}
              />
            </Suspense>
          )}

          {creativeMode === 'video' && (
            <Suspense fallback={<div className="flex items-center justify-center py-8"><Spinner /></div>}>
              <VideoControlsPanel
                isLoading={isLoading}
                onGenerate={handleGenerateVideo}
                videoProvider={videoProvider}
                onVideoProviderChange={setVideoProvider}
                videoUrl={videoUrl}
                videoError={videoError}
                restoredPrompt={restoredVideoPrompt}
                promptRecallKey={videoPromptRecallKey}
                referenceImage={null}
                wanReferenceImages={wanReferenceImages}
                referenceVideoFile={referenceVideoFile}
                referenceVideoUrl={referenceVideoUrl}
                referenceVideoDuration={referenceVideoDuration}
                seedanceReferenceImages={seedanceReferenceImages}
                seedanceReferenceVideoFile={seedanceReferenceVideoFile}
                seedanceReferenceVideoUrl={seedanceReferenceVideoUrl}
                seedanceReferenceVideoDuration={seedanceReferenceVideoDuration}
                seedanceReferenceAudioFile={seedanceReferenceAudioFile}
                onReferenceImageSelect={handleReferenceImageSelect}
                onWanReferenceImagesChange={handleWanReferenceImagesChange}
                onReferenceVideoSelect={handleReferenceVideoSelect}
                onSeedanceReferenceImagesChange={handleSeedanceReferenceImagesChange}
                onSeedanceReferenceVideoSelect={handleSeedanceReferenceVideoSelect}
                onSeedanceReferenceVideoUrlRemove={handleSeedanceReferenceVideoUrlRemove}
                onSeedanceReferenceAudioSelect={handleSeedanceReferenceAudioSelect}
                onUseGeneratedVideoAsReference={handleUseGeneratedVideoAsReference}
              />
            </Suspense>
          )}

          {(creativeMode === 'single' || creativeMode === 'composite' || creativeMode === 'video') && (
            <Gallery
              onSelectImage={handleSelectGalleryImage}
              onSelectVideo={handleSelectGalleryVideo}
              onMakeImageReference={handleMakeGalleryImageReference}
              onMakeVideoReference={creativeMode === 'video' ? handleMakeGalleryVideoReference : undefined}
              imageReferenceActionLabel={creativeMode === 'composite' ? 'Add Reference' : creativeMode === 'single' ? 'Use Photo' : 'Make Reference'}
              refreshTrigger={galleryRefreshTrigger}
            />
          )}
        </div>
      );
    }
    
    // Fallback just in case
    return <StartScreen
      onFileSelect={handleFileSelect}
      onCompositeSelect={handleCompositeSelect}
      onUseWebcamClick={handleUseWebcamClick}
      onUseWebcamForCompositeClick={handleUseWebcamForCompositeClick}
      onTextToImageGenerate={handleTextToImageGenerate}
      imageOptions={imageGenerationOptions}
      onImageOptionsChange={handleImageOptionsChange}
      onVideoGenerate={handleStartScreenVideoGenerate}
      onReferenceVideoSelect={handleReferenceVideoSelect}
      onWanReferenceImagesChange={handleWanReferenceImagesChange}
      wanReferenceImages={wanReferenceImages}
      referenceVideoFile={referenceVideoFile}
      referenceVideoUrl={referenceVideoUrl}
      referenceVideoDuration={referenceVideoDuration}
      onSeedanceReferenceVideoSelect={handleSeedanceReferenceVideoSelect}
      seedanceReferenceImages={seedanceReferenceImages}
      seedanceReferenceVideoFile={seedanceReferenceVideoFile}
      seedanceReferenceVideoUrl={seedanceReferenceVideoUrl}
      seedanceReferenceVideoDuration={seedanceReferenceVideoDuration}
      seedanceReferenceAudioFile={seedanceReferenceAudioFile}
      onSeedanceReferenceImagesChange={handleSeedanceReferenceImagesChange}
      onSeedanceReferenceVideoUrlRemove={handleSeedanceReferenceVideoUrlRemove}
      onSeedanceReferenceAudioSelect={handleSeedanceReferenceAudioSelect}
      videoProvider={videoProvider}
      onVideoProviderChange={setVideoProvider}
      activeMode={creativeMode}
      onModeChange={handleModeChange}
      isAuthenticated={isLoaded && isSignedIn}
      onShowSignupPrompt={() => setShowSignupPrompt(true)}
      isGeneratingImage={isLoading}
      imageCreditCost={getImageCreditCost(
        imageGenerationOptions.provider,
        imageGenerationOptions.resolution,
        creativeMode === 'composite' ? 'image-to-image' : 'text-to-image',
        imageGenerationOptions.seedreamTier,
        creativeMode === 'composite' ? 2 : 0
      )}
      onSelectGalleryImage={handleSelectGalleryImage}
      onSelectGalleryVideo={handleSelectGalleryVideo}
      onMakeGalleryImageReference={handleMakeGalleryImageReference}
      onMakeGalleryVideoReference={handleMakeGalleryVideoReference}
      galleryRefreshTrigger={galleryRefreshTrigger}
      videoError={videoError}
    />;
  };
  

  return (
    <div className="min-h-screen text-gray-100 flex flex-col">
      <Header
        onShowPricing={() => setShowPricingModal(true)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        hasPurchasedCredits={hasPurchasedCredits}
      />
      <main className={`flex-grow w-full max-w-[1600px] mx-auto p-4 md:p-8 flex justify-center ${view === 'editor' ? 'items-start' : 'items-center'}`}>
        {renderContent()}
      </main>

      {/* Footer */}
      <Footer onShowPricing={() => setShowPricingModal(true)} />

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
            onRetry={() => {
              setShowPaymentCancelled(false);
              // Could trigger a new payment flow here if needed
            }}
          />
        </Suspense>
      )}

      {/* Pricing Modal */}
      <Suspense fallback={null}>
        <PricingModal
          isOpen={showPricingModal}
          onClose={() => setShowPricingModal(false)}
        />
      </Suspense>

      {/* Signup Prompt Modal */}
      <SignupPromptModal
        isOpen={showSignupPrompt}
        onClose={() => {
          console.log('🔴 Closing signup prompt modal');
          setShowSignupPrompt(false);
        }}
      />
    </div>
  );
};

export default App;
