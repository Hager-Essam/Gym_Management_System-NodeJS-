import express from 'express';
import bcrypt from 'bcrypt';
import { protect, authorize } from '../../middleware/authMiddleware.js';
import { validatePagination, validateUUID } from '../../middleware/validators.js';
import { query, transaction } from '../../config/database.js';
import { AppError, asyncHandler } from '../../middleware/errorHandler.js';
import { writeAuditLog } from '../../utils/auditLog.js';

const router = express.Router();
router.use(protect);

router.get('/dashboard', authorize('admin', 'manager'), asyncHandler(async (req, res) => {
  const [members, subscriptions, trainers, revenue, recentPayments, recentRegistrations,
    upcomingClasses, attendance] = await Promise.all([
    query(`SELECT
      COUNT(*) FILTER (WHERE role='member') AS total_members,
      COUNT(*) FILTER (WHERE role='member' AND status='active') AS active_members,
      COUNT(*) FILTER (WHERE role='member' AND status IN ('inactive','suspended')) AS inactive_members
      FROM users WHERE deleted_at IS NULL`),
    query(`SELECT
      COUNT(*) FILTER (WHERE status='active') AS active_subscriptions,
      COUNT(*) FILTER (WHERE status='pending') AS pending_subscriptions,
      COUNT(*) FILTER (WHERE status='expired') AS expired_subscriptions
      FROM subscriptions WHERE deleted_at IS NULL`),
    query(`SELECT COUNT(*) AS total_trainers FROM users
      WHERE role='trainer' AND deleted_at IS NULL`),
    query(`SELECT COALESCE(SUM(amount),0) AS total_revenue
      FROM payments WHERE status='completed'`),
    query(`SELECT p.*, u.full_name FROM payments p
      JOIN users u ON u.id=p.user_id
      ORDER BY p.created_at DESC LIMIT 10`),
    query(`SELECT id, full_name, email, created_at FROM users
      WHERE role='member' AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 10`),
    query(`SELECT cs.*, c.name AS class_name, u.full_name AS trainer_name
      FROM class_schedules cs
      JOIN classes c ON c.id=cs.class_id
      LEFT JOIN users u ON u.id=cs.trainer_id
      WHERE cs.status='scheduled' AND cs.scheduled_date >= CURRENT_DATE
      ORDER BY cs.scheduled_date, cs.start_time LIMIT 10`),
    query(`SELECT
      COUNT(*) AS total_today,
      COUNT(*) FILTER (WHERE check_out_time IS NULL) AS currently_checked_in
      FROM attendance WHERE DATE(check_in_time)=CURRENT_DATE`),
  ]);

  res.json({
    success: true,
    data: {
      totalMembers: Number(members.rows[0].total_members),
      activeMembers: Number(members.rows[0].active_members),
      inactiveMembers: Number(members.rows[0].inactive_members),
      activeSubscriptions: Number(subscriptions.rows[0].active_subscriptions),
      pendingSubscriptions: Number(subscriptions.rows[0].pending_subscriptions),
      expiredSubscriptions: Number(subscriptions.rows[0].expired_subscriptions),
      totalTrainers: Number(trainers.rows[0].total_trainers),
      totalRevenue: Number(revenue.rows[0].total_revenue),
      recentPayments: recentPayments.rows,
      recentRegistrations: recentRegistrations.rows,
      upcomingClasses: upcomingClasses.rows,
      attendanceOverview: attendance.rows[0],
    },
  });
}));

