# Reset PostgreSQL Password Guide

## 🔐 Method 1: Using pgAdmin (Easiest)

If you have pgAdmin installed:

1. **Open pgAdmin**
2. **Right-click on "PostgreSQL 14" (or your version)** → Properties
3. **Go to "Definition" tab**
4. **Set new password:** `admin123` (or your choice)
5. **Save**

Then update `.env`:
```env
DB_PASSWORD=admin123
```

---

## 🔐 Method 2: Using psql Command Line

### Step 1: Edit pg_hba.conf (Temporary Trust Mode)

1. **Find pg_hba.conf file:**
   - Default location: `C:\Program Files\PostgreSQL\14\data\pg_hba.conf`
   - Or: `C:\Program Files\PostgreSQL\15\data\pg_hba.conf`

2. **Open as Administrator** (use Notepad as Admin)

3. **Find this section:**
   ```
   # IPv4 local connections:
   host    all             all             127.0.0.1/32            scram-sha-256
   ```

4. **Change `scram-sha-256` to `trust`:**
   ```
   # IPv4 local connections:
   host    all             all             127.0.0.1/32            trust
   ```

5. **Save the file**

### Step 2: Restart PostgreSQL

**Option A: Using Services**
1. Press `Win + R`
2. Type: `services.msc`
3. Find "postgresql-x64-14" (or your version)
4. Right-click → Restart

**Option B: Using Command Prompt (as Admin)**
```powershell
net stop postgresql-x64-14
net start postgresql-x64-14
```

### Step 3: Connect and Reset Password

1. **Open Command Prompt**

2. **Connect to PostgreSQL:**
   ```bash
   psql -U postgres
   ```
   (No password required because of trust mode)

3. **Reset password:**
   ```sql
   ALTER USER postgres PASSWORD 'admin123';
   ```

4. **Exit:**
   ```sql
   \q
   ```

### Step 4: Restore Security

1. **Open pg_hba.conf again**
2. **Change `trust` back to `scram-sha-256`:**
   ```
   host    all             all             127.0.0.1/32            scram-sha-256
   ```
3. **Save**
4. **Restart PostgreSQL again**

### Step 5: Update .env

```env
DB_PASSWORD=admin123
```

---

## 🔐 Method 3: Create New Database User

Instead of using `postgres` user, create a dedicated user:

1. **Connect to PostgreSQL:**
   ```bash
   psql -U postgres
   ```

2. **Create new user:**
   ```sql
   CREATE USER ironforge WITH PASSWORD 'ironforge123';
   CREATE DATABASE ironforge_gym OWNER ironforge;
   GRANT ALL PRIVILEGES ON DATABASE ironforge_gym TO ironforge;
   \q
   ```

3. **Update `.env`:**
   ```env
   DB_USER=ironforge
   DB_PASSWORD=ironforge123
   ```

---

## ✅ After Setting Password

1. **Update `.env` file**
2. **Test connection:**
   ```bash
   npm run test-db
   ```

3. **If successful, run migrations:**
   ```bash
   npm run migrate
   npm run seed
   ```

4. **Start server:**
   ```bash
   npm run dev
   ```

---

## 🆘 Still Having Issues?

### Check PostgreSQL is Running

```powershell
# Check service status
Get-Service postgresql*

# Start if stopped
Start-Service postgresql-x64-14
```

### Check PostgreSQL Port

```sql
-- In psql:
SHOW port;
```

Should show `5432`

### Test Direct Connection

```bash
psql -h localhost -p 5432 -U postgres -d postgres
```

If this prompts for password and works, use that password in `.env`

---

## 💡 Recommended Password

For development, use something simple:
- `admin123`
- `postgres123`
- `ironforge123`

For production, use strong password!

---

## 📝 Quick Reference

| What | Where | Value |
|------|-------|-------|
| Config File | `C:\Program Files\PostgreSQL\14\data\pg_hba.conf` | |
| Service Name | postgresql-x64-14 | |
| Default Port | 5432 | |
| Default User | postgres | |
| Database Name | ironforge_gym | |

---

## ✅ Success Checklist

- [ ] PostgreSQL is running
- [ ] Password is set
- [ ] `.env` has correct password
- [ ] `npm run test-db` succeeds
- [ ] Database created
- [ ] Migrations run successfully
- [ ] Backend starts without errors
