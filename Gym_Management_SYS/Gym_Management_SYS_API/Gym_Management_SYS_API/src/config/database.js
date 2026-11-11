import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Database configuration
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'gym_management_system',
  user: process.env.DB_USER || 'postgres',
  password: String(process.env.DB_PASSWORD || ''),
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
};

// Create connection pool
const pool = new Pool(config);

// Test database connection
pool.on('connect', () => {
  console.log('✅ Database connected');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1); // In production we should use graceful shutdown strategy(because her we can lose some requests)
});

// Query helper function
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
};

// Transaction helper
export const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get a client from the pool
export const getClient = async () => {
  return await pool.connect();
};

export const checkDatabaseConnection = async () => {
  try {
    await query('SELECT 1');
    console.log('✅ Database health check successful');
    return true;
  } catch (error) {
    console.error('❌ Database health check failed');
    throw error;
  }
};
// Close pool
export const closePool = async () => {
  await pool.end();
  console.log('Database pool closed');
};

export default pool;
