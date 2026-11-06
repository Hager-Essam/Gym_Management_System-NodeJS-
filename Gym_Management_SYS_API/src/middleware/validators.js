import { body, param, query, validationResult } from 'express-validator';

// Validation result handler
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

// Registration validation
export const validateRegistration = [
  body('email')
    .trim()
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('fullName')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .isMobilePhone().withMessage('Please provide a valid phone number'),
  body('planId')
    .optional({ nullable: true, checkFalsy: true }),
  validate,
];

// Login validation
export const validateLogin = [
  body('email')
    .trim()
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
  validate,
];

// Update member profile validation
export const validateMemberUpdate = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2 }).withMessage('Full name must be at least 2 characters'),
  body('phone')
    .optional()
    .isMobilePhone().withMessage('Please provide a valid phone number'),
  body('address')
    .optional()
    .trim(),
  body('dateOfBirth')
    .optional()
    .isISO8601().withMessage('Please provide a valid date'),
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other']).withMessage('Invalid gender value'),
  body('emergencyContact')
    .optional()
    .trim(),
  validate,
];

// UUID parameter validation
export const validateUUID = [
  param('id')
    .isUUID().withMessage('Invalid ID format'),
  validate,
];

// Pagination validation
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  validate,
];

// Subscription creation validation
export const validateSubscriptionCreate = [
  body('userId')
    .isUUID().withMessage('Invalid user ID'),
  body('planId')
    .isUUID().withMessage('Invalid plan ID'),
  body('paymentMethod')
    .isIn(['card', 'cash', 'bank_transfer', 'paypal']).withMessage('Invalid payment method'),
  body('autoRenew')
    .optional()
    .isBoolean().withMessage('Auto renew must be boolean'),
  validate,
];

// Check-in validation
export const validateCheckIn = [
  body('userId')
    .isUUID().withMessage('Invalid user ID'),
  body('location')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Location too long'),
  validate,
];

// Check-out validation
export const validateCheckOut = [
  body('attendanceId')
    .isUUID().withMessage('Invalid attendance ID'),
  validate,
];

// Plan creation validation
export const validatePlanCreate = [
  body('name')
    .trim()
    .notEmpty().withMessage('Plan name is required'),
  body('tier')
    .trim()
    .notEmpty().withMessage('Tier is required'),
  body('price')
    .isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('duration')
    .isIn(['monthly', 'quarterly', 'annually']).withMessage('Invalid duration'),
  body('accessLevel')
    .isIn(['basic', 'premium', 'vip']).withMessage('Invalid access level'),
  validate,
];
