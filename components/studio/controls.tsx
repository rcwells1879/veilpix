/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Studio UI primitives: glass pills, adaptive dropdowns (popover on desktop,
 * bottom sheet on mobile), aspect-ratio glyphs, option rows, and toggles.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Tracks the `sm` breakpoint so overlays can switch between popover and sheet. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const listener = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return isMobile;
}

/* ------------------------------------------------------------------ */
/* Small inline icons                                                   */
/* ------------------------------------------------------------------ */

export const ChevronIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
  </svg>
);

export const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
  </svg>
);

export const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

export const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* FilePreview - object URL lifecycle for File thumbnails               */
/* ------------------------------------------------------------------ */

export function FilePreview({ file, className }: { file: File; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return null;
  return <img src={url} alt={file.name} className={className} draggable={false} />;
}

/* ------------------------------------------------------------------ */
/* RatioGlyph - the little rectangle showing an aspect ratio            */
/* ------------------------------------------------------------------ */

export const RatioGlyph: React.FC<{ ratio: string; className?: string }> = ({ ratio, className = '' }) => {
  const parts = ratio.split(':').map(Number);
  const isFree = parts.length !== 2 || parts.some((n) => !Number.isFinite(n) || n <= 0);

  let width = 13;
  let height = 13;
  if (!isFree) {
    const [w, h] = parts;
    const scale = 15 / Math.max(w, h);
    width = Math.max(4, Math.round(w * scale));
    height = Math.max(4, Math.round(h * scale));
  }

  return (
    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center ${className}`} aria-hidden="true">
      <span
        className={`rounded-[3px] border-current ${isFree ? 'border border-dashed opacity-80' : 'border-[1.5px]'}`}
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Dropdown - pill trigger; popover on sm+, bottom sheet on mobile      */
/* ------------------------------------------------------------------ */

interface DropdownProps {
  label: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
  badge?: number;
  disabled?: boolean;
  highlighted?: boolean;
  panelWidthClassName?: string;
  align?: 'left' | 'right';
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}

export const Dropdown: React.FC<DropdownProps> = ({
  label,
  icon,
  title,
  badge,
  disabled = false,
  highlighted = false,
  panelWidthClassName = 'sm:w-64',
  align = 'left',
  children,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      // Mobile sheet lives in a portal with its own backdrop; skip ref checks there.
      if (isMobile) return;
      const target = event.target as Element | null;
      // Interactions inside keep-open zones (e.g. the gallery rail) must not close
      // the dropdown — this enables dragging gallery images into reference slots.
      if (target && typeof target.closest === 'function' && target.closest('[data-dropdown-keep-open]')) {
        return;
      }
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, isMobile]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`edge glass-chip flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-gray-200 disabled:cursor-not-allowed disabled:opacity-45 ${
          open || highlighted ? 'glass-chip-active text-white' : ''
        }`}
      >
        {icon && <span className="text-gray-300 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
        <span className="max-w-36 truncate">{label}</span>
        {typeof badge === 'number' && badge > 0 && (
          <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-400/25 px-1 text-[10px] font-bold text-accent-200">
            {badge}
          </span>
        )}
        <ChevronIcon className={`h-3 w-3 text-gray-400 transition-transform duration-200 ${open ? '' : 'rotate-180'}`} />
      </button>

      {open && (isMobile
        ? createPortal(
            <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true">
              <div className="absolute inset-0 bg-black/55" onClick={close} aria-hidden="true" />
              <div
                className="glass-sheet edge absolute inset-x-3 bottom-3 max-h-[70dvh] overflow-y-auto rounded-2xl p-2 animate-fade-in-fast"
                role="menu"
              >
                {typeof children === 'function' ? children(close) : children}
              </div>
            </div>,
            document.body
          )
        : (
          <div
            className={`glass-sheet edge absolute bottom-full z-50 mb-2 max-h-[26rem] overflow-y-auto rounded-2xl p-2 animate-fade-in-fast ${
              align === 'right' ? 'right-0' : 'left-0'
            } ${panelWidthClassName} max-w-[min(92vw,28rem)]`}
            role="menu"
          >
            {typeof children === 'function' ? children(close) : children}
          </div>
        )
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Option rows for dropdown panels                                      */
/* ------------------------------------------------------------------ */

interface OptionRowProps {
  selected: boolean;
  onSelect: () => void;
  label: React.ReactNode;
  sublabel?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  disabled?: boolean;
}

export const OptionRow: React.FC<OptionRowProps> = ({ selected, onSelect, label, sublabel, leading, trailing, disabled = false }) => (
  <button
    type="button"
    role="menuitemradio"
    aria-checked={selected}
    disabled={disabled}
    onClick={onSelect}
    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
      selected ? 'bg-white/10' : 'hover:bg-white/[0.06]'
    }`}
  >
    {leading && <span className="shrink-0 text-gray-300">{leading}</span>}
    <span className="min-w-0 flex-1">
      <span className={`block truncate text-sm font-medium ${selected ? 'text-white' : 'text-gray-200'}`}>{label}</span>
      {sublabel && <span className="block truncate text-xs text-gray-500">{sublabel}</span>}
    </span>
    {trailing && <span className="shrink-0 text-xs text-gray-500">{trailing}</span>}
    <span className="w-4 shrink-0">
      {selected && <CheckIcon className="h-4 w-4 text-accent-300" />}
    </span>
  </button>
);

export const PanelHeading: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div className="flex items-center justify-between px-3 pb-1 pt-2">
    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">{children}</span>
    {action}
  </div>
);

/* ------------------------------------------------------------------ */
/* Segmented control                                                    */
/* ------------------------------------------------------------------ */

interface SegmentedControlProps<T extends string> {
  value: T;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({ value, options, onChange, disabled = false, size = 'md', ariaLabel }: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="edge-mute inline-flex items-center gap-0.5 rounded-full bg-black/30 p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`flex items-center gap-1.5 rounded-full font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-[13px]'
            } ${active ? 'edge bg-white/14 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
          >
            {option.icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{option.icon}</span>}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle row                                                           */
/* ------------------------------------------------------------------ */

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, checked, onChange, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
  >
    <span className="min-w-0">
      <span className="block text-sm font-medium text-gray-200">{label}</span>
      {description && <span className="block text-xs text-gray-500">{description}</span>}
    </span>
    <span
      className={`edge relative h-[22px] w-9 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-accent-500/70' : 'bg-white/10'
      }`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </span>
  </button>
);

/* ------------------------------------------------------------------ */
/* Stepper (e.g. Seedance duration)                                     */
/* ------------------------------------------------------------------ */

interface StepperRowProps {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export const StepperRow: React.FC<StepperRowProps> = ({ label, value, unit = 's', min, max, onChange, disabled = false }) => (
  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
    <span className="text-sm font-medium text-gray-200">{label}</span>
    <span className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="edge glass-chip flex h-8 w-8 items-center justify-center rounded-full text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="mb-0.5 text-lg leading-none">-</span>
      </button>
      <span className="w-12 text-center text-sm font-semibold tabular-nums text-white">
        {value}{unit}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="edge glass-chip flex h-8 w-8 items-center justify-center rounded-full text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="mb-0.5 text-lg leading-none">+</span>
      </button>
    </span>
  </div>
);
