/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { SignInButton, SignUpButton, SignOutButton, useUser, useClerk } from '@clerk/clerk-react';
import { UserIcon, LogInIcon, UserPlusIcon, LogOutIcon, SettingsIcon } from './icons';
import { ManageBillingButton } from './PaymentButton';

export const AuthButton: React.FC = () => {
  const { isSignedIn, user, isLoaded } = useUser();
  const { openUserProfile } = useClerk();
  const [showBillingError, setShowBillingError] = useState<string | null>(null);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 animate-pulse">
        <div className="w-5 h-5 bg-gray-600 rounded-full"></div>
      </div>
    );
  }

  if (isSignedIn) {
    return (
      <div className="flex flex-col items-end space-y-2">
        {/* Error Message */}
        {showBillingError && (
          <div className="px-3 py-2 bg-red-900/20 rounded-lg border border-red-800/30">
            <span className="text-red-400 text-xs">{showBillingError}</span>
          </div>
        )}
        
        <div className="flex items-center space-x-2">
          {/* Manage Billing Button */}
          <ManageBillingButton
            className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800/50 hover:bg-gray-700/50 transition-colors duration-200 border border-gray-600/50 group"
            onError={setShowBillingError}
            onSuccess={() => setShowBillingError(null)}
          >
            <SettingsIcon className="w-4 h-4 text-gray-400 group-hover:text-green-400 transition-colors" />
          </ManageBillingButton>

          {/* User Profile Button */}
          <button
            onClick={() => openUserProfile()}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 rounded-full transition-colors duration-200 border border-gray-600/50"
          >
            <div className="w-8 h-8 rounded-full bg-[#E04F67] flex items-center justify-center text-white font-semibold text-sm">
              {user.firstName?.charAt(0) || user.emailAddresses[0]?.emailAddress.charAt(0) || 'U'}
            </div>
            <span className="text-gray-300 text-sm font-medium hidden sm:block">
              {user.firstName || user.emailAddresses[0]?.emailAddress.split('@')[0]}
            </span>
          </button>

          {/* Sign Out Button */}
          <SignOutButton>
            <button className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800/50 hover:bg-gray-700/50 transition-colors duration-200 border border-gray-600/50 group">
              <LogOutIcon className="w-4 h-4 text-gray-400 group-hover:text-red-400 transition-colors" />
            </button>
          </SignOutButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3">
      {/* Sign In Button */}
      <SignInButton mode="modal">
        <button className="flex items-center space-x-2 px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 rounded-full transition-colors duration-200 border border-gray-600/50 group">
          <LogInIcon className="w-4 h-4 text-gray-400 group-hover:text-blue-400 transition-colors" />
          <span className="text-gray-300 text-sm font-medium hidden sm:block">Sign In</span>
        </button>
      </SignInButton>

      {/* Sign Up Button */}
      <SignUpButton mode="modal">
        <button className="flex items-center space-x-2 px-4 py-2 bg-[#E04F67] hover:bg-[#DC2626] rounded-full transition-colors duration-200 group">
          <UserPlusIcon className="w-4 h-4 text-white transition-colors" />
          <span className="text-white text-sm font-medium hidden sm:block">Sign Up</span>
        </button>
      </SignUpButton>
    </div>
  );
};