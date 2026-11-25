import { asyncHandler } from '../../middleware/errorHandler.js';
import { body, validationResult } from 'express-validator';
import {
  confirmCheckout,
  createCheckout,
  getOwnedPayment,
  getPaymentHistory,
} from './paymentService.js';

export const createMemberCheckout = asyncHandler(async (req, res) => {
  const { planId, paymentMethod = 'card', autoRenew = false } = req.body;
  const checkout = await createCheckout({
    memberId: req.user.id,
    planId,
    paymentMethod,
    autoRenew,
  });
  res.status(201).json({
    success: true,
    message: 'Mock checkout session created',
    data: checkout,
  });
});

export const confirmMemberCheckout = asyncHandler(async (req, res) => {
  const result = await confirmCheckout({
    memberId: req.user.id,
    paymentId: req.params.paymentId,
  });
  const payment = await getOwnedPayment({
    memberId: req.user.id,
    paymentId: req.params.paymentId,
  });
  const subscription = result.subscription
    ? {
      id: result.subscription.id,
      planId: result.subscription.plan_id,
      status: result.subscription.status,
      startDate: result.subscription.start_date,
      endDate: result.subscription.end_date,
    }
    : null;

  res.json({
    success: true,
    message: result.payment.status === 'completed'
      ? 'Mock payment completed'
      : 'Mock payment failed; subscription remains pending',
    data: {
      payment,
      subscription,
      idempotent: result.idempotent,
    },
  });
});

export const getMemberPaymentHistory = asyncHandler(async (req, res) => {
  const history = await getPaymentHistory({
    memberId: req.user.id,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.json({ success: true, data: history });
});

export const validateCheckoutBody = [
  body('planId').isUUID().withMessage('Invalid plan ID'),
  body('paymentMethod')
    .optional()
    .isIn(['cash', 'card', 'bank_transfer', 'wallet'])
    .withMessage('Invalid payment method'),
  body('autoRenew')
    .optional()
    .isBoolean()
    .withMessage('autoRenew must be a boolean')
    .toBoolean(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map((error) => ({
          field: error.path,
          message: error.msg,
        })),
      });
    }
    next();
  },
];
