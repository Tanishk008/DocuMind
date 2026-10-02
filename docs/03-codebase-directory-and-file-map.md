# 03 — Codebase Directory & File Map

This document provides a comprehensive, file-by-file roadmap of the entire **DocuMind AI** codebase, detailing the purpose, dependencies, and internal workflows of every critical component.

---

## 1. Complete Repository Directory Tree

```
DocuMind-main/
├── docs/                                  # Engineering & interview documentation
│   ├── README.md                          # Master documentation index
│   ├── 01-architecture-and-flowcharts.md  # Architectural blueprints & Mermaid flowcharts
│   ├── 02-technology-deep-dive.md         # Component rationale, trade-offs & math
│   ├── 03-codebase-directory-and-file-map.md # This file
│   ├── 04-database-schema-and-models.md   # PostgreSQL schema, ER diagrams & JSONB structures
│   └── 05-resume-and-interview-handbook.md# Resume bullets, STAR stories & 20+ interview Q&As
├── backend/                               # Express.js REST API & Ingestion Server
│   ├── db/
│   │   └── schema.sql                     # Supabase/PostgreSQL idempotent schema DDL
│   ├── lib/
│   │   ├── db.ts                          # Database data-access layer (CRUD operations)
│   │   ├── graphrag.ts                    # Knowledge graph extraction, consolidation & BFS
│   │   ├── pg.ts                          # PostgreSQL connection pool manager
│   │   ├── storage.ts                     # Supabase object storage (figure image uploads)
│   │   └── tee.ts                         # Trusted Execution Environment (AES-256-GCM, Auth)
│   ├── eng.traineddata                    # Tesseract English OCR neural model
│   ├── hin.traineddata                    # Tesseract Hindi/Devanagari OCR neural model
│   ├── server.ts                          # Main Express application, API routes & pipeline
│   ├── package.json                       # Backend dependencies & build scripts
│   └── tsconfig.json                      # Strict TypeScript compiler options
├── frontend/                              # Next.js 14 Web Application
│   ├── app/                               # Next.js 14 App Router pages
│   │   ├── admin/page.tsx                 # System metrics, user management & activity logs
│   │   ├── auth/page.tsx                  # User authentication (Login / Signup / OTP)
│   │   ├── contact/page.tsx               # Contact support and email feedback form
│   │   ├── documents/page.tsx             # Document vault, delete/download & metadata view
│   │   ├── history/page.tsx               # Question-and-answer historical log
│   │   ├── profile/page.tsx               # User account profile & query quota usage
│   │   ├── query/page.tsx                 # Question input, templates & language/mode selection
│   │   ├── results/page.tsx               # Analytical answers, citations, figures & PDF export
│   │   ├── share/[shareId]/page.tsx       # Public shared analytical report view
│   │   ├── upload/page.tsx                # Drag-and-drop file upload, tags & summary preview
│   │   ├── globals.css                    # Tailwind CSS theme variables & styling
│   │   ├── layout.tsx                     # Root HTML layout with Navbar & Footer
│   │   └── page.tsx                       # Landing page with hero, features & demo preview
│   ├── components/                        # Reusable React components
│   │   ├── ui/                            # Radix UI primitives styled with Tailwind (40+ items)
│   │   ├── auth-provider.tsx              # React Context for session management & persistent state
│   │   ├── follow-up-chat.tsx             # Interactive floating follow-up Q&A chat drawer
│   │   ├── footer.tsx                     # Global footer with links and system status
│   │   ├── hero-background.tsx            # Decorative visual background for landing hero
│   │   ├── navbar.tsx                     # Global navigation bar with auth status & navigation
│   │   ├── particles-background.tsx       # Canvas-based dynamic knowledge graph particles
│   │   ├── progress-stepper.tsx           # Multi-step workflow visual progress indicator
│   │   ├── theme-provider.tsx             # Dark/Light theme switching provider
│   │   └── theme-toggle.tsx               # Dark/Light mode toggle button
│   ├── hooks/                             # Custom React hooks
│   │   ├── use-mobile.tsx                 # Viewport responsive breakpoint detector hook
│   │   └── use-toast.ts                   # Toast notification hook
│   ├── lib/                               # Client utility libraries
│   │   ├── export-pdf.ts                  # Client-side jsPDF & html2canvas report generator
│   │   ├── export-text.ts                 # Formatted plain-text analysis report exporter
│   │   ├── question-templates.ts          # Preset domain-specific question templates
│   │   └── utils.ts                       # Tailwind className merging utility (`cn`)
│   ├── package.json                       # Frontend dependencies & Next.js scripts
│   ├── tailwind.config.ts                 # Tailwind design tokens, typography & animations
│   └── tsconfig.json                      # Frontend TypeScript configuration
├── .env.local.example                     # Environment variable template
├── .gitignore                             # Git ignore file (ignoring secrets, builds & modules)
├── PROJECT_DOCUMENTATION.md               # Consolidated documentation file
├── render.yaml                            # Cloud deployment configuration for Render
└── README.md                              # Repository overview & quickstart guide
```

