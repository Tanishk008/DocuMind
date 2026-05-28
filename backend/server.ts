import express from "express"
import cors from "cors"
import multer from "multer"
import nodemailer from "nodemailer"
import * as dotenv from "dotenv"
import * as path from "path"
import { Document } from "@langchain/core/documents"
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import { ChatGroq } from "@langchain/groq"
import { ChatPromptTemplate } from "@langchain/core/prompts"

// Load env variables
dotenv.config({ path: path.resolve(__dirname, ".env.local") })

import { connectToAuthDatabase, connectToDataDatabase } from "./lib/mongodb"
import { TrustedExecutionEnvironment } from "./lib/tee"
import {
  extractGraphFromChunk,
  consolidateGraphs,
  extractSeedEntities,
  retrieveSubGraph,
  formatGraphAsText,
} from "./lib/graphrag"

// Generic file extractors (same as route.ts)
import fs from "fs"
import mammoth from "mammoth"
const pdfParseModule = require("pdf-parse")

// --- PDF Text Extraction ---
async function extractPdfText(buffer: Buffer): Promise<string> {
  if (pdfParseModule.PDFParse) {
    const parser = new pdfParseModule.PDFParse({ data: buffer })
    const data = await parser.getText()
    return String(data?.text ?? "")
  }
  const pdfParse = (pdfParseModule.default || pdfParseModule) as (buffer: Buffer) => Promise<{ text: string }>
  const data = await pdfParse(buffer)
  return String(data?.text ?? "")
}

// --- Raw PDF Image Stream Parser (Highly optimized JPEG extractor) ---
function extractJpegsFromPdfBuffer(buffer: Buffer, outputDir: string, docNameClean: string): string[] {
  const imageUrls: string[] = []
  let index = 0
  let pos = 0

  try {
    fs.mkdirSync(outputDir, { recursive: true })

    while (true) {
      const headerIndex = buffer.indexOf("/Subtype /Image", pos)
      if (headerIndex === -1) break

      const streamStartIndex = buffer.indexOf("stream", headerIndex)
      if (streamStartIndex === -1) {
        pos = headerIndex + 15
        continue
      }

      const headerArea = buffer.slice(headerIndex, streamStartIndex).toString("utf-8")
      const isJpeg = headerArea.includes("/DCTDecode") || headerArea.includes("/DCT")

      if (!isJpeg) {
        pos = streamStartIndex + 6
        continue
      }

      let dataStart = streamStartIndex + 6
      if (buffer[dataStart] === 13) dataStart++ // \r
      if (buffer[dataStart] === 10) dataStart++ // \n

      const endstreamIndex = buffer.indexOf("endstream", dataStart)
      if (endstreamIndex === -1) {
        pos = dataStart
        continue
      }

      const jpegData = buffer.slice(dataStart, endstreamIndex)
      if (jpegData.length > 500) {
        index++
        const filename = `image_${index}.jpg`
        const filePath = path.join(outputDir, filename)
        // Serve out of public folder on backend static server
        const relativeUrl = `/extracted_images/${docNameClean}/${filename}`

        try {
          fs.writeFileSync(filePath, jpegData)
          imageUrls.push(relativeUrl)
          console.log(`[ImageRAG] 📸 Extracted PDF JPEG image: ${filename} (${jpegData.length} bytes)`)
        } catch (writeErr: any) {
          console.error(`[ImageRAG] Failed to write image ${filename}:`, writeErr?.message)
        }
      }

      pos = endstreamIndex + 9
    }
  } catch (err: any) {
    console.error(`[ImageRAG] PDF image extraction crashed:`, err?.message)
  }

  return imageUrls
}

// --- Mammoth DOCX Image Extraction & HTML conversion ---
async function extractDocxTextAndImages(
  buffer: Buffer,
  outputDir: string,
  docNameClean: string
): Promise<{ text: string; imageUrls: string[] }> {
  let imageCounter = 0
  const imageUrls: string[] = []

  try {
    fs.mkdirSync(outputDir, { recursive: true })

    const convertImage = mammoth.images.imgElement((element) => {
      imageCounter++
      const ext = element.contentType.split("/")[1] || "png"
      const filename = `image_${imageCounter}.${ext}`
      const filePath = path.join(outputDir, filename)
      const relativeUrl = `/extracted_images/${docNameClean}/${filename}`

      return element.read().then((imageBuffer) => {
        try {
          fs.writeFileSync(filePath, imageBuffer)
          imageUrls.push(relativeUrl)
          console.log(`[ImageRAG] 📸 Extracted DOCX image: ${filename} (${imageBuffer.length} bytes)`)
        } catch (err: any) {
          console.error(`[ImageRAG] Failed to save DOCX image:`, err?.message)
        }
        return {
          src: relativeUrl,
          alt: `extracted_diagram_${imageCounter}`,
        }
      })
    })

    const result = await mammoth.convertToHtml({ buffer }, { convertImage })
    const html = result.value || ""

    const textWithMarkdownImages = html
      .replace(/<img\s+[^>]*src="([^"]+)"[^>]*alt="([^"]+)"[^>]*\/?>/g, " ![$2]($1) ")
      .replace(/<img\s+[^>]*alt="([^"]+)"[^>]*src="([^"]+)"[^>]*\/?>/g, " ![$1]($2) ")
      .replace(/<[^>]+>/g, " ")

    return {
      text: textWithMarkdownImages,
      imageUrls,
    }
  } catch (err: any) {
    console.error(`[ImageRAG] DOCX text/image extraction failed:`, err?.message)
    return { text: "", imageUrls: [] }
  }
}

// --- Generic file text extractor ---
async function extractTextFromFile(
  file: any
): Promise<{ text: string; fileType: string; imageUrls: string[] }> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const name = file.name.toLowerCase()
  const docNameClean = file.name.replace(/[^a-zA-Z0-9]/g, "_")
  
  // Note: we place extracted images in Next.js public directory inside frontend!
  // This allows Next.js frontend to serve them natively!
  const outputDir = path.resolve(__dirname, "../frontend/public/extracted_images", docNameClean)

  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const text = await extractPdfText(buffer)
    const imageUrls = extractJpegsFromPdfBuffer(buffer, outputDir, docNameClean)
    return { text, fileType: "pdf", imageUrls }
  } else if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const { text, imageUrls } = await extractDocxTextAndImages(buffer, outputDir, docNameClean)
    return { text, fileType: "docx", imageUrls }
  } else {
    return { text: buffer.toString("utf-8"), fileType: "txt", imageUrls: [] }
  }
}

// --- Groq key falling mechanism ---
// For fast tasks (graph extraction, summarization, suggestions) — use fastest available
const GROQ_FAST_MODEL = "llama-3.1-8b-instant"
// For accurate tasks (Q&A analysis) — use best available 
const GROQ_MODEL_PRIORITY = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
]

let cachedKeyIndex = 0
let cachedModelIndex = 0

function getAllGroqKeys(): string[] {
  const keys: string[] = []
  const base = process.env.GROQ_API_KEY
  if (base && base.trim()) keys.push(base.trim())
  for (let n = 2; n <= 10; n++) {
    const val = process.env[`GROQ_API_KEY_${n}`]
    if (val && val.trim()) keys.push(val.trim())
  }
  return keys
}

// ─── OpenRouter HTTP fallback (no extra package needed) ───────────────────────
const OPENROUTER_MODELS = [
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-2-9b-it:free",
  "mistralai/mistral-7b-instruct:free",
]

