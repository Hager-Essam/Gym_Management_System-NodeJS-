import { query, transaction } from '../../config/database.js';
import { AppError, asyncHandler } from '../../middleware/errorHandler.js';
import { randomUUID } from 'node:crypto';

// @desc    Get all payments
// @route   GET /api/payments
// @access  Private (Admin/Manager)
export const getAllPayments = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20, status, userId, startDate, endDate } = req.query;
  const offset = (page - 1) * limit;

  let queryText = `
    SELECT p.id,p.user_id,p.subscription_id,p.amount,p.currency,p.payment_method,
           p.payment_type,p.status,p.transaction_id,p.payment_gateway,p.receipt_url,
           p.invoice_number,p.description,p.processed_by,p.processed_at,p.created_at,
           u.full_name,u.email
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

  const memberOnly = req.user.role === 'member';
  const result = await query(
    `SELECT p.id,p.user_id,p.subscription_id,p.amount,p.currency,p.payment_method,
            p.payment_type,p.status,p.transaction_id,p.payment_gateway,p.invoice_number,
            p.description,p.processed_at,p.created_at,
            u.full_name,u.email,u.phone
     FROM payments p
     JOIN users u ON p.user_id = u.id
     WHERE p.id = $1${memberOnly ? ' AND p.user_id = $2' : ''}`,
    memberOnly ? [id, req.user.id] : [id]
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
  if (req.user.role === 'member' && req.user.id !== userId) {
    throw new AppError('Not authorized to access these payments', 403);
  }
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
  const { subscriptionId, paymentMethod, description } = req.body;
  if (!subscriptionId || !['cash', 'bank_transfer'].includes(paymentMethod)) {
    throw new AppError('A subscription and cash or bank_transfer payment method are required', 400);
  }

  const payment = await transaction(async (client) => {
    const subscriptionResult = await client.query(
      `SELECT s.id,s.user_id,s.plan_id,s.amount,s.currency,s.status,
              mp.duration_value,mp.duration_unit
       FROM subscriptions s JOIN membership_plans mp ON mp.id=s.plan_id
       WHERE s.id=$1 AND s.deleted_at IS NULL
       FOR UPDATE OF s`,
      [subscriptionId]
    );
    if (!subscriptionResult.rows.length) throw new AppError('Subscription not found',404);
    const subscription = subscriptionResult.rows[0];
    if (subscription.status !== 'pending') {
      throw new AppError('Only a pending subscription can receive a manual payment',409);
    }

    const interval = {day:'1 day',week:'1 week',month:'1 month',year:'1 year'}[subscription.duration_unit];
    if (!interval) throw new AppError('Subscription plan duration is invalid',400);
    const active = await client.query(
      `SELECT id FROM subscriptions
       WHERE user_id=$1 AND status='active' AND deleted_at IS NULL
       LIMIT 1`,
      [subscription.user_id]
    );
    if (active.rows.length) throw new AppError('Another active subscription already exists',409);

    const paymentResult = await client.query(
      `INSERT INTO payments(
         user_id,subscription_id,amount,currency,payment_method,payment_type,
         transaction_id,status,payment_gateway,invoice_number,description,processed_by,processed_at
       )
       VALUES($1,$2,$3,$4,$5,'subscription',$6,'completed','manual',$7,$8,$9,NOW())
       RETURNING *`,
      [
        subscription.user_id,
        subscription.id,
        subscription.amount,
        subscription.currency,
        paymentMethod,
        `manual_${randomUUID()}`,
        `INV-${randomUUID()}`,
        description || 'Manually confirmed subscription payment',
        req.user.id,
      ]
    );
    await client.query(
      `UPDATE payments SET status='cancelled',updated_at=NOW()
       WHERE subscription_id=$1 AND id<>$2 AND status='pending'`,
      [subscription.id,paymentResult.rows[0].id]
    );
    await client.query(
      `UPDATE subscriptions SET status='active',start_date=CURRENT_DATE,
       end_date=CURRENT_DATE + ($2 * INTERVAL '${interval}'),updated_at=NOW()
       WHERE id=$1`,
      [subscription.id,Number(subscription.duration_value)]
    );
    await client.query(
      `INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata)
       VALUES($1,'payment.manually_confirmed','payment',$2,$3::jsonb)`,
      [req.user.id,paymentResult.rows[0].id,JSON.stringify({subscriptionId:subscription.id})]
    );
    return paymentResult.rows[0];
  });
  res.status(201).json({success:true,message:'Manual payment confirmed',data:{payment}});
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

