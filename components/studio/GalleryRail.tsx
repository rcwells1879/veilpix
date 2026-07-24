/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The creations gallery: a full-height rail on desktop and an inline grid
 * below the studio or Video Editor on smaller screens.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getGalleryImages,
  getGalleryImage,
  getGalleryVideoDetails,
  deleteGalleryImage,
  clearGallery,
  type GalleryThumbnail,
  type GalleryVideoDetails,
} from '../../src/utils/workflowStorage';
import {
  VEILPIX_GALLERY_IMAGE_PREFIX,
  VEILPIX_GALLERY_IMAGE_TYPE,
  VEILPIX_GALLERY_VIDEO_PREFIX,
  VEILPIX_GALLERY_VIDEO_TYPE,
} from '../../src/utils/imageTransfer';
import { XIcon } from './controls';

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString();
}

/** A "send to" destination offered in the right-click menu (varies with the active model). */
export interface GalleryReferenceTarget {
  id: string;
  label: string;
}

export interface GalleryRailProps {
  refreshTrigger?: number;
  onSelectImage: (file: File, prompt: string) => void;
  onSelectVideo: (details: GalleryVideoDetails) => void;
  onUseImageAsReference: (file: File, prompt: string) => void;
  onUseVideoAsReference?: (details: GalleryVideoDetails) => void;
  showReferenceActions?: boolean;
  imageReferenceTargets?: GalleryReferenceTarget[];
  videoReferenceTargets?: GalleryReferenceTarget[];
  onImageReferenceAction?: (targetId: string, file: File, prompt: string) => void;
  onVideoReferenceAction?: (targetId: string, details: GalleryVideoDetails) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  item: GalleryThumbnail;
}

