# Postman Collection Updated - Schema Aligned

## ✅ Updates Applied

### 1. Create Plan Endpoint - Removed Invalid Fields
**Before:**
```json
{
  "tier": "Tier 04",
  "name": "Student Special",
  "description": "Affordable plan for students",
  "price": 59,
  "duration": "monthly",
  "features": ["Basic access", "Locker room", "Mobile app"],
  "accessLevel": "basic",
  "displayOrder": 4,
  "colorCode": "#fbbf24"
}
```

**After (✅ Schema-Aligned):**
```json
{
  "name": "Student Special",
  "description": "Affordable plan for students",
  "price": 59,
  "duration": "monthly",
  "features": ["Basic access", "Locker room", "Mobile app"],
  "access_level": "basic",
  "max_classes": 0,
  "includes_personal_training": false
}
```

### 2. Register Endpoint - Added planId Support
**Before:**
```json
{
  "email": "newmember@example.com",
  "password": "password123",
  "fullName": "New Member",
  "phone": "+1234567899"
}
```

**After (✅ Enhanced):**
```json
{
  "email": "newmember@example.com",
  "password": "password123",
  "fullName": "New Member",
  "phone": "+1234567899",
  "planId": "{{planId}}"
}
```

### 3. Get All Plans - Added Auto-Save Script
Added test script to automatically save the first plan's ID to `{{planId}}` variable for use in other requests.

---

## 📋 All Schema-Aligned Fields

### membership_plans Table
```javascript
✅ CORRECT FIELDS:
{
  "id": "UUID",
  "name": "string",
  "description": "string",
  "price": "number",
  "duration": "monthly|quarterly|annually",
  "features": ["array"],          // JSONB
  "access_level": "basic|premium|vip",  // NOT "tier"
  "max_classes": "number|null",
  "includes_personal_training": "boolean",
  "is_active": "boolean",
  "is_visible": "boolean"
}

❌ REMOVED FIELDS (do not use):
- tier
- accessLevel (use access_level with underscore)
- displayOrder
- colorCode
- includes_sauna
- includes_pool
- setup_fee
- cancellation_fee
```

### users Table (Register/Update)
```javascript
✅ REQUEST BODY (camelCase):
{
  "email": "string",
  "password": "string",
  "fullName": "string",
  "phone": "string",
  "address": "string",
  "dateOfBirth": "date",
  "gender": "male|female|other",
  "emergencyContact": "string",
  "bio": "string",
  "planId": "UUID"  // For registration
}

✅ RESPONSE (camelCase):
{
  "id": "UUID",
  "email": "string",
  "fullName": "string",  // from full_name
  "phone": "string",
  "status": "active|inactive|suspended",
  "role": "member|trainer|manager|admin",
  "dateOfBirth": "date",  // from date_of_birth
  "emergencyContact": "string"  // from emergency_contact
}
```

### subscriptions Table
```javascript
✅ CREATE SUBSCRIPTION:
{
  "userId": "UUID",
  "planId": "UUID",
  "paymentMethod": "cash|card|bank_transfer|wallet",
  "autoRenew": "boolean"
}

✅ RESPONSE:
{
  "id": "UUID",
  "user_id": "UUID",
  "plan_id": "UUID",
  "start_date": "date",
  "end_date": "date",
  "status": "pending|active|expired|cancelled|paused",
  "payment_method": "string",
  "payment_frequency": "monthly|quarterly|annually",
  "amount": "decimal",
  "auto_renew": "boolean",
  "next_billing_date": "date"
}
```

### payments Table
```javascript
✅ CREATE PAYMENT:
{
  "userId": "UUID",
  "subscriptionId": "UUID",
  "amount": "number",
  "currency": "EGP",  // Default
  "paymentMethod": "cash|card|bank_transfer|wallet",
  "paymentType": "subscription|session|product|other",
  "description": "string",
  "transactionId": "string"
}
```

### attendance Table
```javascript
✅ CHECK-IN:
{
  "userId": "UUID",
  "location": "string"  // Default: "Main Gate"
}

✅ CHECK-OUT:
{
  "attendanceId": "UUID"
}

⚠️ NOTE: duration_minutes is GENERATED - do not include in requests
```

---

## 🎯 Postman Collection Usage Guide

### Step 1: Import Collection
1. Open Postman
2. Click "Import"
3. Select: `IronForge-Gym-API.postman_collection.json`
4. Collection imported!

### Step 2: Create Environment (Optional but Recommended)
1. Click "Environments" in Postman
2. Create new environment: "Gym API Local"
3. Add variable:
   - `baseUrl`: `http://localhost:5000`
4. Save and select the environment

### Step 3: Test Flow
**Recommended testing sequence:**

1. **Health Check** - Verify API is running
   ```
   GET {{baseUrl}}/health
   ```

2. **Get All Plans** - Fetches plans and auto-saves first planId
   ```
   GET {{baseUrl}}/api/plans
   ```
   ✅ This automatically saves `{{planId}}`

3. **Register** - Create new user with plan
   ```
   POST {{baseUrl}}/api/auth/register
   Body uses {{planId}} from step 2
   ```
   ✅ This automatically saves tokens and `{{userId}}`

4. **Login** - Test existing user
   ```
   POST {{baseUrl}}/api/auth/login
   ```
   ✅ This automatically saves tokens and `{{userId}}`

5. **Get My Profile** - Verify auth works
   ```
   GET {{baseUrl}}/api/members/me
   ```

6. **Update My Profile** - Test profile update
   ```
   PUT {{baseUrl}}/api/members/me
   ```

