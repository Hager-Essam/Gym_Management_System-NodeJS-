import pg from 'pg';

const { Pool } = pg;

const commonPasswords = ['admin123', 'postgres', '1234', '12345678', 'root', 'admin', '', 'password'];

async function testPassword(password) {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'postgres', // Try connecting to default database first
    user: 'postgres',
    password: password,
  });

  try {
    const client = await pool.connect();
    client.release();
    await pool.end();
    return true;
  } catch (error) {
    await pool.end();
    return false;
  }
}

async function findWorkingPassword() {
  console.log('🔍 Testing common PostgreSQL passwords...\n');

  for (const password of commonPasswords) {
    const displayPwd = password === '' ? '(empty)' : password;
    process.stdout.write(`Testing password: "${displayPwd}"... `);

    const works = await testPassword(password);

    if (works) {
      console.log('✅ SUCCESS!\n');
      console.log('=' .repeat(50));
      console.log('✅ Working credentials found:');
      console.log('   Username: postgres');
      console.log(`   Password: ${displayPwd}`);
      console.log('=' .repeat(50));
      console.log('\n📝 Update your .env file:');
      console.log(`   DB_PASSWORD=${password}`);
      return password;
    } else {
      console.log('❌ Failed');
    }
  }

  console.log('\n❌ None of the common passwords worked.');
  console.log('\n📖 Manual reset required:');
  console.log('1. Open PowerShell as Administrator');
  console.log('2. Run: .\\fix-postgres.ps1');
  console.log('3. Or follow steps in RESET_POSTGRES_PASSWORD.md');
  return null;
}

findWorkingPassword();
