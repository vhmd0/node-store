import { execSync } from 'child_process';

/**
 * Checks if PostgreSQL is available by attempting to connect
 */
async function checkPostgresConnection(databaseUrl: string): Promise<boolean> {
  if (!databaseUrl.includes('postgresql://')) {
    return false;
  }

  try {
    // Try to ping the PostgreSQL database using psql command
    const url = new URL(databaseUrl);
    const host = url.hostname;
    const port = url.port || '5432';
    const dbName = url.pathname.split('/')[1];
    const username = url.username;
    const password = url.password;

    // Set the PGPASSWORD environment variable for the connection
    const env = { ...process.env, PGPASSWORD: password };
    
    // Test connection using pg_isready or a simple psql command
    try {
      execSync(`pg_isready -h ${host} -p ${port} -U ${username} -d ${dbName}`, { 
        env,
        stdio: 'pipe' 
      });
      return true;
    } catch {
      // If pg_isready is not available, try a simple psql command
      try {
        execSync(`psql "${databaseUrl}" -c "SELECT 1"`, { 
          env,
          stdio: 'pipe' 
        });
        return true;
      } catch {
        return false;
      }
    }
  } catch (error) {
    console.warn('Could not validate PostgreSQL connection:', (error as Error).message);
    return false;
  }
}

/**
 * Gets the appropriate database URL with fallback to SQLite
 */
export async function getDatabaseUrl(): Promise<string> {
  const envDatabaseUrl = process.env.DATABASE_URL;
  
  if (!envDatabaseUrl) {
    console.log('DATABASE_URL not set, falling back to SQLite');
    return 'file:./dev.db'; // Default SQLite file
  }

  // Check if it's a PostgreSQL URL
  if (envDatabaseUrl.includes('postgresql://') || envDatabaseUrl.includes('postgres://')) {
    const isPostgresAvailable = await checkPostgresConnection(envDatabaseUrl);
    
    if (isPostgresAvailable) {
      console.log('PostgreSQL connection successful');
      return envDatabaseUrl;
    } else {
      console.log('PostgreSQL connection failed, falling back to SQLite');
      return 'file:./fallback.db'; // Fallback SQLite file
    }
  }
  
  // If it's already SQLite or another database type, return as-is
  return envDatabaseUrl;
}

/**
 * Updates the DATABASE_URL in the environment for Prisma
 */
export async function setupDatabaseFallback(): Promise<void> {
  const databaseUrl = await getDatabaseUrl();
  process.env.DATABASE_URL = databaseUrl;
}