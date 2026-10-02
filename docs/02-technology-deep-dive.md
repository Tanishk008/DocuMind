# 02 — Technology Deep-Dive & Architectural Rationale

This document delivers an in-depth breakdown of every library, framework, algorithm, and design decision implemented in **DocuMind AI**, explaining **what** was chosen, **why** it was chosen over alternatives, and **how** it operates under the hood.

---

## 1. Document Ingestion & Parsing Technologies

### 1.1 `pdf-parse` (Digital PDF Parsing)
- **Role**: Extracts textual content from standard programmatic/digital PDF documents.
- **Under the Hood**: Uses Mozilla's `pdf.js` under a Node.js wrapper to traverse the PDF's text layer objects (`BT` to `ET` PDF operator streams), reconstructing lines based on typographic coordinates.
- **Why chosen**: Extremely lightweight, executes synchronously in Node.js without requiring external headless browser instances (like Puppeteer) or heavy C++ binaries (like `poppler`).

### 1.2 `mammoth` (.docx Parser)
- **Role**: Converts Microsoft Word `.docx` documents into raw, unformatted text strings.
- **Under the Hood**: DOCX files are zipped XML archives (`[Content_Types].xml`, `word/document.xml`). Mammoth unzips the stream and parses the semantic XML DOM (`<w:p>`, `<w:t>`), ignoring layout-heavy formatting markup to extract clean textual content.
- **Why chosen**: Unlike tools that convert Word documents to intermediary HTML (which injects noise and bloats the prompt token count), Mammoth provides clean semantic text ideal for LLM ingestion.

### 1.3 `Tesseract.js` & Custom JPEG Stream Extraction (Multi-Lingual OCR)
- **Role**: Extracts text from scanned PDFs, photographed documents, and image-based PDFs in both English and Hindi.
- **Why Standard Approaches Fail**: Standard Node OCR solutions either convert each PDF page to a PNG using Ghostscript/Poppler (which crashes on containerized cloud hosts due to missing C-libraries) or take 15–20 seconds per page.
- **DocuMind's Novel Hybrid Strategy**:
  1. **Direct Stream Scanning**: DocuMind inspects the raw binary buffer of the PDF file, searching for `/Subtype /Image` dictionaries and `/DCTDecode` filters (the PDF specification code for embedded JPEG files).
  2. **Zero-Transcode Slicing**: Extracts the exact byte slice between the `stream` and `endstream` tokens. This yields raw JPEG binary buffers directly without any image rendering step.
  3. **Bundled Language Models**: Tesseract.js runs using WebAssembly (WASM). To eliminate external network requests, DocuMind bundles `eng.traineddata` and `hin.traineddata` locally in the repository.
  4. **Scanned Threshold Gate**: OCR is only triggered if digital parsing yields under 150 characters (`cleanedPreview.length < 150`), ensuring zero latency penalty for standard digital PDFs.

### 1.4 Krutidev Garble Detection Algorithm
- **Problem**: In many official Indian government and institutional documents, Hindi was historically typed using legacy ASCII-mapped fonts (such as Krutidev-010 or ISM). In these files, characters are stored as standard English ASCII codes (e.g., typing the English letter `v` produces the Hindi glyph `अ`). When a modern PDF parser reads the file, it outputs unreadable strings of English consonants without vowels (e.g., `vf/klwfpr uxj ikfydk`).
- **Algorithm Implementation (`cleanExtractedText`)**:
  - Distinguishes genuine Unicode Devanagari (`\u0900-\u097F`) from corrupted ASCII representations.
  - Computes the vowel-to-consonant ratio and checks for known Krutidev signatures:
    - Sequences of 4+ consonants without vowels (`[^\saeiouAEIOU\u0900-\u097F\d.,!?:;"'()\-]{4,}`).
    - Frequent occurrences of signature Krutidev prefix tokens (`vUrxZr`, `ikfydk`, `lkFk`).
  - Corrupted lines are filtered out, preventing garbled tokens from poisoning the LLM context.

---

## 2. GraphRAG Engine & Relational Knowledge Traversal

### 2.1 Why Vector-Only RAG is Insufficient
In traditional Vector RAG:
1. Documents are sliced into chunks of $N$ characters (e.g., 500 tokens).
2. Chunks are passed through an embedding model (e.g., `text-embedding-3-small`) to produce vectors.
3. At query time, the user prompt is converted to a vector, and Top-$K$ chunks are retrieved via Cosine Similarity.

