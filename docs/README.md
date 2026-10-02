# 📚 DocuMind AI — Engineering & Interview Documentation Directory

Welcome to the comprehensive technical documentation for **DocuMind AI**. This directory is structured as a complete, self-contained reference guide designed for deep technical study, resume preparation, system design discussions, and coding interviews.

---

## 📂 Documentation Directory Structure

```
docs/
├── README.md                              # This master index & overview
├── 01-architecture-and-flowcharts.md      # End-to-end architectures & Mermaid flowcharts
├── 02-technology-deep-dive.md             # Deep dive into every library, tool & algorithm
├── 03-codebase-directory-and-file-map.md  # File-by-file codebase breakdown & call graphs
├── 04-database-schema-and-models.md       # PostgreSQL (Supabase) tables, ER diagrams & JSONB
└── 05-resume-and-interview-handbook.md    # Resume bullets, STAR stories & 20+ interview Q&As
```

---

## 🧭 Navigation Guide

| Chapter | Title | Focus Area |
|---|---|---|
| **[01. Architecture & Flowcharts](./01-architecture-and-flowcharts.md)** | System & Pipeline Flowcharts | High-level architecture, Dual-mode Ingestion, GraphRAG multi-hop traversal, TEE security boundary, and Multi-Key LLM failover. |
| **[02. Technology Deep-Dive](./02-technology-deep-dive.md)** | Component & Engine Deep-Dive | Why each technology was selected, how it functions under the hood, and architectural trade-offs (e.g., GraphRAG vs. Vector, PostgreSQL vs. Neo4j). |
| **[03. Codebase File Map](./03-codebase-directory-and-file-map.md)** | Directory & File Walkthrough | Detailed file-by-file description of `backend/` and `frontend/`, tracking API endpoints, helper utilities, and UI components. |
| **[04. Database Schema & Data Models](./04-database-schema-and-models.md)** | Storage & Relational Design | Supabase/PostgreSQL tables, triggers, indexes, and sample JSONB payloads for knowledge graph nodes and edges. |
| **[05. Resume & Interview Handbook](./05-resume-and-interview-handbook.md)** | Interview Preparation | Tailored resume bullet points, behavioral STAR frameworks, system design defenses, and 20+ technical interview questions with model answers. |

---

## ⚡ High-Level Project Summary

- **Project Name**: DocuMind AI
- **Core Domain**: Multi-Modal Document Intelligence, Graph-Augmented Retrieval (GraphRAG), Confidential Computing (TEE Simulation), Multi-Lingual OCR.
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Radix UI Primitives, Framer Motion, HTML5 Canvas.
- **Backend**: Node.js, Express.js, TypeScript, LangChain, Multer, Tesseract.js (`eng+hin`), `pdf-parse`, `mammoth`.
- **Inference Layer**: Groq Cloud API (Llama 3.3 70B Versatile, Llama 3.1 8B Instant, Mixtral 8x7B) with automated multi-key rotation and rate-limit backoff.
- **Database & Object Storage**: PostgreSQL (Supabase) with connection pooling (`pg.Pool`), JSONB indexing, and Supabase Storage for extracted figure diagrams.
- **Security & Privacy**: AES-256-GCM envelope encryption, timing-safe HMAC-SHA256 session management, and cryptographic memory sanitation.
