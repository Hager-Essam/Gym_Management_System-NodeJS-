
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { query, transaction } from '../../config/database.js';
import { AppError, asyncHandler } from '../../middleware/errorHandler.js';

// ============================================================
// JWT CONFIGURATION
// ============================================================

const JWT_ALGORITHM = 'HS256';

const getJwtSecret = (secretName) => {
  const secret = process.env[secretName];

  if (!secret) {
    throw new Error(`${secretName} is not configured`);
  }

  return secret;
};

// Generate Access Token
const generateAccessToken = (userId) => {
  return jwt.sign(
    {
      id: userId,
      type: 'access',
    },
    getJwtSecret('JWT_SECRET'),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      algorithm: JWT_ALGORITHM,
    }
  );
};

// Generate Refresh Token
const generateRefreshToken = (userId) => {
  return jwt.sign(
    {
      id: userId,
      type: 'refresh',
    },
    getJwtSecret('JWT_REFRESH_SECRET'),
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      algorithm: JWT_ALGORITHM,
    }
  );
};

// ============================================================
// REGISTER
// POST /api/auth/register
// Public
// ============================================================

export const register = asyncHandler(async (req, res) => {
  const { email, password, fullName, phone, planId } = req.body;

  const normalizedEmail = email.toLowerCase().trim();

  // Hash password before opening the transaction.
  const passwordHash = await bcrypt.hash(password, 12);

  // Allowed membership duration units.
  // These SQL fragments are fixed server-side values,
  // never values supplied directly by the client.

  const durationIntervals = {
    day: '1 day',
    week: '1 week',
    month: '1 month',
    year: '1 year',
  };

  const result = await transaction(async (client) => {

    // Check whether the email already exists.
    const existingUser = await client.query(
      `SELECT id
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND deleted_at IS NULL`,
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      throw new AppError(
        'A user with this email already exists',
        409
      );
    }

    // Validate selected plan, if provided.
    let selectedPlan = null;

    if (planId) {
      const planResult = await client.query(
        `SELECT id, price, duration_value, duration_unit
         FROM membership_plans
         WHERE id = $1
           AND is_active = TRUE
           AND is_visible = TRUE
           AND deleted_at IS NULL`,
        [planId]
      );

      if (planResult.rows.length === 0) {
        throw new AppError(
          'Selected membership plan is invalid or inactive',
          400
        );
      }

      selectedPlan = planResult.rows[0];

      if (
        !durationIntervals[selectedPlan.duration_unit] ||
        selectedPlan.duration_value <= 0
      ) {
        throw new AppError(
          'Invalid membership plan duration',
          400
        );
      }
    }

    // Create user.
    // Role is always assigned by the backend.

    const userResult = await client.query(
      `INSERT INTO users (
        email,
        password_hash,
        full_name,
        phone,
        role,
        status,
        email_verified
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        email,
        full_name,
        phone,
        role,
        status,
        created_at`,
      [
        normalizedEmail,
        passwordHash,
        fullName,
        phone || null,
        'member',
        'active',
        false,
      ]
    );

    const user = userResult.rows[0];

    // Create member profile.
    await client.query(
      `INSERT INTO member_profiles (user_id)
       VALUES ($1)`,
      [user.id]
    );

    // Create pending subscription if a plan was selected.
    // It will NOT become active before payment verification.

    let subscription = null;

    if (selectedPlan) {
      const interval = durationIntervals[selectedPlan.duration_unit];
      const paymentFrequency = {
        '1 month': 'monthly',
        '3 month': 'quarterly',
        '1 year': 'annually',
      }[`${selectedPlan.duration_value} ${selectedPlan.duration_unit}`];
      if (!interval || !paymentFrequency) {
        throw new AppError('Selected membership plan duration is not supported', 400);
      }

      const subscriptionResult = await client.query(
        `INSERT INTO subscriptions (
          user_id,
          plan_id,
          start_date,
          end_date,
          status,
          amount,
          payment_frequency
        )
        VALUES (
          $1,
          $2,
          CURRENT_DATE,
          CURRENT_DATE + ($3 * INTERVAL '${interval}'),
          $4,
          $5,
          $6
        )
        RETURNING
          id,
          user_id,
          plan_id,
          start_date,
          end_date,
          status,
          amount`,
        [
          user.id,
          selectedPlan.id,
          selectedPlan.duration_value,
          'pending',
          selectedPlan.price,
          paymentFrequency,
        ]
      );

      subscription = subscriptionResult.rows[0];
    }

    return { user, subscription };
  });

  // Generate tokens only after the transaction succeeds.
  const accessToken = generateAccessToken(result.user.id);
  const refreshToken = generateRefreshToken(result.user.id);

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: {
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.full_name,
        phone: result.user.phone,
        role: result.user.role,
        status: result.user.status,
        createdAt: result.user.created_at,
      },
      subscription: result.subscription,
      accessToken,
      refreshToken,
    },
  });
});

