/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { lazy, Suspense, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { formatCreditLabel } from '../src/utils/creditFormatting';
import ImageDropzone from './ImageDropzone';
import ModeSelector, { type CreativeMode } from './ModeSelector';
import Spinner from './Spinner';
import {
  getImageCreditCost,
  ImageModelSelector,
  ImageModelSettings,
  normalizeImageGenerationOptions,
  type ImageGenerationOptions,
} from './ImageModelControlsPanel';
import type { GalleryVideoDetails } from '../src/utils/workflowStorage';

const VideoControlsPanel = lazy(() => import('./VideoControlsPanel'));
const StartScreenBelowFold = lazy(() => import('./StartScreenBelowFold'));

type VideoProvider = 'wan' | 'seedance';
type SeedanceVariant = 'regular' | 'fast' | 'mini';
type SeedanceInputMode = 'frames' | 'references';

interface StartScreenProps {
  onFileSelect: (files: FileList | null) => void;
  onCompositeSelect: (file1: File, file2: File, prompt: string, options: ImageGenerationOptions) => void;
  onUseWebcamClick: () => void;
  onUseWebcamForCompositeClick: () => void;
  onTextToImageGenerate?: (prompt: string, onSuccess?: (file: File) => void, options?: ImageGenerationOptions) => void;
  imageOptions: ImageGenerationOptions;
  onImageOptionsChange: (options: ImageGenerationOptions) => void;
  onVideoGenerate?: (options: {
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
  }) => void;
  onReferenceVideoSelect?: (file: File | null) => void;
  onWanReferenceImagesChange?: (files: File[]) => void;
  wanReferenceImages?: File[];
  referenceVideoFile?: File | null;
  referenceVideoUrl?: string | null;
  referenceVideoDuration?: number | null;
  onSeedanceReferenceVideoSelect?: (file: File | null) => void;
  seedanceInputMode?: SeedanceInputMode;
  seedanceFirstFrame?: File | null;
  seedanceLastFrame?: File | null;
  seedanceReferenceImages?: File[];
  seedanceReferenceVideoFile?: File | null;
  seedanceReferenceVideoUrl?: string | null;
  seedanceReferenceVideoDuration?: number | null;
  seedanceReferenceAudioFile?: File | null;
  onSeedanceReferenceImagesChange?: (files: File[]) => void;
  onSeedanceInputModeChange?: (mode: SeedanceInputMode) => void;
  onSeedanceFirstFrameSelect?: (file: File | null) => void;
  onSeedanceLastFrameSelect?: (file: File | null) => void;
  onSeedanceReferenceVideoUrlRemove?: () => void;
  onSeedanceReferenceAudioSelect?: (file: File | null) => void;
  videoProvider: VideoProvider;
  onVideoProviderChange: (provider: VideoProvider) => void;
  activeMode: CreativeMode;
  onModeChange: (mode: CreativeMode) => void;
  compositeFile1?: File | null;
  isAuthenticated?: boolean;
  onShowSignupPrompt?: () => void;
  isGeneratingImage?: boolean;
  imageCreditCost?: number;
  onSelectGalleryImage?: (file: File, prompt: string) => void;
  onSelectGalleryVideo?: (details: GalleryVideoDetails) => void;
  onMakeGalleryImageReference?: (file: File, prompt: string) => void;
  onMakeGalleryVideoReference?: (details: GalleryVideoDetails) => void;
  galleryRefreshTrigger?: number;
  videoError?: string | null;
}

const StartScreen: React.FC<StartScreenProps> = ({ onFileSelect, onCompositeSelect, onUseWebcamClick, onUseWebcamForCompositeClick, onTextToImageGenerate, imageOptions, onImageOptionsChange, onVideoGenerate, onReferenceVideoSelect, onWanReferenceImagesChange, wanReferenceImages = [], referenceVideoFile = null, referenceVideoUrl = null, referenceVideoDuration = null, onSeedanceReferenceVideoSelect, seedanceInputMode = 'references', seedanceFirstFrame = null, seedanceLastFrame = null, seedanceReferenceImages = [], seedanceReferenceVideoFile = null, seedanceReferenceVideoUrl = null, seedanceReferenceVideoDuration = null, seedanceReferenceAudioFile = null, onSeedanceReferenceImagesChange, onSeedanceInputModeChange, onSeedanceFirstFrameSelect, onSeedanceLastFrameSelect, onSeedanceReferenceVideoUrlRemove, onSeedanceReferenceAudioSelect, videoProvider, onVideoProviderChange, activeMode, onModeChange, compositeFile1: initialCompositeFile1 = null, isAuthenticated = false, onShowSignupPrompt, isGeneratingImage = false, imageCreditCost, onSelectGalleryImage, onSelectGalleryVideo, onMakeGalleryImageReference, onMakeGalleryVideoReference, galleryRefreshTrigger, videoError }) => {
  const [compositeFile1, setCompositeFile1] = useState<File | null>(initialCompositeFile1);
  const [compositeFile2, setCompositeFile2] = useState<File | null>(null);
  const [compositePrompt, setCompositePrompt] = useState('');
  const [singleTextPrompt, setSingleTextPrompt] = useState('');
  const [shouldLoadBelowFold, setShouldLoadBelowFold] = useState(false);
  const [startHeroHeight, setStartHeroHeight] = useState<number | null>(null);
  const belowFoldRef = useRef<HTMLDivElement>(null);
  const activeImageWorkflow = activeMode === 'composite' ? 'image-to-image' : 'text-to-image';
  const normalizedActiveImageOptions = normalizeImageGenerationOptions(imageOptions, activeImageWorkflow);
  const activeImageCreditCost = imageCreditCost ?? getImageCreditCost(normalizedActiveImageOptions.provider, normalizedActiveImageOptions.resolution, activeImageWorkflow, normalizedActiveImageOptions.seedreamTier, activeMode === 'composite' ? 2 : 0);
  const sourceGenerationCreditCost = getImageCreditCost(normalizedActiveImageOptions.provider, normalizedActiveImageOptions.resolution, 'text-to-image', normalizedActiveImageOptions.seedreamTier);
  const imageCreditLabel = formatCreditLabel(activeImageCreditCost);

  // Update composite file when prop changes
  useEffect(() => {
    setCompositeFile1(initialCompositeFile1);
  }, [initialCompositeFile1]);

  useEffect(() => {
    const target = belowFoldRef.current;
    if (!target || shouldLoadBelowFold) return;

    if (!('IntersectionObserver' in window)) {
      setShouldLoadBelowFold(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldLoadBelowFold(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px 0px' });

    observer.observe(target);
    return () => observer.disconnect();
  }, [shouldLoadBelowFold]);

  useLayoutEffect(() => {
    const startHero = document.getElementById('veilpix-start-hero');
    if (!startHero) return;

    const updateHeight = () => {
      setStartHeroHeight(Math.ceil(startHero.getBoundingClientRect().height));
    };
    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(startHero);
    return () => resizeObserver.disconnect();
  }, []);

  const handleComposite = useCallback(() => {
    const prompt = compositePrompt.trim();
    if (!compositeFile1 || !compositeFile2 || !prompt) return;

    if (!isAuthenticated && onShowSignupPrompt) {
      onShowSignupPrompt();
      return;
    }

    onCompositeSelect(compositeFile1, compositeFile2, prompt, normalizeImageGenerationOptions(imageOptions, 'image-to-image'));
  }, [compositeFile1, compositeFile2, compositePrompt, imageOptions, isAuthenticated, onCompositeSelect, onShowSignupPrompt]);

  // Authentication check wrapper for composite file uploads
  const handleCompositeFile1Upload = useCallback((file: File) => {
    if (!isAuthenticated && onShowSignupPrompt) {
      onShowSignupPrompt();
      return;
    }
    setCompositeFile1(file);
  }, [isAuthenticated, onShowSignupPrompt]);

  const handleCompositeFile2Upload = useCallback((file: File) => {
    if (!isAuthenticated && onShowSignupPrompt) {
      onShowSignupPrompt();
      return;
    }
    setCompositeFile2(file);
  }, [isAuthenticated, onShowSignupPrompt]);

  // Text-to-image handlers for composite mode
  const handleTextToImageForComposite1 = useCallback((prompt: string) => {
    if (onTextToImageGenerate) {
      onTextToImageGenerate(prompt, (file: File) => {
        setCompositeFile1(file);
        setCompositePrompt(prompt);
      }, normalizeImageGenerationOptions(imageOptions, 'text-to-image'));
    }
  }, [imageOptions, onTextToImageGenerate]);

  const handleTextToImageForComposite2 = useCallback((prompt: string) => {
    if (onTextToImageGenerate) {
      onTextToImageGenerate(prompt, (file: File) => {
        setCompositeFile2(file);
        setCompositePrompt(prompt);
      }, normalizeImageGenerationOptions(imageOptions, 'text-to-image'));
    }
  }, [imageOptions, onTextToImageGenerate]);

  const handleSingleTextToImageSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = singleTextPrompt.trim();
    if (!prompt || !onTextToImageGenerate) return;

    if (!isAuthenticated && onShowSignupPrompt) {
      onShowSignupPrompt();
      return;
    }

    onTextToImageGenerate(prompt, undefined, normalizeImageGenerationOptions(imageOptions, 'text-to-image'));
  }, [imageOptions, isAuthenticated, onShowSignupPrompt, onTextToImageGenerate, singleTextPrompt]);

  const handleGalleryImageReference = useCallback((file: File, savedPrompt: string) => {
    if (activeMode === 'composite') {
      if (!isAuthenticated && onShowSignupPrompt) {
        onShowSignupPrompt();
        return;
      }
      if (!compositeFile1) {
        setCompositeFile1(file);
        setCompositePrompt(savedPrompt);
        return;
      }
      setCompositeFile2(file);
      setCompositePrompt(savedPrompt);
      return;
    }

    onMakeGalleryImageReference?.(file, savedPrompt);
  }, [activeMode, compositeFile1, isAuthenticated, onMakeGalleryImageReference, onShowSignupPrompt]);

  const galleryImageReferenceLabel = activeMode === 'composite'
    ? !compositeFile1 ? 'Use Base' : !compositeFile2 ? 'Add Reference' : 'Replace Reference'
    : activeMode === 'single'
      ? 'Use Photo'
      : 'Make Reference';

  return (
    <div className="flex flex-col items-center gap-6 animate-fade-in w-full max-w-5xl mx-auto">
      <div
        className="h-[22rem] w-full sm:h-[17rem] md:h-[14rem]"
        style={startHeroHeight ? { height: `${startHeroHeight}px` } : undefined}
        aria-hidden="true"
      />

      <div className="w-full mt-6 bg-gray-800/50 border border-gray-700/80 rounded-xl p-2 md:p-8 flex flex-col gap-6 backdrop-blur-sm">

        {/* Mode Selector */}
        <ModeSelector activeMode={activeMode} onModeChange={onModeChange} />

        {/* Single Photo Content */}
        {activeMode === 'single' && (
          <div className="relative flex w-full flex-col items-stretch gap-4 animate-fade-in">
            {isGeneratingImage && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-lg bg-black/70 animate-fade-in">
                <div className="[&>svg]:text-blue-400">
                  <Spinner />
                </div>
                <p className="text-gray-300">AI is working its magic... ({imageCreditLabel})</p>
              </div>
            )}
            <ImageModelSelector
              title="Single Photo"
              value={imageOptions}
              onChange={onImageOptionsChange}
              isLoading={isGeneratingImage}
              workflow="text-to-image"
            />
            <div className="w-full md:w-[calc(50%-0.5rem)] md:self-center">
              <ImageDropzone
                file={null}
                onFileSelect={(file) => {
                  if (file) {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    onFileSelect(dt.files);
                  } else {
                    onFileSelect(null);
                  }
                }}
                label="Reference Photo"
                showWebcam={true}
                onWebcamClick={onUseWebcamClick}
                showTextToImage={false}
                isAuthenticated={isAuthenticated}
                onShowSignupPrompt={onShowSignupPrompt}
                isGeneratingImage={isGeneratingImage}
                enableDocumentPaste={true}
              />
            </div>
            {onTextToImageGenerate && (
              <form
                onSubmit={handleSingleTextToImageSubmit}
                className="w-full flex flex-col gap-3"
              >
                <label className="text-sm font-semibold text-gray-300">Describe your image</label>
                <textarea
                  value={singleTextPrompt}
                  onChange={(event) => setSingleTextPrompt(event.target.value)}
                  placeholder="Describe the image you want to generate..."
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 p-4 text-base text-gray-200 transition focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  rows={3}
                  disabled={isGeneratingImage}
                  maxLength={5000}
                />
                <ImageModelSettings
                  value={imageOptions}
                  onChange={onImageOptionsChange}
                  isLoading={isGeneratingImage}
                  workflow="text-to-image"
                />
                <button
                  type="submit"
                  disabled={!singleTextPrompt.trim() || isGeneratingImage}
                  className="w-full rounded-lg bg-gradient-to-br from-blue-600 to-blue-500 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-blue-500/20 transition-all duration-300 ease-in-out hover:-translate-y-px hover:shadow-xl hover:shadow-blue-500/40 active:scale-95 active:shadow-inner disabled:cursor-not-allowed disabled:from-blue-800 disabled:to-blue-700 disabled:transform-none disabled:shadow-none"
                >
                  {isGeneratingImage ? `Generating Image... (${imageCreditLabel})` : `Generate Image - ${imageCreditLabel}`}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Composite Photos Content */}
        {activeMode === 'composite' && (
          <div className="relative flex flex-col items-stretch gap-4 animate-fade-in">
              {isGeneratingImage && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-lg bg-black/70 animate-fade-in">
                  <div className="[&>svg]:text-blue-400">
                    <Spinner />
                  </div>
                  <p className="text-gray-300">AI is combining your images... ({imageCreditLabel})</p>
                </div>
              )}
              <ImageModelSelector
                title="Combined Photos"
                value={imageOptions}
                onChange={onImageOptionsChange}
                isLoading={isGeneratingImage}
                workflow="image-to-image"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  <ImageDropzone
                    file={compositeFile1}
                    onFileSelect={handleCompositeFile1Upload}
                    label="Base Image"
                    showWebcam={true}
                    onWebcamClick={onUseWebcamForCompositeClick}
                    showTextToImage={true}
                    onTextToImageGenerate={handleTextToImageForComposite1}
                    isAuthenticated={isAuthenticated}
                    onShowSignupPrompt={onShowSignupPrompt}
                    isGeneratingImage={isGeneratingImage}
                    imageCreditCost={sourceGenerationCreditCost}
                    pastePriority={compositeFile1 ? 2 : 0}
                  />
                  <ImageDropzone
                    file={compositeFile2}
                    onFileSelect={handleCompositeFile2Upload}
                    label="Style / Element Image"
                    showWebcam={true}
                    onWebcamClick={onUseWebcamForCompositeClick}
                    showTextToImage={true}
                    onTextToImageGenerate={handleTextToImageForComposite2}
                    isAuthenticated={isAuthenticated}
                    onShowSignupPrompt={onShowSignupPrompt}
                    isGeneratingImage={isGeneratingImage}
                    imageCreditCost={sourceGenerationCreditCost}
                    pastePriority={!compositeFile1 ? 1 : !compositeFile2 ? 0 : 1}
                  />
              </div>
              <div className="flex w-full flex-col gap-3">
                <label className="text-sm font-semibold text-gray-300">Describe the Combination</label>
                <textarea
                  value={compositePrompt}
                  onChange={(event) => setCompositePrompt(event.target.value)}
                  placeholder="e.g., 'Place the product from the second image into the room from the base image'"
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 p-4 text-base text-gray-200 transition focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  rows={3}
                  disabled={isGeneratingImage}
                  maxLength={5000}
                />
                <ImageModelSettings
                  value={imageOptions}
                  onChange={onImageOptionsChange}
                  isLoading={isGeneratingImage}
                  workflow="image-to-image"
                  imageCount={2}
                />
              </div>
               <button
                onClick={handleComposite}
                disabled={!compositeFile1 || !compositeFile2 || !compositePrompt.trim() || isGeneratingImage}
                className="w-full mt-4 bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-5 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
              >
                  {isGeneratingImage ? `Combining Images... (${imageCreditLabel})` : `Combine Images - ${imageCreditLabel}`}
              </button>
          </div>
        )}

        {/* Video Mode Content */}
        {activeMode === 'video' && (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <Suspense fallback={<div className="flex items-center justify-center py-8"><Spinner /></div>}>
              <VideoControlsPanel
                isLoading={isGeneratingImage}
                onGenerate={(options) => {
                  if (!isAuthenticated && onShowSignupPrompt) {
                    onShowSignupPrompt();
                    return;
                  }
                  onVideoGenerate?.(options);
                }}
                videoProvider={videoProvider}
                onVideoProviderChange={onVideoProviderChange}
                videoError={videoError}
                referenceImage={null}
                wanReferenceImages={wanReferenceImages}
                referenceVideoFile={referenceVideoFile}
                referenceVideoUrl={referenceVideoUrl}
                referenceVideoDuration={referenceVideoDuration}
                seedanceReferenceImages={seedanceReferenceImages}
                seedanceInputMode={seedanceInputMode}
                seedanceFirstFrame={seedanceFirstFrame}
                seedanceLastFrame={seedanceLastFrame}
                seedanceReferenceVideoFile={seedanceReferenceVideoFile}
                seedanceReferenceVideoUrl={seedanceReferenceVideoUrl}
                seedanceReferenceVideoDuration={seedanceReferenceVideoDuration}
                seedanceReferenceAudioFile={seedanceReferenceAudioFile}
                onWanReferenceImagesChange={onWanReferenceImagesChange || (() => {})}
                onReferenceVideoSelect={onReferenceVideoSelect}
                onSeedanceInputModeChange={onSeedanceInputModeChange || (() => {})}
                onSeedanceFirstFrameSelect={onSeedanceFirstFrameSelect || (() => {})}
                onSeedanceLastFrameSelect={onSeedanceLastFrameSelect || (() => {})}
                onSeedanceReferenceImagesChange={onSeedanceReferenceImagesChange || (() => {})}
                onSeedanceReferenceVideoSelect={onSeedanceReferenceVideoSelect || (() => {})}
                onSeedanceReferenceVideoUrlRemove={onSeedanceReferenceVideoUrlRemove || (() => {})}
                onSeedanceReferenceAudioSelect={onSeedanceReferenceAudioSelect || (() => {})}
              />
            </Suspense>
          </div>
        )}
      </div>

      <div ref={belowFoldRef} className="min-h-px w-full">
        {shouldLoadBelowFold && (
          <Suspense fallback={null}>
            <StartScreenBelowFold
              onSelectGalleryImage={onSelectGalleryImage}
              onSelectGalleryVideo={onSelectGalleryVideo}
              onMakeGalleryImageReference={handleGalleryImageReference}
              onMakeGalleryVideoReference={activeMode === 'video' ? onMakeGalleryVideoReference : undefined}
              galleryImageReferenceLabel={galleryImageReferenceLabel}
              galleryRefreshTrigger={galleryRefreshTrigger}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default StartScreen;
