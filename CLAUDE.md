# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
VeilPix is an AI-powered image editing React web application that uses Google's Gemini AI model for generative image editing. The app provides localized photo editing, global filters, adjustments, and cropping capabilities through an intuitive web interface.

## Architecture
- **Frontend**: React 19 with TypeScript using Vite as the build tool
- **AI Service**: Google Gemini API (`gemini-2.5-flash-image-preview`) for image generation
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
- `services/geminiService.ts` - AI image generation service with three main functions:
  - `generateEditedImage()` - Localized edits based on hotspot clicks
  - `generateFilteredImage()` - Global stylistic filters
  - `generateAdjustedImage()` - Global photo adjustments
- `components/` - Reusable UI components for each editing panel

## Core Features Implementation
1. **Localized Editing**: Click-to-edit system where users click image hotspots for precise edits
2. **History Management**: Undo/redo system with image file versioning
3. **Multi-modal Interface**: Four editing modes - Retouch, Crop, Adjust, Filters
4. **Real-time Preview**: Before/after comparison with mouse press/hold

## Important Technical Details
- Images are stored as File objects in browser memory with automatic URL cleanup via useEffect
- All AI requests include safety guidelines to prevent inappropriate content generation
- The app uses manual cropping via Canvas API rather than server-side processing
- Error handling includes specific messaging for different types of AI model failures

## API Integration Notes
- Gemini API expects specific request format with image parts and text prompts
- Response handling checks for various failure modes (blocked content, safety filters, etc.)
- The `handleApiResponse()` function centralizes error handling across all AI operations