7. **Create Subscription** - Create subscription
   ```
   POST {{baseUrl}}/api/subscriptions
   Uses {{userId}} and {{planId}}
   ```

8. **Check-In** - Test attendance
   ```
   POST {{baseUrl}}/api/attendance/check-in
   ```

---

## 🔄 Auto-Saved Variables

The collection automatically saves these variables after successful requests:

| Variable | Saved By | Used By |
|----------|----------|---------|
| `accessToken` | Login, Register | All authenticated endpoints |
| `refreshToken` | Login, Register | Refresh Token endpoint |
| `userId` | Login, Register | Member endpoints, Subscriptions, Attendance |
| `planId` | Get All Plans | Register, Create Subscription |

---

## ✅ Field Naming Summary

### Database (snake_case) → API Response (camelCase)
```javascript
full_name         → fullName
date_of_birth     → dateOfBirth
emergency_contact → emergencyContact
access_level      → accessLevel  (in response)
payment_method    → paymentMethod (in response)
```

### Request Body → Database
```javascript
fullName          → full_name
dateOfBirth       → date_of_birth
emergencyContact  → emergency_contact
access_level      → access_level  (keep underscore in POST)
```

---

## 🚀 Testing All Endpoints

### Authentication (5 endpoints)
- ✅ Register (with planId)
- ✅ Login
- ✅ Get Current User
- ✅ Refresh Token
- ✅ Logout

### Members (8 endpoints)
- ✅ Get All Members
- ✅ Get My Profile
- ✅ Update My Profile
- ✅ Get Member By ID
- ✅ Update Member (Admin)
- ✅ Delete Member (Admin)
- ✅ Get Member Subscription
- ✅ Get Member Attendance

### Plans (5 endpoints)
- ✅ Get All Plans (auto-saves planId)
- ✅ Get Plan By ID
- ✅ Create Plan (Admin) - Schema aligned
- ✅ Update Plan (Admin)
- ✅ Delete Plan (Admin) - if implemented

### Subscriptions (4 endpoints)
- ✅ Get All Subscriptions
- ✅ Get Expiring Subscriptions
- ✅ Create Subscription
- ✅ Cancel Subscription

### Attendance (5 endpoints)
- ✅ Check-In Member
- ✅ Check-Out Member
- ✅ Get Today's Attendance
- ✅ Get All Attendance
- ✅ Get Member Attendance

### Payments (4 endpoints)
- ✅ Get All Payments
- ✅ Get Payment Statistics
- ✅ Get Member Payments
- ✅ Process Payment

---

## 📝 Sample Expected Responses

### Get All Plans
```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": "02174738-69b0-4803-a7e0-63157823c8fa",
        "name": "Open Gym Core",
        "description": "24/7 access to all equipment and basic facilities",
        "price": "79.00",
        "duration": "monthly",
        "features": ["24/7 gym access", "Equipment access", "Mobile app", "Locker room"],
        "access_level": "basic",
        "max_classes": 0,
        "includes_personal_training": false,
        "is_active": true,
        "is_visible": true,
        "created_at": "2026-11-08T13:22:47.869Z"
      }
    ]
  }
}
```

### Register Success
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "newmember@example.com",
      "fullName": "New Member",
      "phone": "+1234567899",
      "role": "member",
      "status": "active",
      "createdAt": "2026-11-08T16:00:00Z"
    },
    "accessToken": "jwt-token-here",
    "refreshToken": "refresh-token-here"
  }
}
```

### Get My Profile
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "john@ironforge.com",
      "fullName": "John Doe",
      "phone": "+1234567893",
      "status": "active",
      "dateOfBirth": "1990-01-15",
      "gender": "male",
      "address": "123 Main St, City, State 12345",
      "emergencyContact": "Jane Doe - +1234567894",
      "profilePicture": null,
      "bio": null,
      "createdAt": "2026-11-08T13:22:47.869Z",
      "lastLogin": "2026-11-08T15:30:00Z"
    },
    "subscription": {
      "id": "uuid",
      "status": "active",
      "start_date": "2026-11-01",
      "end_date": "2026-12-01",
      "auto_renew": true,
      "payment_method": "card",
      "next_billing_date": "2026-12-01",
      "plan_name": "Open Gym Core",
      "price": "79.00",
      "duration": "monthly",
      "features": ["24/7 gym access", "Equipment access"]
    }
  }
}
```

---

## ⚠️ Common Issues & Solutions

### Issue: "column does not exist"
**Cause**: Using removed fields like `tier`, `displayOrder`
**Solution**: Use schema-aligned fields from this document

### Issue: "Invalid UUID"
**Cause**: Trying to use number instead of UUID for planId
**Solution**: Use the `{{planId}}` variable saved by "Get All Plans"

### Issue: "Unauthorized"
**Cause**: Missing or expired access token
**Solution**: Run "Login" request first to set `{{accessToken}}`

### Issue: "Validation error"
**Cause**: Wrong field names (camelCase vs snake_case)
**Solution**: Use camelCase in request body, snake_case in database queries

---

## 🎉 Status

- ✅ **Postman Collection**: Fully updated and schema-aligned
- ✅ **Invalid Fields Removed**: tier, displayOrder, colorCode
- ✅ **Correct Fields Added**: access_level, max_classes, includes_personal_training
- ✅ **Auto-Save Scripts**: Added for planId, tokens, userId
- ✅ **Ready to Use**: Import and start testing immediately!

---

**Last Updated**: Current session
**Collection File**: `IronForge-Gym-API.postman_collection.json`
**Status**: ✅ Schema-aligned and ready for testing
