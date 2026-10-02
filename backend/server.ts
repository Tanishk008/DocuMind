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

// Load env variables. Checked in order: next to this file (ts-node dev), the working
// directory (compiled `dist/` start), then a plain .env. dotenv never overwrites values that
// are already set, so real platform env vars (Render, etc.) always take precedence.
dotenv.config({ path: path.resolve(__dirname, ".env.local") })
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })
dotenv.config()

import * as db from "./lib/db"
import { TrustedExecutionEnvironment } from "./lib/tee"
import { uploadExtractedImage, ownerPrefix } from "./lib/storage"
import {
  extractGraphFromChunk,
  consolidateGraphs,
  extractSeedEntities,
  retrieveSubGraph,
  formatGraphAsText,
} from "./lib/graphrag"

// Generic file extractors (same as route.ts)
import mammoth from "mammoth"
const pdfParseModule = require("pdf-parse")
// @ts-ignore
const Tesseract = require("tesseract.js")

// --- PDF Text Extraction ---
interface PdfPage { num: number; text: string }

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pages: PdfPage[] }> {
  let extractedText = ""
  let pages: PdfPage[] = []
  try {
    if (pdfParseModule.PDFParse) {
      const parser = new pdfParseModule.PDFParse({ data: buffer })
      const data = await parser.getText()
      extractedText = String(data?.text ?? "")
      pages = Array.isArray(data?.pages) ? data.pages.map((p: any) => ({ num: p.num, text: String(p.text ?? "") })) : []
    } else {
      const pdfParse = (pdfParseModule.default || pdfParseModule) as (buffer: Buffer) => Promise<{ text: string }>
      const data = await pdfParse(buffer)
      extractedText = String(data?.text ?? "")
    }
  } catch (e: any) {
    console.warn("[OCR] pdf-parse failed:", e?.message)
  }

  // If we got very little text, the PDF is likely scanned — use OCR
  const cleanedPreview = extractedText.replace(/\s+/g, " ").trim()
  if (cleanedPreview.length < 150) {
    console.log("[OCR] PDF appears to be scanned (< 150 chars extracted). Running Tesseract OCR...")
    try {
      // Extract JPEG images from the PDF buffer and OCR each one
      const jpegBuffers = extractJpegBuffersFromPdf(buffer)
      if (jpegBuffers.length > 0) {
        const ocrResults: string[] = []
        for (const jpegBuf of jpegBuffers.slice(0, 10)) { // max 10 pages
          try {
            const { data: { text } } = await Tesseract.recognize(jpegBuf, "eng+hin", { logger: () => {} })
            if (text && text.trim().length > 10) ocrResults.push(text.trim())
          } catch { /* skip page */ }
        }
        if (ocrResults.length > 0) {
          console.log(`[OCR] Tesseract extracted text from ${ocrResults.length} page(s)`)
          extractedText = ocrResults.join("\n\n")
          // OCR page order roughly follows extraction order but isn't a verified page mapping —
          // safer to drop stale pdf-parse page numbers than pair them with the wrong page text.
          pages = []
        }
      }
    } catch (ocrErr: any) {
      console.error("[OCR] Tesseract OCR failed:", ocrErr?.message)
    }
  }

  return { text: extractedText, pages }
}

// Extract raw JPEG buffers from a PDF (for OCR) — reuses the stream parser logic
function extractJpegBuffersFromPdf(buffer: Buffer): Buffer[] {
  const buffers: Buffer[] = []
  let pos = 0
  try {
    while (true) {
      const headerIndex = buffer.indexOf("/Subtype /Image", pos)
      if (headerIndex === -1) break
      const streamStart = buffer.indexOf("stream", headerIndex)
      if (streamStart === -1) { pos = headerIndex + 15; continue }
      const headerArea = buffer.slice(headerIndex, streamStart).toString("utf-8")
      const isJpeg = headerArea.includes("/DCTDecode") || headerArea.includes("/DCT")
      if (!isJpeg) { pos = streamStart + 6; continue }
      let dataStart = streamStart + 6
      if (buffer[dataStart] === 13) dataStart++
      if (buffer[dataStart] === 10) dataStart++
      const endstream = buffer.indexOf("endstream", dataStart)
      if (endstream === -1) { pos = dataStart; continue }
      const jpegData = buffer.slice(dataStart, endstream)
      if (jpegData.length > 1000) buffers.push(jpegData)
      pos = endstream + 9
    }
  } catch { /* ignore */ }
  return buffers
}


/**
 * Detects and removes garbled legacy-encoded text (Krutidev/ISCII) from PDFs.
 * Legacy Hindi PDFs store Devanagari as ASCII-range byte mappings which pdf-parse
 * reads as random Latin characters (e.g. "vf/klwfpr uxj ikfydk" instead of real text).
 * We detect "word runs" that are pure ASCII-printable but statistically improbable
 * (no vowels pattern, high consonant density typical of transliterated Devanagari)
 * and strip those lines, keeping proper Unicode text intact.
 */
