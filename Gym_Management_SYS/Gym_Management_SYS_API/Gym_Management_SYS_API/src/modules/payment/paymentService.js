import { randomUUID } from 'node:crypto';
import { query, transaction } from '../../config/database.js';
import { AppError } from '../../middleware/errorHandler.js';
import { mockPaymentGateway } from './mockPaymentGateway.js';

const durationIntervals = {
  day: '1 day',
  week: '1 week',
  month: '1 month',
  year: '1 year',
};

const serializeJson = (value) => JSON.stringify(value);

const insertAuditLog = async (client, { actorId, action, entityType, entityId, metadata = {} }) => {
  await client.query(
    `INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata)
     VALUES($1,$2,$3,$4,$5::jsonb)`,
    [actorId, action, entityType, entityId, serializeJson(metadata)]
  );
};

const checkoutResult = (payment, subscription, gatewayResponse) => ({
  payment: {
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    paymentMethod: payment.payment_method,
    status: payment.status,
    invoiceNumber: payment.invoice_number,
    createdAt: payment.created_at,
  },
  subscription: {
    id: subscription.id,
    planId: subscription.plan_id,
    status: subscription.status,
    startDate: subscription.start_date,
    endDate: subscription.end_date,
  },
  checkout: {
    provider: payment.payment_gateway,
    sessionRef: gatewayResponse.sessionRef,
    checkoutUrl: gatewayResponse.checkoutUrl,
  },
});

export const createCheckout = async ({ memberId, planId, paymentMethod, autoRenew = false }) => {
  return transaction(async (client) => {
    const memberResult = await client.query(
      `SELECT id, role FROM users
       WHERE id=$1 AND status='active' AND deleted_at IS NULL
       FOR UPDATE`,
      [memberId]
    );
    if (!memberResult.rows.length || memberResult.rows[0].role !== 'member') {
      throw new AppError('Active member account not found', 404);
    }

    const planResult = await client.query(
      `SELECT id,name,price,duration_value,duration_unit
       FROM membership_plans
       WHERE id=$1 AND is_active=TRUE AND is_visible=TRUE AND deleted_at IS NULL`,
      [planId]
    );
    if (!planResult.rows.length) throw new AppError('Membership plan not found or unavailable', 404);
    const plan = planResult.rows[0];
    if (Number(plan.price) <= 0) {
      throw new AppError('The selected plan cannot be processed as a payment', 400);
    }
    const interval = durationIntervals[plan.duration_unit];
    if (!interval || !Number.isInteger(Number(plan.duration_value)) || Number(plan.duration_value) < 1) {
      throw new AppError('Membership plan has an invalid duration', 400);
    }
    const paymentFrequency = {
      '1 month': 'monthly',
      '3 month': 'quarterly',
      '1 year': 'annually',
    }[`${Number(plan.duration_value)} ${plan.duration_unit}`];
    if (!paymentFrequency) {
      throw new AppError('This plan duration is not supported for payment checkout', 400);
    }

    const activeSubscription = await client.query(
      `SELECT id FROM subscriptions
       WHERE user_id=$1 AND status='active' AND deleted_at IS NULL
       LIMIT 1`,
      [memberId]
    );
    if (activeSubscription.rows.length) {
      throw new AppError('An active subscription already exists for this member', 409);
    }

    const existingPending = await client.query(
      `SELECT id,plan_id,status,start_date,end_date,amount
       FROM subscriptions
       WHERE user_id=$1 AND status='pending' AND deleted_at IS NULL
       ORDER BY created_at DESC
       FOR UPDATE`,
      [memberId]
    );
    const pendingSubscription = existingPending.rows.find((row) => row.plan_id === plan.id);
    if (existingPending.rows.length && !pendingSubscription) {
      throw new AppError('A pending subscription for another plan already exists', 409);
    }

    let subscription = pendingSubscription;
    if (subscription && Number(subscription.amount) !== Number(plan.price)) {
      throw new AppError('Pending subscription amount does not match the current plan price', 409);
    }

    if (!subscription) {
      const subscriptionResult = await client.query(
        `INSERT INTO subscriptions(
           user_id,plan_id,start_date,end_date,status,amount,currency,auto_renew,
           payment_frequency
         )
         VALUES(
           $1,$2,CURRENT_DATE,
           CURRENT_DATE + ($3 * INTERVAL '${interval}'),
           'pending',$4,'EGP',$5,$6
         )
         RETURNING id,plan_id,status,start_date,end_date,amount`,
        [memberId, plan.id, Number(plan.duration_value), plan.price, autoRenew, paymentFrequency]
      );
      subscription = subscriptionResult.rows[0];
    }

    const reusablePayment = await client.query(
      `SELECT * FROM payments
       WHERE subscription_id=$1 AND user_id=$2 AND payment_gateway='mock' AND status='pending'
       ORDER BY created_at DESC LIMIT 1
       FOR UPDATE`,
      [subscription.id, memberId]
    );
    if (reusablePayment.rows.length) {
      const payment = reusablePayment.rows[0];
      const storedSession = payment.gateway_response || {};
      if (storedSession.sessionRef && storedSession.checkoutUrl) {
        return checkoutResult(payment, subscription, storedSession);
      }
    }

    const paymentId = randomUUID();
    const session = await mockPaymentGateway.createCheckoutSession({ paymentId });
    const gatewayResponse = {
      provider: mockPaymentGateway.name,
      sessionRef: session.sessionRef,
      checkoutUrl: session.checkoutUrl,
      mockOutcome: session.outcome,
    };
    const invoiceNumber = `INV-${randomUUID()}`;
    const paymentResult = await client.query(
      `INSERT INTO payments(
         id,user_id,subscription_id,amount,currency,payment_method,payment_type,
         status,payment_gateway,gateway_response,invoice_number,description
       )
       VALUES($1,$2,$3,$4,$5,$6,'subscription','pending',$7,$8::jsonb,$9,$10)
       RETURNING id,amount,currency,payment_method,status,payment_gateway,
                 gateway_response,invoice_number,created_at`,
      [
        paymentId,
        memberId,
        subscription.id,
        plan.price,
        plan.currency || 'EGP',
        paymentMethod,
        mockPaymentGateway.name,
        serializeJson(gatewayResponse),
        invoiceNumber,
        `Membership plan: ${plan.name}`,
      ]
    );
    await insertAuditLog(client, {
      actorId: memberId,
      action: 'payment.checkout_created',
      entityType: 'payment',
      entityId: paymentId,
      metadata: { subscriptionId: subscription.id, planId: plan.id },
    });

    return checkoutResult(paymentResult.rows[0], subscription, gatewayResponse);
  });
};

