/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react'
import { useUsageStats } from '../src/hooks/useImageGeneration'
import { useUser } from '@clerk/clerk-react'

interface UsageCounterProps {
  onShowPricing?: () => void
}

export const UsageCounter: React.FC<UsageCounterProps> = ({ onShowPricing }) => {
  const { data: usageStats, isLoading, error } = useUsageStats()
  const { isSignedIn } = useUser()

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2 px-2 py-1 sm:px-3 sm:py-2 bg-gray-800/30 rounded-lg">
        <div className="w-4 h-4 bg-gray-600 rounded animate-pulse"></div>
        <span className="text-gray-400 text-xs sm:text-sm">
          <span className="hidden sm:inline">Loading credits...</span>
          <span className="sm:hidden">Loading...</span>
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center space-x-2 px-2 py-1 sm:px-3 sm:py-2 bg-red-900/20 rounded-lg border border-red-800/30">
        <span className="text-red-400 text-xs sm:text-sm">
          <span className="hidden sm:inline">Credits unavailable</span>
          <span className="sm:hidden">no credits</span>
        </span>
      </div>
    )
  }

  if (!usageStats || !isSignedIn) {
    return (
      <div className="flex items-center space-x-2 px-2 py-1 sm:px-3 sm:py-2 bg-blue-900/20 rounded-lg border border-blue-800/30">
        <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
        <span className="text-blue-300 text-xs sm:text-sm font-medium hidden sm:inline">
          Sign in to start editing
        </span>
      </div>
    )
  }

  const { totalUsage, creditsRemaining, isAuthenticated } = usageStats
  const isLowCredits = creditsRemaining <= 5
  const hasNoCredits = creditsRemaining <= 0

  return (
    <div className="flex items-center space-x-1 sm:space-x-3">
      {/* Credits Remaining */}
      <div className={`flex items-center space-x-2 px-2 py-1 sm:px-3 sm:py-2 rounded-lg border transition-all duration-200 ${
        hasNoCredits
          ? 'bg-red-900/20 border-red-800/30'
          : isLowCredits
          ? 'bg-yellow-900/20 border-yellow-800/30'
          : 'bg-purple-900/20 border-purple-800/30'
      }`}>
        <div className={`w-2 h-2 rounded-full ${
          hasNoCredits
            ? 'bg-red-400'
            : isLowCredits
            ? 'bg-yellow-400 animate-pulse'
            : 'bg-purple-400'
        }`}></div>
        <span className={`text-xs sm:text-sm font-medium ${
          hasNoCredits
            ? 'text-red-300'
            : isLowCredits
            ? 'text-yellow-300'
            : 'text-purple-300'
        }`}>
          {creditsRemaining} {creditsRemaining === 1 ? 'credit' : 'credits'}
        </span>
      </div>

      {/* Buy More Credits Button - Always visible when needed */}
      {(hasNoCredits || isLowCredits) && onShowPricing && (
        <button
          onClick={onShowPricing}
          className={`text-xs px-2 py-1 sm:px-3 sm:py-1.5 font-semibold rounded-lg transition-all duration-200 ${
            hasNoCredits
              ? 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white animate-pulse'
              : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
          }`}
        >
          {hasNoCredits ? 'Buy' : 'Get More'}
        </button>
      )}
    </div>
  )
}