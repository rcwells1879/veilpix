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
    
    body('x')
        .optional()
        .isNumeric()
        .withMessage('X coordinate must be a number'),
    
    body('y')
        .optional()
        .isNumeric()
        .withMessage('Y coordinate must be a number'),
    
    header('x-session-id')
        .optional()
        .isUUID(4)
        .withMessage('Session ID must be a valid UUID v4'),
    
    handleValidationErrors
];

// Validation rules for filter generation
const validateFilterGeneration = [
    body('filterType')
        .trim()
        .isLength({ min: 1, max: 500 })
        .withMessage('Filter type must be between 1 and 500 characters')
        .matches(/^[a-zA-Z0-9\s,.\-+%():&'"!?/]+$/)
        .withMessage('Filter type contains invalid characters')
        .escape(),
    
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

    // Check file size (max 50MB - supports 4K images)
    if (req.file.size > 50 * 1024 * 1024) {
        return res.status(413).json({
            error: 'File too large',
            message: 'Image file must be smaller than 50MB',
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