import express from 'express';
import { protect, authorize } from '../../middleware/authMiddleware.js';
import { validateUUIDParam } from '../../middleware/validators.js';
import { query, transaction } from '../../config/database.js';
import { AppError, asyncHandler } from '../../middleware/errorHandler.js';
import { writeAuditLog } from '../../utils/auditLog.js';

const router = express.Router();
router.use(protect);

router.get('/', authorize('admin', 'manager', 'member'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, full_name AS "fullName", profile_picture_url AS "profilePicture",
            status
     FROM users
     WHERE role = 'trainer' AND status = 'active' AND deleted_at IS NULL
     ORDER BY full_name`
  );
  res.json({ success: true, data: { trainers: result.rows } });
}));

router.get('/me/assignments', authorize('member'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT ta.id AS "assignmentId", ta.status, ta.assigned_at AS "assignedAt",
            ta.notes, t.id AS "trainerId", t.full_name AS "trainerName",
            t.email AS "trainerEmail", t.phone AS "trainerPhone",
            t.profile_picture_url AS "trainerProfilePicture"
     FROM trainer_assignments ta
     JOIN users t ON t.id = ta.trainer_id
     WHERE ta.member_id = $1 AND ta.status = 'active'
     ORDER BY ta.assigned_at DESC`,
    [req.user.id]
  );
  res.json({ success: true, data: { assignments: result.rows } });
}));

router.post('/:trainerId/assign', validateUUIDParam('trainerId'), authorize('member'), asyncHandler(async (req, res) => {
  const assignment = await transaction(async (client) => {
    const trainer = await client.query(
      `SELECT id, full_name, email, phone, profile_picture_url
       FROM users
       WHERE id = $1 AND role = 'trainer' AND status = 'active' AND deleted_at IS NULL`,
      [req.params.trainerId]
    );
    if (!trainer.rows.length) throw new AppError('Trainer not found or inactive', 404);

    const existing = await client.query(
      `SELECT id FROM trainer_assignments
       WHERE member_id = $1 AND trainer_id = $2 AND status = 'active'`,
      [req.user.id, req.params.trainerId]
    );
    if (existing.rows.length) throw new AppError('You are already assigned to this trainer', 409);

    const result = await client.query(
      `INSERT INTO trainer_assignments(member_id, trainer_id, status, assigned_by, notes)
       VALUES ($1, $2, 'active', $1, $3)
       ON CONFLICT (member_id, trainer_id) WHERE status = 'active' DO NOTHING
       RETURNING id, status, assigned_at, notes`,
      [req.user.id, req.params.trainerId, req.body.notes || null]
    );
    if (!result.rows.length) throw new AppError('You are already assigned to this trainer', 409);
    return { ...result.rows[0], trainer: trainer.rows[0] };
  });

  await writeAuditLog({
    actorId: req.user.id,
    action: 'member.self_assigned_trainer',
    entityType: 'trainer_assignment',
    entityId: assignment.id,
    metadata: { trainerId: req.params.trainerId },
  });
  res.status(201).json({ success: true, message: 'Trainer assigned successfully', data: { assignment } });
}));

router.delete('/me/assignments/:assignmentId', validateUUIDParam('assignmentId'), authorize('member'), asyncHandler(async (req, res) => {
  const result = await query(
    `UPDATE trainer_assignments
     SET status = 'ended', ended_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND member_id = $2 AND status = 'active'
     RETURNING id, status, ended_at`,
    [req.params.assignmentId, req.user.id]
  );
  if (!result.rows.length) throw new AppError('Active trainer assignment not found', 404);
  await writeAuditLog({
    actorId: req.user.id,
    action: 'member.ended_trainer_assignment',
    entityType: 'trainer_assignment',
    entityId: req.params.assignmentId,
  });
  res.json({ success: true, message: 'Trainer assignment ended', data: { assignment: result.rows[0] } });
}));

export default router;
