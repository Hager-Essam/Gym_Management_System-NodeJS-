# Mock membership payments

The payment API uses the existing `payments` and `subscriptions` tables. A
successful payment is stored with status `completed` (the database's allowed
value), not `success`. Failed sessions use `failed`; checkout sessions begin at
`pending`. No card number, CVV, or payment credential is accepted or stored.

## Member endpoints

All routes require a member access token.

### Create or resume checkout

`POST /api/payments/checkout`

```json
{
  "planId": "membership-plan-uuid",
  "paymentMethod": "card",
  "autoRenew": false
}
```

The server validates plan availability, calculates the amount from the plan,
creates or reuses the member's pending subscription, and creates or reuses a
pending mock payment. Repeated checkout requests for the same pending plan reuse
the same payment session.

### Confirm mock checkout

`POST /api/payments/:paymentId/confirm`

No outcome or amount is accepted from the client. The mock gateway result is
selected server-side when the checkout session is created. For development,
`MOCK_PAYMENT_OUTCOME=success` (default) or `MOCK_PAYMENT_OUTCOME=failure`
controls that result. The payment's saved mock session is verified during
confirmation.

On success, the payment becomes `completed` and the subscription is activated
with start/end dates calculated from the selected plan, in one database
transaction. On failure, the payment becomes `failed` and the subscription
remains `pending`. Repeated confirmation returns the existing result without
processing it again.

### Read payment information

- `GET /api/payments/:paymentId` — own payment only
- `GET /api/payments/history?page=1&limit=20` — own paginated history

## Lifecycle

Allowed flow:

```text
pending -> completed
pending -> failed
```

`refunded` and `cancelled` remain schema-supported for separate authorized
operations; this mock checkout does not issue refunds.

## Manual staff payments

`POST /api/payments` is restricted to Admin and accepts a pending
`subscriptionId`, plus `paymentMethod` (`cash` or `bank_transfer`) and optional
description. The amount is read from the subscription, not the request. The
staff operation and activation are committed transactionally.

## Future gateway adapter

`mockPaymentGateway.js` provides `createCheckoutSession` and
`confirmCheckoutSession`. A future provider adapter can implement this interface
and return verified provider results without changing the HTTP controller or
payment lifecycle service.
