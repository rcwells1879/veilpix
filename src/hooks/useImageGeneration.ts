/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useApiClient } from '../services/apiClient'
import { queryClient } from '../queryClient'

export interface ImageGenerationResponse {
  imageUrl?: string
  image?: {
    data: string
    mimeType: string
  }
  success: boolean
  message?: string
  usageCount?: number
  remainingFreeUsage?: number
}

export interface UsageStats {
  totalUsage: number
  remainingFreeUsage?: number
  isAuthenticated: boolean
}

export interface GenerateEditRequest {
  image: File
  prompt: string
  x: number
  y: number
}

export interface GenerateFilterRequest {
  image: File
  filterType: string
}

export interface GenerateAdjustRequest {
  image: File
  prompt: string
}

export interface GenerateCompositeRequest {
  image1: File
  image2: File
  prompt: string
  style?: string
}

// Custom hook for usage statistics
export function useUsageStats() {
  const { apiRequest } = useApiClient()
  
  return useQuery({
    queryKey: ['usage-stats'],
    queryFn: async (): Promise<UsageStats> => {
      console.log('🚀 STARTING useUsageStats query function')
      try {
        // Try authenticated endpoint first
        console.log('🔄 Attempting authenticated request to /api/usage/stats')
        const result = await apiRequest<UsageStats>('/api/usage/stats', { 
          requiresAuth: true 
        })
        console.log('✅ Authenticated request successful:', result)
        return result
      } catch (error: any) {
        console.log('❌ Authenticated request failed:', error)
        // If auth fails or user is not authenticated, fall back to anonymous endpoint
        if (error?.status === 401 || error?.status === 403) {
          console.log('🔄 Falling back to anonymous usage endpoint')
          const fallbackResult = await apiRequest<UsageStats>('/api/usage/anonymous')
          console.log('✅ Anonymous request successful:', fallbackResult)
          return fallbackResult
        }
        throw error // Re-throw other errors
      }
    },
    staleTime: 1000 * 30, // 30 seconds
    refetchOnWindowFocus: true,
    retry: (failureCount, error: any) => {
      // Don't retry auth errors, but retry network errors up to 2 times
      if (error?.status === 401 || error?.status === 403) {
        return false
      }
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  })
}

// Custom hook for localized image editing
export function useGenerateEdit() {
  const { apiRequest } = useApiClient()
  
  return useMutation({
    mutationFn: async (data: GenerateEditRequest): Promise<ImageGenerationResponse> => {
      const formData = new FormData()
      formData.append('image', data.image)
      formData.append('prompt', data.prompt)
      formData.append('x', data.x.toString())
      formData.append('y', data.y.toString())

      return await apiRequest<ImageGenerationResponse>('/api/gemini/generate-edit', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
      })
    },
    onSuccess: () => {
      // Invalidate usage stats to get updated counts
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })
}

// Custom hook for style filters
export function useGenerateFilter() {
  const { apiRequest } = useApiClient()
  
  return useMutation({
    mutationFn: async (data: GenerateFilterRequest): Promise<ImageGenerationResponse> => {
      const formData = new FormData()
      formData.append('image', data.image)
      formData.append('filterType', data.filterType)

      return await apiRequest<ImageGenerationResponse>('/api/gemini/generate-filter', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })
}

// Custom hook for photo adjustments
export function useGenerateAdjust() {
  const { apiRequest } = useApiClient()
  
  return useMutation({
    mutationFn: async (data: GenerateAdjustRequest): Promise<ImageGenerationResponse> => {
      console.log('🔍 Adjustment prompt:', data.prompt)
      
      const formData = new FormData()
      formData.append('image', data.image)
      formData.append('adjustment', data.prompt)

      const response = await apiRequest<ImageGenerationResponse>('/api/gemini/generate-adjust', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
      })
      
      console.log('🎉 API Response received:', response)
      console.log('🎉 Response success:', response.success)
      console.log('🎉 Response imageUrl:', response.imageUrl)
      console.log('🎉 Response image:', response.image)
      
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })
}

// Custom hook for image composition
export function useGenerateComposite() {
  const { apiRequest } = useApiClient()
  
  return useMutation({
    mutationFn: async (data: GenerateCompositeRequest): Promise<ImageGenerationResponse> => {
      console.log('🚀 Starting composite image generation')
      console.log('📸 Image 1:', data.image1?.name, data.image1?.size, 'bytes')
      console.log('📸 Image 2:', data.image2?.name, data.image2?.size, 'bytes')
      console.log('💬 Prompt:', data.prompt)
      console.log('🎨 Style:', data.style)

      console.log('🔧 Creating FormData...')
      const formData = new FormData()
      formData.append('images', data.image1)
      formData.append('images', data.image2)
      formData.append('prompt', data.prompt)
      if (data.style) {
        formData.append('style', data.style)
      }

      console.log('📦 FormData entries:')
      for (let [key, value] of formData.entries()) {
        console.log(`  ${key}:`, value instanceof File ? `File(${value.name}, ${value.size} bytes)` : value)
      }

      console.log('🔧 Getting apiRequest function:', typeof apiRequest)
      console.log('🌐 About to make API request to /api/gemini/combine-photos')
      
      try {
        console.log('⏳ Calling apiRequest...')
        const result = await apiRequest<ImageGenerationResponse>('/api/gemini/combine-photos', {
          method: 'POST',
          body: formData,
          headers: {}, // Let browser set Content-Type for FormData
          requiresAuth: false // This will add session ID for anonymous users or auth token if signed in
        })
        console.log('✅ API request successful:', result)
        return result
      } catch (error) {
        console.error('❌ API request failed:', error)
        throw error
      }
    },
    onMutate: (variables) => {
      console.log('🔄 Mutation starting with variables:', variables)
    },
    onSuccess: (data) => {
      console.log('🎉 Composite generation completed successfully:', data)
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    onError: (error) => {
      console.error('💥 Composite generation failed:', error)
    },
  })
}

// Custom hook for optimistic image updates using React 19's useOptimistic
export function useOptimisticImageGeneration() {
  const [optimisticState, setOptimisticState] = React.useOptimistic<{
    isGenerating: boolean
    previewImage?: string
    operation?: string
  }>({ isGenerating: false })

  const addOptimisticUpdate = React.useCallback((operation: string, previewImage?: string) => {
    setOptimisticState({
      isGenerating: true,
      previewImage,
      operation
    })
  }, [setOptimisticState])

  const clearOptimisticUpdate = React.useCallback(() => {
    setOptimisticState({ isGenerating: false })
  }, [setOptimisticState])

  return {
    optimisticState,
    addOptimisticUpdate,
    clearOptimisticUpdate
  }
}