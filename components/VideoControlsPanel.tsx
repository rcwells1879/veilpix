/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { VideoIcon } from './icons';

interface VideoControlsPanelProps {
  isLoading: boolean;
}

const durations = ['4s', '8s', '16s'] as const;
type Duration = typeof durations[number];

const VideoControlsPanel: React.FC<VideoControlsPanelProps> = ({ isLoading }) => {
  const [videoPrompt, setVideoPrompt] = useState('');
  const [selectedDuration, setSelectedDuration] = useState<Duration>('4s');

  return (
    <div className="w-full flex flex-col gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <VideoIcon className="w-6 h-6 text-blue-400" />
          <h3 className="text-lg font-semibold text-gray-200">Image-to-Video Generation</h3>
        </div>
        <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-gradient-to-br from-blue-500/20 to-cyan-400/20 text-cyan-300 border border-cyan-400/30 rounded-full">
          Coming Soon
        </span>
      </div>

      {/* Video description prompt */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-gray-300">Describe your video</label>
        <textarea
          value={videoPrompt}
          onChange={(e) => setVideoPrompt(e.target.value)}
          placeholder="Describe the motion and action you want... (e.g., 'Camera slowly zooms into the landscape while clouds drift across the sky')"
          className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-4 text-base focus:ring-2 focus:ring-blue-500 focus:outline-none transition resize-none"
          rows={3}
          disabled={isLoading}
        />
      </div>

      {/* Duration selector */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-gray-300">Duration</label>
        <div className="flex gap-2">
          {durations.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDuration(d)}
              className={`flex-1 py-2.5 px-4 rounded-md font-semibold text-sm transition-all duration-200 ${
                selectedDuration === d
                  ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg'
                  : 'bg-white/10 border border-white/20 text-gray-300 hover:bg-white/20 hover:text-white'
              }`}
              disabled={isLoading}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Generate button (disabled placeholder) */}
      <button
        disabled
        className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
      >
        Generate Video
      </button>

      {/* Info box */}
      <div className="bg-black/20 p-4 rounded-lg border border-gray-700/50 flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
        </div>
        <div className="text-sm text-gray-400">
          <p className="font-semibold text-gray-300 mb-1">Video generation is coming soon</p>
          <p>Use the reference image above to set the starting frame. When available, AI will animate your image based on your text description.</p>
        </div>
      </div>
    </div>
  );
};

export default VideoControlsPanel;
