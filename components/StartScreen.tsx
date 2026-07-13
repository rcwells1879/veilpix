/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useCallback } from 'react';
import { MagicWandIcon, PaletteIcon, SunIcon, VideoIcon } from './icons';
import ImageDropzone from './ImageDropzone';
import ModeSelector, { type CreativeMode } from './ModeSelector';
import FAQ from './FAQ';
import BeforeAfterShowcase from './BeforeAfterShowcase';
import Gallery from './Gallery';
import VideoControlsPanel from './VideoControlsPanel';
import Spinner from './Spinner';
import {
  getImageCreditCost,
  ImageModelSelector,
  ImageModelSettings,
  normalizeImageGenerationOptions,
  type ImageGenerationOptions,
} from './ImageModelControlsPanel';
import type { GalleryVideoDetails } from '../src/utils/workflowStorage';

type VideoProvider = 'wan' | 'seedance';
type SeedanceVariant = 'regular' | 'fast' | 'mini';

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
  seedanceReferenceImages?: File[];
  seedanceReferenceVideoFile?: File | null;
  seedanceReferenceVideoUrl?: string | null;
  seedanceReferenceVideoDuration?: number | null;
  seedanceReferenceAudioFile?: File | null;
  onSeedanceReferenceImagesChange?: (files: File[]) => void;
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
  onSelectGalleryImage?: (file: File) => void;
  onSelectGalleryVideo?: (details: GalleryVideoDetails) => void;
  onMakeGalleryImageReference?: (file: File) => void;
  onMakeGalleryVideoReference?: (details: GalleryVideoDetails) => void;
  galleryRefreshTrigger?: number;
  videoError?: string | null;
}

