/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  getGalleryImages,
  getGalleryImage,
  deleteGalleryImage,
  clearGallery,
  GalleryThumbnail,
} from '../src/utils/workflowStorage';

interface GalleryProps {
  onSelectImage: (file: File) => void;
  refreshTrigger?: number;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

const Gallery: React.FC<GalleryProps> = ({ onSelectImage, refreshTrigger }) => {
  const [images, setImages] = useState<GalleryThumbnail[]>([]);
  const [loading, setLoading] = useState(true);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
  const [clearConfirm, setClearConfirm] = useState(false);
  const [loadingImageId, setLoadingImageId] = useState<number | null>(null);

  const loadImages = useCallback(async () => {
    setLoading(true);
    const galleryImages = await getGalleryImages();
    setImages(galleryImages);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadImages();
  }, [loadImages, refreshTrigger]);

  // Create object URLs for thumbnails
  useEffect(() => {
    const urls: Record<number, string> = {};
    images.forEach((img) => {
      urls[img.id] = URL.createObjectURL(img.thumbnail);
    });
    setThumbnailUrls(urls);

    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [images]);

  const handleImageClick = async (id: number) => {
    setLoadingImageId(id);
    const file = await getGalleryImage(id);
    setLoadingImageId(null);
    if (file) {
      onSelectImage(file);
    }
  };

  const handleDelete = async (id: number) => {
    // Revoke the thumbnail URL to free memory
    if (thumbnailUrls[id]) {
      URL.revokeObjectURL(thumbnailUrls[id]);
    }
    // Delete from IndexedDB
    await deleteGalleryImage(id);
    // Reload gallery
    loadImages();
  };

  const handleClearAll = async () => {
    await clearGallery();
    setClearConfirm(false);
    loadImages();
  };

  if (loading) {
    return (
      <div className="w-full py-8 text-center text-gray-500">
        Loading gallery...
      </div>
    );
  }

  if (images.length === 0) {
    return null; // Don't show empty gallery
  }

  return (
    <div className="w-full mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-200">My Creations</h2>
        <button
          onClick={() => setClearConfirm(true)}
          className="text-sm text-gray-400 hover:text-red-400 transition-colors"
        >
          Clear All
        </button>
      </div>

      {/* Clear All Confirmation */}
      {clearConfirm && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg flex items-center justify-between">
          <span className="text-gray-300 text-sm">Delete all images?</span>
          <div className="flex gap-2">
            <button
              onClick={() => setClearConfirm(false)}
              className="px-3 py-1 text-sm text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleClearAll}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-500"
            >
              Delete All
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {images.map((image) => (
          <div
            key={image.id}
            className="relative group aspect-square bg-gray-800 rounded-lg overflow-hidden border border-gray-700/50 hover:border-blue-500/50 transition-colors"
          >
            {/* Thumbnail Image */}
            <button
              onClick={() => handleImageClick(image.id)}
              disabled={loadingImageId === image.id}
              className="w-full h-full"
            >
              {thumbnailUrls[image.id] && (
                <img
                  src={thumbnailUrls[image.id]}
                  alt={image.name}
                  className="w-full h-full object-cover"
                />
              )}
              {loadingImageId === image.id && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                </div>
              )}
            </button>

            {/* Date overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              <span className="text-xs text-gray-300">
                {formatRelativeTime(image.createdAt)}
              </span>
            </div>

            {/* Delete button - deletes immediately without confirmation */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(image.id);
              }}
              className="absolute top-1 right-1 w-6 h-6 bg-black/50 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              aria-label="Delete image"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3 w-3"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Gallery;
