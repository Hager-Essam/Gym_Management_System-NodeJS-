import express from 'express';
import {
  register,
  login,
  refresh,
  logout,
  getMe,
} from './authController.js';
import {
  validateRegistration,
  validateLogin,
} from '../../middleware/validators.js';
import { protect } from '../../middleware/authMiddleware.js';
import { authLimiter, registerLimiter } from '../../middleware/rateLimiter.js';

const router = express.Router();

// Public routes
router.post('/register', registerLimiter, validateRegistration, register);
router.post('/login', authLimiter, validateLogin, login);
router.post('/refresh', refresh);

// Protected routes
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

export default router;
