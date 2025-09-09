# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
VeilPix is an AI-powered image editing React web application that uses Google's Gemini AI model for generative image editing. The app provides localized photo editing, global filters, adjustments, and cropping capabilities through an intuitive web interface.

## Architecture
- **Frontend**: React 19 with TypeScript using Vite as the build tool
- **Backend API**: Node.js/Express server with authentication, usage tracking, and billing
- **AI Service**: Google Gemini API (`gemini-2.5-flash-image-preview`) for image generation via backend
- **Authentication**: Clerk for user management and session handling
- **Database**: Supabase for usage tracking, billing records, and user data
- **Payment Processing**: Stripe for billing and usage metering
- **State Management**: React hooks with local state (no external state library)
- **Image Processing**: Canvas API for cropping, react-image-crop for crop selection
- **Styling**: Tailwind CSS with custom animations and gradients

## Development Commands
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Setup
Create a `.env.local` file with:
```
GEMINI_API_KEY=your_gemini_api_key_here
```

## Key Components Structure
- `App.tsx` - Main application with image editing state management
- `src/services/apiClient.ts` - HTTP client for backend API communication
- `src/hooks/useImageGeneration.ts` - React hooks for AI image generation via API
- `components/` - Reusable UI components for each editing panel
- `veilpix-api/` - Backend Express server with:
  - `routes/gemini.js` - AI image generation endpoints
  - `routes/auth.js` - Authentication endpoints
  - `routes/usage.js` - Usage tracking endpoints
  - `middleware/auth.js` - Clerk authentication middleware

## Core Features Implementation
1. **Localized Editing**: Click-to-edit system where users click image hotspots for precise edits
2. **History Management**: Undo/redo system with image file versioning
3. **Multi-modal Interface**: Four editing modes - Retouch, Crop, Adjust, Filters
4. **Real-time Preview**: Before/after comparison with mouse press/hold

## Important Technical Details
- Images are stored as File objects in browser memory with automatic URL cleanup via useEffect
- All AI requests are processed through the backend API for security and usage tracking
- The app uses manual cropping via Canvas API rather than server-side processing
- Error handling includes specific messaging for different types of API failures
- Authentication is handled via Clerk with automatic session management
- Usage tracking and billing are integrated with Stripe for pay-per-use model

## API Integration Notes
- Backend API handles all Gemini AI requests with proper authentication and validation
- Main endpoints: `/api/gemini/generate-edit`, `/api/gemini/generate-filter`, `/api/gemini/generate-adjust`, `/api/gemini/combine-photos`
- All requests include safety guidelines to prevent inappropriate content generation
- Usage limits: 20 free requests for anonymous users, unlimited for authenticated users (billed)
- Response handling includes proper error messages and usage tracking

## Gemini AI Implementation Details
- **Model**: Uses `gemini-2.5-flash-image-preview` for all image generation and editing
- **Prompt-Based System**: All image adjustments use natural language prompts, NOT sliders or structured parameters
- **Adjustment Interface**: AdjustmentPanel provides preset prompts (e.g., "Enhance Details", "Warmer Lighting") and custom text input
- **API Request Format**: Send text prompts directly to the Gemini API along with image data
- **Response Format**: Returns base64 encoded image data in `{success: true, image: {data: "base64...", mimeType: "image/png"}}` format
- **Image Processing**: Frontend converts base64 responses back to File objects for history management

## Critical Database Architecture Notes
- **Supabase Client**: Uses lazy loading pattern to prevent module loading failures
- **Database Utils**: All database functions in `utils/database.js` use `getSupabaseClient()` function instead of direct client creation
- **Route Dependencies**: Any route file that imports database utilities MUST use `const { db, supabase } = require('../utils/database')` and call `supabase()` as a function
- **Module Loading Issue**: Direct Supabase client creation at module load time will cause route loading failures when environment variables aren't available during startup
- **Fix Pattern**: Always use `await supabase().from('table')` instead of `await supabase.from('table')`
- I will start the servers on my own whenever we need to test the gui.