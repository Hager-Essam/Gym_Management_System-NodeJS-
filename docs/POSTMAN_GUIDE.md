# Postman Collection Guide

This guide explains how to use the Postman collection to test the IronForge Gym API.

## 📥 Import the Collection

### Option 1: Import File

1. Open Postman
2. Click "Import" button (top left)
3. Select "Upload Files"
4. Choose `IronForge-Gym-API.postman_collection.json`
5. Click "Import"

### Option 2: Import via Link

1. Open Postman
2. Click "Import"
3. Paste the file path or URL
4. Click "Continue" → "Import"

## 🔧 Setup Environment

### Create a New Environment

1. Click "Environments" in left sidebar
2. Click "+" to create new environment
3. Name it: `IronForge Gym - Local`

### Add Variables

Add these variables:

| Variable | Initial Value | Current Value |
|----------|--------------|---------------|
| `baseUrl` | `http://localhost:5000` | `http://localhost:5000` |
| `accessToken` | (leave empty) | (auto-filled after login) |
| `refreshToken` | (leave empty) | (auto-filled after login) |
| `userId` | (leave empty) | (auto-filled after login) |
| `planId` | (leave empty) | (manual or from Get Plans) |
| `subscriptionId` | (leave empty) | (manual) |
| `attendanceId` | (leave empty) | (manual) |

### Select the Environment

In the top-right dropdown, select `IronForge Gym - Local`

## 🚀 Quick Start

### 1. Health Check

**Purpose:** Verify backend is running

**Request:** `Health Check`

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-11-04T...",
  "environment": "development"
}
```

### 2. Login (Get Token)

**Request:** `Authentication → Login`

**Body (use existing test user):**
```json
{
  "email": "john@ironforge.com",
  "password": "password123"
}
```

**What happens:**
- Request sends credentials
- Backend validates and returns tokens
- **Postman automatically saves tokens to environment!**
- Check environment: `accessToken` and `userId` are now filled

**Test Script (runs automatically):**
```javascript
if (pm.response.code === 200) {
    const jsonData = pm.response.json();
    pm.environment.set('accessToken', jsonData.data.accessToken);
    pm.environment.set('refreshToken', jsonData.data.refreshToken);
    pm.environment.set('userId', jsonData.data.user.id);
}
```

### 3. Test Protected Endpoint

**Request:** `Members → Get My Profile`

**What happens:**
- Request automatically includes: `Authorization: Bearer {{accessToken}}`
- Backend verifies token
- Returns your profile

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "email": "john@ironforge.com",
      "fullName": "John Doe",
      "role": "member",
      ...
    },
    "subscription": { ... }
  }
}
```

## 📚 Collection Structure

### 1. Authentication

All auth endpoints for login, register, logout, token refresh.

**Endpoints:**
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login (saves token automatically)
- `GET /api/auth/me` - Get current user
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout

### 2. Members

Member management endpoints.

**Endpoints:**
- `GET /api/members` - All members (Admin/Manager only)
- `GET /api/members/me` - My profile
- `PUT /api/members/me` - Update my profile
- `GET /api/members/:id` - Member by ID
- `PUT /api/members/:id` - Update member (Admin)
- `DELETE /api/members/:id` - Delete member (Admin)
- `GET /api/members/:id/subscription` - Member subscription
- `GET /api/members/:id/attendance` - Member attendance

### 3. Membership Plans

Plan management endpoints.

**Endpoints:**
- `GET /api/plans` - All active plans (Public)
- `GET /api/plans/:id` - Plan by ID (Public)
- `POST /api/plans` - Create plan (Admin)
- `PUT /api/plans/:id` - Update plan (Admin)

### 4. Subscriptions

Subscription management endpoints.

**Endpoints:**
- `GET /api/subscriptions` - All subscriptions
- `GET /api/subscriptions/expiring` - Expiring soon
- `POST /api/subscriptions` - Create subscription
- `DELETE /api/subscriptions/:id` - Cancel subscription

### 5. Attendance

Attendance tracking endpoints.

**Endpoints:**
- `POST /api/attendance/check-in` - Check-in member
- `POST /api/attendance/check-out` - Check-out member
- `GET /api/attendance/today` - Today's attendance
- `GET /api/attendance` - All attendance records
- `GET /api/attendance/member/:id` - Member attendance

### 6. Payments

Payment processing endpoints.

**Endpoints:**
- `GET /api/payments` - All payments
- `GET /api/payments/stats` - Payment statistics
- `GET /api/payments/member/:id` - Member payments
- `POST /api/payments` - Process payment

## 🎯 Common Workflows

### Workflow 1: Register New Member

1. **Register** (`POST /api/auth/register`)
   ```json
   {
     "email": "newuser@example.com",
     "password": "password123",
     "fullName": "New User",
     "phone": "+1234567899"
   }
   ```
   - Tokens saved automatically
   - User is now logged in

2. **Get My Profile** (`GET /api/members/me`)
   - Uses saved token automatically

3. **Update Profile** (`PUT /api/members/me`)
   ```json
   {
     "phone": "+1234567890",
     "address": "123 Main St, City, State"
   }
   ```

### Workflow 2: Admin Managing Members

1. **Login as Admin**
   ```json
   {
     "email": "admin@ironforge.com",
     "password": "password123"
   }
   ```

2. **Get All Members** (`GET /api/members`)
   - Copy a member's `id` from response

3. **Get Member Details** (`GET /api/members/:id`)
   - Manually set `userId` in environment or URL

4. **Update Member Status** (`PUT /api/members/:id`)
   ```json
   {
     "status": "suspended"
   }
   ```

### Workflow 3: Subscription Flow

1. **Get Plans** (`GET /api/plans`)
   - Copy a `planId` from response
   - Set it in environment variables

