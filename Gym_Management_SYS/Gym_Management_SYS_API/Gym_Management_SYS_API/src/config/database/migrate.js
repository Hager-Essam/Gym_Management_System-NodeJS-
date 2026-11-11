import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting database migration...');
    
    // Read SQL schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    
    // Execute schema
    await client.query(schema);
    
    console.log('✅ Database migration completed successfully!');
    console.log('📊 All tables created with indexes and triggers');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrate().catch((error) => {
  console.error('Migration error:', error);
  process.exit(1);
});
