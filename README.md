# 🧠 DocuMind AI — Graph RAG Document Intelligence Platform

DocuMind AI is a state-of-the-art, dual-engine document analysis platform. It combines traditional **Retrieval-Augmented Generation (RAG)** with a structured **Knowledge Graph RAG (Graph RAG)** to extract deep insights, relationships, and concepts from complex documents (PDFs, Word documents, and text files).

Designed as a modern monorepo, the platform splits into an **Express + Node.js TypeScript Backend** and a **Next.js + TailwindCSS + Shadcn/ui Frontend**.

---

## 🌐 Live Deployments

Experience the fully operational platform live on the cloud:
* 🌐 **Live Web Application**: [https://documind-frontend-cl5e.onrender.com](https://documind-frontend-cl5e.onrender.com)
* ⚡ **Live API Service (Backend)**: [https://documind-production-b57a.up.railway.app](https://documind-production-b57a.up.railway.app)

---

## 🚀 Key Architectural Highlights

*   **Graph RAG Engine**: Generates a rich, interactive Knowledge Graph by extracting entities (nodes) and relations (edges) from document chunks using LangChain and LLMs, resolving and deduplicating duplicates.
*   **Dual-LLM Key-Model Failover**: Automatically cycles through multiple round-robin Groq API keys to bypass rate limits (using `llama-3.3-70b-versatile` and `llama-3.1-8b-instant`), falling back seamlessly to OpenRouter free models if Groq is fully exhausted.
*   **Simulated Trusted Execution Environment (TEE)**: Ensures security by routing sensitive operations (such as password hashing and token operations) through an isolated, secure execution interface.
*   **Dual-Database Isolation**: Uses two distinct MongoDB databases (`documind_auth` for secure credentials and account details, and `documind_data` for document metadata, analysis logs, and Q&A history) using a unified connection wrapper.
*   **Advanced File Parsing & Static Asset Extraction**: Combines text extraction with custom JPEG stream-carving from PDFs and HTML- Mammoth image conversion from DOCX files, feeding these inline directly into Next.js.
*   **Vector Integration & Search**: Supports traditional semantic search alongside graph retrieval for high-fidelity answer matching.

---

## 📂 Project Structure

```text
DocuMind/
├── backend/                  # Express.js + Node.js TypeScript Server
│   ├── lib/                  # Graph RAG, MongoDB connections, TEE logic
│   ├── models/               # Mongoose Schemas (User, Documents, Questions)
│   ├── dist/                 # Compiled JavaScript output (gitignored)
│   ├── server.ts             # Main Express API entrypoint
│   └── tsconfig.json         # TypeScript compiler configurations
│
├── frontend/                 # Next.js 14 Web Application
│   ├── app/                  # Pages (Dashboard, Query, Share, History, Admin)
│   ├── components/           # UI components (Shadcn, Particles, Theme toggle)
│   ├── hooks/                # React Hooks
│   ├── lib/                  # PDF export, Vector Store client, utilities
│   └── public/               # Static assets & dynamic extracted images
│
└── README.md                 # Main Documentation Portal
```

---

## 🛠️ Local Setup Guide

Follow these steps to run both the backend API and the frontend client locally on your machine.

### Prerequisites
*   Node.js (v18.x or newer)
*   npm, yarn, or pnpm
*   MongoDB Atlas Account (or local MongoDB)
*   Groq API Key (or OpenRouter API Key)
*   Pinecone Database Account & Index

---

### Step 1: Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file inside the `backend` folder and populate it:
   ```env
   PORT=5001
   MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/documind?retryWrites=true&w=majority
   GROQ_API_KEY=your_groq_api_key
   GROQ_API_KEY_2=your_second_groq_key_optional
   EMAIL_PASS=your_gmail_app_password_for_support_mailer
   ```
4. Spin up the backend dev server:
   ```bash
   npm run dev
   ```
   The backend will start running locally at [http://localhost:5001](http://localhost:5001).

---

### Step 2: Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file inside the `frontend` folder:
   ```env
   # API Backend URL connection
   NEXT_PUBLIC_BACKEND_URL=http://localhost:5001

   # AI Credentials
   GROQ_API_KEY=your_groq_api_key
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_INDEX=documind
   COHERE_API_KEY=your_cohere_key_for_reranking
   
   # Shared Database config
   MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/documind?retryWrites=true&w=majority
   EMAIL_PASS=your_gmail_app_password
   ```
4. Start the frontend Next.js development server:
   ```bash
   npm run dev
   ```
   The client application will start at [http://localhost:3000](http://localhost:3000).

---

## 🌐 Render Deployment Strategy

DocuMind is successfully deployed on Render as two separate **Web Services** from this single GitHub repository by utilizing the **Root Directory** configuration setting.

### 1. Backend Service (`documind-backend`)
*   **Live API Endpoint**: [https://documind-production-b57a.up.railway.app](https://documind-production-b57a.up.railway.app)
*   **Service Type**: Web Service
*   **Root Directory**: `backend`
*   **Language**: `Node`
*   **Build Command**: `npm install --legacy-peer-deps && npm run build`
*   **Start Command**: `npm start` (Runs optimized `node dist/server.js`)
*   **Environment Variables**: Configured `PORT` (5001), `MONGO_URI`, `GROQ_API_KEY`, `EMAIL_PASS`, and `OPENROUTER_API_KEY`.

### 2. Frontend Application (`documind-frontend`)
*   **Live Web URL**: [https://documind-frontend-cl5e.onrender.com](https://documind-frontend-cl5e.onrender.com)
*   **Service Type**: Web Service
*   **Root Directory**: `frontend`
*   **Language**: `Node`
*   **Build Command**: `npm install --legacy-peer-deps && npm run build`
*   **Start Command**: `npm start`
*   **Environment Variables**: Configured `NEXT_PUBLIC_BACKEND_URL` (pointing to `https://documind-production-b57a.up.railway.app`), `MONGO_URI`, `EMAIL_PASS`, and your `GROQ_API_KEY`, `PINECONE_API_KEY`, and `COHERE_API_KEY`.

---

## ⚡ Key Scripts (Monorepo)

*   `npm run build` (Inside `/backend`): Compiles TypeScript source files cleanly into JavaScript `/dist`.
*   `npm run build` (Inside `/frontend`): Builds the Next.js production web bundle.
*   `npm run dev` (Inside `/backend` or `/frontend`): Starts respective hot-reloading dev environments.
