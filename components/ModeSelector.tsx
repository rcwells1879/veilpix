/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { PhotoIcon, CombineIcon, VideoIcon } from './icons';

export type CreativeMode = 'single' | 'composite' | 'video';

interface ModeSelectorProps {
  activeMode: CreativeMode;
  onModeChange: (mode: CreativeMode) => void;
}

const modes: { key: CreativeMode; line1: string; line2: string; Icon: React.FC<{ className?: string }> }[] = [
  { key: 'single', line1: 'Single', line2: 'Photo', Icon: PhotoIcon },
  { key: 'composite', line1: 'Combine', line2: 'Photos', Icon: CombineIcon },
  { key: 'video', line1: 'Generate', line2: 'Video', Icon: VideoIcon },
];

const ModeSelector: React.FC<ModeSelectorProps> = ({ activeMode, onModeChange }) => {
  return (
    <div className="flex items-center justify-center p-1 bg-black/20 rounded-lg">
      {modes.map(({ key, line1, line2, Icon }) => (
        <button
          key={key}
          onClick={() => onModeChange(key)}
          className={`w-full flex items-center justify-center gap-2 font-semibold py-3 px-2 sm:px-5 rounded-md transition-all duration-200 text-sm sm:text-base whitespace-nowrap ${
            activeMode === key
              ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg'
              : 'text-gray-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Icon className="hidden sm:block w-5 h-5" />
          <span className="flex flex-col sm:flex-row sm:gap-1 leading-tight">
            <span>{line1}</span>
            <span>{line2}</span>
          </span>
        </button>
      ))}
    </div>
  );
};

export default ModeSelector;
