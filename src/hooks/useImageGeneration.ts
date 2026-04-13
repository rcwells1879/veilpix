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
  nsfwFilterEnabled?: boolean
}

export interface GenerateFilterRequest {
  image: File
  filterType: string
  resolution?: string  // For SeeDream API
  nsfwFilterEnabled?: boolean
}

export interface GenerateAdjustRequest {
  image: File
  prompt: string
  resolution?: string  // For SeeDream and Nano Banana Pro APIs
  aspectRatioFile?: string  // For SeeDream aspect ratio changes (PNG filename)
  aspectRatio?: string  // For Nano Banana Pro aspect ratio (direct string like '1:1', '16:9')
  nsfwFilterEnabled?: boolean
}

export interface GenerateCompositeRequest {
  image1: File
  image2: File
  prompt: string
  style?: string
  resolution?: string  // For SeeDream API
  nsfwFilterEnabled?: boolean
}

export interface GenerateTextToImageRequest {
  prompt: string
  resolution?: string  // For Nano Banana 2 text-to-image
  aspectRatio?: string  // For Nano Banana 2 text-to-image
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

// ============================================================================
// Nano Banana 2 (Google Gemini 3.1 Flash) API Hooks
// These hooks use the Nano Banana 2 API (via Kie.ai) for image generation
// Costs 2 credits per generation
// ============================================================================

// Custom hook for localized editing with Nano Banana 2
export function useGenerateEditNanoBanana2() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateEditRequest): Promise<ImageGenerationResponse> => {
      // Compress image if needed (20MB limit)
      const compressedImage = await compressImageIfNeeded(data.image, 20)

      const formData = new FormData()
      formData.append('image', compressedImage)
      formData.append('prompt', data.prompt)
      formData.append('x', data.x.toString())
      formData.append('y', data.y.toString())
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }

      return await apiRequest<ImageGenerationResponse>('/api/nanobanana2/generate-edit', {
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

// Custom hook for style filters with Nano Banana 2
export function useGenerateFilterNanoBanana2() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateFilterRequest): Promise<ImageGenerationResponse> => {
      // Compress image if needed (20MB limit)
      const compressedImage = await compressImageIfNeeded(data.image, 20)

      const formData = new FormData()
      formData.append('image', compressedImage)
      formData.append('filterType', data.filterType)
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }

      return await apiRequest<ImageGenerationResponse>('/api/nanobanana2/generate-filter', {
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

// Custom hook for photo adjustments with Nano Banana 2
export function useGenerateAdjustNanoBanana2() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateAdjustRequest): Promise<ImageGenerationResponse> => {
      // Compress image if needed (20MB limit)
      const compressedImage = await compressImageIfNeeded(data.image, 20)

      const formData = new FormData()
      formData.append('image', compressedImage)
      formData.append('adjustment', data.prompt)
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }
      // Nano Banana 2 uses direct aspect ratio strings (e.g., '1:1', '16:9', 'auto')
      if (data.aspectRatio) {
        formData.append('aspectRatio', data.aspectRatio)
      }

      return await apiRequest<ImageGenerationResponse>('/api/nanobanana2/generate-adjust', {
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

// Custom hook for image composition with Nano Banana 2
export function useGenerateCompositeNanoBanana2() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateCompositeRequest): Promise<ImageGenerationResponse> => {
      // Compress both images if needed (20MB limit per image)
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

      return await apiRequest<ImageGenerationResponse>('/api/nanobanana2/combine-photos', {
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

// Custom hook for text-to-image generation with Nano Banana 2
export function useGenerateTextToImage() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateTextToImageRequest): Promise<ImageGenerationResponse> => {
      console.log('Starting text-to-image generation with prompt:', data.prompt)

      const response = await apiRequest<ImageGenerationResponse>('/api/nanobanana2/generate-text-to-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: data.prompt,
          resolution: data.resolution,
          aspectRatio: data.aspectRatio
        }),
        requiresAuth: true
      })

      console.log('Text-to-image generation completed:', response)
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })
}

// ============================================================================
// SeeDream 4.5 API Hooks
// These hooks use the SeeDream 4.5 Edit API instead of Gemini for image generation
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
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled !== false).toString())

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
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled !== false).toString())

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
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled !== false).toString())

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
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled !== false).toString())

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

// ============================================================================
// Nano Banana Pro (Google Gemini 3 Pro Image) API Hooks
// These hooks use the Nano Banana Pro API (via Kie.ai) for image generation
// Costs 2 credits per generation
// ============================================================================

