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
 * - Backend API for all AI operations (Gemini 2.5 Flash)
 */

import React, { useState, useCallback, useRef, useEffect, useOptimistic, startTransition, Suspense, lazy } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { useUser } from '@clerk/clerk-react';
import {
  useGenerateEdit,
  useGenerateFilter,
  useGenerateAdjust,
  useGenerateComposite,
  useGenerateTextToImage,
  useGenerateEditSeeDream,
  useGenerateFilterSeeDream,
  useGenerateAdjustSeeDream,
  useGenerateCompositeSeeDream
} from './src/hooks/useImageGeneration';
import Header from './components/Header';
import Footer from './components/Footer';
import Spinner from './components/Spinner';
import FilterPanel from './components/FilterPanel';
import AdjustmentPanel from './components/AdjustmentPanel';
import CropPanel from './components/CropPanel';
import { UndoIcon, RedoIcon, EyeIcon } from './components/icons';
import StartScreen from './components/StartScreen';
import SignupPromptModal from './components/SignupPromptModal';
import { SettingsState } from './components/SettingsMenu';

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
const isSafetyFilterError = (errorMessage: string): boolean => {
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
        '500', // Google sometimes returns 500 for safety violations
        'internal server error'
    ];

    const lowerError = errorMessage.toLowerCase();
    return safetyKeywords.some(keyword => lowerError.includes(keyword));
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
  apiProvider: 'gemini',
  resolution: '2K'
};

