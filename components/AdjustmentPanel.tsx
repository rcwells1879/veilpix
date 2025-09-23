/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';

interface AdjustmentPanelProps {
  onApplyAdjustment: (prompt: string) => void;
  onApplyAspectRatio: (aspectRatio: string, customPrompt: string) => void;
  isLoading: boolean;
}

const AdjustmentPanel: React.FC<AdjustmentPanelProps> = ({ onApplyAdjustment, onApplyAspectRatio, isLoading }) => {
  const [selectedPresetPrompt, setSelectedPresetPrompt] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [showAspectRatioSelector, setShowAspectRatioSelector] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string | null>(null);

  const presets = [
    { name: 'Blur Background', prompt: 'Apply a realistic depth-of-field effect, making the background blurry while keeping the main subject in sharp focus.' },
    { name: 'Enhance Details', prompt: 'Slightly enhance the sharpness and details of the image without making it look unnatural.' },
    { name: 'Warmer Lighting', prompt: 'Adjust the color temperature to give the image warmer, golden-hour style lighting.' },
    { name: 'Studio Light', prompt: 'Add dramatic, professional studio lighting to the main subject.' },
    { name: 'Aspect Ratio', prompt: 'aspect-ratio-button' }, // Special marker for aspect ratio button
  ];

  const aspectRatios = [
    { name: '1:1 Square', file: 'transparent-1-1.png', description: 'Instagram Posts, Profile Pictures' },
    { name: '16:9 Widescreen', file: 'transparent-16-9.png', description: 'YouTube Thumbnails, Presentations' },
    { name: '4:3 Standard', file: 'transparent-4-3.png', description: 'Classic Photos, Traditional Displays' },
    { name: '21:9 Ultrawide', file: 'transparent-21-9.png', description: 'Cinematic, Banner Images' },
    { name: '9:16 Vertical', file: 'transparent-9-16.png', description: 'Instagram Stories, TikTok' },
    { name: '3:4 Portrait', file: 'transparent-3-4.png', description: 'Vertical Photos, Posters' },
    { name: '2:3 Classic', file: 'transparent-2-3.png', description: 'Traditional Portrait Format' },
    { name: '3:2 Photography', file: 'transparent-3-2.png', description: 'DSLR Standard Format' },
  ];

  const activePrompt = selectedPresetPrompt || customPrompt;

  const handlePresetClick = (prompt: string) => {
    if (prompt === 'aspect-ratio-button') {
      setShowAspectRatioSelector(!showAspectRatioSelector);
      setSelectedPresetPrompt(null);
      setSelectedAspectRatio(null);
    } else {
      setSelectedPresetPrompt(prompt);
      setCustomPrompt('');
      setShowAspectRatioSelector(false);
      setSelectedAspectRatio(null);
    }
  };

  const handleAspectRatioSelect = (aspectRatio: string) => {
    setSelectedAspectRatio(aspectRatio);
    setSelectedPresetPrompt(null);
    setCustomPrompt('');
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomPrompt(e.target.value);
    setSelectedPresetPrompt(null);
    setShowAspectRatioSelector(false);
    setSelectedAspectRatio(null);
  };

  const handleApply = () => {
    if (selectedAspectRatio) {
      onApplyAspectRatio(selectedAspectRatio, customPrompt);
    } else if (activePrompt) {
      onApplyAdjustment(activePrompt);
    }
  };

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-center text-gray-300">Apply a Professional Adjustment</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {presets.map(preset => (
          <button
            key={preset.name}
            onClick={() => handlePresetClick(preset.prompt)}
            disabled={isLoading}
            className={`w-full text-center bg-white/10 border border-transparent text-gray-200 font-semibold py-3 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/20 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed ${
              preset.prompt === 'aspect-ratio-button' && showAspectRatioSelector ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-blue-500' :
              selectedPresetPrompt === preset.prompt ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-blue-500' : ''
            }`}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {showAspectRatioSelector && (
        <div className="animate-fade-in bg-gray-900/50 border border-gray-600 rounded-lg p-4">
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
      )}

      <input
        type="text"
        value={customPrompt}
        onChange={handleCustomChange}
        placeholder="Or describe an adjustment (e.g., 'change background to a forest')"
        className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
        disabled={isLoading}
      />

      {(activePrompt || selectedAspectRatio) && (
        <div className="animate-fade-in flex flex-col gap-4 pt-2">
            <button
                onClick={handleApply}
                className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                disabled={isLoading || (!activePrompt?.trim() && !selectedAspectRatio)}
            >
                {selectedAspectRatio ? 'Apply Aspect Ratio' : 'Apply Adjustment'}
            </button>
        </div>
      )}
    </div>
  );
};

export default AdjustmentPanel;
