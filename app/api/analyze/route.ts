import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { PineconeStore } from "@langchain/pinecone"
import { ChatPromptTemplate } from "@langchain/core/prompts"
import { Document } from "@langchain/core/documents"
import { Pinecone } from "@pinecone-database/pinecone"
import { createStuffDocumentsChain } from "langchain/chains/combine_documents"
import { createRetrievalChain } from "langchain/chains/retrieval"
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import mammoth from "mammoth"

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParseModule = require("pdf-parse");

// Force Node.js runtime
export const runtime = "nodejs"

// --- Priority-ordered list of models to try (most capable first) ---
const GEMINI_MODEL_PRIORITY = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite-001",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro",
]

// --- In-memory cache: remember the last working key+model so we skip re-probing ---
// Resets when the server restarts (which is fine — quota also resets daily)
let cachedKeyIndex = 0        // index into getAllApiKeys()
let cachedModelIndex = 0      // index into GEMINI_MODEL_PRIORITY

// --- Dynamically collect all configured API keys (KEY, KEY_2, KEY_3, ..., KEY_10) ---
function getAllApiKeys(): string[] {
  const keys: string[] = []
  const base = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (base && base.trim()) keys.push(base.trim())
  for (let n = 2; n <= 10; n++) {
    const val = process.env[`GOOGLE_GENERATIVE_AI_API_KEY_${n}`]
    if (val && val.trim() && !val.includes("your_")) keys.push(val.trim())
  }
  return keys
}

// --- Try every key×model combination starting from the cached position ---
// No ping — we attempt the REAL call directly. Caller passes a factory
// that takes (apiKey, model) and returns a Promise<T> with the actual work.
async function withKeyModelFallback<T>(
  factory: (apiKey: string, model: string) => Promise<T>
): Promise<T> {
  const keys = getAllApiKeys()
  if (keys.length === 0) throw new Error("NO_API_KEY_CONFIGURED")

  const totalKeys   = keys.length
  const totalModels = GEMINI_MODEL_PRIORITY.length

  // Build a flat ordered list starting from the cached position
  // so we don't waste calls on known-good combos we've already validated
  for (let ki = 0; ki < totalKeys; ki++) {
    const keyIdx = (cachedKeyIndex + ki) % totalKeys
    const apiKey = keys[keyIdx]

    const modelStart = ki === 0 ? cachedModelIndex : 0
    for (let mi = modelStart; mi < totalModels; mi++) {
      const model = GEMINI_MODEL_PRIORITY[mi]
      try {
        console.log(`[RAG] Attempting key ${keyIdx + 1}/${totalKeys} model: ${model}`)
        const result = await factory(apiKey, model)
        // ✅ Success — cache this position for next request
        cachedKeyIndex   = keyIdx
        cachedModelIndex = mi
        console.log(`[RAG] ✅ Success with key ${keyIdx + 1}, model: ${model}`)
        return result
      } catch (err: any) {
        const msg = err?.message || ""
        const is429   = msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")
        const is404   = msg.includes("404") || msg.includes("not found") || msg.includes("MODEL_NOT_FOUND")
        if (is429 || is404) {
          console.log(`[RAG] ⚠️ key ${keyIdx + 1} model ${model} rejected (${is429 ? "quota" : "404"}), trying next...`)
          continue
        }
        // Non-quota error (network, auth, parse) — propagate immediately
        throw err
      }
    }
    console.log(`[RAG] Key ${keyIdx + 1} fully exhausted across all models, trying next key...`)
  }

  // Advance cache past the first key so next request starts fresh on key 2
  cachedKeyIndex   = (cachedKeyIndex + 1) % totalKeys
  cachedModelIndex = 0
  throw new Error("ALL_KEYS_AND_MODELS_QUOTA_EXCEEDED")
}


