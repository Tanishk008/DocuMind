# 01 — Architecture & System Flowcharts

This document details the complete architectural blueprints and lifecycle flowcharts of **DocuMind AI** using **Mermaid diagrams** and visual process models.

---

## 1. High-Level End-to-End System Architecture

```mermaid
graph TD
    subgraph ClientLayer ["1. Client Layer (Next.js 14)"]
        UI["User Interface (App Router)"]
        Canvas["Particle Canvas Background"]
        Theme["Theme Provider (Dark/Light)"]
        Export["Client PDF / Text Exporter"]
    end

    subgraph APILayer ["2. API & Routing Layer (Express + TypeScript)"]
        Router["Express Server (/api/*)"]
        Multer["Multer Streaming Parser"]
        AuthMiddleware["TEE Session Verifier"]
    end

    subgraph IngestionLayer ["3. Ingestion & Parsing Engine"]
        ParserDispatch{"File Type & Mode"}
        PDFParse["pdf-parse (Digital PDFs)"]
        Mammoth["Mammoth (DOCX Documents)"]
        ImgExtractor["Stream JPEG Extractor (/DCTDecode)"]
        Tesseract["Tesseract.js OCR (eng + hin)"]
        KrutidevClean["Krutidev Garble Filter"]
    end

    subgraph IntelligenceLayer ["4. GraphRAG & AI Reasoning Engine"]
        Chunker["Recursive Character Text Splitter"]
        EntityExtract["Fast LLM Entity & Relation Extraction"]
        Consolidator["Graph Deduplication & Normalizer"]
        SeedExtractor["Query Seed Entity Extractor"]
        BFSTraversal["Multi-Hop BFS Sub-graph Retrieval"]
        SynthesisPrompt["Synthesis Prompt Assembly (Context + Graph + Figures)"]
    end

    subgraph SecurityLayer ["5. TEE & Confidential Computing"]
        EnclaveKey["Master Enclave Key (32-byte RNG)"]
        AESGCM["AES-256-GCM Envelope Encryption"]
        TimingSafe["crypto.timingSafeEqual Token Validator"]
        Scrubber["In-Memory Buffer Zeroization"]
    end

    subgraph LLMLayer ["6. Resilient LLM Inference (Groq)"]
        KeyRotator["Multi-Key Round-Robin Rotator"]
        FastLLM["Llama 3.1 8B Instant (Extraction Tier)"]
        DeepLLM["Llama 3.3 70B / Mixtral 8x7B (Reasoning Tier)"]
        Backoff["Exponential Backoff & Fallback Engine"]
    end

    subgraph DataLayer ["7. Persistence & Cloud Storage"]
        SupabasePG[("PostgreSQL Database (Supabase)")]
        UserTable["users Table"]
        DocTable["user_documents Table (JSONB Graph)"]
        QATable["user_questions Table"]
        SupabaseStorage["Supabase Object Storage (Diagram Assets)"]
    end

    UI -->|HTTPS / Multipart| Multer
    Multer --> Router
    Router --> AuthMiddleware
    AuthMiddleware <--> SecurityLayer
    Router --> ParserDispatch

    ParserDispatch -->|Digital PDF| PDFParse
    ParserDispatch -->|Word File| Mammoth
    ParserDispatch -->|Scanned PDF < 150 chars| ImgExtractor
    ImgExtractor --> Tesseract
    PDFParse --> KrutidevClean
    Tesseract --> KrutidevClean

    KrutidevClean --> Chunker
    Chunker --> EntityExtract
    EntityExtract --> Consolidator
    Consolidator --> DocTable

    UI -->|Natural Language Query| Router
    Router --> SeedExtractor
    SeedExtractor --> BFSTraversal
    DocTable -->|Load JSONB Graph| BFSTraversal
    BFSTraversal --> SynthesisPrompt
    Chunker --> SynthesisPrompt
    SynthesisPrompt --> KeyRotator
    KeyRotator --> FastLLM
    KeyRotator --> DeepLLM
    DeepLLM --> Backoff
    DeepLLM --> Router
    Router --> UI
    DocTable --> SupabasePG
    UserTable --> SupabasePG
    QATable --> SupabasePG
    ImgExtractor -->|Upload Figure Diagrams| SupabaseStorage
```

---

## 2. Document Ingestion & Dual OCR Pipeline Flowchart

This flowchart illustrates how DocuMind determines whether a document is digital or scanned, extracts raw text and figures, cleans legacy Hindi font artifacts, and readies content for indexing.

