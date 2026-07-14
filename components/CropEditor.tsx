/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface CropEditorProps {
  src: string;
  crop: Crop;
  aspect?: number;
  imageRef: React.Ref<HTMLImageElement>;
  onChange: (crop: PixelCrop) => void;
  onComplete: (crop: PixelCrop) => void;
}

const CropEditor: React.FC<CropEditorProps> = ({
  src,
  crop,
  aspect,
  imageRef,
  onChange,
  onComplete,
}) => (
  <ReactCrop
    crop={crop}
    onChange={onChange}
    onComplete={onComplete}
    aspect={aspect}
    className="max-h-[60vh]"
  >
    <img
      ref={imageRef}
      src={src}
      alt="Crop this image"
      className="w-full h-auto object-contain max-h-[60vh] rounded-xl"
    />
  </ReactCrop>
);

export default CropEditor;