const StartScreen: React.FC<StartScreenProps> = ({ onFileSelect, onCompositeSelect, onUseWebcamClick, onUseWebcamForCompositeClick, onTextToImageGenerate, imageOptions, onImageOptionsChange, onVideoGenerate, onReferenceVideoSelect, onWanReferenceImagesChange, wanReferenceImages = [], referenceVideoFile = null, referenceVideoUrl = null, referenceVideoDuration = null, onSeedanceReferenceVideoSelect, seedanceReferenceImages = [], seedanceReferenceVideoFile = null, seedanceReferenceVideoUrl = null, seedanceReferenceVideoDuration = null, seedanceReferenceAudioFile = null, onSeedanceReferenceImagesChange, onSeedanceReferenceVideoUrlRemove, onSeedanceReferenceAudioSelect, videoProvider, onVideoProviderChange, activeMode, onModeChange, compositeFile1: initialCompositeFile1 = null, isAuthenticated = false, onShowSignupPrompt, isGeneratingImage = false, imageCreditCost, onSelectGalleryImage, onSelectGalleryVideo, onMakeGalleryImageReference, onMakeGalleryVideoReference, galleryRefreshTrigger, videoError }) => {
  const [compositeFile1, setCompositeFile1] = useState<File | null>(initialCompositeFile1);
  const [compositeFile2, setCompositeFile2] = useState<File | null>(null);
  const [compositePrompt, setCompositePrompt] = useState('');
  const [singleTextPrompt, setSingleTextPrompt] = useState('');
  const activeImageWorkflow = activeMode === 'composite' ? 'image-to-image' : 'text-to-image';
  const normalizedActiveImageOptions = normalizeImageGenerationOptions(imageOptions, activeImageWorkflow);
  const activeImageCreditCost = imageCreditCost ?? getImageCreditCost(normalizedActiveImageOptions.provider, normalizedActiveImageOptions.resolution, activeImageWorkflow, normalizedActiveImageOptions.seedreamTier);
  const imageCreditLabel = `${activeImageCreditCost} ${activeImageCreditCost === 1 ? 'credit' : 'credits'}`;

  // Update composite file when prop changes
  useEffect(() => {
    setCompositeFile1(initialCompositeFile1);
  }, [initialCompositeFile1]);

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
      }, normalizeImageGenerationOptions(imageOptions, 'text-to-image'));
    }
  }, [imageOptions, onTextToImageGenerate]);

  const handleTextToImageForComposite2 = useCallback((prompt: string) => {
    if (onTextToImageGenerate) {
      onTextToImageGenerate(prompt, (file: File) => {
        setCompositeFile2(file);
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

  const handleGalleryImageReference = useCallback((file: File) => {
    if (activeMode === 'composite') {
      if (!isAuthenticated && onShowSignupPrompt) {
        onShowSignupPrompt();
        return;
      }
      if (!compositeFile1) {
        setCompositeFile1(file);
        return;
      }
      setCompositeFile2(file);
      return;
    }

    onMakeGalleryImageReference?.(file);
  }, [activeMode, compositeFile1, isAuthenticated, onMakeGalleryImageReference, onShowSignupPrompt]);

  const galleryImageReferenceLabel = activeMode === 'composite'
    ? !compositeFile1 ? 'Use Base' : !compositeFile2 ? 'Add Reference' : 'Replace Reference'
    : activeMode === 'single'
      ? 'Use Photo'
      : 'Make Reference';

  return (
    <div className="flex flex-col items-center gap-6 animate-fade-in w-full max-w-5xl mx-auto">
      <h1 className="text-5xl font-extrabold tracking-tight text-gray-100 sm:text-6xl md:text-7xl text-center">
        Create Images. Edit Photos. <span className="text-[#E04F67]">Generate Video.</span>
      </h1>
      <p className="max-w-3xl text-lg text-gray-400 md:text-xl text-center">
        Generate images from text, retouch photos, combine references, and create Wan or Seedance 2.0 video clips from simple prompts.
      </p>

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
              label="Upload a Photo"
              showWebcam={true}
              onWebcamClick={onUseWebcamClick}
              showTextToImage={false}
              isAuthenticated={isAuthenticated}
              onShowSignupPrompt={onShowSignupPrompt}
              isGeneratingImage={isGeneratingImage}
            />
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
                    imageCreditCost={activeImageCreditCost}
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
                    imageCreditCost={activeImageCreditCost}
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
              seedanceReferenceVideoFile={seedanceReferenceVideoFile}
              seedanceReferenceVideoUrl={seedanceReferenceVideoUrl}
              seedanceReferenceVideoDuration={seedanceReferenceVideoDuration}
              seedanceReferenceAudioFile={seedanceReferenceAudioFile}
              onWanReferenceImagesChange={onWanReferenceImagesChange || (() => {})}
              onReferenceVideoSelect={onReferenceVideoSelect}
              onSeedanceReferenceImagesChange={onSeedanceReferenceImagesChange || (() => {})}
              onSeedanceReferenceVideoSelect={onSeedanceReferenceVideoSelect || (() => {})}
              onSeedanceReferenceVideoUrlRemove={onSeedanceReferenceVideoUrlRemove || (() => {})}
              onSeedanceReferenceAudioSelect={onSeedanceReferenceAudioSelect || (() => {})}
            />
          </div>
        )}
      </div>

      {/* Gallery Section */}
      {onSelectGalleryImage && (
        <Gallery
          onSelectImage={onSelectGalleryImage}
          onSelectVideo={onSelectGalleryVideo}
          onMakeImageReference={activeMode === 'video' || activeMode === 'composite' || activeMode === 'single' ? handleGalleryImageReference : undefined}
          onMakeVideoReference={activeMode === 'video' ? onMakeGalleryVideoReference : undefined}
          imageReferenceActionLabel={galleryImageReferenceLabel}
          refreshTrigger={galleryRefreshTrigger}
        />
      )}

      {/* Before/After Showcase */}
      <BeforeAfterShowcase />

      <div className="mt-12 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
              <div className="bg-black/20 p-6 rounded-lg border border-gray-700/50 flex flex-col items-center text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-gray-700 rounded-full mb-4">
                     <MagicWandIcon className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-100">Precise Retouching</h3>
                  <p className="mt-2 text-gray-400">Click any point on your image to remove blemishes, change colors, or add elements with pinpoint accuracy.</p>
              </div>
              <div className="bg-black/20 p-6 rounded-lg border border-gray-700/50 flex flex-col items-center text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-gray-700 rounded-full mb-4">
                     <PaletteIcon className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-100">Text-to-Image</h3>
                  <p className="mt-2 text-gray-400">Describe a scene, style, or product concept and generate new images with Nano Banana 2, Seedream 5, and Wan image models.</p>
              </div>
              <div className="bg-black/20 p-6 rounded-lg border border-gray-700/50 flex flex-col items-center text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-gray-700 rounded-full mb-4">
                     <VideoIcon className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-100">AI Video Generation</h3>
                  <p className="mt-2 text-gray-400">Create Wan clips or use Seedance 2.0 for multimodal image, video, and audio reference workflows.</p>
              </div>
              <div className="bg-black/20 p-6 rounded-lg border border-gray-700/50 flex flex-col items-center text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-gray-700 rounded-full mb-4">
                     <SunIcon className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-100">Pro Adjustments</h3>
                  <p className="mt-2 text-gray-400">Enhance lighting, blur backgrounds, or change the mood. Get studio-quality results without complex tools.</p>
              </div>
          </div>
      </div>

      {/* FAQ Section */}
      <FAQ />
    </div>
  );
};

export default StartScreen;
