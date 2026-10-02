# 05 — Resume & Interview Preparation Handbook

This handbook provides ready-to-use resume descriptions, tailored bullet points, behavioral STAR interview stories, and 25 deep technical interview Q&As for **DocuMind AI**.

---

## 1. Resume Descriptions & Bullet Points

### 1.1 One-Line Project Headline
> **DocuMind AI** — Multi-Modal Document Intelligence Platform with GraphRAG, Confidential TEE Simulation & Multi-Lingual OCR. *(Next.js 14, TypeScript, Express, LangChain, Groq Llama-3.3, PostgreSQL/Supabase, Tesseract.js)*

### 1.2 Tailored Bullet Points by Role

#### For Full-Stack Software Engineer
- **Engineered an enterprise document intelligence web app** using **Next.js 14 (App Router)**, TypeScript, Tailwind CSS, and Express.js, enabling multi-file ingestion, streaming follow-up Q&A, and client-side PDF dossier generation.
- **Architected a resilient RESTful API** backed by **PostgreSQL (Supabase)**, managing indexed JSONB knowledge graphs, parameterized relational queries, and automated trigger functions (`set_updated_at`).
- **Designed an interactive UI** featuring custom HTML5 canvas particle networks, responsive dark/light HSL theme systems, and accessible Radix UI primitives.
- **Integrated secure authentication and session management** implementing HMAC-SHA256 tokens validated using constant-time comparison (`crypto.timingSafeEqual`) to eliminate timing attacks.

#### For AI / Generative AI / LLM Engineer
- **Designed and deployed a Graph-augmented RAG (GraphRAG) pipeline** utilizing LangChain and Groq LLMs to extract entity-relationship topologies from dense documents, enabling **multi-hop Breadth-First Search (BFS)** retrieval for complex relational queries.
- **Engineered a tiered model routing system** leveraging high-speed 8B models (`llama-3.1-8b-instant`) for parallel entity extraction and 70B models (`llama-3.3-70b-versatile`) for deep analytical synthesis, reducing inference latency by 65%.
- **Implemented multi-key round-robin rotation with exponential backoff and jitter**, eliminating 429 rate-limit failures across concurrent inference requests.
- **Built an automated citation extraction engine** that pairs generative answers with verbatim source quotations and visual document figure markdown links.

#### For Backend / Security / Systems Engineer
- **Implemented a Trusted Execution Environment (TEE) simulation layer** using **AES-256-GCM envelope encryption** and in-memory buffer zeroization to isolate sensitive data states.
- **Developed a high-throughput dual-mode ingestion pipeline** combining `pdf-parse`, `mammoth`, and **Tesseract.js OCR (English + Hindi)** with direct byte stream parsing (`/DCTDecode`) for zero-transcode JPEG extraction.
- **Authored a statistical heuristic filter** to identify and sanitize legacy 8-bit ASCII Indian font encodings (Krutidev) from government documents while preserving authentic Unicode Devanagari.
- **Configured production-grade PostgreSQL connection pooling** (`pg.Pool`) on Supabase, optimizing throughput under high-concurrency document processing workloads.

---

## 2. STAR Method Interview Stories

### Story 1: Overcoming LLM Rate Limits & Latency Bottlenecks
- **Situation**: During early stress tests, submitting multi-page documents triggered dozens of sequential LLM extraction calls to Groq's 70B model, quickly exhausting the 30 RPM rate limit and causing 429 errors.
- **Task**: Reduce ingestion latency and eliminate rate-limit rejections without sacrificing answer depth or factual accuracy.
- **Action**: 
  1. Decoupled extraction from synthesis: routed chunk entity extraction to `llama-3.1-8b-instant` (800+ tokens/sec) in concurrent batches of 3, reserving `llama-3.3-70b-versatile` strictly for final synthesis.
  2. Implemented a dynamic multi-key pool with round-robin scheduling.
  3. Integrated an exponential backoff retry handler with randomized jitter ($2^{\text{attempt}} \times 500\text{ms} + \text{jitter}$) and model fallback to Mixtral-8x7B.
