import express from 'express';
import {
  getAllSubscriptions,
  getSubscriptionById,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  getExpiringSubscriptions,
  approveSubscription,
  rejectSubscription,
  renewSubscription,
} from './subscriptionController.js';
import {
  validateUUID,
  validateSubscriptionCreate,
  validatePagination,
} from '../../middleware/validators.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Admin/Manager routes
router.get('/', authorize('admin', 'manager'), validatePagination, getAllSubscriptions);
router.get('/expiring', authorize('admin', 'manager'), getExpiringSubscriptions);
router.patch('/:id/approve', validateUUID, authorize('admin'), approveSubscription);
router.patch('/:id/reject', validateUUID, authorize('admin'), rejectSubscription);
router.post('/:id/renew', validateUUID, authorize('admin','manager'), renewSubscription);

// Subscription operations
router.post('/', authorize('admin', 'manager', 'member'), validateSubscriptionCreate, createSubscription);
router.get('/:id', validateUUID, getSubscriptionById);
router.put('/:id', validateUUID, authorize('admin'), updateSubscription);
router.delete('/:id', validateUUID, cancelSubscription);

export default router;
