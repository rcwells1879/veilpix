/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useMutation } from '@tanstack/react-query'
import { useApiClient } from '../services/apiClient'

export interface CheckoutSessionResponse {
  sessionId: string
  url: string
}

export interface CreateCheckoutSessionRequest {
  successUrl?: string
  cancelUrl?: string
}

export interface CreateSubscriptionCheckoutRequest extends CreateCheckoutSessionRequest {
  // Additional subscription-specific fields can be added here
}

// Hook for creating setup checkout sessions (for adding payment methods)
export function useCreateCheckoutSession() {
  const { apiRequest } = useApiClient()
  
  return useMutation({
    mutationFn: async (data: CreateCheckoutSessionRequest): Promise<CheckoutSessionResponse> => {
      return await apiRequest<CheckoutSessionResponse>('/api/checkout/create-checkout-session', {
        method: 'POST',
        requiresAuth: true,
        body: JSON.stringify({
          successUrl: data.successUrl,
          cancelUrl: data.cancelUrl
        })
      })
    }
  })
}

// Hook for creating subscription checkout sessions
export function useCreateSubscriptionCheckout() {
  const { apiRequest } = useApiClient()
  
  return useMutation({
    mutationFn: async (data: CreateSubscriptionCheckoutRequest): Promise<CheckoutSessionResponse> => {
      return await apiRequest<CheckoutSessionResponse>('/api/checkout/create-subscription-checkout', {
        method: 'POST',
        requiresAuth: true,
        body: JSON.stringify({
          successUrl: data.successUrl,
          cancelUrl: data.cancelUrl
        })
      })
    }
  })
}

// Hook for creating customer portal sessions
export function useCreatePortalSession() {
  const { apiRequest } = useApiClient()
  
  return useMutation({
    mutationFn: async (returnUrl?: string): Promise<{ url: string }> => {
      return await apiRequest<{ url: string }>('/api/checkout/create-portal-session', {
        method: 'POST',
        requiresAuth: true,
        body: JSON.stringify({
          returnUrl: returnUrl || window.location.origin
        })
      })
    }
  })
}

// Utility function to redirect to Stripe
export const redirectToStripe = (url: string) => {
  window.location.href = url
}