router.get('/trainers', authorize('admin', 'manager'), validatePagination, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, status } = req.query;
  const params = [];
  const filters = [`role='trainer'`, `deleted_at IS NULL`];
  if (search) {
    params.push(`%${search}%`);
    filters.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  if (status) {
    params.push(status);
    filters.push(`status=$${params.length}`);
  }
  const offset = (Number(page) - 1) * Number(limit);
  params.push(Number(limit), offset);
  const result = await query(
    `SELECT id, full_name, email, phone, status, created_at
     FROM users WHERE ${filters.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const count = await query(
    `SELECT COUNT(*) FROM users WHERE ${filters.join(' AND ')}`,
    params.slice(0, params.length - 2)
  );
  res.json({
    success: true,
    data: {
      trainers: result.rows,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(Number(count.rows[0].count) / Number(limit)),
        totalTrainers: Number(count.rows[0].count),
        limit: Number(limit),
      },
    },
  });
}));

router.get('/trainers/:id', validateUUID, authorize('admin', 'manager'), asyncHandler(async (req, res) => {
  const trainer = await query(
    `SELECT id,full_name,email,phone,status,created_at,updated_at
     FROM users WHERE id=$1 AND role='trainer' AND deleted_at IS NULL`,
    [req.params.id]
  );
  if (!trainer.rows.length) throw new AppError('Trainer not found', 404);
  const schedules = await query(
    `SELECT cs.*,c.name AS class_name
     FROM class_schedules cs JOIN classes c ON c.id=cs.class_id
     WHERE cs.trainer_id=$1
     ORDER BY cs.scheduled_date DESC,cs.start_time DESC LIMIT 50`,
    [req.params.id]
  );
  const members = await query(
    `SELECT u.id,u.full_name,u.email,u.status,ta.assigned_at,ta.notes
     FROM trainer_assignments ta
     JOIN users u ON u.id=ta.member_id
     WHERE ta.trainer_id=$1 AND ta.status='active'
     ORDER BY ta.assigned_at DESC`,
    [req.params.id]
  );
  res.json({
    success: true,
    data: { trainer: trainer.rows[0], schedules: schedules.rows, assignedMembers: members.rows },
  });
}));

router.post('/trainers', authorize('admin'), asyncHandler(async (req, res) => {
  const { email, password, fullName, phone, status = 'active' } = req.body;
  if (!email || !password || !fullName) {
    throw new AppError('Email, password, and full name are required', 400);
  }
  if (!['active', 'inactive', 'suspended'].includes(status)) {
    throw new AppError('Invalid trainer status', 400);
  }
  const existing = await query(
    'SELECT id FROM users WHERE LOWER(email)=LOWER($1) AND deleted_at IS NULL',
    [email.trim().toLowerCase()]
  );
  if (existing.rows.length > 0) {
    throw new AppError('A user with this email already exists', 409);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (email,password_hash,full_name,phone,role,status,email_verified)
     VALUES ($1,$2,$3,$4,'trainer',$5,false)
     RETURNING id,email,full_name,phone,role,status,created_at`,
    [email.trim().toLowerCase(), passwordHash, fullName, phone || null, status]
  );
  await writeAuditLog({
    actorId: req.user.id,
    action: 'trainer.created',
    entityType: 'trainer',
    entityId: result.rows[0].id,
  });
  res.status(201).json({ success: true, data: { trainer: result.rows[0] } });
}));

router.get('/staff', authorize('admin'), validatePagination, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, role, status, search } = req.query;
  const filters = [`role IN ('manager','trainer')`, `deleted_at IS NULL`];
  const values = [];
  if (role) { values.push(role); filters.push(`role=$${values.length}`); }
  if (status) { values.push(status); filters.push(`status=$${values.length}`); }
  if (search) { values.push(`%${search}%`); filters.push(`(full_name ILIKE $${values.length} OR email ILIKE $${values.length})`); }
  const offset = (Number(page)-1)*Number(limit);
  values.push(Number(limit), offset);
  const result = await query(
    `SELECT id,full_name,email,phone,role,status,created_at,updated_at
     FROM users WHERE ${filters.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`,
    values
  );
  const countValues = values.slice(0,-2);
  const count = await query(`SELECT COUNT(*) FROM users WHERE ${filters.join(' AND ')}`, countValues);
  res.json({ success:true, data:{staff:result.rows,pagination:{currentPage:Number(page),limit:Number(limit),totalRecords:Number(count.rows[0].count),totalPages:Math.ceil(Number(count.rows[0].count)/Number(limit))}}});
}));