export const confirmCheckout = async ({ memberId, paymentId }) => {
  const confirmed = await transaction(async (client) => {
    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [paymentId, memberId]
    );
    if (!paymentResult.rows.length) throw new AppError('Payment not found', 404);
    const payment = paymentResult.rows[0];

    if (payment.payment_gateway !== mockPaymentGateway.name) {
      throw new AppError('Payment is not associated with the mock gateway', 400);
    }
    if (payment.status === 'completed' || payment.status === 'failed') {
      const sub = payment.subscription_id
        ? await client.query(
          `SELECT id,plan_id,status,start_date,end_date
           FROM subscriptions WHERE id=$1`,
          [payment.subscription_id]
        )
        : { rows: [] };
      return { payment, subscription: sub.rows[0] || null, idempotent: true };
    }
    if (payment.status !== 'pending') {
      throw new AppError(`Cannot confirm a payment in '${payment.status}' status`, 409);
    }

    const session = payment.gateway_response || {};
    const gatewayResult = await mockPaymentGateway.confirmCheckoutSession({
      sessionRef: session.sessionRef,
      expectedSessionRef: session.sessionRef,
      outcome: session.mockOutcome,
    });

    let subscription = null;
    if (payment.subscription_id) {
      const subscriptionResult = await client.query(
        `SELECT s.*,mp.duration_value,mp.duration_unit
         FROM subscriptions s
         JOIN membership_plans mp ON mp.id=s.plan_id
         WHERE s.id=$1 AND s.user_id=$2 AND s.deleted_at IS NULL
         FOR UPDATE OF s`,
        [payment.subscription_id, memberId]
      );
      if (!subscriptionResult.rows.length) throw new AppError('Associated subscription not found', 404);
      subscription = subscriptionResult.rows[0];
      if (subscription.status !== 'pending') {
        throw new AppError('Subscription is no longer pending payment', 409);
      }
      if (Number(subscription.amount) !== Number(payment.amount)) {
        throw new AppError('Payment amount does not match the subscription amount', 409);
      }
    }

    let paymentStatus = 'failed';
    if (gatewayResult.successful) {
      if (subscription) {
        const active = await client.query(
          `SELECT id FROM subscriptions
           WHERE user_id=$1 AND status='active' AND deleted_at IS NULL AND id<>$2
           LIMIT 1`,
          [memberId, subscription.id]
        );
        if (active.rows.length) {
          throw new AppError('Another active subscription already exists', 409);
        }
        const interval = durationIntervals[subscription.duration_unit];
        if (!interval) throw new AppError('Subscription plan duration is invalid', 400);
        await client.query(
          `UPDATE subscriptions
           SET status='active',start_date=CURRENT_DATE,
               end_date=CURRENT_DATE + ($2 * INTERVAL '${interval}'),
               updated_at=NOW()
           WHERE id=$1`,
          [subscription.id, Number(subscription.duration_value)]
        );
        const refreshedSubscription = await client.query(
          `SELECT id,plan_id,status,start_date,end_date
           FROM subscriptions WHERE id=$1`,
          [subscription.id]
        );
        subscription = refreshedSubscription.rows[0];
      }
      paymentStatus = 'completed';
    }

    const updatedPayment = await client.query(
      `UPDATE payments
       SET status=$1,transaction_id=$2,gateway_response=$3::jsonb,
           processed_at=NOW(),updated_at=NOW()
       WHERE id=$4
       RETURNING id,user_id,subscription_id,amount,currency,payment_method,payment_type,
                 status,transaction_id,payment_gateway,gateway_response,invoice_number,
                 processed_at,created_at`,
      [
        paymentStatus,
        gatewayResult.transactionId,
        serializeJson({ ...session, ...gatewayResult.gatewayResponse }),
        paymentId,
      ]
    );
    await insertAuditLog(client, {
      actorId: memberId,
      action: `payment.${paymentStatus}`,
      entityType: 'payment',
      entityId: paymentId,
      metadata: { subscriptionId: payment.subscription_id },
    });
    return { payment: updatedPayment.rows[0], subscription, idempotent: false };
  });

  return confirmed;
};

