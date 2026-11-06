# ⚡ Quick Start Guide - IronForge Gym API

Get your backend running in 5 minutes!

## 🚀 Fast Track Setup

### 1. Install Dependencies (2 minutes)

```bash
cd Gym_Management_SYS_API
npm install
```

### 2. Setup Database (1 minute)

Open PostgreSQL and create the database:

```sql
CREATE DATABASE ironforge_gym;
```

Or use command line:
```bash
psql -U postgres -c "CREATE DATABASE ironforge_gym;"
```

### 3. Configure Environment (30 seconds)

The `.env` file is already created! Just update your PostgreSQL password:

```env
DB_PASSWORD=your_postgres_password
```

### 4. Run Migrations & Seed (1 minute)

```bash
npm run migrate
npm run seed
```

### 5. Start Server (30 seconds)

```bash
npm run dev
```

You should see:
```
🚀 Server running on port 5000
✅ Database connected
```

## ✅ Verify It's Working

### Test 1: Health Check

Open browser: `http://localhost:5000/health`

You should see:
```json
{
  "status": "ok",
  "timestamp": "2024-11-04T...",
  "environment": "development"
}
```

### Test 2: Login

Using curl:
```bash
curl -X POST http://localhost:5000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"john@ironforge.com\",\"password\":\"password123\"}"
```

Or open `test-api.http` in VS Code (with REST Client extension) and click "Send Request"

## 🎯 Test Credentials

Use these accounts to test:

```
Role: Admin
Email: admin@ironforge.com
Password: password123

Role: Member  
Email: john@ironforge.com
Password: password123

Role: Coach
Email: coach@ironforge.com
Password: password123

Role: Manager
Email: manager@ironforge.com
Password: password123
```

## 📝 Quick API Examples

### Register New Member

```bash
curl -X POST http://localhost:5000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"newuser@example.com\",\"password\":\"password123\",\"fullName\":\"New User\"}"
```

### Get Membership Plans

```bash
curl http://localhost:5000/api/plans
```

### Login and Get Token

```bash
# 1. Login
curl -X POST http://localhost:5000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"john@ironforge.com\",\"password\":\"password123\"}"

# Copy the accessToken from response

# 2. Use token to get profile
curl http://localhost:5000/api/members/me ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 🔧 Troubleshooting

### Can't connect to database?

1. Check if PostgreSQL is running:
   ```bash
   Get-Service postgresql*
   ```

2. Start PostgreSQL if needed:
   ```bash
   Start-Service postgresql-x64-14
   ```

3. Verify credentials in `.env`

### Port 5000 already in use?

Change PORT in `.env`:
```env
PORT=5001
```

### Migration fails?

Drop and recreate database:
```sql
DROP DATABASE IF EXISTS ironforge_gym;
CREATE DATABASE ironforge_gym;
```

Then run migration again:
```bash
npm run migrate
```

## 📚 What's Next?

1. **Explore API** - Open `test-api.http` and try all endpoints
2. **Read Docs** - Check `API_DOCUMENTATION.md` for complete reference
3. **Connect Frontend** - Update your React app to use the API
4. **Customize** - Add new features based on your needs

## 🎨 Project Structure

```
src/
├── controllers/     # Business logic
├── routes/          # API endpoints
├── middleware/      # Auth, validation, errors
├── database/        # Schema & migrations
├── config/          # Database config
└── server.js        # Entry point
```

## 🔐 Authentication Flow

```
1. User registers → Gets JWT token
2. User logs in → Gets JWT token
3. Include token in requests:
   Authorization: Bearer <token>
4. Protected routes verify token
```

## 📊 Available Endpoints

### Public
- `POST /api/auth/register` - Register
- `POST /api/auth/login` - Login
- `GET /api/plans` - Get plans

### Protected (Requires Token)
- `GET /api/auth/me` - Current user
- `GET /api/members/me` - My profile
- `PUT /api/members/me` - Update profile
- `POST /api/attendance/check-in` - Check in
- `GET /api/attendance/member/:id` - Attendance history

### Admin Only
- `GET /api/members` - All members
- `POST /api/plans` - Create plan
- `DELETE /api/members/:id` - Delete member

## 🎓 Learning Resources

- Express.js: https://expressjs.com/
- PostgreSQL: https://www.postgresql.org/docs/
- JWT: https://jwt.io/introduction
- bcrypt: https://github.com/kelektiv/node.bcrypt.js

## 💡 Pro Tips

1. **Use REST Client Extension** - Test APIs directly in VS Code
2. **Check Terminal Logs** - All requests are logged
3. **Use Postman** - Import endpoints for testing
4. **Read Error Messages** - They're descriptive!
5. **Check Database** - Use pgAdmin to view data

## 🚦 Next Steps

### Connect to Frontend

In your React app, replace localStorage with API calls:

```javascript
// frontend/src/config/api.js
const API_URL = 'http://localhost:5000/api';

export async function login(email, password) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  
  if (!data.success) throw new Error(data.error);
  
  // Store token
  localStorage.setItem('token', data.data.accessToken);
  
  return data.data.user;
}
```

### Add CORS for Frontend

Already configured! Just make sure your frontend runs on `http://localhost:5173`

If different port, update `.env`:
```env
CORS_ORIGIN=http://localhost:YOUR_FRONTEND_PORT
```

## 📞 Need Help?

1. Check `SETUP_GUIDE.md` for detailed instructions
2. Review error logs in terminal
3. Verify database connection
4. Check `.env` configuration

---

**You're all set!** 🎉

Start building amazing features for IronForge Gym! 💪
