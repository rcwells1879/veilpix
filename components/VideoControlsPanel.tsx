/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { VideoIcon } from './icons';

interface VideoControlsPanelProps {
  isLoading: boolean;
  onGenerate: (prompt: string, duration: number, resolution: string) => void;
  videoUrl?: string | null;
  videoError?: string | null;
}

const durations = [5, 10, 15] as const;
type Duration = typeof durations[number];

const resolutions = ['720p', '1080p'] as const;
type Resolution = typeof resolutions[number];

const VideoControlsPanel: React.FC<VideoControlsPanelProps> = ({ isLoading, onGenerate, videoUrl, videoError }) => {
  const [videoPrompt, setVideoPrompt] = useState('');
  const [selectedDuration, setSelectedDuration] = useState<Duration>(5);
  const [selectedResolution, setSelectedResolution] = useState<Resolution>('1080p');

  const handleGenerate = () => {
    if (videoPrompt.trim()) {
      onGenerate(videoPrompt.trim(), selectedDuration, selectedResolution);
    }
  };

  return (
    <div className="w-full flex flex-col gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <VideoIcon className="w-6 h-6 text-blue-400" />
        <h3 className="text-lg font-semibold text-gray-200">Image-to-Video Generation</h3>
      </div>

      {/* Video result player */}
      {videoUrl && (
        <div className="w-full rounded-xl overflow-hidden bg-black/20 shadow-lg">
          <video
            src={videoUrl}
            controls
            autoPlay
            loop
            className="w-full max-h-[50vh] object-contain"
          />
          <div className="flex items-center justify-between px-4 py-2 bg-black/40">
            <span className="text-sm text-gray-400">Generated Video</span>
            <a
              href={videoUrl}
              download={`veilpix-video-${Date.now()}.mp4`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-semibold"
            >
              Download
            </a>
          </div>
        </div>
      )}

      {/* Error display */}
      {videoError && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg">
          <p className="text-sm text-red-300">{videoError}</p>
        </div>
      )}

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
          maxLength={5000}
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
              {d}s
            </button>
          ))}
        </div>
      </div>

      {/* Resolution selector */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-gray-300">Resolution</label>
        <div className="flex gap-2">
          {resolutions.map((r) => (
            <button
              key={r}
              onClick={() => setSelectedResolution(r)}
              className={`flex-1 py-2.5 px-4 rounded-md font-semibold text-sm transition-all duration-200 ${
                selectedResolution === r
                  ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg'
                  : 'bg-white/10 border border-white/20 text-gray-300 hover:bg-white/20 hover:text-white'
              }`}
              disabled={isLoading}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isLoading || !videoPrompt.trim()}
        className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
      >
        {isLoading ? 'Generating Video...' : 'Generate Video'}
      </button>

      {/* Info box */}
      {isLoading && (
        <div className="bg-black/20 p-4 rounded-lg border border-gray-700/50 flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-cyan-400 animate-spin" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
          </div>
          <div className="text-sm text-gray-400">
            <p className="font-semibold text-gray-300 mb-1">Generating your video...</p>
            <p>Video generation typically takes 1-3 minutes. Please wait while the AI creates your video.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoControlsPanel;