function cleanExtractedText(rawText: string): string {
  const lines = rawText.split("\n")
  const cleanLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      cleanLines.push("")
      continue
    }

    // Check if line contains proper Unicode (Devanagari U+0900-U+097F, Latin, digits, punctuation)
    const hasDevanagari = /[\u0900-\u097F]/.test(trimmed)
    const hasLatinWords = /[a-zA-Z]{3,}/.test(trimmed)

    if (hasDevanagari) {
      // Line has real Unicode Devanagari — keep it, but strip any garbled ASCII tokens mixed in
      // Garbled tokens look like: sequences of lowercase letters with no vowels (a,e,i,o,u) 3+ chars
      const cleaned = trimmed.replace(/\b[^\saeiouAEIOU\u0900-\u097F\d.,!?:;"'()\-]{4,}\b/g, "")
      cleanLines.push(cleaned.trim())
    } else if (hasLatinWords) {
      // Pure Latin line — check if it looks like garbled Krutidev encoding
      // Krutidev-garbled text has these signatures:
      // 1. Very few or no vowels relative to consonants
      // 2. Many consecutive consonants (lf, kf, xj, xZ, etc.)
      // 3. Weird combos like 'vUrxZr', 'ikfydk', 'lkFk'
      const words = trimmed.split(/\s+/)
      const garbledWordCount = words.filter(w => {
        if (w.length < 3) return false
        // Krutidev signature: consonant clusters, 'x', 'Z', 'k' heavy, no common English words
        const consonantRatio = (w.match(/[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/g) || []).length / w.length
        const hasKrutidevMarkers = /[xZfkF]{1}[a-z]{1,2}[xZfkF]/.test(w) || /^[vl][A-Z]/.test(w)
        return consonantRatio > 0.65 || hasKrutidevMarkers
      }).length

      const garbledRatio = words.length > 0 ? garbledWordCount / words.length : 0

      if (garbledRatio > 0.5) {
        // More than half the words look like Krutidev garbage — skip this line
        console.log(`[TextClean] Skipping garbled legacy-encoded line: "${trimmed.slice(0, 60)}..."`) 
        continue
      } else {
        cleanLines.push(trimmed)
      }
    } else {
      cleanLines.push(trimmed)
    }
  }

  return cleanLines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

// --- Raw PDF Image Stream Parser (Highly optimized JPEG extractor) ---
async function extractJpegsFromPdfBuffer(buffer: Buffer, storagePrefix: string): Promise<string[]> {
  const imageUrls: string[] = []
  let index = 0
  let pos = 0

  try {
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
        const publicUrl = await uploadExtractedImage({
          objectPath: `${storagePrefix}/${filename}`,
          data: jpegData,
          contentType: "image/jpeg",
        })

        if (publicUrl) {
          imageUrls.push(publicUrl)
          console.log(`[ImageRAG] 📸 Extracted PDF JPEG image: ${filename} (${jpegData.length} bytes)`)
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
  storagePrefix: string
): Promise<{ text: string; imageUrls: string[] }> {
  let imageCounter = 0
  const imageUrls: string[] = []

  try {
    const convertImage = mammoth.images.imgElement((element) => {
      imageCounter++
      const ext = element.contentType.split("/")[1] || "png"
      const filename = `image_${imageCounter}.${ext}`
      const alt = `extracted_diagram_${imageCounter}`

      return element.read().then(async (imageBuffer: Buffer) => {
        const publicUrl = await uploadExtractedImage({
          objectPath: `${storagePrefix}/${filename}`,
          data: imageBuffer,
          contentType: element.contentType || "image/png",
        })

        if (publicUrl) {
          imageUrls.push(publicUrl)
          console.log(`[ImageRAG] 📸 Extracted DOCX image: ${filename} (${imageBuffer.length} bytes)`)
        }

        // An empty src keeps mammoth happy when the upload failed; the <img> is stripped
        // out of the markdown below because no URL was recorded for it.
        return { src: publicUrl || "", alt }
      })
    })

    const result = await mammoth.convertToHtml({ buffer }, { convertImage })
    const html = result.value || ""

    const textWithMarkdownImages = html
      .replace(/<img\s+[^>]*src="([^"]+)"[^>]*alt="([^"]+)"[^>]*\/?>/g, " ![$2]($1) ")
      .replace(/<img\s+[^>]*alt="([^"]+)"[^>]*src="([^"]+)"[^>]*\/?>/g, " ![$1]($2) ")
      // Drop images whose upload failed — they carry an empty src and would otherwise
      // reach the model as a broken ![alt]() reference.
      .replace(/!\[[^\]]*\]\(\s*\)/g, " ")
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
// `ownerEmail` scopes extracted figures to their uploader in object storage. Callers that
// only need the text (summaries, suggested questions, tags) can omit it.
async function extractTextFromFile(
  file: any,
  ownerEmail?: string
): Promise<{ text: string; fileType: string; imageUrls: string[]; pages: PdfPage[] }> {
  const rawData = await file.arrayBuffer()
  // Multer files hand us a raw Node Buffer here (not a real ArrayBuffer);
  // re-wrapping it with Buffer.from() can shift offsets and corrupt binary
  // data such as PDF streams, so pass it through untouched when possible.
  const buffer = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData)
  const name = file.name.toLowerCase()
  const docNameClean = file.name.replace(/[^a-zA-Z0-9]/g, "_")

  // Images live in Supabase Storage so that the Vercel frontend can load them from a URL
  // that doesn't depend on the backend's (ephemeral) local disk.
  const storagePrefix = `${ownerPrefix(ownerEmail)}/${docNameClean}`

  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const { text: rawText, pages } = await extractPdfText(buffer)
    const text = cleanExtractedText(rawText)
    const imageUrls = await extractJpegsFromPdfBuffer(buffer, storagePrefix)
    return { text, fileType: "pdf", imageUrls, pages }
  } else if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const { text, imageUrls } = await extractDocxTextAndImages(buffer, storagePrefix)
    return { text, fileType: "docx", imageUrls, pages: [] }
  } else {
    return { text: buffer.toString("utf-8"), fileType: "txt", imageUrls: [], pages: [] }
  }
}

// --- Groq key falling mechanism ---
// For fast tasks (graph extraction, summarization, suggestions) — use fastest available
// NOTE: "qwen/qwen3.8-27b" is not a real Groq model id (no such version exists — the current
// Qwen model on Groq is qwen3.6-27b); it was silently failing every call before falling
// through to the next model/key. Fixed to point at the real model.
const GROQ_FAST_MODEL = "llama-3.1-8b-instant"
// For accurate tasks (Q&A analysis) — use best available.
// Both models below support ~131K token context windows on Groq.
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

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi (हिंदी)",
  bn: "Bengali (বাংলা)",
  mr: "Marathi (मराठी)",
}

const STOPWORDS = new Set([
  "the", "is", "at", "which", "on", "a", "an", "and", "or", "of", "to", "in", "for", "with",
  "by", "this", "that", "it", "as", "are", "was", "were", "be", "been", "from", "has", "have",
  "had", "its", "their", "they", "them", "what", "when", "where", "who", "whom", "why", "how",
  "can", "will", "would", "should", "could", "do", "does", "did", "not", "no", "but", "so", "you",
  "your", "please", "tell", "me", "about", "document", "explain",
])

function extractKeywords(question: string): string[] {
  return Array.from(new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  ))
}

