# VeilPix API Server

Secure backend API for VeilPix image generation with authentication, usage tracking, and billing.

## Features

- 🔐 **Secure Authentication** - Clerk integration with JWT validation
- 📊 **Usage Tracking** - Supabase database for monitoring API calls
- 💳 **Stripe Billing** - Usage-based pricing at $0.07 per image generation
- 🛡️ **Security** - Rate limiting, input validation, CORS protection
- 🎨 **AI Integration** - Google Gemini API proxy for image editing
- 📝 **Request Logging** - Structured JSON logs with request IDs

## Quick Start

### 1. Environment Setup

Copy the environment template and configure your credentials:

```bash
cp .env.example .env
```

Required environment variables:
- `GEMINI_API_KEY` - Your Google Gemini API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `CLERK_SECRET_KEY` - Clerk secret key
- `STRIPE_SECRET_KEY` - Stripe secret key

### 2. Database Setup

1. Create a new Supabase project
2. Run the SQL schema from `supabase-schema.sql` in your Supabase SQL editor
3. Update your `.env` file with the Supabase credentials

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3001`

## API Endpoints

### Health Check
- `GET /api/health` - Server health status

### Authentication
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/sync` - Sync user data with Clerk

### Image Generation
- `POST /api/gemini/generate-edit` - Generate edited image
- `POST /api/gemini/generate-filter` - Apply style filter
- `POST /api/gemini/generate-adjust` - Make photo adjustments

### Usage Tracking
- `GET /api/usage/stats` - Get user usage statistics
- `GET /api/usage/anonymous/:sessionId` - Get anonymous usage

### Stripe Billing
- `POST /api/stripe/customer` - Create/get Stripe customer
- `POST /api/stripe/setup-intent` - Setup payment method
- `GET /api/stripe/payment-methods` - List payment methods

## Authentication

Send requests with the `Authorization` header:

```
Authorization: Bearer <clerk_session_token>
```

For anonymous users, include a session ID:

```
X-Session-ID: <uuid_v4>
```

## Rate Limiting

- Authentication endpoints: 20 requests per 15 minutes
- Image generation endpoints: 50 requests per 15 minutes
- General API: 100 requests per 15 minutes

## Usage Limits

- **Anonymous users**: 20 free requests per session
- **Authenticated users**: Unlimited (billed at $0.07 per request)

## Security Features

- Helmet.js for security headers
- CORS protection
- Request rate limiting
- Input validation and sanitization
- Request ID tracking
- Structured error logging

## Deployment

This API is designed to be deployed on platforms like:
- Vercel
- Railway
- Heroku
- AWS Lambda (with serverless-express)

Make sure to:
1. Set all environment variables
2. Configure CORS origins for your frontend domain
3. Set up Stripe webhooks for billing events
4. Enable database connection pooling for production

## Development

### File Structure

```
veilpix-api/
├── server.js              # Main Express server
├── routes/
│   ├── auth.js            # Authentication routes
│   ├── gemini.js          # AI image generation routes
│   ├── stripe.js          # Payment processing routes
│   └── usage.js           # Usage tracking routes
├── middleware/
│   ├── auth.js            # Authentication middleware
│   └── validation.js      # Input validation middleware
├── utils/
│   └── database.js        # Supabase database utilities
├── supabase-schema.sql    # Database schema
└── package.json
```

### Adding New Features

1. Create new routes in the `routes/` directory
2. Add middleware for validation and authentication
3. Update database schema if needed
4. Add proper error handling and logging

## Monitoring

The API includes structured JSON logging for:
- Request/response times
- Error tracking with stack traces
- Usage patterns
- Authentication events

## Support

For issues or questions, check:
1. Server logs for error details
2. Database connection status
3. Environment variable configuration
4. Clerk authentication setup