2. **Create Subscription** (`POST /api/subscriptions`)
   ```json
   {
     "userId": "{{userId}}",
     "planId": "{{planId}}",
     "paymentMethod": "card",
     "autoRenew": true
   }
   ```

3. **Get Member Subscription** (`GET /api/members/:id/subscription`)

### Workflow 4: Attendance Tracking

1. **Check-In** (`POST /api/attendance/check-in`)
   ```json
   {
     "userId": "{{userId}}",
     "location": "Main Gate"
   }
   ```
   - Copy `attendanceId` from response

2. **Get Today's Attendance** (`GET /api/attendance/today`)

3. **Check-Out** (`POST /api/attendance/check-out`)
   ```json
   {
     "attendanceId": "PASTE_ID_HERE"
   }
   ```

## 🔑 Authorization

### Automatic Token Management

Most requests use Bearer token authorization:

**Headers automatically added:**
```
Authorization: Bearer {{accessToken}}
```

**Setup in Postman:**
1. Open any protected request
2. Go to "Authorization" tab
3. Type: "Bearer Token"
4. Token: `{{accessToken}}`

This is already configured in the collection!

### Manual Token Entry

If automatic token isn't working:

1. Copy token from Login response
2. Set in environment: `accessToken = <your_token>`
3. Or paste directly in request Auth tab

## 🧪 Testing Different Roles

### Test as Member
```json
{
  "email": "john@ironforge.com",
  "password": "password123"
}
```

**Can access:**
- Own profile
- Own attendance
- Own subscriptions
- Public plans

### Test as Admin
```json
{
  "email": "admin@ironforge.com",
  "password": "password123"
}
```

**Can access:**
- All members
- Create/update/delete plans
- Manage subscriptions
- View all attendance
- All admin operations

### Test as Manager
```json
{
  "email": "manager@ironforge.com",
  "password": "password123"
}
```

**Can access:**
- View all members
- View subscriptions
- Check-in/out members
- Payment records

### Test as Coach
```json
{
  "email": "coach@ironforge.com",
  "password": "password123"
}
```

**Can access:**
- Own profile
- View members (limited)

## 🐛 Troubleshooting

### Issue: "Could not send request"

**Solution:**
- Ensure backend is running: `npm run dev` in API folder
- Check `baseUrl` in environment: `http://localhost:5000`
- Test with Health Check request

### Issue: 401 Unauthorized

**Solutions:**
1. Check if you're logged in (token in environment)
2. Login again to get fresh token
3. Check token hasn't expired (7 days default)

### Issue: 403 Forbidden

**Cause:** Your role doesn't have permission

**Solution:**
- Check endpoint requirements (some are Admin-only)
- Login with appropriate role
- Example: `GET /api/members` requires Admin or Manager

### Issue: 404 Not Found

**Causes:**
- Wrong endpoint URL
- Backend not running
- Typo in path

**Solution:**
- Check URL matches documentation
- Ensure backend server is running
- Check for typos

### Issue: 400 Bad Request

**Cause:** Invalid data in request

**Solution:**
- Check request body format
- Ensure all required fields are present
- Verify data types (strings, numbers, etc.)

### Issue: Variables not auto-filling

**Solution:**
1. Check environment is selected (top-right dropdown)
2. Check Test Scripts are enabled
3. Run Login request again
4. Manually check environment variables are saved

## 📊 Expected Response Times

- Health Check: < 10ms
- Login: 100-300ms (bcrypt hashing)
- Register: 100-300ms (bcrypt hashing)
- GET requests: 10-50ms
- POST/PUT requests: 20-100ms
- Database queries: 5-30ms

If responses are slower, check:
- Database connection
- Network latency
- Backend logs for errors

## 💡 Pro Tips

### 1. Use Pre-request Scripts

Add to collection to run before every request:
```javascript
// Refresh token if needed
const token = pm.environment.get('accessToken');
if (!token) {
    pm.execution.skipRequest();
    console.log('No token - skipping request');
}
```

### 2. Use Tests Tab

Add assertions:
```javascript
pm.test("Status is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response has user", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData.data.user).to.exist;
});
```

### 3. Save Common IDs

After creating resources, save IDs:
```javascript
// In Test script
const response = pm.response.json();
pm.environment.set('subscriptionId', response.data.subscription.id);
```

### 4. Use Collection Variables

For values that don't change:
- Collection → Variables
- Add `baseUrl` there instead of environment

### 5. Export Environment

Share with team:
- Environments → More options → Export
- Share the JSON file

## 📝 Request Examples

### Register with Plan

```json
{
  "email": "premium@example.com",
  "password": "password123",
  "fullName": "Premium User",
  "phone": "+1234567899",
  "planId": "PLAN_ID_FROM_GET_PLANS"
}
```

### Search Members

```
GET /api/members?search=john&status=active&page=1&limit=10
```

### Filter Payments by Date

```
GET /api/payments?startDate=2024-01-01&endDate=2024-12-31&status=completed
```

### Get Expiring Subscriptions

```
GET /api/subscriptions/expiring?days=7
```

## 🎓 Learning Path

1. **Start with Health Check** - Verify connection
2. **Login** - Understand authentication
3. **Get My Profile** - Learn protected routes
4. **Try CRUD on Plans** - Public → Protected flow
5. **Test different roles** - Understand authorization
6. **Explore all endpoints** - Master the API

## ✅ Postman Checklist

- [ ] Collection imported
- [ ] Environment created with `baseUrl`
- [ ] Health check successful
- [ ] Login successful (token saved)
- [ ] Protected endpoint works
- [ ] Tested as Member
- [ ] Tested as Admin
- [ ] All workflows tested
- [ ] Errors handled gracefully

You're ready to test the entire API! 🚀
