import { query, transaction } from '../../config/database.js';
import { AppError, asyncHandler } from '../../middleware/errorHandler.js';

// @desc    Get all subscriptions
// @route   GET /api/subscriptions
// @access  Private (Admin/Manager)
export const getAllSubscriptions = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20, status, userId } = req.query;
  const offset = (page - 1) * limit;

  let queryText = `
    SELECT s.*, u.full_name, u.email, mp.name as plan_name, mp.access_level
    FROM subscriptions s
    JOIN users u ON s.user_id = u.id
    JOIN membership_plans mp ON s.plan_id = mp.id
    WHERE s.deleted_at IS NULL
  `;

  const params = [];
  let paramCount = 1;

  if (status) {
    queryText += ` AND s.status = $${paramCount}`;
    params.push(status);
    paramCount++;
  }

  if (userId) {
    queryText += ` AND s.user_id = $${paramCount}`;
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
  queryText += ` ORDER BY s.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  params.push(limit, offset);

  const result = await query(queryText, params);

  res.json({
    success: true,
    data: {
      subscriptions: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        limit: parseInt(limit),
      },
    },
  });
});

// @desc    Get subscription by ID
// @route   GET /api/subscriptions/:id
// @access  Private
export const getSubscriptionById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const result = await query(
    `SELECT s.*, u.full_name, u.email,
            mp.name AS plan_name, mp.description AS plan_description,
            mp.price AS plan_price, mp.duration AS plan_duration,
            mp.features AS plan_features, mp.access_level,
            mp.max_classes, mp.includes_personal_training
     FROM subscriptions s
     JOIN users u ON s.user_id = u.id
     JOIN membership_plans mp ON s.plan_id = mp.id
     WHERE s.id = $1 AND s.deleted_at IS NULL`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Subscription not found', 404);
  }

  res.json({
    success: true,
    data: {
      subscription: result.rows[0],
    },
  });
});

// @desc    Create subscription
// @route   POST /api/subscriptions
// @access  Private
export const createSubscription = asyncHandler(async (req, res, next) => {
  const { userId, planId, paymentMethod, autoRenew = true } = req.body;

  await transaction(async (client) => {
    // Get plan details
    const planResult = await client.query(
      'SELECT * FROM membership_plans WHERE id = $1 AND is_active = true AND deleted_at IS NULL',
      [planId]
    );

    if (planResult.rows.length === 0) {
      throw new AppError('Plan not found or inactive', 404);
    }

    const plan = planResult.rows[0];

    // Calculate end date
    let durationQuery;
    switch (plan.duration) {
      case 'monthly':
        durationQuery = "NOW() + INTERVAL '1 month'";
        break;
      case 'quarterly':
        durationQuery = "NOW() + INTERVAL '3 months'";
        break;
      case 'annually':
        durationQuery = "NOW() + INTERVAL '1 year'";
        break;
      default:
        durationQuery = "NOW() + INTERVAL '1 month'";
    }

    // Deactivate any existing active subscriptions
    await client.query(
      `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW()
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    // Create new subscription
    const subResult = await client.query(
      `INSERT INTO subscriptions (
        user_id, plan_id, start_date, end_date, status, payment_method,
        payment_frequency, amount, auto_renew, next_billing_date, created_at
      ) VALUES ($1, $2, NOW(), ${durationQuery}, $3, $4, $5, $6, $7, ${durationQuery}, NOW())
      RETURNING *`,
      [userId, planId, 'active', paymentMethod, plan.duration, plan.price, autoRenew]
    );

    return subResult.rows[0];
  }).then((subscription) => {
    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: {
        subscription,
      },
    });
  });
});

// @desc    Update subscription
// @route   PUT /api/subscriptions/:id
// @access  Private (Admin)
export const updateSubscription = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status, autoRenew, endDate } = req.body;

  const updates = [];
  const values = [];
  let paramCount = 1;

  if (status !== undefined) {
    updates.push(`status = $${paramCount}`);
    values.push(status);
    paramCount++;

    if (status === 'cancelled') {
      updates.push(`cancelled_at = NOW()`);
    }
  }

  if (autoRenew !== undefined) {
    updates.push(`auto_renew = $${paramCount}`);
    values.push(autoRenew);
    paramCount++;
  }

  if (endDate !== undefined) {
    updates.push(`end_date = $${paramCount}`);
    values.push(endDate);
    paramCount++;
  }

  if (updates.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE subscriptions SET ${updates.join(', ')}
     WHERE id = $${paramCount} AND deleted_at IS NULL
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Subscription not found', 404);
  }

  res.json({
    success: true,
    message: 'Subscription updated successfully',
    data: {
      subscription: result.rows[0],
    },
  });
});

// @desc    Cancel subscription
// @route   DELETE /api/subscriptions/:id
// @access  Private
export const cancelSubscription = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;

  const result = await query(
    `UPDATE subscriptions 
     SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $1,
         cancelled_by = $2, updated_at = NOW()
     WHERE id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [reason || null, req.user.id, id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Subscription not found', 404);
  }

  res.json({
    success: true,
    message: 'Subscription cancelled successfully',
    data: {
      subscription: result.rows[0],
    },
  });
});

// @desc    Get expiring subscriptions
// @route   GET /api/subscriptions/expiring
// @access  Private (Admin/Manager)
export const getExpiringSubscriptions = asyncHandler(async (req, res, next) => {
  const { days = 7 } = req.query;

  const result = await query(
    `SELECT s.*, u.full_name, u.email, u.phone, mp.name as plan_name, mp.access_level
     FROM subscriptions s
     JOIN users u ON s.user_id = u.id
     JOIN membership_plans mp ON s.plan_id = mp.id
     WHERE s.status = 'active'
       AND s.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1 * INTERVAL '1 day'
       AND s.deleted_at IS NULL
     ORDER BY s.end_date ASC`,
    [days]
  );

  res.json({
    success: true,
    data: {
      count: result.rows.length,
      subscriptions: result.rows,
    },
  });
});