router.post('/staff', authorize('admin'), asyncHandler(async (req, res) => {
  const { email, password, fullName, phone, role = 'manager', status = 'active' } = req.body;
  if (!email || !password || !fullName) throw new AppError('Email, password, and full name are required', 400);
  if (!['manager','trainer'].includes(role)) throw new AppError('Staff role must be manager or trainer', 400);
  if (!['active','inactive','suspended'].includes(status)) throw new AppError('Invalid staff status', 400);
  const existing = await query(
    'SELECT id FROM users WHERE LOWER(email)=LOWER($1) AND deleted_at IS NULL',
    [email.trim().toLowerCase()]
  );
  if (existing.rows.length) throw new AppError('A user with this email already exists', 409);
  const bcrypt = (await import('bcrypt')).default;
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users(email,password_hash,full_name,phone,role,status,email_verified)
     VALUES($1,$2,$3,$4,$5,$6,false)
     RETURNING id,email,full_name,phone,role,status,created_at`,
    [email.trim().toLowerCase(),passwordHash,fullName,phone||null,role,status]
  );
  await writeAuditLog({actorId:req.user.id,action:'staff.created',entityType:'staff',entityId:result.rows[0].id,metadata:{role}});
  res.status(201).json({success:true,data:{staff:result.rows[0]}});
}));

router.get('/reports/revenue', authorize('admin', 'manager'), asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const values = [];
  const filters = [`status='completed'`];
  if (startDate) { values.push(startDate); filters.push(`created_at >= $${values.length}`); }
  if (endDate) { values.push(endDate); filters.push(`created_at <= $${values.length}`); }
  const result = await query(
    `SELECT COALESCE(SUM(amount),0) AS revenue,
            COUNT(*) AS transactions,
            COALESCE(AVG(amount),0) AS average_transaction
     FROM payments WHERE ${filters.join(' AND ')}`,
    values
  );
  const monthly = await query(
    `SELECT TO_CHAR(DATE_TRUNC('month',created_at),'YYYY-MM') AS month,
            SUM(amount) AS revenue, COUNT(*) AS transactions
     FROM payments WHERE ${filters.join(' AND ')}
     GROUP BY DATE_TRUNC('month',created_at)
     ORDER BY month DESC`,
    values
  );
  res.json({ success: true, data: { ...result.rows[0], monthly: monthly.rows } });
}));

router.get('/reports/members', authorize('admin', 'manager'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT status, COUNT(*) AS count
     FROM users WHERE role='member' AND deleted_at IS NULL
     GROUP BY status
     UNION ALL
     SELECT 'total' AS status, COUNT(*) AS count
     FROM users WHERE role='member' AND deleted_at IS NULL`
  );
  const growth = await query(
    `SELECT TO_CHAR(DATE_TRUNC('month',created_at),'YYYY-MM') AS month, COUNT(*) AS registrations
     FROM users WHERE role='member' AND deleted_at IS NULL
     GROUP BY DATE_TRUNC('month',created_at)
     ORDER BY month DESC LIMIT 12`
  );
  res.json({ success: true, data: { statistics: result.rows, growth: growth.rows } });
}));

router.get('/reports/subscriptions', authorize('admin', 'manager'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT status, COUNT(*) AS count
     FROM subscriptions WHERE deleted_at IS NULL GROUP BY status`
  );
  res.json({ success: true, data: { statistics: result.rows } });
}));

router.get('/reports/attendance', authorize('admin', 'manager'), asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const values = [];
  const filters = [];
  if (startDate) { values.push(startDate); filters.push(`check_in_time >= $${values.length}`); }
  if (endDate) { values.push(endDate); filters.push(`check_in_time <= $${values.length}`); }
  const result = await query(
    `SELECT COUNT(*) AS total_visits,
            COUNT(*) FILTER (WHERE access_granted=true) AS granted_visits,
            COUNT(*) FILTER (WHERE access_granted=false) AS denied_visits
     FROM attendance ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}`,
    values
  );
  res.json({ success: true, data: result.rows[0] });
}));

router.get('/reports/classes', authorize('admin', 'manager'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT c.id,c.name,c.capacity,
            COUNT(*) FILTER (WHERE cb.booking_status='confirmed') AS confirmed_bookings,
            COUNT(*) FILTER (WHERE cb.booking_status='attended') AS attended_bookings
     FROM classes c
     LEFT JOIN class_schedules cs ON cs.class_id=c.id
     LEFT JOIN class_bookings cb ON cb.schedule_id=cs.id
     WHERE c.deleted_at IS NULL
     GROUP BY c.id,c.name,c.capacity
     ORDER BY c.name`
  );
  res.json({ success: true, data: { occupancy: result.rows } });
}));

router.get('/audit-logs', authorize('admin'), validatePagination, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (Number(page)-1)*Number(limit);
  const result = await query(
    `SELECT al.*, u.full_name AS actor_name, u.email AS actor_email
     FROM audit_logs al LEFT JOIN users u ON u.id=al.actor_id
     ORDER BY al.created_at DESC LIMIT $1 OFFSET $2`,
    [Number(limit), offset]
  );
  const count = await query(`SELECT COUNT(*) FROM audit_logs`);
  res.json({
    success: true,
    data: {
      logs: result.rows,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(Number(count.rows[0].count)/Number(limit)),
        totalRecords: Number(count.rows[0].count),
        limit: Number(limit),
      },
    },
  });
}));

