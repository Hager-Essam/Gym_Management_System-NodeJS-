# Schema Alignment Fixes Needed

## Critical Issues to Fix

### 1. Subscription Controller - Remove `tier` reference
**File**: `src/modules/subscriptions/subscriptionController.js`
**Line**: ~13
**Current**:
```javascript
SELECT s.*, u.full_name, u.email, mp.name as plan_name, mp.tier
```
**Fix**:
```javascript
SELECT s.*, u.full_name, u.email, mp.name as plan_name, mp.access_level
```

### 2. Check All Queries for Non-Existent Columns
Search and replace across all controllers:
- ❌ `mp.tier` → ✅ `mp.access_level`
- ❌ `mp.display_order` → ✅ Remove (doesn't exist)
- ❌ `mp.color_code` → ✅ Remove (doesn't exist)
- ❌ `mp.includes_sauna` → ✅ Remove (doesn't exist)
- ❌ `mp.includes_pool` → ✅ Remove (doesn't exist)
- ❌ `mp.setup_fee` → ✅ Remove (doesn't exist)
- ❌ `mp.cancellation_fee` → ✅ Remove (doesn't exist)

### 3. Files to Check
```
src/modules/subscriptions/subscriptionController.js
src/modules/payment/paymentController.js (if exists)
src/modules/attendance/attendanceController.js (if exists)
src/modules/classes/classController.js (if exists)
src/config/database/seed.js
```

## Quick Fix Commands

### Search for problematic fields:
```powershell
# In backend directory
cd "e:\OneDrive\OneDrive - EL-Minia University - Students\Desktop\NodeJs\Gym_Management_SYS_API"

# Search for tier references
Select-String -Path "src\modules\**\*.js" -Pattern "mp\.tier"

# Search for display_order
Select-String -Path "src\modules\**\*.js" -Pattern "display_order"

# Search for color_code
Select-String -Path "src\modules\**\*.js" -Pattern "color_code"
```

## Correct Schema Field Names

### membership_plans table:
```javascript
✅ CORRECT FIELDS:
- id
- name
- description
- price
- duration (monthly, quarterly, annually)
- features (JSONB array)
- access_level (basic, premium, vip)
- max_classes
- includes_personal_training
- is_active
- is_visible
- created_at
- updated_at
- deleted_at

❌ REMOVED FIELDS (do not use):
- tier
- display_order
- color_code
- includes_sauna
- includes_pool
- setup_fee
- cancellation_fee
```

### users table:
```javascript
✅ Role values: 'member', 'trainer', 'manager', 'admin'
✅ Status values: 'active', 'inactive', 'suspended'
✅ Gender values: 'male', 'female', 'other'
```

### subscriptions table:
```javascript
✅ Status values: 'pending', 'active', 'expired', 'cancelled', 'paused'
✅ Payment method: 'cash', 'card', 'bank_transfer', 'wallet'
✅ Payment frequency: 'monthly', 'quarterly', 'annually'
```

### payments table:
```javascript
✅ Status values: 'pending', 'completed', 'failed', 'refunded', 'cancelled'
✅ Payment type: 'subscription', 'session', 'product', 'other'
✅ Payment method: 'cash', 'card', 'bank_transfer', 'wallet'
✅ Currency: 'EGP' (default)
```

### attendance table:
```javascript
✅ location: VARCHAR(100), default 'Main Gate'
✅ subscription_valid: BOOLEAN, default TRUE
✅ access_granted: BOOLEAN, default TRUE
✅ duration_minutes: INTEGER (GENERATED COLUMN - do not insert)
```

## Postman Collection Template

### Example Request: Create Subscription
```json
POST /api/subscriptions
Headers:
  Authorization: Bearer <token>
  Content-Type: application/json

Body:
{
  "userId": "uuid-here",
  "planId": "uuid-here",
  "paymentMethod": "card",
  "autoRenew": true
}

Response:
{
  "success": true,
  "data": {
    "subscription": {
      "id": "uuid",
      "user_id": "uuid",
      "plan_id": "uuid",
      "start_date": "2026-11-08",
      "end_date": "2026-12-08",
      "status": "pending",
      "payment_method": "card",
      "payment_frequency": "monthly",
      "amount": "129.00",
      "auto_renew": true,
      "next_billing_date": "2026-12-08",
      "created_at": "2026-11-08T16:00:00Z"
    }
  }
}
```

### Example Request: Get Plans
```json
GET /api/plans
Response:
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": "uuid",
        "name": "Open Gym Core",
        "description": "24/7 access to all equipment",
        "price": "79.00",
        "duration": "monthly",
        "features": ["24/7 gym access", "Equipment access"],
        "access_level": "basic",
        "max_classes": 0,
        "includes_personal_training": false,
        "is_active": true,
        "is_visible": true
      }
    ]
  }
}
```

### Example Request: Register
```json
POST /api/auth/register
Body:
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "John Doe",
  "phone": "+1234567890",
  "planId": "uuid-here"
}

Response:
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "fullName": "John Doe",
      "phone": "+1234567890",
      "role": "member",
      "status": "active"
    },
    "accessToken": "jwt-token-here",
    "refreshToken": "refresh-token-here"
  }
}
```

## Testing Checklist

After fixes:
- [ ] Register user works
- [ ] Login works
- [ ] Get plans returns correct fields
- [ ] Create subscription works
- [ ] Get members list works (admin)
- [ ] Get member profile works
- [ ] Update profile works
- [ ] Check-in/out attendance works
- [ ] All queries execute without column errors

## Manual Fix Steps

1. **Fix Subscription Controller**:
```javascript
// Find and replace in subscriptionController.js
mp.tier → mp.access_level
```

2. **Verify Seed Data**:
```javascript
// In seed.js, ensure no references to removed columns
```

3. **Test All Endpoints**:
```powershell
# Test plans
Invoke-RestMethod -Uri "http://localhost:5000/api/plans"

# Test health
Invoke-RestMethod -Uri "http://localhost:5000/health"
```

4. **Check Frontend**:
```javascript
// Search for these in frontend:
- tier (should be access_level)
- planTier (should be planAccessLevel)
```

## Status
- ✅ Plans Controller Fixed
- ✅ Members Controller Fixed
- ✅ Subscriptions Controller Fixed
- ✅ Payments Controller Fixed (default currency EGP)
- ✅ Attendance Controller Fixed (entry_point column added; denied entry returns 403)
- ✅ Seed Script Fixed
- ✅ Validators aligned with schema (no tier, payment method 'wallet')
