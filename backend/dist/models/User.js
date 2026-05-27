"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserQuestion = exports.UserDocument = exports.User = exports.ActivityLogSchema = exports.ShareLinkSchema = exports.UserQuestionSchema = exports.UserDocumentSchema = exports.UserSchema = void 0;
const mongoose_1 = __importStar(require("mongoose"));
// ─── 1. USER AUTH SCHEMA (documind_auth database) ───
exports.UserSchema = new mongoose_1.Schema({
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
}, {
    timestamps: true,
});
// ─── 2. USER DOCUMENTS SCHEMA (documind_data database) ───
exports.UserDocumentSchema = new mongoose_1.Schema({
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
}, {
    timestamps: true,
});
// ─── 3. USER QUESTION SCHEMA (documind_data database) ───
exports.UserQuestionSchema = new mongoose_1.Schema({
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
}, {
    timestamps: true,
});
// ─── 4. SHARE LINK SCHEMA (documind_data database) ───
exports.ShareLinkSchema = new mongoose_1.Schema({
    shareId: { type: String, required: true, unique: true, index: true },
    userEmail: { type: String, required: true, lowercase: true, trim: true },
    documentNames: { type: [String], default: [] },
    answers: { type: Array, default: [] }, // Full AnalysisResult[] array
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 7 days
}, { timestamps: true });
// ─── 5. ACTIVITY LOG SCHEMA (documind_data database) ───
exports.ActivityLogSchema = new mongoose_1.Schema({
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
}, { timestamps: true });
// Backward compatibility default model exports
if (mongoose_1.default.models.User) {
    delete mongoose_1.default.models.User;
}
exports.User = mongoose_1.default.model("User", exports.UserSchema);
exports.UserDocument = mongoose_1.default.models.UserDocument || mongoose_1.default.model("UserDocument", exports.UserDocumentSchema);
exports.UserQuestion = mongoose_1.default.models.UserQuestion || mongoose_1.default.model("UserQuestion", exports.UserQuestionSchema);