router.put('/trainers/:id', validateUUID, authorize('admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { fullName, phone, status } = req.body;
  const updates = [];
  const values = [];
  let count = 1;
  if (fullName !== undefined) { updates.push(`full_name=$${count++}`); values.push(fullName); }
  if (phone !== undefined) { updates.push(`phone=$${count++}`); values.push(phone); }
  if (status !== undefined) {
    if (!['active', 'inactive', 'suspended'].includes(status)) {
      throw new AppError('Invalid trainer status', 400);
    }
    updates.push(`status=$${count++}`); values.push(status);
  }
  if (updates.length === 0) throw new AppError('No fields to update', 400);
  values.push(id);
  const result = await query(
    `UPDATE users SET ${updates.join(', ')}, updated_at=NOW()
     WHERE id=$${count} AND role='trainer' AND deleted_at IS NULL
     RETURNING id,email,full_name,phone,role,status,updated_at`,
    values
  );
  if (result.rows.length === 0) throw new AppError('Trainer not found', 404);
  res.json({ success: true, data: { trainer: result.rows[0] } });
}));

router.patch('/trainers/:id/status', validateUUID, authorize('admin'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'inactive', 'suspended'].includes(status)) {
    throw new AppError('Invalid trainer status', 400);
  }
  const result = await query(
    `UPDATE users SET status=$1,updated_at=NOW()
     WHERE id=$2 AND role='trainer' AND deleted_at IS NULL
     RETURNING id,email,full_name,status,updated_at`,
    [status, req.params.id]
  );
  if (result.rows.length === 0) throw new AppError('Trainer not found', 404);
  await writeAuditLog({actorId:req.user.id,action:'trainer.status_changed',entityType:'trainer',entityId:req.params.id,metadata:{status}});
  res.json({ success: true, data: { trainer: result.rows[0] } });
}));

router.put('/staff/:id', validateUUID, authorize('admin'), asyncHandler(async (req, res) => {
  const { fullName, phone, role, status } = req.body;
  if (role !== undefined && !['manager','trainer'].includes(role)) {
    throw new AppError('Staff role must be manager or trainer', 400);
  }
  if (status !== undefined && !['active','inactive','suspended'].includes(status)) {
    throw new AppError('Invalid staff status', 400);
  }
  const updates=[]; const values=[]; let index=1;
  if(fullName!==undefined){updates.push(`full_name=$${index++}`);values.push(fullName);}
  if(phone!==undefined){updates.push(`phone=$${index++}`);values.push(phone);}
  if(role!==undefined){updates.push(`role=$${index++}`);values.push(role);}
  if(status!==undefined){updates.push(`status=$${index++}`);values.push(status);}
  if(!updates.length) throw new AppError('No fields to update',400);
  values.push(req.params.id);
  const result=await query(
    `UPDATE users SET ${updates.join(',')},updated_at=NOW()
     WHERE id=$${index} AND role IN ('manager','trainer') AND deleted_at IS NULL
     RETURNING id,full_name,email,phone,role,status,updated_at`,
    values
  );
  if(!result.rows.length) throw new AppError('Staff member not found',404);
  await writeAuditLog({actorId:req.user.id,action:'staff.updated',entityType:'staff',entityId:req.params.id,metadata:req.body});
  res.json({success:true,data:{staff:result.rows[0]}});
}));

router.patch('/staff/:id/status', validateUUID, authorize('admin'), asyncHandler(async (req, res) => {
  const { status }=req.body;
  if(!['active','inactive','suspended'].includes(status)) throw new AppError('Invalid staff status',400);
  const result=await query(
    `UPDATE users SET status=$1,updated_at=NOW()
     WHERE id=$2 AND role IN ('manager','trainer') AND deleted_at IS NULL
     RETURNING id,full_name,email,role,status,updated_at`,
    [status,req.params.id]
  );
  if(!result.rows.length) throw new AppError('Staff member not found',404);
  await writeAuditLog({actorId:req.user.id,action:'staff.status_changed',entityType:'staff',entityId:req.params.id,metadata:{status}});
  res.json({success:true,data:{staff:result.rows[0]}});
}));

router.delete('/staff/:id', validateUUID, authorize('admin'), asyncHandler(async (req, res) => {
  const result=await query(
    `UPDATE users SET deleted_at=NOW(),updated_at=NOW()
     WHERE id=$1 AND role IN ('manager','trainer') AND deleted_at IS NULL
     RETURNING id`,
    [req.params.id]
  );
  if(!result.rows.length) throw new AppError('Staff member not found',404);
  await writeAuditLog({actorId:req.user.id,action:'staff.deleted',entityType:'staff',entityId:req.params.id});
  res.json({success:true,message:'Staff member deleted successfully'});
}));

