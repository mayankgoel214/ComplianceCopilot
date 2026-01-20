import { neon } from '@neondatabase/serverless';

// Database connection string from environment variable or fallback to direct connection
const connectionString = process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_3DzyTLrZ4aUi@ep-royal-voice-adaya6xc-pooler.c-2.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

// Create the Neon SQL client
export const sql = neon(connectionString);

// Database configuration
export const dbConfig = {
  connectionString,
  projectId: 'quiet-bread-03030191',
  database: 'neondb',
  role: 'neondb_owner'
};

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const result = await sql`SELECT 1 as test`;
    return result.length > 0 && result[0].test === 1;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// Helper function to execute queries with error handling
export async function executeQuery<T = any>(
  query: (sql: typeof import('@neondatabase/serverless').neon) => Promise<T>
): Promise<T> {
  try {
    return await query(sql);
  } catch (error) {
    console.error('Database query failed:', error);
    throw error;
  }
}

export default sql;