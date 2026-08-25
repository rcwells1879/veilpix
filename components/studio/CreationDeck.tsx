/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A live, animated surface for queued, active, and just-completed creations.
 * The workspace and every generation keep stable identities so CSS can move
 * cards between the focused position and the background stack without
 * remounting them.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PhotoIcon, VideoIcon } from '../icons';
import type { GalleryVideoDetails } from '../../src/utils/workflowStorage';

export type CreationCardStatus = 'queued' | 'generating' | 'completed' | 'failed';

export interface CreationCard {
  id: string;
  type: 'image' | 'video';
  status: CreationCardStatus;
  prompt: string;
  createdAt: number;
  galleryId?: number;
  aspectRatio?: string;
  imageFile?: File;
  previewFile?: File;
  videoDetails?: GalleryVideoDetails;
  errorMessage?: string;
}

export interface CreationDeckProps {
  cards: CreationCard[];
  focusedCardId: string | null;
  openCardId: string | null;
  isAutoRolling?: boolean;
  fillAvailable?: boolean;
  onFocusCard: (card: CreationCard) => void;
  onOpenCard: (card: CreationCard) => void;
  children: React.ReactNode;
}

function parseAspectRatio(value: string | undefined, type: CreationCard['type']): number {
  const match = value?.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width > 0 && height > 0) return width / height;
  }
  return type === 'video' ? 16 / 9 : 1;
}

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url;
}

const CreationCardFace: React.FC<{ card: CreationCard; focused: boolean }> = ({ card, focused }) => {
  const localVideoUrl = useObjectUrl(card.videoDetails?.videoFile ?? null);
  const fullImageUrl = useObjectUrl(card.imageFile ?? null);
  const previewImageUrl = useObjectUrl(card.previewFile ?? null);
  const imageUrl = focused
    ? fullImageUrl || previewImageUrl
    : previewImageUrl || fullImageUrl;
  const videoUrl = focused
    ? localVideoUrl || card.videoDetails?.videoUrl || null
    : null;
  const ratio = parseAspectRatio(card.aspectRatio, card.type);
  const width = `min(100%, min(48rem, calc(var(--creation-deck-media-limit) * ${ratio})))`;
  const label = card.status === 'queued'
    ? `Queued ${card.type}`
    : card.status === 'generating'
      ? `Generating ${card.type}`
      : card.status === 'failed'
        ? `${card.type === 'video' ? 'Video' : 'Image'} generation failed`
        : `${card.type === 'video' ? 'Video' : 'Image'} ready`;

  return (
    <div
      className={`creation-card-face edge-strong relative flex max-w-3xl flex-col overflow-hidden rounded-3xl ${
        card.status === 'failed' ? 'creation-card-face-failed' : ''
      }`}
      style={{ width }}
      role={card.status === 'completed' ? undefined : 'status'}
      aria-live={focused ? 'polite' : 'off'}
      aria-label={label}
      data-testid="creation-card-face"
    >
      <div
        className="creation-card-media relative flex w-full items-center justify-center overflow-hidden"
        style={{ aspectRatio: String(ratio) }}
      >
        {card.status === 'completed' && card.type === 'image' && imageUrl && (
          <img
            src={imageUrl}
            alt={card.prompt ? `Generated image: ${card.prompt}` : 'Generated image'}
            draggable={false}
            className="h-full w-full object-cover"
          />
        )}

        {card.status === 'completed' && card.type === 'video' && videoUrl && (
          <video
            src={videoUrl}
            controls={focused}
            muted={!focused}
            playsInline
            preload="metadata"
            className="h-full w-full bg-black object-cover"
          />
        )}

        {card.status === 'completed' && card.type === 'video' && !videoUrl && imageUrl && (
          <>
            <img
              src={imageUrl}
              alt={card.prompt ? `Video preview: ${card.prompt}` : 'Video preview'}
              draggable={false}
              className="h-full w-full object-cover"
            />
            <span className="creation-card-video-badge absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
              <VideoIcon className="h-3.5 w-3.5" /> Video
            </span>
          </>
        )}

        {card.status !== 'completed' && (
          <>
            <span className="creation-card-watermark absolute inset-0 flex items-center justify-center" aria-hidden="true">
              {card.type === 'video'
                ? <VideoIcon className="h-28 w-28" />
                : <PhotoIcon className="h-28 w-28" />}
            </span>
            <span className="relative z-10 flex max-w-sm flex-col items-center gap-3 px-6 text-center">
              {card.status !== 'failed' && (
                <span className="creation-card-spinner h-10 w-10 rounded-full" aria-hidden="true" />
              )}
              <span className="text-sm font-semibold tracking-tight text-gray-100">{label}</span>
              {card.status === 'queued' && (
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Waiting its turn
                </span>
              )}
              {card.status === 'generating' && (
                <span className="text-[11px] text-gray-500">You can leave and come back.</span>
              )}
              {card.status === 'failed' && card.errorMessage && (
                <span className="line-clamp-3 text-[11px] leading-relaxed text-red-300/80">{card.errorMessage}</span>
              )}
            </span>
          </>
        )}
      </div>

    </div>
  );
};

