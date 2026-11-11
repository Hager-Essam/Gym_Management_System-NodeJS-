import { query } from '../../config/database.js';
import { AppError, asyncHandler } from '../../middleware/errorHandler.js';

// @desc    Get all members
// @route   GET /api/members
// @access  Private (Admin/Manager)
export const getAllMembers = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20, status, search } = req.query;
  const offset = (page - 1) * limit;

  let queryText = `
    SELECT u.id, u.email, u.full_name, u.phone, u.status, u.created_at,
           s.status as subscription_status, mp.name as plan_name,
           s.end_date as subscription_end_date
    FROM users u
    LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
    LEFT JOIN membership_plans mp ON s.plan_id = mp.id
    WHERE u.role = 'member' AND u.deleted_at IS NULL
  `;

  const params = [];
  let paramCount = 1;

  // Filter by status
  if (status) {
    queryText += ` AND u.status = $${paramCount}`;
    params.push(status);
    paramCount++;
  }

  // Search by name or email
  if (search) {
    queryText += ` AND (u.full_name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
    params.push(`%${search}%`);
    paramCount++;
  }

  // Get total count
  const countResult = await query(`SELECT COUNT(*) FROM (${queryText}) as count_query`, params);
  const totalMembers = parseInt(countResult.rows[0].count);

  // Add pagination
  queryText += ` ORDER BY u.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  params.push(limit, offset);

  const result = await query(queryText, params);

  res.json({
    success: true,
    data: {
      members: result.rows.map(member => ({
        id: member.id,
        email: member.email,
        fullName: member.full_name,
        phone: member.phone,
        status: member.status,
        createdAt: member.created_at,
        subscription: member.subscription_status ? {
          status: member.subscription_status,
          planName: member.plan_name,
          endDate: member.subscription_end_date,
        } : null,
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalMembers / limit),
        totalMembers,
        limit: parseInt(limit),
      },
    },
  });
});

// @desc    Get member by ID
// @route   GET /api/members/:id
// @access  Private (Admin/Manager or Self)
export const getMemberById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const result = await query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.status, u.date_of_birth,
            u.gender, u.address, u.emergency_contact, u.profile_picture_url,
            u.bio, u.created_at, u.last_login_at
     FROM users u
     WHERE u.id = $1 AND u.role = 'member' AND u.deleted_at IS NULL`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Member not found', 404);
  }

  const member = result.rows[0];

  // Get active subscription
  const subResult = await query(
    `SELECT s.id, s.status, s.start_date, s.end_date, s.auto_renew, s.payment_method,
            mp.name as plan_name, mp.price, mp.duration
     FROM subscriptions s
     JOIN membership_plans mp ON s.plan_id = mp.id
     WHERE s.user_id = $1 AND s.status = 'active'
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [id]
  );

  res.json({
    success: true,
    data: {
      member: {
        id: member.id,
        email: member.email,
        fullName: member.full_name,
        phone: member.phone,
        status: member.status,
        dateOfBirth: member.date_of_birth,
        gender: member.gender,
        address: member.address,
        emergencyContact: member.emergency_contact,
        profilePicture: member.profile_picture_url,
        bio: member.bio,
        createdAt: member.created_at,
        lastLogin: member.last_login_at,
      },
      subscription: subResult.rows.length > 0 ? subResult.rows[0] : null,
    },
  });
});

