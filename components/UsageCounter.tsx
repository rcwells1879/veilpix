/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react'
import { useUsageStats } from '../src/hooks/useImageGeneration'
import { useUser } from '@clerk/clerk-react'
import { AddPaymentMethodButton } from './PaymentButton'

export const UsageCounter: React.FC = () => {
  const { data: usageStats, isLoading, error } = useUsageStats()
  const { isSignedIn } = useUser()
  const [showPaymentError, setShowPaymentError] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2 px-3 py-2 bg-gray-800/30 rounded-lg">
        <div className="w-4 h-4 bg-gray-600 rounded animate-pulse"></div>
        <span className="text-gray-400 text-sm">Loading usage...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center space-x-2 px-3 py-2 bg-red-900/20 rounded-lg border border-red-800/30">
        <span className="text-red-400 text-sm">Usage unavailable</span>
      </div>
    )
  }

  if (!usageStats) return null

  const { totalUsage, remainingFreeUsage, isAuthenticated } = usageStats

  // Show payment setup button for authenticated users who need to add payment method
  const needsPaymentSetup = isAuthenticated && totalUsage === 0

  return (
    <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3">
      {/* Error Message */}
      {showPaymentError && (
        <div className="w-full sm:w-auto px-3 py-2 bg-red-900/20 rounded-lg border border-red-800/30">
          <span className="text-red-400 text-sm">{showPaymentError}</span>
        </div>
      )}
      
      <div className="flex items-center space-x-3">
        {/* Total Usage Counter */}
        <div className="flex items-center space-x-2 px-3 py-2 bg-gray-800/30 rounded-lg border border-gray-600/30">
          <div className="w-2 h-2 bg-[#E04F67] rounded-full"></div>
          <span className="text-gray-300 text-sm font-medium">
            {totalUsage} generated
          </span>
        </div>

        {/* Free Usage Remaining (for anonymous users) */}
        {!isAuthenticated && typeof remainingFreeUsage === 'number' && (
          <>
            <div className="flex items-center space-x-2 px-3 py-2 bg-blue-900/20 rounded-lg border border-blue-800/30">
              <div className={`w-2 h-2 rounded-full ${
                remainingFreeUsage > 5 ? 'bg-green-400' : 
                remainingFreeUsage > 2 ? 'bg-yellow-400' : 'bg-red-400'
              }`}></div>
              <span className="text-gray-300 text-sm font-medium">
                {remainingFreeUsage} free remaining
              </span>
            </div>
            
            {/* Upgrade prompt for anonymous users */}
            {remainingFreeUsage <= 5 && (
              <div className="text-xs text-gray-400">
                <span>Sign in for unlimited usage!</span>
              </div>
            )}
          </>
        )}

        {/* Payment Setup for New Authenticated Users */}
        {needsPaymentSetup && (
          <AddPaymentMethodButton
            className="text-xs px-3 py-1.5 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-semibold rounded-lg transition-all duration-200"
            onError={setShowPaymentError}
            onSuccess={() => setShowPaymentError(null)}
          />
        )}

        {/* Authenticated User with Payment Method */}
        {isAuthenticated && !needsPaymentSetup && (
          <div className="flex items-center space-x-2 px-3 py-2 bg-green-900/20 rounded-lg border border-green-800/30">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-green-300 text-sm font-medium">
              $0.07 per generation
            </span>
          </div>
        )}
      </div>
    </div>
  )
}