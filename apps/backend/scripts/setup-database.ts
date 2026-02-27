import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

async function setupDatabase() {
  console.log("🔧 Setting up database...");

  const isPostgreSQL = connectionString.includes("postgresql://") || connectionString.includes("postgres://");
  const isSQLite = connectionString.startsWith("file:");

  if (isPostgreSQL) {
    console.log("📡 Using PostgreSQL database");
    const { Pool } = await import("pg");

    const pool = new Pool({ connectionString });

    try {
      await pool.query("SELECT 1");
      console.log("✅ Database connection successful");
    } catch (error) {
      console.warn("⚠️ Database connection failed (this is OK if you're just building):", (error as Error).message);
    } finally {
      await pool.end();
    }
  } else if (isSQLite) {
    console.log("📁 Using SQLite database");
    const fs = await import("fs");
    const dbPath = connectionString.replace("file:", "");

    if (!fs.existsSync(dbPath)) {
      console.log("📦 SQLite database file will be created on first use");
    } else {
      console.log("✅ SQLite database file found");
    }
  } else {
    throw new Error(`Unsupported database type: ${connectionString}`);
  }

  console.log("✅ Database setup complete");
}

setupDatabase()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Database setup failed:", error);
    process.exit(1);
  });
