import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function testConnection() {
  try {
    console.log('Testing database connection...');
    console.log('Connection details:', {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD ? '***' : '(empty)',
    });

    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL successfully!');

    const result = await client.query('SELECT NOW()');
    console.log('✅ Query executed successfully!');
    console.log('Server time:', result.rows[0].now);

    client.release();
    await pool.end();

    console.log('\n✅ All tests passed! Database is ready.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testConnection();
