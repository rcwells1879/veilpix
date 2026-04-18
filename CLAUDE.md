# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
VeilPix is an AI-powered image editing React web application that supports multiple AI providers for generative image editing. The app provides localized photo editing, global filters, adjustments, and cropping capabilities through an intuitive web interface.

## Architecture
- **Frontend**: React 19 with TypeScript using Vite as the build tool
- **Backend API**: Node.js/Express server with authentication, usage tracking, and billing
- **AI Services**:
  - **Nano Banana 2** (Google Gemini 3.1 Flash `nano-banana-2` via kie.ai) - Default provider, uses Supabase Storage for temporary image URLs
  - **SeeDream 4.5** (ByteDance SeeDream V4 Edit) - Alternative provider, uses Supabase Storage for temporary image URLs
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

# AI Service APIs (all providers share the same kie.ai API key)
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
- `veilpix-api/routes/nanobanana2.js` - Nano Banana 2 AI image generation endpoints
- `veilpix-api/routes/wanimage.js` - Wan 2.7 Image generation endpoints
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
- Backend API handles all Nano Banana 2 AI requests with proper authentication and validation
- Main endpoints: `/api/nanobanana2/generate-edit`, `/api/nanobanana2/generate-filter`, `/api/nanobanana2/generate-adjust`, `/api/nanobanana2/combine-photos`
- All requests include safety guidelines to prevent inappropriate content generation
- Usage limits: 20 free requests for anonymous users, unlimited for authenticated users (billed)
- Response handling includes proper error messages and usage tracking

## Nano Banana 2 AI Implementation Details
- **Model**: Uses `nano-banana-2` via kie.ai API (Google Gemini 3.1 Flash)
- **API Provider**: Kie.ai API platform (same infrastructure as SeeDream and Nano Banana Pro)
- **Image Handling**: Like SeeDream, Nano Banana 2 requires image URLs, so images are temporarily uploaded to Supabase Storage
- **Prompt-Based System**: All image adjustments use natural language prompts, NOT sliders or structured parameters
- **Adjustment Interface**: AdjustmentPanel provides preset prompts (e.g., "Enhance Details", "Warmer Lighting") and custom text input
- **API Request Format**: Images are uploaded to Supabase Storage (`temp-images` bucket), public URLs are sent to kie.ai API
- **Response Format**: Returns image URLs which are fetched and converted to base64 to match unified response structure `{success: true, image: {data: "base64...", mimeType: "image/png"}}`
- **Image Processing**: Frontend converts base64 responses back to File objects for history management
- **Credit Cost**: 2 credits per image
- **Backend Routes**: `/api/nanobanana2/generate-edit`, `/api/nanobanana2/generate-filter`, `/api/nanobanana2/generate-adjust`, `/api/nanobanana2/combine-photos`
- **Temporary Storage**: Images are automatically deleted from Supabase after processing (2-hour cleanup window)

## SeeDream 4.5 AI Implementation Details
- **Model**: ByteDance SeeDream V4 Edit - Alternative AI provider for image generation and editing
- **API Provider**: Kie.ai API platform
- **Image Handling**: Like Nano Banana 2, SeeDream requires image URLs, so images are temporarily uploaded to Supabase Storage
- **Resolution Options**: Supports 1K, 2K, and 4K output resolutions (configurable in Settings menu)
- **Backend Routes**: `/api/seedream/generate-edit`, `/api/seedream/generate-filter`, `/api/seedream/generate-adjust`, `/api/seedream/combine-photos`
- **Request Format**: Images are uploaded to Supabase Storage (`temp-images` bucket), public URLs are sent to SeeDream API
- **Response Format**: SeeDream returns image URLs which are fetched and converted to base64 to match the unified response structure
- **Temporary Storage**: Images are automatically deleted from Supabase after SeeDream processing (2-hour cleanup window)
- **Credit System**: Uses the same unified credit deduction and usage tracking as Nano Banana 2

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

### SeeDream 4.5 Edit API Format (Kie.ai)

**Request** (createTask):
```json
{
  "model": "seedream/4.5-edit",
  "input": {
    "prompt": "editing instruction",
    "image_urls": ["https://public-url.jpg"],
    "aspect_ratio": "1:1",
    "quality": "basic"
  }
}
```