// Groups text into ~targetSize chunks without cutting mid-sentence, by accumulating
// sentences (split on sentence-ending punctuation or blank lines) until the next one
// would overflow the target size. Keeps chunks self-contained for relevance scoring.
function splitIntoChunks(fullText: string, targetSize: number): string[] {
  const sentences = fullText.split(/(?<=[.!?।॥\n])\s+/).filter(Boolean)
  const chunks: string[] = []
  let current = ""
  for (const sentence of sentences) {
    if (current.length > 0 && current.length + sentence.length > targetSize) {
      chunks.push(current)
      current = sentence
    } else {
      current += (current ? " " : "") + sentence
    }
  }
  if (current) chunks.push(current)
  return chunks.length > 0 ? chunks : [fullText]
}

// Picks the parts of a (possibly very long) document that are actually relevant to the
// question instead of blindly truncating from the start — a plain prefix slice silently
// drops any content past the cutoff, so questions about later sections of a document would
// incorrectly come back as "not found" even though the answer is present further down.
// Chunks are sentence-aware (no mid-sentence cuts) and scored with a TF-IDF-style weight so
// a keyword repeated throughout the whole document (e.g. filler boilerplate) doesn't drown
// out a chunk where a rarer, more specific keyword actually appears.
function selectRelevantContext(fullText: string, question: string, maxChars: number): string {
  if (fullText.length <= maxChars) return fullText

  const keywords = extractKeywords(question)
  const chunkTexts = splitIntoChunks(fullText, 1500)
  const chunks = chunkTexts.map((text, index) => ({ text, index, score: 0 }))

  if (keywords.length === 0) {
    return fullText.slice(0, maxChars)
  }

  // Document frequency per keyword, for inverse-document-frequency weighting
  const docFreq: Record<string, number> = {}
  for (const kw of keywords) {
    docFreq[kw] = chunks.filter((c) => c.text.toLowerCase().includes(kw)).length
  }

  for (const c of chunks) {
    const lower = c.text.toLowerCase()
    let score = 0
    for (const kw of keywords) {
      let termFreq = 0
      let pos = 0
      while ((pos = lower.indexOf(kw, pos)) !== -1) {
        termFreq++
        pos += kw.length
      }
      if (termFreq === 0) continue
      const idf = Math.log(1 + chunks.length / (1 + docFreq[kw]))
      score += termFreq * idf
    }
    c.score = score
  }

  // No keyword matched anywhere (e.g. a generic "summarize this" style question) —
  // fall back to the original head-of-document behavior rather than a random selection.
  if (chunks.every((c) => c.score === 0)) {
    return fullText.slice(0, maxChars)
  }

  const byScore = [...chunks].sort((a, b) => b.score - a.score)
  const selected = new Set<number>([0]) // always keep the opening chunk for baseline context
  let used = chunks[0]?.text.length || 0

  for (const c of byScore) {
    if (used >= maxChars) break
    if (selected.has(c.index) || c.score === 0) continue
    selected.add(c.index)
    used += c.text.length
  }

  return Array.from(selected)
    .sort((a, b) => a - b)
    .map((i) => chunks[i].text)
    .join("\n...\n")
}

// For tasks that need broad coverage of a whole document rather than relevance to one
// question (summaries, tag/question generation) — samples from the start, middle, and end
// instead of a plain prefix slice, so a 30-page document doesn't get summarized from only
// its first few pages.
function sampleAcrossDocument(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text

  const headLen = Math.floor(maxChars * 0.5)
  const midLen = Math.floor(maxChars * 0.3)
  const tailLen = maxChars - headLen - midLen

  const head = text.slice(0, headLen)
  const midStart = Math.max(headLen, Math.floor(text.length / 2 - midLen / 2))
  const mid = text.slice(midStart, midStart + midLen)
  const tail = text.slice(Math.max(text.length - tailLen, midStart + midLen))

  return `${head}\n...\n${mid}\n...\n${tail}`
}

// Locates which document/page a citation quote actually came from, by fuzzy-matching a
// normalized substring against each page's extracted text. Used to power a "jump to the
// exact page in the document" link on the frontend instead of only citing the document name.
function findCitationPage(
  citation: string,
  docPagesMap: Record<string, PdfPage[]>
): { document: string; page: number } | null {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
  const needle = normalize(citation).slice(0, 120)
  if (needle.length < 15) return null // too short to match reliably

  for (const [docName, pages] of Object.entries(docPagesMap)) {
    for (const page of pages) {
      if (normalize(page.text).includes(needle)) {
        return { document: docName, page: page.num }
      }
    }
  }

  // Fall back to a shorter prefix in case the model paraphrased the quote's tail
  const shortNeedle = needle.slice(0, 60)
  if (shortNeedle.length < 15) return null
  for (const [docName, pages] of Object.entries(docPagesMap)) {
    for (const page of pages) {
      if (normalize(page.text).includes(shortNeedle)) {
        return { document: docName, page: page.num }
      }
    }
  }

  return null
}

