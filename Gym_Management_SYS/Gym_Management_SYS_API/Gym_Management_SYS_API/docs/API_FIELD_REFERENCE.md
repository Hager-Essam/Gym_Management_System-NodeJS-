# API Field Reference Guide

## Field Naming Convention

**Important**: The API uses **camelCase** for request/response bodies, while the database uses **snake_case**.

---

## Membership Plans Endpoints

### Create Plan - POST /api/plans

**Request Body** (camelCase):
```json
{
  "name": "Student Special",
  "description": "Affordable plan for students",
  "price": 59,
  "duration": "monthly",
  "features": ["Basic access", "Locker room", "Mobile app"],
  "accessLevel": "basic",           // ✅ camelCase
  "maxClasses": 0,                   // ✅ camelCase
  "includesPersonalTraining": false, // ✅ camelCase
  "isActive": true,                  // ✅ camelCase (optional, defaults to true)
  "isVisible": true                  // ✅ camelCase (optional, defaults to true)
}
```

**Validation Rules**:
- `accessLevel` **must be one of**: `"basic"`, `"premium"`, `"vip"`
- `duration` **must be one of**: `"monthly"`, `"quarterly"`, `"annually"`
- `price` must be a positive number
- `name` is required

**Common Errors**:
```json
// ❌ WRONG - Using snake_case
{
  "access_level": "basic",              // Will fail validation
  "max_classes": 0,                     // Will fail validation
  "includes_personal_training": false   // Will fail validation
}

// ❌ WRONG - Invalid accessLevel value
{
  "accessLevel": "standard"  // Must be: basic, premium, or vip
}
```

---

### Update Plan - PUT /api/plans/:id

**Request Body** (all fields optional, camelCase):
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "price": 69,
  "duration": "quarterly",
  "features": ["Feature 1", "Feature 2"],
  "accessLevel": "premium",
  "maxClasses": 10,
  "includesPersonalTraining": true,
  "isActive": true,
  "isVisible": true
}
```

---

### Get Plans Response - GET /api/plans

**Response Format**:
```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": "uuid",
        "name": "Basic Plan",
        "description": "...",
        "price": 49,
        "duration": "monthly",
        "features": ["..."],
        "access_level": "basic",           // ⚠️ snake_case in response
        "max_classes": 0,                  // ⚠️ snake_case in response
        "includes_personal_training": false, // ⚠️ snake_case in response
        "is_active": true,
        "is_visible": true,
        "created_at": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

**Note**: Response uses snake_case because it returns database fields directly.

---

## Authentication Endpoints

### Register - POST /api/auth/register

**Request Body** (camelCase):
```json
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "John Doe",        // ✅ camelCase
  "phone": "+1234567890",
  "planId": "plan-uuid-here"     // ✅ camelCase
}
```

**Validation Rules**:
- Email must be valid format
- Password minimum 6 characters
- fullName minimum 2 characters
- phone must be valid mobile number (optional)
- planId must be valid UUID (optional)

---

### Login - POST /api/auth/login

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "accessToken": "jwt-token-here",
    "refreshToken": "refresh-token-here",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",      // ⚠️ snake_case in response
      "role": "member",
      "phone": "+1234567890"
    }
  }
}
```

---

## Members Endpoints

### Update Member - PUT /api/members/:id

**Request Body** (camelCase):
```json
{
  "fullName": "Updated Name",        // ✅ camelCase
  "phone": "+1234567890",
  "address": "123 Main St",
  "dateOfBirth": "1990-01-01",       // ✅ camelCase
  "gender": "male",
  "emergencyContact": "Jane Doe"     // ✅ camelCase
}
```

**Validation Rules**:
- `gender` must be one of: `"male"`, `"female"`, `"other"`
- `dateOfBirth` must be ISO 8601 format (YYYY-MM-DD)

---

## Subscriptions Endpoints

### Create Subscription - POST /api/subscriptions

**Request Body** (camelCase):
```json
{
  "userId": "user-uuid",
  "planId": "plan-uuid",           // ✅ camelCase
  "paymentMethod": "card",         // ✅ camelCase
  "autoRenew": true                // ✅ camelCase
}
```

**Validation Rules**:
- `paymentMethod` must be one of: `"card"`, `"cash"`, `"bank_transfer"`, `"wallet"`
- `autoRenew` must be boolean (optional)

---

## Quick Reference Table

| Database Field (snake_case) | API Request Field (camelCase) | Valid Values |
|------------------------------|-------------------------------|--------------|
| `access_level` | `accessLevel` | `"basic"`, `"premium"`, `"vip"` |
| `max_classes` | `maxClasses` | Integer (0 or positive) |
| `includes_personal_training` | `includesPersonalTraining` | Boolean |
| `is_active` | `isActive` | Boolean |
| `is_visible` | `isVisible` | Boolean |
| `full_name` | `fullName` | String (min 2 chars) |
| `date_of_birth` | `dateOfBirth` | ISO 8601 date |
| `emergency_contact` | `emergencyContact` | String |
| `payment_method` | `paymentMethod` | `"card"`, `"cash"`, `"bank_transfer"`, `"wallet"` |
| `auto_renew` | `autoRenew` | Boolean |

---

## Testing Tips

1. **Use correct casing**: Always use camelCase in request bodies
2. **Check validation**: Ensure enum values match exactly (case-sensitive)
3. **Read responses**: Response fields are in snake_case (database format)
4. **Import Postman collection**: Updated collection has correct field names

---

## Common Mistakes to Avoid

❌ **Wrong**: Using snake_case in request body
```json
{ "access_level": "basic" }  // Will fail validation
```

✅ **Correct**: Use camelCase
```json
{ "accessLevel": "basic" }
```

❌ **Wrong**: Invalid enum value
```json
{ "accessLevel": "standard" }  // Not in allowed list
```

✅ **Correct**: Use allowed values
```json
{ "accessLevel": "basic" }  // or "premium" or "vip"
```

❌ **Wrong**: Mixing conventions
```json
{
  "accessLevel": "basic",      // Correct
  "max_classes": 0             // Wrong - should be maxClasses
}
```

✅ **Correct**: Consistent camelCase
```json
{
  "accessLevel": "basic",
  "maxClasses": 0
}
```

---

**Last Updated**: Based on schema.sql and validators.js validation rules
