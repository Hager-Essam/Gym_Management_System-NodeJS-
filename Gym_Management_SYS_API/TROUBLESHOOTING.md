# Troubleshooting Guide

## Common Registration Issues

### Issue: 400 Bad Request on Registration

**Symptoms:**
- POST http://localhost:5000/api/auth/register returns 400
- Frontend shows "Registration failed" error

**Common Causes:**

#### 1. Phone Number Validation
**Problem:** Empty phone field being validated as mobile number

**Solution:** ✅ FIXED
- Updated validator to properly handle optional phone
- Frontend now excludes phone if empty

**Test:**
```javascript
// This should work now:
{
  "fullName": "John Doe",
  "email": "test@example.com",
  "password": "password123"
  // phone is optional - can be omitted
}
```

#### 2. Invalid Email Format
**Problem:** Email fails validation

**Check:**
```javascript
// Valid emails:
"user@example.com" ✅
"john.doe@company.co.uk" ✅

// Invalid emails:
"userexample.com" ❌
"@example.com" ❌
"user@" ❌
```

#### 3. Password Too Short
**Problem:** Password less than 6 characters

**Check:**
```javascript
"pass" ❌ (4 chars)
"pass123" ✅ (7 chars)
```

#### 4. Full Name Missing
**Problem:** Full name empty or too short

**Check:**
```javascript
"J" ❌ (1 char)
"Jo" ✅ (2 chars minimum)
"John Doe" ✅
```

---

## How to Debug Registration Issues

### Step 1: Check Backend Logs
Look at terminal running `npm run dev`:

**Success:**
```
POST /api/auth/register 201 152ms
```

**Validation Error:**
```
POST /api/auth/register 400 12ms
```

### Step 2: Check Browser Console
Open DevTools → Console:

**Look for:**
```
Registration error: {errors: [{field: 'phone', message: '...'}]}
```

### Step 3: Check Network Tab
Open DevTools → Network → Find the POST request

**Request Payload:**
```json
{
  "fullName": "John Doe",
  "email": "test@example.com",
  "password": "password123"
}
```

**Response (if 400):**
```json
{
  "success": false,
  "errors": [
    {
      "field": "phone",
      "message": "Please provide a valid phone number"
    }
  ]
}
```

---

## Testing Registration

### Method 1: Using Frontend
1. Go to `http://localhost:5173/register`
2. Fill in:
   - Full Name: Test User
   - Email: test@example.com
   - Password: password123
   - Accept terms
3. Click "Create account"
4. Should redirect to dashboard

### Method 2: Using Postman
```json
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "fullName": "Test User",
  "email": "test@example.com",
  "password": "password123"
}
```

**Expected Response (201):**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "...",
      "email": "test@example.com",
      "fullName": "Test User",
      "role": "member"
    },
    "accessToken": "eyJhbGciOiJI...",
    "refreshToken": "eyJhbGciOiJI..."
  }
}
```

### Method 3: Using curl
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"fullName\":\"Test User\",\"email\":\"test@example.com\",\"password\":\"password123\"}"
```

---

## Other Common Issues

### Issue: CORS Error
**Symptom:**
```
Access to XMLHttpRequest blocked by CORS policy
```

**Solution:**
1. Check backend `.env`: `CORS_ORIGIN=http://localhost:5173`
2. Restart backend server

### Issue: Database Connection Error
**Symptom:**
```
error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**
1. Start PostgreSQL
2. Check database credentials in `.env`
3. Run migrations: `npm run migrate`

### Issue: Token Not Being Saved
**Symptom:**
- Registration succeeds but dashboard shows "not logged in"

**Check:**
1. Open DevTools → Application → Local Storage
2. Should see: `accessToken`, `refreshToken`, `user`

**Debug:**
```javascript
// In browser console:
localStorage.getItem('accessToken')
localStorage.getItem('user')
```

### Issue: Email Already Exists
**Symptom:**
```
"A user with this email already exists"
```

**Solution:**
1. Use different email
2. Or login with existing email
3. Or delete user from database:
```sql
DELETE FROM users WHERE email = 'test@example.com';
```

---

## Validation Rules Summary

| Field | Required | Validation |
|-------|----------|------------|
| fullName | ✅ Yes | Min 2 characters |
| email | ✅ Yes | Valid email format |
| password | ✅ Yes | Min 6 characters |
| phone | ❌ No | Valid phone format (if provided) |
| planId | ❌ No | Valid UUID (if provided) |
| terms | ✅ Yes (frontend) | Must be checked |

---

## Quick Fixes Applied

### ✅ Fix #1: Phone Field Validation
**Before:**
```javascript
body('phone')
  .optional()
  .isMobilePhone()
```

**After:**
```javascript
body('phone')
  .optional({ nullable: true, checkFalsy: true })
  .isMobilePhone()
```

**What changed:** Now properly ignores empty strings

### ✅ Fix #2: Frontend Request Body
**Before:**
```javascript
{
  phone: userData.phone || null,
  planId: userData.planId || null,
}
```

**After:**
```javascript
// Only include if has value
if (userData.phone && userData.phone.trim()) {
  requestBody.phone = userData.phone;
}
```

**What changed:** Excludes empty fields from request

### ✅ Fix #3: Better Error Messages
**Before:**
```javascript
throw new Error('Registration failed');
```

**After:**
```javascript
const message = error.response?.data?.errors?.[0]?.message || 
                error.response?.data?.error;
throw new Error(message);
```

**What changed:** Shows actual validation error

---

## Testing After Fixes

### Test Case 1: Minimal Registration
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```
**Expected:** ✅ Success (201)

### Test Case 2: With Phone
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+1234567890"
}
```
**Expected:** ✅ Success (201)

### Test Case 3: With Plan
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "planId": "valid-uuid-here"
}
```
**Expected:** ✅ Success (201)

### Test Case 4: Invalid Email
```json
{
  "fullName": "John Doe",
  "email": "invalid-email",
  "password": "password123"
}
```
**Expected:** ❌ 400 Bad Request

### Test Case 5: Short Password
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "pass"
}
```
**Expected:** ❌ 400 Bad Request

---

## Still Having Issues?

1. **Check backend is running:**
   ```bash
   curl http://localhost:5000/health
   ```

2. **Check frontend is running:**
   - Open `http://localhost:5173`

3. **Clear browser cache:**
   - DevTools → Application → Clear site data

4. **Restart both servers:**
   ```bash
   # Backend
   cd Gym_Management_SYS_API
   npm run dev

   # Frontend
   cd gym-system
   npm run dev
   ```

5. **Check logs:**
   - Backend terminal for errors
   - Browser console for errors
   - Network tab for request/response

---

## Contact

If issues persist after following this guide, check:
1. Backend logs in terminal
2. Browser console for detailed errors
3. Network tab to see exact request/response
