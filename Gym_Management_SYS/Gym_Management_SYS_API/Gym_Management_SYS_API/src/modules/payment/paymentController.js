import { query, transaction } from '../../config/database.js';
import { AppError, asyncHandler } from '../../middleware/errorHandler.js';

// @desc    Get all payments
// @route   GET /api/payments
// @access  Private (Admin/Manager)
export const getAllPayments = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20, status, userId, startDate, endDate } = req.query;
  const offset = (page - 1) * limit;

  let queryText = `
    SELECT p.*, u.full_name, u.email
    FROM payments p
    JOIN users u ON p.user_id = u.id
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 1;

  if (status) {
    queryText += ` AND p.status = $${paramCount}`;
    params.push(status);
    paramCount++;
  }

  if (userId) {
    queryText += ` AND p.user_id = $${paramCount}`;
    params.push(userId);
    paramCount++;
  }

  if (startDate) {
    queryText += ` AND p.created_at >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }

  if (endDate) {
    queryText += ` AND p.created_at <= $${paramCount}`;
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
  queryText += ` ORDER BY p.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  params.push(limit, offset);

  const result = await query(queryText, params);

  res.json({
    success: true,
    data: {
      payments: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        limit: parseInt(limit),
      },
    },
  });
});

// @desc    Get payment by ID
// @route   GET /api/payments/:id
// @access  Private
export const getPaymentById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const result = await query(
    `SELECT p.*, u.full_name, u.email, u.phone
     FROM payments p
     JOIN users u ON p.user_id = u.id
     WHERE p.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Payment not found', 404);
  }

  res.json({
    success: true,
    data: {
      payment: result.rows[0],
    },
  });
});

// @desc    Get payments for a specific member
// @route   GET /api/payments/member/:userId
// @access  Private
export const getMemberPayments = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await query(
    'SELECT COUNT(*) FROM payments WHERE user_id = $1',
    [userId]
  );
  const totalRecords = parseInt(countResult.rows[0].count);

  // Get payments
  const result = await query(
    `SELECT id, amount, currency, payment_method, payment_type, status,
            description, created_at, processed_at, invoice_number
     FROM payments
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  // Get payment statistics
  const statsResult = await query(
    `SELECT 
      COUNT(*) as total_payments,
      SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_paid,
      SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as total_pending,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count
     FROM payments
     WHERE user_id = $1`,
    [userId]
  );

  res.json({
    success: true,
    data: {
      payments: result.rows,
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

// @desc    Process payment
// @route   POST /api/payments
// @access  Private
export const processPayment = asyncHandler(async (req, res, next) => {
  const {
    userId,
    subscriptionId,
    amount,
    currency = 'EGP',
    paymentMethod,
    paymentType = 'subscription',
    description,
    transactionId,
  } = req.body;

  await transaction(async (client) => {
    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create payment record
    const paymentResult = await client.query(
      `INSERT INTO payments (
        user_id, subscription_id, amount, currency, payment_method, payment_type,
        transaction_id, status, invoice_number, description, processed_by, 
        created_at, processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING *`,
      [
        userId,
        subscriptionId || null,
        amount,
        currency,
        paymentMethod,
        paymentType,
        transactionId || null,
        'completed',
        invoiceNumber,
        description || null,
        req.user.id,
      ]
    );

    // If payment is for subscription, update subscription status
    if (subscriptionId) {
      await client.query(
        `UPDATE subscriptions 
         SET status = 'active'
         WHERE id = $1`,
        [subscriptionId]
      );
    }

    return paymentResult.rows[0];
  }).then((payment) => {
    res.status(201).json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        payment,
      },
    });
  });
});

// @desc    Get payment statistics
// @route   GET /api/payments/stats
// @access  Private (Admin/Manager)
export const getPaymentStats = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  let queryText = `
    SELECT 
      COUNT(*) as total_transactions,
      SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
      SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
      SUM(CASE WHEN status = 'refunded' THEN refund_amount ELSE 0 END) as total_refunded,
      AVG(CASE WHEN status = 'completed' THEN amount END) as avg_transaction,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
    FROM payments
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 1;

  if (startDate) {
    queryText += ` AND created_at >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }

  if (endDate) {
    queryText += ` AND created_at <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }

  const result = await query(queryText, params);

  // Get revenue by month (last 12 months)
  const monthlyRevenue = await query(
    `SELECT 
      TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
      SUM(amount) as revenue,
      COUNT(*) as transactions
     FROM payments
     WHERE status = 'completed'
       AND created_at >= NOW() - INTERVAL '12 months'
     GROUP BY DATE_TRUNC('month', created_at)
     ORDER BY month DESC`
  );

  res.json({
    success: true,
    data: {
      overall: result.rows[0],
      monthlyRevenue: monthlyRevenue.rows,
    },
  });
});
