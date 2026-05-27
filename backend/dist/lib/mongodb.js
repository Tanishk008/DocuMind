"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDbUri = getDbUri;
exports.connectToAuthDatabase = connectToAuthDatabase;
exports.connectToDataDatabase = connectToDataDatabase;
exports.connectToDatabase = connectToDatabase;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    throw new Error("Please define the MONGO_URI environment variable inside .env.local");
}
// Helper to swap database name in MONGO_URI
function getDbUri(dbName) {
    if (!MONGO_URI)
        return "";
    const [base, query] = MONGO_URI.split('?');
    const lastSlashIndex = base.lastIndexOf('/');
    if (lastSlashIndex !== -1 && lastSlashIndex > 10) {
        const hostBase = base.substring(0, lastSlashIndex);
        return `${hostBase}/${dbName}${query ? `?${query}` : ''}`;
    }
    return MONGO_URI;
}
const AUTH_URI = getDbUri("documind_auth");
const DATA_URI = getDbUri("documind_data");
let cached = global.mongooseConnections;
if (!cached) {
    cached = global.mongooseConnections = { authConn: null, dataConn: null };
}
async function connectToAuthDatabase() {
    if (cached.authConn)
        return cached.authConn;
    console.log("[DB] Connecting to Auth Database (documind_auth)...");
    const conn = await mongoose_1.default.createConnection(AUTH_URI).asPromise();
    // Register Auth model
    conn.model("User", User_1.UserSchema);
    // Pre-create collections so they show up immediately in MongoDB Compass/Atlas
    conn.createCollection("users").catch(() => { });
    cached.authConn = conn;
    console.log("[DB] ✅ Connected to Auth Database");
    return conn;
}
async function connectToDataDatabase() {
    if (cached.dataConn)
        return cached.dataConn;
    console.log("[DB] Connecting to Content/Data Database (documind_data)...");
    const conn = await mongoose_1.default.createConnection(DATA_URI).asPromise();
    // Register Data models
    conn.model("UserDocument", User_1.UserDocumentSchema);
    conn.model("UserQuestion", User_1.UserQuestionSchema);
    conn.model("ShareLink", User_1.ShareLinkSchema);
    conn.model("ActivityLog", User_1.ActivityLogSchema);
    // Pre-create collections so they show up immediately in MongoDB Compass/Atlas
    conn.createCollection("userdocuments").catch(() => { });
    conn.createCollection("userquestions").catch(() => { });
    conn.createCollection("sharelinks").catch(() => { });
    conn.createCollection("activitylogs").catch(() => { });
    cached.dataConn = conn;
    console.log("[DB] ✅ Connected to Content/Data Database");
    return conn;
}
// Legacy fallback helper for single connection compatibility
async function connectToDatabase() {
    const authConn = await connectToAuthDatabase();
    return authConn;
}
