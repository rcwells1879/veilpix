/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { useCreditPackages, useCreateCreditCheckout, redirectToStripe } from '../src/hooks/useStripeCheckout'
import { useUsageStats } from '../src/hooks/useImageGeneration'
import AuthRequiredModal from './AuthRequiredModal'

interface PricingModalProps {
  isOpen: boolean
  onClose: () => void
}

export const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose }) => {
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showAuthRequired, setShowAuthRequired] = useState(false)

  const { isSignedIn, isLoaded } = useUser()
  const { data: packagesData, isLoading: packagesLoading } = useCreditPackages()
  const { data: usageStats } = useUsageStats()
  const createCheckout = useCreateCreditCheckout()

  if (!isOpen) return null

  const handlePurchase = async (packageType: '50_credits' | '100_credits' | '200_credits') => {
    if (isProcessing) return

    // Check if user is signed in
    if (!isLoaded || !isSignedIn) {
      setShowAuthRequired(true)
      return
    }

    setIsProcessing(true)
    setSelectedPackage(packageType)

    try {
      const result = await createCheckout.mutateAsync({
        packageType,
        successUrl: window.location.href,
        cancelUrl: window.location.href
      })

      redirectToStripe(result.url)
    } catch (error: any) {
      console.error('Failed to create checkout session:', error)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setIsProcessing(false)
      setSelectedPackage(null)
    }
  }

  const packages = packagesData?.packages || {}

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-fade-in">
        {/* Header */}
        <div className="relative p-8 pb-6">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="text-center">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent mb-2">
              Get More Credits
            </h2>
            <p className="text-gray-400 text-lg">
              You have <span className="text-white font-semibold">{usageStats?.creditsRemaining || 0}</span> credits remaining
            </p>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="px-8 pb-8">
          {packagesLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-3 text-gray-300">Loading pricing options...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.entries(packages).map(([packageType, pkg]) => {
                const isSelected = selectedPackage === packageType
                const isPopular = pkg.popular
                const costPerCredit = (pkg.priceUsd / pkg.credits).toFixed(3)

                return (
                  <div
                    key={packageType}
                    className={`relative bg-gray-800/60 border-2 rounded-xl p-6 transition-all duration-300 hover:scale-105 ${
                      isPopular 
                        ? 'border-gradient-to-r from-purple-500 to-pink-500 bg-gradient-to-br from-purple-500/10 to-pink-500/10'
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
                          Best Value
                        </span>
                      </div>
                    )}

                    <div className="text-center">
                      <h3 className="text-xl font-bold text-white mb-2">{pkg.name}</h3>
                      <p className="text-gray-400 text-sm mb-4">{pkg.description}</p>
                      
                      <div className="mb-6">
                        <span className="text-3xl font-bold text-white">${pkg.priceUsd}</span>
                        <div className="text-sm text-gray-400 mt-1">
                          ${costPerCredit}/credit
                        </div>
                      </div>

                      <div className="space-y-3 mb-6">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Credits</span>
                          <span className="text-white font-semibold">{pkg.credits}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Valid</span>
                          <span className="text-white font-semibold">Forever</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Per Image</span>
                          <span className="text-white font-semibold">1 Credit</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handlePurchase(packageType as '50_credits' | '100_credits' | '200_credits')}
                        disabled={isProcessing}
                        className={`w-full py-3 px-6 rounded-lg font-semibold transition-all duration-300 ${
                          isPopular
                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-500/25'
                            : 'bg-gray-700 hover:bg-gray-600 text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed ${
                          isSelected ? 'animate-pulse' : ''
                        }`}
                      >
                        {isSelected ? (
                          <div className="flex items-center justify-center space-x-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Processing...</span>
                          </div>
                        ) : (
                          'Purchase Credits'
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-gray-400 text-sm">
              Secure payment powered by Stripe • Credits never expire • No recurring charges
            </p>
          </div>
        </div>
      </div>

      {/* Auth Required Modal */}
      <AuthRequiredModal
        isOpen={showAuthRequired}
        onClose={() => setShowAuthRequired(false)}
      />
    </div>
  )
}