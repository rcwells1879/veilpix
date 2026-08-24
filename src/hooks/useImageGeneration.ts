/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react'
import { useAuth } from '@clerk/clerk-react'
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
  creditsUsed?: number
  processingTime?: number
}

export interface UsageStats {
  totalUsage: number
  creditsRemaining: number
  totalCreditsPurchased?: number
  isAuthenticated: boolean
}

export interface GenerateEditRequest {
  generationId?: string
  image: File
  prompt: string
  x: number
  y: number
  resolution?: string  // For SeeDream API
  aspectRatio?: string  // Model-specific aspect ratio setting
  seedreamTier?: 'lite' | 'pro'
  outputFormat?: 'png' | 'jpeg'
  nsfwFilterEnabled?: boolean
}

export interface GenerateFilterRequest {
  generationId?: string
  image: File
  filterType: string
  resolution?: string  // For SeeDream API
  aspectRatio?: string  // Model-specific aspect ratio setting
  seedreamTier?: 'lite' | 'pro'
  outputFormat?: 'png' | 'jpeg'
  nsfwFilterEnabled?: boolean
}

export interface GenerateAdjustRequest {
  generationId?: string
  image: File
  prompt: string
  resolution?: string  // For Kie image model APIs
  aspectRatioFile?: string  // For SeeDream aspect ratio changes (PNG filename)
  aspectRatio?: string  // For native aspect ratio support (direct string like '1:1', '16:9')
  seedreamTier?: 'lite' | 'pro'
  outputFormat?: 'png' | 'jpeg'
  nsfwFilterEnabled?: boolean
}

export interface GenerateCompositeRequest {
  generationId?: string
  image1: File
  image2: File
  prompt: string
  style?: string
  resolution?: string  // For SeeDream API
  aspectRatio?: string  // Model-specific aspect ratio setting
  seedreamTier?: 'lite' | 'pro'
  outputFormat?: 'png' | 'jpeg'
  nsfwFilterEnabled?: boolean
}

export interface GenerateTextToImageRequest {
  generationId?: string
  prompt: string
  resolution?: string  // For Nano Banana 2 / Wan Image text-to-image
  aspectRatio?: string  // For Nano Banana 2 / Wan Image text-to-image
  seedreamTier?: 'lite' | 'pro'
  outputFormat?: 'png' | 'jpeg'
  nsfwFilterEnabled?: boolean  // For Wan Image text-to-image
}

function generationHeaders(generationId?: string): Record<string, string> {
  return generationId ? { 'X-Generation-ID': generationId } : {}
}

