/*
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

const BLOG_URL = '/veilpix/blog/wan-3-video-generator/';
const EXIT_DURATION_MS = 500;
let dismissedDuringPageVisit = false;

const Wan3Announcement: React.FC = () => {
  const [isMounted, setIsMounted] = useState(!dismissedDuringPageVisit);
  const [isVisible, setIsVisible] = useState(false);
  const exitTimerRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isMounted) return;
    const animationFrame = window.requestAnimationFrame(() => setIsVisible(true));
    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
    };
  }, [isMounted]);

  const dismiss = useCallback(() => {
    dismissedDuringPageVisit = true;
    setIsVisible(false);
    if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = window.setTimeout(() => setIsMounted(false), EXIT_DURATION_MS);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (isVisible && event.target instanceof Node && !panelRef.current?.contains(event.target)) {
        dismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [dismiss, isMounted, isVisible]);

  if (!isMounted) return null;

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-labelledby="wan3-announcement-title"
      aria-hidden={!isVisible}
      className={`relative z-[70] mb-2 w-full max-w-[21rem] overflow-hidden rounded-2xl border border-yellow-300/25 bg-[#10120d] p-4 text-left shadow-[0_18px_60px_rgba(0,0,0,0.46)] transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none sm:fixed sm:left-5 sm:top-20 sm:mb-0 sm:w-[23rem] sm:max-w-none sm:rounded-3xl sm:p-5 ${
        isVisible ? 'translate-x-0 opacity-100' : '-translate-x-[calc(100%+2rem)] opacity-0'
      }`}
    >
      <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-yellow-300/10 blur-3xl" aria-hidden="true" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-300 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-yellow-950 shadow-[0_0_24px_rgba(253,224,71,0.28)]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
              <path d="m12 2.75 2.72 5.51 6.08.88-4.4 4.29 1.04 6.06L12 16.63l-5.44 2.86 1.04-6.06-4.4-4.29 6.08-.88L12 2.75Z" />
            </svg>
            New
          </span>
          <button
            type="button"
            onClick={dismiss}
            tabIndex={isVisible ? 0 : -1}
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-gray-400 transition hover:border-yellow-200/30 hover:bg-yellow-200/10 hover:text-yellow-100"
            aria-label="Dismiss Wan 3.0 announcement"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-yellow-300/80">
          Now flying in VeilPix
        </p>
        <h2 id="wan3-announcement-title" className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
          Meet Wan 3.0!
        </h2>
        <p className="mt-2 text-[13px] leading-5 text-gray-300 sm:mt-3 sm:text-sm sm:leading-6">
          Seedance has some competition. Choose lower-cost Standard or faster Prime, then create with text, frames, images, video, audio, files, or links.
        </p>

        <a
          href={BLOG_URL}
          tabIndex={isVisible ? 0 : -1}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-yellow-300/35 bg-yellow-300/10 px-3.5 py-2 text-[11px] font-bold text-yellow-200 transition hover:border-yellow-200/60 hover:bg-yellow-300/20 hover:text-yellow-50 sm:mt-5 sm:px-4 sm:py-2.5 sm:text-xs"
        >
          See what Wan 3.0 can do
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 10h12m-4-4 4 4-4 4" />
          </svg>
        </a>
      </div>
    </aside>
  );
};

export default Wan3Announcement;
