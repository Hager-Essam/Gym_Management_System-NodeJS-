import express from 'express';
import {
  getAllMembers,
  getMemberById,
  getMyProfile,
  updateMyProfile,
  updateMember,
  deleteMember,
  getMemberSubscription,
  getMemberAttendance,
} from './memberController.js';
import {
  validateUUID,
  validateMemberUpdate,
  validatePagination,
} from '../../middleware/validators.js';
import { protect, authorize, authorizeOwnerOrAdmin } from '../../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Member's own profile
router.get('/me', getMyProfile);
router.patch('/me', validateMemberUpdate, updateMyProfile);

// Admin/Manager routes
router.get('/', authorize('admin', 'manager'), validatePagination, getAllMembers);

// Member-specific routes
router.get('/:id', validateUUID, authorizeOwnerOrAdmin, getMemberById);
router.put('/:id', validateUUID, authorize('admin'), validateMemberUpdate, updateMember);
router.delete('/:id', validateUUID, authorize('admin'), deleteMember);
router.get('/:id/subscription', validateUUID, authorizeOwnerOrAdmin, getMemberSubscription);
router.get('/:id/attendance', validateUUID, authorizeOwnerOrAdmin, getMemberAttendance);

export default router;
