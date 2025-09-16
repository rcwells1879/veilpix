# GEMINI.md - VeilPix Project Context

This document provides a comprehensive overview of the VeilPix project, its structure, and conventions to be used as a reference for future AI interactions. It is based on the detailed information provided in the `CLAUDE.md` file.

## Project Overview

VeilPix is an AI-powered image editing web application built with React. It utilizes Google's Gemini AI model for generative image editing. The application supports localized photo editing (click-to-edit), global filters, color/lighting adjustments, and cropping through an intuitive web interface.

## Architecture

-   **Frontend**: React 19 with TypeScript and Vite.
-   **Backend API**: A Node.js/Express server responsible for authentication, usage tracking, billing, and proxying requests to the AI service.
-   **AI Service**: Google Gemini API, specifically the `gemini-2.5-flash-image-preview` model.
-   **Authentication**: Clerk is used for user management and session handling.
-   **Database**: Supabase (PostgreSQL) for usage tracking, billing records, and user data.
-   **Payment Processing**: Stripe for billing and usage metering.
-   **State Management**: Relies on React 19's built-in hooks for local state management.
-   **Styling**: Tailwind CSS with custom animations and gradients.
-   **Image Processing**: The browser's Canvas API is used for cropping, with `react-image-crop` for the selection UI.

## Development

### Key Commands

```bash
# Install dependencies for both frontend and backend
npm install

# Start the frontend development server
npm run dev

# Build the frontend for production
npm run build
```

### Environment Setup

A `.env.local` file in the root is required for the frontend.

```
# Clerk Publishable Key (Required)
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key

# API Base URL (Required)
# Use https://api.veilstudio.io for production
# Use http://127.0.0.1:3001 for local development, especially in WSL
VITE_API_BASE_URL=http://127.0.0.1:3001
```


## Key Project Structure

-   `App.tsx`: Main application component, manages state and history.
-   `src/services/apiClient.ts`: HTTP client for backend communication.
-   `src/hooks/useImageGeneration.ts`: Custom React hooks for AI generation features.
-   `components/`: Contains all React components (e.g., `FilterPanel`, `AdjustmentPanel`, `Header`).
-   `veilpix-api/`: The backend Express application.
-   `veilpix-api/routes/gemini.js`: Backend endpoints for AI image generation.
-   `veilpix-api/routes/usage.js`: Backend endpoints for usage tracking.
-   `veilpix-api/middleware/auth.js`: Clerk authentication middleware for the backend.
-   `veilpix-api/utils/database.js`: Utility functions for interacting with the Supabase database.

## API & AI Integration

All AI requests are processed through the backend for security and usage tracking.

### Key API Endpoints

-   `/api/gemini/generate-edit`
-   `/api/gemini/generate-filter`
-   `/api/gemini/generate-adjust`
-   `/api/gemini/combine-photos`

### Gemini AI Implementation

-   **Model**: `gemini-2.5-flash-image-preview`.
-   **Prompt-Based**: All adjustments and edits are driven by natural language prompts, not sliders.
-   **Response Format**: The backend processes the Gemini response and returns a consistent JSON object:
    ```json
    {
      "success": true,
      "image": {
        "data": "base64...",
        "mimeType": "image/png"
      }
    }
    ```

## Database Architecture

-   The backend uses the `supabase-js` client to interact with the Supabase database.
-   It uses a service role key (`SUPABASE_SERVICE_ROLE_KEY`) to bypass Row Level Security (RLS) for administrative tasks.
-   Database utility functions are centralized in `veilpix-api/utils/database.js`.

## Production Environment (Backend)

-   **Provider**: Vultr VPS (Alpine Linux).
-   **Domain**: `api.veilstudio.io`
-   **Process Manager**: The Node.js app is managed by PM2.
-   **Web Server**: Nginx serves as a reverse proxy.
-   **Deployment**: The API is deployed via GitHub Actions using SSH.
-   **Service Management**: Use `pm2 status`, `pm2 logs`, and `service nginx status`.
-   **Health Check**: `https://api.veilstudio.io/api/health`
