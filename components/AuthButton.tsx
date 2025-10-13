/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { SignInButton, SignUpButton, SignOutButton, useUser, useClerk } from '@clerk/clerk-react';
import { LogInIcon, UserPlusIcon, LogOutIcon } from './icons';

export const AuthButton: React.FC = () => {
  const { isSignedIn, user, isLoaded } = useUser();
  const { openUserProfile } = useClerk();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 animate-pulse">
        <div className="w-5 h-5 bg-gray-600 rounded-full"></div>
      </div>
    );
  }

  if (isSignedIn) {
    return (
      <div className="flex items-center space-x-1 sm:space-x-2">
          {/* User Profile Button */}
          <button
            onClick={() => openUserProfile()}
            className="flex items-center space-x-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-800/50 hover:bg-gray-700/50 rounded-full transition-colors duration-200 border border-gray-600/50"
          >
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#E04F67] flex items-center justify-center text-white font-semibold text-xs sm:text-sm">
              {user.firstName?.charAt(0) || user.emailAddresses[0]?.emailAddress.charAt(0) || 'U'}
            </div>
            <span className="text-gray-300 text-xs sm:text-sm font-medium hidden sm:block">
              {user.firstName || user.emailAddresses[0]?.emailAddress.split('@')[0]}
            </span>
          </button>

          {/* Sign Out Button */}
          <SignOutButton>
            <button className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-800/50 hover:bg-gray-700/50 transition-colors duration-200 border border-gray-600/50 group">
              <LogOutIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 group-hover:text-red-400 transition-colors" />
            </button>
          </SignOutButton>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2 sm:space-x-3">
      {/* Sign In Button */}
      <SignInButton mode="modal">
        <button className="flex items-center space-x-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-800/50 hover:bg-gray-700/50 rounded-full transition-colors duration-200 border border-gray-600/50 group">
          <LogInIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 group-hover:text-blue-400 transition-colors" />
          <span className="text-gray-300 text-xs sm:text-sm font-medium hidden sm:block">Sign In</span>
        </button>
      </SignInButton>

      {/* Sign Up Button */}
      <SignUpButton mode="modal">
        <button className="flex items-center space-x-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-[#E04F67] hover:bg-[#DC2626] rounded-full transition-colors duration-200 group">
          <UserPlusIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white transition-colors" />
          <span className="text-white text-xs sm:text-sm font-medium hidden sm:block">Sign Up</span>
        </button>
      </SignUpButton>
    </div>
  );
};