async function askOpenRouter(prompt: string, model: string = OPENROUTER_MODELS[0]): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error("No OpenRouter key")
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "HTTP-Referer": "https://documind-ai.com",
      "X-Title": "DocuMind AI",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json() as any
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error("OpenRouter returned no content")
  return String(content).trim()
}

// Generic OpenRouter fallback that wraps a prompt-string factory
async function withOpenRouterFallback<T>(
  promptFactory: () => string,
  resultParser: (text: string) => T
): Promise<T> {
  for (const model of OPENROUTER_MODELS) {
    try {
      console.log(`[RAG] 🌐 OpenRouter fallback — model: ${model}`)
      const text = await askOpenRouter(promptFactory(), model)
      return resultParser(text)
    } catch (err: any) {
      console.log(`[RAG] OpenRouter ${model} failed: ${String(err?.message).slice(0, 100)}`)
    }
  }
  throw new Error("ALL_PROVIDERS_EXHAUSTED")
}

// ─── Fast LLM (8B model, round-robin keys) ────────────────────────────────────
async function withFastLlm<T>(factory: (apiKey: string, model: string) => Promise<T>): Promise<T> {
  const keys = getAllGroqKeys()
  if (keys.length === 0) throw new Error("NO_GROQ_KEY_CONFIGURED")
  for (let i = 0; i < keys.length; i++) {
    try {
      return await factory(keys[(cachedKeyIndex + i) % keys.length], GROQ_FAST_MODEL)
    } catch (err: any) {
      console.log(`[RAG] Fast-LLM key ${i + 1} failed: ${String(err?.message).slice(0, 80)}`)
    }
  }
  // fallback to full quality
  return withKeyModelFallback(factory)
}

// ─── Main fallback: try every Groq key × model, then OpenRouter ───────────────
async function withKeyModelFallback<T>(
  factory: (apiKey: string, model: string) => Promise<T>
): Promise<T> {
  const keys = getAllGroqKeys()
  if (keys.length === 0) throw new Error("NO_GROQ_KEY_CONFIGURED")

  const totalKeys = keys.length
  const totalModels = GROQ_MODEL_PRIORITY.length

  for (let ki = 0; ki < totalKeys; ki++) {
    const keyIdx = (cachedKeyIndex + ki) % totalKeys
    const apiKey = keys[keyIdx]
    const modelStart = ki === 0 ? cachedModelIndex : 0

    for (let mi = modelStart; mi < totalModels; mi++) {
      const model = GROQ_MODEL_PRIORITY[mi]
      try {
        console.log(`[RAG] Trying key ${keyIdx + 1}/${totalKeys}, model: ${model}`)
        const result = await factory(apiKey, model)
        cachedKeyIndex = keyIdx
        cachedModelIndex = mi
        console.log(`[RAG] ✅ Success — key ${keyIdx + 1}, model: ${model}`)
        return result
      } catch (err: any) {
        const msg = (err?.message || "").toLowerCase()
        const is413 = msg.includes("413") || msg.includes("request too large") || msg.includes("too many tokens")
        const is429 = msg.includes("429") || msg.includes("rate_limit") || msg.includes("quota")
        const isAuth = msg.includes("401") || msg.includes("403") || msg.includes("invalid api key") || msg.includes("unauthorized")
        console.log(`[RAG] ⚠️ Key ${keyIdx + 1} model ${model} failed: ${err.message.slice(0, 120)}`)
        // For 413 (too large), don't try same model on other keys — skip to next model
        if (is413 && mi < totalModels - 1) break
        if (is429 || isAuth || is413) continue
        continue
      }
    }
  }

  // Last resort: OpenRouter
  console.log("[RAG] 🌐 All Groq keys exhausted — trying OpenRouter...")
  cachedKeyIndex = (cachedKeyIndex + 1) % Math.max(keys.length, 1)
  cachedModelIndex = 0
  throw new Error("ALL_GROQ_KEYS_EXHAUSTED") // Caught by callers which have OpenRouter fallback
}

const makeLlm = (apiKey: string, model: string) =>
  new ChatGroq({
    apiKey,
    model,
    temperature: 0.2,
    maxRetries: 0,
  })

async function askSingleQuestion(
  llm: ChatGroq,
  fullContext: string,
  graphContext: string,
  question: string,
  sources: string[]
): Promise<{ answer: string; foundInDocument: boolean; confidence: number; sources: string[] }> {
  const prompt = ChatPromptTemplate.fromTemplate(`
You are DocuMind AI, an expert document analyst. Provide an extremely detailed, highly comprehensive, exhaustive, and well-structured answer to the user's question based on the provided document context and structured knowledge graph.

Rules:
1. If the answer is NOT found in either the document context or the knowledge graph, say exactly: "This information is not found in the provided document(s)."
2. Do NOT make up or assume any facts not directly present in the context.
3. Your answer must be extremely thorough, rich, deeply explanatory, and comprehensive. You MUST write at least 3 to 4 detailed paragraphs explaining the nuances, details, context, and facts. Never write a short summary, simple explanation, or single-sentence answer.
4. Structure your response beautifully using multiple substantial paragraphs, detailed bullet points, or numbered lists with clear whitespace so it is highly professional, educational, and readable.
5. If there are extracted diagrams or visuals listed in the context that match the user's query topic (such as diagrams of architectures, processes, graphs, etc.), you MUST render them inline in your answer using their exact Markdown reference format (e.g. ![caption](/extracted_images/...) ) from the diagrams block.
6. If the user explicitly asks to "draw", "visualize", or "show" a diagram or architecture (e.g. LSTM, GRU, neural net gates, etc.) and no corresponding extracted image exists in the context, you MUST draw a beautiful, highly detailed, text-based flowchart using structured ASCII/Unicode box-drawing characters (such as ┌, ┐, └, ┘, ─, │, ▲, ▼, ◄, ►, ⊗, ⊕) to visually illustrate the cell state, update/reset/forget gates, and input/output flows.
7. NEVER say you cannot render diagrams; always generate a beautiful ASCII flowchart!
8. Provide a plain text answer using clear spacing and formatting — do not output JSON.

Document Context:
{context}

{graphContext}

Question: {input}

Answer:`)

  const chain = prompt.pipe(llm)
  const result = await chain.invoke({ context: fullContext, graphContext, input: question })
  const answerText = String(result.content ?? "").trim()
  const notFound = answerText.toLowerCase().includes("not found in the provided")
  return {
    answer: answerText,
    foundInDocument: !notFound,
    confidence: notFound ? 0 : 90,
    sources: notFound ? [] : sources,
  }
}

// Initialize Express App
const app = express()
const PORT = process.env.PORT || 5001

// CORS setup to allow queries from port 3000
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
)

app.use(express.json())

// Setup file upload middleware
const storage = multer.memoryStorage()
const upload = multer({ storage })

// --- Unified User object assembler across separate databases ---
async function getUnifiedUser(email: string, authConn: any, dataConn: any) {
  const UserModel = authConn.model("User")
  const DocModel = dataConn.model("UserDocument")
  const QuestionModel = dataConn.model("UserQuestion")

  const authUser = await UserModel.findOne({ email })
  if (!authUser) return null

  // Retrieve files/docs metadata logs from documind_data database
  const docs = await DocModel.find({ userEmail: email.toLowerCase() })

  // Retrieve questions history logs from documind_data database
  const questions = await QuestionModel.find({ userEmail: email.toLowerCase() })

  return {
    id: authUser._id.toString(),
    email: authUser.email,
    name: authUser.name,
    role: authUser.role,
    phone: authUser.phone,
    address: authUser.address,
    totalQueries: authUser.totalQueries,
    currentStep: authUser.currentStep || 1,
    documents: docs.map((d: any) => ({
      id: d.id,
      name: d.name,
      size: d.size,
      type: d.type,
      url: d.url,
      content: d.content || "",
      summary: d.summary || "",
      documentType: d.documentType || "General",
      tags: d.tags || [],
      uploadedAt: d.uploadedAt,
      nodes: d.nodes || [],
      edges: d.edges || [],
    })),
    questions: questions.map((q: any) => ({
      id: q.id,
      text: q.text,
      answer: q.answer,
      confidence: q.confidence,
      sources: q.sources,
      timestamp: q.timestamp,
    })),
  }
}

