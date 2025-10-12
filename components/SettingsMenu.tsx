/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';

export type ApiProvider = 'gemini' | 'seedream';
export type Resolution = '1K' | '2K' | '4K';

export interface SettingsState {
  apiProvider: ApiProvider;
  resolution: Resolution;
}

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsState;
  onSettingsChange: (settings: SettingsState) => void;
}

const SettingsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ isOpen, onClose, settings, onSettingsChange }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleProviderChange = (provider: ApiProvider) => {
    onSettingsChange({
      ...settings,
      apiProvider: provider
    });
  };

  const handleResolutionChange = (resolution: Resolution) => {
    onSettingsChange({
      ...settings,
      resolution
    });
  };

  return (
    <div
      ref={menuRef}
      className="fixed right-[8px] top-16 w-80 max-w-[calc(100vw-2rem)] sm:absolute sm:right-0 sm:top-12 sm:mt-2 bg-gray-800/95 backdrop-blur-md border border-gray-700 rounded-lg shadow-xl z-50 animate-fade-in"
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-700">
          <SettingsIcon className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-gray-100">Settings</h3>
        </div>

        {/* API Provider Selection */}
        <div className="mb-4">  
          <label className="block text-sm font-medium text-gray-300 mb-2">
          </label>
          <div className="space-y-2">
            <button
              onClick={() => handleProviderChange('gemini')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 ${
                settings.apiProvider === 'gemini'
                  ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-300'
                  : 'bg-gray-700/50 border-2 border-transparent text-gray-300 hover:bg-gray-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  settings.apiProvider === 'gemini'
                    ? 'border-blue-500'
                    : 'border-gray-500'
                }`}>
                  {settings.apiProvider === 'gemini' && (
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </div>
                <div>
                  <div className="font-semibold">Nano Banana</div>
                  <div className="text-xs text-gray-400">Google Gemini 2.5 Flash</div>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleProviderChange('seedream')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 ${
                settings.apiProvider === 'seedream'
                  ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-300'
                  : 'bg-gray-700/50 border-2 border-transparent text-gray-300 hover:bg-gray-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  settings.apiProvider === 'seedream'
                    ? 'border-blue-500'
                    : 'border-gray-500'
                }`}>
                  {settings.apiProvider === 'seedream' && (
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </div>
                <div>
                  <div className="font-semibold">SeeDream 4.0</div>
                  <div className="text-xs text-gray-400">ByteDance SeeDream V4</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Resolution Selection (only for SeeDream) */}
        {settings.apiProvider === 'seedream' && (
          <div className="animate-fade-in">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Output Resolution
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['1K', '2K', '4K'] as Resolution[]).map((res) => (
                <button
                  key={res}
                  onClick={() => handleResolutionChange(res)}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                    settings.resolution === res
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {res}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Higher resolutions may take longer to generate
            </p>
          </div>
        )}

        {/* Info Footer */}
        <div className="mt-4 pt-3 border-t border-gray-700">
          <p className="text-xs text-gray-400">
            Both APIs use the same credit system. Changes are saved automatically.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsMenu;
