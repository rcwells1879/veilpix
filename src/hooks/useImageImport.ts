import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  getClipboardImageFiles,
  getDroppedImageFiles,
  prepareImageFiles,
} from '../utils/imageTransfer';

interface PasteTarget {
  priority: number;
}

const pasteTargets = new Map<string, PasteTarget>();
let activePasteTargetId: string | null = null;

function getPasteTargetId(): string | null {
  if (activePasteTargetId && pasteTargets.has(activePasteTargetId)) return activePasteTargetId;

  let selectedId: string | null = null;
  let selectedPriority = Number.POSITIVE_INFINITY;
  pasteTargets.forEach((target, id) => {
    if (target.priority < selectedPriority) {
      selectedId = id;
      selectedPriority = target.priority;
    }
  });
  return selectedId;
}

function isEditableElement(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && Boolean(target.closest('input, textarea, [contenteditable="true"]'));
}

interface UseImageImportOptions {
  onImages: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  maxFiles?: number;
  enableDocumentPaste?: boolean;
  pastePriority?: number;
}

export interface ImageImportTarget {
  isDraggingOver: boolean;
  isProcessing: boolean;
  importFiles: (files: File[]) => Promise<void>;
  targetProps: React.HTMLAttributes<HTMLElement>;
}

export function useImageImport({
  onImages,
  disabled = false,
  multiple = false,
  maxFiles = multiple ? Number.POSITIVE_INFINITY : 1,
  enableDocumentPaste = true,
  pastePriority = 0,
}: UseImageImportOptions): ImageImportTarget {
  const reactId = useId();
  const targetId = `image-import-${reactId}`;
  const onImagesRef = useRef(onImages);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  onImagesRef.current = onImages;

  const importFiles = useCallback(async (files: File[]) => {
    if (disabled || maxFiles <= 0) return;

    setIsProcessing(true);
    try {
      const preparedFiles = await prepareImageFiles(files.slice(0, multiple ? maxFiles : 1));
      if (preparedFiles.length > 0) onImagesRef.current(preparedFiles);
    } catch (error) {
      console.error('Failed to import image:', error);
      alert(error instanceof Error ? error.message : 'Failed to import that image.');
    } finally {
      setIsProcessing(false);
    }
  }, [disabled, maxFiles, multiple]);

  const activate = useCallback(() => {
    if (!disabled && enableDocumentPaste) activePasteTargetId = targetId;
  }, [disabled, enableDocumentPaste, targetId]);

  useEffect(() => {
    if (disabled || !enableDocumentPaste || maxFiles <= 0) return;

    pasteTargets.set(targetId, { priority: pastePriority });
    return () => {
      pasteTargets.delete(targetId);
      if (activePasteTargetId === targetId) activePasteTargetId = null;
    };
  }, [disabled, enableDocumentPaste, maxFiles, pastePriority, targetId]);

  useEffect(() => {
    if (disabled || !enableDocumentPaste || maxFiles <= 0) return;

    const handleDocumentPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || isEditableElement(event.target) || getPasteTargetId() !== targetId) return;

      const files = getClipboardImageFiles(event.clipboardData);
      if (files.length === 0) return;

      event.preventDefault();
      void importFiles(files);
    };

    document.addEventListener('paste', handleDocumentPaste);
    return () => document.removeEventListener('paste', handleDocumentPaste);
  }, [disabled, enableDocumentPaste, importFiles, maxFiles, targetId]);

  const targetProps = useMemo<React.HTMLAttributes<HTMLElement>>(() => ({
    tabIndex: disabled ? -1 : 0,
    onMouseEnter: activate,
    onFocus: activate,
    onDragEnter: (event) => {
      if (disabled) return;
      event.preventDefault();
      activate();
      setIsDraggingOver(true);
    },
    onDragOver: (event) => {
      if (disabled) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      activate();
      setIsDraggingOver(true);
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setIsDraggingOver(false);
      }
    },
    onDrop: (event) => {
      if (disabled) return;
      event.preventDefault();
      setIsDraggingOver(false);
      activate();
      setIsProcessing(true);
      void getDroppedImageFiles(event.dataTransfer)
        .then((files) => importFiles(files))
        .catch((error) => {
          console.error('Failed to import dropped image:', error);
          alert('That image could not be imported. Copy and paste it, download it, or try another source.');
        })
        .finally(() => setIsProcessing(false));
    },
    'aria-busy': isProcessing,
  }), [activate, disabled, importFiles, isProcessing]);

  return { isDraggingOver, isProcessing, importFiles, targetProps };
}
