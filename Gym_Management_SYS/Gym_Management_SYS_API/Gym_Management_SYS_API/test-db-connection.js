import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'ironforge_gym',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

console.log('🔍 Testing database connection...\n');
console.log('Configuration:');
console.log(`  Host: ${config.host}`);
console.log(`  Port: ${config.port}`);
console.log(`  Database: ${config.database}`);
console.log(`  User: ${config.user}`);
console.log(`  Password: ${config.password ? '***' + config.password.slice(-3) : '(empty)'}\n`);

const pool = new Pool(config);

async function testConnection() {
  try {
    console.log('⏳ Attempting to connect...\n');
    
    const client = await pool.connect();
    console.log('✅ Connection successful!\n');
    
    const result = await client.query('SELECT NOW()');
    console.log('✅ Query test passed!');
    console.log(`   Server time: ${result.rows[0].now}\n`);
    
    client.release();
    await pool.end();
    
    console.log('🎉 Database is ready to use!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection failed!\n');
    console.error('Error details:');
    console.error(`  Code: ${error.code}`);
    console.error(`  Message: ${error.message}\n`);
    
    if (error.code === '28P01') {
      console.log('💡 This is a password authentication error.\n');
      console.log('Solutions:');
      console.log('  1. Update DB_PASSWORD in .env file');
      console.log('  2. Check PostgreSQL password');
      console.log('  3. Reset PostgreSQL password\n');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('💡 Cannot connect to PostgreSQL.\n');
      console.log('Solutions:');
      console.log('  1. Make sure PostgreSQL is running');
      console.log('  2. Check DB_HOST and DB_PORT in .env\n');
    } else if (error.code === '3D000') {
      console.log('💡 Database does not exist.\n');
      console.log('Solutions:');
      console.log('  1. Create database: createdb ironforge_gym');
      console.log('  2. Or run: npm run migrate\n');
    }
    
    process.exit(1);
  }
}

testConnection();
