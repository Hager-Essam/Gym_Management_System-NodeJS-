import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler.js';
import { query } from '../config/database.js';

// Protect routes - requires authentication
export const protect = async (req, res, next) => {
  try {
    let token;

    // Get token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      throw new AppError('Not authorized to access this route', 401);
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from database
      const result = await query(
        'SELECT id, email, full_name, role, status FROM users WHERE id = $1 AND deleted_at IS NULL',
        [decoded.id]
      );

      if (result.rows.length === 0) {
        throw new AppError('User no longer exists', 401);
      }

      const user = result.rows[0];

      // Check if user is active
      if (user.status !== 'active') {
        throw new AppError('User account is not active', 401);
      }

      // Attach user to request
      req.user = user;
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        throw new AppError('Invalid token', 401);
      }
      if (error.name === 'TokenExpiredError') {
        throw new AppError('Token expired', 401);
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

// Authorize specific roles
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(`User role '${req.user.role}' is not authorized to access this route`, 403)
      );
    }
    next();
  };
};

// Check if user owns the resource or is admin/manager
export const authorizeOwnerOrAdmin = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const currentUser = req.user;

    // Allow if admin or manager
    if (['admin', 'manager'].includes(currentUser.role)) {
      return next();
    }

    // Allow if user is accessing their own resource
    if (userId === currentUser.id) {
      return next();
    }

    throw new AppError('Not authorized to access this resource', 403);
  } catch (error) {
    next(error);
  }
};