async function askSingleQuestion(
  llm: ChatGroq,
  fullContext: string,
  graphContext: string,
  question: string,
  sources: string[],
  answerMode: "concise" | "detailed" = "detailed",
  language: string = "en",
  compareMode: boolean = false
): Promise<{ answer: string; foundInDocument: boolean; confidence: number; sources: string[] }> {
  const langName = LANGUAGE_NAMES[language] || "English"
  const langInstruction = language === "en"
    ? ""
    : `IMPORTANT: You MUST write your entire answer in ${langName}. The question may be in any language — always respond in ${langName} regardless.\n\n`

  const compareInstruction = compareMode
    ? `IMPORTANT — COMPARISON MODE: The document context below contains multiple documents (each marked "--- Document N (name) ---"). You MUST explicitly compare across ALL of them for this question. Structure your answer as a clear side-by-side comparison: use a markdown table where rows are the compared aspects and columns are the document names, OR one clearly-labeled section per document followed by a "Key Differences" summary. Do not answer as if only one document exists.\n\n`
    : ""

  const conciseRules = `
ANSWER MODE: CONCISE — strictly enforced. Follow every rule exactly.
1. If the answer is NOT found in the document context, say exactly: "This information is not found in the provided document(s)."
2. Do NOT make up facts not present in the context.
3. YOUR ENTIRE RESPONSE MUST BE 2 TO 4 SENTENCES MAXIMUM. Absolutely no exceptions.
4. NO bullet points. NO numbered lists. NO headers. NO sub-sections. NO markdown. NO extra explanation.
5. State only the core answer directly. Do not add any background, context, or elaboration.
6. Plain text only — do not output JSON.`

  const detailedRules = `
ANSWER MODE: DETAILED — strictly enforced. Follow every rule exactly.
1. If the answer is NOT found in either the document context or the knowledge graph, say exactly: "This information is not found in the provided document(s)."
2. Do NOT make up or assume any facts not directly present in the context.
3. YOUR ANSWER MUST BE LONG AND COMPREHENSIVE — write a minimum of 4 to 6 full paragraphs. Cover all aspects, nuances, and supporting details thoroughly. A short or medium-length answer is not acceptable.
4. Use rich structure: multiple detailed paragraphs, bullet points with sub-points, numbered steps, and section headers where helpful. Make it educational, thorough, and professional.
5. If the topic involves any process, workflow, system, architecture, or step-by-step procedure, you MUST draw a detailed ASCII/Unicode flowchart or diagram using box-drawing characters (┌ ┐ └ ┘ ─ │ ▲ ▼ ◄ ► → ← ↓ ↑ ┤ ├ ┬ ┴ ┼) to visually represent the structure or flow.
6. If there are extracted diagrams or visuals in the context, render them inline using their exact Markdown reference, copying the image URL character-for-character as it appears in the context. Never invent, shorten or rewrite an image URL.
7. NEVER say you cannot draw diagrams. Always generate a detailed ASCII flowchart when the topic warrants it.
8. Plain text with markdown formatting — do not output JSON.`

  const prompt = ChatPromptTemplate.fromTemplate(
    `You are DocuMind AI, an expert document analyst.\n${langInstruction}${compareInstruction}\n{rules}\n\nDocument Context:\n{context}\n\n{graphContext}\n\nQuestion: {input}\n\nAnswer:`
  )

  const chain = prompt.pipe(llm)
  const result = await chain.invoke({
    context: fullContext,
    graphContext,
    input: question,
    rules: answerMode === "concise" ? conciseRules : detailedRules,
  })
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

// Prefer configuring these via env vars (ADMIN_EMAIL / ADMIN_PASSWORD); the fallback keeps
// existing local setups working without requiring immediate reconfiguration. The important
// part is these never leave the server — the old client-side admin check has been removed.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "documindai008@gmail.com"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Tanishk#1234"

// Requires a valid, non-expired session token for an admin — used to gate admin-only routes
// that previously had no authorization check at all.
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  const session = TrustedExecutionEnvironment.verifySessionToken(token)
  if (!session || session.role !== "admin") {
    return res.status(401).json({ error: "Unauthorized" })
  }
  next()
}

app.get("/", (req, res) => {
  res.send("DocuMind Backend Running");
});

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

