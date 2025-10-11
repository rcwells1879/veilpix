# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
VeilPix is an AI-powered image editing React web application that supports multiple AI providers for generative image editing. The app provides localized photo editing, global filters, adjustments, and cropping capabilities through an intuitive web interface.

## Architecture
- **Frontend**: React 19 with TypeScript using Vite as the build tool
- **Backend API**: Node.js/Express server with authentication, usage tracking, and billing
- **AI Services**:
  - **Nano Banana** (Google Gemini `gemini-2.5-flash-image-preview`) - Default provider, uses in-memory base64 encoding
  - **SeeDream 4.0** (ByteDance SeeDream V4 Edit) - Alternative provider, uses Supabase Storage for temporary image URLs
- **Authentication**: Clerk for user management and session handling
- **Database**: Supabase for usage tracking, billing records, user data, and temporary image storage
- **Payment Processing**: Stripe for billing and usage metering
- **State Management**: React hooks with local state (no external state library) + localStorage for settings persistence
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

### Frontend (.env.local)
```
# Clerk Configuration (Required)
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key

# API Configuration (Required)
# Development: Use 127.0.0.1 in WSL environments
# Production: Use production API endpoint
VITE_API_BASE_URL=https://api.veilstudio.io

# Optional: Environment
VITE_NODE_ENV=development
```

### Backend (veilpix-api/.env)
```
NODE_ENV=production
PORT=3001

# AI Service APIs
GEMINI_API_KEY=your_gemini_api_key_here
SEEDREAM_API_KEY=your_kie_ai_api_key_here
SEEDREAM_API_BASE_URL=https://api.kie.ai/v1

# Authentication (Clerk)
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# Database (Supabase)
SUPABASE_URL=https://your_project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Payment Processing (Stripe)
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret
```

### WSL Development Environment Notes
- **Critical**: When developing in WSL (Windows Subsystem for Linux), you MUST use `127.0.0.1` instead of `localhost` for API connections
- **Frontend Access**: Access the frontend at `http://127.0.0.1:5173/` instead of `http://localhost:5173/`
- **Backend API**: Backend must be configured to listen on `0.0.0.0:3001` and allow CORS from both localhost and 127.0.0.1 origins
- **Networking Issue**: JavaScript fetch requests from `localhost:5173` to `localhost:3001` may fail in WSL, but `127.0.0.1:5173` to `127.0.0.1:3001` works reliably

## Key Components Structure
- `App.tsx` - Main application with image editing state management and history
- `src/services/apiClient.ts` - HTTP client for backend API communication
- `src/hooks/useImageGeneration.ts` - React hooks for AI image generation via API
- `components/FilterPanel.tsx` - Filter selection with presets and custom input
- `components/AdjustmentPanel.tsx` - Global image adjustment controls
- `components/CropPanel.tsx` - Crop functionality with aspect ratio controls
- `components/Header.tsx` - App header with usage counter
- `components/StartScreen.tsx` - Initial upload and mode selection
- `components/CompositeScreen.tsx` - Multi-image composition interface
- `veilpix-api/routes/gemini.js` - AI image generation endpoints
- `veilpix-api/routes/auth.js` - Authentication endpoints
- `veilpix-api/routes/usage.js` - Usage tracking endpoints
- `veilpix-api/middleware/auth.js` - Clerk authentication middleware
- `veilpix-api/middleware/validation.js` - Input validation for API requests

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

### Gemini API Response Processing
- **Consistent Response Structure**: Both single image editing and multi-image combination use the same response format
- **Response Path**: Image data is located at `response.candidates[0].content.parts[]` where each part may contain `inlineData`
- **Image Part Detection**: Use `parts.find(part => part.inlineData)` to locate the image data within the response parts array
- **Data Format**: Image data structure is `{ inlineData: { data: "base64...", mimeType: "image/png" } }`
- **Critical Note**: All Gemini image generation endpoints (single edit, filter, adjust, combine) return the same response structure with `inlineData` (not `inline_data`)
- **Processing Function**: The `processGeminiResponse()` function in `routes/gemini.js` handles response parsing for all image generation endpoints uniformly

