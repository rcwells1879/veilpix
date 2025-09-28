/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { SignUpButton } from '@clerk/clerk-react';
import { UserPlusIcon, GiftIcon, ShieldCheckIcon } from './icons';

interface SignupPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SignupPromptModal: React.FC<SignupPromptModalProps> = ({ isOpen, onClose }) => {
  console.log('🎭 SignupPromptModal render:', { isOpen });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-gray-600/50 shadow-2xl shadow-black/50 w-full max-w-md animate-fade-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-700/50 hover:bg-gray-600/50 transition-colors group"
          aria-label="Close modal"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 group-hover:text-white transition-colors" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Content */}
        <div className="p-8 text-center">
          {/* Icon */}
          <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#E04F67] to-[#DC2626] rounded-full mx-auto mb-6">
            <GiftIcon className="w-8 h-8 text-white" />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-100 mb-3">
            Get 30 Free Credits!
          </h2>

          {/* Subtitle */}
          <p className="text-gray-300 mb-6 leading-relaxed">
            Sign up now and receive <span className="text-[#E04F67] font-semibold">30 free credits</span> to start editing your photos with AI. No payment method required!
          </p>

          {/* Benefits */}
          <div className="space-y-3 mb-8">
            <div className="flex items-center gap-3 text-left">
              <div className="flex-shrink-0 w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-gray-300 text-sm">Credits never expire</span>
            </div>

            <div className="flex items-center gap-3 text-left">
              <div className="flex-shrink-0 w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-gray-300 text-sm">No payment method required</span>
            </div>

            <div className="flex items-center gap-3 text-left">
              <div className="flex-shrink-0 w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center">
                <ShieldCheckIcon className="w-3 h-3 text-green-400" />
              </div>
              <span className="text-gray-300 text-sm">No tracking, no cookies, no personal data stored</span>
            </div>
          </div>

          {/* Sign up button */}
          <SignUpButton mode="modal">
            <button className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-br from-[#E04F67] to-[#DC2626] hover:from-[#DC2626] hover:to-[#B91C1C] rounded-xl transition-all duration-300 ease-in-out shadow-lg shadow-[#E04F67]/20 hover:shadow-xl hover:shadow-[#E04F67]/40 hover:-translate-y-px active:scale-95 active:shadow-inner group">
              <UserPlusIcon className="w-5 h-5 text-white transition-transform group-hover:scale-110" />
              <span className="text-white font-bold text-lg">Get Started Free</span>
            </button>
          </SignUpButton>

          {/* Privacy note */}
          <p className="text-xs text-gray-500 mt-4 leading-relaxed">
            Your privacy matters. VeilPix processes images temporarily and never stores your personal photos or data.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignupPromptModal;