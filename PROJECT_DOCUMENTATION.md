# DocuMind AI — Comprehensive Architecture & Technical Deep-Dive

> **Purpose**: This document provides an exhaustive, component-by-component technical breakdown of **DocuMind AI** for resume preparation, system design discussions, and technical interviews. Every concept, pipeline, algorithm, database schema, and design decision is detailed here.

---

## 📌 Executive Summary

**DocuMind AI** is an enterprise-grade, multi-modal document intelligence and Question-Answering (Q&A) platform. It combines **Graph-augmented Retrieval-Augmented Generation (GraphRAG)**, **OCR with multi-lingual Devanagari/English parsing**, **Trusted Execution Environment (TEE) simulation for confidential computing**, and **PostgreSQL/Supabase JSONB-indexed relational knowledge stores**.

### Key Technical Highlights for Resume:
- **Hybrid Retrieval (GraphRAG + Vector/Semantic Context)**: Extracts entities and relationships from documents into knowledge graphs, performing multi-hop Breadth-First Search (BFS) graph traversal to answer complex relational questions that standard vector search misses.
- **Multi-Engine Ingestion Pipeline**: Extracts structured text and figures from PDFs, DOCX, TXT, and scanned documents using a dual engine: digital extraction via `pdf-parse`/`mammoth` with automatic fallback to **Tesseract.js OCR (English + Hindi/Devanagari)** for scanned pages.
- **Legacy Font Garble Detection & Cleaning**: Custom statistical heuristic filter to identify and remove legacy 8-bit ASCII-encoded fonts (Krutidev / ISCII) that distort Devanagari Unicode.
- **Confidential Computing & TEE Simulation**: Cryptographic memory state isolation using **AES-256-GCM** authenticated envelope encryption, timing-safe HMAC-SHA256 session tokens, and in-memory buffer sanitization to prevent memory-dump attacks.
- **High-Throughput Resilient LLM Layer**: Dynamic multi-key round-robin rotation and exponential backoff retry mechanism across multiple Groq LLMs (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `mixtral-8x7b-32768`), decoupling graph extraction with high-speed 8B models from final answer synthesis with 70B models.
- **Scalable Relational Architecture**: PostgreSQL on Supabase with indexed relational tables (`users`, `user_documents`, `user_questions`, `share_links`, `activity_logs`), storing graph topologies natively in `jsonb` with automatic `updated_at` trigger functions.
- **Interactive Modern UI**: Next.js 14 App Router, TypeScript, Tailwind CSS, Radix UI, Framer Motion particle visualizers, and client-side PDF/Text report generators.

---

## 🏛️ System Architecture

```
                    +------------------------------------------+
                    |           Next.js 14 Frontend            |
                    | (App Router, TailwindCSS, Radix, Lucide) |
                    +--------------------+---------------------+
                                         |  HTTPS / REST / SSE
                                         v
                    +--------------------+---------------------+
                    |            Express.js API                |
                    |    (TypeScript, Multer File Stream)      |
                    +--------------------+---------------------+
                                         |
         +-------------------------------+-------------------------------+
         |                               |                               |
         v                               v                               v
+------------------+           +------------------+           +--------------------+
| Ingestion & OCR  |           | GraphRAG Engine  |           | Confidential TEE   |
| - pdf-parse      |           | - Entity Extract |           | - AES-256-GCM      |
| - Mammoth (DOCX) |           | - Edge Linking   |           | - Timing-safe Auth |
| - Tesseract OCR  |           | - Multi-Hop BFS  |           | - Memory Scrubbing |
| - Font Sanitizer |           | - Graph Merging  |           | - Secure OTP       |
+------------------+           +------------------+           +--------------------+
         |                               |                               |
         +-------------------------------+-------------------------------+
                                         |
                                         v
                    +--------------------+---------------------+
                    |         LLM Inference Router             |
                    | Multi-Key Round-Robin & Model Fallback   |
                    | (Llama 3.3 70B, Llama 3.1 8B, Mixtral)   |
                    +--------------------+---------------------+
                                         |
                                         v
                    +--------------------+---------------------+
                    |         Storage & Persistence            |
                    | - PostgreSQL (Supabase Connection Pool)  |
                    | - JSONB Knowledge Graphs                 |
                    | - Supabase Storage (Diagrams / Assets)   |
                    +------------------------------------------+
```

---

## 🧩 Deep Dive: Core Components & Workflows

### 1. Multi-Modal Document Ingestion & Dual OCR Pipeline
**Problem**: Real-world documents vary drastically. Some are modern digital PDFs, some are photographed or scanned physical sheets, and some contain legacy Indian government fonts (Krutidev) where Hindi glyphs are masqueraded as Latin characters.

**How DocuMind Solves It**:
1. **Digital Parsing First**: The file stream is initially parsed using `pdf-parse` (for PDFs) or `mammoth` (for DOCX).
2. **Scanned PDF Auto-Detection**:
   - The system checks if extracted text has fewer than 150 characters (`cleanedPreview.length < 150`).
   - If true, the document is flagged as scanned.
3. **JPEG Stream Extraction**:
   - Instead of rasterizing the entire PDF using heavy native C++ binaries, DocuMind scans raw PDF byte buffers for `/Subtype /Image` and `/DCTDecode` streams to extract pure JPEG image buffers directly.
4. **Multi-Lingual OCR with Tesseract.js**:
   - Runs Tesseract OCR with `eng+hin` language models against the extracted image streams.
   - Bundles pre-downloaded `eng.traineddata` and `hin.traineddata` to avoid network latency during cold starts.
5. **Krutidev Garble Filter (`cleanExtractedText`)**:
   - Detects Latin character clusters with atypical consonant/vowel ratios and phonetic signatures (`vUrxZr`, `ikfydk`, `lkFk`) representing legacy font mappings.
   - Retains valid Unicode Devanagari (`\u0900-\u097F`) while stripping corrupted 8-bit ASCII representations.
6. **Figure & Diagram Extraction**:
   - Embedded diagrams and visual figures are uploaded to Supabase Storage.
   - Regex patterns match captions (`Figure 1: ...`, `Fig. 2.1`) and link the images directly into the prompt context as Markdown references (`![Figure](url)`).

---

### 2. GraphRAG Engine (Knowledge Graph RAG)
**Why Standard Vector RAG Fails**:
Standard vector RAG divides text into isolated chunks, embeds them into high-dimensional vectors, and performs cosine similarity search. When a user asks:
> *"How does the regulation introduced by Dr. Sharma impact the supplier partnership established in 2021?"*
Standard RAG often retrieves chunk A (about Dr. Sharma) or chunk B (about the supplier), but misses the indirect causal connection linking them across disparate sections.

**How DocuMind's GraphRAG Works**:
1. **Chunk-Level Entity & Relation Extraction**:
   - Text is split into small chunks (3,000 characters).
   - A fast LLM (`llama-3.1-8b-instant`) executes strict JSON-based entity extraction using few-shot prompts:
     - **Nodes**: `id`, `label`, `type` (e.g., Person, Org, Law, Concept), `description`.
     - **Edges**: `source`, `target`, `relation` (e.g., `AUTHOR_OF`, `REGULATES`, `PARTNERS_WITH`), `description`.
2. **Graph Consolidation & Deduplication**:
   - Ingests chunk graphs into a unified document graph.
   - Normalizes identifiers (lowercase alphanumeric sanitization) and merges duplicate node descriptions and multi-chunk relational edges.
3. **Seed Entity Extraction for Queries**:
   - When a user asks a question, the LLM first extracts named entities present in the question (`extractSeedEntities`).
4. **Multi-Hop Sub-Graph Traversal (BFS)**:
   - Starting from the seed nodes, the engine executes a Breadth-First Search (BFS) graph traversal up to `maxHops = 2`.
   - Explores neighbor nodes and connecting edges, constructing an interconnected relational sub-graph.
5. **Context Augmentation (`formatGraphAsText`)**:
   - Serializes the sub-graph into structured natural language:
     ```
     === Structured Knowledge Graph Context ===
     Extracted Entities:
     - Dr. Sharma (Type: Person) - Authored Regulatory Standard X
     - Global Logistics (Type: Organization) - Tier-1 Supplier
     Known Connections:
     - [Dr. Sharma] authored [Regulatory Standard X]
     - [Regulatory Standard X] mandates compliance for [Global Logistics]
     ==========================================
     ```
   - Injects this alongside the raw text chunks into the final LLM prompt.

---

### 3. Confidential Computing & TEE Simulation
**Concept**: In enterprise deployments (healthcare, legal, banking), data confidentiality in memory is vital. DocuMind implements a Trusted Execution Environment (TEE) simulation layer (`backend/lib/tee.ts`).

**Mechanisms**:
1. **Envelope Encryption (`AES-256-GCM`)**:
   - Generates an in-memory master enclave key (`crypto.randomBytes(32)`).
   - Functions `sealSecret()` and `unsealSecret()` encrypt and decrypt sensitive fields using 96-bit random Initialization Vectors (IV) and 128-bit authentication tags (GCM mode guarantees data authenticity and confidentiality).
2. **Timing-Safe Session Verification**:
   - Custom session tokens formatted as `base64url(payload).base64url(signature)`.
   - Token validation uses `crypto.timingSafeEqual` to eliminate side-channel timing attacks that allow attackers to deduce valid signatures byte-by-byte.
3. **Cryptographically Secure OTP**:
   - Generates 6-digit verification codes using `crypto.randomBytes(4)` with uniform modular distribution across `[100000, 999999]`.
4. **Memory Hygiene**:
   - Plaintext buffers and decrypted secrets are zeroized/garbage-collected immediately after execution to resist memory-dump inspection.

---

### 4. Resilient Multi-Key LLM Routing Layer
**Challenge**: LLM providers enforce tight Requests-Per-Minute (RPM) and Tokens-Per-Minute (TPM) limits on high-tier models.

**Implementation**:
1. **Dynamic Key Rotation Pool**:
   - Reads multiple keys (`GROQ_API_KEY`, `GROQ_API_KEY_2`, `GROQ_API_KEY_3`, etc.) and rotates them round-robin on every request.
2. **Model Tiering**:
   - **Extraction Tier (`withFastLlm`)**: Uses lightweight, high-speed models (`llama-3.1-8b-instant`) for entity extraction, batch summarization, and tag generation (3-4x faster, minimal rate-limit footprint).
   - **Reasoning Tier (`withLlm`)**: Uses top-tier models (`llama-3.3-70b-versatile`, `mixtral-8x7b-32768`) for deep question answering, cross-document comparison, and citation synthesis.
3. **Automatic Exponential Backoff & Fallback**:
   - Automatically catches 429 (Rate Limit) errors, rotates to the next available API key, delays with exponential jitter, and gracefully cascades through fallback models.

---

### 5. Database Architecture & PostgreSQL Schema
DocuMind utilizes PostgreSQL (via Supabase) with connection pooling (`pg.Pool`), parameterized queries to block SQL injection, and JSONB columns for flexible graph storage.

#### Core Tables & Schema Design:
- **`users`**:
  - `id` (UUID, Primary Key)
  - `email` (TEXT UNIQUE, indexed via `idx_users_email`)
  - `password` (TEXT, salted cryptographic hash)
  - `role` (TEXT, check constraint `role in ('admin', 'user')`)
  - `total_queries`, `current_step`, `storage_used`, `created_at`, `updated_at`
- **`user_documents`**:
  - `id` (UUID, Primary Key)
  - `doc_id` (TEXT, indexed)
  - `user_email` (TEXT, indexed)
  - `name` (TEXT, composite unique constraint on `(user_email, name)`)
  - `size`, `type`, `url`, `content` (base64 backup)
  - `summary`, `document_type`, `tags` (text array `text[]`)
  - `nodes` (`JSONB`, holds graph entity nodes)
  - `edges` (`JSONB`, holds graph relational edges)
  - `uploaded_at`, `created_at`, `updated_at`
- **`user_questions`**:
  - `id` (UUID, Primary Key), `q_id` (TEXT), `user_email` (TEXT, indexed)
  - `text`, `answer`, `citation`, `confidence`, `sources` (TEXT[])
  - `document_name`, `found_in_document` (BOOLEAN), `timestamp`
- **`share_links`**:
  - `id` (UUID, Primary Key), `share_id` (TEXT UNIQUE)
  - `user_email`, `document_names` (TEXT[]), `answers` (JSONB)
  - `created_at`, `expires_at` (default `now() + interval '7 days'`)
- **`activity_logs`**:
  - `id` (UUID), `user_email` (TEXT, indexed), `action` (TEXT), `details` (TEXT), `timestamp` (DESC index)
- **Database Triggers**:
  - PostgreSQL trigger `set_updated_at()` automatically touches the `updated_at` timestamp on updates before writing to disk.

---

### 6. Frontend Architecture & User Experience
- **Framework**: Next.js 14 App Router with React Server & Client Components (`"use client"`).
- **Styling**: Tailwind CSS with custom HSL theme tokens supporting seamless dark and light modes.
- **Component Primitives**: Radix UI (Dialog, DropdownMenu, Tabs, Accordion, Progress, Toast, Tooltip).
- **Animations & Visuals**:
  - Custom canvas-based particle network visualization (`particles-background.tsx`) simulating knowledge graph node connections.
  - Interactive multi-step progress stepper (`progress-stepper.tsx`) synchronizing upload, analysis, and results states.
- **Client-Side Export**:
  - Integrated `jsPDF` and `html2canvas` for exporting formatted PDF analysis reports with citations and document metadata.
  - One-click copy and plain-text export formatters.
- **Follow-up Chat Stream**:
  - Server-Sent Events (SSE) `/api/followup-stream` enabling conversational follow-ups with streaming tokens.

---

## 🛠️ Complete Technology Stack Table

| Category | Technology / Library | Purpose in DocuMind |
|---|---|---|
| **Frontend Framework** | Next.js 14 (React 18) | App routing, server/client hybrid rendering, responsive UI |
| **Language** | TypeScript (Strict) | End-to-end type safety across frontend and backend |
| **Styling & UI** | Tailwind CSS + Radix UI | Accessible design system, CSS variables, dark/light theme |
| **Animations** | Framer Motion & HTML5 Canvas | Particle graphs, smooth transitions, loading skeletons |
| **Backend Runtime** | Node.js + Express.js | High-concurrency RESTful API and SSE streaming endpoints |
| **RAG & Orchestration** | LangChain (`@langchain/core`, `@langchain/groq`) | Prompt templating, text chunking, and chain execution |
| **LLM Inference** | Groq (Llama 3.3 70B, Llama 3.1 8B, Mixtral) | Sub-second inference for extraction and deep reasoning |
| **Knowledge Graph** | Custom GraphRAG (In-memory BFS + JSONB) | Multi-hop relational knowledge retrieval across chunks |
| **Document Parsers** | `pdf-parse`, `mammoth` | Digital PDF extraction and Microsoft Word DOCX parsing |
| **OCR Engine** | Tesseract.js (`eng+hin` traineddata) | Scanned image and photographed document recognition |
| **Security & Cryptography**| Node.js `crypto` (AES-256-GCM, SHA-256) | TEE simulation, memory state isolation, secure session tokens |
| **Database** | PostgreSQL (Supabase) | ACID relational storage, connection pooling, JSONB indexing |
| **Object Storage** | Supabase Storage | Cloud storage for extracted diagrams and document assets |
| **Email Service** | Nodemailer (SMTP) | Secure OTP dispatch and notification workflows |

---

## 💼 Resume-Ready Project Descriptions

### Bullet Points for Software Engineer / Full-Stack / AI Engineer Roles:

