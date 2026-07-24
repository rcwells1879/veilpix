/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Compact reference input slots used inside the composer's References panel.
 * All slots support click-to-browse, drag & drop, and paste (with HEIC conversion).
 */

import React, { useEffect, useState } from 'react';
import { useImageImport } from '../../src/hooks/useImageImport';
import { PhotoIcon, VideoIcon, CameraIcon } from '../icons';
import { FilePreview, XIcon, PlusIcon } from './controls';

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
        <label
          {...imageImport.targetProps}
          title={`Paste or drop ${label.toLowerCase()}`}
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
          <input
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            disabled={disabled || imageImport.isProcessing}
            onChange={(event) => {
              const selectedFile = event.target.files?.[0];
              if (selectedFile) void imageImport.importFiles([selectedFile]);
              event.currentTarget.value = '';
            }}
          />
        </label>
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
      <div className="grid grid-cols-3 gap-2">
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
          <label
            {...imageImport.targetProps}
            title="Paste or drop reference images"
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
            <input
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="hidden"
              disabled={disabled || imageImport.isProcessing}
              onChange={(event) => {
                void imageImport.importFiles(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = '';
              }}
            />
          </label>
        )}
      </div>
      {helper && <span className="px-1 text-[11px] text-gray-600">{helper}</span>}
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
