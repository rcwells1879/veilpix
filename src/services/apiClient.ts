/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react'
import { useAuth } from '@clerk/clerk-react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

interface ApiRequestOptions extends RequestInit {
  requiresAuth?: boolean
  sessionId?: string
}

class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: any
  ) {
    super(`API Error ${status}: ${statusText}`)
    this.name = 'ApiError'
  }
}

export function createApiClient(getToken?: () => Promise<string | null>, sessionId?: string) {
  async function apiRequest<T>(
    endpoint: string, 
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const { requiresAuth = false, sessionId: requestSessionId, ...fetchOptions } = options
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    }

    // Add authentication header for authenticated requests
    if (requiresAuth && getToken) {
      try {
        const token = await getToken()
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }
      } catch (error) {
        console.error('Failed to get auth token:', error)
        throw new ApiError(401, 'Authentication required')
      }
    }

    // Add session ID for anonymous users
    if (!requiresAuth && (sessionId || requestSessionId)) {
      headers['X-Session-ID'] = sessionId || requestSessionId || ''
    }

    const url = `${API_BASE_URL}${endpoint}`
    
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
      })

      if (!response.ok) {
        let errorData
        try {
          errorData = await response.json()
        } catch {
          errorData = { message: response.statusText }
        }
        throw new ApiError(response.status, response.statusText, errorData)
      }

      // Handle non-JSON responses (like image blobs)
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        return await response.json()
      } else if (contentType?.startsWith('image/')) {
        return await response.blob() as T
      } else {
        return await response.text() as T
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      throw new ApiError(0, 'Network Error', { message: 'Failed to connect to server' })
    }
  }

  return { apiRequest }
}

// Hook to create authenticated API client
export function useApiClient() {
  const { getToken, isSignedIn } = useAuth()
  
  // Generate or retrieve session ID for anonymous users
  const sessionId = React.useMemo(() => {
    if (isSignedIn) return undefined
    
    let id = sessionStorage.getItem('veilpix-session-id')
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem('veilpix-session-id', id)
    }
    return id
  }, [isSignedIn])

  return React.useMemo(() => 
    createApiClient(getToken, sessionId), 
    [getToken, sessionId]
  )
}

export { ApiError }