/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type ApiProvider = 'nanobanana2' | 'seedream' | 'nanobananapro' | 'wanimage';
export type Resolution = '1K' | '2K' | '4K';

export interface SettingsState {
  apiProvider: ApiProvider;
  resolution: Resolution;
  nsfwFilterEnabled: boolean;
}

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsState;
  onSettingsChange: (settings: SettingsState) => void;
  hasPurchasedCredits: boolean;
  onShowPricing?: () => void;
}

const SettingsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const MasqueradeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5 .993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4c2.5 3 5.5 5.5 8 6.5 2.5-1 5.5-3.5 8-6.5" />
    <ellipse cx="8.5" cy="10" rx="2.5" ry="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <ellipse cx="15.5" cy="10" rx="2.5" ry="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ isOpen, onClose, settings, onSettingsChange, hasPurchasedCredits, onShowPricing }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showAgeModal, setShowAgeModal] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        // Don't close if the age modal is open
        if (!showAgeModal) {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, showAgeModal]);

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

  const handleNsfwToggle = () => {
    if (!hasPurchasedCredits) {
      // Non-purchasers cannot change the filter at all — show age verification modal
      setShowAgeModal(true);
      return;
    }
    onSettingsChange({
      ...settings,
      nsfwFilterEnabled: !settings.nsfwFilterEnabled
    });
  };

  // Non-purchasers always see the filter as ON (After Dark OFF), regardless of stored state
  const effectiveNsfwFilterEnabled = hasPurchasedCredits ? settings.nsfwFilterEnabled : true;

  return (
    <>
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
                onClick={() => handleProviderChange('nanobanana2')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 ${
                  settings.apiProvider === 'nanobanana2'
                    ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-300'
                    : 'bg-gray-700/50 border-2 border-transparent text-gray-300 hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    settings.apiProvider === 'nanobanana2'
                      ? 'border-blue-500'
                      : 'border-gray-500'
                  }`}>
                    {settings.apiProvider === 'nanobanana2' && (
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold">Nano Banana 2</div>
                    <div className="text-xs text-gray-400">Google Gemini 3.1 Flash</div>
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
                    <div className="font-semibold">SeeDream 4.5</div>
                    <div className="text-xs text-gray-400">ByteDance SeeDream V4.5</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleProviderChange('nanobananapro')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 ${
                  settings.apiProvider === 'nanobananapro'
                    ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-300'
                    : 'bg-gray-700/50 border-2 border-transparent text-gray-300 hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    settings.apiProvider === 'nanobananapro'
                      ? 'border-blue-500'
                      : 'border-gray-500'
                  }`}>
                    {settings.apiProvider === 'nanobananapro' && (
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold">Nano Banana Pro</div>
                    <div className="text-xs text-gray-400">Google Gemini 3 Pro</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleProviderChange('wanimage')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 ${
                  settings.apiProvider === 'wanimage'
                    ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-300'
                    : 'bg-gray-700/50 border-2 border-transparent text-gray-300 hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    settings.apiProvider === 'wanimage'
                      ? 'border-blue-500'
                      : 'border-gray-500'
                  }`}>
                    {settings.apiProvider === 'wanimage' && (
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold">Wan 2.7 Image</div>
                    <div className="text-xs text-gray-400">Wan 2.7 Image Generation</div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Resolution Selection (for SeeDream and Nano Banana Pro) */}
          {(settings.apiProvider === 'nanobanana2' || settings.apiProvider === 'seedream' || settings.apiProvider === 'nanobananapro' || settings.apiProvider === 'wanimage') && (
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
              {settings.apiProvider === 'wanimage' ? '1 credit' : '2 credits'} per image &bull; Changes are saved automatically.
            </p>
          </div>

          {/* NSFW Filter Toggle */}
          <div className="mt-3 pt-3 border-t border-gray-700/50">
            <button
              onClick={handleNsfwToggle}
              className="w-full flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center h-4 px-1 rounded-sm border border-gray-500 text-[11px] font-bold leading-none text-gray-500 group-hover:text-gray-400 group-hover:border-gray-400 transition-colors">
                  <span className="relative top-px">18+</span>
                </span>
                <span className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors">
                  VeilPix After Dark
                </span>
              </div>
              {/* Toggle switch */}
              <div className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${
                !effectiveNsfwFilterEnabled
                  ? 'bg-purple-500/60'
                  : 'bg-gray-600'
              }`}>
                <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-200 ${
                  !effectiveNsfwFilterEnabled
                    ? 'translate-x-[16px]'
                    : 'translate-x-[2px]'
                }`} />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Age Verification Modal - rendered via portal to escape header's backdrop-filter containing block */}
      {showAgeModal && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowAgeModal(false)}>
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl max-w-sm w-full p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <MasqueradeIcon className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100">Age Verification Required</h3>
            </div>

            <p className="text-sm text-gray-300 leading-relaxed">
              Due to legal regulations, the content filter cannot be disabled unless we can verify the age of the user. Age verification is completed automatically when you purchase credits.
            </p>

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setShowAgeModal(false)}
                className="flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm bg-white/10 border border-white/20 text-gray-300 hover:bg-white/20 transition-all duration-200"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowAgeModal(false);
                  onClose();
                  if (onShowPricing) onShowPricing();
                }}
                className="flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm bg-gradient-to-br from-purple-600 to-pink-600 text-white shadow-lg hover:shadow-xl hover:-translate-y-px transition-all duration-200 active:scale-95"
              >
                Purchase Credits
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default SettingsMenu;
