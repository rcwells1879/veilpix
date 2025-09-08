/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react'
import { AddPaymentMethodButton } from './PaymentButton'

interface PaymentCancelledProps {
  onClose: () => void
  onRetry?: () => void
}

export const PaymentCancelled: React.FC<PaymentCancelledProps> = ({ onClose, onRetry }) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full mx-4 animate-fade-in">
        <div className="text-center">
          {/* Cancel Icon */}
          <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-white mb-3">Payment Cancelled</h2>
          <p className="text-gray-300 mb-6">
            No worries! Your payment was cancelled and no charges were made. You can try again anytime.
          </p>

          <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Current Limits:</h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• 20 free generations for anonymous users</li>
              <li>• Unlimited generations with payment method</li>
              <li>• Only $0.07 per generation</li>
            </ul>
          </div>

          <div className="space-y-3">
            {onRetry && (
              <AddPaymentMethodButton
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200"
                onSuccess={() => {
                  onClose()
                }}
              >
                Try Again
              </AddPaymentMethodButton>
            )}
            
            <button
              onClick={onClose}
              className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Continue with Free Account
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}