router.get('/member-trainer-assignments', authorize('admin','manager'), validatePagination, asyncHandler(async (req, res) => {
  const { memberId, trainerId, status='active', page=1, limit=20 }=req.query;
  const filters=['ta.status=$1']; const values=[status]; let index=2;
  if(memberId){filters.push(`ta.member_id=$${index++}`);values.push(memberId);}
  if(trainerId){filters.push(`ta.trainer_id=$${index++}`);values.push(trainerId);}
  const offset=(Number(page)-1)*Number(limit); values.push(Number(limit),offset);
  const result=await query(
    `SELECT ta.*,m.full_name AS member_name,m.email AS member_email,
            t.full_name AS trainer_name,t.email AS trainer_email
     FROM trainer_assignments ta
     JOIN users m ON m.id=ta.member_id
     JOIN users t ON t.id=ta.trainer_id
     WHERE ${filters.join(' AND ')}
     ORDER BY ta.assigned_at DESC LIMIT $${index} OFFSET $${index+1}`,
    values
  );
  res.json({success:true,data:{assignments:result.rows,pagination:{currentPage:Number(page),limit:Number(limit)}}});
}));

router.post('/member-trainer-assignments', authorize('admin'), asyncHandler(async (req, res) => {
  const { memberId, trainerId, notes }=req.body;
  if(!memberId || !trainerId) throw new AppError('Member ID and trainer ID are required',400);
  const users=await query(
    `SELECT id,role,status,deleted_at FROM users WHERE id=ANY($1::uuid[])`,
    [[memberId,trainerId]]
  );
  const member=users.rows.find(u=>u.id===memberId);
  const trainer=users.rows.find(u=>u.id===trainerId);
  if(!member || member.role!=='member' || member.deleted_at) throw new AppError('Member not found',404);
  if(!trainer || trainer.role!=='trainer' || trainer.status!=='active' || trainer.deleted_at) throw new AppError('Trainer not found or inactive',400);
  const result=await query(
    `INSERT INTO trainer_assignments(member_id,trainer_id,status,assigned_by,notes)
     VALUES($1,$2,'active',$3,$4)
     ON CONFLICT (member_id,trainer_id) WHERE status='active' DO UPDATE
     SET notes=EXCLUDED.notes,updated_at=NOW()
     RETURNING *`,
    [memberId,trainerId,req.user.id,notes||null]
  );
  await writeAuditLog({actorId:req.user.id,action:'member_trainer_assigned',entityType:'trainer_assignment',entityId:result.rows[0].id,metadata:{memberId,trainerId}});
  res.status(201).json({success:true,data:{assignment:result.rows[0]}});
}));

router.delete('/member-trainer-assignments/:id', validateUUID, authorize('admin'), asyncHandler(async (req, res) => {
  const result=await query(
    `UPDATE trainer_assignments SET status='ended',ended_at=NOW(),updated_at=NOW()
     WHERE id=$1 AND status='active'
     RETURNING *`,
    [req.params.id]
  );
  if(!result.rows.length) throw new AppError('Active assignment not found',404);
  await writeAuditLog({actorId:req.user.id,action:'member_trainer_assignment_ended',entityType:'trainer_assignment',entityId:req.params.id});
  res.json({success:true,data:{assignment:result.rows[0]}});
}));

router.get('/settings', authorize('admin'), asyncHandler(async (req,res)=>{
  const result=await query(`SELECT key,value,updated_at FROM system_settings ORDER BY key`);
  res.json({success:true,data:{settings:result.rows}});
}));

router.put('/settings/:key', authorize('admin'), asyncHandler(async (req,res)=>{
  if(typeof req.body.value==='undefined') throw new AppError('Setting value is required',400);
  const result=await query(
    `INSERT INTO system_settings(key,value,updated_by)
     VALUES($1,$2::jsonb,$3)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()
     RETURNING key,value,updated_at`,
    [req.params.key,JSON.stringify(req.body.value),req.user.id]
  );
  await writeAuditLog({actorId:req.user.id,action:'setting.updated',entityType:'system_setting',metadata:{key:req.params.key}});
  res.json({success:true,data:{setting:result.rows[0]}});
}));

export default router;