**Valid `aspect_ratio`**: `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `2:3`, `3:2`, `21:9`
**Valid `quality`**: `basic` (2K output), `high` (4K output)

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
- `transparent-1-1.png` → `1:1`
- `transparent-16-9.png` → `16:9`
- `transparent-9-16.png` → `9:16`
- `transparent-4-3.png` → `4:3`
- `transparent-3-4.png` → `3:4`

### Settings UI
- **Location**: Header component settings icon (gear icon next to usage counter)
- **Persistence**: Settings saved to localStorage (`veilpix-settings` key)
- **Default Provider**: Nano Banana 2
- **Provider Options**: `'nanobanana2' | 'seedream' | 'nanobananapro' | 'wanimage'`
- **Options**:
  - **API Provider**: Radio selection between "Nano Banana 2", "SeeDream 4.5", and "Nano Banana Pro"
  - **Resolution**: Dropdown (1K/2K/4K) - only shown when SeeDream is selected
- **Hook Selection**: App.tsx calls ALL provider hooks unconditionally (Rules of Hooks compliant) and selects the active one via object lookup based on `settings.apiProvider`. For text-to-image, Wan Image is auto-selected when After Dark mode is enabled.

### Nano Banana 2 vs SeeDream 4.5 Comparison
| Feature | Nano Banana 2 (Gemini 3.1 Flash) | SeeDream 4.5 |
|---------|----------------------------------|--------------|
| **Image Input** | URLs from Supabase Storage | URLs from Supabase Storage |
| **Processing** | URL response → fetch → base64 conversion | URL response → fetch → base64 conversion |
| **Storage** | Temporary Supabase Storage (auto-cleanup) | Temporary Supabase Storage (auto-cleanup) |
| **Resolution** | Fixed (model default) | User-selectable (1K/2K/4K) |
| **Speed** | Very fast (<2s) | Fast (<1.8s per docs) |
| **Cost** | 2 credits per image | Included in credit system |
| **API Provider** | Kie.ai (same as SeeDream) | Kie.ai |

## Wan 2.7 Image AI Implementation Details
- **Model**: `wan/2-7-image` via Kie.ai API
- **API Provider**: Kie.ai API platform (same infrastructure as SeeDream and Nano Banana)
- **Image Handling**: Like other providers, images are temporarily uploaded to Supabase Storage
- **Image Input Field**: `input_urls` (NOT `image_urls` like SeeDream)
- **Resolution Options**: Supports 1K, 2K, and 4K output resolutions (direct strings, no quality mapping)
- **Aspect Ratios**: `1:1`, `16:9`, `4:3`, `21:9`, `3:4`, `9:16`, `8:1`, `1:8`
- **Text-to-Image**: Supports text-to-image with `thinking_mode: true` for improved quality
- **NSFW Filter**: Defaults to `false` (more permissive) — becomes default text-to-image provider when After Dark is enabled
- **Credit Cost**: 1 credit per generation (cheaper than NB2/SeeDream at 2 credits)
- **Backend Routes**: `/api/wanimage/generate-edit`, `/api/wanimage/generate-filter`, `/api/wanimage/generate-adjust`, `/api/wanimage/combine-photos`, `/api/wanimage/generate-text-to-image`
- **Request Parameters**: All requests include `n: 1`, `watermark: false`
- **Async Job Pattern**: Same as SeeDream — createTask → poll recordInfo → get resultUrls
- **Polling**: 2-second interval, max 150 attempts (5 minutes timeout)
- **Provider ID**: `wanimage` in Settings UI

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
# Or read log files directly via SSH:
# ssh root@140.82.7.169 "tail -100 /home/veilpix/veilpix-api/logs/out-0.log"

# Restart API (SAFE method - never use `pm2 restart`)
pm2 delete veilpix-api || true
sleep 2
cd /home/veilpix/veilpix-api && pm2 start ecosystem.config.js

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
SEEDREAM_API_KEY=[your_kie_ai_key]
SEEDREAM_API_BASE_URL=https://api.kie.ai/v1
CLERK_PUBLISHABLE_KEY=[test_key_currently]
CLERK_SECRET_KEY=[test_key_currently]
SUPABASE_URL=https://hjmkvroztbzmivrzjod.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[actual_service_role_key]
STRIPE_SECRET_KEY=[empty_currently]
STRIPE_WEBHOOK_SECRET=[empty_currently]
```

### Deployment Pipeline
- **Frontend**: GitHub Actions (`deploy.yml`) → FTP deployment to shared hosting
- **API**: GitHub Actions (`deploy-api.yml`) → SCP + SSH deployment to VPS
- **Triggers**: Path-based (frontend changes trigger `deploy.yml`, `veilpix-api/` changes trigger `deploy-api.yml`)
- **No git repo on server**: The VPS does NOT have a git repository. Code is deployed by SCP'ing the built `veilpix-api/` directory to `/home/veilpix/veilpix-api-new`, then the SSH step swaps it into place, restores `.env` from backup, runs `npm ci`, and does a clean PM2 restart.
- **Do NOT use `git pull` on the server** — there is no repo to pull from. Always deploy through CI/CD or manual SCP.

### Critical PM2 Server Rules
- **PM2 runs under the `veilpix` user**, NOT root. The CI/CD SSH action runs as a user with PM2 in its PATH.
- **NEVER run `pm2 restart veilpix-api`** — this causes an `EADDRINUSE` crash-loop because the old process hasn't released port 3001 before the new one starts. The restart counter inflates to hundreds and logs get flooded.
- **Correct way to restart**: `pm2 delete veilpix-api || true; sleep 2; pm2 start ecosystem.config.js` — this fully stops the process, waits for the port to be released, then starts fresh. This is exactly what the CI/CD deploy script does.
- **Preferred approach**: Let CI/CD handle deployments by pushing to `main` with changes in `veilpix-api/`. Only manually restart as a last resort.
- **If manually deploying a single file**: SCP the file, then use `pm2 delete + sleep + pm2 start` (never `pm2 restart`).
- **PM2 exec_mode**: Must be `fork` (set in `ecosystem.config.js`). Cluster mode on this single-CPU VPS causes port binding races.
- **Logs location**: `/home/veilpix/veilpix-api/logs/out-0.log` and `combined-0.log` (configured in ecosystem.config.js)
- **To read logs via SSH**: `ssh root@140.82.7.169 "tail -100 /home/veilpix/veilpix-api/logs/out-0.log"`

### Production URLs
- **API Health Check**: `https://api.veilstudio.io/api/health`
- **Main Endpoints**:
  - Auth: `https://api.veilstudio.io/api/auth/*`
  - Nano Banana 2: `https://api.veilstudio.io/api/nanobanana2/*`
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