---

## 2. Backend Files Detailed Breakdown

### `backend/server.ts`
The central nervous system of the backend API.
- **Key Responsibilities**:
  - Initializes Express application, CORS rules, and Multer memory storage.
  - Manages multi-key Groq pool rotation (`withLlm`, `withFastLlm`).
  - Houses the complete `/api/analyze` pipeline: extraction $\to$ GraphRAG $\to$ synthesis.
  - Manages authentication routes (`/api/auth/signup`, `/api/auth/login`, `/api/auth/otp`).
  - Hosts auxiliary AI endpoints (`/api/summarize`, `/api/suggest-questions`, `/api/suggest-tags`, `/api/followup-stream`).
  - Implements the dual digital/scanned extraction engine (`extractTextFromFile`) and Krutidev sanitization (`cleanExtractedText`).

### `backend/lib/graphrag.ts`
The core Knowledge Graph engine.
- **Functions**:
  - `extractGraphFromChunk(chunk, llm)`: Invokes the fast 8B model to extract JSON entity and relation arrays.
  - `consolidateGraphs(chunkGraphs)`: Merges and deduplicates nodes and edges into a document-level graph.
  - `extractSeedEntities(query)`: Identifies key entities within the user's natural language question.
  - `retrieveSubGraph(seedEntities, maxHops)`: Performs multi-hop BFS traversal over document graph edges.
  - `formatGraphAsText(graph)`: Formats the retrieved sub-graph into a descriptive Markdown context block.

### `backend/lib/tee.ts`
The Trusted Execution Environment and security module.
- **Functions**:
  - `sealSecret(plainText)`: Encrypts values with AES-256-GCM using an in-memory master key, returning ciphertext, IV, and tag.
  - `unsealSecret(sealed)`: Authenticates and decrypts ciphertext within the TEE boundary.
  - `secureHash(data, salt)`: Salted SHA-256 HMAC for password storage.
  - `issueSessionToken(email, role, ttl)`: Issues timing-safe signed session tokens.
  - `verifySessionToken(token)`: Verifies signatures using `crypto.timingSafeEqual`.
  - `generateSecureOtp()`: Produces cryptographic 6-digit one-time passwords using OS entropy.

### `backend/lib/db.ts`
Data Access Layer (DAL) encapsulating all PostgreSQL SQL queries.
- **Functions**:
  - `getUserByEmail()`, `createUser()`, `updateUser()`: User account and profile management.
  - `getUserDocuments()`, `getDocumentByName()`, `upsertDocumentGraph()`: Document records and JSONB graph storage.
  - `saveQuestion()`, `getUserQuestions()`, `deleteQuestion()`: Historical Q&A persistence.
  - `createShareLink()`, `getShareLink()`: Public sharing tokens with expiration.
  - `logActivity()`, `getActivityLogs()`: Audit logging for user operations.

### `backend/lib/pg.ts`
PostgreSQL connection pooling.
- Creates and exports a single `pg.Pool` instance configured with connection limits, timeouts, and SSL parameters for Supabase.

### `backend/lib/storage.ts`
Object storage integration with Supabase Storage.
- Uploads extracted diagram/figure image buffers to the cloud storage bucket and returns persistent public URLs.

