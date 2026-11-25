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
  createMember,
  updateMemberStatus,
} from './memberController.js';
import {
  validateUUID,
  validateMemberUpdate,
  validatePagination,
  validateAdminMemberCreate,
} from '../../middleware/validators.js';
import { protect, authorize, authorizeOwnerOrAdmin } from '../../middleware/authMiddleware.js';
import { uploadProfilePicture } from '../../middleware/profilePictureUpload.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Member's own profile
router.get('/me', getMyProfile);
router.patch('/me', uploadProfilePicture, validateMemberUpdate, updateMyProfile);
router.put('/me', uploadProfilePicture, validateMemberUpdate, updateMyProfile);

// Admin/Manager routes
router.get('/', authorize('admin', 'manager'), validatePagination, getAllMembers);
router.post('/', authorize('admin'), validateAdminMemberCreate, createMember);

// Member-specific routes
router.get('/:id', validateUUID, authorizeOwnerOrAdmin, getMemberById);
router.put('/:id', validateUUID, authorize('admin'), validateMemberUpdate, updateMember);
router.patch('/:id/status', validateUUID, authorize('admin'), updateMemberStatus);
router.delete('/:id', validateUUID, authorize('admin'), deleteMember);
router.get('/:id/subscription', validateUUID, authorizeOwnerOrAdmin, getMemberSubscription);
router.get('/:id/attendance', validateUUID, authorizeOwnerOrAdmin, getMemberAttendance);

export default router;
