/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useState } from 'react'
import { useApiClient } from '../src/services/apiClient'
import { useUsageStats } from '../src/hooks/useImageGeneration'
import { queryClient } from '../src/queryClient'

interface PaymentSuccessProps {
  sessionId?: string
  onClose: () => void
}

export const PaymentSuccess: React.FC<PaymentSuccessProps> = ({ sessionId, onClose }) => {
  const [sessionDetails, setSessionDetails] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(!!sessionId)
  const [error, setError] = useState<string | null>(null)
  const { apiRequest } = useApiClient()

  useEffect(() => {
    if (sessionId) {
      fetchSessionDetails()
    }
  }, [sessionId])

  const fetchSessionDetails = async () => {
    try {
      const details = await apiRequest(`/api/checkout/checkout-session/${sessionId}`, {
        requiresAuth: true
      })
      setSessionDetails(details)
      
      // Refresh usage stats to reflect new payment method
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    } catch (error: any) {
      setError(error?.response?.data?.message || 'Failed to load payment details')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full mx-4 animate-fade-in">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-gray-300">Loading payment details...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full mx-4 animate-fade-in">
          <div className="text-center">
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Error Loading Details</h3>
            <p className="text-gray-400 mb-6">{error}</p>
            <button
              onClick={onClose}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full mx-4 animate-fade-in">
        <div className="text-center">
          {/* Success Icon */}
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-white mb-3">Payment Successful!</h2>
          
          {sessionDetails?.metadata?.type === 'setup_payment_method' ? (
            <div>
              <p className="text-gray-300 mb-6">
                Your payment method has been successfully added. You can now generate unlimited images at $0.07 each.
              </p>
              <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
                <div className="text-sm text-gray-400 mb-1">Status</div>
                <div className="text-green-400 font-semibold">Payment Method Added</div>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-gray-300 mb-6">
                Your subscription has been set up successfully. You can now generate unlimited images.
              </p>
              <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
                <div className="text-sm text-gray-400 mb-1">Billing</div>
                <div className="text-green-400 font-semibold">$0.07 per image generation</div>
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200"
          >
            Continue to VeilPix
          </button>
        </div>
      </div>
    </div>
  )
}