import React, { useState, useRef, useCallback, useEffect } from 'react';

interface BeforeAfterSliderProps {
  beforeImage: string;      // Object URL for "before" image
  afterImage: string;       // Object URL for "after" image
  beforeLabel: string;      // "Original" or "Previous"
  afterLabel: string;       // "Current"
  className?: string;       // Optional container styling
}

const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  beforeImage,
  afterImage,
  beforeLabel,
  afterLabel,
  className = '',
}) => {
  const [sliderPosition, setSliderPosition] = useState(50); // 0-100 percentage
  const [isDragging, setIsDragging] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate position from pointer event
  const calculatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return sliderPosition;

    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    return Math.min(100, Math.max(0, percentage));
  }, [sliderPosition]);

  // Pointer event handlers for unified mouse/touch support
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setShowHint(false);

    // Capture pointer for reliable drag tracking
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const newPosition = calculatePosition(e.clientX);
    setSliderPosition(newPosition);
  }, [calculatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;

    const newPosition = calculatePosition(e.clientX);
    setSliderPosition(newPosition);
  }, [isDragging, calculatePosition]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // Keyboard navigation for accessibility
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    let newPosition = sliderPosition;

    switch (e.key) {
      case 'ArrowLeft':
        newPosition = Math.max(0, sliderPosition - 5);
        break;
      case 'ArrowRight':
        newPosition = Math.min(100, sliderPosition + 5);
        break;
      case 'Home':
        newPosition = 0;
        break;
      case 'End':
        newPosition = 100;
        break;
      default:
        return;
    }

    e.preventDefault();
    setSliderPosition(newPosition);
    setShowHint(false);
  }, [sliderPosition]);

  // Hide hint after a delay if user hasn't interacted
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full select-none ${className}`}
      role="slider"
      aria-label="Image comparison slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(sliderPosition)}
      aria-valuetext={`Showing ${Math.round(sliderPosition)}% of ${beforeLabel} image and ${Math.round(100 - sliderPosition)}% of ${afterLabel} image`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Container for images */}
      <div className="relative w-full overflow-hidden rounded-xl max-h-[60vh]">
        {/* Before image (base layer) */}
        <img
          src={beforeImage}
          alt={beforeLabel}
          className="w-full h-auto object-contain max-h-[60vh] rounded-xl"
          draggable={false}
        />

        {/* After image (overlay with clip-path) */}
        <img
          src={afterImage}
          alt={afterLabel}
          className="absolute top-0 left-0 w-full h-auto object-contain max-h-[60vh] rounded-xl"
          style={{
            clipPath: `inset(0 0 0 ${sliderPosition}%)`,
          }}
          draggable={false}
        />

        {/* Slider handle area - full height for easy dragging */}
        <div
          className="absolute top-0 bottom-0 cursor-ew-resize"
          style={{
            left: `calc(${sliderPosition}% - 20px)`,
            width: '40px',
            touchAction: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Vertical line */}
          <div
            className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white shadow-lg"
            style={{
              transform: 'translateX(-50%)',
              boxShadow: '0 0 10px rgba(0, 0, 0, 0.5), 0 0 20px rgba(59, 130, 246, 0.5)',
            }}
          />

          {/* Circular handle */}
          <div
            className="absolute top-1/2 left-1/2 w-10 h-10 bg-white rounded-full border-2 border-blue-400 shadow-lg flex items-center justify-center"
            style={{
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3), 0 0 20px rgba(59, 130, 246, 0.4)',
            }}
          >
            {/* Arrows icon inside handle */}
            <svg
              className="w-5 h-5 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            </svg>
          </div>
        </div>

        {/* Before label */}
        <div
          className="absolute top-3 left-3 px-3 py-1 bg-gray-900/70 backdrop-blur-sm rounded-md text-sm font-medium text-gray-200 border border-gray-600/50"
          style={{
            opacity: sliderPosition > 10 ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
        >
          {beforeLabel}
        </div>

        {/* After label */}
        <div
          className="absolute top-3 right-3 px-3 py-1 bg-gradient-to-r from-blue-600/80 to-cyan-500/80 backdrop-blur-sm rounded-md text-sm font-medium text-white border border-blue-400/50"
          style={{
            opacity: sliderPosition < 90 ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
        >
          {afterLabel}
        </div>
      </div>

      {/* Hint text */}
      {showHint && (
        <p
          className="text-center text-gray-400 text-sm mt-2 animate-pulse"
          aria-hidden="true"
        >
          Drag to compare
        </p>
      )}
    </div>
  );
};

export default BeforeAfterSlider;