// --- 1. SIGNUP ROUTE ---
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    if (email === "documindai008@gmail.com") {
      return res.status(403).json({ error: "Reserved admin email" })
    }

    const authConn = await connectToAuthDatabase()
    const UserModel = authConn.model("User")

    const existingUser = await UserModel.findOne({ email })
    if (existingUser) {
      return res.status(409).json({ error: "Email already registered" })
    }

    // Secure Hashing via simulated Trusted Execution Environment (TEE)
    const hashedPassword = TrustedExecutionEnvironment.secureHash(password)
    await UserModel.create({ email, password: hashedPassword, name })

    const dataConn = await connectToDataDatabase()
    const safeUser = await getUnifiedUser(email, authConn, dataConn)

    // Audit log: SIGNUP
    try {
      const dataConn2 = await connectToDataDatabase()
      const LogModel = dataConn2.model("ActivityLog")
      await LogModel.create({ userEmail: email.toLowerCase(), action: "SIGNUP", details: `New account registered: ${name}` })
    } catch (e) {}

    return res.status(201).json({ success: true, user: safeUser })
  } catch (error: any) {
    console.error("Signup error:", error)
    return res.status(500).json({ error: "Failed to create account" })
  }
})

// --- 2. LOGIN ROUTE ---
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: "Missing credentials" })
    }

    if (email === "documindai008@gmail.com") {
      if (password === "Tanishk#1234") {
        return res.json({
          success: true,
          user: { id: "admin", email, name: "Admin", role: "admin" },
        })
      }
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const authConn = await connectToAuthDatabase()
    const dataConn = await connectToDataDatabase()
    const UserModel = authConn.model("User")

    // Secure Hashing match via TEE
    const hashedPassword = TrustedExecutionEnvironment.secureHash(password)
    let foundUser = await UserModel.findOne({ email, password: hashedPassword })
    
    // Legacy support fallback for unhashed passwords
    if (!foundUser) {
      foundUser = await UserModel.findOne({ email, password })
    }

    if (!foundUser) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const safeUser = await getUnifiedUser(email, authConn, dataConn)

    // Audit log: LOGIN
    try {
      const LogModel = dataConn.model("ActivityLog")
      await LogModel.create({ userEmail: email.toLowerCase(), action: "LOGIN", details: `Successful login` })
    } catch (e) {}

    return res.json({ success: true, user: safeUser })
  } catch (error: any) {
    console.error("Login error:", error)
    return res.status(500).json({ error: "Authentication failed" })
  }
})

// --- 3. PROFILE UPDATE ROUTE ---
app.put("/api/profile", async (req, res) => {
  try {
    const { email, ...updateFields } = req.body

    if (!email) {
      return res.status(400).json({ error: "Email is required to identify user" })
    }

    if (email === "documindai008@gmail.com") {
      return res.json({ success: true, message: "Admin profile dynamically mocked" })
    }

    const authConn = await connectToAuthDatabase()
    const dataConn = await connectToDataDatabase()
    const UserModel = authConn.model("User")

    const updatedUser = await UserModel.findOneAndUpdate(
      { email },
      { $set: updateFields },
      { new: true }
    )

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" })
    }

    const safeUser = await getUnifiedUser(email, authConn, dataConn)

    return res.json({ success: true, user: safeUser })
  } catch (error: any) {
    console.error("Profile update error:", error)
    return res.status(500).json({ error: "Failed to update profile" })
  }
})

// --- 4. DOCUMENTS GET/POST/DELETE ROUTE ---
app.get("/api/user/documents", async (req, res) => {
  try {
    const email = req.query.email as string
    if (!email) return res.status(400).json({ error: "Email required" })

    const dataConn = await connectToDataDatabase()
    const DocModel = dataConn.model("UserDocument")

    const docs = await DocModel.find({ userEmail: email.toLowerCase() })

    return res.json({ 
      success: true, 
      documents: docs.map((d: any) => ({
        id: d.id,
        name: d.name,
        size: d.size,
        type: d.type,
        url: d.url,
        content: d.content || "",
        summary: d.summary || "",
        documentType: d.documentType || "General",
        tags: d.tags || [],
        uploadedAt: d.uploadedAt,
        nodes: d.nodes || [],
        edges: d.edges || []
      }))
    })
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch documents" })
  }
})

app.post("/api/user/documents", async (req, res) => {
  try {
    const { email, documents } = req.body
    if (!email || !documents) return res.status(400).json({ error: "Missing data" })

    const STORAGE_LIMIT_BYTES = 50 * 1024 * 1024 // 50MB per user
    const totalSize = documents.reduce((acc: number, d: any) => acc + (d.size || 0), 0)
    if (totalSize > STORAGE_LIMIT_BYTES) {
      return res.status(413).json({ error: "Storage limit exceeded. Maximum allowed: 50MB per account." })
    }

    const dataConn = await connectToDataDatabase()
    const DocModel = dataConn.model("UserDocument")

    // Fetch existing documents to preserve base64 content, graph data, summary, and tags
    const existingDocs = await DocModel.find({ userEmail: email.toLowerCase() })
    const existingDocsMap = new Map(existingDocs.map((doc: any) => [doc.name, doc]))

    // Replace documents for this email (matches original behavior)
    await DocModel.deleteMany({ userEmail: email.toLowerCase() })

    const cleanDocs = documents.map((d: any) => {
      const existingDoc = existingDocsMap.get(d.name) as any
      const content = d.content || (existingDoc ? existingDoc.content : "") || ""
      const nodes = d.nodes && d.nodes.length > 0 ? d.nodes : (existingDoc ? existingDoc.nodes : [])
      const edges = d.edges && d.edges.length > 0 ? d.edges : (existingDoc ? existingDoc.edges : [])
      const summary = d.summary || (existingDoc ? existingDoc.summary : "") || ""
      const tags = d.tags && d.tags.length > 0 ? d.tags : (existingDoc ? existingDoc.tags : [])
      const documentType = d.documentType || (existingDoc ? existingDoc.documentType : "General") || "General"

      return {
        userEmail: email.toLowerCase(),
        id: d.id || (existingDoc ? existingDoc.id : Math.random().toString(36).substr(2, 9)),
        name: d.name || "Unnamed",
        size: d.size || 0,
        type: d.type || "application/octet-stream",
        url: d.url || "",
        content: content,
        summary: summary,
        documentType: documentType,
        tags: tags,
        uploadedAt: d.uploadedAt ? new Date(d.uploadedAt) : new Date(),
        nodes: nodes,
        edges: edges,
      }
    })

    const savedDocs = await DocModel.insertMany(cleanDocs)

    // Update storage used in auth DB
    try {
      const authConn = await connectToAuthDatabase()
      const UserModel = authConn.model("User")
      await UserModel.findOneAndUpdate({ email }, { $set: { storageUsed: totalSize } })
    } catch (e) {}

    return res.json({ 
      success: true, 
      documents: savedDocs.map((d: any) => ({
        id: d.id,
        name: d.name,
        size: d.size,
        type: d.type,
        url: d.url,
        content: d.content || "",
        summary: d.summary || "",
        documentType: d.documentType || "General",
        tags: d.tags || [],
        uploadedAt: d.uploadedAt,
        nodes: d.nodes || [],
        edges: d.edges || []
      }))
    })
  } catch (error: any) {
    console.error("Save documents error:", error)
    return res.status(500).json({ error: "Failed to save documents" })
  }
})

