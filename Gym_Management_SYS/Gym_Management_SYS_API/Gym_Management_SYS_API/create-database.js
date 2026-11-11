import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function createDatabase() {
  // Connect to postgres database to create our target database
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres', // Connect to default postgres database
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    const dbName = process.env.DB_NAME || 'gym_management';

    // Check if database exists
    const checkResult = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (checkResult.rows.length > 0) {
      console.log(`📦 Database "${dbName}" already exists`);
    } else {
      // Create the database
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database "${dbName}" created successfully!`);
    }

    console.log('\n🎯 Next steps:');
    console.log('   1. Run: npm run migrate');
    console.log('   2. Run: npm run seed (optional)');
    console.log('   3. Run: npm run dev\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 PostgreSQL server is not running or not accessible');
      console.log('   • Make sure PostgreSQL is installed and running');
      console.log('   • Check your .env file for correct credentials\n');
    } else if (error.code === '28P01') {
      console.log('\n💡 Authentication failed');
      console.log('   • Check DB_PASSWORD in your .env file');
      console.log('   • Current password:', process.env.DB_PASSWORD || '(not set)');
      console.log('   • Current user:', process.env.DB_USER || 'postgres', '\n');
    }
    
    throw error;
  } finally {
    await client.end();
  }
}

createDatabase().catch(() => process.exit(1));