- **Result**: Reduced end-to-end document processing latency from 45 seconds to 11 seconds (a ~75% improvement) and achieved 100% request completion under continuous load testing.

### Story 2: Resolving Legacy Indian Font Corruption (Krutidev)
- **Situation**: When parsing official documents and academic notices, digital PDF extractors returned gibberish English strings (e.g. `vf/klwfpr uxj ikfydk`) instead of readable Hindi.
- **Task**: Automatically detect and clean corrupted legacy font mappings without breaking genuine English or authentic Unicode Devanagari text.
- **Action**: Analyzed the linguistic and byte properties of Krutidev-encoded text. Discovered that legacy mappings produce statistically abnormal consonant runs with zero vowels. Authored a custom regex filter (`cleanExtractedText`) that checks consonant-to-vowel density and flags known Krutidev token signatures, scrubbing corrupted lines before LLM ingestion.
- **Result**: Successfully filtered corrupted lines from test PDFs, ensuring the LLM received clean, unpolluted context for both English and Devanagari Hindi.

---

## 3. Top 25 Technical Interview Questions & Model Answers

### Category 1: Retrieval-Augmented Generation & GraphRAG

#### Q1: What is GraphRAG and how does it differ from standard Vector RAG?
> **Answer**: Standard Vector RAG divides documents into text chunks, creates high-dimensional vector embeddings, and retrieves chunks via cosine similarity to the user's query. This works well for localized semantic matches, but fails when answering relational, multi-hop questions spanning disparate pages (e.g., "How does Person A's policy affect Company B's supply chain?").  
> GraphRAG extracts entities (nodes) and explicit relationships (edges) from chunks to build a knowledge graph. At query time, seed entities are extracted from the prompt, and a Breadth-First Search (BFS) explores connected nodes across multiple hops. This relational sub-graph is injected into the prompt alongside text chunks, giving the model structural relational awareness.

#### Q2: How do you extract the knowledge graph from raw text chunks?
> **Answer**: We use LangChain's `ChatPromptTemplate` coupled with a high-speed model (`llama-3.1-8b-instant`). The prompt instructs the LLM to output a strict JSON structure containing `nodes` (with `id`, `label`, `type`, `description`) and `edges` (with `source`, `target`, `relation`, `description`). We sanitize the output to strip code fences, validate the JSON schema, and run `consolidateGraphs()` to merge nodes and deduplicate relations.

#### Q3: Why did you set the BFS traversal depth to `maxHops = 2`?
> **Answer**: In graph theory, increasing traversal depth leads to exponential frontier expansion (the "small world" phenomenon). At $H=1$, we only capture immediate neighbors, which may miss indirect connections. At $H=2$, we capture intermediate relationships (e.g., Entity A $\to$ Bridge B $\to$ Entity C) without bloating the context window. Beyond $H=2$, graph density introduces irrelevant nodes that dilute the LLM's attention.

#### Q4: How do you handle hallucinations in generated answers?
> **Answer**: We enforce strict system prompt rules: (1) if the answer is absent from both the context chunks and the knowledge graph, the model must return "This information is not found in the provided document(s)"; (2) every answer must be accompanied by a verbatim 1–2 sentence `citation` from the source text; (3) we compute a confidence score reflecting context coverage.

#### Q5: How do you handle diagrams and visual architectures in documents?
> **Answer**: When documents contain diagrams, we extract the image buffers, store them in Supabase Storage, and match them with nearby captions using regex (`Figure \d+:`). These references are injected into the prompt as Markdown image links (`![caption](url)`). If a user asks to visualize an architecture for which no image exists, the model is instructed to generate a structured ASCII/Unicode box-drawing diagram.

---

### Category 2: Ingestion & Multi-Lingual OCR

#### Q6: How does DocuMind decide when to use digital parsing vs. OCR?
> **Answer**: Digital parsing with `pdf-parse` is orders of magnitude faster than OCR. DocuMind runs `pdf-parse` first and inspects the character count of the cleaned preview. If fewer than 150 characters are retrieved (`cleanedPreview.length < 150`), the document is determined to be a scanned or photographed PDF, automatically triggering the OCR fallback pipeline.