// Custom hook for localized editing with Nano Banana Pro
export function useGenerateEditNanoBananaPro() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateEditRequest): Promise<ImageGenerationResponse> => {
      // Compress image if needed (20MB limit)
      const compressedImage = await compressImageIfNeeded(data.image, 20)

      const formData = new FormData()
      formData.append('image', compressedImage)
      formData.append('prompt', data.prompt)
      formData.append('x', data.x.toString())
      formData.append('y', data.y.toString())
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }

      return await apiRequest<ImageGenerationResponse>('/api/nanobananapro/generate-edit', {
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

// Custom hook for style filters with Nano Banana Pro
export function useGenerateFilterNanoBananaPro() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateFilterRequest): Promise<ImageGenerationResponse> => {
      // Compress image if needed (20MB limit)
      const compressedImage = await compressImageIfNeeded(data.image, 20)

      const formData = new FormData()
      formData.append('image', compressedImage)
      formData.append('filterType', data.filterType)
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }

      return await apiRequest<ImageGenerationResponse>('/api/nanobananapro/generate-filter', {
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

// Custom hook for photo adjustments with Nano Banana Pro
export function useGenerateAdjustNanoBananaPro() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateAdjustRequest): Promise<ImageGenerationResponse> => {
      // Compress image if needed (20MB limit)
      const compressedImage = await compressImageIfNeeded(data.image, 20)

      const formData = new FormData()
      formData.append('image', compressedImage)
      formData.append('adjustment', data.prompt)
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }
      // Nano Banana Pro uses direct aspect ratio strings (e.g., '1:1', '16:9')
      if (data.aspectRatio) {
        formData.append('aspectRatio', data.aspectRatio)
      }

      return await apiRequest<ImageGenerationResponse>('/api/nanobananapro/generate-adjust', {
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

// Custom hook for image composition with Nano Banana Pro
export function useGenerateCompositeNanoBananaPro() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateCompositeRequest): Promise<ImageGenerationResponse> => {
      // Compress both images if needed (20MB limit per image)
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

      return await apiRequest<ImageGenerationResponse>('/api/nanobananapro/combine-photos', {
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

// ============================================================================
// Wan 2.7 Image-to-Video API Hook
// Uses Wan 2.7 via Kie.ai for image-to-video generation
// Costs 2 credits per generation
// ============================================================================

export interface GenerateVideoRequest {
  image: File
  prompt: string
  duration?: number   // 2-15 seconds (default 5)
  resolution?: string // '720p' | '1080p' (default '1080p')
  nsfwFilterEnabled?: boolean // NSFW content filter (default true)
}

export interface VideoGenerationResponse {
  videoUrl?: string
  success: boolean
  message?: string
  creditsRemaining?: number
  processingTime?: number
}

export function useGenerateVideo() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateVideoRequest): Promise<VideoGenerationResponse> => {
      const compressedImage = await compressImageIfNeeded(data.image, 20)

      const formData = new FormData()
      formData.append('image', compressedImage)
      formData.append('prompt', data.prompt)
      if (data.duration) {
        formData.append('duration', data.duration.toString())
      }
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled !== false).toString())

      return await apiRequest<VideoGenerationResponse>('/api/wan/generate-video', {
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

// ============================================================================
// Wan 2.7 Text-to-Video API Hook
// Generates video from text prompt only (no reference image)
// ============================================================================

export interface GenerateTextToVideoRequest {
  prompt: string
  duration?: number   // 2-15 seconds (default 5)
  resolution?: string // '720p' | '1080p' (default '1080p')
  ratio?: string      // '16:9' | '9:16' | '1:1' | '4:3' | '3:4' (default '16:9')
  nsfwFilterEnabled?: boolean
}

export function useGenerateTextToVideo() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateTextToVideoRequest): Promise<VideoGenerationResponse> => {
      return await apiRequest<VideoGenerationResponse>('/api/wan/generate-text-to-video', {
        method: 'POST',
        body: JSON.stringify({
          prompt: data.prompt,
          duration: data.duration?.toString() || '5',
          resolution: data.resolution || '1080p',
          ratio: data.ratio || '16:9',
          nsfwFilterEnabled: (data.nsfwFilterEnabled !== false).toString()
        }),
        headers: { 'Content-Type': 'application/json' },
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })
}