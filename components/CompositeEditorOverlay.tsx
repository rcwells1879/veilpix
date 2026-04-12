/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback } from 'react';
import ImageDropzone from './ImageDropzone';

interface CompositeEditorOverlayProps {
  baseImageUrl: string;
  onCombine: (file2: File) => void;
  onCancel: () => void;
  onWebcamClick: () => void;
  onTextToImageGenerate?: (prompt: string, onSuccess?: (file: File) => void) => void;
  isAuthenticated: boolean;
  onShowSignupPrompt: () => void;
  isGeneratingImage: boolean;
}

const CompositeEditorOverlay: React.FC<CompositeEditorOverlayProps> = ({
  baseImageUrl,
  onCombine,
  onCancel,
  onWebcamClick,
  onTextToImageGenerate,
  isAuthenticated,
  onShowSignupPrompt,
  isGeneratingImage,
}) => {
  const [secondFile, setSecondFile] = useState<File | null>(null);

  const handleSecondFileSelect = useCallback((file: File) => {
    if (!isAuthenticated) {
      onShowSignupPrompt();
      return;
    }
    setSecondFile(file);
  }, [isAuthenticated, onShowSignupPrompt]);

  const handleTextToImageForSecond = useCallback((prompt: string) => {
    if (onTextToImageGenerate) {
      onTextToImageGenerate(prompt, (file: File) => {
        setSecondFile(file);
      });
    }
  }, [onTextToImageGenerate]);

  const handleCombine = useCallback(() => {
    if (secondFile) {
      onCombine(secondFile);
    }
  }, [secondFile, onCombine]);

  return (
    <div className="w-full flex flex-col gap-4 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {/* Base image (read-only) */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-gray-400 text-center">Base Image</span>
          <div className="relative flex items-center justify-center border-2 border-dashed border-gray-600 rounded-lg h-64 overflow-hidden bg-black/20">
            <img
              src={baseImageUrl}
              alt="Base image"
              className="object-contain w-full h-full rounded-md"
            />
          </div>
        </div>

        {/* Second image dropzone */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-gray-400 text-center">Style / Element Image</span>
          <ImageDropzone
            file={secondFile}
            onFileSelect={handleSecondFileSelect}
            label="Style / Element Image"
            showWebcam={true}
            onWebcamClick={onWebcamClick}
            showTextToImage={true}
            onTextToImageGenerate={handleTextToImageForSecond}
            isAuthenticated={isAuthenticated}
            onShowSignupPrompt={onShowSignupPrompt}
            isGeneratingImage={isGeneratingImage}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 w-full">
        <button
          onClick={onCancel}
          className="flex-shrink-0 bg-white/10 border border-white/20 text-gray-200 font-semibold py-4 px-6 rounded-lg transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95"
        >
          Cancel
        </button>
        <button
          onClick={handleCombine}
          disabled={!secondFile}
          className="flex-1 bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
        >
          Combine Images
        </button>
      </div>
    </div>
  );
};

export default CompositeEditorOverlay;
