import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

if (!connectionString.startsWith("file:")) {
  throw new Error(
    "Only SQLite is supported. DATABASE_URL must start with 'file:'"
  );
}

async function setupDatabase() {
  console.log("🔧 Setting up SQLite database...");

  const dbPath = connectionString.replace("file:", "");

  if (!fs.existsSync(dbPath)) {
    console.log("📦 SQLite database file will be created on first use");
  } else {
    console.log("✅ SQLite database file found");
  }

  console.log("✅ Database setup complete");
}

setupDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("💥 Database setup failed:", error);
    process.exit(1);
  });