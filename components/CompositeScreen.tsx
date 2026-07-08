/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import Spinner from './Spinner';
import { ChevronLeftIcon } from './icons';
import {
    getImageCreditCost,
    ImageModelSelector,
    ImageModelSettings,
    normalizeImageGenerationOptions,
    type ImageGenerationOptions,
} from './ImageModelControlsPanel';

interface CompositeScreenProps {
    sourceImage1: File;
    sourceImage2: File;
    imageOptions: ImageGenerationOptions;
    onImageOptionsChange: (options: ImageGenerationOptions) => void;
    imageCreditCost?: number;
    onGenerate: (prompt: string, options: ImageGenerationOptions) => void;
    isLoading: boolean;
    onBack: () => void;
}

const CompositeScreen: React.FC<CompositeScreenProps> = ({
    sourceImage1,
    sourceImage2,
    imageOptions,
    onImageOptionsChange,
    imageCreditCost,
    onGenerate,
    isLoading,
    onBack
}) => {
    const [prompt, setPrompt] = useState('');
    const [img1Url, setImg1Url] = useState<string | null>(null);
    const [img2Url, setImg2Url] = useState<string | null>(null);
    const normalizedImageOptions = normalizeImageGenerationOptions(imageOptions, 'image-to-image');
    const activeImageCreditCost = imageCreditCost ?? getImageCreditCost(normalizedImageOptions.provider, normalizedImageOptions.resolution, 'image-to-image');
    const imageCreditLabel = `${activeImageCreditCost} ${activeImageCreditCost === 1 ? 'credit' : 'credits'}`;

    useEffect(() => {
        const url1 = URL.createObjectURL(sourceImage1);
        setImg1Url(url1);
        
        const url2 = URL.createObjectURL(sourceImage2);
        setImg2Url(url2);

        return () => {
            URL.revokeObjectURL(url1);
            URL.revokeObjectURL(url2);
        };
    }, [sourceImage1, sourceImage2]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onGenerate(prompt, normalizedImageOptions);
    }
    
    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-6 animate-fade-in">
             <div className="relative w-full">
                {isLoading && (
                    <div className="absolute inset-0 bg-black/70 z-30 flex flex-col items-center justify-center gap-4 animate-fade-in rounded-xl">
                        <Spinner />
                        <p className="text-gray-300">AI is combining your images...</p>
                    </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-300">Base Image</h3>
                        {img1Url && <img src={img1Url} alt="Source 1" className="w-full h-auto object-contain max-h-[40vh] rounded-xl shadow-lg bg-black/20" />}
                    </div>
                    <div className="flex flex-col items-center gap-2">
                         <h3 className="text-lg font-semibold text-gray-300">Style/Element Image</h3>
                        {img2Url && <img src={img2Url} alt="Source 2" className="w-full h-auto object-contain max-h-[40vh] rounded-xl shadow-lg bg-black/20" />}
                    </div>
                </div>
            </div>

            <div className="w-full bg-gray-800/80 border border-gray-700/80 rounded-lg p-4 sm:p-6 flex flex-col gap-5 backdrop-blur-sm">
                <ImageModelSelector
                    title="Combined Photos"
                    value={imageOptions}
                    onChange={onImageOptionsChange}
                    isLoading={isLoading}
                    workflow="image-to-image"
                />
                <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
                    <label className="text-sm font-semibold text-gray-300">Describe the Combination</label>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., 'Place the cat from the style image onto the sofa in the base image'"
                        className="w-full resize-none bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-4 text-base focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isLoading}
                        rows={3}
                        maxLength={5000}
                    />
                    <ImageModelSettings
                        value={imageOptions}
                        onChange={onImageOptionsChange}
                        isLoading={isLoading}
                        workflow="image-to-image"
                    />
                    <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                        <button
                            type="button"
                            onClick={onBack}
                            className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-4 px-6 rounded-lg transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
                            aria-label="Go to home and gallery"
                            >
                            <ChevronLeftIcon className="w-5 h-5 mr-2" />
                            Home/Gallery
                        </button>
                        <button 
                            type="submit"
                            className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                            disabled={isLoading || !prompt.trim()}
                        >
                            {isLoading ? `Generating... (${imageCreditLabel})` : `Generate - ${imageCreditLabel}`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CompositeScreen;
