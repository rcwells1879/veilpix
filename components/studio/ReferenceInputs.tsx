/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Compact reference input slots used inside the composer's References panel.
 * All slots support click-to-browse, drag & drop, and paste (with HEIC conversion).
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useImageImport } from '../../src/hooks/useImageImport';
import { getGalleryImage, getGalleryImages, type GalleryThumbnail } from '../../src/utils/workflowStorage';
import {
  VEILPIX_GALLERY_IMAGE_PREFIX,
  VEILPIX_GALLERY_IMAGE_TYPE,
} from '../../src/utils/imageTransfer';
import { PhotoIcon, VideoIcon, CameraIcon } from '../icons';
import { FilePreview, XIcon, PlusIcon } from './controls';

/* ------------------------------------------------------------------ */
/* Album / device source chooser                                       */
/* ------------------------------------------------------------------ */

interface ImageSourceChooserProps {
  open: boolean;
  title: string;
  multiple?: boolean;
  remainingSlots: number;
  onImport: (files: File[]) => Promise<void>;
  onClose: () => void;
}

const ImageSourceChooser: React.FC<ImageSourceChooserProps> = ({
  open,
  title,
  multiple = false,
  remainingSlots,
  onImport,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<GalleryThumbnail[]>([]);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    void getGalleryImages()
      .then((galleryItems) => setItems(galleryItems.filter((item) => item.type === 'image')))
      .catch(() => setError('The Album could not be loaded.'))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    const urls: Record<number, string> = {};
    items.forEach((item) => {
      urls[item.id] = URL.createObjectURL(item.thumbnail);
    });
    setThumbnailUrls(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const handleAlbumSelect = async (item: GalleryThumbnail) => {
    setBusyId(item.id);
    setError(null);
    try {
      const details = await getGalleryImage(item.id);
      if (!details) throw new Error('That Album image is no longer available.');
      await onImport([details.file]);
      onClose();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'That Album image could not be added.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAlbumDragStart = (event: React.DragEvent<HTMLElement>, item: GalleryThumbnail) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(VEILPIX_GALLERY_IMAGE_TYPE, String(item.id));
    event.dataTransfer.setData('text/plain', `${VEILPIX_GALLERY_IMAGE_PREFIX}${item.id}`);
  };

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={title} data-dropdown-keep-open="">
      <div className="absolute inset-0 bg-black/65" onClick={onClose} aria-hidden="true" />
      <div className="glass-sheet edge absolute inset-x-3 bottom-3 mx-auto flex max-h-[78dvh] max-w-md flex-col overflow-hidden rounded-2xl animate-fade-in-fast sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-100">{title}</h3>
            <p className="mt-0.5 text-[11px] text-gray-500">Choose from your Album or upload from this device.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close image chooser"
            className="edge flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/35 text-gray-300 transition hover:bg-black/60 hover:text-white"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="edge flex w-full items-center justify-center gap-2 rounded-xl bg-white/[0.05] px-3 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/[0.09] hover:text-white"
          >
            <PhotoIcon className="h-5 w-5 text-gray-400" />
            Upload from device
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple={multiple && remainingSlots > 1}
            className="hidden"
            onChange={(event) => {
              const selectedFiles = Array.from(event.currentTarget.files ?? []).slice(0, remainingSlots);
              event.currentTarget.value = '';
              if (selectedFiles.length === 0) return;
              void onImport(selectedFiles).then(onClose);
            }}
          />

          <div className="mb-2 mt-4 flex items-baseline justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Album</span>
            {multiple && remainingSlots > 1 && (
              <span className="text-[11px] text-gray-600">Add one at a time</span>
            )}
          </div>

          {loading ? (
            <p className="rounded-xl border border-white/[0.05] py-6 text-center text-xs text-gray-500">Loading Album…</p>
          ) : error ? (
            <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-4 text-center text-xs text-red-300">{error}</p>
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs leading-relaxed text-gray-500">
              Your generated images will appear here.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  draggable={busyId !== item.id}
                  disabled={busyId !== null}
                  onDragStart={(event) => handleAlbumDragStart(event, item)}
                  onClick={() => void handleAlbumSelect(item)}
                  title={`Add ${item.name} from Album`}
                  className="edge group relative aspect-square overflow-hidden rounded-xl bg-black/35 transition hover:ring-2 hover:ring-accent-400/45 disabled:opacity-60"
                >
                  {thumbnailUrls[item.id] && (
                    <img src={thumbnailUrls[item.id]} alt={item.name} draggable={false} className="h-full w-full object-cover" />
                  )}
                  {busyId === item.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ------------------------------------------------------------------ */
/* Single image slot (base image, style image, start/end frame)         */
/* ------------------------------------------------------------------ */

interface ImageSlotProps {
  file: File | null;
  label: string;
  helper?: string;
  disabled?: boolean;
  pastePriority?: number;
  onChange: (file: File | null) => void;
  onWebcamClick?: () => void;
}

export const ImageSlot: React.FC<ImageSlotProps> = ({ file, label, helper, disabled = false, pastePriority = 0, onChange, onWebcamClick }) => {
  const [sourceChooserOpen, setSourceChooserOpen] = useState(false);
  const imageImport = useImageImport({
    onImages: (files) => onChange(files[0]),
    disabled,
    pastePriority,
  });

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</span>
      {file ? (
        <div
          {...imageImport.targetProps}
          title={`Paste or drop a replacement ${label.toLowerCase()}`}
          className={`edge relative aspect-video overflow-hidden rounded-xl bg-black/40 transition ${
            imageImport.isDraggingOver ? 'ring-2 ring-accent-400/50' : ''
          }`}
        >
          <FilePreview file={file} className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label={`Remove ${label}`}
            className="edge absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-gray-200 transition hover:bg-black/85 hover:text-white disabled:opacity-50"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          {...imageImport.targetProps}
          title={`Paste or drop ${label.toLowerCase()}`}
          onClick={() => setSourceChooserOpen(true)}
          disabled={disabled || imageImport.isProcessing}
          className={`edge flex aspect-video flex-col items-center justify-center gap-1.5 rounded-xl p-3 text-center transition ${
            disabled
              ? 'cursor-not-allowed bg-white/[0.02] opacity-50'
              : imageImport.isDraggingOver
                ? 'cursor-copy bg-accent-400/10 ring-2 ring-accent-400/40'
                : 'cursor-pointer bg-white/[0.03] hover:bg-white/[0.07]'
          }`}
        >
          <PhotoIcon className="h-6 w-6 text-gray-500" />
          <span className="text-xs font-medium text-gray-300">
            {imageImport.isProcessing ? 'Processing…' : `Add ${label.toLowerCase()}`}
          </span>
          {helper && <span className="text-[11px] text-gray-600">{helper}</span>}
        </button>
      )}
      {onWebcamClick && !file && (
        <button
          type="button"
          onClick={onWebcamClick}
          disabled={disabled}
          className="edge glass-chip flex h-9 items-center justify-center gap-1.5 rounded-full text-xs font-medium text-gray-300 hover:text-white disabled:opacity-50"
        >
          <CameraIcon className="h-4 w-4" />
          Use camera
        </button>
      )}
      <ImageSourceChooser
        open={sourceChooserOpen}
        title={`Add ${label.toLowerCase()}`}
        remainingSlots={1}
        onImport={imageImport.importFiles}
        onClose={() => setSourceChooserOpen(false)}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Multi image grid (Wan / Seedance reference images)                   */
/* ------------------------------------------------------------------ */

interface ImageGridProps {
  files: File[];
  maxFiles: number;
  label: string;
  helper?: string;
  disabled?: boolean;
  onChange: (files: File[]) => void;
}

export const ImageGrid: React.FC<ImageGridProps> = ({ files, maxFiles, label, helper, disabled = false, onChange }) => {
  const [sourceChooserOpen, setSourceChooserOpen] = useState(false);
  const imageImport = useImageImport({
    onImages: (incoming) => onChange([...files, ...incoming].slice(0, maxFiles)),
    disabled: disabled || files.length >= maxFiles,
    multiple: true,
    maxFiles: maxFiles - files.length,
  });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</span>
        <span className="text-[11px] tabular-nums text-gray-600">{files.length}/{maxFiles}</span>
      </div>
      <div
        {...imageImport.targetProps}
        title="Paste or drop reference images"
        className={`grid grid-cols-3 gap-2 rounded-xl transition ${imageImport.isDraggingOver ? 'ring-2 ring-accent-400/45 ring-offset-2 ring-offset-transparent' : ''}`}
      >
        {files.map((file, index) => (
          <div key={`${file.name}-${file.lastModified}-${index}`} className="edge relative aspect-square overflow-hidden rounded-xl bg-black/40">
            <FilePreview file={file} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(files.filter((_, i) => i !== index))}
              disabled={disabled}
              aria-label={`Remove reference ${index + 1}`}
              className="edge absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-gray-200 transition hover:bg-black/85 hover:text-white disabled:opacity-50"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        ))}
        {files.length < maxFiles && (
          <button
            type="button"
            title="Paste or drop reference images"
            onClick={() => setSourceChooserOpen(true)}
            disabled={disabled || imageImport.isProcessing}
            className={`edge flex aspect-square flex-col items-center justify-center gap-1 rounded-xl p-2 text-center transition ${
              disabled
                ? 'cursor-not-allowed bg-white/[0.02] opacity-50'
                : imageImport.isDraggingOver
                  ? 'cursor-copy bg-accent-400/10 ring-2 ring-accent-400/40'
                  : 'cursor-pointer bg-white/[0.03] hover:bg-white/[0.07]'
            }`}
          >
            <PlusIcon className="h-5 w-5 text-gray-500" />
            <span className="text-[11px] font-medium text-gray-400">
              {imageImport.isProcessing ? 'Processing…' : 'Add'}
            </span>
          </button>
        )}
      </div>
      {helper && <span className="px-1 text-[11px] text-gray-600">{helper}</span>}
      <ImageSourceChooser
        open={sourceChooserOpen}
        title={`Add ${label.toLowerCase()}`}
        multiple
        remainingSlots={Math.max(0, maxFiles - files.length)}
        onImport={imageImport.importFiles}
        onClose={() => setSourceChooserOpen(false)}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Video reference slot                                                 */
/* ------------------------------------------------------------------ */

interface VideoSlotProps {
  file: File | null;
  /** Remote URL fallback (e.g. reusing a generated video). */
  url?: string | null;
  label: string;
  helper?: string;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
  onRemoveUrl?: () => void;
  action?: React.ReactNode;
}

export const VideoSlot: React.FC<VideoSlotProps> = ({ file, url, label, helper, disabled = false, onSelect, onRemoveUrl, action }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const displayedUrl = previewUrl || url;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</span>
        {action}
      </div>
      {displayedUrl ? (
        <div className="edge relative overflow-hidden rounded-xl bg-black/50">
          <video src={displayedUrl} controls playsInline className="max-h-36 w-full bg-black object-contain" />
          <button
            type="button"
            onClick={() => (file ? onSelect(null) : onRemoveUrl?.())}
            disabled={disabled}
            aria-label={`Remove ${label}`}
            className="edge absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-gray-200 transition hover:bg-black/85 hover:text-white disabled:opacity-50"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label
          className={`edge flex flex-col items-center justify-center gap-1.5 rounded-xl px-3 py-5 text-center transition ${
            disabled ? 'cursor-not-allowed bg-white/[0.02] opacity-50' : 'cursor-pointer bg-white/[0.03] hover:bg-white/[0.07]'
          }`}
        >
          <VideoIcon className="h-6 w-6 text-gray-500" />
          <span className="text-xs font-medium text-gray-300">Add {label.toLowerCase()}</span>
          {helper && <span className="text-[11px] text-gray-600">{helper}</span>}
          <input
            type="file"
            accept="video/*"
            className="hidden"
            disabled={disabled}
            onChange={(event) => {
              onSelect(event.target.files?.[0] || null);
              event.currentTarget.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
};

interface VideoGridProps {
  files: File[];
  url?: string | null;
  maxFiles: number;
  label: string;
  helper?: string;
  accept?: string;
  disabled?: boolean;
  onChange: (files: File[]) => void;
  onRemoveUrl?: () => void;
  action?: React.ReactNode;
}

const VideoFilePreview: React.FC<{ file: File }> = ({ file }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return previewUrl
    ? <video src={previewUrl} muted playsInline className="h-full w-full bg-black object-cover" />
    : null;
};

export const VideoGrid: React.FC<VideoGridProps> = ({
  files,
  url,
  maxFiles,
  label,
  helper,
  accept = 'video/mp4,video/quicktime,.mp4,.mov',
  disabled = false,
  onChange,
  onRemoveUrl,
  action,
}) => {
  const referenceCount = files.length + (url ? 1 : 0);
  const remainingSlots = Math.max(0, maxFiles - referenceCount);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</span>
        <div className="flex items-center gap-2">
          {action}
          <span className="text-[11px] tabular-nums text-gray-600">{referenceCount}/{maxFiles}</span>
        </div>
      </div>
      {referenceCount > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {url && (
            <div className="edge relative aspect-video overflow-hidden rounded-xl bg-black/50">
              <video src={url} muted playsInline className="h-full w-full bg-black object-cover" />
              <button
                type="button"
                onClick={onRemoveUrl}
                disabled={disabled}
                aria-label="Remove remote reference video"
                className="edge absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-gray-200 transition hover:bg-black/85 hover:text-white disabled:opacity-50"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          )}
          {files.map((file, index) => (
            <div key={`${file.name}-${file.lastModified}-${index}`} className="edge relative aspect-video overflow-hidden rounded-xl bg-black/50">
              <VideoFilePreview file={file} />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}
                disabled={disabled}
                aria-label={`Remove reference video ${index + 1}`}
                className="edge absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-gray-200 transition hover:bg-black/85 hover:text-white disabled:opacity-50"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {remainingSlots > 0 && (
        <label
          className={`edge flex items-center justify-center gap-2 rounded-xl px-3 py-3.5 text-center transition ${
            disabled ? 'cursor-not-allowed bg-white/[0.02] opacity-50' : 'cursor-pointer bg-white/[0.03] hover:bg-white/[0.07]'
          }`}
        >
          <VideoIcon className="h-5 w-5 text-gray-500" />
          <span className="text-xs font-medium text-gray-300">Add video{remainingSlots > 1 ? 's' : ''}</span>
          {helper && <span className="text-[11px] text-gray-600">{helper}</span>}
          <input
            type="file"
            accept={accept}
            multiple={remainingSlots > 1}
            className="hidden"
            disabled={disabled}
            onChange={(event) => {
              const incoming = Array.from(event.currentTarget.files ?? []);
              onChange([...files, ...incoming].slice(0, maxFiles - (url ? 1 : 0)));
              event.currentTarget.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Audio reference slot                                                 */
/* ------------------------------------------------------------------ */

interface AudioSlotProps {
  file: File | null;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
}

export const AudioSlot: React.FC<AudioSlotProps> = ({ file, disabled = false, onSelect }) => (
  <div className="flex flex-col gap-1.5">
    <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Reference audio</span>
    {file ? (
      <div className="edge flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
        <span className="min-w-0 truncate text-sm text-gray-300">{file.name}</span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          disabled={disabled}
          aria-label="Remove reference audio"
          className="edge flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/50 text-gray-200 transition hover:bg-black/80 hover:text-white disabled:opacity-50"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    ) : (
      <label
        className={`edge flex items-center justify-center gap-2 rounded-xl px-3 py-3.5 text-center transition ${
          disabled ? 'cursor-not-allowed bg-white/[0.02] opacity-50' : 'cursor-pointer bg-white/[0.03] hover:bg-white/[0.07]'
        }`}
      >
        <span className="text-xs font-medium text-gray-300">Add audio</span>
        <span className="text-[11px] text-gray-600">music, voice, rhythm</span>
        <input
          type="file"
          accept="audio/*,.mp3,.wav,.aac,.m4a,.ogg"
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            onSelect(event.target.files?.[0] || null);
            event.currentTarget.value = '';
          }}
        />
      </label>
    )}
  </div>
);

interface AudioGridProps {
  files: File[];
  maxFiles: number;
  helper?: string;
  accept?: string;
  disabled?: boolean;
  onChange: (files: File[]) => void;
}

export const AudioGrid: React.FC<AudioGridProps> = ({ files, maxFiles, helper, accept = 'audio/mpeg,audio/wav,.mp3,.wav', disabled = false, onChange }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-baseline justify-between px-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Reference audio</span>
      <span className="text-[11px] tabular-nums text-gray-600">{files.length}/{maxFiles}</span>
    </div>
    {files.map((file, index) => (
      <div key={`${file.name}-${file.lastModified}-${index}`} className="edge flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
        <span className="min-w-0 truncate text-sm text-gray-300">{file.name}</span>
        <button
          type="button"
          onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}
          disabled={disabled}
          aria-label={`Remove reference audio ${index + 1}`}
          className="edge flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/50 text-gray-200 transition hover:bg-black/80 hover:text-white disabled:opacity-50"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    ))}
    {files.length < maxFiles && (
      <label
        className={`edge flex items-center justify-center gap-2 rounded-xl px-3 py-3.5 text-center transition ${
          disabled ? 'cursor-not-allowed bg-white/[0.02] opacity-50' : 'cursor-pointer bg-white/[0.03] hover:bg-white/[0.07]'
        }`}
      >
        <span className="text-xs font-medium text-gray-300">Add audio</span>
        <span className="text-[11px] text-gray-600">{helper || 'music, voice, rhythm'}</span>
        <input
          type="file"
          accept={accept}
          multiple={maxFiles - files.length > 1}
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            const incoming = Array.from(event.currentTarget.files ?? []);
            onChange([...files, ...incoming].slice(0, maxFiles));
            event.currentTarget.value = '';
          }}
        />
      </label>
    )}
  </div>
);
