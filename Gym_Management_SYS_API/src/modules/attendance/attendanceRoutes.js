import express from 'express';
import {
  checkIn,
  checkOut,
  getAllAttendance,
  getTodayAttendance,
  getMemberAttendance,
} from './attendanceController.js';
import {
  validateCheckIn,
  validateCheckOut,
  validatePagination,
} from '../../middleware/validators.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Check-in/out operations
router.post('/check-in', validateCheckIn, checkIn);
router.post('/check-out', validateCheckOut, checkOut);

// Attendance queries
router.get('/', authorize('admin', 'manager'), validatePagination, getAllAttendance);
router.get('/today', authorize('admin', 'manager'), getTodayAttendance);
router.get('/member/:userId', validatePagination, getMemberAttendance);

export default router;
