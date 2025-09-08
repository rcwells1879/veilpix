/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useApiClient } from '../services/apiClient'
import { queryClient } from '../queryClient'

export interface ImageGenerationResponse {
  imageUrl: string
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
  adjustments: {
    brightness?: number
    contrast?: number
    saturation?: number
    temperature?: number
  }
}

// Custom hook for usage statistics
export function useUsageStats() {
  const { apiRequest } = useApiClient()
  
  return useQuery({
    queryKey: ['usage-stats'],
    queryFn: async (): Promise<UsageStats> => {
      try {
        // Try authenticated endpoint first
        return await apiRequest<UsageStats>('/api/usage/stats', { 
          requiresAuth: true 
        })
      } catch (error) {
        // Fall back to anonymous endpoint
        return await apiRequest<UsageStats>('/api/usage/anonymous')
      }
    },
    staleTime: 1000 * 30, // 30 seconds
    refetchOnWindowFocus: true,
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
      const formData = new FormData()
      formData.append('image', data.image)
      formData.append('adjustments', JSON.stringify(data.adjustments))

      return await apiRequest<ImageGenerationResponse>('/api/gemini/generate-adjust', {
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