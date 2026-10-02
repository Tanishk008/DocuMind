import mongoose, { Schema } from "mongoose"

// ─── 1. USER AUTH SCHEMA (documind_auth database) ───
export const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    phone: {
      type: String,
      default: "",
    },
    address: {
      type: String,
      default: "",
    },
    totalQueries: {
      type: Number,
      default: 0,
    },
    currentStep: {
      type: Number,
      default: 1,
    },
    storageUsed: {
      type: Number,
      default: 0, // bytes
    },
  },
  {
    timestamps: true,
  }
)

// ─── 2. USER DOCUMENTS SCHEMA (documind_data database) ───
export const UserDocumentSchema = new Schema(
  {
    userEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    id: { type: String, required: true },
    name: { type: String, required: true },
    size: { type: Number, default: 0 },
    type: { type: String, default: "" },
    url: { type: String, default: "" },
    content: { type: String, default: "" },
    summary: { type: String, default: "" },
    documentType: { type: String, default: "General" }, // Legal, Medical, Academic, Financial, Technical, General
    tags: { type: [String], default: [] },
    uploadedAt: { type: Date, default: Date.now },
    nodes: { type: Array, default: [] },
    edges: { type: Array, default: [] },
  },
  {
    timestamps: true,
  }
)

// ─── 3. USER QUESTION SCHEMA (documind_data database) ───
export const UserQuestionSchema = new Schema(
  {
    userEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    id: { type: String, required: true },
    text: { type: String, required: true },
    answer: { type: String, default: "" },
    citation: { type: String, default: "" },
    confidence: { type: Number, default: 95 },
    sources: { type: [String], default: [] },
    documentName: { type: String, default: "" },
    foundInDocument: { type: Boolean, default: true },
    timestamp: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
)

// ─── 4. SHARE LINK SCHEMA (documind_data database) ───
export const ShareLinkSchema = new Schema(
  {
    shareId: { type: String, required: true, unique: true, index: true },
    userEmail: { type: String, required: true, lowercase: true, trim: true },
    documentNames: { type: [String], default: [] },
    answers: { type: Array, default: [] }, // Full AnalysisResult[] array
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 7 days
  },
  { timestamps: true }
)

// ─── 5. ACTIVITY LOG SCHEMA (documind_data database) ───
export const ActivityLogSchema = new Schema(
  {
    userEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    action: { type: String, required: true }, // LOGIN, SIGNUP, QUERY_ANALYZED, DOCUMENTS_SYNCED, SHARE_CREATED, DOCUMENT_DELETED
    details: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

// Backward compatibility default model exports
if (mongoose.models.User) {
  delete mongoose.models.User
}
export const User = mongoose.model("User", UserSchema)
export const UserDocument = mongoose.models.UserDocument || mongoose.model("UserDocument", UserDocumentSchema)
export const UserQuestion = mongoose.models.UserQuestion || mongoose.model("UserQuestion", UserQuestionSchema)