// ============================================================
// LOGIN
// POST /api/auth/login
// Public
// ============================================================

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const normalizedEmail = email.toLowerCase().trim();

  const result = await query(
    `SELECT
       id,
       email,
       password_hash,
       full_name,
       phone,
       role,
       status
     FROM users
     WHERE LOWER(email) = LOWER($1)
       AND deleted_at IS NULL`,
    [normalizedEmail]
  );

  const user = result.rows[0];

  // Use a generic error to reduce user enumeration.
  if (!user || user.status !== 'active') {
    throw new AppError('Invalid email or password', 401);
  }

  const isPasswordValid = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401);
  }

  // Update last login.
  await query(
    `UPDATE users
     SET last_login_at = NOW()
     WHERE id = $1`,
    [user.id]
  );

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
      accessToken,
      refreshToken,
    },
  });
});

// ============================================================
// REFRESH ACCESS TOKEN
// POST /api/auth/refresh
// Public
// ============================================================

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError('Refresh token is required', 400);
  }

  let decoded;

  try {
    decoded = jwt.verify(
      refreshToken,
      getJwtSecret('JWT_REFRESH_SECRET'),
      {
        algorithms: [JWT_ALGORITHM],
      }
    );
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError(
        'Invalid or expired refresh token',
        401
      );
    }

    throw error;
  }

  // Ensure this is a refresh token, not an access token.
  if (decoded.type !== 'refresh' || !decoded.id) {
    throw new AppError('Invalid refresh token', 401);
  }

  const result = await query(
    `SELECT id, status
     FROM users
     WHERE id = $1
       AND deleted_at IS NULL`,
    [decoded.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid refresh token', 401);
  }

  const user = result.rows[0];

  if (user.status !== 'active') {
    throw new AppError('User account is not active', 401);
  }

  const accessToken = generateAccessToken(user.id);

  res.json({
    success: true,
    data: {
      accessToken,
    },
  });
});

// ============================================================
// LOGOUT
// POST /api/auth/logout
// Private
// ============================================================

export const logout = asyncHandler(async (req, res) => {
  // Current implementation:
  // The client must remove its stored tokens.
  //
  // This does NOT revoke a copied refresh token on the server.
  // Server-side token revocation requires persistent token storage.

  res.json({
    success: true,
    message: 'Logout successful',
  });
});

// ============================================================
// GET CURRENT USER
// GET /api/auth/me
// Private
// ============================================================

export const getMe = asyncHandler(async (req, res) => {

  // Get user and member profile information.
  const result = await query(
    `SELECT
       u.id,
       u.email,
       u.full_name,
       u.phone,
       u.role,
       u.status,
       u.date_of_birth,
       u.gender,
       u.address,
       u.profile_picture_url,
       u.created_at,
       u.last_login_at,

       mp.emergency_contact_name,
       mp.emergency_contact_phone,
       mp.fitness_goal,
       mp.activity_level

     FROM users u

     LEFT JOIN member_profiles mp
       ON mp.user_id = u.id

     WHERE u.id = $1
       AND u.deleted_at IS NULL`,
    [req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const user = result.rows[0];

  // Get active subscription if the user is a member.
  let subscription = null;

  if (user.role === 'member') {
    const subResult = await query(
      `SELECT
         s.id,
         s.status,
         s.start_date,
         s.end_date,
         s.amount,
         s.currency,
         mp.name AS plan_name,
         mp.access_level

       FROM subscriptions s

       JOIN membership_plans mp
         ON mp.id = s.plan_id

       WHERE s.user_id = $1
         AND s.status = 'active'
         AND s.deleted_at IS NULL

       ORDER BY s.created_at DESC
       LIMIT 1`,
      [user.id]
    );

    if (subResult.rows.length > 0) {
      subscription = subResult.rows[0];
    }
  }

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone,
        role: user.role,
        status: user.status,

        dateOfBirth: user.date_of_birth,
        gender: user.gender,
        address: user.address,
        profilePicture: user.profile_picture_url,

        emergencyContact: {
          name: user.emergency_contact_name,
          phone: user.emergency_contact_phone,
        },

        fitnessGoal: user.fitness_goal,
        activityLevel: user.activity_level,

        createdAt: user.created_at,
        lastLogin: user.last_login_at,
      },

      subscription,
    },
  });
});
