/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { PhotoIcon, CameraIcon } from './icons';
import { SparkleIcon } from './Header';
import Spinner from './Spinner';

export interface ImageDropzoneProps {
  onFileSelect: (file: File) => void;
  file: File | null;
  label: string;
  showWebcam?: boolean;
  onWebcamClick?: () => void;
  showTextToImage?: boolean;
  onTextToImageGenerate?: (prompt: string) => void;
  isAuthenticated?: boolean;
  onShowSignupPrompt?: () => void;
  isGeneratingImage?: boolean;
}

const ImageDropzone: React.FC<ImageDropzoneProps> = ({ onFileSelect, file, label, showWebcam = false, onWebcamClick, showTextToImage = false, onTextToImageGenerate, isAuthenticated = false, onShowSignupPrompt, isGeneratingImage = false }) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTextToImageMode, setIsTextToImageMode] = useState(false);
  const [textPrompt, setTextPrompt] = useState('');
  const [wasGenerating, setWasGenerating] = useState(false);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFileUrl(null);
    }
  }, [file]);

  // Close text-to-image mode when generation completes
  useEffect(() => {
    if (wasGenerating && !isGeneratingImage) {
      setIsTextToImageMode(false);
      setWasGenerating(false);
    } else if (isGeneratingImage && isTextToImageMode) {
      setWasGenerating(true);
    }
  }, [isGeneratingImage, wasGenerating, isTextToImageMode]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if(e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];

      const { isHEIC, processFileForUpload } = await import('../src/utils/heicConverter');
      const isHeicFile = await isHEIC(selectedFile);

      if (isHeicFile) {
        setIsProcessing(true);
        try {
          const processedFile = await processFileForUpload(selectedFile);
          onFileSelect(processedFile);
        } catch (error) {
          console.error('Failed to process HEIC file:', error);
          alert(error instanceof Error ? error.message : 'Failed to process HEIC file. Please try a JPEG or PNG.');
        } finally {
          setIsProcessing(false);
        }
      } else {
        onFileSelect(selectedFile);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if(e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];

      const { isHEIC, processFileForUpload } = await import('../src/utils/heicConverter');
      const isHeicFile = await isHEIC(droppedFile);

      if (isHeicFile) {
        setIsProcessing(true);
        try {
          const processedFile = await processFileForUpload(droppedFile);
          onFileSelect(processedFile);
        } catch (error) {
          console.error('Failed to process HEIC file:', error);
          alert(error instanceof Error ? error.message : 'Failed to process HEIC file. Please try a JPEG or PNG.');
        } finally {
          setIsProcessing(false);
        }
      } else {
        onFileSelect(droppedFile);
      }
    }
  };

  const handleTextToImageClick = () => {
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
    }
  };

  const handleBackToUpload = () => {
    setIsTextToImageMode(false);
    setTextPrompt('');
  };

  return (
    <div className="relative">
      {isTextToImageMode ? (
        <div className="flex flex-col items-center justify-center w-full min-h-[40vh] p-4 border-2 border-dashed border-blue-400 bg-blue-500/10 rounded-lg">
          {isGeneratingImage && (
            <div className="absolute inset-0 bg-black/70 z-30 flex flex-col items-center justify-center gap-4 animate-fade-in rounded-lg">
              <Spinner />
              <p className="text-gray-300">AI is generating your image...</p>
            </div>
          )}
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
              disabled={isGeneratingImage}
            />
            <button
              onClick={handleTextToImageGenerate}
              disabled={!textPrompt.trim() || isGeneratingImage}
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
                    onClick={(e) => { e.preventDefault(); onFileSelect(null as any); }}
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
                <span className="text-sm text-gray-500">Click to upload, drag & drop, generate with text, or use webcam</span>
            </div>
          )}
          <input type="file" className="hidden" accept="image/*,.heic,.heif" onChange={handleFileChange} disabled={isProcessing} />
        </label>
      )}

      {showWebcam && onWebcamClick && !isTextToImageMode && (
          <button
              onClick={onWebcamClick}
              className="absolute bg-blue-600/30 hover:bg-blue-600/40 text-white rounded-full transition-colors shadow-lg backdrop-blur-sm z-10"
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

      {showTextToImage && onTextToImageGenerate && !isTextToImageMode && (
          <button
              onClick={handleTextToImageClick}
              className="absolute bg-purple-600/30 hover:bg-purple-600/40 text-white rounded-full transition-colors shadow-lg backdrop-blur-sm z-10"
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
};

export default ImageDropzone;
