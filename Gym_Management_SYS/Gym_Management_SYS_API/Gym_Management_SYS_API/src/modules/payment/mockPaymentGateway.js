import { randomUUID } from 'node:crypto';
import { AppError } from '../../middleware/errorHandler.js';

const getConfiguredOutcome = () => {
  const outcome = process.env.MOCK_PAYMENT_OUTCOME || 'success';
  if (!['success', 'failure'].includes(outcome)) {
    throw new AppError('MOCK_PAYMENT_OUTCOME must be success or failure', 500);
  }
  return outcome;
};

export const createMockPaymentGateway = () => ({
  name: 'mock',

  async createCheckoutSession({ paymentId }) {
    const sessionRef = `mock_${randomUUID()}`;
    return {
      sessionRef,
      checkoutUrl: `mock://checkout/${sessionRef}`,
      outcome: getConfiguredOutcome(),
      paymentId,
    };
  },

  async confirmCheckoutSession({ sessionRef, expectedSessionRef, outcome }) {
    if (!sessionRef || sessionRef !== expectedSessionRef) {
      throw new AppError('Invalid mock checkout session', 400);
    }
    if (!['success', 'failure'].includes(outcome)) {
      throw new AppError('Mock checkout session has an invalid result', 500);
    }

    return {
      successful: outcome === 'success',
      transactionId: outcome === 'success' ? `mock_txn_${randomUUID()}` : null,
      gatewayResponse: {
        provider: 'mock',
        result: outcome,
        confirmedAt: new Date().toISOString(),
      },
    };
  },
});

export const mockPaymentGateway = createMockPaymentGateway();
