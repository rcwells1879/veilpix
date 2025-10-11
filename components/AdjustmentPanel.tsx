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

const AdjustmentPanel: React.FC<AdjustmentPanelProps> = ({ onApplyAdjustment, onApplyAspectRatio, isLoading, apiProvider = 'nano-banana' }) => {
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string | null>(null);

  // All aspect ratios
  const allAspectRatios = [
    { name: '1:1 Square', file: 'transparent-1-1.png', description: 'Instagram Posts, Profile Pictures' },
    { name: '16:9 Widescreen', file: 'transparent-16-9.png', description: 'YouTube Thumbnails, Presentations' },
    { name: '4:3 Standard', file: 'transparent-4-3.png', description: 'Classic Photos, Traditional Displays' },
    { name: '21:9 Ultrawide', file: 'transparent-21-9.png', description: 'Cinematic, Banner Images' },
    { name: '9:16 Vertical', file: 'transparent-9-16.png', description: 'Instagram Stories, TikTok' },
    { name: '3:4 Portrait', file: 'transparent-3-4.png', description: 'Vertical Photos, Posters' },
    { name: '2:3 Classic', file: 'transparent-2-3.png', description: 'Traditional Portrait Format' },
    { name: '3:2 Photography', file: 'transparent-3-2.png', description: 'DSLR Standard Format' },
  ];

  // SeeDream supported aspect ratios (only 5 formats)
  const seedreamSupportedFiles = [
    'transparent-1-1.png',    // square_hd
    'transparent-16-9.png',   // landscape_16_9
    'transparent-4-3.png',    // landscape_4_3
    'transparent-9-16.png',   // portrait_9_16
    'transparent-3-4.png'     // portrait_3_4
  ];

  // Filter aspect ratios based on provider
  const aspectRatios = apiProvider === 'seedream'
    ? allAspectRatios.filter(ratio => seedreamSupportedFiles.includes(ratio.file))
    : allAspectRatios;

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

      {/* Always-Visible Aspect Ratio Selector */}
      <div className="bg-gray-900/50 border border-gray-600 rounded-lg p-4">
        <h4 className="text-md font-semibold text-gray-300 mb-3">Select Aspect Ratio</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {aspectRatios.map(ratio => (
            <button
              key={ratio.file}
              onClick={() => handleAspectRatioSelect(ratio.file)}
              disabled={isLoading}
              className={`w-full text-left bg-white/5 border border-gray-600 rounded-lg p-3 transition-all duration-200 ease-in-out hover:bg-white/10 hover:border-white/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedAspectRatio === ratio.file ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-blue-500 bg-white/10' : ''
              }`}
            >
              <div className="font-semibold text-gray-200 text-sm">{ratio.name}</div>
              <div className="text-xs text-gray-400 mt-1">{ratio.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Apply Button */}
      {(customPrompt.trim() || selectedAspectRatio) && (
        <div className="animate-fade-in flex flex-col gap-4 pt-2">
          <button
            onClick={handleApply}
            className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
            disabled={isLoading || (!customPrompt.trim() && !selectedAspectRatio)}
          >
            {selectedAspectRatio ? 'Apply Aspect Ratio' : 'Apply Adjustment'}
          </button>
        </div>
      )}
    </div>
  );
};

export default AdjustmentPanel;