// --- 5. QUESTIONS GET/POST ROUTE ---
app.get("/api/user/questions", async (req, res) => {
  try {
    const email = req.query.email as string
    if (!email) return res.status(400).json({ error: "Email required" })

    const dataConn = await connectToDataDatabase()
    const QuestionModel = dataConn.model("UserQuestion")

    const questions = await QuestionModel.find({ userEmail: email.toLowerCase() })

    return res.json({ 
      success: true, 
      questions: questions.map((q: any) => ({
        id: q.id,
        text: q.text,
        timestamp: q.timestamp,
        answer: q.answer,
        confidence: q.confidence,
        sources: q.sources,
      }))
    })
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch questions" })
  }
})

app.post("/api/user/questions", async (req, res) => {
  try {
    const { email, questions } = req.body
    if (!email || !questions) return res.status(400).json({ error: "Missing data" })

    const authConn = await connectToAuthDatabase()
    const dataConn = await connectToDataDatabase()
    
    const UserModel = authConn.model("User")
    const QuestionModel = dataConn.model("UserQuestion")

    await QuestionModel.deleteMany({ userEmail: email.toLowerCase() })

    const cleanQuestions = questions.map((q: any) => ({
      userEmail: email.toLowerCase(),
      id: q.id || Math.random().toString(36).substr(2, 9),
      text: q.text || "",
      answer: q.answer || "",
      confidence: q.confidence || 95,
      sources: q.sources || [],
      foundInDocument: q.foundInDocument !== false,
      timestamp: q.timestamp ? new Date(q.timestamp) : new Date(),
    }))

    const savedQuestions = await QuestionModel.insertMany(cleanQuestions)

    await UserModel.findOneAndUpdate(
      { email },
      { $set: { totalQueries: cleanQuestions.length } }
    )

    return res.json({ 
      success: true, 
      questions: savedQuestions.map((q: any) => ({
        id: q.id,
        text: q.text,
        timestamp: q.timestamp,
      })),
      totalQueries: cleanQuestions.length 
    })
  } catch (error: any) {
    console.error("Save questions error:", error)
    return res.status(500).json({ error: "Failed to save questions" })
  }
})

// --- 6. QUERIES METRICS INCREMENT ROUTE ---
app.post("/api/queries", async (req, res) => {
  try {
    const { email, increment } = req.body

    if (!email || !increment) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    if (email === "documindai008@gmail.com") {
      return res.json({ success: true, message: "Ignored metric for admin" })
    }

    const authConn = await connectToAuthDatabase()
    const UserModel = authConn.model("User")

    await UserModel.findOneAndUpdate({ email }, { $inc: { totalQueries: increment } })

    return res.json({ success: true })
  } catch (error: any) {
    console.error("Metric increment error:", error)
    return res.status(500).json({ error: "Failed to increment query count" })
  }
})

// --- SYSTEM EMAIL SENDER (HTTP-based for cloud compatibility + SMTP fallback) ---
async function sendSystemEmail({
  to,
  subject,
  html,
  text,
  fromName,
  replyTo
}: {
  to: string
  subject: string
  html?: string
  text?: string
  fromName: string
  replyTo?: string
}) {
  // 1. Try Resend HTTP API if RESEND_API_KEY is configured
  if (process.env.RESEND_API_KEY) {
    console.log(`[Email] Sending via Resend API to ${to}...`)
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [to],
          subject: subject,
          html: html || text,
          reply_to: replyTo
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("[Email] Resend API error:", errorData)
        throw new Error(`Resend API response status ${response.status}: ${JSON.stringify(errorData)}`)
      }

      console.log(`[Email] Sent successfully via Resend to ${to}`)
      return { success: true, provider: "resend" }
    } catch (err: any) {
      console.error("[Email] Resend API fetch failed, falling back if possible...", err)
    }
  }

  // 2. Try Brevo (Sendinblue) HTTP API if BREVO_API_KEY is configured
  if (process.env.BREVO_API_KEY) {
    console.log(`[Email] Sending via Brevo API to ${to}...`)
    const fromEmail = process.env.BREVO_FROM_EMAIL || "documindai008@gmail.com"
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.BREVO_API_KEY
        },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: to }],
          replyTo: replyTo ? { email: replyTo } : undefined,
          subject: subject,
          htmlContent: html || text?.replace(/\n/g, "<br>")
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("[Email] Brevo API error:", errorData)
        throw new Error(`Brevo API response status ${response.status}: ${JSON.stringify(errorData)}`)
      }

      console.log(`[Email] Sent successfully via Brevo to ${to}`)
      return { success: true, provider: "brevo" }
    } catch (err: any) {
      console.error("[Email] Brevo API fetch failed, falling back if possible...", err)
    }
  }

  // 3. Fallback to standard Nodemailer SMTP (e.g. Gmail) if EMAIL_PASS is configured
  if (process.env.EMAIL_PASS) {
    console.log(`[Email] Sending via Nodemailer SMTP to ${to}...`)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "documindai008@gmail.com",
        pass: process.env.EMAIL_PASS,
      },
    })

    await transporter.sendMail({
      from: `"${fromName}" <documindai008@gmail.com>`,
      to: to,
      replyTo: replyTo,
      subject: subject,
      text: text,
      html: html,
    })

    console.log(`[Email] Sent successfully via Nodemailer SMTP to ${to}`)
    return { success: true, provider: "nodemailer" }
  }

  // 4. No configuration found - Simulate sending for development
  console.log(`[Email] ⚠️ No email service API keys or credentials configured. Simulated Email:
  ------------------------------------
  From Name: ${fromName}
  To: ${to}
  Subject: ${subject}
  Content: ${text || "HTML Content (Check console log for HTML block)"}
  ------------------------------------`)
  
  return { success: true, provider: "none" }
}

// --- 7. CONTACT SUPPORT ROUTE ---
app.post("/api/contact", async (req, res) => {
  try {
    const { fullName, email, issue, credentials } = req.body

    if (!fullName || !email || !issue) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    const result = await sendSystemEmail({
      to: "documindai008@gmail.com",
      subject: `DocuMind AI Support: Query from ${fullName}`,
      text: `New contact submission:\n\nName: ${fullName}\nEmail: ${email}\n\nIssue:\n${issue}\n\nCredentials:\n${credentials || "N/A"}`,
      fromName: "DocuMind AI",
      replyTo: email
    })

    return res.json({ 
      success: true, 
      message: result.provider === "none" ? "Query received (simulated)" : "Email sent successfully",
      provider: result.provider 
    })
  } catch (error: any) {
    console.error("Contact email error:", error)
    return res.status(500).json({ error: "Failed to send email", details: error.message })
  }
})

// --- OTP In-Memory Store ---
const otpStore = new Map<string, { otp: string; expires: number }>()