// --- 1. SIGNUP ROUTE ---
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    if (email === ADMIN_EMAIL) {
      return res.status(403).json({ error: "Reserved admin email" })
    }

    const existingUser = await db.getUserByEmail(email)
    if (existingUser) {
      return res.status(409).json({ error: "Email already registered" })
    }

    // Secure Hashing via simulated Trusted Execution Environment (TEE)
    const hashedPassword = TrustedExecutionEnvironment.secureHash(password)
    await db.createUser({ email, password: hashedPassword, name })

    const safeUser = await db.getUnifiedUser(email)

    // Audit log: SIGNUP
    try {
      await db.createActivityLog({ userEmail: email, action: "SIGNUP", details: `New account registered: ${name}` })
    } catch (e) {}

    const token = TrustedExecutionEnvironment.issueSessionToken(email, "user")
    return res.status(201).json({ success: true, user: safeUser, token })
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

    if (email === ADMIN_EMAIL) {
      if (password === ADMIN_PASSWORD) {
        const token = TrustedExecutionEnvironment.issueSessionToken(email, "admin")
        return res.json({
          success: true,
          user: { id: "admin", email, name: "Admin", role: "admin" },
          token,
        })
      }
      return res.status(401).json({ error: "Invalid credentials" })
    }

    // Secure Hashing match via TEE
    const hashedPassword = TrustedExecutionEnvironment.secureHash(password)
    let foundUser = await db.getUserByEmail(email)
    if (foundUser && foundUser.password !== hashedPassword) {
      // Legacy support fallback for unhashed passwords
      foundUser = foundUser.password === password ? foundUser : null
    }

    if (!foundUser) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const safeUser = await db.getUnifiedUser(email)

    // Audit log: LOGIN
    try {
      await db.createActivityLog({ userEmail: email, action: "LOGIN", details: "Successful login" })
    } catch (e) {}

    const token = TrustedExecutionEnvironment.issueSessionToken(email, "user")
    return res.json({ success: true, user: safeUser, token })
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

    if (email === ADMIN_EMAIL) {
      return res.json({ success: true, message: "Admin profile dynamically mocked" })
    }

    const updatedUser = await db.updateUser(email, updateFields)

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" })
    }

    const safeUser = await db.getUnifiedUser(email)

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

    const docs = await db.getUserDocuments(email)

    return res.json({
      success: true,
      documents: docs.map((d) => ({
        id: d.doc_id,
        name: d.name,
        size: d.size,
        type: d.type,
        url: d.url,
        content: d.content || "",
        summary: d.summary || "",
        documentType: d.document_type || "General",
        tags: d.tags || [],
        uploadedAt: d.uploaded_at,
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

    // replaceUserDocuments preserves base64 content/graph data/summary/tags for documents
    // that already existed and weren't given new values in this payload.
    const savedDocs = await db.replaceUserDocuments(email, documents)

    // Update storage used
    try {
      await db.updateUser(email, { storageUsed: totalSize })
    } catch (e) {}

    return res.json({
      success: true,
      documents: savedDocs.map((d) => ({
        id: d.doc_id,
        name: d.name,
        size: d.size,
        type: d.type,
        url: d.url,
        content: d.content || "",
        summary: d.summary || "",
        documentType: d.document_type || "General",
        tags: d.tags || [],
        uploadedAt: d.uploaded_at,
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

    const questions = await db.getUserQuestions(email)

    return res.json({
      success: true,
      questions: questions.map((q) => ({
        id: q.q_id,
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

    const savedQuestions = await db.replaceUserQuestions(email, questions)
    await db.updateUser(email, { totalQueries: savedQuestions.length })

    return res.json({
      success: true,
      questions: savedQuestions.map((q) => ({
        id: q.q_id,
        text: q.text,
        timestamp: q.timestamp,
      })),
      totalQueries: savedQuestions.length
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

    if (email === ADMIN_EMAIL) {
      return res.json({ success: true, message: "Ignored metric for admin" })
    }

    await db.incrementUserQueries(email, increment)

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

  // 4. No configuration found, or all configured providers failed to deliver.
  // Log the content for local debugging, but report failure — callers must not tell the
  // user an email was sent when nothing actually went out (this previously masked broken
  // or missing provider credentials as silent "success").
  console.error(`[Email] ⚠️ No email provider succeeded. Content that failed to send:
  ------------------------------------
  From Name: ${fromName}
  To: ${to}
  Subject: ${subject}
  Content: ${text || "HTML Content (Check console log for HTML block)"}
  ------------------------------------`)

  return { success: false, provider: "none" }
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

    if (!result.success) {
      return res.status(502).json({ error: "Failed to send your message. Please try again in a moment." })
    }

    return res.json({
      success: true,
      message: "Email sent successfully",
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

    if (!result.success) {
      otpStore.delete(email.toLowerCase())
      console.error(`[OTP] ❌ Failed to deliver OTP to ${email} — no email provider succeeded`)
      return res.status(502).json({ error: "Failed to send OTP email. Please try again in a moment or contact support." })
    }

    console.log(`[OTP] 📧 Sent OTP ${otp} to ${email} using provider: ${result.provider}`)
    return res.json({
      success: true,
      message: "OTP Email Sent!",
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
    const user = await db.getUserByEmail(email)
    if (!user) {
      return res.status(404).json({ error: "No account registered with this email address." })
    }

    // Hash the password securely via TEE hash
    const hashedPassword = TrustedExecutionEnvironment.secureHash(newPassword)

    // Update password
    await db.updatePassword(email, hashedPassword)

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
    const user = await db.getUserByEmail(email)
    const storageUsed = user?.storage_used || 0
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
    const doc = await db.getDocumentByDocId(email, docId)
    if (!doc) return res.status(404).json({ error: "Document not found" })
    if (!doc.content) return res.status(404).json({ error: "No content stored for this document. Please re-upload." })
    // Return as base64 JSON (small files) or stream raw bytes (large files)
    const contentStr: string = doc.content
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
    await db.updateDocumentTags(email, docId, tags)
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
    const safeText = String(text ?? "").trim()
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
      const result = await chain.invoke({ text: sampleAcrossDocument(safeText, 8000) })
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
        await db.updateDocumentSummary(email, docId, summaryResult, docTypeResult)
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

    const language: string = req.body.language || "en"
    const langName = LANGUAGE_NAMES[language] || "English"
    const langInstruction = language === "en"
      ? "Generate the questions in English."
      : `IMPORTANT: Generate ALL 8 questions in ${langName}. Do not use English at all.`

    const mockFile = {
      name: fileUpload.originalname,
      type: fileUpload.mimetype,
      size: fileUpload.size,
      arrayBuffer: async () => fileUpload.buffer,
      base64Content: ""
    }

    const { text } = await extractTextFromFile(mockFile)
    const safeText = String(text ?? "").trim()
    if (!safeText) return res.status(400).json({ error: "Could not extract text" })

    const questions = await withFastLlm(async (apiKey, model) => {
      const llm = makeLlm(apiKey, model)
      const prompt = ChatPromptTemplate.fromTemplate(`You are DocuMind AI. Based on the following document, generate exactly 8 insightful, specific questions that a user would want answered from this document.
The questions should be about key topics, terms, findings, dates, people, processes, and conclusions in the document.
${langInstruction}
Return ONLY a JSON array of strings — the 8 questions. No other text. Example: ["Question 1?", "Question 2?"]

Document Text:
{text}

JSON Array of Questions:`)
      const chain = prompt.pipe(llm)
      const result = await chain.invoke({ text: sampleAcrossDocument(safeText, 8000) })
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

// --- AUTO-TAG ROUTE (Feature 8) ---
app.post("/api/suggest-tags", upload.single("file"), async (req, res) => {
  try {
    const fileUpload = req.file as Express.Multer.File
    if (!fileUpload) return res.status(400).json({ error: "No file uploaded" })

    const mockFile = { name: fileUpload.originalname, type: fileUpload.mimetype, size: fileUpload.size, arrayBuffer: async () => fileUpload.buffer, base64Content: "" }
    const { text } = await extractTextFromFile(mockFile)
    const safeText = String(text ?? "").trim()
    if (!safeText) return res.json({ success: true, tags: [] })

    const tags = await withFastLlm(async (apiKey, model) => {
      const llm = makeLlm(apiKey, model)
      const prompt = ChatPromptTemplate.fromTemplate(`You are DocuMind AI. Generate 5 short, relevant tags for the following document.
Tags should be keywords that describe the document type, topic, or key entities (e.g. "Invoice", "2024", "Legal Contract", "Tanishk Gupta", "Fee Receipt").
Return ONLY a JSON array of strings. No other text. Example: ["Invoice", "Fee", "2024", "Education", "Payment"]

Document Text:
{text}

JSON Array of Tags:`)
      const chain = prompt.pipe(llm)
      const result = await chain.invoke({ text: sampleAcrossDocument(safeText, 3000) })
      let raw = String(result.content ?? "").trim()
      const start = raw.indexOf("["), end = raw.lastIndexOf("]")
      if (start !== -1 && end !== -1) raw = raw.substring(start, end + 1)
      return JSON.parse(raw) as string[]
    })

    return res.json({ success: true, tags })
  } catch (error: any) {
    console.error("Suggest tags error:", error)
    return res.json({ success: true, tags: [] })
  }
})

// Shared by both follow-up routes. Grounding a follow-up ONLY in the (often truncated)
// previous answer produces vague/generic replies for anything the original answer didn't
// happen to cover — e.g. "explain point 2 with another example from the document" has
// nothing to draw on. When the source file is available, re-extract its text and pull the
// portion most relevant to the follow-up question (same relevance selector used for the
// main Q&A) so the model can actually ground its reply in the document, not just guess.
function buildFollowUpPrompt(params: {
  originalQuestion: string
  originalAnswer: string
  followUpQuestion: string
  chatHistory: Array<{ role: string; content: string }>
  language: string
  documentContext: string
}): string {
  const { originalQuestion, originalAnswer, followUpQuestion, chatHistory, language, documentContext } = params
  const langName = LANGUAGE_NAMES[language] || "English"
  const langInstruction = language === "en" ? "" : `Respond in ${langName}.\n\n`
  const historyText = chatHistory.length > 0
    ? chatHistory.map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`).join("\n") + "\n\n"
    : ""

  return `You are DocuMind AI, an expert assistant. A user asked a question about a document and received an answer. Now they have a follow-up question.
${langInstruction}Give a substantive, specific answer grounded in the original Q&A${documentContext ? " and the document excerpt below" : ""} — do not just restate the original answer or reply with vague conversational filler. If the follow-up asks for more detail, an example, or clarification of a specific point, actually provide it using the available context. If the follow-up is completely unrelated to the original topic, gently redirect them.

Original Question: ${originalQuestion}

Original Answer:
${originalAnswer}

${documentContext ? `Relevant Document Excerpt:\n${documentContext}\n\n` : ""}${historyText ? `Previous conversation:\n${historyText}` : ""}Follow-up Question: ${followUpQuestion}

Answer:`
}

// Best-effort: extract the uploaded file's text and select the portion most relevant to
// the follow-up question. Returns "" if no file was attached or extraction fails — callers
// fall back to answering from the Q&A context alone.
async function extractFollowUpDocumentContext(file: Express.Multer.File | undefined, query: string): Promise<string> {
  if (!file) return ""
  try {
    const mockFile = { name: file.originalname, type: file.mimetype, size: file.size, arrayBuffer: async () => file.buffer, base64Content: "" }
    const { text } = await extractTextFromFile(mockFile)
    const safeText = String(text ?? "").trim()
    if (!safeText) return ""
    return selectRelevantContext(safeText, query, 8000)
  } catch (e: any) {
    console.warn("[Followup] document context extraction failed:", e?.message)
    return ""
  }
}

// --- FOLLOW-UP CHAT ROUTE (Feature 4) ---
app.post("/api/followup", upload.single("file"), async (req, res) => {
  try {
    const { originalQuestion, originalAnswer, followUpQuestion, language = "en" } = req.body
    if (!originalQuestion || !originalAnswer || !followUpQuestion) {
      return res.status(400).json({ error: "Missing required fields" })
    }
    let chatHistory: Array<{ role: string; content: string }> = []
    try { chatHistory = req.body.chatHistory ? JSON.parse(req.body.chatHistory) : [] } catch { chatHistory = [] }

    const documentContext = await extractFollowUpDocumentContext(req.file, followUpQuestion)
    const systemPrompt = buildFollowUpPrompt({ originalQuestion, originalAnswer, followUpQuestion, chatHistory, language, documentContext })

    const answer = await withKeyModelFallback(async (apiKey, model) => {
      const llm = makeLlm(apiKey, model)
      const result = await llm.invoke(systemPrompt)
      return String(result.content ?? "").trim()
    })

    return res.json({ success: true, answer })
  } catch (error: any) {
    console.error("Follow-up error:", error)
    return res.status(500).json({ error: "Failed to process follow-up" })
  }
})

// --- FOLLOW-UP CHAT ROUTE (streaming) ---
// Streams tokens via Server-Sent Events as they're generated, instead of waiting for the
// full response — this is the most latency-sensitive interactive path (a user actively
// waiting on a follow-up), so it gets real token-by-token streaming. The larger batch
// /api/analyze pipeline (multi-question, graph extraction, DB sync) is left non-streaming
// to avoid destabilizing that more complex flow.
app.post("/api/followup-stream", upload.single("file"), async (req, res) => {
  const { originalQuestion, originalAnswer, followUpQuestion, language = "en" } = req.body
  if (!originalQuestion || !originalAnswer || !followUpQuestion) {
    return res.status(400).json({ error: "Missing required fields" })
  }
  let chatHistory: Array<{ role: string; content: string }> = []
  try { chatHistory = req.body.chatHistory ? JSON.parse(req.body.chatHistory) : [] } catch { chatHistory = [] }

  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders()

  const send = (payload: any) => res.write(`data: ${JSON.stringify(payload)}\n\n`)

  try {
    const documentContext = await extractFollowUpDocumentContext(req.file, followUpQuestion)
    const systemPrompt = buildFollowUpPrompt({ originalQuestion, originalAnswer, followUpQuestion, chatHistory, language, documentContext })

    const keys = getAllGroqKeys()
    if (keys.length === 0) {
      send({ error: "AI is not configured on the server." })
      send({ done: true })
      return res.end()
    }

    let anyTokenSent = false
    let succeeded = false

    outer:
    for (const model of GROQ_MODEL_PRIORITY) {
      for (const apiKey of keys) {
        try {
          const llm = makeLlm(apiKey, model)
          const stream = await llm.stream(systemPrompt)
          for await (const chunk of stream) {
            const token = String((chunk as any)?.content ?? "")
            if (token) {
              send({ token })
              anyTokenSent = true
            }
          }
          succeeded = true
          break outer
        } catch (err: any) {
          console.log(`[Followup-Stream] key/model failed: ${String(err?.message).slice(0, 100)}`)
          // Tokens already reached the client for this attempt — retrying with a different
          // model would duplicate/garble the response, so stop rather than retry.
          if (anyTokenSent) { succeeded = true; break outer }
        }
      }
    }

    if (!succeeded) {
      send({ error: "All AI providers are temporarily busy. Please try again in a moment." })
    }
    send({ done: true })
    res.end()
  } catch (error: any) {
    console.error("Follow-up stream error:", error)
    try {
      send({ error: "Failed to process follow-up" })
      send({ done: true })
    } catch {}
    res.end()
  }
})

// --- SHARE LINK CREATE ROUTE ---

app.post("/api/share", async (req, res) => {
  try {
    const { email, documentNames, answers } = req.body
    if (!email || !answers) return res.status(400).json({ error: "Missing data" })

    const shareId = Math.random().toString(36).substr(2, 12) + Date.now().toString(36)

    try {
      await db.createShareLink({
        shareId,
        userEmail: email.toLowerCase(),
        documentNames: documentNames || [],
        answers,
      })

      await db.createActivityLog({ userEmail: email, action: "SHARE_CREATED", details: `Shared analysis of: ${(documentNames || []).join(", ")}` }).catch(() => {})
    } catch (dbError) {
      console.warn("DB not available, using in-memory mock for share link");
      (global as any).mockShares = (global as any).mockShares || new Map();
      (global as any).mockShares.set(shareId, {
        shareId,
        userEmail: email.toLowerCase(),
        documentNames: documentNames || [],
        answers,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
    }

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
    let shared: any

    try {
      shared = await db.getShareLink(shareId)
    } catch (dbError) {
      console.warn("DB not available, using in-memory mock for share fetch");
      shared = (global as any).mockShares?.get(shareId);
    }

    if (!shared) return res.status(404).json({ error: "Share link not found or expired" })
    const expiresAt = shared.expires_at || shared.expiresAt
    if (expiresAt && new Date() > new Date(expiresAt)) {
      try {
        await db.deleteShareLink(shareId)
      } catch (e) {
        (global as any).mockShares?.delete(shareId);
      }
      return res.status(410).json({ error: "This share link has expired" })
    }
    return res.json({
      success: true,
      shareId,
      documentNames: shared.document_names || shared.documentNames,
      answers: shared.answers,
      createdAt: shared.created_at || shared.createdAt,
      expiresAt,
    })
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch share link" })
  }
})

// --- ADMIN ACTIVITY LOGS ROUTE ---
app.get("/api/admin/logs", requireAdmin, async (req, res) => {
  try {
    const { email, limit = "50" } = req.query as any
    const logs = await db.getActivityLogs({ email: email || undefined, limit: parseInt(limit) })
    return res.json({
      success: true,
      logs: logs.map((l) => ({ id: l.id, userEmail: l.user_email, action: l.action, details: l.details, timestamp: l.timestamp })),
    })
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch logs" })
  }
})

// --- GET ADMIN STATS ROUTE (Enhanced with chart data) ---
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [totalUsers, totalQueries, totalDocuments, userGrowth, topUsers, docTypeDistribution, totalStorageUsed] =
      await Promise.all([
        db.countUsers(),
        db.getTotalQueriesSum(),
        db.countDocuments(),
        db.getUserGrowthSince(thirtyDaysAgo),
        db.getTopUsersByQueries(10),
        db.getDocTypeDistribution(),
        db.getTotalStorageUsed(),
      ])

    return res.json({
      success: true,
      stats: {
        totalUsers,
        totalQueries,
        totalDocuments,
        totalStorageUsed,
        userGrowth,
        topUsers,
        docTypeDistribution,
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
    const { questions: questionsJson, question, email, questionsMetadata: metaJson } = req.body

    let questionsToProcess: string[] = []
    if (questionsJson) {
      questionsToProcess = JSON.parse(questionsJson)
    } else if (question) {
      questionsToProcess = [question]
    }

    // Per-question metadata: answerMode + language + compareMode + expandContext
    let questionsMetadata: Array<{ answerMode?: string; language?: string; compareMode?: boolean; expandContext?: boolean }> = []
    try {
      if (metaJson) questionsMetadata = JSON.parse(metaJson)
    } catch { questionsMetadata = [] }

    const getQuestionMeta = (index: number) => ({
      answerMode: (questionsMetadata[index]?.answerMode as "concise" | "detailed") || "detailed",
      language: questionsMetadata[index]?.language || "en",
      compareMode: Boolean(questionsMetadata[index]?.compareMode),
      // Re-run flag for the "Search Again with More Context" retry button — widens the
      // relevance-selection budget instead of giving up after the default-size context misses.
      expandContext: Boolean(questionsMetadata[index]?.expandContext),
    })

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

    // DB availability check — skip persistence entirely for the admin account / anonymous use
    const dbConnected = Boolean(email && email !== ADMIN_EMAIL)

    const allDocs: Document[] = []
    const fileGraphs: any[] = []
    const docPagesMap: Record<string, PdfPage[]> = {}
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 100000, chunkOverlap: 2000 })

    for (const file of files) {
      const { text, fileType, imageUrls, pages } = await extractTextFromFile(file, email)
      const safeText = String(text ?? "").trim()

      if (!safeText) continue
      if (pages && pages.length > 0) docPagesMap[file.name] = pages

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

      if (dbConnected) {
        const dbDoc = await db.getDocumentByName(email, file.name)
        if (dbDoc && dbDoc.nodes && dbDoc.nodes.length > 0) {
          console.log(`[RAG-Backend] ✅ Loaded Knowledge Graph from database for ${file.name}`)
          fileGraph = {
            nodes: dbDoc.nodes.map((n: any) => ({ id: n.id, label: n.label, type: n.type, description: n.description })),
            edges: dbDoc.edges.map((e: any) => ({ source: e.source, target: e.target, relation: e.relation, description: e.description })),
          }
          foundInDb = true

          // Backfill missing content bytes if knowledge graph already exists
          if (!dbDoc.content) {
            try {
              await db.backfillDocumentContent(email, file.name, file.base64Content)
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

        // Save Graph and Content to database
        if (dbConnected) {
          try {
            await db.upsertDocumentGraph({
              email,
              name: file.name,
              size: file.size,
              type: file.type,
              content: file.base64Content,
              nodes: fileGraph.nodes,
              edges: fileGraph.edges,
            })
            console.log(`[RAG-Backend] 💾 Saved graph and content bytes to database for ${file.name}`)
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
5. If there are extracted diagrams or visuals listed in the context that match a question's topic (such as diagrams of architectures, processes, graphs, etc.), you MUST render them inline in your answer using their exact Markdown reference from the diagrams block, copying the image URL character-for-character. Never invent, shorten or rewrite an image URL.
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
    const qaPromises = questionsToProcess.map(async (q, qIndex) => {
      const { answerMode, language, compareMode, expandContext } = getQuestionMeta(qIndex)
      // Both current Groq models support ~131K token context windows, so a single generous
      // budget is fine now — no need to branch by model name. The retry ("Search Again with
      // More Context") path gets a much wider budget instead of giving up on "not found".
      const budget = expandContext ? 80000 : 30000
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
            const ctx = selectRelevantContext(fullContext, q, budget)
            return askSingleQuestion(makeLlm(apiKey, model), ctx, graphContext, q, uniqueSources, answerMode, language, compareMode)
          })
        } catch (groqSingleErr: any) {
          // All Groq keys exhausted for this question — use OpenRouter
          console.log(`[RAG] 🌐 Groq exhausted for Q: "${q}" — using OpenRouter...`)
          const orPrompt = `You are DocuMind AI. Provide an extremely detailed, comprehensive, deep multi-paragraph answer (at least 3-4 paragraphs explaining nuances, context, and facts) using ONLY the document context below. Do not summarize or shorten.
${compareMode ? "The user wants a structured comparison ACROSS all documents in the context — organize the answer with a clear comparison (e.g. a markdown table or one section per document) rather than describing only one document.\n" : ""}If the answer is not in the context, say: "This information is not found in the provided document(s)."
Return a JSON object: {"answer":"...","citation":"..."} — no markdown, just JSON.

Document Context:
${selectRelevantContext(fullContext, q, 5000)}

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

        // Best-effort: locate which document/page the citation actually came from, so the
        // frontend can offer a "View in Document" jump straight to that page.
        if (singleResult?.citation) {
          const located = findCitationPage(singleResult.citation, docPagesMap)
          if (located) {
            singleResult.sourceDocument = located.document
            singleResult.sourcePage = located.page
          }
        }

        return { question: q, ...singleResult }
      } catch (singleErr: any) {
        console.error(`[RAG-Backend] Single QA failed for Q: "${q}":`, singleErr?.message?.slice(0, 100))
        // Distinct from a genuine "not found in document" answer — this is a provider/network
        // failure, not the model having looked and found nothing. The frontend uses errorType
        // to show a "temporarily unavailable, please retry" state instead of "Not Found".
        return {
          question: q,
          answer: "⚠️ All AI providers are temporarily busy. Please wait a moment and try again — your document is ready.",
          confidence: 0,
          sources: [],
          foundInDocument: false,
          errorType: "provider_unavailable",
        }
      }
    })

    const results = await Promise.all(qaPromises)
    answers.push(...results)

    // Save Q&A history logs to database
    if (dbConnected) {
      try {
        const documentNames = files.map((f: any) => f.name)
        const qaLogs = answers.map((ans: any) => ({
          text: ans.question,
          answer: ans.answer,
          citation: ans.citation || "",
          confidence: ans.confidence,
          sources: ans.sources,
          documentName: documentNames.join(", "),
          foundInDocument: ans.foundInDocument,
        }))
        await db.appendQuestionLogs(email, qaLogs)
        console.log(`[RAG-Backend] 💾 Logged ${qaLogs.length} Q&A items to database`)

        // Audit log: QUERY_ANALYZED
        try {
          await db.createActivityLog({
            userEmail: email,
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
