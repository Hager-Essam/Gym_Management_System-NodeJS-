import { query } from '../../config/database.js';
import { AppError, asyncHandler } from '../../middleware/errorHandler.js';

// @desc    Check-in member
// @route   POST /api/attendance/check-in
// @access  Private
export const checkIn = asyncHandler(async (req, res, next) => {
  const { userId, location = 'Main Gate' } = req.body;

  // Check if user exists and is active
  const userCheck = await query(
    'SELECT id, status FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId]
  );

  if (userCheck.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  if (userCheck.rows[0].status !== 'active') {
    throw new AppError('User account is not active', 400);
  }

  // Check if user has active subscription
  const subCheck = await query(
    `SELECT id, status, end_date 
     FROM subscriptions 
     WHERE user_id = $1 AND status = 'active' AND end_date >= CURRENT_DATE
     LIMIT 1`,
    [userId]
  );

  const hasValidSubscription = subCheck.rows.length > 0;

  // Check if user is already checked in
  const activeCheck = await query(
    'SELECT id FROM attendance WHERE user_id = $1 AND check_out_time IS NULL',
    [userId]
  );

  if (activeCheck.rows.length > 0) {
    throw new AppError('User is already checked in', 400);
  }

  // Create check-in record
  const result = await query(
    `INSERT INTO attendance (
      user_id, check_in_time, location, entry_point, 
      subscription_valid, access_granted, checked_in_by, created_at
    ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, NOW())
    RETURNING *`,
    [userId, location, 'staff', hasValidSubscription, hasValidSubscription, req.user.id]
  );

  res.status(201).json({
    success: true,
    message: 'Check-in successful',
    data: {
      attendance: result.rows[0],
    },
  });
});

// @desc    Check-out member
// @route   POST /api/attendance/check-out
// @access  Private
export const checkOut = asyncHandler(async (req, res, next) => {
  const { attendanceId } = req.body;

  const result = await query(
    `UPDATE attendance SET check_out_time = NOW(), updated_at = NOW()
     WHERE id = $1 AND check_out_time IS NULL
     RETURNING *`,
    [attendanceId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Active attendance record not found', 404);
  }

  res.json({
    success: true,
    message: 'Check-out successful',
    data: {
      attendance: result.rows[0],
    },
  });
});

// @desc    Get all attendance records
// @route   GET /api/attendance
// @access  Private (Admin/Manager)
export const getAllAttendance = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20, date, userId } = req.query;
  const offset = (page - 1) * limit;

  let queryText = `
    SELECT a.*, u.full_name, u.email
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 1;

  if (date) {
    queryText += ` AND DATE(a.check_in_time) = $${paramCount}`;
    params.push(date);
    paramCount++;
  }

  if (userId) {
    queryText += ` AND a.user_id = $${paramCount}`;
    params.push(userId);
    paramCount++;
  }

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) FROM (${queryText}) as count_query`,
    params
  );
  const totalRecords = parseInt(countResult.rows[0].count);

  // Add pagination
  queryText += ` ORDER BY a.check_in_time DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  params.push(limit, offset);

  const result = await query(queryText, params);

  res.json({
    success: true,
    data: {
      attendance: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        limit: parseInt(limit),
      },
    },
  });
});

// @desc    Get today's attendance
// @route   GET /api/attendance/today
// @access  Private (Admin/Manager)
export const getTodayAttendance = asyncHandler(async (req, res, next) => {
  const result = await query(
    `SELECT a.*, u.full_name, u.email, u.phone
     FROM attendance a
     JOIN users u ON a.user_id = u.id
     WHERE DATE(a.check_in_time) = CURRENT_DATE
     ORDER BY a.check_in_time DESC`
  );

  // Separate into checked in and checked out
  const checkedIn = result.rows.filter(r => !r.check_out_time);
  const checkedOut = result.rows.filter(r => r.check_out_time);

  res.json({
    success: true,
    data: {
      currentlyInGym: checkedIn.length,
      totalToday: result.rows.length,
      checkedIn,
      checkedOut,
    },
  });
});

// @desc    Get member attendance by user ID
// @route   GET /api/attendance/member/:userId
// @access  Private
export const getMemberAttendance = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { page = 1, limit = 20, startDate, endDate } = req.query;
  const offset = (page - 1) * limit;

  let queryText = `
    SELECT id, check_in_time, check_out_time, location, duration_minutes,
           subscription_valid, access_granted
    FROM attendance
    WHERE user_id = $1
  `;

  const params = [userId];
  let paramCount = 2;

  if (startDate) {
    queryText += ` AND check_in_time >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }

  if (endDate) {
    queryText += ` AND check_in_time <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) FROM (${queryText}) as count_query`,
    params
  );
  const totalRecords = parseInt(countResult.rows[0].count);

  // Add pagination
  queryText += ` ORDER BY check_in_time DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  params.push(limit, offset);

  const result = await query(queryText, params);

  // Get attendance statistics
  const statsResult = await query(
    `SELECT 
      COUNT(*) as total_visits,
      COUNT(CASE WHEN DATE(check_in_time) >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as last_30_days,
      COUNT(CASE WHEN DATE(check_in_time) >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as last_7_days,
      AVG(duration_minutes) as avg_duration
     FROM attendance
     WHERE user_id = $1 AND check_out_time IS NOT NULL`,
    [userId]
  );

  res.json({
    success: true,
    data: {
      attendance: result.rows,
      statistics: statsResult.rows[0],
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        limit: parseInt(limit),
      },
    },
  });
});