// --- Retry helper with exponential backoff for 429 errors ---
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 2000
): Promise<T> {
  let lastError: any
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastError = err
      const is429 = err?.message?.includes("429") || err?.status === 429
      if (!is429 || attempt === maxRetries) throw err
      const delay = baseDelayMs * Math.pow(2, attempt)
      console.log(`[RAG] 429 rate limit, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}

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

// --- Generic file text extractor ---
async function extractTextFromFile(file: File): Promise<{ text: string; fileType: string }> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const name = file.name.toLowerCase()

  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const text = await extractPdfText(buffer)
    return { text, fileType: "pdf" }
  } else if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer })
    return { text: String(result?.value ?? ""), fileType: "docx" }
  } else {
    return { text: buffer.toString("utf-8"), fileType: "txt" }
  }
}

// --- Single-question LLM fallback (used when batch JSON parse fails) ---
async function askSingleQuestion(
  llm: ChatGoogleGenerativeAI,
  fullContext: string,
  question: string,
  sources: string[]
): Promise<{ answer: string; foundInDocument: boolean; confidence: number; sources: string[] }> {
  const singlePrompt = ChatPromptTemplate.fromTemplate(`
You are DocuMind AI, an expert document analyst. Answer the question based ONLY on the provided document context.

Rules:
1. If the answer is NOT in the context, say exactly: "This information is not found in the provided document(s)."
2. Do NOT make up information. Be concise and accurate.
3. Do NOT include <thinking> tags or JSON in your response. Just give a plain text answer.

Context:
{context}

Question: {input}

Answer:`)

  const chain = singlePrompt.pipe(llm)
  const result = await withRetry(() => chain.invoke({ context: fullContext, input: question }))
  const answerText = String(result.content ?? "").replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim()
  const notFound = answerText.toLowerCase().includes("not found in the provided")
  return {
    answer: answerText,
    foundInDocument: !notFound,
    confidence: notFound ? 0 : 90,
    sources: notFound ? [] : sources,
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll("files") as File[]
    const question = formData.get("question") as string | null
    const questionsJson = formData.get("questions") as string | null

    let questionsToProcess: string[] = []
    if (questionsJson) {
      questionsToProcess = JSON.parse(questionsJson)
    } else if (question) {
      questionsToProcess = [question]
    }

    console.log("[RAG] Files received:", files.length, "Questions to process:", questionsToProcess.length)

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 })
    }
    if (questionsToProcess.length === 0) {
      return NextResponse.json({ error: "No questions provided" }, { status: 400 })
    }

    // --- 1. Extract text and Split (Once for all questions) ---
    const allDocs: Document[] = []
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 100000, chunkOverlap: 2000 })

    for (const file of files) {
      console.log("[RAG] Processing file:", file.name)
      const { text, fileType } = await extractTextFromFile(file)
      const safeText = String(text ?? "").trim()

      if (safeText) {
        const chunks = await splitter.splitDocuments([
          new Document({
            pageContent: safeText,
            metadata: { source: file.name, fileType, uploadedAt: new Date().toISOString() },
          }),
        ])
        allDocs.push(...chunks)
      }
    }

    if (allDocs.length === 0) {
      return NextResponse.json({
        error: "NO_TEXT",
        message: "Could not extract any text from the document(s).",
      })
    }

    const sanitizedDocs = allDocs.map(
      (doc) => new Document({ pageContent: String(doc.pageContent), metadata: doc.metadata })
    )

    // --- 2. Key+model selection is handled lazily inside withKeyModelFallback ---
    // No probe needed — we attempt the real call directly and fall back on 429/404.
    const keys = getAllApiKeys()
    if (keys.length === 0) throw new Error("NO_API_KEY_CONFIGURED")
    console.log(`[RAG] ${keys.length} API key(s) available, will attempt directly...`)

    // Helper: build an LLM instance for a given key+model
    const makeLlm = (apiKey: string, model: string) => new ChatGoogleGenerativeAI({
      apiKey,
      model,
      temperature: 0.2,
      maxRetries: 0, // we handle retries ourselves via withKeyModelFallback
    })

    const singlePrompt = ChatPromptTemplate.fromTemplate(`
You are DocuMind AI, an expert document analyst. You are provided with the complete contents of the user's uploaded document(s) below.

Your goal is to answer the user's question with absolute precision and accuracy based ONLY on the provided text.

Follow these strict rules:
1. REASONING: First, you MUST silently "think" by extracting the exact quotes and facts needed from the context. Wrap this extraction phase inside <thinking> ... </thinking> tags.
2. VALIDATION: If the necessary information to answer the question is NOT present anywhere in the context, your final answer MUST be exactly: "This information is not found in the provided document(s)." Do NOT make up information.
3. FINAL ANSWER: After your thinking block, provide a clear, concise, and highly accurate answer. If relevant, reference the context.

Context:
{context}

Question: {input}

Answer:`)

    // --- 3. Setup Vector Store OR Direct Context RAG ---
    const pineconeApiKey = process.env.PINECONE_API_KEY
    const pineconeIndex = process.env.PINECONE_INDEX
    const isPineconeConfigured = pineconeApiKey && pineconeIndex && pineconeApiKey !== "your_pinecone_api_key_here"

    const answers = []

    if (isPineconeConfigured) {
      console.log("[RAG] Pinecone configured, using Vector Store RAG...")

      for (let i = 0; i < questionsToProcess.length; i++) {
        const q = questionsToProcess[i]
        const answer = await withKeyModelFallback(async (apiKey, model) => {
          const embeddings = new GoogleGenerativeAIEmbeddings({
            apiKey,
            modelName: "gemini-embedding-001",
            maxRetries: 2,
          })
          const pinecone = new Pinecone({ apiKey: pineconeApiKey! })
          const index = pinecone.Index(pineconeIndex!)
          const vectorStore = await PineconeStore.fromDocuments(sanitizedDocs, embeddings, { pineconeIndex: index })
          const retriever = vectorStore.asRetriever({ k: 6 })
          const llm = makeLlm(apiKey, model)
          const documentChain = await createStuffDocumentsChain({ llm, prompt: singlePrompt })
          const retrievalChain = await createRetrievalChain({ retriever, combineDocsChain: documentChain })
          return retrievalChain.invoke({ input: q })
        })
        const answerText = String(answer.answer ?? "").trim()
        const sources = [...new Set((answer.context as any[] | undefined)?.map((d: any) => d.metadata?.source).filter(Boolean) ?? [])]
        const notFound = answerText.toLowerCase().includes("not found in the provided")
        answers.push({ question: q, answer: answerText, confidence: notFound ? 0 : 90, sources, foundInDocument: !notFound })
        if (i < questionsToProcess.length - 1) await new Promise(r => setTimeout(r, 1500))
      }
    } else {
      // --- Long Context Direct RAG (No Embeddings) ---
      console.log("[RAG] Using Long Context Direct RAG (No Embeddings)...")
      const fullContext = sanitizedDocs.map((d, i) => `--- Document ${i+1} (${d.metadata.source}) ---\n${d.pageContent}`).join("\n\n")
      const uniqueSources = [...new Set(sanitizedDocs.map(d => String(d.metadata.source)))]

      // --- Attempt batch JSON response ---
      const batchPrompt = ChatPromptTemplate.fromTemplate(`
You are DocuMind AI, an expert document analyst. You are provided with the complete contents of the user's uploaded document(s) below.

Your goal is to answer the user's questions with absolute precision and accuracy based ONLY on the provided text.

Follow these strict rules:
1. REASONING: First, silently "think" by extracting the exact quotes and facts needed from the context. Wrap your extraction phase inside <thinking> ... </thinking> tags.
2. VALIDATION: If the necessary information to answer a question is NOT present anywhere in the context, your final answer for that question MUST be exactly: "This information is not found in the provided document(s)." Do NOT make up information.
3. OUTPUT FORMAT: After the thinking block, return a strict JSON array of objects. Each object must have exactly two keys: "question" (the original question string) and "answer" (the string answer). Do NOT wrap the JSON array in markdown formatting (like \`\`\`json). The output must start with [ and end with ]. Do not include any text before or after the JSON array.

Context:
{context}

Questions to answer:
{input}

Response:`)

      let batchSucceeded = false

      try {
        const questionsList = questionsToProcess.map((q, i) => `${i + 1}. ${q}`).join("\n")
        console.log("[RAG] Invoking Batched LLM for questions:", questionsToProcess.length)

        const result = await withKeyModelFallback(async (apiKey, model) => {
          const llm = makeLlm(apiKey, model)
          const batchChain = batchPrompt.pipe(llm)
          return batchChain.invoke({ context: fullContext, input: questionsList })
        })

        let responseText = String(result.content ?? "").trim()
        responseText = responseText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim()
        const jsonStart = responseText.indexOf("[")
        const jsonEnd = responseText.lastIndexOf("]")
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          responseText = responseText.substring(jsonStart, jsonEnd + 1)
        }

        const jsonResults = JSON.parse(responseText)
        if (!Array.isArray(jsonResults)) throw new Error("Batched response is not an array")

        for (const item of jsonResults) {
          const answerText = String(item.answer || "")
          const q = questionsToProcess.find(orig =>
            orig.toLowerCase().includes((item.question || "").toLowerCase().slice(0, 20)) ||
            (item.question || "").toLowerCase().includes(orig.toLowerCase().slice(0, 20))
          ) || item.question || "Unknown Question"
          const notFound = answerText.toLowerCase().includes("not found in the provided")
          answers.push({
            question: q,
            answer: answerText,
            confidence: notFound ? 0 : 90,
            sources: notFound ? [] : uniqueSources,
            foundInDocument: !notFound,
          })
        }
        batchSucceeded = answers.length === questionsToProcess.length
        console.log("[RAG] Batch parse succeeded, got", answers.length, "answers")
      } catch (batchErr: any) {
        console.warn("[RAG] Batch JSON parse failed, falling back to per-question mode:", batchErr?.message?.slice(0, 100))
        batchSucceeded = false
      }

      // --- Fallback: ask each question individually if batch failed or answer count mismatch ---
      if (!batchSucceeded) {
        console.log("[RAG] Running per-question fallback mode for", questionsToProcess.length, "question(s)...")
        answers.length = 0 // clear any partial results

        for (let i = 0; i < questionsToProcess.length; i++) {
          const q = questionsToProcess[i]
          try {
            const singleResult = await withKeyModelFallback((apiKey, model) =>
              askSingleQuestion(makeLlm(apiKey, model), fullContext, q, uniqueSources)
            )
            answers.push({ question: q, ...singleResult })
          } catch (singleErr: any) {
            console.error(`[RAG] Per-question fallback failed for Q${i + 1}:`, singleErr?.message?.slice(0, 100))
            answers.push({
              question: q,
              answer: "Failed to get an answer for this question. Please try again.",
              confidence: 0,
              sources: [],
              foundInDocument: false,
            })
          }
          if (i < questionsToProcess.length - 1) await new Promise(r => setTimeout(r, 1500))
        }
        console.log("[RAG] Per-question fallback complete, got", answers.length, "answers")
      }
    }

    return NextResponse.json({ success: true, answers })

  } catch (error: any) {
    console.error("[RAG] Error:", error?.message?.slice(0, 200))

    const msg = error?.message || ""
    const isAllKeyExhausted = msg.includes("ALL_KEYS_AND_MODELS_QUOTA_EXCEEDED")
    const isAllExhausted = msg.includes("ALL_MODELS_QUOTA_EXCEEDED") || isAllKeyExhausted
    const is429 = msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("quota")
    const noKey = msg.includes("NO_API_KEY_CONFIGURED")

    // Calculate next midnight Pacific Time for quota reset hint
    const nowPacific = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
    const nextMidnight = new Date(nowPacific)
    nextMidnight.setDate(nextMidnight.getDate() + 1)
    nextMidnight.setHours(0, 0, 0, 0)
    const secondsUntilReset = Math.ceil((nextMidnight.getTime() - nowPacific.getTime()) / 1000)

    if (noKey) {
      return NextResponse.json({
        error: "NO_API_KEY",
        message: "No Google API Key configured. Please add GOOGLE_GENERATIVE_AI_API_KEY to your .env.local file.",
      }, { status: 500 })
    }

    if (isAllExhausted) {
      return NextResponse.json({
        error: "RATE_LIMIT",
        allExhausted: true,
        message: "All AI models across all API keys have hit their daily free-tier quota. Please wait until midnight (Pacific Time) for quota reset.",
        retryAfterSeconds: secondsUntilReset,
      }, { status: 429 })
    }

    if (is429) {
      const retryMatch = msg.match(/(\d+(?:\.\d+)?)s/)
      const waitSecs = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 60
      return NextResponse.json({
        error: "RATE_LIMIT",
        allExhausted: false,
        message: `The AI API is rate-limited. Please wait ${waitSecs} seconds and try again.`,
        retryAfterSeconds: waitSecs,
      }, { status: 429 })
    }

    return NextResponse.json({ error: msg || "Internal server error" }, { status: 500 })
  }
}
