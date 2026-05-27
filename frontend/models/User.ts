import mongoose, { Schema } from "mongoose"

// Explicit subdocument schemas to prevent Mongoose caching issues
const GraphNodeSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true }, // e.g. "Acme Corp"
    type: { type: String, default: "Concept" }, // e.g. "Person", "Organization"
    description: { type: String, default: "" },
  },
  { _id: false }
)

const GraphEdgeSchema = new Schema(
  {
    source: { type: String, required: true }, // Entity name/ID
    target: { type: String, required: true }, // Entity name/ID
    relation: { type: String, required: true }, // e.g. "DIRECTS", "PARTNERS_WITH"
    description: { type: String, default: "" },
  },
  { _id: false }
)

const DocumentSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    size: { type: Number, default: 0 },
    type: { type: String, default: "" },
    url: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
    nodes: { type: [GraphNodeSchema], default: [] },
    edges: { type: [GraphEdgeSchema], default: [] },
  },
  { _id: false } // Don't auto-generate _id for subdocuments
)

const QuestionSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
)

const UserSchema = new Schema(
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
    documents: {
      type: [DocumentSchema],
      default: [],
    },
    questions: {
      type: [QuestionSchema],
      default: [],
    },
    currentStep: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
)

// Delete cached model to prevent stale schema issues during hot reload
if (mongoose.models.User) {
  delete mongoose.models.User
}

export const User = mongoose.model("User", UserSchema)
