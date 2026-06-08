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

type VideoProvider = 'wan' | 'seedance';
type SeedanceVariant = 'regular' | 'fast';

interface StartScreenProps {
  onFileSelect: (files: FileList | null) => void;
  onCompositeSelect: (file1: File, file2: File) => void;
  onUseWebcamClick: () => void;
  onUseWebcamForCompositeClick: () => void;
  onTextToImageGenerate?: (prompt: string, onSuccess?: (file: File) => void) => void;
  onTextToVideoGenerate?: (prompt: string, duration: number, resolution: string, ratio: string, provider?: VideoProvider, seedanceVariant?: SeedanceVariant) => void;
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
  referenceVideoFile?: File | null;
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
  onSelectGalleryImage?: (file: File) => void;
  onSelectGalleryVideo?: (videoUrl: string, referenceImage: File | null, videoDuration?: number) => void;
  onMakeGalleryVideoReference?: (videoUrl: string, videoDuration?: number) => void;
  galleryRefreshTrigger?: number;
  videoError?: string | null;
}

const StartScreen: React.FC<StartScreenProps> = ({ onFileSelect, onCompositeSelect, onUseWebcamClick, onUseWebcamForCompositeClick, onTextToImageGenerate, onTextToVideoGenerate, onVideoGenerate, onReferenceVideoSelect, referenceVideoFile = null, onSeedanceReferenceVideoSelect, seedanceReferenceImages = [], seedanceReferenceVideoFile = null, seedanceReferenceVideoUrl = null, seedanceReferenceVideoDuration = null, seedanceReferenceAudioFile = null, onSeedanceReferenceImagesChange, onSeedanceReferenceVideoUrlRemove, onSeedanceReferenceAudioSelect, videoProvider, onVideoProviderChange, activeMode, onModeChange, compositeFile1: initialCompositeFile1 = null, isAuthenticated = false, onShowSignupPrompt, isGeneratingImage = false, onSelectGalleryImage, onSelectGalleryVideo, onMakeGalleryVideoReference, galleryRefreshTrigger, videoError }) => {
  const [compositeFile1, setCompositeFile1] = useState<File | null>(initialCompositeFile1);
  const [compositeFile2, setCompositeFile2] = useState<File | null>(null);

  // Text-to-video state
  const [textToVideoPrompt, setTextToVideoPrompt] = useState('');
  const [textToVideoDuration, setTextToVideoDuration] = useState(5);
  const [textToVideoResolution, setTextToVideoResolution] = useState('1080p');
  const [textToVideoRatio, setTextToVideoRatio] = useState('16:9');
  const [textToVideoSeedanceVariant, setTextToVideoSeedanceVariant] = useState<SeedanceVariant>('regular');
  const [referenceVideoPreviewUrl, setReferenceVideoPreviewUrl] = useState<string | null>(null);
  const activeReferenceVideoFile = videoProvider === 'seedance' ? seedanceReferenceVideoFile : referenceVideoFile;

  // Update composite file when prop changes
  useEffect(() => {
    setCompositeFile1(initialCompositeFile1);
  }, [initialCompositeFile1]);

  useEffect(() => {
    if (!activeReferenceVideoFile) {
      setReferenceVideoPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(activeReferenceVideoFile);
    setReferenceVideoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [activeReferenceVideoFile]);

  useEffect(() => {
    if (videoProvider === 'seedance' && textToVideoSeedanceVariant === 'fast' && textToVideoResolution === '1080p') {
      setTextToVideoResolution('720p');
    }
    if (videoProvider === 'wan' && textToVideoDuration > 10) {
      setTextToVideoDuration(10);
    }
    if (videoProvider === 'wan' && !['720p', '1080p'].includes(textToVideoResolution)) {
      setTextToVideoResolution('1080p');
    }
  }, [textToVideoDuration, textToVideoResolution, textToVideoSeedanceVariant, videoProvider]);

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
        Create Images. Edit Photos. <span className="text-[#E04F67]">Generate Video.</span>
      </h1>
      <p className="max-w-3xl text-lg text-gray-400 md:text-xl text-center">
        Generate images from text, retouch photos, combine references, and create Wan 2.7 or Seedance 2.0 video clips from simple prompts.
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
            {videoProvider === 'seedance' ? (
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
                referenceVideoFile={referenceVideoFile}
                referenceVideoUrl={null}
                referenceVideoDuration={null}
                seedanceReferenceImages={seedanceReferenceImages}
                seedanceReferenceVideoFile={seedanceReferenceVideoFile}
                seedanceReferenceVideoUrl={seedanceReferenceVideoUrl}
                seedanceReferenceVideoDuration={seedanceReferenceVideoDuration}
                seedanceReferenceAudioFile={seedanceReferenceAudioFile}
                onReferenceVideoSelect={onReferenceVideoSelect}
                onSeedanceReferenceImagesChange={onSeedanceReferenceImagesChange || (() => {})}
                onSeedanceReferenceVideoSelect={onSeedanceReferenceVideoSelect || (() => {})}
                onSeedanceReferenceVideoUrlRemove={onSeedanceReferenceVideoUrlRemove || (() => {})}
                onSeedanceReferenceAudioSelect={onSeedanceReferenceAudioSelect || (() => {})}
              />
            ) : (
              <>
            <div className="w-full rounded-lg border border-white/10 bg-gray-900/50 p-3">
              <div className="grid grid-cols-2 rounded-lg border border-white/10 bg-gray-950/40 p-1">
                <button
                  type="button"
                  onClick={() => onVideoProviderChange('wan')}
                  className={`rounded-md px-4 py-2 text-sm font-bold transition ${
                    videoProvider === 'wan'
                      ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                      : 'text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                  disabled={isGeneratingImage}
                >
                  Wan
                </button>
                <button
                  type="button"
                  onClick={() => onVideoProviderChange('seedance')}
                  className={`rounded-md px-4 py-2 text-sm font-bold transition ${
                    videoProvider === 'seedance'
                      ? 'bg-[#E04F67] text-white shadow-lg shadow-[#E04F67]/25'
                      : 'text-[#F3A2AF] hover:bg-[#E04F67]/15 hover:text-white'
                  }`}
                  disabled={isGeneratingImage}
                >
                  Seedance <span className="ml-1 rounded bg-white/15 px-1.5 py-0.5 text-[10px] uppercase">New</span>
                </button>
              </div>
            </div>

            {/* Reference-to-Video: Upload reference image and/or video */}
            <div className="w-full">
              <p className="text-sm font-semibold text-gray-400 text-center mb-2">
                {videoProvider === 'seedance' ? 'Seedance References' : 'Reference-to-Video'}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
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

                <div className="w-full h-full min-h-[250px] border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center p-6 text-center bg-gray-800/30 hover:bg-gray-700/40 hover:border-blue-500 transition-all duration-300">
                  {activeReferenceVideoFile ? (
                    <div className="w-full flex flex-col items-center gap-3">
                      <video
                        src={referenceVideoPreviewUrl || undefined}
                        controls
                        className="w-full max-h-44 rounded-lg bg-black object-contain"
                      />
                      <p className="text-sm text-gray-300 truncate max-w-full">{activeReferenceVideoFile.name}</p>
                      <button
                        type="button"
                        onClick={() => videoProvider === 'seedance' ? onSeedanceReferenceVideoSelect?.(null) : onReferenceVideoSelect?.(null)}
                        className="text-sm text-red-300 hover:text-red-200 font-semibold"
                        disabled={isGeneratingImage}
                      >
                        Remove Reference Video
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-400/30 flex items-center justify-center">
                        <span className="text-3xl">🎬</span>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-gray-200">Upload Reference Video</p>
                        <p className="text-sm text-gray-500 mt-1">
                          {videoProvider === 'seedance' ? 'Seedance video reference, up to 15s' : 'MP4/WebM/MOV reference clip'}
                        </p>
                      </div>
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        disabled={isGeneratingImage}
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          if (file && !isAuthenticated && onShowSignupPrompt) {
                            onShowSignupPrompt();
                            event.currentTarget.value = '';
                            return;
                          }
                          if (videoProvider === 'seedance') {
                            onSeedanceReferenceVideoSelect?.(file);
                          } else {
                            onReferenceVideoSelect?.(file);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center mt-2">
                {videoProvider === 'seedance'
                  ? 'Images added here become Seedance image references, and the video becomes the Seedance video reference.'
                  : 'Use an image, a video, or both. If both are present, Wan 2.7 reference-to-video uses both references.'}
              </p>
            </div>

            {/* "Or" divider */}
            <div className="flex items-center w-full gap-4">
              <div className="flex-1 h-px bg-gray-600"></div>
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-gray-600"></div>
            </div>

            {/* Text-to-Video prompt */}
            <div className="w-full flex flex-col gap-3">
              <p className="text-sm font-semibold text-gray-400 text-center">Text-to-Video</p>
              <textarea
                value={textToVideoPrompt}
                onChange={(e) => setTextToVideoPrompt(e.target.value)}
                placeholder="Describe the video you want to create... (e.g., 'A futuristic city street at night, neon reflections shimmering on wet ground as a hover car glides past')"
                className="w-full bg-gray-800/50 border border-gray-600 text-gray-200 rounded-lg p-4 text-base focus:ring-2 focus:ring-blue-500 focus:outline-none transition resize-none"
                rows={3}
                disabled={isGeneratingImage}
                maxLength={5000}
              />

              {/* Controls row */}
              <div className="flex flex-wrap gap-2">
                {videoProvider === 'seedance' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">Mode:</span>
                    {(['regular', 'fast'] as const).map((variant) => (
                      <button
                        key={variant}
                        onClick={() => setTextToVideoSeedanceVariant(variant)}
                        className={`py-1 px-2.5 rounded text-xs font-semibold capitalize transition-all duration-200 ${
                          textToVideoSeedanceVariant === variant
                            ? 'bg-[#E04F67] text-white shadow'
                            : 'bg-[#E04F67]/10 text-[#F3A2AF] hover:bg-[#E04F67]/20 hover:text-white'
                        }`}
                        disabled={isGeneratingImage}
                      >
                        {variant === 'regular' ? 'Regular' : 'Fast'}
                      </button>
                    ))}
                  </div>
                )}

                {/* Duration */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Duration:</span>
                  {(videoProvider === 'seedance' ? [5, 10, 15] : [5, 10]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setTextToVideoDuration(d)}
                      className={`py-1 px-2.5 rounded text-xs font-semibold transition-all duration-200 ${
                        textToVideoDuration === d
                          ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow'
                          : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
                      }`}
                      disabled={isGeneratingImage}
                    >
                      {d}s
                    </button>
                  ))}
                </div>

                {/* Aspect Ratio */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Ratio:</span>
                  {(videoProvider === 'seedance' ? ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] : ['16:9', '9:16', '1:1', '4:3']).map((r) => (
                    <button
                      key={r}
                      onClick={() => setTextToVideoRatio(r)}
                      className={`py-1 px-2.5 rounded text-xs font-semibold transition-all duration-200 ${
                        textToVideoRatio === r
                          ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow'
                          : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
                      }`}
                      disabled={isGeneratingImage}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                {/* Resolution */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Quality:</span>
                  {(videoProvider === 'seedance'
                    ? textToVideoSeedanceVariant === 'fast'
                      ? ['480p', '720p']
                      : ['480p', '720p', '1080p']
                    : ['720p', '1080p']).map((q) => (
                    <button
                      key={q}
                      onClick={() => setTextToVideoResolution(q)}
                      className={`py-1 px-2.5 rounded text-xs font-semibold transition-all duration-200 ${
                        textToVideoResolution === q
                          ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow'
                          : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
                      }`}
                      disabled={isGeneratingImage}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  if (!isAuthenticated && onShowSignupPrompt) {
                    onShowSignupPrompt();
                    return;
                  }
                  if (textToVideoPrompt.trim() && onTextToVideoGenerate) {
                    onTextToVideoGenerate(
                      textToVideoPrompt.trim(),
                      textToVideoDuration,
                      textToVideoResolution,
                      textToVideoRatio,
                      videoProvider,
                      textToVideoSeedanceVariant
                    );
                  }
                }}
                disabled={!textToVideoPrompt.trim() || isGeneratingImage}
                className={`w-full text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg hover:shadow-xl hover:-translate-y-px active:scale-95 active:shadow-inner disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none ${
                  videoProvider === 'seedance'
                    ? 'bg-gradient-to-br from-[#E04F67] to-[#B83D8A] shadow-[#E04F67]/20 hover:shadow-[#E04F67]/35 disabled:from-[#7B3140] disabled:to-[#6F2A55]'
                    : 'bg-gradient-to-br from-blue-600 to-blue-500 shadow-blue-500/20 hover:shadow-blue-500/40 disabled:from-blue-800 disabled:to-blue-700'
                }`}
              >
                {isGeneratingImage ? 'Generating Video...' : `Generate ${videoProvider === 'seedance' ? 'Seedance' : 'Wan'} Video from Text`}
              </button>
            </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Gallery Section */}
      {onSelectGalleryImage && (
        <Gallery
          onSelectImage={onSelectGalleryImage}
          onSelectVideo={onSelectGalleryVideo}
          onMakeVideoReference={onMakeGalleryVideoReference}
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
                  <p className="mt-2 text-gray-400">Describe a scene, style, or product concept and generate new images with Nano Banana, SeeDream, and Wan image models.</p>
              </div>
              <div className="bg-black/20 p-6 rounded-lg border border-gray-700/50 flex flex-col items-center text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-gray-700 rounded-full mb-4">
                     <VideoIcon className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-100">AI Video Generation</h3>
                  <p className="mt-2 text-gray-400">Create Wan 2.7 clips or use Seedance 2.0 for multimodal image, video, and audio reference workflows.</p>
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