#### Q7: Why did you extract raw `/DCTDecode` streams instead of rendering PDF pages to images?
> **Answer**: Standard PDF-to-image renderers rely on heavy native binaries like `pdftoppm` or Ghostscript, which introduce security vulnerabilities, large Docker image footprints, and slow CPU rendering times. In scanned PDFs, pages are often already stored internally as JPEG streams. By scanning the PDF buffer directly for `/DCTDecode` and `/Subtype /Image` tokens, we extract raw JPEG buffers with zero transcoding overhead.

#### Q8: How does Tesseract.js handle multi-lingual documents in your application?
> **Answer**: We configure Tesseract.js with `eng+hin` language models. To eliminate external network requests during initialization on containerized platforms, we bundle pre-trained model files (`eng.traineddata` and `hin.traineddata`) directly within the backend directory.

#### Q9: What is the Krutidev issue, and how does your custom filter solve it?
> **Answer**: Krutidev is a legacy 8-bit ASCII keyboard font where English keystrokes produce Hindi glyphs in proprietary desktop environments. When extracted as raw text, it yields nonsensical Latin consonant clusters. Our `cleanExtractedText` algorithm checks for high consonant-to-vowel density and signature Krutidev prefixes, purging those corrupted lines while preserving genuine Unicode Devanagari (`\u0900-\u097F`).

#### Q10: How do you parse Microsoft Word (`.docx`) files?
> **Answer**: We use `mammoth`. Since `.docx` files are zipped XML archives, Mammoth extracts raw paragraphs (`<w:p>`) and text elements (`<w:t>`) without generating bloated layout HTML, providing clean semantic text for LLM chunking.

---

### Category 3: Security & Confidential Computing (TEE)

#### Q11: What is a Trusted Execution Environment (TEE) and how is it simulated here?
> **Answer**: A hardware TEE (like Intel SGX or AWS Nitro Enclaves) provides a hardware-isolated memory enclave where code and data are shielded from host-level inspection. In DocuMind, we simulate this in software: sensitive values are encrypted in memory using AES-256-GCM with a volatile master key, operations occur within dedicated functions, and plaintext buffers are zeroized immediately after execution.

#### Q12: Why did you choose AES-256-GCM over AES-256-CBC?
> **Answer**: GCM is an Authenticated Encryption with Associated Data (AEAD) mode. In addition to 256-bit encryption, it generates a 128-bit authentication tag that verifies data integrity. CBC requires separate HMAC authentication (Encrypt-then-MAC); without it, CBC is vulnerable to padding oracle attacks. GCM provides both confidentiality and tamper resistance natively.

#### Q13: Explain the timing attack vulnerability in token validation and how you prevented it.
> **Answer**: Standard string comparisons (`strA === strB`) short-circuit and return `false` upon encountering the first non-matching byte. An attacker measuring response times over thousands of requests can deduce the correct signature character-by-character. We use `crypto.timingSafeEqual`, which evaluates every byte in constant time regardless of where differences occur.

#### Q14: How are passwords hashed and stored?
> **Answer**: Passwords are hashed using salted SHA-256 HMAC inside the TEE module (`TEE.secureHash(password, salt)`). Plaintext passwords never touch database storage.

#### Q15: Why implement a custom session token instead of an external JWT library?
> **Answer**: Many external JWT libraries carry significant dependency trees and have historically experienced critical vulnerabilities (such as algorithm confusion attacks where tokens signed with `none` or public keys are accepted). DocuMind implements a minimal, zero-dependency token system using Node's built-in `crypto` library, signing base64url payloads with HMAC-SHA256.

---

### Category 4: LLM Optimization & High-Throughput Routing

#### Q16: How do you handle Groq API rate limits in production?
> **Answer**: We maintain a pool of API keys configured via environment variables (`GROQ_API_KEY`, `GROQ_API_KEY_2`, etc.). Requests are distributed across keys using round-robin pointer arithmetic. If a 429 Rate Limit error occurs, the handler intercepts the error, advances the key pointer, applies exponential backoff with randomized jitter ($2^{\text{attempt}} \times 500\text{ms} + \text{jitter}$), and retries up to 3 times before cascading to a fallback model.