export const getOwnedPayment = async ({ memberId, paymentId }) => {
  const result = await query(
    `SELECT p.id,p.user_id,p.subscription_id,p.amount,p.currency,p.payment_method,
            p.payment_type,p.status,p.transaction_id,p.payment_gateway,p.invoice_number,
            p.description,p.processed_at,p.created_at,
            s.status AS subscription_status,s.start_date AS subscription_start_date,
            s.end_date AS subscription_end_date,mp.name AS plan_name
     FROM payments p
     LEFT JOIN subscriptions s ON s.id=p.subscription_id
     LEFT JOIN membership_plans mp ON mp.id=s.plan_id
     WHERE p.id=$1 AND p.user_id=$2`,
    [paymentId, memberId]
  );
  if (!result.rows.length) throw new AppError('Payment not found', 404);
  return result.rows[0];
};

export const getPaymentHistory = async ({ memberId, page = 1, limit = 20 }) => {
  const count = await query(`SELECT COUNT(*) FROM payments WHERE user_id=$1`, [memberId]);
  const offset = (Number(page) - 1) * Number(limit);
  const result = await query(
    `SELECT p.id,p.subscription_id,p.amount,p.currency,p.payment_method,
            p.payment_type,p.status,p.invoice_number,p.description,p.processed_at,p.created_at,
            mp.name AS plan_name
     FROM payments p
     LEFT JOIN subscriptions s ON s.id=p.subscription_id
     LEFT JOIN membership_plans mp ON mp.id=s.plan_id
     WHERE p.user_id=$1
     ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
    [memberId, Number(limit), offset]
  );
  const totalRecords = Number(count.rows[0].count);
  return {
    payments: result.rows,
    pagination: {
      currentPage: Number(page),
      totalPages: Math.ceil(totalRecords / Number(limit)),
      totalRecords,
      limit: Number(limit),
    },
  };
};