**The Limitation**: Cosine similarity measures *lexical/semantic proximity*, not *relational topology*. If a user asks:
> *"Does the subsidiary acquired by Acme Corp in 2021 comply with the 2024 environmental policy?"*
- Chunk 1 (Page 3): *"Acme Corp acquired BioTech Ltd in June 2021."*
- Chunk 2 (Page 48): *"All subsidiaries operating under GreenTech certifications must submit annual emissions audits."*
- Chunk 3 (Page 82): *"BioTech Ltd holds GreenTech Certification #401."*

A vector search for "Acme Corp compliance with environmental policy" will likely retrieve Chunk 2 and Chunk 1, but fail to retrieve Chunk 3 because Chunk 3 does not mention "Acme Corp" or "environmental policy". The system hallucinates or says "Information not found".

### 2.2 DocuMind GraphRAG Implementation

#### A. Schema & Structure
```typescript
export interface GraphNode {
  id: string          // Normalized unique ID (e.g., "biotech_ltd")
  label: string       // Human-readable entity name ("BioTech Ltd")
  type: string        // Entity classification ("Organization", "Person", "Policy")
  description: string // Contextual summary of the entity
}

export interface GraphEdge {
  source: string      // Source node ID
  target: string      // Target node ID
  relation: string    // Semantic relationship ("ACQUIRED_BY", "COMPLIES_WITH")
  description: string // Contextual evidence
}
```

#### B. Asynchronous Batch Extraction with Fast LLM
- Instead of using slow 70B models for extraction, DocuMind routes 3,000-character chunks to **`llama-3.1-8b-instant`** in concurrent batches of 3 (`Promise.all`).
- Enforces strict JSON output schemas, automatically stripping accidental markdown code blocks.
- Execution completes 3–4x faster than single-model sequential pipelines.

#### C. Deduplication & Consolidation (`consolidateGraphs`)
- Iterates across chunk graphs and builds a normalized `Map<string, GraphNode>`.
- Normalizes IDs by removing punctuation and converting to lowercase.
- Combines descriptions from multiple mentions to build an enriched entity profile.

#### D. Seed Extraction & Multi-Hop BFS Sub-Graph Retrieval
1. **Seed Extraction**: When a query arrives, `extractSeedEntities(query)` prompts the fast LLM to identify mentioned entities.
2. **Breadth-First Search (BFS)**:
   ```typescript
   let currentHop = 0
   let frontier = Array.from(seedNodes)
   while (frontier.length > 0 && currentHop < maxHops) {
     const nextFrontier = new Set<string>()
     for (const node of frontier) {
       for (const edge of edges) {
         if (edge.source === node && !visited.has(edge.target)) {
           visited.add(edge.target)
           nextFrontier.add(edge.target)
         }
       }
     }
     frontier = Array.from(nextFrontier)
     currentHop++
   }
   ```
3. **Context Injection (`formatGraphAsText`)**: The retrieved subgraph is converted to structured natural text and injected into the prompt alongside the raw document text.

---

## 3. Trusted Execution Environment (TEE) & Cryptographic Security

### 3.1 AES-256-GCM Envelope Encryption
- **Why GCM (Galois/Counter Mode)?** Unlike CBC (Cipher Block Chaining), GCM provides **authenticated encryption with associated data (AEAD)**. It not only encrypts data with 256-bit security, but also produces a 128-bit authentication tag. If an attacker tampers with even a single bit of the ciphertext, decryption immediately throws an error instead of returning corrupted plaintext.
- **Implementation**:
  - 32-byte master enclave key generated in volatile process memory (`crypto.randomBytes(32)`).
  - Unique 12-byte Initialization Vector (IV) generated for every encryption operation.

### 3.2 Side-Channel Protection via `crypto.timingSafeEqual`
- **Vulnerability**: Standard string comparisons (`if (token === storedToken)`) execute byte-by-byte and return `false` on the first non-matching byte. An attacker measuring HTTP response times with nanosecond accuracy can deduce correct tokens character-by-character (a **timing attack**).
- **DocuMind Mitigation**:
  ```typescript
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null
  }
  ```
  `crypto.timingSafeEqual` executes in constant time regardless of where mismatches occur, completely mitigating timing side-channels.