---

## 3. Frontend Files Detailed Breakdown

### Pages (`frontend/app/`)
- **`app/page.tsx`**: Landing page showcasing value propositions, animated knowledge graph hero, feature highlights, and calls to action.
- **`app/upload/page.tsx`**: Multi-file drag-and-drop ingestion interface with file preview, automatic summary generation, and tag suggestions.
- **`app/query/page.tsx`**: Query configuration screen allowing users to type questions, select pre-built domain templates, toggle language (English/Hindi), and select answer depth (Detailed vs. Concise).
- **`app/results/page.tsx`**: Results dashboard displaying comprehensive answers, expandable citations, inline diagram figures, confidence gauges, and PDF/Text export triggers.
- **`app/documents/page.tsx`**: Document management library displaying uploaded documents, file sizes, upload timestamps, and direct deletion options.
- **`app/history/page.tsx`**: Chronological log of previous questions asked, answers received, and cited documents.
- **`app/share/[shareId]/page.tsx`**: Publicly accessible, read-only analytical report view enabled by shareable tokens.
- **`app/admin/page.tsx`**: Administrative monitoring dashboard displaying user counts, total queries, storage utilization, and recent audit activity logs.

### Core Components (`frontend/components/`)
- **`components/auth-provider.tsx`**: Top-level React context tracking current user state, auth token, and login/logout methods with local storage persistence.
- **`components/particles-background.tsx`**: Canvas component computing real-time particle physics and drawing connecting lines based on proximity to visualize knowledge networks.
- **`components/follow-up-chat.tsx`**: Sliding drawer component providing interactive follow-up Q&A powered by Server-Sent Events (SSE) streaming.
- **`components/progress-stepper.tsx`**: Multi-step visual breadcrumb guiding the user through Upload $\to$ Query $\to$ Results.

---

## 4. Complete REST API Endpoints Catalog

| Method | Endpoint | Description | Request Body / Params | Response |
|---|---|---|---|---|
| **POST** | `/api/auth/signup` | Register new user account | `{ email, password, name }` | `{ success, user, token }` |
| **POST** | `/api/auth/login` | Authenticate user | `{ email, password }` | `{ success, user, token }` |
| **POST** | `/api/auth/otp` | Request or verify OTP | `{ email, action: 'request'\|'verify', otp }` | `{ success, message }` |
| **POST** | `/api/analyze` | Core GraphRAG document analysis | `Multipart: files[], questions, email, metadata` | `{ results: [{ question, answer, citation, confidence, sources }] }` |
| **POST** | `/api/summarize` | Generate document summary | `Multipart: file` | `{ summary, documentType }` |
| **POST** | `/api/suggest-questions` | Generate 3-5 relevant questions | `Multipart: file` | `{ questions: string[] }` |
| **POST** | `/api/suggest-tags` | Generate categorization tags | `Multipart: file` | `{ tags: string[] }` |
| **POST** | `/api/followup` | Single-turn follow-up question | `Multipart: file, question, history` | `{ answer }` |
| **POST** | `/api/followup-stream` | Streaming follow-up question | `Multipart: file, question, history` | `Server-Sent Events (SSE) stream` |
| **GET** | `/api/user/documents` | Fetch user uploaded documents | Header: `Authorization: Bearer <token>` | `{ documents: DocumentRow[] }` |
| **DELETE** | `/api/user/documents/:id` | Delete document record & graph | URL Param: `id` | `{ success: true }` |
| **GET** | `/api/user/questions` | Fetch user Q&A history | Header: `Authorization: Bearer <token>` | `{ questions: QuestionRow[] }` |
| **POST** | `/api/share` | Create 7-day shareable report link | `{ email, documentNames, answers }` | `{ shareId, shareUrl }` |
| **GET** | `/api/share/:shareId` | Retrieve public shared report | URL Param: `shareId` | `{ documentNames, answers, createdAt }` |
| **GET** | `/api/admin/stats` | Retrieve admin system metrics | Header: `Authorization: Bearer <token>` | `{ totalUsers, totalDocs, totalQueries, storageUsed }` |