// --- OTP GENERATION & SENDING ROUTE ---
app.post("/api/auth/otp", async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: "Email is required" })
    }

    // Generate 6-digit OTP via TEE
    const otp = TrustedExecutionEnvironment.generateSecureOtp()
    const expires = Date.now() + 5 * 60 * 1000 // 5 minutes validity
    otpStore.set(email.toLowerCase(), { otp, expires })

    const result = await sendSystemEmail({
      to: email,
      subject: `DocuMind AI: Your Security OTP is ${otp}`,
      text: `Your DocuMind AI secure access code is: ${otp}. It is valid for 5 minutes.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: auto; padding: 24px; border: 1px solid #ddd; border-radius: 12px;">
          <h2 style="color: #2563EB; margin-bottom: 8px;">DocuMind AI Security</h2>
          <p style="color: #444;">You requested a secure access code for DocuMind AI.</p>
          <p style="color: #444;">Your One-Time Password (valid for <strong>5 minutes</strong>):</p>
          <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; padding: 18px; background: #f3f4f6; text-align: center; border-radius: 8px; margin: 20px 0; color: #1d4ed8;">
            ${otp}
          </div>
          <p style="font-size: 13px; color: #888;">If you did not request this code, please ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin-top: 24px;" />
          <p style="font-size: 11px; color: #bbb;">&copy; 2026 DocuMind AI &mdash; Tanishk Gupta</p>
        </div>
      `,
      fromName: "DocuMind Security"
    })

    console.log(`[OTP] 📧 Sent OTP ${otp} to ${email} using provider: ${result.provider}`)
    return res.json({ 
      success: true, 
      message: result.provider === "none" ? "OTP sent (simulated)" : "OTP Email Sent!",
      provider: result.provider
    })
  } catch (error: any) {
    console.error("OTP email sending error:", error)
    return res.status(500).json({ error: "Failed to send OTP", details: error.message })
  }
})

// --- OTP VERIFICATION ROUTE ---
app.put("/api/auth/otp", async (req, res) => {
  try {
    const { email, otp } = req.body

    if (!email || !otp) {
      return res.status(400).json({ error: "Missing email or OTP" })
    }

    const record = otpStore.get(email.toLowerCase())
    if (!record) {
      return res.status(400).json({ error: "No active OTP request found for this email." })
    }

    if (Date.now() > record.expires) {
      otpStore.delete(email.toLowerCase())
      return res.status(400).json({ error: "Your OTP has expired. Please request a new one." })
    }

    if (record.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP code. Please try again." })
    }

    // Success: Consume OTP
    otpStore.delete(email.toLowerCase())
    console.log(`[OTP] ✅ Successfully verified OTP for ${email}`)
    return res.json({ success: true, message: "OTP Verified Successfully!" })
  } catch (error: any) {
    console.error("OTP verification error:", error)
    return res.status(500).json({ error: "Failed to verify OTP" })
  }
})

// --- PASSWORD RESET ROUTE ---
app.put("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    // Verify OTP first
    const record = otpStore.get(email.toLowerCase())
    if (!record) {
      return res.status(400).json({ error: "No active OTP request found for this email." })
    }

    if (Date.now() > record.expires) {
      otpStore.delete(email.toLowerCase())
      return res.status(400).json({ error: "Your OTP has expired. Please request a new one." })
    }

    if (record.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP code. Please try again." })
    }

    // Connect to database and find user
    const authConn = await connectToAuthDatabase()
    const UserModel = authConn.model("User")

    const user = await UserModel.findOne({ email: email.toLowerCase() })
    if (!user) {
      return res.status(404).json({ error: "No account registered with this email address." })
    }

    // Hash the password securely via TEE hash
    const hashedPassword = TrustedExecutionEnvironment.secureHash(newPassword)

    // Update password
    user.password = hashedPassword
    await user.save()

    // Consume OTP
    otpStore.delete(email.toLowerCase())

    console.log(`[Auth] ✅ Successfully reset password for ${email}`)
    return res.json({ success: true, message: "Password reset successfully!" })
  } catch (error: any) {
    console.error("Reset password error:", error)
    return res.status(500).json({ error: "Failed to reset password. Please try again." })
  }
})

// --- USER STORAGE ROUTE ---
app.get("/api/user/storage", async (req, res) => {
  try {
    const email = req.query.email as string
    if (!email) return res.status(400).json({ error: "Email required" })
    const authConn = await connectToAuthDatabase()
    const UserModel = authConn.model("User")
    const user = await UserModel.findOne({ email: email.toLowerCase() })
    const storageUsed = user?.storageUsed || 0
    const storageLimit = 50 * 1024 * 1024 // 50MB
    return res.json({ success: true, storageUsed, storageLimit, percentUsed: Math.round((storageUsed / storageLimit) * 100) })
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch storage info" })
  }
})

// --- DOCUMENT CONTENT FETCH ROUTE (for View/Download when sessionStorage is empty) ---
app.get("/api/user/documents/:docId/content", async (req, res) => {
  try {
    const { docId } = req.params
    const email = req.query.email as string
    if (!email || !docId) return res.status(400).json({ error: "Missing params" })
    const dataConn = await connectToDataDatabase()
    const DocModel = dataConn.model("UserDocument")
    const doc = await DocModel.findOne({ id: docId, userEmail: email.toLowerCase() })
    if (!doc) return res.status(404).json({ error: "Document not found" })
    if (!doc.content) return res.status(404).json({ error: "No content stored for this document. Please re-upload." })
    // Return as base64 JSON (small files) or stream raw bytes (large files)
    const contentStr: string = doc.content as string
    if (contentStr.length > 2 * 1024 * 1024) {
      // For large files, stream the binary directly
      const bytes = Buffer.from(contentStr, "base64")
      res.setHeader("Content-Type", doc.type || "application/octet-stream")
      res.setHeader("Content-Disposition", `inline; filename="${doc.name}"`)
      res.setHeader("Content-Length", bytes.length)
      return res.end(bytes)
    }
    return res.json({ success: true, content: contentStr, name: doc.name, type: doc.type })
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch document content" })
  }
})

// --- UPDATE DOCUMENT TAGS ROUTE ---
app.put("/api/user/documents/:docId/tags", async (req, res) => {
  try {
    const { docId } = req.params
    const { email, tags } = req.body
    if (!email || !tags) return res.status(400).json({ error: "Missing data" })
    const dataConn = await connectToDataDatabase()
    const DocModel = dataConn.model("UserDocument")
    await DocModel.findOneAndUpdate(
      { id: docId, userEmail: email.toLowerCase() },
      { $set: { tags } }
    )
    return res.json({ success: true })
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to update tags" })
  }
})

