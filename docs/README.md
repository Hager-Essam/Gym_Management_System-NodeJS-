# IronForge Gym Management System - Backend API

Complete RESTful API for the IronForge Gym Management System built with Node.js, Express, and PostgreSQL.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- npm or yarn

### Installation

1. **Clone and install dependencies:**
```bash
cd Gym_Management_SYS_API
npm install
```

2. **Setup PostgreSQL database:**
```bash
# Create database
createdb ironforge_gym

# Or using psql
psql -U postgres
CREATE DATABASE ironforge_gym;
```

3. **Configure environment variables:**
```bash
cp .env.example .env
# Edit .env with your database credentials
```

4. **Run database migrations:**
```bash
npm run migrate
```

5. **Seed database with sample data (optional):**
```bash
npm run seed
```

6. **Start the development server:**
```bash
npm run dev
```

Server will run on `http://localhost:5000`

## 📁 Project Structure

```
Gym_Management_SYS_API/
├── src/
│   ├── config/
│   │   └── database.js          # Database configuration
│   ├── controllers/
│   │   ├── authController.js    # Authentication logic
│   │   ├── memberController.js  # Member CRUD operations
│   │   ├── planController.js    # Membership plans
│   │   ├── subscriptionController.js
│   │   ├── paymentController.js
│   │   └── attendanceController.js
│   ├── middleware/
│   │   ├── authMiddleware.js    # JWT verification
│   │   ├── errorHandler.js      # Error handling
│   │   ├── validators.js        # Request validation
│   │   └── rateLimiter.js       # Rate limiting
│   ├── models/
│   │   ├── User.js              # User model
│   │   ├── Plan.js              # Plan model
│   │   ├── Subscription.js      # Subscription model
│   │   └── ...
│   ├── routes/
│   │   ├── authRoutes.js        # /api/auth/*
│   │   ├── memberRoutes.js      # /api/members/*
│   │   ├── planRoutes.js        # /api/plans/*
│   │   └── ...
│   ├── utils/
│   │   ├── helpers.js           # Helper functions
│   │   └── constants.js         # Constants
│   ├── database/
│   │   ├── migrate.js           # Database migration script
│   │   ├── seed.js              # Seed data script
│   │   └── schema.sql           # Database schema
│   └── server.js                # Application entry point
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## 🔌 API Endpoints

### Authentication
```
POST   /api/auth/register        - Register new member
POST   /api/auth/login           - Login user
POST   /api/auth/refresh         - Refresh access token
POST   /api/auth/logout          - Logout user
POST   /api/auth/forgot-password - Request password reset
POST   /api/auth/reset-password  - Reset password
```

### Members
```
GET    /api/members              - Get all members (Admin/Manager)
GET    /api/members/:id          - Get member by ID
GET    /api/members/me           - Get current member profile
PUT    /api/members/me           - Update current member profile
PUT    /api/members/:id          - Update member (Admin)
DELETE /api/members/:id          - Delete member (Admin)
GET    /api/members/:id/subscription - Get member subscription
GET    /api/members/:id/attendance   - Get member attendance history
```

### Membership Plans
```
GET    /api/plans                - Get all active plans
GET    /api/plans/:id            - Get plan by ID
POST   /api/plans                - Create plan (Admin)
PUT    /api/plans/:id            - Update plan (Admin)
DELETE /api/plans/:id            - Delete plan (Admin)
```

### Subscriptions
```
GET    /api/subscriptions        - Get all subscriptions (Admin)
GET    /api/subscriptions/:id    - Get subscription by ID
POST   /api/subscriptions        - Create subscription
PUT    /api/subscriptions/:id    - Update subscription
DELETE /api/subscriptions/:id    - Cancel subscription
```

### Attendance
```
POST   /api/attendance/check-in  - Check-in member
POST   /api/attendance/check-out - Check-out member
GET    /api/attendance           - Get attendance records
GET    /api/attendance/today     - Get today's attendance
GET    /api/attendance/member/:id - Get member attendance
```

### Payments
```
GET    /api/payments             - Get all payments (Admin)
GET    /api/payments/:id         - Get payment by ID
GET    /api/payments/member/:id  - Get member payments
POST   /api/payments             - Process payment
```

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication.

### Registration Flow:
1. User registers with email, password, full name
2. Password is hashed with bcrypt (12 salt rounds)
3. User record is created in database
4. JWT tokens (access + refresh) are generated
5. Tokens are returned to client

### Login Flow:
1. User provides email and password
2. System validates credentials
3. If valid, JWT tokens are generated
4. Tokens are returned to client

### Protected Routes:
Include the access token in the Authorization header:
```
Authorization: Bearer <your_access_token>
```

## 📦 Database Schema

See `src/database/schema.sql` for the complete database schema.

Key tables:
- `users` - All user accounts (members, trainers, managers, admins)
- `membership_plans` - Membership tier configurations
- `subscriptions` - User subscription instances
- `payments` - Payment transaction records
- `attendance` - Check-in/check-out records

## 🧪 Testing

### Test Users (after seeding):
```javascript
// Admin
Email: admin@ironforge.com
Password: password123

// Member
Email: john@ironforge.com
Password: password123

// Coach
Email: coach@ironforge.com
Password: password123

// Manager
Email: manager@ironforge.com
Password: password123
```

### Example API Calls:

**Register:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newmember@example.com",
    "password": "securePass123",
    "fullName": "John Doe"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@ironforge.com",
    "password": "password123"
  }'
```

**Get Current Member Profile:**
```bash
curl http://localhost:5000/api/members/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 🛡️ Security Features

- **Password Hashing**: bcrypt with 12 salt rounds
- **JWT Authentication**: Access + Refresh token strategy
- **Rate Limiting**: Prevents brute force attacks
- **Input Validation**: express-validator for all inputs
- **SQL Injection Prevention**: Parameterized queries
- **CORS**: Configured for frontend origin
- **Helmet**: Security headers
- **Environment Variables**: Sensitive data in .env

## 🚀 Deployment

### Environment Variables for Production:
```bash
NODE_ENV=production
PORT=5000
DATABASE_URL=your_production_db_url
JWT_SECRET=your_very_secure_secret
CORS_ORIGIN=https://your-frontend-domain.com
```

### Production Checklist:
- [ ] Update JWT_SECRET to strong random value
- [ ] Update database credentials
- [ ] Enable SSL for PostgreSQL
- [ ] Set CORS_ORIGIN to production frontend URL
- [ ] Enable HTTPS
- [ ] Configure reverse proxy (nginx)
- [ ] Set up database backups
- [ ] Configure monitoring and logging
- [ ] Set appropriate rate limits

## 📝 License

ISC

## 🤝 Contributing

This is a private project for IronForge Gym Management System.

## 📧 Support

For support, contact the development team.