```mermaid
flowchart TD
    Start(["File Upload Received via Multer"]) --> DetectMime{"Detect File Extension"}
    
    DetectMime -->|DOCX| ParseDocx["mammoth.extractRawText()"]
    DetectMime -->|TXT| ParseTxt["Read UTF-8 Buffer"]
    DetectMime -->|PDF| ParseDigital["Execute pdf-parse module"]

    ParseDigital --> CheckLength{"Extracted Clean Length < 150 chars?"}
    
    CheckLength -->|No: Digital PDF| CleanText["Run cleanExtractedText()"]
    CheckLength -->|Yes: Scanned PDF| ScanBuffer["Scan Buffer for /Subtype /Image"]
    
    ScanBuffer --> MatchDCT{"Check /DCTDecode (JPEG Stream)?"}
    MatchDCT -->|Yes| SliceStream["Extract raw JPEG image buffers between 'stream' and 'endstream'"]
    MatchDCT -->|No| SkipStream["Advance offset"]
    
    SliceStream --> RunTesseract["Run Tesseract.js (languages: 'eng+hin')"]
    RunTesseract --> AggregateOCR["Join OCR page text into extractedText"]
    AggregateOCR --> CleanText

    ParseDocx --> CleanText
    ParseTxt --> CleanText

    subgraph KrutidevSanitizer ["Legacy Indian Font (Krutidev) Sanitization"]
        CleanText --> LineLoop["Iterate through each line"]
        LineLoop --> HasUnicode{"Contains Devanagari Unicode (U+0900 - U+097F)?"}
        HasUnicode -->|Yes| StripGarbledTokens["Strip isolated non-vowel ASCII runs; retain Devanagari"]
        HasUnicode -->|No| CheckLatin{"Contains Latin text (3+ chars)?"}
        CheckLatin -->|Yes| HeuristicCheck{"Consonant/Vowel ratio & signature check ('vUrxZr', 'ikfydk')"}
        HeuristicCheck -->|Garbled ASCII| DropLine["Drop line as corrupted font legacy mapping"]
        HeuristicCheck -->|Valid English| KeepLine["Preserve genuine English text"]
        CheckLatin -->|No| KeepLine
    end

    StripGarbledTokens --> ExtractDiagrams["Extract Figure / Diagram Image Streams"]
    DropLine --> ExtractDiagrams
    KeepLine --> ExtractDiagrams

    ExtractDiagrams --> UploadS3["Upload Figure JPGs to Supabase Storage Bucket"]
    UploadS3 --> AssociateCaptions["Pair with Caption Regex (e.g. 'Figure 1: ...')"]
    AssociateCaptions --> ReadyForGraphRAG(["Emit Sanitized Document with Inline Markdown Figures"])
```

---

## 3. GraphRAG Pipeline: Extraction, Consolidation, Traversal & Synthesis

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Client
    participant API as Express API Server
    participant Splitter as Text Splitter (3,000 char chunks)
    participant FastLLM as Groq Fast LLM (8B)
    participant DB as Supabase PostgreSQL (JSONB)
    participant DeepLLM as Groq Deep LLM (70B)

    Note over User, API: Phase 1: Ingestion & Knowledge Graph Construction
    User->>API: Upload Document
    API->>DB: Check if document graph already exists in JSONB
    alt Graph exists in DB
        DB-->>API: Return existing { nodes, edges }
    else Graph does not exist
        API->>Splitter: Split text into small chunks
        Splitter-->>API: Chunks array [chunk1, chunk2, ...]
        loop For each batch of chunks (Concurrent Batch: 3)
            API->>FastLLM: Prompt: Extract entities (nodes) & relations (edges) in JSON
            FastLLM-->>API: Strict JSON: { nodes: [...], edges: [...] }
        end
        API->>API: consolidateGraphs(): Deduplicate IDs, merge descriptions & edges
        API->>DB: Upsert user_documents (doc_id, nodes JSONB, edges JSONB)
    end

    Note over User, API: Phase 2: Relational Query Resolution (Multi-Hop BFS)
    User->>API: Query: "How does Company X's policy affect Department Y?"
    API->>FastLLM: extractSeedEntities(query)
    FastLLM-->>API: Return seed entities: ["Company X", "Department Y"]
    
    API->>API: retrieveSubGraph(seedEntities, maxHops=2)
    Note over API: BFS traversal through edges where source or target matches visited nodes
    API->>API: formatGraphAsText(subGraph)
    
    Note over API: Phase 3: Augmented Prompt Synthesis
    API->>DeepLLM: Send Combined Prompt: [Document Raw Chunks] + [Formatted Sub-Graph] + [Inline Diagrams]
    DeepLLM-->>API: Comprehensive Answer + Exact Citation + Confidence Score
    API->>DB: Record user_questions (query, answer, citation, sources)
    API-->>User: Return Structured JSON Answer & Inline Figure Visuals