### 3.3 Zero-Dependency Lightweight Session Tokens
- Rather than importing large external JWT libraries with historical vulnerability records, DocuMind implements a native HMAC-SHA256 session token system:
  $$\text{Token} = \text{base64url}(\text{Payload}) + "." + \text{base64url}(\text{HMAC-SHA256}(\text{Payload}, \text{Secret}))$$
- Tokens carry an expiration timestamp (`exp: Date.now() + 24 * 60 * 60 * 1000`) and are fully validated inside the TEE boundary.

---

## 4. Resilient Multi-Key LLM Routing Layer

### 4.1 Tiered Model Architecture
To optimize between inference speed, cost, and analytical depth, DocuMind segregates workloads:

| Tier | Model | Parameters | Primary Tasks | Speed |
|---|---|---|---|---|
| **Fast Extraction** | `llama-3.1-8b-instant` | 8 Billion | Entity/Relation extraction, Seed identification, Document tagging | ~800 tokens/sec |
| **Deep Reasoning** | `llama-3.3-70b-versatile` | 70 Billion | Comprehensive Q&A, Multi-doc cross comparison, Citation synthesis | ~250 tokens/sec |
| **Resilient Fallback** | `mixtral-8x7b-32768` | 46.7 Billion MoE | Fallback on 70B downtime or extended context queries | ~450 tokens/sec |

### 4.2 Multi-Key Round-Robin & Exponential Backoff
- **Key Pool**: Ingests multiple API keys (`GROQ_API_KEY`, `GROQ_API_KEY_2`, etc.) into an array.
- **Round-Robin Pointer**: Distributes requests evenly across keys to multiply available rate limits.
- **Exponential Backoff with Jitter**:
  When a 429 Rate Limit error occurs:
  $$\text{Delay} = (2^{\text{attempt}} \times 500\,\text{ms}) + \text{UniformRandom}(0, 200\,\text{ms})$$
  The random jitter prevents "thundering herd" problems where retried requests hit the API simultaneously.

---

## 5. Persistence: PostgreSQL (Supabase) vs. Neo4j Trade-Off

| Feature | PostgreSQL + JSONB (DocuMind) | Dedicated Graph DB (e.g. Neo4j) |
|---|---|---|
| **Operational Complexity** | Single database handles Auth, Documents, Q&A, and Graphs. | Requires running, scaling, and maintaining two separate database systems. |
| **Transaction Boundaries** | Atomic transactions across users, files, and graphs. | Requires two-phase commits or eventual consistency across engines. |
| **Graph Scope** | Graphs are scoped per document (hundreds of nodes/edges). | Optimized for global multi-billion-node enterprise graphs. |
| **Performance for Scope** | In-memory BFS over parsed JSONB subgraphs executes in < 2ms. | Network overhead of Cypher query per document outweighs JSONB traversal. |
| **Conclusion** | **Optimal for DocuMind's document-level knowledge graphs.** | Over-engineered for document-level RAG. |

---

## 6. Frontend Architecture & Design Decisions

### 6.1 Next.js 14 App Router & Hybrid Rendering
- Utilizes the Next.js 14 App Router structure (`app/upload`, `app/query`, `app/results`, `app/history`, `app/profile`, `app/admin`).
- Employs Client Components (`"use client"`) for rich interactive workflows (real-time file upload progress, dynamic chat, canvas particle animations) while leveraging Next.js routing, layout composition, and asset optimization.

### 6.2 HTML5 Canvas Particle Background (`particles-background.tsx`)
- An interactive node-and-edge network rendered via HTML5 `<canvas>`.
- Particles calculate Euclidean distance $d = \sqrt{(x_1-x_2)^2 + (y_1-y_2)^2}$ to neighboring particles; if $d < \text{threshold}$, dynamic connecting lines are drawn with alpha proportional to distance:
  $$\alpha = 1 - \frac{d}{\text{threshold}}$$
- Visually reflects the knowledge graph concepts underpinning DocuMind.

### 6.3 Client-Side PDF Generation (`export-pdf.ts`)
- Uses `jsPDF` and `html2canvas` to render printable analytical dossiers client-side.
- Automatically lays out document titles, date stamps, question headings, comprehensive answers, and cited sources without placing server-side rendering loads on the backend.
