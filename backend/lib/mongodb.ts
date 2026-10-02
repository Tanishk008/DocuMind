import mongoose, { Connection } from "mongoose"
import { UserSchema, UserDocumentSchema, UserQuestionSchema, ShareLinkSchema, ActivityLogSchema } from "../models/User"

const MONGO_URI = process.env.MONGO_URI

if (!MONGO_URI) {
  throw new Error("Please define the MONGO_URI environment variable inside .env.local")
}

// Helper to swap database name in MONGO_URI
export function getDbUri(dbName: string): string {
  if (!MONGO_URI) return ""
  const [base, query] = MONGO_URI.split('?')
  const lastSlashIndex = base.lastIndexOf('/')
  if (lastSlashIndex !== -1 && lastSlashIndex > 10) {
    const hostBase = base.substring(0, lastSlashIndex)
    return `${hostBase}/${dbName}${query ? `?${query}` : ''}`
  }
  return MONGO_URI
}

const AUTH_URI = getDbUri("documind_auth")
const DATA_URI = getDbUri("documind_data")

interface CachedConnections {
  authConn: Connection | null
  dataConn: Connection | null
}

let cached: CachedConnections = (global as any).mongooseConnections

if (!cached) {
  cached = (global as any).mongooseConnections = { authConn: null, dataConn: null }
}

export async function connectToAuthDatabase(): Promise<Connection> {
  if (cached.authConn) return cached.authConn

  console.log("[DB] Connecting to Auth Database (documind_auth)...")
  const conn = await mongoose.createConnection(AUTH_URI).asPromise()
  
  // Register Auth model
  conn.model("User", UserSchema)
  
  // Pre-create collections so they show up immediately in MongoDB Compass/Atlas
  conn.createCollection("users").catch(() => {})
  
  cached.authConn = conn
  
  console.log("[DB] ✅ Connected to Auth Database")
  return conn
}

export async function connectToDataDatabase(): Promise<Connection> {
  if (cached.dataConn) return cached.dataConn

  console.log("[DB] Connecting to Content/Data Database (documind_data)...")
  const conn = await mongoose.createConnection(DATA_URI).asPromise()
  
  // Register Data models
  conn.model("UserDocument", UserDocumentSchema)
  conn.model("UserQuestion", UserQuestionSchema)
  conn.model("ShareLink", ShareLinkSchema)
  conn.model("ActivityLog", ActivityLogSchema)
  
  // Pre-create collections so they show up immediately in MongoDB Compass/Atlas
  conn.createCollection("userdocuments").catch(() => {})
  conn.createCollection("userquestions").catch(() => {})
  conn.createCollection("sharelinks").catch(() => {})
  conn.createCollection("activitylogs").catch(() => {})
  
  cached.dataConn = conn
  
  console.log("[DB] ✅ Connected to Content/Data Database")
  return conn
}

// Legacy fallback helper for single connection compatibility
export async function connectToDatabase() {
  const authConn = await connectToAuthDatabase()
  return authConn
}