const CreationDeck: React.FC<CreationDeckProps> = ({
  cards,
  focusedCardId,
  openCardId,
  isAutoRolling = false,
  fillAvailable = false,
  onFocusCard,
  onOpenCard,
  children,
}) => {
  const deckRef = useRef<HTMLElement | null>(null);
  const wheelAccumulatorRef = useRef(0);
  const wheelResetTimerRef = useRef<number | null>(null);
  const wheelIndexRef = useRef(-1);
  const touchDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    accumulatedX: number;
    horizontal: boolean;
    moved: boolean;
  } | null>(null);
  const suppressTouchClickRef = useRef(false);
  const suppressTouchClickTimerRef = useRef<number | null>(null);
  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const browseOrder = useMemo(
    () => [...cards].sort((left, right) => right.createdAt - left.createdAt),
    [cards],
  );
  const browseIndexById = useMemo(
    () => new Map(browseOrder.map((card, index) => [card.id, index])),
    [browseOrder],
  );
  const focusedBrowseIndex = focusedCardId === null
    ? -1
    : (browseIndexById.get(focusedCardId) ?? -1);

  useEffect(() => () => {
    if (wheelResetTimerRef.current !== null) window.clearTimeout(wheelResetTimerRef.current);
    if (suppressTouchClickTimerRef.current !== null) {
      window.clearTimeout(suppressTouchClickTimerRef.current);
    }
  }, []);

  useEffect(() => {
    wheelIndexRef.current = focusedBrowseIndex;
  }, [focusedBrowseIndex]);

  useEffect(() => {
    if (isAutoRolling || isTouchDragging) return;

    const focusedCard = browseOrder.find(card => card.id === focusedCardId);
    if (!focusedCard || focusedCard.status !== 'completed' || openCardId === focusedCard.id) return;

    const hasCachedMedia = focusedCard.type === 'image'
      ? Boolean(focusedCard.imageFile)
      : Boolean(focusedCard.videoDetails);
    const openDelay = hasCachedMedia ? 75 : 500;

    const dwellTimer = window.setTimeout(() => {
      onOpenCard(focusedCard);
    }, openDelay);

    return () => window.clearTimeout(dwellTimer);
  }, [browseOrder, focusedCardId, isAutoRolling, isTouchDragging, onOpenCard, openCardId]);

  const handleWheel = (event: WheelEvent) => {
    if (browseOrder.length < 2) return;

    const primaryDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;
    if (primaryDelta === 0) return;

    event.preventDefault();

    const isDiscreteWheelStep = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL
      || Math.abs(primaryDelta) >= 40;
    let direction: 1 | -1;

    if (isDiscreteWheelStep) {
      wheelAccumulatorRef.current = 0;
      direction = primaryDelta > 0 ? 1 : -1;
    } else {
      wheelAccumulatorRef.current += primaryDelta;
      if (wheelResetTimerRef.current !== null) window.clearTimeout(wheelResetTimerRef.current);
      wheelResetTimerRef.current = window.setTimeout(() => {
        wheelAccumulatorRef.current = 0;
      }, 140);

      const smoothWheelThreshold = 22;
      if (Math.abs(wheelAccumulatorRef.current) < smoothWheelThreshold) return;
      direction = wheelAccumulatorRef.current > 0 ? 1 : -1;
      wheelAccumulatorRef.current -= direction * smoothWheelThreshold;
    }

    const currentIndex = wheelIndexRef.current >= 0
      ? wheelIndexRef.current
      : browseOrder.findIndex(card => card.id === focusedCardId);
    const normalizedCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = Math.min(
      browseOrder.length - 1,
      Math.max(0, normalizedCurrentIndex + direction),
    );

    if (nextIndex === normalizedCurrentIndex) return;

    wheelIndexRef.current = nextIndex;
    onFocusCard(browseOrder[nextIndex]);
  };

  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;

    deck.addEventListener('wheel', handleWheel, { passive: false });
    return () => deck.removeEventListener('wheel', handleWheel);
  }, [browseOrder, focusedCardId, onFocusCard]);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (
      !event.isPrimary
      || (event.pointerType !== 'touch' && event.pointerType !== 'pen')
      || browseOrder.length < 2
      || isAutoRolling
    ) return;

    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, video, [role="slider"], .ReactCrop')) return;

    touchDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      accumulatedX: 0,
      horizontal: false,
      moved: false,
    };
    setIsTouchDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = touchDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const totalX = event.clientX - drag.startX;
    const totalY = event.clientY - drag.startY;
    if (!drag.horizontal) {
      if (Math.max(Math.abs(totalX), Math.abs(totalY)) < 10) return;
      if (Math.abs(totalY) > Math.abs(totalX)) {
        touchDragRef.current = null;
        setIsTouchDragging(false);
        return;
      }
      drag.horizontal = true;
    }

    event.preventDefault();
    drag.moved = true;
    drag.accumulatedX += event.clientX - drag.lastX;
    drag.lastX = event.clientX;

    const cardStep = 42;
    while (Math.abs(drag.accumulatedX) >= cardStep) {
      // Cards peeking on the side move toward the finger: dragging right
      // brings the next card from the left into focus, and vice versa.
      const direction: 1 | -1 = drag.accumulatedX > 0 ? 1 : -1;
      const currentIndex = wheelIndexRef.current >= 0
        ? wheelIndexRef.current
        : browseOrder.findIndex(card => card.id === focusedCardId);
      const normalizedCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = Math.min(
        browseOrder.length - 1,
        Math.max(0, normalizedCurrentIndex + direction),
      );

      if (nextIndex === normalizedCurrentIndex) {
        drag.accumulatedX = 0;
        break;
      }

      wheelIndexRef.current = nextIndex;
      onFocusCard(browseOrder[nextIndex]);
      drag.accumulatedX -= direction * cardStep;
    }
  };

  const finishPointerDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = touchDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    touchDragRef.current = null;
    setIsTouchDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!drag.moved) return;
    suppressTouchClickRef.current = true;
    if (suppressTouchClickTimerRef.current !== null) {
      window.clearTimeout(suppressTouchClickTimerRef.current);
    }
    suppressTouchClickTimerRef.current = window.setTimeout(() => {
      suppressTouchClickRef.current = false;
      suppressTouchClickTimerRef.current = null;
    }, 300);
  };

  return (
    <section
      ref={deckRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      onClickCapture={(event) => {
        if (!suppressTouchClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressTouchClickRef.current = false;
      }}
      className={`creation-deck mx-auto flex min-h-0 w-full max-w-[62rem] flex-col ${fillAvailable ? 'flex-1' : 'shrink-0'}`}
      aria-label="Current creations"
      aria-description={browseOrder.length > 1
        ? focusedBrowseIndex >= 0
          ? `Creation ${focusedBrowseIndex + 1} of ${browseOrder.length}. Scroll while hovering or swipe left and right to browse.`
          : `${browseOrder.length} creations. Scroll while hovering or swipe left and right to browse.`
        : undefined}
    >
      <div className={`creation-deck-scene relative grid w-full ${fillAvailable ? 'flex-1' : ''} ${
        cards.length > 0 ? 'creation-deck-scene-has-cards' : ''
      } ${
        cards.length > 1 ? 'creation-deck-scene-has-stack' : ''
      }`}>
        <div
          className={`creation-deck-workspace col-start-1 row-start-1 flex min-w-0 items-center justify-center transition-[opacity,transform] ${
            focusedCardId === null ? 'creation-deck-workspace-focused' : 'creation-deck-workspace-hidden'
          }`}
          aria-hidden={focusedCardId !== null}
        >
          {focusedCardId === null ? children : null}
        </div>

        {cards.map((card) => {
          const focused = card.id === focusedCardId;
          const cardBrowseIndex = browseIndexById.get(card.id) ?? 0;
          const side = focusedBrowseIndex < 0 || cardBrowseIndex > focusedBrowseIndex
            ? 'left'
            : 'right';
          const distance = focusedBrowseIndex < 0
            ? cardBrowseIndex
            : Math.max(0, Math.abs(cardBrowseIndex - focusedBrowseIndex) - 1);
          const showWorkspace = focused && card.status === 'completed' && openCardId === card.id;
          const canActivate = !focused || (card.status === 'completed' && !showWorkspace);
          const activateCard = () => {
            if (focused) onOpenCard(card);
            else onFocusCard(card);
          };
          const stackStyle = {
            '--creation-stack-distance': String(distance),
            zIndex: focused ? 100 : Math.max(1, 80 - distance),
          } as React.CSSProperties;

          return (
            <div
              key={card.id}
              onClick={canActivate ? activateCard : undefined}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (canActivate && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  activateCard();
                }
              }}
              className={`creation-deck-layer col-start-1 row-start-1 flex min-w-0 items-center justify-center border-0 bg-transparent p-0 text-left ${
                focused
                  ? 'creation-deck-layer-focused'
                  : `creation-deck-layer-stacked creation-deck-layer-${side}`
              }`}
              style={stackStyle}
              role={canActivate ? 'button' : undefined}
              aria-label={canActivate
                ? focused
                  ? `Open completed ${card.type}`
                  : `Focus ${card.status} ${card.type}`
                : undefined}
              tabIndex={canActivate ? 0 : -1}
            >
              {showWorkspace ? children : (
                <div className="creation-card-shell flex w-full flex-col items-center gap-3">
                  <CreationCardFace card={card} focused={focused} />
                  <span className="creation-card-action-spacer h-10" aria-hidden="true" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default CreationDeck;
