const { body, header, validationResult } = require('express-validator');

// Validation middleware to check for errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            message: 'Invalid input data',
            details: errors.array(),
            requestId: req.id,
            timestamp: new Date().toISOString()
        });
    }
    next();
};

// Validation rules for image generation endpoints
const validateImageGeneration = [
    body('prompt')
        .trim()
        .isLength({ min: 1, max: 500 })
        .withMessage('Prompt must be between 1 and 500 characters')
        .escape(),
    
    body('hotspotX')
        .optional()
        .isNumeric()
        .withMessage('Hotspot X must be a number')
        .custom((value) => {
            if (value < 0 || value > 1) {
                throw new Error('Hotspot X must be between 0 and 1');
            }
            return true;
        }),
    
    body('hotspotY')
        .optional()
        .isNumeric()
        .withMessage('Hotspot Y must be a number')
        .custom((value) => {
            if (value < 0 || value > 1) {
                throw new Error('Hotspot Y must be between 0 and 1');
            }
            return true;
        }),
    
    header('x-session-id')
        .optional()
        .isUUID(4)
        .withMessage('Session ID must be a valid UUID v4'),
    
    handleValidationErrors
];

// Validation rules for filter generation
const validateFilterGeneration = [
    body('style')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Style must be between 1 and 100 characters')
        .isIn([
            'vintage', 'black-and-white', 'sepia', 'warm', 'cool', 'dramatic',
            'soft', 'bright', 'dark', 'retro', 'modern', 'artistic', 'cinematic',
            'portrait', 'landscape', 'nature', 'urban', 'minimal', 'vibrant'
        ])
        .withMessage('Invalid style selected'),
    
    header('x-session-id')
        .optional()
        .isUUID(4)
        .withMessage('Session ID must be a valid UUID v4'),
    
    handleValidationErrors
];

// Validation rules for adjustment generation
const validateAdjustmentGeneration = [
    body('adjustment')
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Adjustment must be between 1 and 200 characters')
        .matches(/^[a-zA-Z0-9\s,.\-+%():&'"!?/]+$/)
        .withMessage('Adjustment contains invalid characters')
        .escape(),
    
    header('x-session-id')
        .optional()
        .isUUID(4)
        .withMessage('Session ID must be a valid UUID v4'),
    
    handleValidationErrors
];

// File validation middleware
const validateImageFile = (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({
            error: 'No image file provided',
            message: 'Please upload a valid image file',
            requestId: req.id,
            timestamp: new Date().toISOString()
        });
    }

    // Check file size (max 10MB)
    if (req.file.size > 10 * 1024 * 1024) {
        return res.status(413).json({
            error: 'File too large',
            message: 'Image file must be smaller than 10MB',
            requestId: req.id,
            timestamp: new Date().toISOString()
        });
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
            error: 'Invalid file type',
            message: 'Only JPEG, PNG, WebP, and GIF images are allowed',
            requestId: req.id,
            timestamp: new Date().toISOString()
        });
    }

    next();
};

module.exports = {
    validateImageGeneration,
    validateFilterGeneration,
    validateAdjustmentGeneration,
    validateImageFile,
    handleValidationErrors
};