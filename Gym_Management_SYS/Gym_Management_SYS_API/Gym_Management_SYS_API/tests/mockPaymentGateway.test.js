import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createMockPaymentGateway } from '../src/modules/payment/mockPaymentGateway.js';

const originalOutcome = process.env.MOCK_PAYMENT_OUTCOME;

afterEach(() => {
  if (originalOutcome === undefined) {
    delete process.env.MOCK_PAYMENT_OUTCOME;
  } else {
    process.env.MOCK_PAYMENT_OUTCOME = originalOutcome;
  }
});

test('mock gateway confirms a server-configured successful session', async () => {
  process.env.MOCK_PAYMENT_OUTCOME = 'success';
  const gateway = createMockPaymentGateway();
  const session = await gateway.createCheckoutSession({ paymentId: 'payment-id' });
  const result = await gateway.confirmCheckoutSession({
    sessionRef: session.sessionRef,
    expectedSessionRef: session.sessionRef,
    outcome: session.outcome,
  });

  assert.equal(result.successful, true);
  assert.match(result.transactionId, /^mock_txn_/);
});

test('mock gateway confirms a server-configured failed session', async () => {
  process.env.MOCK_PAYMENT_OUTCOME = 'failure';
  const gateway = createMockPaymentGateway();
  const session = await gateway.createCheckoutSession({ paymentId: 'payment-id' });
  const result = await gateway.confirmCheckoutSession({
    sessionRef: session.sessionRef,
    expectedSessionRef: session.sessionRef,
    outcome: session.outcome,
  });

  assert.equal(result.successful, false);
  assert.equal(result.transactionId, null);
});

test('mock gateway rejects a session reference that does not match', async () => {
  process.env.MOCK_PAYMENT_OUTCOME = 'success';
  const gateway = createMockPaymentGateway();

  await assert.rejects(
    gateway.confirmCheckoutSession({
      sessionRef: 'forged-session',
      expectedSessionRef: 'stored-session',
      outcome: 'success',
    }),
    /Invalid mock checkout session/
  );
});
