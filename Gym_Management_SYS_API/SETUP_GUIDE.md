# IronForge Gym Management API - Complete Setup Guide

This guide will walk you through setting up the backend API from scratch.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **PostgreSQL** (v14 or higher) - [Download](https://www.postgresql.org/download/)
- **npm** (comes with Node.js)
- **Git** (optional) - [Download](https://git-scm.com/)

## Step-by-Step Setup

### 1. Install Dependencies

Open your terminal in the project directory and run:

```bash
npm install
```

This will install all required packages:
- express
- pg (PostgreSQL client)
- bcrypt (password hashing)
- jsonwebtoken (JWT authentication)
- dotenv (environment variables)
- cors (Cross-Origin Resource Sharing)
- express-validator (input validation)
- morgan (logging)
- helmet (security)
- express-rate-limit (rate limiting)

### 2. Setup PostgreSQL Database

#### Option A: Using Command Line

```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE ironforge_gym;

# Exit psql
\q
```

#### Option B: Using pgAdmin

1. Open pgAdmin
2. Right-click on "Databases"
3. Select "Create" > "Database"
4. Name it: `ironforge_gym`
5. Click "Save"

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ironforge_gym
DB_USER=postgres
DB_PASSWORD=your_postgres_password_here

# JWT Configuration
JWT_SECRET=your_very_long_random_secret_key_change_this_in_production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your_refresh_token_secret_key
JWT_REFRESH_EXPIRES_IN=30d

# CORS Configuration
CORS_ORIGIN=http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Important:** Replace `your_postgres_password_here` with your actual PostgreSQL password!

### 4. Run Database Migration

Create all tables with:

```bash
npm run migrate
```

You should see:
```
🚀 Starting database migration...
✅ Database migration completed successfully!
📊 All tables created with indexes and triggers
```

### 5. Seed Database with Sample Data

Add test users and data:

```bash
npm run seed
```

You should see:
```
🌱 Starting database seeding...
📦 Creating membership plans...
✅ Created 3 membership plans
👥 Creating users...
✅ Created 5 users
📝 Creating subscriptions...
✅ Created 2 subscriptions
💳 Creating sample payments...
✅ Created 2 payments
📊 Creating attendance records...
✅ Created 10 attendance records
🎉 Database seeding completed successfully!

📋 Test Credentials:
   Admin:   admin@ironforge.com / password123
   Manager: manager@ironforge.com / password123
   Coach:   coach@ironforge.com / password123
   Member:  john@ironforge.com / password123
   Member:  emma@ironforge.com / password123
```

### 6. Start the Development Server

```bash
npm run dev
```

You should see:
```
🚀 Server running on port 5000
📝 Environment: development
🔗 API: http://localhost:5000
🏥 Health: http://localhost:5000/health
✅ Database connected
```

### 7. Test the API

#### Option A: Using curl

```bash
# Health check
curl http://localhost:5000/health

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@ironforge.com","password":"password123"}'

# Register new member
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"newuser@example.com",
    "password":"securePass123",
    "fullName":"New User",
    "phone":"+1234567899"
  }'
```

#### Option B: Using Postman

1. Import the collection (if provided) or create new requests
2. Test the endpoints listed in the API Documentation

#### Option C: Using VS Code REST Client

Install the REST Client extension and create a `.http` file:

```http
### Health Check
GET http://localhost:5000/health

### Register
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "password123",
  "fullName": "Test User",
  "phone": "+1234567899"
}

### Login
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "john@ironforge.com",
  "password": "password123"
}

### Get all membership plans
GET http://localhost:5000/api/plans
```

## Common Issues & Solutions

### Issue: "Connection refused" error

**Solution:**
- Ensure PostgreSQL is running
- Check if the port 5432 is correct
- Verify database credentials in `.env`

```bash
# Check if PostgreSQL is running (Windows)
Get-Service postgresql*

# Start PostgreSQL service (Windows)
Start-Service postgresql-x64-14
```

### Issue: "Password authentication failed"

**Solution:**
- Double-check your PostgreSQL password in `.env`
- Ensure the user has access to the database

```sql
-- Grant privileges (run in psql)
GRANT ALL PRIVILEGES ON DATABASE ironforge_gym TO postgres;
```

### Issue: "Port 5000 already in use"

**Solution:**
- Change the PORT in `.env` to 5001 or another available port
- Or kill the process using port 5000

```bash
# Windows: Find and kill process on port 5000
netstat -ano | findstr :5000
taskkill /PID <process_id> /F
```

### Issue: "Cannot find module" errors

**Solution:**
- Delete `node_modules` and reinstall:

```bash
Remove-Item -Recurse -Force node_modules
npm install
```

### Issue: Migration fails

**Solution:**
- Drop and recreate the database:

```sql
-- Run in psql
DROP DATABASE IF EXISTS ironforge_gym;
CREATE DATABASE ironforge_gym;
```

Then run migration again:
```bash
npm run migrate
```

## Project Structure Overview

```
Gym_Management_SYS_API/
├── src/
│   ├── config/
│   │   └── database.js          # Database configuration
│   ├── controllers/             # Business logic
│   │   ├── authController.js
│   │   ├── memberController.js
│   │   ├── planController.js
│   │   ├── subscriptionController.js
│   │   ├── attendanceController.js
│   │   └── paymentController.js
│   ├── middleware/              # Custom middleware
│   │   ├── authMiddleware.js    # JWT verification
│   │   ├── errorHandler.js      # Error handling
│   │   ├── validators.js        # Input validation
│   │   └── rateLimiter.js       # Rate limiting
│   ├── routes/                  # API routes
│   │   ├── authRoutes.js
│   │   ├── memberRoutes.js
│   │   ├── planRoutes.js
│   │   ├── subscriptionRoutes.js
│   │   ├── attendanceRoutes.js
│   │   └── paymentRoutes.js
│   ├── database/                # Database scripts
│   │   ├── schema.sql           # Database schema
│   │   ├── migrate.js           # Migration script
│   │   └── seed.js              # Seed data script
│   └── server.js                # Application entry point
├── .env                         # Environment variables
├── .env.example                 # Environment template
├── .gitignore                   # Git ignore rules
├── package.json                 # Dependencies & scripts
└── README.md                    # Project documentation
```

## Database Tables

The migration creates the following tables:

1. **users** - All user accounts (members, trainers, managers, admins)
2. **membership_plans** - Membership tier configurations
3. **subscriptions** - User subscription instances
4. **payments** - Payment transaction records
5. **attendance** - Check-in/check-out records
6. **classes** - Group fitness classes
7. **class_schedules** - Scheduled class instances
8. **class_bookings** - Member class reservations
9. **notifications** - System notifications
10. **audit_logs** - System activity audit trail

## Next Steps

### Connecting Frontend to Backend

Update your React frontend to use the API:

```javascript
// In your frontend .env file
VITE_API_URL=http://localhost:5000
```

Replace localStorage calls in `authService.js`:

```javascript
// Old (localStorage)
export async function loginUser({ email, password }) {
  const users = readFromStorage(STORAGE_KEYS.USERS);
  // ...
}

// New (API)
export async function loginUser({ email, password }) {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error);
  }
  
  // Store token
  localStorage.setItem('accessToken', data.data.accessToken);
  localStorage.setItem('refreshToken', data.data.refreshToken);
  
  return data.data.user;
}
```

### Development Workflow

1. **Make changes to code**
2. **Server auto-restarts** (nodemon watches for changes)
3. **Test changes** using Postman/curl
4. **Commit changes** to Git

### Production Deployment

Before deploying to production:

1. **Update environment variables**
   - Set `NODE_ENV=production`
   - Use strong JWT secrets
   - Update CORS_ORIGIN to your frontend domain
   - Enable database SSL

2. **Security checklist**
   - Change all default passwords
   - Enable HTTPS
   - Set up database backups
   - Configure monitoring
   - Review rate limits

3. **Deploy to hosting platform**
   - Heroku
   - AWS (EC2, ECS, Lambda)
   - DigitalOcean
   - Render
   - Railway

## Useful Commands

```bash
# Development
npm run dev          # Start dev server with auto-reload

# Production
npm start            # Start production server

# Database
npm run migrate      # Run database migrations
npm run seed         # Seed database with sample data

# Package management
npm install          # Install dependencies
npm update           # Update dependencies
npm audit            # Check for vulnerabilities
npm audit fix        # Fix vulnerabilities
```

## API Documentation

Base URL: `http://localhost:5000/api`

### Authentication Endpoints

```
POST   /api/auth/register        - Register new member
POST   /api/auth/login           - Login user
POST   /api/auth/refresh         - Refresh access token
POST   /api/auth/logout          - Logout user
GET    /api/auth/me              - Get current user
```

### Member Endpoints

```
GET    /api/members              - Get all members (Admin/Manager)
GET    /api/members/me           - Get current member profile
PUT    /api/members/me           - Update current member profile
GET    /api/members/:id          - Get member by ID
PUT    /api/members/:id          - Update member (Admin)
DELETE /api/members/:id          - Delete member (Admin)
GET    /api/members/:id/subscription - Get member subscription
GET    /api/members/:id/attendance   - Get member attendance
```

See API_DOCUMENTATION.md for complete API reference.

## Support

For issues or questions:
1. Check this guide
2. Review error logs in terminal
3. Check database connection
4. Verify environment variables
5. Review API documentation

## License

ISC