const App: React.FC = () => {
  const { isSignedIn, isLoaded } = useUser();
  const [view, setView] = useState<View>('start');
  const [history, setHistory] = useState<File[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [prompt, setPrompt] = useState<string>('');
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
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error);
    }
    return DEFAULT_SETTINGS;
  });

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      console.log('💾 Saved settings to localStorage:', settings);
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  }, [settings]);

  const handleSettingsChange = useCallback((newSettings: SettingsState) => {
    setSettings(newSettings);
    console.log('⚙️ Settings updated:', newSettings);
  }, []);

  // Smart preloading for lazy components
  useEffect(() => {
    // Preload CompositeScreen when user first uploads an image
    if (history.length > 0) {
      import('./components/CompositeScreen');
    }
  }, [history.length]);

  // Handle SSO callback from Clerk OAuth
  useEffect(() => {
    const handleSSOCallback = () => {
      const hash = window.location.hash;
      if (hash.includes('/sso-callback')) {
        console.log('🔄 Handling SSO callback, clearing hash...');
        // Clear the hash to return to normal app state
        window.history.replaceState(null, '', window.location.pathname);
      }
    };

    handleSSOCallback();

    // Listen for hash changes
    const handleHashChange = () => {
      handleSSOCallback();
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Payment flow state
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [showPaymentCancelled, setShowPaymentCancelled] = useState(false);
  const [paymentSessionId, setPaymentSessionId] = useState<string | null>(null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // TanStack Query mutations - conditionally use Gemini or SeeDream based on settings
  const editMutation = settings.apiProvider === 'seedream' ? useGenerateEditSeeDream() : useGenerateEdit();
  const filterMutation = settings.apiProvider === 'seedream' ? useGenerateFilterSeeDream() : useGenerateFilter();
  const adjustMutation = settings.apiProvider === 'seedream' ? useGenerateAdjustSeeDream() : useGenerateAdjust();
  const compositeMutation = settings.apiProvider === 'seedream' ? useGenerateCompositeSeeDream() : useGenerateComposite();
  const textToImageMutation = useGenerateTextToImage(); // Only uses Gemini for now

  // React 19 optimistic state for immediate UI feedback
  const [optimisticHistory, setOptimisticHistory] = useOptimistic(
    history,
    (currentHistory, newImage: File) => [...currentHistory, newImage]
  );

  // Combined loading state from mutations and file processing
  const isLoading = editMutation.isPending || filterMutation.isPending || adjustMutation.isPending || compositeMutation.isPending || textToImageMutation.isPending || isProcessingFile;

  const [sourceImage1, setSourceImage1] = useState<File | null>(null);
  const [sourceImage2, setSourceImage2] = useState<File | null>(null);
  
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>();
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Use optimistic history for immediate UI feedback, fallback to real history
  const displayHistory = optimisticHistory.length > history.length ? optimisticHistory : history;
  const currentImage = displayHistory[historyIndex] ?? null;
  const originalImage = history[0] ?? null;

  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

  // Effect to create and revoke object URLs safely for the current image
  useEffect(() => {
    if (currentImage) {
      const url = URL.createObjectURL(currentImage);
      setCurrentImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCurrentImageUrl(null);
    }
  }, [currentImage]);
  
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

  const addImageToHistory = useCallback((newImageFile: File) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newImageFile);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    // Reset transient states after an action
    setCrop(undefined);
    setCompletedCrop(undefined);
  }, [history, historyIndex]);

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
        setHistoryIndex(0);
        setEditHotspot(null);
        setDisplayHotspot(null);
        setActiveTab('adjust');
        setCrop(undefined);
        setCompletedCrop(undefined);
        setView('editor');
      } catch (error) {
        console.error('Failed to process HEIC file:', error);
        setError(`Failed to process HEIC image: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsProcessingFile(false);
      }
    } else {
      // For non-HEIC files, use directly
      setHistory([file]);
      setHistoryIndex(0);
      setEditHotspot(null);
      setDisplayHotspot(null);
      setActiveTab('adjust');
      setCrop(undefined);
      setCompletedCrop(undefined);
      setView('editor');
    }
  }, []);

  const handleCompositeSelect = useCallback(async (file1: File, file2: File) => {
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
        setHistoryIndex(-1);
        setView('composite');
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
      setHistoryIndex(-1);
      setView('composite');
    }
  }, []);

  const [isWebcamForComposite, setIsWebcamForComposite] = useState(false);
  const [startScreenTab, setStartScreenTab] = useState<'single' | 'composite'>('single');

  const handleWebcamCapture = useCallback((file: File) => {
    if (isWebcamForComposite) {
      setSourceImage1(file);
      setIsWebcamForComposite(false);
      setView('start'); // This will show the start screen but with composite tab active and sourceImage1 set
    } else {
      handleImageUpload(file);
    }
  }, [isWebcamForComposite, handleImageUpload]);

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
    setStartScreenTab('composite');
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
      const response = await editMutation.mutateAsync({
        image: currentImage,
        prompt,
        x: editHotspot.x,
        y: editHotspot.y,
        ...(settings.apiProvider === 'seedream' && { resolution: settings.resolution })
      });

      if (response.success && response.image) {
        // Convert the base64 image data to a File
        const imageBlob = await fetch(`data:${response.image.mimeType || 'image/png'};base64,${response.image.data}`).then(r => r.blob());
        const newImageFile = new File([imageBlob], `edited-${Date.now()}.png`, { type: 'image/png' });
        addImageToHistory(newImageFile);
        setEditHotspot(null);
        setDisplayHotspot(null);
        setPrompt('');
      } else {
        throw new Error(response.message || 'Failed to generate image');
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || err.message || 'An unknown error occurred.';
      setError(`Failed to generate the image. ${errorMessage}`);
      console.error(err);
    }
  }, [currentImage, prompt, editHotspot, addImageToHistory, editMutation, setOptimisticHistory]);

  const handleGenerateComposite = useCallback(async (compositePrompt: string) => {
    console.log('🎯 handleGenerateComposite called with prompt:', compositePrompt)
    console.log('🖼️ Source image 1:', sourceImage1?.name, sourceImage1?.size)
    console.log('🖼️ Source image 2:', sourceImage2?.name, sourceImage2?.size)
    console.log('🔧 compositeMutation object:', compositeMutation)
    
    if (!sourceImage1 || !sourceImage2) {
        setError('Two source images are required to generate a composite.');
        return;
    }

    setError(null);

    try {
        console.log('🚀 About to call compositeMutation.mutateAsync...')
        const response = await compositeMutation.mutateAsync({
            image1: sourceImage1,
            image2: sourceImage2,
            prompt: compositePrompt,
            ...(settings.apiProvider === 'seedream' && { resolution: settings.resolution })
        });
        console.log('✅ compositeMutation.mutateAsync returned:', response)

        if (response.success && response.image) {
            // Convert the base64 image data to a File  
            const imageBlob = await fetch(`data:${response.image.mimeType || 'image/png'};base64,${response.image.data}`).then(r => r.blob());
            const newImageFile = new File([imageBlob], `composite-${Date.now()}.png`, { type: 'image/png' });
            
            // The new composite image becomes the start of our editing history
            setHistory([newImageFile]);
            setHistoryIndex(0);
            setView('editor'); // Transition to the editor
            setSourceImage1(null); // Clear the source images
            setSourceImage2(null);
        } else {
            throw new Error(response.message || 'Failed to generate composite image');
        }
    } catch (err: any) {
        const errorMessage = err?.response?.data?.message || err.message || 'An unknown error occurred.';
        setError(`Failed to generate the composite image. ${errorMessage}`);
        console.error(err);
    }
  }, [sourceImage1, sourceImage2, compositeMutation, isLoaded, isSignedIn]);
  
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
      const response = await filterMutation.mutateAsync({
        image: currentImage,
        filterType: filterPrompt,
        ...(settings.apiProvider === 'seedream' && { resolution: settings.resolution })
      });

      if (response.success && response.image) {
        const imageBlob = await fetch(`data:${response.image.mimeType || 'image/png'};base64,${response.image.data}`).then(r => r.blob());
        const newImageFile = new File([imageBlob], `filtered-${Date.now()}.png`, { type: 'image/png' });
        addImageToHistory(newImageFile);
      } else {
        throw new Error(response.message || 'Failed to apply filter');
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || err.message || 'An unknown error occurred.';
      setError(`Failed to apply the filter. ${errorMessage}`);
      console.error(err);
    }
  }, [currentImage, addImageToHistory, filterMutation, setOptimisticHistory]);
  
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
      // Send the prompt directly to the API
      const response = await adjustMutation.mutateAsync({
        image: currentImage,
        prompt: adjustmentPrompt,
        ...(settings.apiProvider === 'seedream' && { resolution: settings.resolution })
      });

      if (response.success && response.image) {
        const imageBlob = await fetch(`data:${response.image.mimeType || 'image/png'};base64,${response.image.data}`).then(r => r.blob());
        const newImageFile = new File([imageBlob], `adjusted-${Date.now()}.png`, { type: 'image/png' });
        addImageToHistory(newImageFile);
      } else {
        throw new Error(response.message || 'Failed to apply adjustment');
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || err.message || 'An unknown error occurred.';
      setError(`Failed to apply the adjustment. ${errorMessage}`);
      console.error(err);
    }
  }, [currentImage, addImageToHistory, adjustMutation, setOptimisticHistory]);

  const handleApplyAspectRatio = useCallback(async (aspectRatioFile: string, customPrompt: string) => {
    if (!currentImage) {
      setError('No image loaded to apply aspect ratio change to.');
      return;
    }

    setError(null);

    try {
      // Add optimistic update for immediate feedback
      const optimisticFile = new File([currentImage], `optimistic-aspect-${Date.now()}.png`, { type: currentImage.type });
      startTransition(() => {
        setOptimisticHistory(optimisticFile);
      });

      // SeeDream: Use native aspect ratio support
      if (settings.apiProvider === 'seedream') {
        const basePrompt = customPrompt.trim() || 'Adjust the image to match the new aspect ratio while preserving the main subject';

        const response = await adjustMutation.mutateAsync({
          image: currentImage,
          prompt: basePrompt,
          aspectRatioFile: aspectRatioFile, // Backend will map this to SeeDream format
          resolution: settings.resolution
        });

        if (response.success && response.image) {
          const imageBlob = await fetch(`data:${response.image.mimeType || 'image/png'};base64,${response.image.data}`).then(r => r.blob());
          const newImageFile = new File([imageBlob], `aspect-ratio-${Date.now()}.png`, { type: 'image/png' });
          addImageToHistory(newImageFile);
        } else {
          throw new Error(response.message || 'Failed to apply aspect ratio change');
        }
      }
      // Nano Banana: Use transparent template workaround
      else {
        // Load the transparent aspect ratio template from the blog folder
        const templateResponse = await fetch(`/veilpix/blog/nano-banana-aspect-ratio-trick/downloads/${aspectRatioFile}`);
        if (!templateResponse.ok) {
          throw new Error(`Failed to load aspect ratio template: ${aspectRatioFile}`);
        }

        const templateBlob = await templateResponse.blob();
        const templateFile = new File([templateBlob], aspectRatioFile, { type: 'image/png' });

        // Create the composite prompt with the magic instruction
        const basePrompt = customPrompt.trim() || 'Adjust the image to match the new aspect ratio while preserving the main subject';
        const compositePrompt = `${basePrompt}. Use the uploaded image as the reference for final aspect ratio.`;

        // Use the existing composite functionality with current image + template
        const response = await compositeMutation.mutateAsync({
          image1: currentImage,
          image2: templateFile,
          prompt: compositePrompt
        });

        if (response.success && response.image) {
          const imageBlob = await fetch(`data:${response.image.mimeType || 'image/png'};base64,${response.image.data}`).then(r => r.blob());
          const newImageFile = new File([imageBlob], `aspect-ratio-${Date.now()}.png`, { type: 'image/png' });
          addImageToHistory(newImageFile);
        } else {
          throw new Error(response.message || 'Failed to apply aspect ratio change');
        }
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || err.message || 'An unknown error occurred.';
      setError(`Failed to apply the aspect ratio change. ${errorMessage}`);
      console.error(err);
    }
  }, [currentImage, addImageToHistory, adjustMutation, compositeMutation, setOptimisticHistory, settings.apiProvider, settings.resolution]);

  const handleTextToImageGenerate = useCallback(async (textPrompt: string, onSuccess?: (file: File) => void) => {
    console.log('🎨 Starting text-to-image generation with prompt:', textPrompt);

    setError(null);

    // Add optimistic update for immediate feedback (only if not using callback)
    if (!onSuccess) {
      const optimisticFile = new File([new Blob()], `optimistic-text-to-image-${Date.now()}.png`, { type: 'image/png' });
      startTransition(() => {
        setOptimisticHistory(optimisticFile);
      });
    }

    try {
      const response = await textToImageMutation.mutateAsync({
        prompt: textPrompt
      });

      if (response.success && response.image) {
        const imageBlob = await fetch(`data:${response.image.mimeType || 'image/png'};base64,${response.image.data}`).then(r => r.blob());
        const newImageFile = new File([imageBlob], `text-to-image-${Date.now()}.png`, { type: 'image/png' });

        if (onSuccess) {
          // Callback mode: Pass the file to the callback (for composite mode)
          onSuccess(newImageFile);
          console.log('✅ Text-to-image generation successful, file passed to callback');
        } else {
          // Default mode: Start a new editing session with the generated image (for single photo mode)
          setHistory([newImageFile]);
          setHistoryIndex(0);
          setActiveTab('adjust');
          setView('editor');
          console.log('✅ Text-to-image generation successful, image added to history');
        }
      } else {
        throw new Error(response.message || 'Failed to generate image from text');
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || err.message || 'An unknown error occurred.';
      setError(`Failed to generate image from text. ${errorMessage}`);
      console.error('💥 Text-to-image generation failed:', err);
    }
  }, [addImageToHistory, textToImageMutation, setOptimisticHistory]);

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
      setHistoryIndex(-1);
      setError(null);
      setPrompt('');
      setEditHotspot(null);
      setDisplayHotspot(null);
      setSourceImage1(null);
      setSourceImage2(null);
      setView('start');
  }, []);

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
       const isSafetyIssue = isSafetyFilterError(error);

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
                <p>
                  Your image or prompt couldn't be processed because it may contain content that doesn't meet Google's safety guidelines.
                </p>
                <p className="text-sm text-yellow-300/80">
                  VeilPix does not log your prompts or photos, but Google's AI service filters content it deems harmful, including NSFW material, violence, or other policy violations.
                </p>
                <p className="text-sm text-yellow-300/80">
                  Please try again with a different image or prompt that complies with content policies.
                </p>
              </div>
            ) : (
              <p className="text-md text-red-400">{error}</p>
            )}

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
        initialTab={startScreenTab}
        compositeFile1={sourceImage1}
        isAuthenticated={isLoaded && isSignedIn}
        onShowSignupPrompt={() => setShowSignupPrompt(true)}
        isGeneratingImage={isLoading}
      />;
    }

    if (view === 'webcam') {
        return (
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Spinner /></div>}>
            <WebcamCapture onCapture={handleWebcamCapture} onBack={() => setView('start')} />
          </Suspense>
        );
    }

    if (view === 'composite' && sourceImage1 && sourceImage2) {
      return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Spinner /></div>}>
          <CompositeScreen
            sourceImage1={sourceImage1}
            sourceImage2={sourceImage2}
            onGenerate={handleGenerateComposite}
            isLoading={isLoading}
            onBack={handleUploadNew}
          />
        </Suspense>
      );
    }

    if (view === 'editor' && currentImageUrl) {
      const imageDisplay = (
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
      );
      
      // For ReactCrop, we need a single image element. We'll use the current one.
      const cropImageElement = (
        <img 
          ref={imgRef}
          key={`crop-${currentImageUrl}`}
          src={currentImageUrl} 
          alt="Crop this image"
          className="w-full h-auto object-contain max-h-[60vh] rounded-xl"
        />
      );


      return (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-6 animate-fade-in">
          <div className="relative w-full shadow-2xl rounded-xl overflow-hidden bg-black/20">
              {isLoading && (
                  <div className="absolute inset-0 bg-black/70 z-30 flex flex-col items-center justify-center gap-4 animate-fade-in">
                      <Spinner />
                      <p className="text-gray-300">
                        {isProcessingFile ? 'Processing image...' : 'AI is working its magic...'}
                      </p>
                  </div>
              )}
              
              {activeTab === 'crop' ? (
                <div className="flex justify-center items-center w-full">
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

              {displayHotspot && !isLoading && activeTab === 'retouch' && (
                  <div 
                      className="absolute rounded-full w-6 h-6 bg-blue-500/50 border-2 border-white pointer-events-none -translate-x-1/2 -translate-y-1/2 z-10"
                      style={{ left: `${displayHotspot.x}px`, top: `${displayHotspot.y}px` }}
                  >
                      <div className="absolute inset-0 rounded-full w-6 h-6 animate-ping bg-blue-400"></div>
                  </div>
              )}
          </div>

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
                  Upload New
              </button>

              <button
                  onClick={handleDownload}
                  className="flex-grow sm:flex-grow-0 ml-auto bg-green-600/20 border border-green-500 text-green-300 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-green-600/30 hover:border-green-400 active:scale-95 text-base"
              >
                  Download Image
              </button>
          </div>

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
                      <form onSubmit={(e) => { e.preventDefault(); handleGenerate(); }} className="w-full flex items-center gap-2">
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
                              className="bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-5 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                              disabled={isLoading || !prompt.trim() || !editHotspot}
                          >
                              Generate
                          </button>
                      </form>
                  </div>
              )}
              {activeTab === 'crop' && <CropPanel onApplyCrop={handleApplyCrop} onSetAspect={setAspect} isLoading={isLoading} isCropping={!!completedCrop?.width && completedCrop.width > 0} />}
              {activeTab === 'adjust' && <AdjustmentPanel onApplyAdjustment={handleApplyAdjustment} onApplyAspectRatio={handleApplyAspectRatio} isLoading={isLoading} apiProvider={settings.apiProvider} />}
              {activeTab === 'filters' && <FilterPanel onApplyFilter={handleApplyFilter} isLoading={isLoading} />}
          </div>
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
      isAuthenticated={isLoaded && isSignedIn}
      onShowSignupPrompt={() => setShowSignupPrompt(true)}
      isGeneratingImage={isLoading}
    />;
  };
  
  return (
    <div className="min-h-screen text-gray-100 flex flex-col">
      <Header
        onShowPricing={() => setShowPricingModal(true)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />
      <main className={`flex-grow w-full max-w-[1600px] mx-auto p-4 md:p-8 flex justify-center ${view === 'editor' ? 'items-start' : 'items-center'}`}>
        {renderContent()}
      </main>

      {/* Footer */}
      <Footer />

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