- **Architected DocuMind AI**, an enterprise document intelligence platform featuring **GraphRAG**, multi-lingual OCR, and confidential computing, serving sub-second Q&A over dense multi-format documents.
- **Engineered a custom GraphRAG pipeline** using LangChain and Groq LLMs that extracts knowledge entities and relations into a consolidated graph, enabling **multi-hop Breadth-First Search (BFS)** traversal to resolve complex relational queries missed by standard vector embeddings.
- **Built a dual-mode ingestion engine** integrating `pdf-parse`, `mammoth`, and **Tesseract.js OCR (English + Hindi)** with raw JPEG stream extraction and a custom heuristic filter to detect and sanitize legacy Krutidev font encodings.
- **Implemented a Trusted Execution Environment (TEE) simulation layer** utilizing **AES-256-GCM envelope encryption**, timing-safe HMAC-SHA256 session management (`crypto.timingSafeEqual`), and in-memory buffer zeroization.
- **Designed a high-throughput multi-key LLM router** with automated round-robin rotation, exponential backoff, and model tiering (fast 8B models for extraction, 70B models for reasoning) to eliminate rate limits.
- **Developed full-stack application** with Next.js 14, Tailwind CSS, Radix UI, Express.js, and PostgreSQL (Supabase) with JSONB graph storage and automated SQL trigger functions.

---

## 🎯 Behavioral & Technical Interview Q&A Cheatsheet

### Q1: Why did you implement GraphRAG instead of standard vector similarity search?
> **Answer**:  
> "Standard vector search relies on semantic similarity of individual chunks. If information is distributed across non-adjacent pages—for example, a CEO mentioned on page 2 and an acquisition agreement on page 45—vector embeddings frequently fail to capture the multi-hop connection between them.  
> With DocuMind's GraphRAG, we extract explicit entities and relationships as a graph during ingestion. When a question is asked, we extract seed entities, traverse the graph using Breadth-First Search up to 2 hops, and append this structured relational context to the prompt. This enables the model to accurately reason over multi-entity relationships without hallucinations."

### Q2: How did you handle scanned documents and legacy Hindi fonts?
> **Answer**:  
> "First, we inspect the digital text yield from `pdf-parse`. If fewer than 150 characters are retrieved, we flag the document as scanned. Instead of incurring high CPU overhead rasterizing entire PDF pages, we parse the PDF byte streams for `/DCTDecode` JPEG markers to pull raw embedded images, and run Tesseract OCR with bundled English and Hindi trained models (`eng+hin`).  
> Furthermore, older Indian administrative documents often use legacy fonts like Krutidev, which store Devanagari using 8-bit ASCII characters. We engineered a statistical heuristic filter that analyzes consonant-to-vowel ratios and phonetic letter-cluster anomalies to scrub garbled ASCII representations while preserving genuine Unicode Devanagari."

### Q3: What is the TEE (Trusted Execution Environment) simulation and why is it needed?
> **Answer**:  
> "In sensitive domains like legal or healthcare, data-at-rest encryption is insufficient—data must also be protected in memory. Our TEE layer simulates hardware-enclave guarantees by using AES-256-GCM envelope encryption for sensitive variables in memory, wiping plaintext buffers immediately after processing, generating cryptographically secure 6-digit OTPs using system entropy, and verifying session tokens using constant-time comparisons (`crypto.timingSafeEqual`) to prevent timing side-channel attacks."

### Q4: How do you prevent API rate limits and keep inference latency low?
> **Answer**:  
> "We implement a tiered, multi-key rotation strategy. First, we separate tasks by model complexity: high-volume entity extraction is routed to lightweight, fast models (`llama-3.1-8b-instant`), while final synthesis and reasoning utilize 70B models (`llama-3.3-70b-versatile`). Second, we distribute requests across a pool of Groq API keys using round-robin scheduling. If any key encounters a 429 status code, our wrapper automatically intercepts the error, rotates to the next key, and applies an exponential backoff with jitter."

### Q5: How is the database organized for knowledge graphs?
> **Answer**:  
> "We use PostgreSQL on Supabase. Rather than adding the overhead of a dedicated graph database like Neo4j for single-document scopes, we store the consolidated knowledge graph directly in the `user_documents` table using PostgreSQL's `JSONB` columns (`nodes` and `edges`). This provides schema flexibility, allows fast indexed reads alongside document metadata, and avoids the complexity of distributed network transactions across multiple database engines."
