/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react'
import { useCreateSubscriptionCheckout, useCreatePortalSession, redirectToStripe } from '../src/hooks/useStripeCheckout'
import { useUser } from '@clerk/clerk-react'
import { CreditCardIcon, SettingsIcon } from './icons'

interface PaymentButtonProps {
  variant?: 'setup' | 'portal'
  className?: string
  children?: React.ReactNode
  onSuccess?: () => void
  onError?: (error: string) => void
}

export const PaymentButton: React.FC<PaymentButtonProps> = ({ 
  variant = 'setup', 
  className = '',
  children,
  onSuccess,
  onError 
}) => {
  const { isSignedIn } = useUser()
  const subscriptionCheckout = useCreateSubscriptionCheckout()
  const portalSession = useCreatePortalSession()

  const isLoading = subscriptionCheckout.isPending || portalSession.isPending

  const handleClick = async () => {
    if (!isSignedIn) {
      onError?.('Please sign in to manage billing')
      return
    }

    try {
      if (variant === 'setup') {
        // Create subscription checkout for first-time setup
        const response = await subscriptionCheckout.mutateAsync({
          successUrl: `${window.location.origin}/payment/success`,
          cancelUrl: `${window.location.origin}/payment/cancelled`
        })
        redirectToStripe(response.url)
        onSuccess?.()
      } else {
        // Create customer portal session for billing management
        const response = await portalSession.mutateAsync(window.location.origin)
        redirectToStripe(response.url)
        onSuccess?.()
      }
    } catch (error: any) {
      let message = error?.response?.data?.error || error?.response?.data?.message || error.message || 'Failed to create checkout session'

      // Provide helpful guidance for common errors
      if (message.includes('No payment method found')) {
        message = 'Please add a payment method first to manage billing'
      }

      onError?.(message)
    }
  }

  if (!isSignedIn) {
    return null
  }

  const defaultSetupButton = (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <CreditCardIcon className="w-4 h-4" />
      <span>{isLoading ? 'Loading...' : 'Add Payment Method'}</span>
    </button>
  )

  const defaultPortalButton = (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <SettingsIcon className="w-4 h-4" />
      <span>{isLoading ? 'Loading...' : 'Manage Billing'}</span>
    </button>
  )

  if (children) {
    return (
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={className}
      >
        {children}
      </button>
    )
  }

  return variant === 'setup' ? defaultSetupButton : defaultPortalButton
}

// Specialized components for different use cases
export const AddPaymentMethodButton: React.FC<Omit<PaymentButtonProps, 'variant'>> = (props) => (
  <PaymentButton {...props} variant="setup" />
)

export const ManageBillingButton: React.FC<Omit<PaymentButtonProps, 'variant'>> = (props) => (
  <PaymentButton {...props} variant="portal" />
)