// --- AUTO-SUMMARIZE ROUTE ---
app.post("/api/summarize", upload.single("file"), async (req, res) => {
  try {
    const fileUpload = req.file as Express.Multer.File
    const { email, docId } = req.body
    if (!fileUpload) return res.status(400).json({ error: "No file uploaded" })

    const mockFile = {
      name: fileUpload.originalname,
      type: fileUpload.mimetype,
      size: fileUpload.size,
      arrayBuffer: async () => fileUpload.buffer,
      base64Content: fileUpload.buffer.toString("base64")
    }

    const { text } = await extractTextFromFile(mockFile)
    const safeText = String(text ?? "").trim().slice(0, 12000) // cap for summarization
    if (!safeText) return res.status(400).json({ error: "Could not extract text from file" })

    // Combined single call: both summary and doc type in one LLM request (2x faster)
    const combinedResult = await withFastLlm(async (apiKey, model) => {
      const llm = makeLlm(apiKey, model)
      const prompt = ChatPromptTemplate.fromTemplate(`You are DocuMind AI. Do both tasks below based on the document text.

TASK 1 — SUMMARY: Write a 2-3 paragraph plain prose summary (under 200 words). Focus on main purpose, key topics, important findings.
TASK 2 — TYPE: Classify into exactly one of: Legal, Medical, Academic, Financial, Technical, General.

Respond in this exact JSON format only:
{{"summary": "...", "type": "..."}}

Document Text:
{text}

JSON:`)
      const chain = prompt.pipe(llm)
      const result = await chain.invoke({ text: safeText.slice(0, 8000) })
      let raw = String(result.content ?? "").trim()
      const start = raw.indexOf("{")
      const end = raw.lastIndexOf("}")
      if (start !== -1 && end !== -1) raw = raw.substring(start, end + 1)
      const parsed = JSON.parse(raw)
      const validTypes = ["Legal", "Medical", "Academic", "Financial", "Technical", "General"]
      const foundType = validTypes.find(t => (parsed.type || "").toLowerCase().includes(t.toLowerCase())) || "General"
      return { summary: String(parsed.summary || "").trim(), documentType: foundType }
    })
    const summaryResult = combinedResult.summary
    const docTypeResult = combinedResult.documentType

    // Persist summary and document type to DB
    if (email && docId) {
      try {
        const dataConn = await connectToDataDatabase()
        const DocModel = dataConn.model("UserDocument")
        await DocModel.findOneAndUpdate(
          { id: docId, userEmail: email.toLowerCase() },
          { $set: { summary: summaryResult, documentType: docTypeResult } }
        )
      } catch (e) {}
    }

    return res.json({ success: true, summary: summaryResult, documentType: docTypeResult })
  } catch (error: any) {
    console.error("Summarize error:", error)
    return res.status(500).json({ error: "Failed to summarize document" })
  }
})

// --- AI SMART QUESTIONS SUGGESTION ROUTE ---
app.post("/api/suggest-questions", upload.single("file"), async (req, res) => {
  try {
    const fileUpload = req.file as Express.Multer.File
    if (!fileUpload) return res.status(400).json({ error: "No file uploaded" })

    const mockFile = {
      name: fileUpload.originalname,
      type: fileUpload.mimetype,
      size: fileUpload.size,
      arrayBuffer: async () => fileUpload.buffer,
      base64Content: ""
    }

    const { text } = await extractTextFromFile(mockFile)
    const safeText = String(text ?? "").trim().slice(0, 8000)
    if (!safeText) return res.status(400).json({ error: "Could not extract text" })

    const questions = await withFastLlm(async (apiKey, model) => {
      const llm = makeLlm(apiKey, model)
      const prompt = ChatPromptTemplate.fromTemplate(`
You are DocuMind AI. Based on the following document, generate exactly 8 insightful, specific questions that a user would want answered from this document.
The questions should be about key topics, terms, findings, dates, people, processes, and conclusions in the document.
Return ONLY a JSON array of strings — the 8 questions. No other text. Example: ["Question 1?", "Question 2?"]

Document Text:
{text}

JSON Array of Questions:`)
      const chain = prompt.pipe(llm)
      const result = await chain.invoke({ text: safeText })
      let raw = String(result.content ?? "").trim()
      const start = raw.indexOf("[")
      const end = raw.lastIndexOf("]")
      if (start !== -1 && end !== -1) raw = raw.substring(start, end + 1)
      return JSON.parse(raw) as string[]
    })

    return res.json({ success: true, questions, documentName: fileUpload.originalname })
  } catch (error: any) {
    console.error("Suggest questions error:", error)
    return res.status(500).json({ error: "Failed to generate questions" })
  }
})

// --- SHARE LINK CREATE ROUTE ---
app.post("/api/share", async (req, res) => {
  try {
    const { email, documentNames, answers } = req.body
    if (!email || !answers) return res.status(400).json({ error: "Missing data" })

    const dataConn = await connectToDataDatabase()
    const ShareModel = dataConn.model("ShareLink")
    const LogModel = dataConn.model("ActivityLog")

    const shareId = Math.random().toString(36).substr(2, 12) + Date.now().toString(36)
    await ShareModel.create({
      shareId,
      userEmail: email.toLowerCase(),
      documentNames: documentNames || [],
      answers,
    })

    await LogModel.create({ userEmail: email.toLowerCase(), action: "SHARE_CREATED", details: `Shared analysis of: ${(documentNames || []).join(", ")}` }).catch(() => {})

    return res.json({ success: true, shareId, shareUrl: `/share/${shareId}` })
  } catch (error: any) {
    console.error("Share create error:", error)
    return res.status(500).json({ error: "Failed to create share link" })
  }
})

// --- SHARE LINK FETCH ROUTE ---
app.get("/api/share/:shareId", async (req, res) => {
  try {
    const { shareId } = req.params
    const dataConn = await connectToDataDatabase()
    const ShareModel = dataConn.model("ShareLink")
    const shared = await ShareModel.findOne({ shareId })
    if (!shared) return res.status(404).json({ error: "Share link not found or expired" })
    if (shared.expiresAt && new Date() > shared.expiresAt) {
      await ShareModel.deleteOne({ shareId })
      return res.status(410).json({ error: "This share link has expired" })
    }
    return res.json({
      success: true,
      shareId,
      documentNames: shared.documentNames,
      answers: shared.answers,
      createdAt: shared.createdAt,
      expiresAt: shared.expiresAt,
    })
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch share link" })
  }
})

// --- ADMIN ACTIVITY LOGS ROUTE ---
app.get("/api/admin/logs", async (req, res) => {
  try {
    const { email, limit = "50" } = req.query as any
    const dataConn = await connectToDataDatabase()
    const LogModel = dataConn.model("ActivityLog")
    const query: any = {}
    if (email) query.userEmail = email.toLowerCase()
    const logs = await LogModel.find(query).sort({ timestamp: -1 }).limit(parseInt(limit))
    return res.json({ success: true, logs })
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch logs" })
  }
})

