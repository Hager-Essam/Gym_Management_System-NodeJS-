import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query, transaction } from '../../config/database.js';
import { AppError, asyncHandler } from '../../middleware/errorHandler.js';

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
};

// @desc    Register new member
// @route   POST /api/auth/register
// @access  Public
export const register = asyncHandler(async (req, res, next) => {
  const { email, password, fullName, phone, planId } = req.body;

  // Check if user already exists
  const existingUser = await query(
    'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email.toLowerCase()]
  );

  if (existingUser.rows.length > 0) {
    throw new AppError('A user with this email already exists', 400);
  }

  // Hash password
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  // Create user
  const result = await query(
    `INSERT INTO users (
      email, password_hash, full_name, phone, role, status, email_verified, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING id, email, full_name, phone, role, status, created_at`,
    [email.toLowerCase(), passwordHash, fullName, phone || null, 'member', 'active', false]
  );

  const user = result.rows[0];

  // If planId is provided, create subscription
  if (planId) {
    // Get plan details
    const planResult = await query(
      'SELECT id, price, duration FROM membership_plans WHERE id = $1 AND is_active = true',
      [planId]
    );

    if (planResult.rows.length > 0) {
      const plan = planResult.rows[0];
      
      // Calculate end date based on duration
      let durationQuery;
      switch (plan.duration) {
        case 'monthly':
          durationQuery = "NOW() + INTERVAL '1 month'";
          break;
        case 'quarterly':
          durationQuery = "NOW() + INTERVAL '3 months'";
          break;
        case 'annually':
          durationQuery = "NOW() + INTERVAL '1 year'";
          break;
        default:
          durationQuery = "NOW() + INTERVAL '1 month'";
      }

      // Create subscription
      await query(
        `INSERT INTO subscriptions (
          user_id, plan_id, start_date, end_date, status, payment_method,
          payment_frequency, amount, auto_renew, next_billing_date, created_at
        ) VALUES ($1, $2, NOW(), ${durationQuery}, $3, $4, $5, $6, $7, ${durationQuery}, NOW())`,
        [user.id, plan.id, 'pending', 'card', plan.duration, plan.price, true]
      );
    }
  }

  // Generate tokens
  const accessToken = generateToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone,
        role: user.role,
        status: user.status,
        createdAt: user.created_at,
      },
      accessToken,
      refreshToken,
    },
  });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Get user from database
  const result = await query(
    `SELECT id, email, password_hash, full_name, phone, role, status 
     FROM users 
     WHERE email = $1 AND deleted_at IS NULL`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid email or password', 401);
  }

  const user = result.rows[0];

  // Check if user is active
  if (user.status !== 'active') {
    throw new AppError('Your account has been suspended or deactivated', 401);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401);
  }

  // Update last login
  await query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [user.id]
  );

  // Generate tokens
  const accessToken = generateToken(user.id);
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

// @desc    Refresh access token
// @route   POST /api/auth/refresh
// @access  Public
export const refresh = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError('Refresh token is required', 400);
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Get user
    const result = await query(
      'SELECT id, status FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    const user = result.rows[0];

    if (user.status !== 'active') {
      throw new AppError('User account is not active', 401);
    }

    // Generate new access token
    const accessToken = generateToken(user.id);

    res.json({
      success: true,
      data: {
        accessToken,
      },
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw new AppError('Invalid or expired refresh token', 401);
    }
    throw error;
  }
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
export const logout = asyncHandler(async (req, res, next) => {
  // In a stateless JWT system, logout is handled client-side
  // But we can add the token to a blacklist if needed
  res.json({
    success: true,
    message: 'Logout successful',
  });
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = asyncHandler(async (req, res, next) => {
  const result = await query(
    `SELECT id, email, full_name, phone, role, status, date_of_birth, 
            gender, address, emergency_contact, profile_picture_url, bio, 
            created_at, last_login_at
     FROM users 
     WHERE id = $1 AND deleted_at IS NULL`,
    [req.user.id]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const user = result.rows[0];

  // Get active subscription if member
  let subscription = null;
  if (user.role === 'member') {
    const subResult = await query(
      `SELECT s.id, s.status, s.start_date, s.end_date, s.auto_renew,
              mp.name as plan_name, mp.tier, mp.price
       FROM subscriptions s
       JOIN membership_plans mp ON s.plan_id = mp.id
       WHERE s.user_id = $1 AND s.status = 'active'
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
        emergencyContact: user.emergency_contact,
        profilePicture: user.profile_picture_url,
        bio: user.bio,
        createdAt: user.created_at,
        lastLogin: user.last_login_at,
      },
      subscription,
    },
  });
});