```

---

## 4. Confidential Computing / TEE Simulation Flowchart

```mermaid
flowchart TD
    subgraph HostMemory ["Host Operating System Memory"]
        RawIncoming["Sensitive Payload (e.g., Auth Tokens, File Metadata)"]
    end

    subgraph EnclaveBoundary ["Trusted Execution Environment (TEE) Security Boundary"]
        EnclaveKey["Master Enclave Key (32-byte Cryptographic Random)"]
        
        subgraph EncryptionOperation ["sealSecret()"]
            IVGen["Generate 12-byte Random IV"]
            CipherInit["Initialize AES-256-GCM (Key, IV)"]
            CipherRun["Encrypt plaintext to hexadecimal ciphertext"]
            TagExtract["Extract 16-byte GCM Authentication Tag"]
            SealedStruct["Sealed Envelope: { ciphertext, iv, tag }"]
        end

        subgraph DecryptionOperation ["unsealSecret()"]
            DecipherInit["Initialize AES-256-GCM Decipher (Key, IV)"]
            SetAuthTag["Set Authentication Tag (tamper verification)"]
            PlaintextYield["Decrypt to plaintext inside boundary"]
        end

        subgraph AuthenticationOperation ["Timing-Safe Auth & Session"]
            PayloadB64["Payload: { email, role, exp }"]
            HMACSign["HMAC-SHA256(payload, sessionSecret)"]
            TokenGen["Issued Token: base64url(payload).base64url(sig)"]
            TimingEqual["crypto.timingSafeEqual(sig, expectedSig)"]
        end

        subgraph Sanitization ["Buffer Scrubbing"]
            Zeroize["Immediate zeroization of temporary buffers after execution"]
        end
    end

    RawIncoming --> IVGen
    IVGen --> CipherInit
    EnclaveKey --> CipherInit
    CipherInit --> CipherRun
    CipherRun --> TagExtract
    TagExtract --> SealedStruct

    SealedStruct --> DecipherInit
    EnclaveKey --> DecipherInit
    DecipherInit --> SetAuthTag
    SetAuthTag --> PlaintextYield
    PlaintextYield --> Zeroize

    PayloadB64 --> HMACSign
    HMACSign --> TokenGen
    TokenGen --> TimingEqual
```

---

## 5. Multi-Key LLM Routing & Exponential Backoff Flowchart

```mermaid
flowchart TD
    Req["LLM Request Dispatched (extractGraph / analyzeQuery)"] --> SelectKey["Get Key from Pool using Round-Robin Pointer: keys[roundRobinIndex % totalKeys]"]
    SelectKey --> ModelSelect{"Task Type"}
    
    ModelSelect -->|Graph Extraction / Tags| ModelFast["Model: llama-3.1-8b-instant"]
    ModelSelect -->|Deep Analysis / Q&A| ModelDeep["Model: llama-3.3-70b-versatile"]
    
    ModelFast --> Exec["Execute Groq API Call"]
    ModelDeep --> Exec
    
    Exec --> Success{"API Call Succeeded?"}
    Success -->|Yes| ReturnResult(["Return Formatted Response"])
    
    Success -->|No: Error Caught| CheckErr{"Error Status == 429 (Rate Limit)?"}
    
    CheckErr -->|Yes| IncPointer["Advance Round-Robin Key Pointer to Next Key"]
    IncPointer --> CalcDelay["Calculate Exponential Backoff Delay with Random Jitter: 2^attempt * 500ms + rand(200ms)"]
    CalcDelay --> Wait["Wait Delay Period"]
    Wait --> Retry{"Retries < MAX_RETRIES (3)?"}
    Retry -->|Yes| SelectKey
    Retry -->|No| FallbackModel["Downgrade to Fallback Model (e.g. mixtral-8x7b-32768)"]
    FallbackModel --> Exec

    CheckErr -->|No: Other Error| Fail(["Throw Error to Caller"])
```

---

## 6. Authentication & Session Lifecycle Flowchart

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Frontend as Next.js Auth Page
    participant Server as Express Server
    participant TEE as TEE Layer
    participant DB as PostgreSQL (Supabase)

    Note over User, DB: User Registration / Login
    User->>Frontend: Enter Email & Password
    Frontend->>Server: POST /api/auth/login { email, password }
    Server->>DB: SELECT * FROM users WHERE email = $1
    DB-->>Server: Return User Row
    Server->>TEE: Compare TEE.secureHash(password, salt)
    alt Password Valid
        Server->>TEE: issueSessionToken(email, role)
        Note over TEE: Creates HMAC-SHA256 signature
        TEE-->>Server: Return sessionToken: payloadB64.signatureB64
        Server-->>Frontend: HTTP 200 { user, token }
        Frontend->>Frontend: Store in localStorage & AuthContext
    else Password Invalid
        Server-->>Frontend: HTTP 401 Invalid Credentials
    end

    Note over User, DB: Protected API Call
    User->>Frontend: Trigger "Upload Document" or "Run Query"
    Frontend->>Server: POST /api/analyze (Header: Authorization: Bearer <token>)
    Server->>TEE: verifySessionToken(token)
    Note over TEE: Checks signature with crypto.timingSafeEqual and verifies exp
    alt Token Valid
        TEE-->>Server: Return claims { email, role }
        Server->>Server: Execute Document Analysis
        Server-->>Frontend: HTTP 200 { results }
    else Token Expired or Tampered
        TEE-->>Server: Return null
        Server-->>Frontend: HTTP 401 Unauthorized
        Frontend->>Frontend: Redirect to /auth
    end
```