const GalleryRail: React.FC<GalleryRailProps> = ({
  refreshTrigger,
  onSelectImage,
  onSelectVideo,
  onUseImageAsReference,
  onUseVideoAsReference,
  showReferenceActions = true,
  imageReferenceTargets = [],
  videoReferenceTargets = [],
  onImageReferenceAction,
  onVideoReferenceAction,
}) => {
  const [items, setItems] = useState<GalleryThumbnail[]>([]);
  const [loading, setLoading] = useState(true);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
  const [clearConfirm, setClearConfirm] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [contextMenu]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const galleryItems = await getGalleryImages();
    setItems(galleryItems);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems, refreshTrigger]);

  useEffect(() => {
    const urls: Record<number, string> = {};
    items.forEach((item) => {
      urls[item.id] = URL.createObjectURL(item.thumbnail);
    });
    setThumbnailUrls(urls);
    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [items]);

  const handleOpen = async (item: GalleryThumbnail) => {
    setBusyId(item.id);
    try {
      if (item.type === 'video') {
        const details = await getGalleryVideoDetails(item.id);
        if (details) onSelectVideo(details);
      } else {
        const details = await getGalleryImage(item.id);
        if (details) onSelectImage(details.file, details.prompt);
      }
    } catch (error) {
      console.error('Failed to open gallery item:', error);
    } finally {
      setBusyId(null);
    }
  };

  const handleUseAsReference = async (item: GalleryThumbnail) => {
    setBusyId(item.id);
    try {
      if (item.type === 'video') {
        if (!onUseVideoAsReference) return;
        const details = await getGalleryVideoDetails(item.id);
        if (details) onUseVideoAsReference(details);
      } else {
        const details = await getGalleryImage(item.id);
        if (details) onUseImageAsReference(details.file, details.prompt);
      }
    } catch (error) {
      console.error('Failed to use gallery item as reference:', error);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (thumbnailUrls[id]) URL.revokeObjectURL(thumbnailUrls[id]);
    await deleteGalleryImage(id);
    loadItems();
  };

  const handleClearAll = async () => {
    await clearGallery();
    setClearConfirm(false);
    loadItems();
  };

  const handleReferenceTarget = async (targetId: string, item: GalleryThumbnail) => {
    setBusyId(item.id);
    try {
      if (item.type === 'video') {
        if (!onVideoReferenceAction) return;
        const details = await getGalleryVideoDetails(item.id);
        if (details) onVideoReferenceAction(targetId, details);
      } else {
        if (!onImageReferenceAction) return;
        const details = await getGalleryImage(item.id);
        if (details) onImageReferenceAction(targetId, details.file, details.prompt);
      }
    } catch (error) {
      console.error('Failed to send gallery item to reference slot:', error);
    } finally {
      setBusyId(null);
    }
  };

  const handleItemDragStart = (event: React.DragEvent<HTMLElement>, item: GalleryThumbnail) => {
    event.dataTransfer.effectAllowed = 'copy';
    if (item.type === 'video') {
      event.dataTransfer.setData(VEILPIX_GALLERY_VIDEO_TYPE, String(item.id));
      event.dataTransfer.setData('text/plain', `${VEILPIX_GALLERY_VIDEO_PREFIX}${item.id}`);
      return;
    }
    event.dataTransfer.setData(VEILPIX_GALLERY_IMAGE_TYPE, String(item.id));
    event.dataTransfer.setData('text/plain', `${VEILPIX_GALLERY_IMAGE_PREFIX}${item.id}`);
  };

  const content = (
    <div className="flex min-h-0 flex-col md:h-full">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-6 md:pb-2 md:pt-4">
        <span className="text-sm font-semibold tracking-tight text-gray-300 md:text-[11px] md:uppercase md:tracking-[0.16em] md:text-gray-500">
          <span className="md:hidden">My Creations</span>
          <span className="hidden md:inline">Creations</span>
        </span>
        <div className="flex items-center gap-1.5">
          {items.length > 0 && !clearConfirm && (
            <button
              type="button"
              onClick={() => setClearConfirm(true)}
              className="text-[11px] font-medium text-gray-600 transition hover:text-red-400"
            >
              Clear
            </button>
          )}

        </div>
      </div>

      {clearConfirm && (
        <div className="edge mx-3 mb-2 flex shrink-0 items-center justify-between gap-2 rounded-xl bg-red-500/10 px-3 py-2 animate-fade-in-fast">
          <span className="text-[11px] text-gray-300">Delete all?</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setClearConfirm(false)} className="text-[11px] text-gray-400 hover:text-gray-200">No</button>
            <button type="button" onClick={handleClearAll} className="text-[11px] font-semibold text-red-400 hover:text-red-300">Yes</button>
          </span>
        </div>
      )}

      {/* Thumbnails: production-style grid on mobile, vertical rail on desktop. */}
      <div className="grid grid-cols-2 gap-3 overflow-visible px-4 pb-6 pt-1 sm:grid-cols-3 md:flex md:min-h-0 md:flex-1 md:flex-col md:gap-4 md:overflow-y-auto">
        {loading ? (
          <p className="col-span-full rounded-2xl border border-white/[0.05] bg-black/10 py-6 text-center text-[11px] text-gray-600">Loading…</p>
        ) : items.length === 0 ? (
          <p className="col-span-full rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-center text-[11px] leading-relaxed text-gray-500 md:border-0 md:bg-transparent md:pt-4 md:text-gray-600">
            Your creations will appear here
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              onDragStartCapture={(event) => handleItemDragStart(event, item)}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY, item });
              }}
              className="edge group relative aspect-square w-full shrink-0 overflow-hidden rounded-2xl bg-white/[0.03] transition hover:bg-white/[0.06]"
            >
              <button
                type="button"
                onClick={() => handleOpen(item)}
                disabled={busyId === item.id}
                draggable={busyId !== item.id}
                title={item.type === 'image'
                  ? 'Open image (drag onto an image slot to reuse)'
                  : 'Open video (drag into the Video Editor to stitch)'}
                className="h-full w-full"
              >
                {thumbnailUrls[item.id] && (
                  <img
                    src={thumbnailUrls[item.id]}
                    alt={item.name}
                    draggable={busyId !== item.id}
                    className="h-full w-full object-cover"
                  />
                )}
                {item.type === 'video' && busyId !== item.id && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="edge flex h-9 w-9 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" className="ml-0.5 h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </span>
                )}
                {busyId === item.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  </span>
                )}
              </button>

              {/* Use as reference */}
              {showReferenceActions && (item.type === 'image' || onUseVideoAsReference) && busyId !== item.id && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleUseAsReference(item);
                  }}
                  className="edge absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-gray-100 opacity-100 backdrop-blur-sm transition hover:bg-black/85 md:opacity-0 md:group-hover:opacity-100"
                >
                  Use as ref
                </button>
              )}

              {/* Delete */}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleDelete(item.id);
                }}
                aria-label="Delete"
                className="edge absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-gray-300 opacity-100 backdrop-blur-sm transition hover:bg-red-600/90 hover:text-white md:opacity-0 md:group-hover:opacity-100"
              >
                <XIcon className="h-3 w-3" />
              </button>

              {/* Time */}
              <span className="pointer-events-none absolute bottom-1.5 right-2 text-[10px] font-medium text-white/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
                {formatRelativeTime(item.createdAt)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  /* Right-click context menu (portaled so glass/backdrop-filter ancestors can't trap it) */
  let contextMenuNode: React.ReactNode = null;
  if (contextMenu) {
    const targets = contextMenu.item.type === 'video' ? videoReferenceTargets : imageReferenceTargets;
    const MENU_WIDTH = 208;
    const estimatedHeight = (2 + targets.length) * 34 + (targets.length > 0 ? 26 : 17);
    const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth - MENU_WIDTH - 8));
    const top = Math.max(8, Math.min(contextMenu.y, window.innerHeight - estimatedHeight - 8));
    const menuItemClass = 'flex w-full items-center rounded-lg px-3 py-1.5 text-left text-[12px] font-medium transition';

    contextMenuNode = createPortal(
      <div
        className="fixed inset-0 z-[90]"
        data-dropdown-keep-open=""
        onContextMenu={(event) => {
          event.preventDefault();
          closeContextMenu();
        }}
      >
        <div className="absolute inset-0" onMouseDown={closeContextMenu} aria-hidden="true" />
        <div
          className="glass-sheet edge absolute w-52 rounded-xl p-1.5 animate-fade-in-fast"
          style={{ left, top }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className={`${menuItemClass} text-gray-200 hover:bg-white/10 hover:text-white`}
            onClick={() => {
              handleOpen(contextMenu.item);
              closeContextMenu();
            }}
          >
            Open
          </button>
          {targets.length > 0 && <div className="mx-2 my-1 h-px bg-white/10" aria-hidden="true" />}
          {targets.map((target) => (
            <button
              key={target.id}
              type="button"
              role="menuitem"
              className={`${menuItemClass} text-gray-200 hover:bg-white/10 hover:text-white`}
              onClick={() => {
                handleReferenceTarget(target.id, contextMenu.item);
                closeContextMenu();
              }}
            >
              {target.label}
            </button>
          ))}
          <div className="mx-2 my-1 h-px bg-white/10" aria-hidden="true" />
          <button
            type="button"
            role="menuitem"
            className={`${menuItemClass} text-red-400 hover:bg-red-500/15 hover:text-red-300`}
            onClick={() => {
              handleDelete(contextMenu.item.id);
              closeContextMenu();
            }}
          >
            Delete
          </button>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <aside
      id="creations-gallery"
      className="w-full shrink-0 scroll-mt-4 border-t border-white/[0.06] bg-black/[0.06] pb-4 md:absolute md:inset-y-0 md:right-0 md:z-10 md:w-40 md:border-t-0 md:bg-transparent md:pb-0 lg:w-48"
      aria-label="Creations gallery"
      data-dropdown-keep-open=""
    >
      {content}
      {contextMenuNode}
    </aside>
  );
};

export default GalleryRail;
