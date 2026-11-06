import { query } from '../../config/database.js';
import { AppError, asyncHandler } from '../../middleware/errorHandler.js';

// @desc    Get all membership plans
// @route   GET /api/plans
// @access  Public
export const getAllPlans = asyncHandler(async (req, res, next) => {
  const { activeOnly = 'true' } = req.query;

  let queryText = `
    SELECT id, tier, name, description, price, duration, features, access_level,
           max_classes, includes_personal_training, includes_sauna, includes_pool,
           setup_fee, cancellation_fee, is_active, is_visible, display_order, color_code,
           created_at
    FROM membership_plans
    WHERE deleted_at IS NULL
  `;

  if (activeOnly === 'true') {
    queryText += ' AND is_active = true AND is_visible = true';
  }

  queryText += ' ORDER BY display_order ASC, price ASC';

  const result = await query(queryText);

  res.json({
    success: true,
    data: {
      plans: result.rows,
    },
  });
});

// @desc    Get plan by ID
// @route   GET /api/plans/:id
// @access  Public
export const getPlanById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const result = await query(
    `SELECT * FROM membership_plans WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Plan not found', 404);
  }

  res.json({
    success: true,
    data: {
      plan: result.rows[0],
    },
  });
});

// @desc    Create membership plan
// @route   POST /api/plans
// @access  Private (Admin)
export const createPlan = asyncHandler(async (req, res, next) => {
  const {
    tier,
    name,
    description,
    price,
    duration,
    features,
    accessLevel,
    maxClasses,
    includesPersonalTraining = false,
    includesSauna = false,
    includesPool = false,
    setupFee = 0,
    cancellationFee = 0,
    isActive = true,
    isVisible = true,
    displayOrder = 0,
    colorCode,
  } = req.body;

  const result = await query(
    `INSERT INTO membership_plans (
      tier, name, description, price, duration, features, access_level,
      max_classes, includes_personal_training, includes_sauna, includes_pool,
      setup_fee, cancellation_fee, is_active, is_visible, display_order, color_code,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
    RETURNING *`,
    [
      tier, name, description, price, duration, JSON.stringify(features), accessLevel,
      maxClasses, includesPersonalTraining, includesSauna, includesPool,
      setupFee, cancellationFee, isActive, isVisible, displayOrder, colorCode,
    ]
  );

  res.status(201).json({
    success: true,
    message: 'Plan created successfully',
    data: {
      plan: result.rows[0],
    },
  });
});

// @desc    Update membership plan
// @route   PUT /api/plans/:id
// @access  Private (Admin)
export const updatePlan = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const {
    name,
    description,
    price,
    duration,
    features,
    accessLevel,
    maxClasses,
    includesPersonalTraining,
    includesSauna,
    includesPool,
    setupFee,
    cancellationFee,
    isActive,
    isVisible,
    displayOrder,
    colorCode,
  } = req.body;

  const updates = [];
  const values = [];
  let paramCount = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramCount}`);
    values.push(name);
    paramCount++;
  }
  if (description !== undefined) {
    updates.push(`description = $${paramCount}`);
    values.push(description);
    paramCount++;
  }
  if (price !== undefined) {
    updates.push(`price = $${paramCount}`);
    values.push(price);
    paramCount++;
  }
  if (duration !== undefined) {
    updates.push(`duration = $${paramCount}`);
    values.push(duration);
    paramCount++;
  }
  if (features !== undefined) {
    updates.push(`features = $${paramCount}`);
    values.push(JSON.stringify(features));
    paramCount++;
  }
  if (accessLevel !== undefined) {
    updates.push(`access_level = $${paramCount}`);
    values.push(accessLevel);
    paramCount++;
  }
  if (maxClasses !== undefined) {
    updates.push(`max_classes = $${paramCount}`);
    values.push(maxClasses);
    paramCount++;
  }
  if (includesPersonalTraining !== undefined) {
    updates.push(`includes_personal_training = $${paramCount}`);
    values.push(includesPersonalTraining);
    paramCount++;
  }
  if (includesSauna !== undefined) {
    updates.push(`includes_sauna = $${paramCount}`);
    values.push(includesSauna);
    paramCount++;
  }
  if (includesPool !== undefined) {
    updates.push(`includes_pool = $${paramCount}`);
    values.push(includesPool);
    paramCount++;
  }
  if (setupFee !== undefined) {
    updates.push(`setup_fee = $${paramCount}`);
    values.push(setupFee);
    paramCount++;
  }
  if (cancellationFee !== undefined) {
    updates.push(`cancellation_fee = $${paramCount}`);
    values.push(cancellationFee);
    paramCount++;
  }
  if (isActive !== undefined) {
    updates.push(`is_active = $${paramCount}`);
    values.push(isActive);
    paramCount++;
  }
  if (isVisible !== undefined) {
    updates.push(`is_visible = $${paramCount}`);
    values.push(isVisible);
    paramCount++;
  }
  if (displayOrder !== undefined) {
    updates.push(`display_order = $${paramCount}`);
    values.push(displayOrder);
    paramCount++;
  }
  if (colorCode !== undefined) {
    updates.push(`color_code = $${paramCount}`);
    values.push(colorCode);
    paramCount++;
  }

  if (updates.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE membership_plans SET ${updates.join(', ')}
     WHERE id = $${paramCount} AND deleted_at IS NULL
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Plan not found', 404);
  }

  res.json({
    success: true,
    message: 'Plan updated successfully',
    data: {
      plan: result.rows[0],
    },
  });
});

// @desc    Delete membership plan (Soft delete)
// @route   DELETE /api/plans/:id
// @access  Private (Admin)
export const deletePlan = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Check if plan has active subscriptions
  const subCheck = await query(
    `SELECT COUNT(*) FROM subscriptions WHERE plan_id = $1 AND status = 'active'`,
    [id]
  );

  if (parseInt(subCheck.rows[0].count) > 0) {
    throw new AppError('Cannot delete plan with active subscriptions', 400);
  }

  const result = await query(
    `UPDATE membership_plans SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Plan not found', 404);
  }

  res.json({
    success: true,
    message: 'Plan deleted successfully',
  });
});
