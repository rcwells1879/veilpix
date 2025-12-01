/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';

interface AdjustmentPanelProps {
  onApplyAdjustment: (prompt: string) => void;
  onApplyAspectRatio: (aspectRatio: string, customPrompt: string) => void;
  isLoading: boolean;
  apiProvider?: string;
}

const AdjustmentPanel: React.FC<AdjustmentPanelProps> = ({ onApplyAdjustment, onApplyAspectRatio, isLoading, apiProvider = 'gemini' }) => {
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string | null>(null);

  // All PNG-based aspect ratios (for Gemini and SeeDream)
  const pngAspectRatios = [
    { name: '1:1 Square', value: 'transparent-1-1.png', description: 'Instagram Posts, Profile Pictures' },
    { name: '16:9 Widescreen', value: 'transparent-16-9.png', description: 'YouTube Thumbnails, Presentations' },
    { name: '4:3 Standard', value: 'transparent-4-3.png', description: 'Classic Photos, Traditional Displays' },
    { name: '21:9 Ultrawide', value: 'transparent-21-9.png', description: 'Cinematic, Banner Images' },
    { name: '9:16 Vertical', value: 'transparent-9-16.png', description: 'Instagram Stories, TikTok' },
    { name: '3:4 Portrait', value: 'transparent-3-4.png', description: 'Vertical Photos, Posters' },
    { name: '2:3 Classic', value: 'transparent-2-3.png', description: 'Traditional Portrait Format' },
    { name: '3:2 Photography', value: 'transparent-3-2.png', description: 'DSLR Standard Format' },
  ];

  // SeeDream supported aspect ratios (only 5 formats)
  const seedreamSupportedValues = [
    'transparent-1-1.png',    // square_hd
    'transparent-16-9.png',   // landscape_16_9
    'transparent-4-3.png',    // landscape_4_3
    'transparent-9-16.png',   // portrait_9_16
    'transparent-3-4.png'     // portrait_3_4
  ];

  // Nano Banana Pro aspect ratios - uses direct ratio strings (all 10 supported)
  const nanoBananaProAspectRatios = [
    { name: '1:1 Square', value: '1:1', description: 'Instagram Posts, Profile Pictures' },
    { name: '4:5 Portrait', value: '4:5', description: 'Instagram Portrait' },
    { name: '5:4 Landscape', value: '5:4', description: 'Album Format' },
    { name: '16:9 Widescreen', value: '16:9', description: 'YouTube, Presentations' },
    { name: '9:16 Vertical', value: '9:16', description: 'Stories, TikTok' },
    { name: '4:3 Standard', value: '4:3', description: 'Classic Photos' },
    { name: '3:4 Portrait', value: '3:4', description: 'Vertical Standard' },
    { name: '2:3 Classic', value: '2:3', description: 'Traditional Portrait' },
    { name: '3:2 Photography', value: '3:2', description: 'DSLR Format' },
    { name: '21:9 Ultrawide', value: '21:9', description: 'Cinematic, Banners' },
  ];

  // Select aspect ratios based on provider
  const aspectRatios = apiProvider === 'nanobananapro'
    ? nanoBananaProAspectRatios
    : apiProvider === 'seedream'
      ? pngAspectRatios.filter(ratio => seedreamSupportedValues.includes(ratio.value))
      : pngAspectRatios;

  const handleAspectRatioSelect = (aspectRatio: string) => {
    setSelectedAspectRatio(aspectRatio);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomPrompt(e.target.value);
  };

  const handleApply = () => {
    if (selectedAspectRatio) {
      onApplyAspectRatio(selectedAspectRatio, customPrompt);
    } else if (customPrompt.trim()) {
      onApplyAdjustment(customPrompt);
    }
  };

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
      {/* Prompt Input at Top */}
      <input
        type="text"
        value={customPrompt}
        onChange={handleCustomChange}
        placeholder="Describe an adjustment (e.g., 'change background to a forest')"
        className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:cursor-not-allowed disabled:opacity-60 text-base"
        disabled={isLoading}
      />

      {/* Apply Button */}
      <button
        onClick={handleApply}
        className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
        disabled={isLoading || (!customPrompt.trim() && !selectedAspectRatio)}
      >
        Apply Adjustment
      </button>

      {/* Always-Visible Aspect Ratio Selector */}
      <div className="bg-gray-900/50 border border-gray-600 rounded-lg p-4">
        <h4 className="text-md font-semibold text-gray-300 mb-3">Select Aspect Ratio</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {aspectRatios.map(ratio => (
            <button
              key={ratio.value}
              onClick={() => handleAspectRatioSelect(ratio.value)}
              disabled={isLoading}
              className={`w-full text-left bg-white/5 border border-gray-600 rounded-lg p-3 transition-all duration-200 ease-in-out hover:bg-white/10 hover:border-white/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedAspectRatio === ratio.value ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-blue-500 bg-white/10' : ''
              }`}
            >
              <div className="font-semibold text-gray-200 text-sm">{ratio.name}</div>
              <div className="text-xs text-gray-400 mt-1">{ratio.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdjustmentPanel;