// Custom hook for usage statistics (authenticated only)
export function useUsageStats() {
  const { apiRequest } = useApiClient()
  const { isLoaded, isSignedIn } = useAuth()
  
  return useQuery({
    queryKey: ['usage-stats'],
    enabled: isLoaded && isSignedIn,
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
// Credit cost varies by selected Kie resolution and backend pricing.
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
      if (data.aspectRatio) {
        formData.append('aspectRatio', data.aspectRatio)
      }

      return await apiRequest<ImageGenerationResponse>('/api/nanobanana2/generate-edit', {
        method: 'POST',
        body: formData,
        headers: generationHeaders(data.generationId),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
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
      if (data.aspectRatio) {
        formData.append('aspectRatio', data.aspectRatio)
      }

      return await apiRequest<ImageGenerationResponse>('/api/nanobanana2/generate-filter', {
        method: 'POST',
        body: formData,
        headers: generationHeaders(data.generationId),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
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
        headers: generationHeaders(data.generationId),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
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
      if (data.aspectRatio) {
        formData.append('aspectRatio', data.aspectRatio)
      }

      return await apiRequest<ImageGenerationResponse>('/api/nanobanana2/combine-photos', {
        method: 'POST',
        body: formData,
        headers: generationHeaders(data.generationId),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
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
          ...generationHeaders(data.generationId),
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
    retry: false,
  })
}

// ============================================================================
// Seedream 5 API Hooks
// These hooks select the Lite or Pro Kie model for image generation.
// ============================================================================

function appendSeedreamOptions(formData: FormData, data: { seedreamTier?: 'lite' | 'pro'; outputFormat?: 'png' | 'jpeg' }) {
  formData.append('seedreamTier', data.seedreamTier || 'lite')
  formData.append('outputFormat', data.outputFormat || 'png')
}

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
      if (data.aspectRatio) {
        formData.append('aspectRatio', data.aspectRatio)
      }
      appendSeedreamOptions(formData, data)
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled !== false).toString())

      return await apiRequest<ImageGenerationResponse>('/api/seedream/generate-edit', {
        method: 'POST',
        body: formData,
        headers: generationHeaders(data.generationId), // Let browser set Content-Type for FormData
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
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
      if (data.aspectRatio) {
        formData.append('aspectRatio', data.aspectRatio)
      }
      appendSeedreamOptions(formData, data)
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled !== false).toString())

      return await apiRequest<ImageGenerationResponse>('/api/seedream/generate-filter', {
        method: 'POST',
        body: formData,
        headers: generationHeaders(data.generationId),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
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
      if (data.aspectRatio) {
        formData.append('aspectRatio', data.aspectRatio)
      }
      if (data.aspectRatioFile) {
        formData.append('aspectRatioFile', data.aspectRatioFile)
      }
      appendSeedreamOptions(formData, data)
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled !== false).toString())

      return await apiRequest<ImageGenerationResponse>('/api/seedream/generate-adjust', {
        method: 'POST',
        body: formData,
        headers: generationHeaders(data.generationId),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
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
      if (data.aspectRatio) {
        formData.append('aspectRatio', data.aspectRatio)
      }
      appendSeedreamOptions(formData, data)
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled !== false).toString())

      return await apiRequest<ImageGenerationResponse>('/api/seedream/combine-photos', {
        method: 'POST',
        body: formData,
        headers: generationHeaders(data.generationId),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
  })
}

// Custom hook for text-to-image generation with Seedream 5
export function useGenerateTextToImageSeeDream() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateTextToImageRequest): Promise<ImageGenerationResponse> => {
      return await apiRequest<ImageGenerationResponse>('/api/seedream/generate-text-to-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...generationHeaders(data.generationId),
        },
        body: JSON.stringify({
          prompt: data.prompt,
          resolution: data.resolution,
          aspectRatio: data.aspectRatio,
          seedreamTier: data.seedreamTier,
          outputFormat: data.outputFormat,
          nsfwFilterEnabled: data.nsfwFilterEnabled !== false
        }),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
  })
}

// ============================================================================
// Wan 2.7 Image API Hooks
// These hooks use the Wan 2.7 Image API (via Kie.ai) for image generation
// Credit cost varies by selected Kie resolution and backend pricing.
// ============================================================================

// Custom hook for localized editing with Wan Image
export function useGenerateEditWanImage() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateEditRequest): Promise<ImageGenerationResponse> => {
      const compressedImage = await compressImageIfNeeded(data.image, 20)

      const formData = new FormData()
      formData.append('image', compressedImage)
      formData.append('prompt', data.prompt)
      formData.append('x', data.x.toString())
      formData.append('y', data.y.toString())
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }
      if (data.aspectRatio) {
        formData.append('aspectRatio', data.aspectRatio)
      }
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled === true).toString())

      return await apiRequest<ImageGenerationResponse>('/api/wanimage/generate-edit', {
        method: 'POST',
        body: formData,
        headers: generationHeaders(data.generationId),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
  })
}

// Custom hook for style filters with Wan Image
export function useGenerateFilterWanImage() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateFilterRequest): Promise<ImageGenerationResponse> => {
      const compressedImage = await compressImageIfNeeded(data.image, 20)

      const formData = new FormData()
      formData.append('image', compressedImage)
      formData.append('filterType', data.filterType)
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }
      if (data.aspectRatio) {
        formData.append('aspectRatio', data.aspectRatio)
      }
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled === true).toString())

      return await apiRequest<ImageGenerationResponse>('/api/wanimage/generate-filter', {
        method: 'POST',
        body: formData,
        headers: generationHeaders(data.generationId),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
  })
}