## SeeDream 4.0 AI Implementation Details
- **Model**: ByteDance SeeDream V4 Edit - Alternative AI provider for image generation and editing
- **API Provider**: Kie.ai API platform
- **Image Handling**: Unlike Gemini's base64 approach, SeeDream requires image URLs, so images are temporarily uploaded to Supabase Storage
- **Resolution Options**: Supports 1K, 2K, and 4K output resolutions (configurable in Settings menu)
- **Backend Routes**: `/api/seedream/generate-edit`, `/api/seedream/generate-filter`, `/api/seedream/generate-adjust`, `/api/seedream/combine-photos`
- **Request Format**: Images are uploaded to Supabase Storage (`temp-images` bucket), public URLs are sent to SeeDream API
- **Response Format**: SeeDream returns image URLs which are fetched and converted to base64 to match Gemini's response structure
- **Temporary Storage**: Images are automatically deleted from Supabase after SeeDream processing (2-hour cleanup window)
- **Credit System**: Uses the same unified credit deduction and usage tracking as Gemini

### SeeDream Configuration Requirements
**IMPORTANT**: SeeDream integration requires the following setup before it will work:

1. **Environment Variables** (add to `veilpix-api/.env`):
   ```env
   SEEDREAM_API_KEY=your_kie_ai_api_key_here
   SEEDREAM_API_BASE_URL=https://api.kie.ai/v1
   ```
   - Get API key from: https://kie.ai/ (requires account signup)
   - Whitelist server IP (`140.82.7.169`) in Kie.ai dashboard for API access

2. **Supabase Storage Bucket** (create in Supabase dashboard):
   - Bucket name: `temp-images`
   - Public access: Enabled (images need public URLs for SeeDream API)
   - File size limit: 10MB
   - RLS policies: Disabled (service role key bypasses RLS)

3. **API Endpoints** (Async Job Pattern):
   - Create Task: `POST https://api.kie.ai/api/v1/jobs/createTask`
   - Query Status: `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}`
   - **Flow**: Submit task → get taskId → poll recordInfo until `state === "success"` → extract resultUrls

### SeeDream API Format (Kie.ai)

**Request** (createTask):
```json
{
  "model": "bytedance/seedream-v4-edit",
  "input": {
    "prompt": "editing instruction",
    "image_urls": ["https://public-url.jpg"],
    "image_size": "square_hd",
    "image_resolution": "2K",
    "max_images": 1
  }
}
```

**Valid `image_size`**: `square`, `square_hd`, `portrait_4_3`, `portrait_3_2`, `portrait_16_9`, `landscape_4_3`, `landscape_3_2`, `landscape_16_9`, `landscape_21_9`
**Note**: Names use width:height (e.g., `portrait_4_3` = 3:4 portrait)

**Response** (recordInfo when complete):
```json
{
  "code": 200,
  "data": {
    "state": "success",
    "resultJson": "{\"resultUrls\":[\"https://output.png\"]}"
  }
}
```

**VeilPix Mapping** (UI identifier → API value):
- `transparent-1-1.png` → `square_hd`
- `transparent-16-9.png` → `landscape_16_9`
- `transparent-9-16.png` → `portrait_16_9`
- `transparent-4-3.png` → `landscape_4_3`
- `transparent-3-4.png` → `portrait_4_3`

### Settings UI
- **Location**: Header component settings icon (gear icon next to usage counter)
- **Persistence**: Settings saved to localStorage (`veilpix-settings` key)
- **Default Provider**: Nano Banana (Gemini)
- **Options**:
  - **API Provider**: Radio selection between "Nano Banana" and "SeeDream 4.0"
  - **Resolution**: Dropdown (1K/2K/4K) - only shown when SeeDream is selected
- **Conditional Hook Usage**: App.tsx dynamically switches between `useGenerateEdit()` and `useGenerateEditSeeDream()` based on settings

### SeeDream vs Nano Banana Comparison
| Feature | Nano Banana (Gemini) | SeeDream 4.0 |
|---------|---------------------|--------------|
| **Image Input** | Base64 in-memory | URLs from Supabase Storage |
| **Processing** | Direct base64 response | URL response → fetch → base64 conversion |
| **Storage** | None (in-memory only) | Temporary Supabase Storage (auto-cleanup) |
| **Resolution** | Fixed (model default) | User-selectable (1K/2K/4K) |
| **Speed** | Very fast (<2s) | Fast (<1.8s per docs) |
| **Cost** | Included in credit system | Included in credit system |

## Critical Database Architecture Notes
- **Supabase Client**: Uses lazy loading pattern with service role key to prevent module loading failures
- **Service Role Configuration**: Backend uses `SUPABASE_SERVICE_ROLE_KEY` which automatically bypasses RLS (Row Level Security) policies
- **Database Utils**: All database functions in `utils/database.js` use `getSupabaseClient()` function instead of direct client creation
- **Route Dependencies**: Any route file that imports database utilities MUST use `const { db, supabase } = require('../utils/database')` and call `supabase()` as a function
- **API Response Format**: Usage endpoints return `{totalUsage, remainingFreeUsage, isAuthenticated}` format for frontend compatibility
- **Authentication Flow**: Frontend tries authenticated endpoint first, falls back to anonymous endpoint gracefully
- **Connection Testing**: Database connection test is available via `testConnection()` function but not run on startup to prevent delays

