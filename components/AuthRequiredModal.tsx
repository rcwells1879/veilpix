/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { SignInButton, SignUpButton } from '@clerk/clerk-react';
import { LogInIcon, UserPlusIcon, CreditCardIcon } from './icons';

interface AuthRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthRequiredModal: React.FC<AuthRequiredModalProps> = ({ isOpen, onClose }) => {
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
          <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full mx-auto mb-6">
            <CreditCardIcon className="w-8 h-8 text-white" />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-100 mb-3">
            Sign In to Purchase Credits
          </h2>

          {/* Subtitle */}
          <p className="text-gray-300 mb-8 leading-relaxed">
            You need to be signed in to purchase credits. Choose an option below to continue with your purchase.
          </p>

          {/* Auth Buttons */}
          <div className="space-y-4">
            {/* Sign In Button */}
            <SignInButton mode="modal">
              <button className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gray-700 hover:bg-gray-600 rounded-xl transition-all duration-300 ease-in-out shadow-lg hover:shadow-xl hover:-translate-y-px active:scale-95 group border border-gray-600">
                <LogInIcon className="w-5 h-5 text-blue-400 transition-transform group-hover:scale-110" />
                <span className="text-white font-bold text-lg">Sign In</span>
              </button>
            </SignInButton>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-gray-900 px-2 text-gray-400">or</span>
              </div>
            </div>

            {/* Sign Up Button */}
            <SignUpButton mode="modal">
              <button className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl transition-all duration-300 ease-in-out shadow-lg shadow-purple-500/20 hover:shadow-xl hover:shadow-purple-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner group">
                <UserPlusIcon className="w-5 h-5 text-white transition-transform group-hover:scale-110" />
                <span className="text-white font-bold text-lg">Create Account</span>
              </button>
            </SignUpButton>
          </div>

          {/* Info note */}
          <p className="text-xs text-gray-500 mt-6 leading-relaxed">
            New users get 30 free credits! No payment method required for signup.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthRequiredModal;