// Custom hook for photo adjustments with Wan Image
export function useGenerateAdjustWanImage() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateAdjustRequest): Promise<ImageGenerationResponse> => {
      const compressedImage = await compressImageIfNeeded(data.image, 20)

      const formData = new FormData()
      formData.append('image', compressedImage)
      formData.append('adjustment', data.prompt)
      if (data.resolution) {
        formData.append('resolution', data.resolution)
      }
      // Wan Image uses direct aspect ratio strings (e.g., '1:1', '16:9')
      if (data.aspectRatio) {
        formData.append('aspectRatio', data.aspectRatio)
      }
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled === true).toString())

      return await apiRequest<ImageGenerationResponse>('/api/wanimage/generate-adjust', {
        method: 'POST',
        body: formData,
        headers: generationHeaders(data.generationId),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
  })
}

// Custom hook for image composition with Wan Image
export function useGenerateCompositeWanImage() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateCompositeRequest): Promise<ImageGenerationResponse> => {
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
      if (data.aspectRatio) {
        formData.append('aspectRatio', data.aspectRatio)
      }
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled === true).toString())

      return await apiRequest<ImageGenerationResponse>('/api/wanimage/combine-photos', {
        method: 'POST',
        body: formData,
        headers: generationHeaders(data.generationId),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
  })
}

// Custom hook for text-to-image generation with Wan Image
export function useGenerateTextToImageWanImage() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateTextToImageRequest): Promise<ImageGenerationResponse> => {
      return await apiRequest<ImageGenerationResponse>('/api/wanimage/generate-text-to-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...generationHeaders(data.generationId),
        },
        body: JSON.stringify({
          prompt: data.prompt,
          resolution: data.resolution,
          aspectRatio: data.aspectRatio,
          nsfwFilterEnabled: data.nsfwFilterEnabled === true
        }),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
  })
}

// Z-Image Turbo supports text-to-image only.
export function useGenerateTextToImageZImage() {
  const { apiRequest } = useApiClient()

  return useMutation({
    mutationFn: async (data: GenerateTextToImageRequest): Promise<ImageGenerationResponse> => {
      return await apiRequest<ImageGenerationResponse>('/api/zimage/generate-text-to-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...generationHeaders(data.generationId),
        },
        body: JSON.stringify({
          prompt: data.prompt,
          aspectRatio: data.aspectRatio,
          nsfwFilterEnabled: data.nsfwFilterEnabled !== false
        }),
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    retry: false,
  })
}

export interface ImageGenerationJobStatus {
  status: 'pending' | 'succeeded' | 'failed'
  image?: ImageGenerationResponse['image']
  delivered?: boolean
  message?: string
  creditsUsed?: number
  processingTime?: number
}

export function useImageGenerationRecovery() {
  const { apiRequest } = useApiClient()

  return React.useCallback(async (generationId: string) => {
    const status = await apiRequest<ImageGenerationJobStatus>(`/api/image-jobs/${encodeURIComponent(generationId)}`, {
      method: 'GET',
      cache: 'no-store',
      requiresAuth: true,
    })
    if (status.status === 'succeeded') {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    }
    return status
  }, [apiRequest])
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
// Wan 2.6 Flash Image-to-Video API Hook
// Uses Wan 2.6 Flash via Kie.ai for image-to-video generation
// ============================================================================

export interface GenerateVideoRequest {
  image: File
  prompt: string
  generationId?: string
  duration?: number   // 2-15 seconds (default 5)
  resolution?: string // '720p' | '1080p' (default '1080p')
  nsfwFilterEnabled?: boolean // NSFW content filter (default true)
  audio?: boolean     // Enable audio generation (default true)
  multiShots?: boolean // Enable multi-shot mode (default false)
}

export interface VideoGenerationResponse {
  videoUrl?: string
  lastFrameUrl?: string
  outputFormat?: 'mp4' | 'mov'
  success: boolean
  message?: string
  creditsRemaining?: number
  creditsUsed?: number
  processingTime?: number
}

export function useGenerateVideo() {
  const { apiRequest } = useApiClient()

  return useMutation({
    retry: false, // Never retry video mutations — they're expensive and the backend may still be processing
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
      formData.append('audio', (data.audio !== false).toString())
      formData.append('multiShots', (data.multiShots === true).toString())

      return await apiRequest<VideoGenerationResponse>('/api/wan/generate-video', {
        method: 'POST',
        body: formData,
        headers: data.generationId ? { 'X-Generation-ID': data.generationId } : {},
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })
}

// ============================================================================
// Wan 2.6 Text-to-Video API Hook
// Uses Wan 2.6 via Kie.ai for text-to-video generation (no reference image)
// ============================================================================

export interface GenerateTextToVideoRequest {
  prompt: string
  generationId?: string
  duration?: number   // 2-15 seconds (default 5)
  resolution?: string // '720p' | '1080p' (default '1080p')
  ratio?: string      // '16:9' | '9:16' | '1:1' | '4:3' | '3:4' (default '16:9')
  multiShots?: boolean
  nsfwFilterEnabled?: boolean
}

export interface GenerateReferenceToVideoRequest {
  image?: File | null
  images?: File[]
  video?: File | null
  referenceVideoUrl?: string | null
  prompt: string
  generationId?: string
  duration?: number
  resolution?: string
  ratio?: string
  nsfwFilterEnabled?: boolean
}

export interface GenerateSeedanceVideoRequest {
  referenceImages?: File[]
  firstFrame?: File | null
  lastFrame?: File | null
  referenceVideos?: File[]
  referenceVideoUrl?: string | null
  referenceVideoDuration?: number | null
  referenceAudios?: File[]
  referenceAudioDuration?: number | null
  prompt: string
  generationId?: string
  variant?: 'v2_5' | 'regular' | 'fast' | 'mini'
  inputMode?: 'frames' | 'references'
  duration?: number
  resolution?: string
  aspectRatio?: string
  generateAudio?: boolean
  webSearch?: boolean
  returnLastFrame?: boolean
  outputFormat?: 'mp4' | 'mov'
  nsfwFilterEnabled?: boolean
}

export interface GenerateWan3VideoRequest {
  prompt: string
  generationId: string
  variant: 'standard' | 'prime'
  inputMode: 'frames' | 'references' | 'file' | 'link'
  duration: number
  resolution: string
  aspectRatio: string
  firstFrame?: File | null
  lastFrame?: File | null
  referenceImages?: File[]
  referenceVideos?: File[]
  referenceVideoDuration?: number | null
  referenceAudios?: File[]
  referenceAudioDuration?: number | null
  referenceFile?: File | null
  referenceLink?: string
  audio?: boolean
  seed?: number | null
  nsfwFilterEnabled?: boolean
}

type Wan3UploadCategory = 'image' | 'video' | 'audio' | 'file'

interface SignedWan3Upload {
  objectPath: string
  signedUrl: string
  mimeType: string
  size: number
  category: Wan3UploadCategory
  fileName: string
}

async function uploadWan3Input(upload: SignedWan3Upload, file: File): Promise<void> {
  const response = await fetch(upload.signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': upload.mimeType,
      'x-upsert': 'false',
    },
    body: file,
  })
  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`Direct reference upload failed (${response.status})${details ? `: ${details}` : ''}`)
  }
}

