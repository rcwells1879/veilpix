/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useCallback } from 'react';
import { UploadIcon, MagicWandIcon, PaletteIcon, SunIcon, CameraIcon, CombineIcon, PhotoIcon } from './icons';
import { SparkleIcon } from './Header';
// HEIC converter will be dynamically imported when needed
import FAQ from './FAQ';

interface StartScreenProps {
  onFileSelect: (files: FileList | null) => void;
  onCompositeSelect: (file1: File, file2: File) => void;
  onUseWebcamClick: () => void;
  onUseWebcamForCompositeClick: () => void;
  onTextToImageGenerate?: (prompt: string) => void;
  initialTab?: 'single' | 'composite';
  compositeFile1?: File | null;
  isAuthenticated?: boolean;
  onShowSignupPrompt?: () => void;
}

const ImageDropzone: React.FC<{
  onFileSelect: (file: File) => void,
  file: File | null,
  label: string,
  showWebcam?: boolean,
  onWebcamClick?: () => void,
  showTextToImage?: boolean,
  onTextToImageGenerate?: (prompt: string) => void,
  isAuthenticated?: boolean,
  onShowSignupPrompt?: () => void
}> = ({ onFileSelect, file, label, showWebcam = false, onWebcamClick, showTextToImage = false, onTextToImageGenerate, isAuthenticated = false, onShowSignupPrompt }) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTextToImageMode, setIsTextToImageMode] = useState(false);
  const [textPrompt, setTextPrompt] = useState('');
  
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFileUrl(null);
    }
  }, [file]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if(e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      console.log('📁 File input change detected:', selectedFile.name);

      // Dynamically import HEIC converter when needed
      const { isHEIC, processFileForUpload } = await import('../src/utils/heicConverter');

      // Check if it's a HEIC file
      const isHeicFile = await isHEIC(selectedFile);

      if (isHeicFile) {
        setIsProcessing(true);
        try {
          const processedFile = await processFileForUpload(selectedFile);
          onFileSelect(processedFile);
        } catch (error) {
          console.error('Failed to process HEIC file:', error);
          alert(error instanceof Error ? error.message : 'Failed to process HEIC file. Please try a JPEG or PNG.');
          // Don't pass the original HEIC file since it won't work with Gemini API
        } finally {
          setIsProcessing(false);
        }
      } else {
        // For non-HEIC files, use as-is
        onFileSelect(selectedFile);
      }
    }
  };
  
  const handleDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if(e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      console.log('🎯 File drop detected:', droppedFile.name);

      // Dynamically import HEIC converter when needed
      const { isHEIC, processFileForUpload } = await import('../src/utils/heicConverter');

      // Check if it's a HEIC file
      const isHeicFile = await isHEIC(droppedFile);

      if (isHeicFile) {
        setIsProcessing(true);
        try {
          const processedFile = await processFileForUpload(droppedFile);
          onFileSelect(processedFile);
        } catch (error) {
          console.error('Failed to process HEIC file:', error);
          alert(error instanceof Error ? error.message : 'Failed to process HEIC file. Please try a JPEG or PNG.');
          // Don't pass the original HEIC file since it won't work with Gemini API
        } finally {
          setIsProcessing(false);
        }
      } else {
        // For non-HEIC files, use as-is
        onFileSelect(droppedFile);
      }
    }
  };

  const handleTextToImageClick = () => {
    // Check authentication first
    if (!isAuthenticated && onShowSignupPrompt) {
      onShowSignupPrompt();
      return;
    }
    setIsTextToImageMode(true);
  };

  const handleTextToImageGenerate = () => {
    if (textPrompt.trim() && onTextToImageGenerate) {
      onTextToImageGenerate(textPrompt.trim());
      setTextPrompt('');
      setIsTextToImageMode(false);
    }
  };

  const handleBackToUpload = () => {
    setIsTextToImageMode(false);
    setTextPrompt('');
  };

  return (
    <div className="relative">
      {isTextToImageMode ? (
        <div className="flex flex-col items-center justify-center w-full h-64 p-4 border-2 border-dashed border-blue-400 bg-blue-500/10 rounded-lg">
          <div className="w-full h-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-200">Generate Image from Text</h3>
              <button
                onClick={handleBackToUpload}
                className="text-gray-400 hover:text-gray-200 transition-colors"
                aria-label="Back to upload"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <textarea
              value={textPrompt}
              onChange={(e) => setTextPrompt(e.target.value)}
              placeholder="Describe the image you want to generate... (e.g., 'A serene mountain landscape at sunset with a lake in the foreground')"
              className="flex-grow w-full bg-gray-800/50 border border-gray-600 text-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none transition resize-none"
              rows={4}
            />
            <button
              onClick={handleTextToImageGenerate}
              disabled={!textPrompt.trim()}
              className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
            >
              Generate Image
            </button>
          </div>
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center w-full h-64 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ${isDraggingOver ? 'border-blue-400 bg-blue-500/10' : 'border-gray-600 hover:border-gray-500 hover:bg-white/5'}`}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
        >
          {fileUrl ? (
            <>
                <img src={fileUrl} alt="Preview" className="object-contain w-full h-full rounded-md" />
                <button
                    onClick={(e) => { e.preventDefault(); onFileSelect(null as any); }} // Hack to clear the file
                    className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/80 transition-colors"
                    aria-label="Remove image"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
            </>
          ) : isProcessing ? (
            <div className="flex flex-col items-center justify-center text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-2"></div>
                <span className="font-semibold text-gray-300">Processing image...</span>
                <span className="text-sm text-gray-500">Converting HEIC to JPEG</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center">
                <PhotoIcon className="w-12 h-12 text-gray-500 mb-2" />
                <span className="font-semibold text-gray-300">{label}</span>
                <span className="text-sm text-gray-500">Click to upload or drag & drop</span>
            </div>
          )}
          <input type="file" className="hidden" accept="image/*,.heic,.heif" onChange={handleFileChange} disabled={isProcessing} />
        </label>
      )}

      {/* Webcam button overlay - small button in lower right corner */}
      {showWebcam && onWebcamClick && !isTextToImageMode && (
          <button
              onClick={onWebcamClick}
              className="absolute bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors shadow-lg z-10"
              style={{
                  bottom: '8px',
                  right: '8px',
                  width: '32px',
                  height: '32px',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  outline: 'none'
              }}
              aria-label="Use webcam"
          >
              <CameraIcon className="w-4 h-4" />
          </button>
      )}

      {/* Text-to-image button overlay - small button in lower left corner */}
      {showTextToImage && onTextToImageGenerate && !isTextToImageMode && (
          <button
              onClick={handleTextToImageClick}
              className="absolute bg-purple-600 hover:bg-purple-700 text-white rounded-full transition-colors shadow-lg z-10"
              style={{
                  bottom: '8px',
                  left: '8px',
                  width: '32px',
                  height: '32px',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  outline: 'none'
              }}
              aria-label="Generate image from text"
          >
              <SparkleIcon className="w-4 h-4" />
          </button>
      )}
    </div>
  );
}


const StartScreen: React.FC<StartScreenProps> = ({ onFileSelect, onCompositeSelect, onUseWebcamClick, onUseWebcamForCompositeClick, onTextToImageGenerate, initialTab = 'single', compositeFile1: initialCompositeFile1 = null, isAuthenticated = false, onShowSignupPrompt }) => {
  const [activeTab, setActiveTab] = useState<'single' | 'composite'>(initialTab);
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
    console.log('🎯 Composite File 1 upload attempt, authenticated:', isAuthenticated);
    if (!isAuthenticated && onShowSignupPrompt) {
      console.log('🚨 User not authenticated, showing signup prompt for composite file 1');
      onShowSignupPrompt();
      return;
    }
    console.log('✅ User authenticated, setting composite file 1');
    setCompositeFile1(file);
  }, [isAuthenticated, onShowSignupPrompt]);

  const handleCompositeFile2Upload = useCallback((file: File) => {
    console.log('🎯 Composite File 2 upload attempt, authenticated:', isAuthenticated);
    if (!isAuthenticated && onShowSignupPrompt) {
      console.log('🚨 User not authenticated, showing signup prompt for composite file 2');
      onShowSignupPrompt();
      return;
    }
    console.log('✅ User authenticated, setting composite file 2');
    setCompositeFile2(file);
  }, [isAuthenticated, onShowSignupPrompt]);

  return (
    <div className="flex flex-col items-center gap-6 animate-fade-in w-full max-w-5xl mx-auto">
      <h1 className="text-5xl font-extrabold tracking-tight text-gray-100 sm:text-6xl md:text-7xl text-center">
        Imagine. Describe. <span className="text-[#E04F67]">Transform.</span>
      </h1>
      <p className="max-w-3xl text-lg text-gray-400 md:text-xl text-center">
        Retouch photos, combine images, apply creative filters, or make professional adjustments using simple text prompts.
      </p>

      <div className="w-full mt-6 bg-gray-800/50 border border-gray-700/80 rounded-xl p-2 md:p-8 flex flex-col gap-6 backdrop-blur-sm">
        
        {/* Tabs */}
        <div className="flex items-center justify-center p-1 bg-black/20 rounded-lg">
          <button onClick={() => setActiveTab('single')} className={`w-full flex items-center justify-center gap-2 font-semibold py-3 px-5 rounded-md transition-all duration-200 text-base ${activeTab === 'single' ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}>
            <PhotoIcon className="w-5 h-5"/> Single Photo
          </button>
          <button onClick={() => setActiveTab('composite')} className={`w-full flex items-center justify-center gap-2 font-semibold py-3 px-5 rounded-md transition-all duration-200 text-base ${activeTab === 'composite' ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}>
            <CombineIcon className="w-5 h-5"/> Combine Photos
          </button>
        </div>

        {/* Single Photo Content */}
        {activeTab === 'single' && (
          <div className="flex flex-col items-center gap-4 py-6 w-full animate-fade-in">
            <ImageDropzone
              file={null}
              onFileSelect={(file) => {
                console.log('🚀 StartScreen calling onFileSelect with file:', file?.name);
                if (file) {
                  // Create a FileList to satisfy the onFileSelect prop type
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  console.log('📤 Calling App.tsx handleFileSelect with FileList');
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
            />
          </div>
        )}

        {/* Composite Photos Content */}
        {activeTab === 'composite' && (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  <ImageDropzone file={compositeFile1} onFileSelect={handleCompositeFile1Upload} label="Base Image" showWebcam={true} onWebcamClick={onUseWebcamForCompositeClick} />
                  <ImageDropzone file={compositeFile2} onFileSelect={handleCompositeFile2Upload} label="Style / Element Image" />
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
      </div>

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
