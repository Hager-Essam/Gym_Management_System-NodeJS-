import express from 'express';
import {
  getAllPayments,
  getPaymentById,
  getMemberPayments,
  processPayment,
  getPaymentStats,
} from './paymentController.js';
import {
  validateUUID,
  validatePagination,
} from '../../middleware/validators.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Admin/Manager routes
router.get('/', authorize('admin', 'manager'), validatePagination, getAllPayments);
router.get('/stats', authorize('admin', 'manager'), getPaymentStats);
router.post('/', authorize('admin', 'manager'), processPayment);

// Payment operations
router.get('/:id', validateUUID, getPaymentById);
router.get('/member/:userId', validateUUID, validatePagination, getMemberPayments);

export default router;