// @desc    Get current member profile
// @route   GET /api/members/me
// @access  Private
export const getMyProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const result = await query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.status, u.date_of_birth,
            u.gender, u.address, u.emergency_contact, u.profile_picture_url,
            u.bio, u.created_at, u.last_login_at
     FROM users u
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const user = result.rows[0];

  // Get active subscription
  const subResult = await query(
    `SELECT s.id, s.status, s.start_date, s.end_date, s.auto_renew, s.payment_method,
            s.next_billing_date, mp.name as plan_name, mp.price, mp.duration,
            mp.features
     FROM subscriptions s
     JOIN membership_plans mp ON s.plan_id = mp.id
     WHERE s.user_id = $1 AND s.status = 'active'
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [userId]
  );

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone,
        status: user.status,
        dateOfBirth: user.date_of_birth,
        gender: user.gender,
        address: user.address,
        emergencyContact: user.emergency_contact,
        profilePicture: user.profile_picture_url,
        bio: user.bio,
        createdAt: user.created_at,
        lastLogin: user.last_login_at,
      },
      subscription: subResult.rows.length > 0 ? subResult.rows[0] : null,
    },
  });
});

// @desc    Update current member profile
// @route   PUT /api/members/me
// @access  Private
export const updateMyProfile = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { fullName, phone, address, dateOfBirth, gender, emergencyContact, bio,email } = req.body;

  // Build update query dynamically
  const updates = [];
  const values = [];
  let paramCount = 1;

  if (fullName !== undefined) {
    updates.push(`full_name = $${paramCount}`);
    values.push(fullName);
    paramCount++;
  }
  if (email !== undefined) {
    updates.push(`email = $${paramCount}`);
    values.push(email);
    paramCount++;
  }

  if (phone !== undefined) {
    updates.push(`phone = $${paramCount}`);
    values.push(phone);
    paramCount++;
  }
  if (address !== undefined) {
    updates.push(`address = $${paramCount}`);
    values.push(address);
    paramCount++;
  }
  if (dateOfBirth !== undefined) {
    updates.push(`date_of_birth = $${paramCount}`);
    values.push(dateOfBirth);
    paramCount++;
  }
  if (gender !== undefined) {
    updates.push(`gender = $${paramCount}`);
    values.push(gender);
    paramCount++;
  }
  if (emergencyContact !== undefined) {
    updates.push(`emergency_contact = $${paramCount}`);
    values.push(emergencyContact);
    paramCount++;
  }
  if (bio !== undefined) {
    updates.push(`bio = $${paramCount}`);
    values.push(bio);
    paramCount++;
  }

  if (updates.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  updates.push(`updated_at = NOW()`);
  values.push(userId);

  const result = await query(
    `UPDATE users SET ${updates.join(', ')}
     WHERE id = $${paramCount} AND deleted_at IS NULL
     RETURNING id, email, full_name, phone, address, date_of_birth, gender, 
               emergency_contact, bio, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user: result.rows[0],
    },
  });
});

// @desc    Update member by ID (Admin)
// @route   PUT /api/members/:id
// @access  Private (Admin)
export const updateMember = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { fullName, phone, address, dateOfBirth, gender, emergencyContact, status, bio } = req.body;

  // Build update query dynamically
  const updates = [];
  const values = [];
  let paramCount = 1;

  if (fullName !== undefined) {
    updates.push(`full_name = $${paramCount}`);
    values.push(fullName);
    paramCount++;
  }
  if (phone !== undefined) {
    updates.push(`phone = $${paramCount}`);
    values.push(phone);
    paramCount++;
  }
  if (address !== undefined) {
    updates.push(`address = $${paramCount}`);
    values.push(address);
    paramCount++;
  }
  if (dateOfBirth !== undefined) {
    updates.push(`date_of_birth = $${paramCount}`);
    values.push(dateOfBirth);
    paramCount++;
  }
  if (gender !== undefined) {
    updates.push(`gender = $${paramCount}`);
    values.push(gender);
    paramCount++;
  }
  if (emergencyContact !== undefined) {
    updates.push(`emergency_contact = $${paramCount}`);
    values.push(emergencyContact);
    paramCount++;
  }
  if (status !== undefined) {
    updates.push(`status = $${paramCount}`);
    values.push(status);
    paramCount++;
  }
  if (bio !== undefined) {
    updates.push(`bio = $${paramCount}`);
    values.push(bio);
    paramCount++;
  }

  if (updates.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE users SET ${updates.join(', ')}
     WHERE id = $${paramCount} AND role = 'member' AND deleted_at IS NULL
     RETURNING id, email, full_name, phone, address, date_of_birth, gender, 
               emergency_contact, status, bio, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Member not found', 404);
  }

  res.json({
    success: true,
    message: 'Member updated successfully',
    data: {
      member: result.rows[0],
    },
  });
});

// @desc    Delete member (Soft delete)
// @route   DELETE /api/members/:id
// @access  Private (Admin)
export const deleteMember = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const result = await query(
    `UPDATE users SET deleted_at = NOW()
     WHERE id = $1 AND role = 'member' AND deleted_at IS NULL
     RETURNING id`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Member not found', 404);
  }

  res.json({
    success: true,
    message: 'Member deleted successfully',
  });
});

// @desc    Get member subscription
// @route   GET /api/members/:id/subscription
// @access  Private (Admin/Manager or Self)
export const getMemberSubscription = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const result = await query(
    `SELECT s.*, mp.name as plan_name, mp.price, mp.duration, mp.features
     FROM subscriptions s
     JOIN membership_plans mp ON s.plan_id = mp.id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC`,
    [id]
  );

  res.json({
    success: true,
    data: {
      subscriptions: result.rows,
    },
  });
});

// @desc    Get member attendance history
// @route   GET /api/members/:id/attendance
// @access  Private (Admin/Manager or Self)
export const getMemberAttendance = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { page = 1, limit = 20, startDate, endDate } = req.query;
  const offset = (page - 1) * limit;

  let queryText = `
    SELECT id, check_in_time, check_out_time, location, duration_minutes
    FROM attendance
    WHERE user_id = $1
  `;

  const params = [id];
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
