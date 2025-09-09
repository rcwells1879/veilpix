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
    
    console.log('🔧 API Client debug:')
    console.log('  - requiresAuth:', requiresAuth)
    console.log('  - sessionId (from client):', sessionId)
    console.log('  - requestSessionId (from options):', requestSessionId)
    console.log('  - getToken function:', typeof getToken)
    
    const headers: HeadersInit = {
      ...fetchOptions.headers,
    }

    // Only set Content-Type if body is not FormData (let browser set it for FormData)
    if (!(fetchOptions.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      console.log('  - Added Content-Type: application/json')
    } else {
      console.log('  - Skipping Content-Type for FormData')
    }

    // Add authentication header for authenticated requests
    if (requiresAuth && getToken) {
      console.log('  - Getting auth token...')
      try {
        const token = await getToken()
        if (token) {
          headers.Authorization = `Bearer ${token}`
          console.log('  - Added Authorization header')
        } else {
          console.log('  - No token received')
        }
      } catch (error) {
        console.error('Failed to get auth token:', error)
        throw new ApiError(401, 'Authentication required')
      }
    } else {
      console.log('  - Skipping auth (requiresAuth:', requiresAuth, ', getToken:', !!getToken, ')')
    }

    // Add session ID for usage tracking (needed for both auth and anonymous requests)
    if (sessionId || requestSessionId) {
      const finalSessionId = sessionId || requestSessionId || ''
      headers['X-Session-ID'] = finalSessionId
      console.log('  - Added X-Session-ID:', finalSessionId)
    } else {
      console.log('  - No session ID available to add')
    }

    const url = `${API_BASE_URL}${endpoint}`
    
    console.log('🌐 API Client making request to:', url)
    console.log('📤 Request method:', fetchOptions.method || 'GET')
    console.log('📋 Request headers:', headers)
    console.log('📦 Request body type:', fetchOptions.body?.constructor.name)
    
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
      })
      
      console.log('📥 Response status:', response.status, response.statusText)
      console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()))

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
  
  // Generate or retrieve session ID for usage tracking (needed for all users)
  const sessionId = React.useMemo(() => {
    let id = sessionStorage.getItem('veilpix-session-id')
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem('veilpix-session-id', id)
    }
    return id
  }, [])

  return React.useMemo(() => 
    createApiClient(getToken, sessionId), 
    [getToken, sessionId]
  )
}

export { ApiError }