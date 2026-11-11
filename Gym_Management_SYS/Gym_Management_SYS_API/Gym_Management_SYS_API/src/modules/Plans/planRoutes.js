import express from 'express';
import {
  getAllPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
} from './planController.js';
import {
  validateUUID,
  validatePlanCreate,
} from '../../middleware/validators.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', getAllPlans);
router.get('/:id', validateUUID, getPlanById);

// Admin only routes
router.post('/', protect, authorize('admin'), validatePlanCreate, createPlan);
router.put('/:id', protect, authorize('admin'), validateUUID, updatePlan);
router.delete('/:id', protect, authorize('admin'), validateUUID, deletePlan);

export default router;
