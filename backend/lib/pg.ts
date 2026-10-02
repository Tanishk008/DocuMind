import { Pool } from "pg"

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Define it in backend/.env.local for local development, or in your host's environment settings when deployed."
  )
}

// Supabase's direct-connection host is IPv6-only; if that's unreachable from this
// environment, DATABASE_URL should point at the IPv4-compatible connection pooler instead
// (Project Settings -> Database -> Connection String -> Transaction pooler).
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
})

pool.on("error", (err) => {
  console.error("[PG] Unexpected idle client error:", err.message)
})

export default pool
