/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';

interface AdjustmentPanelProps {
  onApplyAdjustment: (prompt: string) => void;
  isLoading: boolean;
  imageCreditCost?: number;
}

const AdjustmentPanel: React.FC<AdjustmentPanelProps> = ({ onApplyAdjustment, isLoading, imageCreditCost = 1 }) => {
  const [customPrompt, setCustomPrompt] = useState('');
  const imageCreditLabel = `${imageCreditCost} ${imageCreditCost === 1 ? 'credit' : 'credits'}`;

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomPrompt(e.target.value);
  };

  const handleApply = () => {
    const prompt = customPrompt.trim();
    if (prompt) onApplyAdjustment(prompt);
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
        disabled={isLoading || !customPrompt.trim()}
      >
        {isLoading ? `Applying... (${imageCreditLabel})` : `Apply Adjustment - ${imageCreditLabel}`}
      </button>
    </div>
  );
};

export default AdjustmentPanel;
