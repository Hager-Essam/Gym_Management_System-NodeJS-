import express from 'express';
import {
  getAllPayments,
  getPaymentById,
  getMemberPayments,
  processPayment,
  getPaymentStats,
} from './paymentController.js';
import {
  createMemberCheckout,
  confirmMemberCheckout,
  getMemberPaymentHistory,
  validateCheckoutBody,
} from './memberPaymentController.js';
import {
  validateUUID,
  validateUUIDParam,
  validatePagination,
  validateManualPayment,
} from '../../middleware/validators.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Admin/Manager routes
router.get('/', authorize('admin', 'manager'), validatePagination, getAllPayments);
router.get('/stats', authorize('admin', 'manager'), getPaymentStats);
router.get('/history', authorize('member'), validatePagination, getMemberPaymentHistory);
router.post('/checkout', authorize('member'), validateCheckoutBody, createMemberCheckout);
router.post('/:paymentId/confirm', authorize('member'), validateUUIDParam('paymentId'), confirmMemberCheckout);
router.get('/member/:userId', validateUUIDParam('userId'), authorize('admin','manager','member'), validatePagination, getMemberPayments);
router.post('/', authorize('admin'), validateManualPayment, processPayment);

// Payment operations
router.get('/:id', validateUUID, authorize('admin','manager','member'), getPaymentById);

export default router;
