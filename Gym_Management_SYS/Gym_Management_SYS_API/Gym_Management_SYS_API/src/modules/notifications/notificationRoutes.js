import express from 'express';
import { protect, authorize } from '../../middleware/authMiddleware.js';
import { query } from '../../config/database.js';
import { AppError, asyncHandler } from '../../middleware/errorHandler.js';
import { validateUUID } from '../../middleware/validators.js';

const router = express.Router();
router.use(protect);

router.get('/', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM notifications WHERE user_id=$1 AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)
     ORDER BY created_at DESC LIMIT 100`, [req.user.id]);
  const unread = await query(`SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=false`, [req.user.id]);
  res.json({ success: true, data: { notifications: result.rows, unreadCount: Number(unread.rows[0].count) } });
}));

router.patch('/:id/read', validateUUID, asyncHandler(async (req, res) => {
  const result = await query(
    `UPDATE notifications SET is_read=true,read_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND user_id=$2 RETURNING *`, [req.params.id, req.user.id]);
  if (!result.rows.length) throw new AppError('Notification not found', 404);
  res.json({ success: true, data: { notification: result.rows[0] } });
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  await query(`UPDATE notifications SET is_read=true,read_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND is_read=false`, [req.user.id]);
  res.json({ success: true, message: 'All notifications marked as read' });
}));

router.post('/notifications', authorize('admin'), asyncHandler(async (req, res) => {
  const { title, message, notificationType = 'info', priority = 'normal', recipientRole, recipientIds = [] } = req.body;
  if (!title || !message) throw new AppError('Title and message are required', 400);
  let users;
  if (recipientIds.length) {
    users = await query(`SELECT id FROM users WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL`, [recipientIds]);
  } else if (recipientRole && ['member', 'trainer', 'manager', 'admin'].includes(recipientRole)) {
    users = await query(`SELECT id FROM users WHERE role=$1 AND deleted_at IS NULL`, [recipientRole]);
  } else {
    users = await query(`SELECT id FROM users WHERE deleted_at IS NULL`);
  }
  for (const user of users.rows) {
    await query(
      `INSERT INTO notifications(user_id,title,message,notification_type,priority)
       VALUES($1,$2,$3,$4,$5)`,
      [user.id, title, message, notificationType, priority]
    );
  }
  res.status(201).json({ success: true, data: { recipientCount: users.rows.length } });
}));

export default router;