export function useGenerateWan3Video() {
  const { apiRequest } = useApiClient()

  return useMutation({
    retry: false,
    mutationFn: async (data: GenerateWan3VideoRequest): Promise<VideoGenerationResponse> => {
      const taggedFiles: Array<{ key: string; category: Wan3UploadCategory; file: File }> = []
      if (data.firstFrame) taggedFiles.push({ key: 'firstFrame', category: 'image', file: data.firstFrame })
      if (data.lastFrame) taggedFiles.push({ key: 'lastFrame', category: 'image', file: data.lastFrame })
      data.referenceImages?.slice(0, 10).forEach((file, index) => taggedFiles.push({ key: `referenceImages:${index}`, category: 'image', file }))
      data.referenceVideos?.slice(0, 5).forEach((file, index) => taggedFiles.push({ key: `referenceVideos:${index}`, category: 'video', file }))
      data.referenceAudios?.slice(0, 5).forEach((file, index) => taggedFiles.push({ key: `referenceAudios:${index}`, category: 'audio', file }))
      if (data.referenceFile) taggedFiles.push({ key: 'referenceFile', category: 'file', file: data.referenceFile })

      let signedUploads: SignedWan3Upload[] = []
      if (taggedFiles.length > 0) {
        const prepared = await apiRequest<{ success: boolean; uploads: SignedWan3Upload[] }>('/api/wan3/inputs/sign', {
          method: 'POST',
          body: JSON.stringify({
            files: taggedFiles.map(({ category, file }) => ({
              category,
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
              size: file.size,
            })),
          }),
          headers: generationHeaders(data.generationId),
          requiresAuth: true,
        })
        signedUploads = prepared.uploads
        if (signedUploads.length !== taggedFiles.length) throw new Error('The upload service returned an incomplete reference list.')
        await Promise.all(signedUploads.map((upload, index) => uploadWan3Input(upload, taggedFiles[index].file)))
      }

      const uploadDescriptor = (index: number) => {
        const upload = signedUploads[index]
        return upload ? {
          objectPath: upload.objectPath,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          size: upload.size,
          category: upload.category,
        } : null
      }
      const uploads: Record<string, unknown> = {
        referenceImages: [],
        referenceVideos: [],
        referenceAudios: [],
      }
      taggedFiles.forEach((tagged, index) => {
        const descriptor = uploadDescriptor(index)
        const [group] = tagged.key.split(':')
        if (tagged.key.includes(':')) (uploads[group] as unknown[]).push(descriptor)
        else uploads[group] = descriptor
      })

      return apiRequest<VideoGenerationResponse>('/api/wan3/generate-video', {
        method: 'POST',
        body: JSON.stringify({
          prompt: data.prompt,
          variant: data.variant,
          inputMode: data.inputMode,
          duration: data.duration,
          resolution: data.resolution,
          aspectRatio: data.aspectRatio,
          uploads,
          referenceVideoDuration: data.referenceVideoDuration,
          referenceAudioDuration: data.referenceAudioDuration,
          referenceLink: data.referenceLink,
          audio: data.audio !== false,
          seed: data.seed,
          nsfwFilterEnabled: data.nsfwFilterEnabled !== false,
        }),
        headers: generationHeaders(data.generationId),
        requiresAuth: true,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })
}

export function useGenerateSeedanceVideo() {
  const { apiRequest } = useApiClient()

  return useMutation({
    retry: false,
    mutationFn: async (data: GenerateSeedanceVideoRequest): Promise<VideoGenerationResponse> => {
      const formData = new FormData()

      if (data.firstFrame) {
        const [compressedFirstFrame] = await compressMultipleImages([data.firstFrame], 20)
        formData.append('firstFrame', compressedFirstFrame)
      }
      if (data.lastFrame) {
        const [compressedLastFrame] = await compressMultipleImages([data.lastFrame], 20)
        formData.append('lastFrame', compressedLastFrame)
      }
      if (data.referenceImages?.length) {
        const compressedImages = await compressMultipleImages(data.referenceImages, 20)
        const maxReferenceImages = data.variant === 'v2_5' ? 30 : 9
        compressedImages.slice(0, maxReferenceImages).forEach((image) => {
          formData.append('referenceImages', image)
        })
      }
      const maxReferenceVideos = data.variant === 'v2_5' ? 10 : 1
      data.referenceVideos?.slice(0, maxReferenceVideos).forEach((video) => formData.append('referenceVideo', video))
      if (data.referenceVideoUrl) {
        formData.append('referenceVideoUrl', data.referenceVideoUrl)
      }
      if (typeof data.referenceVideoDuration === 'number') {
        formData.append('referenceVideoDuration', data.referenceVideoDuration.toString())
      }
      const maxReferenceAudios = data.variant === 'v2_5' ? 10 : 1
      data.referenceAudios?.slice(0, maxReferenceAudios).forEach((audio) => formData.append('referenceAudio', audio))
      if (typeof data.referenceAudioDuration === 'number') {
        formData.append('referenceAudioDuration', data.referenceAudioDuration.toString())
      }

      formData.append('prompt', data.prompt)
      formData.append('variant', data.variant || 'regular')
      formData.append('inputMode', data.inputMode || 'references')
      formData.append('duration', (data.duration ?? 5).toString())
      formData.append('resolution', data.resolution || '720p')
      formData.append('aspectRatio', data.aspectRatio || '16:9')
      formData.append('generateAudio', (data.generateAudio === true).toString())
      formData.append('webSearch', (data.webSearch === true).toString())
      formData.append('returnLastFrame', (data.returnLastFrame === true).toString())
      formData.append('outputFormat', data.outputFormat || 'mp4')
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled !== false).toString())

      return await apiRequest<VideoGenerationResponse>('/api/seedance/generate-video', {
        method: 'POST',
        body: formData,
        headers: data.generationId ? { 'X-Generation-ID': data.generationId } : {},
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })
}

export function useGenerateReferenceToVideo() {
  const { apiRequest } = useApiClient()

  return useMutation({
    retry: false,
    mutationFn: async (data: GenerateReferenceToVideoRequest): Promise<VideoGenerationResponse> => {
      const formData = new FormData()
      const imageReferences = data.images?.length ? data.images : data.image ? [data.image] : []
      if (imageReferences.length) {
        const compressedImages = await compressMultipleImages(imageReferences, 20)
        compressedImages.slice(0, 5).forEach((image) => {
          formData.append('image', image)
        })
      }
      if (data.video) {
        formData.append('video', data.video)
      }
      if (data.referenceVideoUrl) {
        formData.append('referenceVideoUrl', data.referenceVideoUrl)
      }
      formData.append('prompt', data.prompt)
      formData.append('duration', (data.duration || 5).toString())
      formData.append('resolution', data.resolution || '1080p')
      formData.append('ratio', data.ratio || '16:9')
      formData.append('nsfwFilterEnabled', (data.nsfwFilterEnabled !== false).toString())

      return await apiRequest<VideoGenerationResponse>('/api/wan/generate-reference-to-video', {
        method: 'POST',
        body: formData,
        headers: data.generationId ? { 'X-Generation-ID': data.generationId } : {},
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })
}

export function useGenerateTextToVideo() {
  const { apiRequest } = useApiClient()

  return useMutation({
    retry: false, // Never retry video mutations — they're expensive and the backend may still be processing
    mutationFn: async (data: GenerateTextToVideoRequest): Promise<VideoGenerationResponse> => {
      return await apiRequest<VideoGenerationResponse>('/api/wan/generate-text-to-video', {
        method: 'POST',
        body: JSON.stringify({
          prompt: data.prompt,
          duration: data.duration || 5,
          resolution: data.resolution || '1080p',
          ratio: data.ratio || '16:9',
          multiShots: data.multiShots === true,
          nsfwFilterEnabled: data.nsfwFilterEnabled !== false
        }),
        headers: {
          'Content-Type': 'application/json',
          ...(data.generationId ? { 'X-Generation-ID': data.generationId } : {}),
        },
        requiresAuth: true
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  })
}

export interface VideoGenerationJobStatus {
  status: 'pending' | 'succeeded' | 'failed'
  videoUrl?: string
  delivered?: boolean
  message?: string
  creditsUsed?: number
  processingTime?: number
}

export interface PendingMediaDelivery {
  id: string
  generationId: string
  artifactType: 'image' | 'video' | 'audio' | 'file'
  provider: string
  mimeType: string
  fileName: string
  sizeBytes?: number | null
  createdAt: string
  expiresAt: string
  downloadUrl: string
}

export function useMediaDeliveryRecovery() {
  const { apiRequest } = useApiClient()

  return React.useMemo(() => ({
    list: async (): Promise<PendingMediaDelivery[]> => {
      const response = await apiRequest<{ deliveries: PendingMediaDelivery[] }>('/api/media-deliveries', {
        method: 'GET',
        cache: 'no-store',
        requiresAuth: true,
      })
      return response.deliveries || []
    },
    acknowledge: async (deliveryId: string): Promise<void> => {
      await apiRequest(`/api/media-deliveries/${encodeURIComponent(deliveryId)}/ack`, {
        method: 'POST',
        requiresAuth: true,
      })
      await queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
    acknowledgeGeneration: async (generationId: string): Promise<void> => {
      await apiRequest(`/api/media-deliveries/generation/${encodeURIComponent(generationId)}/ack`, {
        method: 'POST',
        requiresAuth: true,
      })
      await queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    },
  }), [apiRequest])
}

export function useVideoGenerationRecovery() {
  const { apiRequest } = useApiClient()

  return React.useCallback(async (generationId: string) => {
    const status = await apiRequest<VideoGenerationJobStatus>(`/api/video-jobs/${encodeURIComponent(generationId)}`, {
      method: 'GET',
      cache: 'no-store',
      requiresAuth: true,
    })
    if (status.status === 'succeeded') {
      queryClient.invalidateQueries({ queryKey: ['usage-stats'] })
    }
    return status
  }, [apiRequest])
}
