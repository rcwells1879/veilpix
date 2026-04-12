/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useCallback } from 'react';
import { MagicWandIcon, PaletteIcon, SunIcon } from './icons';
import ImageDropzone from './ImageDropzone';
import ModeSelector, { type CreativeMode } from './ModeSelector';
import FAQ from './FAQ';
import BeforeAfterShowcase from './BeforeAfterShowcase';
import Gallery from './Gallery';

interface StartScreenProps {
  onFileSelect: (files: FileList | null) => void;
  onCompositeSelect: (file1: File, file2: File) => void;
  onUseWebcamClick: () => void;
  onUseWebcamForCompositeClick: () => void;
  onTextToImageGenerate?: (prompt: string, onSuccess?: (file: File) => void) => void;
  activeMode: CreativeMode;
  onModeChange: (mode: CreativeMode) => void;
  compositeFile1?: File | null;
  isAuthenticated?: boolean;
  onShowSignupPrompt?: () => void;
  isGeneratingImage?: boolean;
  onSelectGalleryImage?: (file: File) => void;
  onSelectGalleryVideo?: (videoUrl: string, referenceImage: File) => void;
  galleryRefreshTrigger?: number;
}

const StartScreen: React.FC<StartScreenProps> = ({ onFileSelect, onCompositeSelect, onUseWebcamClick, onUseWebcamForCompositeClick, onTextToImageGenerate, activeMode, onModeChange, compositeFile1: initialCompositeFile1 = null, isAuthenticated = false, onShowSignupPrompt, isGeneratingImage = false, onSelectGalleryImage, onSelectGalleryVideo, galleryRefreshTrigger }) => {
  const [compositeFile1, setCompositeFile1] = useState<File | null>(initialCompositeFile1);
  const [compositeFile2, setCompositeFile2] = useState<File | null>(null);

  // Update composite file when prop changes
  useEffect(() => {
    setCompositeFile1(initialCompositeFile1);
  }, [initialCompositeFile1]);

  const handleComposite = useCallback(() => {
    if (compositeFile1 && compositeFile2) {
      onCompositeSelect(compositeFile1, compositeFile2);
    }
  }, [compositeFile1, compositeFile2, onCompositeSelect]);

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
      });
    }
  }, [onTextToImageGenerate]);

  const handleTextToImageForComposite2 = useCallback((prompt: string) => {
    if (onTextToImageGenerate) {
      onTextToImageGenerate(prompt, (file: File) => {
        setCompositeFile2(file);
      });
    }
  }, [onTextToImageGenerate]);

  return (
    <div className="flex flex-col items-center gap-6 animate-fade-in w-full max-w-5xl mx-auto">
      <h1 className="text-5xl font-extrabold tracking-tight text-gray-100 sm:text-6xl md:text-7xl text-center">
        Imagine. Describe. <span className="text-[#E04F67]">Transform.</span>
      </h1>
      <p className="max-w-3xl text-lg text-gray-400 md:text-xl text-center">
        Retouch photos, combine images, apply creative filters, or make professional adjustments using simple text prompts.
      </p>

      <div className="w-full mt-6 bg-gray-800/50 border border-gray-700/80 rounded-xl p-2 md:p-8 flex flex-col gap-6 backdrop-blur-sm">

        {/* Mode Selector */}
        <ModeSelector activeMode={activeMode} onModeChange={onModeChange} />

        {/* Single Photo Content */}
        {activeMode === 'single' && (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
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
              showTextToImage={true}
              onTextToImageGenerate={onTextToImageGenerate}
              isAuthenticated={isAuthenticated}
              onShowSignupPrompt={onShowSignupPrompt}
              isGeneratingImage={isGeneratingImage}
            />
          </div>
        )}

        {/* Composite Photos Content */}
        {activeMode === 'composite' && (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
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
                  />
              </div>
               <button
                onClick={handleComposite}
                disabled={!compositeFile1 || !compositeFile2}
                className="w-full mt-4 bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-5 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
              >
                  Combine Images
              </button>
          </div>
        )}

        {/* Video Mode Content */}
        {activeMode === 'video' && (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
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
              label="Upload Reference Image"
              showWebcam={true}
              onWebcamClick={onUseWebcamClick}
              showTextToImage={true}
              onTextToImageGenerate={onTextToImageGenerate}
              isAuthenticated={isAuthenticated}
              onShowSignupPrompt={onShowSignupPrompt}
              isGeneratingImage={isGeneratingImage}
            />
          </div>
        )}
      </div>

      {/* Gallery Section */}
      {onSelectGalleryImage && (
        <Gallery
          onSelectImage={onSelectGalleryImage}
          onSelectVideo={onSelectGalleryVideo}
          refreshTrigger={galleryRefreshTrigger}
        />
      )}

      {/* Before/After Showcase */}
      <BeforeAfterShowcase />

      <div className="mt-12 w-full">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
                  <h3 className="text-xl font-bold text-gray-100">Creative Filters</h3>
                  <p className="mt-2 text-gray-400">Transform photos with artistic styles. From vintage looks to futuristic glows, find or create the perfect filter.</p>
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
