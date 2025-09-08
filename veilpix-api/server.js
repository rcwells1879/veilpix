const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for rate limiting behind reverse proxy/CDN
app.set('trust proxy', 1);

// Compression middleware
app.use(compression());

// Security middleware with enhanced configuration
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "https://api.stripe.com"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// CORS configuration with environment-based origins
const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://veilstudio.io', 'https://veilpix.vercel.app']
    : ['http://localhost:5173', 'http://localhost:3000', 'https://veilstudio.io'];

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID']
}));

// Import webhook routes (before other middleware)
const webhookRoutes = require('./routes/webhooks');

// Webhook routes need raw body parsing - must come before JSON parsing
app.use('/api/webhooks', webhookRoutes);

// Enhanced rate limiting with different limits for different endpoints
const createRateLimiter = (windowMs, max, message) => rateLimit({
    windowMs,
    max,
    message: { error: message, retryAfter: Math.ceil(windowMs / 60000) + ' minutes' },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip successful requests to only count errors
    skip: (req, res) => res.statusCode < 400
});

// Apply different rate limits (exclude webhooks from rate limiting)
app.use('/api/auth', createRateLimiter(15 * 60 * 1000, 20, 'Too many authentication requests'));
app.use('/api/gemini', createRateLimiter(15 * 60 * 1000, 50, 'Too many image generation requests'));
app.use('/api/', createRateLimiter(15 * 60 * 1000, 100, 'Too many requests from this IP'));

// Body parsing middleware with enhanced security (exclude /api/gemini for file uploads)
app.use((req, res, next) => {
    if (req.path.startsWith('/api/gemini')) {
        return next(); // Skip JSON parsing for Gemini routes (they handle multipart data)
    }
    express.json({ 
        limit: '10mb',
        strict: true,
        type: 'application/json'
    })(req, res, next);
});

app.use((req, res, next) => {
    if (req.path.startsWith('/api/gemini')) {
        return next(); // Skip URL encoding for Gemini routes
    }
    express.urlencoded({ 
        extended: true, 
        limit: '10mb',
        parameterLimit: 20
    })(req, res, next);
});

// Import routes
const authRoutes = require('./routes/auth');
const geminiRoutes = require('./routes/gemini');
const usageRoutes = require('./routes/usage');
const stripeRoutes = require('./routes/stripe');
const checkoutRoutes = require('./routes/checkout');

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/gemini', geminiRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/checkout', checkoutRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Request ID middleware for tracking
app.use((req, res, next) => {
    const { v4: uuidv4 } = require('uuid');
    req.id = uuidv4();
    res.set('X-Request-ID', req.id);
    next();
});

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            requestId: req.id,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip
        }));
    });
    
    next();
});

// 404 handler (must be before error handler)
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: 'The requested endpoint does not exist',
        path: req.originalUrl,
        timestamp: new Date().toISOString(),
        requestId: req.id
    });
});

// Global error handling middleware (must be last)
app.use((err, req, res, next) => {
    console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId: req.id,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method,
        ip: req.ip
    }));

    // Handle specific error types
    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'Request payload too large',
            message: 'Image file size exceeds maximum allowed limit',
            requestId: req.id,
            timestamp: new Date().toISOString()
        });
    }

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation error',
            message: err.message,
            requestId: req.id,
            timestamp: new Date().toISOString()
        });
    }

    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or missing authentication token',
            requestId: req.id,
            timestamp: new Date().toISOString()
        });
    }

    if (err.message && err.message.includes('CORS')) {
        return res.status(403).json({
            error: 'CORS error',
            message: 'Cross-origin request not allowed',
            requestId: req.id,
            timestamp: new Date().toISOString()
        });
    }

    // Default error response
    const statusCode = err.statusCode || err.status || 500;
    res.status(statusCode).json({
        error: statusCode === 500 ? 'Internal server error' : err.message,
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        requestId: req.id,
        timestamp: new Date().toISOString()
    });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    process.exit(0);
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 VeilPix API server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔒 CORS enabled for: ${process.env.NODE_ENV === 'development' ? 'localhost:5173' : 'veilstudio.io'}`);
});

module.exports = app;