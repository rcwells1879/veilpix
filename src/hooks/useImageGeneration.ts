/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useApiClient } from '../services/apiClient'
import { queryClient } from '../queryClient'
import { compressImageIfNeeded, compressMultipleImages } from '../utils/imageCompression'

export interface ImageGenerationResponse {
  imageUrl?: string
  image?: {
    data: string
    mimeType: string
  }
  success: boolean
  message?: string
  creditsRemaining?: number
}

export interface UsageStats {
  totalUsage: number
  creditsRemaining: number
  totalCreditsPurchased?: number
  isAuthenticated: boolean
}

export interface GenerateEditRequest {
  image: File
  prompt: string
  x: number
  y: number
  resolution?: string  // For SeeDream API
}

export interface GenerateFilterRequest {
  image: File
  filterType: string
  resolution?: string  // For SeeDream API
}

export interface GenerateAdjustRequest {
  image: File
  prompt: string
  resolution?: string  // For SeeDream API
  aspectRatioFile?: string  // For SeeDream aspect ratio changes
}

export interface GenerateCompositeRequest {
  image1: File
  image2: File
  prompt: string
  style?: string
  resolution?: string  // For SeeDream API
}

export interface GenerateTextToImageRequest {
  prompt: string
}

// Custom hook for usage statistics (authenticated only)
export function useUsageStats() {
  const { apiRequest } = useApiClient()
  
  return useQuery({
    queryKey: ['usage-stats'],
    queryFn: async (): Promise<UsageStats> => {
      console.log('🚀 Getting authenticated user stats and credits')
      const result = await apiRequest<UsageStats>('/api/usage/stats', { 
        requiresAuth: true 
      })
      console.log('✅ Authenticated request successful:', result)
      return result
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
        requiresAuth: true
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
        requiresAuth: true
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
        requiresAuth: true
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
          requiresAuth: true // Require authentication for all image generation
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

// Custom hook for text-to-image generation
export function useGenerateTextToImage() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateTextToImageRequest): Promise<ImageGenerationResponse> => {
      console.log('🎨 Starting text-to-image generation with prompt:', data.prompt)

      const response = await apiRequest<ImageGenerationResponse>('/api/gemini/generate-text-to-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: data.prompt }),
        requiresAuth: true
      })

      console.log('✅ Text-to-image generation completed:', response)
      return response
    },
    onSuccess: (data) => {
      console.log('🎉 Text-to-image generation successful:', data)
      // Invalidate usage stats to get updated counts
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    onError: (error) => {
      console.error('💥 Text-to-image generation failed:', error)
    },
  })
}

// ============================================================================
// SeeDream 4.0 API Hooks
// These hooks use the SeeDream API instead of Gemini for image generation
// ============================================================================

// Custom hook for localized editing with SeeDream
export function useGenerateEditSeeDream() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateEditRequest): Promise<ImageGenerationResponse> => {
      // Compress image if needed (SeeDream has 20MB limit)
      const compressedImage = await compressImageIfNeeded(data.image, 20)

      const formData = new FormData()
      formData.append('image', compressedImage)
      formData.append('prompt', data.prompt)
      formData.append('x', data.x.toString())
      formData.append('y', data.y.toString())
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }

      return await apiRequest<ImageGenerationResponse>('/api/seedream/generate-edit', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })
}

// Custom hook for style filters with SeeDream
export function useGenerateFilterSeeDream() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateFilterRequest): Promise<ImageGenerationResponse> => {
      // Compress image if needed (SeeDream has 20MB limit)
      const compressedImage = await compressImageIfNeeded(data.image, 20)

      const formData = new FormData()
      formData.append('image', compressedImage)
      formData.append('filterType', data.filterType)
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }

      return await apiRequest<ImageGenerationResponse>('/api/seedream/generate-filter', {
        method: 'POST',
        body: formData,
        headers: {},
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })
}

// Custom hook for photo adjustments with SeeDream
export function useGenerateAdjustSeeDream() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateAdjustRequest): Promise<ImageGenerationResponse> => {
      // Compress image if needed (SeeDream has 20MB limit)
      const compressedImage = await compressImageIfNeeded(data.image, 20)

      const formData = new FormData()
      formData.append('image', compressedImage)
      formData.append('adjustment', data.prompt)
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }
      if (data.aspectRatioFile) {
        formData.append('aspectRatioFile', data.aspectRatioFile)
      }

      return await apiRequest<ImageGenerationResponse>('/api/seedream/generate-adjust', {
        method: 'POST',
        body: formData,
        headers: {},
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })
}

// Custom hook for image composition with SeeDream
export function useGenerateCompositeSeeDream() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateCompositeRequest): Promise<ImageGenerationResponse> => {
      // Compress both images if needed (SeeDream has 20MB limit per image)
      const [compressedImage1, compressedImage2] = await compressMultipleImages(
        [data.image1, data.image2],
        20
      )

      const formData = new FormData()
      formData.append('images', compressedImage1)
      formData.append('images', compressedImage2)
      formData.append('prompt', data.prompt)
      if (data.style) {
        formData.append('style', data.style)
      }
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }

      return await apiRequest<ImageGenerationResponse>('/api/seedream/combine-photos', {
        method: 'POST',
        body: formData,
        headers: {},
        requiresAuth: true
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