## Troubleshooting Notes
- **WSL Networking**: Always use `127.0.0.1` instead of `localhost` in WSL environments
- **CORS Issues**: Ensure backend allows both localhost and 127.0.0.1 origins in development
- **Database Hanging**: If queries hang, check RLS policies and service role configuration
- **Usage Counter Loading**: "Loading usage..." indicates network connectivity issues, not database problems
- I will start the servers on my own whenever we need to test the GUI.

## Production Deployment (Vultr VPS)

### Server Configuration
- **Provider**: Vultr VPS
- **Plan**: Regular Performance ($6/month VPS + $3/month IPv4 = $9/month total)
- **OS**: Alpine Linux 3.22 x86_64
- **Resources**: 1 vCPU, 1GB RAM, 25GB SSD, 1TB bandwidth
- **Location**: [Your selected region]

### Network Configuration
- **IPv4 Address**: `140.82.7.169`
- **IPv6 Address**: `2001:19f0:1000:1781:5400:5ff:fea1:e84f`
- **Domain**: `api.veilstudio.io` (A record pointing to IPv4)
- **SSL**: Let's Encrypt certificate (auto-renewal configured)

### Server Access
```bash
# SSH connection (from Windows/WSL)
ssh root@140.82.7.169
# or
ssh veilpix@140.82.7.169

# SSH key location (Windows): C:\Users\Ryan Wells\.ssh\id_ed25519
```

### Application Setup
- **Application Path**: `/home/veilpix/veilpix-api/`
- **Process Manager**: PM2 (auto-restart configured)
- **Web Server**: Nginx reverse proxy
- **User Account**: `veilpix` (non-root for security)

### Service Management
```bash
# Check API status
pm2 status

# View API logs
pm2 logs veilpix-api

# Restart API
pm2 restart veilpix-api

# Check Nginx status
service nginx status

# Restart Nginx
service nginx restart

# Check server resources
htop
```

### Firewall Configuration
- **UFW Status**: Active
- **Allowed Ports**: 22 (SSH), 80 (HTTP), 443 (HTTPS)
- **SSH Access**: Key-based authentication only

### SSL Certificate
- **Certificate Path**: `/etc/letsencrypt/live/api.veilstudio.io/`
- **Auto-renewal**: Configured via crontab (daily check at 12:00)
- **Expires**: Check with `certbot certificates`
- **Manual renewal**: `certbot renew`

### Environment Configuration
Production environment file location: `/home/veilpix/veilpix-api/.env`
```env
NODE_ENV=production
PORT=3001
GEMINI_API_KEY=[your_actual_key]
CLERK_PUBLISHABLE_KEY=[test_key_currently]
CLERK_SECRET_KEY=[test_key_currently]
SUPABASE_URL=https://hjmkvroztbzmivrzjod.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[actual_service_role_key]
STRIPE_SECRET_KEY=[empty_currently]
STRIPE_WEBHOOK_SECRET=[empty_currently]
```

### Deployment Pipeline
- **Frontend**: GitHub Actions → FTP deployment (existing)
- **API**: GitHub Actions → SSH deployment to VPS
- **Triggers**: Path-based (frontend vs veilpix-api changes)

### Production URLs
- **API Health Check**: `https://api.veilstudio.io/api/health`
- **Main Endpoints**:
  - Auth: `https://api.veilstudio.io/api/auth/*`
  - Gemini: `https://api.veilstudio.io/api/gemini/*`
  - Usage: `https://api.veilstudio.io/api/usage/*`

### Monitoring & Maintenance
```bash
# Check disk usage
df -h

# Check memory usage
free -h

# Check API process
pm2 monit

# View system logs
tail -f /var/log/messages

# Check SSL certificate expiry
certbot certificates
```

### Backup & Recovery
- **Configuration Backup**: PM2 ecosystem.config.js, Nginx configs in `/etc/nginx/http.d/`
- **Environment Backup**: Securely store .env values
- **Database**: Handled by Supabase (managed service)
- **Code Backup**: GitHub repository

### Pending Production Setup
- **Clerk Production Keys**: Switch from test to production keys when ready
- **Stripe Configuration**: Add production keys and webhook endpoints
- **Gallery Feature**: Ready for Supabase Storage integration
- after making changes to the website, always check to see if we need to update sitemap.xml and deploy.yml to account for the new changes.