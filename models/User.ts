import mongoose from "mongoose"

const UserSchema = new mongoose.Schema(
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
    documents: [
      {
        id: String,
        name: String,
        size: Number,
        type: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    questions: [
      {
        id: String,
        text: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    currentStep: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
)

export const User = mongoose.models.User || mongoose.model("User", UserSchema)
