/*
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

const BLOG_URL = '/veilpix/blog/seedance-2-5-long-form-video/';
const EXIT_DURATION_MS = 500;
let dismissedDuringPageVisit = false;

const SeedanceAnnouncement: React.FC = () => {
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
      aria-labelledby="seedance-announcement-title"
      aria-hidden={!isVisible}
      className={`relative z-[70] mb-2 w-full max-w-[21rem] overflow-hidden rounded-2xl border border-white/10 bg-[#0b1320] p-4 text-left shadow-[0_18px_55px_rgba(0,0,0,0.42)] transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none sm:fixed sm:left-5 sm:top-20 sm:mb-0 sm:w-[23rem] sm:max-w-none sm:rounded-3xl sm:p-5 ${
        isVisible ? 'translate-x-0 opacity-100' : '-translate-x-[calc(100%+2rem)] opacity-0'
      }`}
    >
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <span className="rounded-full border border-accent-300/25 bg-accent-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-accent-300">
              New
            </span>
            <button
              type="button"
              onClick={dismiss}
              tabIndex={isVisible ? 0 : -1}
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-gray-400 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              aria-label="Dismiss Seedance 2.5 announcement"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <p className="mt-4 hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 sm:block">
            Now in VeilPix
          </p>
          <h2 id="seedance-announcement-title" className="mt-3 text-xl font-semibold tracking-tight text-white sm:mt-2 sm:text-2xl">
            Try Seedance 2.5
          </h2>
          <p className="mt-2 text-[13px] leading-5 text-gray-300 sm:mt-3 sm:text-sm sm:leading-6">
            ByteDance&apos;s newest model in VeilPix brings up to 30-second clips, multimodal references, and production-ready MP4 or MOV output.
          </p>

          <a
            href={BLOG_URL}
            tabIndex={isVisible ? 0 : -1}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent-300/25 bg-accent-300/10 px-3.5 py-2 text-[11px] font-semibold text-accent-200 transition hover:border-accent-300/40 hover:bg-accent-300/15 hover:text-white sm:mt-5 sm:px-4 sm:py-2.5 sm:text-xs"
          >
            Read the long-form video guide
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 10h12m-4-4 4 4-4 4" />
            </svg>
          </a>
        </div>
    </aside>
  );
};

export default SeedanceAnnouncement;