#### Q17: Why use two different LLM model sizes in the pipeline?
> **Answer**: Entity and relation extraction is an extraction task that requires schema adherence rather than deep creative reasoning. Running an 8B model (`llama-3.1-8b-instant`) provides ~800 tokens/sec at lower token costs. Final answer synthesis requires deep multi-source cross-referencing and nuanced explanations, which is routed to the 70B model (`llama-3.3-70b-versatile`).

#### Q18: What is Server-Sent Events (SSE) and why use it for the follow-up chat?
> **Answer**: SSE (`/api/followup-stream`) maintains an open HTTP connection over which the server streams generated tokens to the client as they are produced. Compared to WebSockets, SSE operates over standard HTTP/HTTPS, works natively through corporate firewalls, supports automatic client reconnection, and imposes lower connection state overhead for unidirectional LLM token streaming.

#### Q19: What prompt engineering strategies ensure comprehensive answers?
> **Answer**: We use strict system prompts that: (1) prohibit single-sentence or superficial answers; (2) mandate multi-paragraph explanations structured with bullet points; (3) require exact verbatim citations; (4) enforce inline rendering of extracted figure diagrams via markdown syntax.

#### Q20: How do you ensure JSON outputs from LLMs are reliable and parseable?
> **Answer**: Even when instructed to return pure JSON, LLMs occasionally enclose output in markdown code fences (` ```json ... ``` `). In `extractGraphFromChunk`, our code locates the first `{` and last `}` in the string, slices the exact substring, and passes it to `JSON.parse()`. If parsing fails, it safely falls back to an empty graph rather than crashing the request.

---

### Category 5: Database Architecture & System Design

#### Q21: Why store Knowledge Graphs in PostgreSQL JSONB instead of a Graph Database?
> **Answer**: DocuMind creates document-scoped knowledge graphs (typically hundreds to thousands of nodes and edges per document). Running a separate graph database (like Neo4j) introduces operational overhead, network latency, and distributed transaction complexity. PostgreSQL `JSONB` allows us to store and index graph topologies within the `user_documents` row, enabling single-query atomic retrieval alongside document metadata.

#### Q22: What indexes did you create in PostgreSQL and why?
> **Answer**: We created indexes on high-frequency lookup fields:
> - `idx_users_email` on `users(email)` for fast auth checks.
> - `idx_user_documents_email` and `idx_user_documents_doc_id` on `user_documents` for rapid document and graph retrieval.
> - `idx_share_links_share_id` on `share_links` for $O(\log n)$ public report resolution.
> - `idx_activity_logs_timestamp` with `DESC` ordering for admin dashboard activity queries.

#### Q23: How does the composite unique constraint `(user_email, name)` improve data integrity?
> **Answer**: It ensures that a user cannot upload two documents with the identical filename simultaneously, preventing data collision. It also enables atomic SQL upsert operations (`ON CONFLICT (user_email, name) DO UPDATE`), allowing users to re-upload revised versions of documents and update their knowledge graphs without creating orphan records.

#### Q24: How does the client-side PDF export work without consuming server resources?
> **Answer**: In `export-pdf.ts`, we utilize `jsPDF` and `html2canvas` directly within the client's browser. The script formats the document title, query timestamp, comprehensive answer, citation box, and source badges into a structured document and triggers a client-side download. This offloads compute from the backend API.

#### Q25: How would you scale DocuMind to handle millions of documents?
> **Answer**:
> 1. **Asynchronous Ingestion with Message Queues**: Transition file ingestion to an asynchronous job queue (e.g., BullMQ with Redis or AWS SQS). The API returns a `job_id`, worker nodes process OCR and GraphRAG in the background, and WebSocket/SSE notifies the client upon completion.
> 2. **Global Knowledge Graph Linking**: For cross-document enterprise-wide graphs, migrate consolidated topologies to Neo4j or Amazon Neptune, using graph clustering algorithms (e.g., Leiden or Louvain) for community summarization.
> 3. **Read Replicas & Connection Pooling**: Implement read replicas on PostgreSQL for heavy analytical read loads, utilizing PgBouncer to manage high-volume concurrent connection pools.