// --- GET ADMIN STATS ROUTE (Enhanced with chart data) ---
app.get("/api/admin/stats", async (req, res) => {
  try {
    const authConn = await connectToAuthDatabase()
    const dataConn = await connectToDataDatabase()
    const UserModel = authConn.model("User")
    const DocModel = dataConn.model("UserDocument")

    const totalUsers = await UserModel.countDocuments()
    
    // Total queries
    const queryResult = await UserModel.aggregate([
      { $group: { _id: null, totalQueriesAnalyzed: { $sum: "$totalQueries" } } }
    ])
    const totalQueries = queryResult.length > 0 ? queryResult[0].totalQueriesAnalyzed : 0

    // Total documents stored
    const totalDocuments = await DocModel.countDocuments()

    // User growth by day (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const userGrowth = await UserModel.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])

    // Top users by queries
    const topUsers = await UserModel.aggregate([
      { $match: { totalQueries: { $gt: 0 } } },
      { $project: { email: 1, name: 1, totalQueries: 1 } },
      { $sort: { totalQueries: -1 } },
      { $limit: 10 }
    ])

    // Document type distribution
    const docTypeDistribution = await DocModel.aggregate([
      { $group: { _id: "$documentType", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])

    // Total storage used across all users
    const storageResult = await UserModel.aggregate([
      { $group: { _id: null, totalStorageUsed: { $sum: "$storageUsed" } } }
    ])
    const totalStorageUsed = storageResult.length > 0 ? storageResult[0].totalStorageUsed : 0

    return res.json({
      success: true,
      stats: {
        totalUsers,
        totalQueries,
        totalDocuments,
        totalStorageUsed,
        userGrowth: userGrowth.map((d: any) => ({ date: d._id, count: d.count })),
        topUsers: topUsers.map((u: any) => ({ email: u.email, name: u.name, queries: u.totalQueries })),
        docTypeDistribution: docTypeDistribution.map((d: any) => ({ type: d._id || "General", count: d.count }))
      }
    })
  } catch (error: any) {
    console.error("Admin stats error:", error)
    return res.status(500).json({ error: "Failed to fetch aggregated statistics" })
  }
})

// --- 8. GRAPH RAG ANALYZE ROUTE ---
app.post("/api/analyze", upload.array("files"), async (req, res) => {
  try {
    const filesArray = req.files as Express.Multer.File[]
    const { questions: questionsJson, question, email } = req.body

    let questionsToProcess: string[] = []
    if (questionsJson) {
      questionsToProcess = JSON.parse(questionsJson)
    } else if (question) {
      questionsToProcess = [question]
    }

    console.log("[RAG-Backend] Ingested:", filesArray?.length, "files | Questions:", questionsToProcess.length, "| User Email:", email)

    if (!filesArray || filesArray.length === 0)
      return res.status(400).json({ error: "No files uploaded" })
    if (questionsToProcess.length === 0)
      return res.status(400).json({ error: "No questions provided" })

    const keys = getAllGroqKeys()
    if (keys.length === 0) throw new Error("NO_GROQ_KEY_CONFIGURED")

    // Adapt Express multer files to mock Next.js File compatibility
    const files = filesArray.map((f) => ({
      name: f.originalname,
      type: f.mimetype,
      size: f.size,
      arrayBuffer: async () => f.buffer,
      base64Content: f.buffer.toString("base64")
    }))

    // DB Connection Check
    let dbConnected = false
    let docModel: any = null
    let questionModel: any = null
    let authModel: any = null
    if (email && email !== "documindai008@gmail.com") {
      try {
        const authConn = await connectToAuthDatabase()
        const dataConn = await connectToDataDatabase()
        dbConnected = true
        docModel = dataConn.model("UserDocument")
        questionModel = dataConn.model("UserQuestion")
        authModel = authConn.model("User")
      } catch (dbErr: any) {
        console.error("[RAG-Backend] DB Connection fallback:", dbErr?.message)
      }
    }

    const allDocs: Document[] = []
    const fileGraphs: any[] = []
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 100000, chunkOverlap: 2000 })

    for (const file of files) {
      const { text, fileType, imageUrls } = await extractTextFromFile(file)
      const safeText = String(text ?? "").trim()
      
      if (!safeText) continue

      // Image Caption pairing and markdown association block
      let diagramsContextBlock = ""
      if (imageUrls && imageUrls.length > 0) {
        const captionRegex = /(?:Figure|Fig\.|fig\.|figure)\s+\d+(?:\.\d+)*\s*[:\-\s]\s*([^\.\n]+)/gi
        const captions: string[] = []
        let match
        while ((match = captionRegex.exec(safeText)) !== null) {
          captions.push(match[0].trim())
        }

        const uniqueCaptions = Array.from(new Set(captions)).slice(0, imageUrls.length)
        const figureMarkdowns = imageUrls.map((url, idx) => {
          const caption = uniqueCaptions[idx] || `Figure ${idx + 1} from ${file.name}`
          return `- ![${caption}](${url})`
        })

        diagramsContextBlock = `\n\n--- Extracted Document Diagrams & Visuals for ${file.name} ---\n` +
          `The following diagram/figure image assets are available. When the user asks about these topics or figures, you MUST render the diagram inline in your reply using its exact Markdown reference format below:\n` +
          figureMarkdowns.join("\n") + "\n\n"
      }

      // Text chunks
      const textChunks = await textSplitter.splitDocuments([
        new Document({
          pageContent: safeText + diagramsContextBlock,
          metadata: { source: file.name, fileType, uploadedAt: new Date().toISOString() },
        }),
      ])
      allDocs.push(...textChunks)

      // Graph retrieval / extraction
      let fileGraph: { nodes: import("./lib/graphrag").GraphNode[], edges: import("./lib/graphrag").GraphEdge[] } = { nodes: [], edges: [] }
      let foundInDb = false

      if (dbConnected && docModel) {
        const dbDoc = await docModel.findOne({ userEmail: email.toLowerCase(), name: file.name })
        if (dbDoc && dbDoc.nodes && dbDoc.nodes.length > 0) {
          console.log(`[RAG-Backend] ✅ Loaded Knowledge Graph from documind_data Database for ${file.name}`)
          fileGraph = {
            nodes: dbDoc.nodes.map((n: any) => ({ id: n.id, label: n.label, type: n.type, description: n.description })),
            edges: dbDoc.edges.map((e: any) => ({ source: e.source, target: e.target, relation: e.relation, description: e.description })),
          }
          foundInDb = true

          // Backfill missing content bytes if knowledge graph already exists
          if (!dbDoc.content) {
            try {
              await docModel.updateOne(
                { _id: dbDoc._id },
                { $set: { content: file.base64Content } }
              )
              console.log(`[RAG-Backend] 💾 Backfilled missing content bytes in database for ${file.name}`)
            } catch (dbErr: any) {
              console.error(`[RAG-Backend] Failed to backfill content:`, dbErr?.message)
            }
          }
        }
      }

      if (!foundInDb) {
        console.log(`[RAG-Backend] 🔍 Generating new Knowledge Graph for ${file.name}...`)
        // Use smaller chunks + fast 8B model for graph extraction (3-4x faster)
        const graphSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 3000, chunkOverlap: 200 })
        const graphChunks = await graphSplitter.splitDocuments([
          new Document({
            pageContent: safeText,
            metadata: { source: file.name, fileType, uploadedAt: new Date().toISOString() },
          }),
        ])

        const chunkGraphs: any[] = []
        const BATCH_SIZE = 3
        const MAX_BATCHES = 2 // max 6 chunks = covers most documents well
        
        for (let i = 0; i < graphChunks.length; i += BATCH_SIZE) {
          if (i >= MAX_BATCHES * BATCH_SIZE) break
          const batch = graphChunks.slice(i, i + BATCH_SIZE)
          const promises = batch.map((chunk) =>
            withFastLlm(async (apiKey, model) => {
              const llm = makeLlm(apiKey, model)
              return extractGraphFromChunk(chunk.pageContent, llm)
            })
          )
          const results = await Promise.all(promises)
          chunkGraphs.push(...results)

          if (i + BATCH_SIZE < graphChunks.length && i < (MAX_BATCHES - 1) * BATCH_SIZE) {
            await new Promise((r) => setTimeout(r, 300)) // reduced from 600ms to 300ms
          }
        }

        fileGraph = consolidateGraphs(chunkGraphs)

        // Save Graph and Content to documind_data Database
        if (dbConnected && docModel) {
          try {
            const existingDoc = await docModel.findOne({ userEmail: email.toLowerCase(), name: file.name })
            await docModel.findOneAndUpdate(
              { userEmail: email.toLowerCase(), name: file.name },
              {
                $set: {
                  id: (existingDoc && existingDoc.id) || Math.random().toString(36).substr(2, 9),
                  size: file.size,
                  type: file.type,
                  url: "",
                  content: file.base64Content,
                  nodes: fileGraph.nodes,
                  edges: fileGraph.edges,
                  uploadedAt: new Date()
                }
              },
              { upsert: true, new: true }
            )
            console.log(`[RAG-Backend] 💾 Saved graph and content bytes to documind_data Database for ${file.name}`)
          } catch (dbErr: any) {
            console.error(`[RAG-Backend] Failed to save graph and content:`, dbErr?.message)
          }
        }
      }

      fileGraphs.push(fileGraph)
    }

    if (allDocs.length === 0)
      return res.status(500).json({ error: "NO_TEXT", message: "Could not extract any text from the document(s)." })

    const sanitizedDocs = allDocs.map(
      (doc) => new Document({ pageContent: String(doc.pageContent), metadata: doc.metadata })
    )

    const fullContext = sanitizedDocs
      .map((d, i) => `--- Document ${i + 1} (${d.metadata.source}) ---\n${d.pageContent}`)
      .join("\n\n")
    const uniqueSources = [...new Set(sanitizedDocs.map((d) => String(d.metadata.source)))]

    // Combine Master Graph
    const masterGraph = consolidateGraphs(fileGraphs)

    // --- Batch prompt template (with citation extraction) ---
    const batchPrompt = ChatPromptTemplate.fromTemplate(`
You are DocuMind AI, an expert document analyst. Provide extremely detailed, highly comprehensive, exhaustive, and well-structured answers to the user's questions based on the document context and structured knowledge graph context below.

Strict rules:
1. If the answer to a question is NOT found in either the document context or the knowledge graph context, use: "This information is not found in the provided document(s)."
2. Do NOT invent or assume information not present in the context.
3. Your answers must be extremely thorough, rich, deeply explanatory, and comprehensive. You MUST write at least 3 to 4 detailed paragraphs explaining the nuances, details, context, and facts. Never write a short summary, simple explanation, or single-sentence answer.
4. Explanations must be structured using multiple substantial paragraphs, detailed bullet points, or lists for high readability.
5. If there are extracted diagrams or visuals listed in the context that match a question's topic (such as diagrams of architectures, processes, graphs, etc.), you MUST render them inline in your answer using their exact Markdown reference format (e.g. ![caption](/extracted_images/...) ) from the diagrams block.
6. If a question explicitly asks to "draw", "visualize", or "show" a diagram or architecture (e.g. LSTM, GRU, neural net gates, etc.) and no corresponding extracted image exists in the context, you MUST draw a beautiful, highly detailed, text-based flowchart using structured ASCII/Unicode box-drawing characters (such as ┌, ┐, └, ┘, ─, │, ▲, ▼, ◄, ►, ⊗, ⊕) to visually illustrate the cell state, gates, and information paths.
7. NEVER say you cannot render diagrams; always generate an ASCII flowchart!
8. After your reasoning, return ONLY a strict JSON array. Each object must have exactly "question", "answer", and "citation" keys. The "citation" field should contain the exact 1-2 sentence quote from the document that most directly supports the answer (or empty string if not found).
9. Do NOT wrap the JSON in markdown code fences. Start your output with [ and end with ].

Document Context:
{context}

{graph_context}

Questions:
{input}

Response:`)

    const answers: any[] = []

    console.log("[RAG-Backend] Executing parallelized per-question QA for absolute depth...")
    const qaPromises = questionsToProcess.map(async (q) => {
      try {
        // Use fast model for seed extraction (saves 70B quota)
        let seeds: string[] = []
        try {
          seeds = await withFastLlm(async (apiKey, model) => {
            const llm = makeLlm(apiKey, model)
            return extractSeedEntities(q, llm)
          })
        } catch { seeds = [] }

        const subgraph = retrieveSubGraph(masterGraph.nodes, masterGraph.edges, seeds, 2)
        const graphContext = formatGraphAsText(subgraph)

        let singleResult: any
        try {
          singleResult = await withKeyModelFallback((apiKey, model) => {
            const ctx = model.includes("70b") || model.includes("versatile")
              ? fullContext.slice(0, 12000)
              : fullContext.slice(0, 6000)
            return askSingleQuestion(makeLlm(apiKey, model), ctx, graphContext, q, uniqueSources)
          })
        } catch (groqSingleErr: any) {
          // All Groq keys exhausted for this question — use OpenRouter
          console.log(`[RAG] 🌐 Groq exhausted for Q: "${q}" — using OpenRouter...`)
          const orPrompt = `You are DocuMind AI. Provide an extremely detailed, comprehensive, deep multi-paragraph answer (at least 3-4 paragraphs explaining nuances, context, and facts) using ONLY the document context below. Do not summarize or shorten.
If the answer is not in the context, say: "This information is not found in the provided document(s)."
Return a JSON object: {"answer":"...","citation":"..."} — no markdown, just JSON.

Document Context:
${fullContext.slice(0, 5000)}

${graphContext ? `Knowledge Graph:\n${graphContext.slice(0, 800)}\n` : ""}

Question: ${q}

JSON:`
          try {
            const orText = await askOpenRouter(orPrompt)
            const start = orText.indexOf("{"), end = orText.lastIndexOf("}")
            const parsed = JSON.parse(start !== -1 ? orText.substring(start, end + 1) : orText)
            const answerText = String(parsed.answer || "")
            const notFound = answerText.toLowerCase().includes("not found in the provided")
            singleResult = {
              answer: answerText,
              citation: parsed.citation || "",
              confidence: notFound ? 0 : 85,
              sources: notFound ? [] : uniqueSources,
              foundInDocument: !notFound,
            }
          } catch (orErr: any) {
            console.error(`[RAG] OpenRouter also failed for Q: "${q}":`, orErr?.message)
            throw orErr
          }
        }

        return { question: q, ...singleResult }
      } catch (singleErr: any) {
        console.error(`[RAG-Backend] Single QA failed for Q: "${q}":`, singleErr?.message?.slice(0, 100))
        return {
          question: q,
          answer: "⚠️ All AI providers are temporarily busy. Please wait a moment and try again — your document is ready.",
          confidence: 0,
          sources: [],
          foundInDocument: false,
        }
      }
    })

    const results = await Promise.all(qaPromises)
    answers.push(...results)

    // Save Q&A history logs to documind_data Database!
    if (dbConnected && questionModel) {
      try {
        const documentNames = files.map((f: any) => f.name)
        const qaLogs = answers.map((ans: any) => ({
          userEmail: email.toLowerCase(),
          id: Math.random().toString(36).substr(2, 9),
          text: ans.question,
          answer: ans.answer,
          citation: ans.citation || "",
          confidence: ans.confidence,
          sources: ans.sources,
          documentName: documentNames.join(", "),
          foundInDocument: ans.foundInDocument,
          timestamp: new Date()
        }))
        await questionModel.insertMany(qaLogs)
        console.log(`[RAG-Backend] 💾 Logged ${qaLogs.length} Q&A items to documind_data Database`)

        // Audit log: QUERY_ANALYZED
        try {
          const dataConn2 = await connectToDataDatabase()
          const LogModel = dataConn2.model("ActivityLog")
          await LogModel.create({ 
            userEmail: email.toLowerCase(), 
            action: "QUERY_ANALYZED", 
            details: `Analyzed ${questionsToProcess.length} question(s) on: ${documentNames.join(", ")}` 
          })
        } catch (e) {}
      } catch (logErr: any) {
        console.error("[RAG-Backend] Failed to save Q&A logs:", logErr?.message)
      }
    }

    return res.json({ success: true, answers })
  } catch (error: any) {
    console.error("[RAG-Backend] Critical route failure:", error?.message?.slice(0, 200))
    const msg = error?.message || ""
    const is429 = msg.includes("429") || msg.includes("rate_limit") || msg.includes("quota")
    if (is429) {
      return res.status(429).json({ error: "RATE_LIMIT", message: "AI services are busy. Please try again in a moment." })
    }
    return res.status(500).json({ error: msg || "Internal server error" })
  }
})

// Start server listening
app.listen(PORT, () => {
  console.log(`[Backend] 🚀 Server running successfully on http://localhost:${PORT}`)
})
