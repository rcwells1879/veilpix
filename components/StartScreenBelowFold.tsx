/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import BeforeAfterShowcase from './BeforeAfterShowcase';
import FAQ from './FAQ';
import Gallery from './Gallery';
import { MagicWandIcon, PaletteIcon, SunIcon, VideoIcon } from './icons';
import type { GalleryVideoDetails } from '../src/utils/workflowStorage';

interface StartScreenBelowFoldProps {
  onSelectGalleryImage?: (file: File, prompt: string) => void;
  onSelectGalleryVideo?: (details: GalleryVideoDetails) => void;
  onMakeGalleryImageReference?: (file: File, prompt: string) => void;
  onMakeGalleryVideoReference?: (details: GalleryVideoDetails) => void;
  galleryImageReferenceLabel: string;
  galleryRefreshTrigger?: number;
}

const StartScreenBelowFold: React.FC<StartScreenBelowFoldProps> = ({
  onSelectGalleryImage,
  onSelectGalleryVideo,
  onMakeGalleryImageReference,
  onMakeGalleryVideoReference,
  galleryImageReferenceLabel,
  galleryRefreshTrigger,
}) => (
  <>
    {onSelectGalleryImage && (
      <Gallery
        onSelectImage={onSelectGalleryImage}
        onSelectVideo={onSelectGalleryVideo}
        onMakeImageReference={onMakeGalleryImageReference}
        onMakeVideoReference={onMakeGalleryVideoReference}
        imageReferenceActionLabel={galleryImageReferenceLabel}
        refreshTrigger={galleryRefreshTrigger}
      />
    )}

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

    <FAQ />
  </>
);

export default StartScreenBelowFold;
