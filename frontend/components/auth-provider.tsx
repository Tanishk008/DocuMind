"use client"

import type React from "react"
import { createContext, useContext, useEffect, useRef, useState } from "react"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001"


export interface DocumentMetadata {
  id: string
  name: string
  size: number
  type: string
  url: string
  content?: string
  summary?: string
  documentType?: string
  tags?: string[]
  uploadedAt: Date
}

export interface QuestionMetadata {
  id: string
  text: string
  timestamp: Date
  answerMode?: "concise" | "detailed"
  language?: string
}

export interface User {
  id: string
  email: string
  name: string
  role: "admin" | "user"
  phone?: string
  address?: string
  documents?: DocumentMetadata[]
  questions?: QuestionMetadata[]
  currentStep?: number
}

interface AuthContextType {
  user: User | null
  authToken: string | null
  login: (email: string, password: string) => Promise<boolean>
  checkCredentials: (email: string, password: string) => Promise<User | null>
  commitSession: (user: User) => void
  signup: (email: string, password: string, name: string) => Promise<boolean>
  updateProfile: (data: Partial<User>) => void
  logout: () => void
  loading: boolean
  files: File[]
  setFiles: (files: File[]) => void
  getRestoredFiles: () => Promise<File[]>
  // New synced states
  documents: DocumentMetadata[]
  setDocuments: (docs: DocumentMetadata[] | ((prev: DocumentMetadata[]) => DocumentMetadata[])) => void
  questions: QuestionMetadata[]
  setQuestions: (qs: QuestionMetadata[]) => void
  currentStep: number
  setCurrentStep: (step: number) => void
  storageInfo: { storageUsed: number; storageLimit: number; percentUsed: number }
  refreshStorage: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [files, setFilesState] = useState<File[]>([])
  const [storageInfo, setStorageInfo] = useState({ storageUsed: 0, storageLimit: 50 * 1024 * 1024, percentUsed: 0 })

  // Synced from DB
  const [documents, setDocumentsState] = useState<DocumentMetadata[]>([])
  const [questions, setQuestionsState] = useState<QuestionMetadata[]>([])
  const [currentStep, setCurrentStepState] = useState<number>(1)

  // Holds the token from the most recent successful checkCredentials() call so commitSession()
  // (invoked separately, after OTP verification) can persist it alongside the user.
  const lastIssuedTokenRef = useRef<string | null>(null)

  // Keep a ref to always access the latest user inside callbacks (avoids stale closures)
  const userRef = useRef<User | null>(null)
  useEffect(() => { userRef.current = user }, [user])

  // Keep a ref to always access the latest documents inside functional updates (avoids stale closures)
  const documentsRef = useRef<DocumentMetadata[]>([])
  useEffect(() => { documentsRef.current = documents }, [documents])

  useEffect(() => {
    // 1. Purge ALL legacy localStorage data permanently
    const legacyKeys = ["documind_users", "documind_total_queries", "user", "documents", "questions", "currentStep"]
    legacyKeys.forEach(key => localStorage.removeItem(key))

    // 2. Load active session from sessionStorage
    const sessionUser = sessionStorage.getItem("active_session")
    const savedToken = sessionStorage.getItem("active_token")
    if (savedToken) setAuthToken(savedToken)
    if (sessionUser) {
      try {
        const parsedUser = JSON.parse(sessionUser) as User
        setUser(parsedUser)
        setDocumentsState(parsedUser.documents || [])
        
        // Restore active questions from sessionStorage or start clean
        const activeQuestions = sessionStorage.getItem("active_questions")
        if (activeQuestions) {
          try {
            setQuestionsState(JSON.parse(activeQuestions))
          } catch (e) {
            setQuestionsState([])
          }
        } else {
          setQuestionsState([])
        }
        
        setCurrentStepState(parsedUser.currentStep || 1)
      } catch (e) {
        console.error("Failed to restore session", e)
      }
    }
    setLoading(false)
  }, [])

  // Sync Documents to DB — uses userRef to avoid stale closure
  // Accepts either a new array or a React-style updater function based on the previous documents
  const setDocuments = (docsOrUpdater: DocumentMetadata[] | ((prev: DocumentMetadata[]) => DocumentMetadata[])) => {
    const newDocs = typeof docsOrUpdater === "function"
      ? (docsOrUpdater as (prev: DocumentMetadata[]) => DocumentMetadata[])(documentsRef.current)
      : docsOrUpdater
    setDocumentsState(newDocs)
    const currentUser = userRef.current
    if (currentUser && currentUser.role === "user") {
      console.log("[DB] Syncing", newDocs.length, "documents for", currentUser.email)
      
      let docsToSync = newDocs
      try {
        const raw = sessionStorage.getItem("uploadedFiles")
        const serialized = raw ? JSON.parse(raw) : []
        docsToSync = newDocs.map((doc) => {
          const found = serialized.find((f: any) => f.name === doc.name)
          return {
            ...doc,
            content: found ? found.data : (doc as any).content || "",
          }
        })
      } catch (e) {
        console.error("Failed to inject file bytes into document sync payload", e)
      }

      fetch(`${BACKEND_URL}/api/user/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentUser.email, documents: docsToSync })
      }).then(r => r.json()).then(d => {
        console.log("[DB] Documents saved:", d.documents?.length ?? d)
        // Refresh storage stats after sync
        refreshStorage(currentUser.email)
      }).catch(err => console.error("Sync documents failed", err))
    } else {
      console.warn("[DB] setDocuments skipped — no user or admin role", currentUser?.role)
    }
  }

  const refreshStorage = (emailOverride?: string) => {
    const email = emailOverride || userRef.current?.email
    if (!email || userRef.current?.role !== "user") return
    fetch(`${BACKEND_URL}/api/user/storage?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setStorageInfo({ storageUsed: d.storageUsed, storageLimit: d.storageLimit, percentUsed: d.percentUsed }) })
      .catch(err => console.error("Storage fetch failed", err))
  }

  // Sync Questions to DB — uses userRef to avoid stale closure
  // Save Questions to sessionStorage to isolate from history DB — uses userRef to avoid stale closure
  const setQuestions = (newQs: QuestionMetadata[]) => {
    setQuestionsState(newQs)
    sessionStorage.setItem("active_questions", JSON.stringify(newQs))
    console.log("[ActiveQueue] Saved", newQs.length, "questions to sessionStorage")
  }

  // Sync currentStep
  const setCurrentStep = (step: number) => {
    setCurrentStepState(step)
    const currentUser = userRef.current
    if (currentUser && currentUser.role === "user") {
      fetch(`${BACKEND_URL}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentUser.email, currentStep: step })
      }).catch(err => console.error("Sync currentStep failed", err))
    }
  }

  // Persist file bytes to sessionStorage so they survive page navigation
  // Reads a File to a base64 string via FileReader instead of
  // btoa(String.fromCharCode(...bytes)) — spreading a large byte array as individual
  // function arguments blows the JS engine's call-stack argument limit (~65K-120K elements),
  // so that approach reliably crashed on any real-world multi-page PDF or scanned document.
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Strip the "data:<mime>;base64," prefix added by readAsDataURL
        resolve(result.slice(result.indexOf(",") + 1))
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  const setFiles = (newFiles: File[]) => {
    setFilesState(newFiles)
    const storeFiles = async () => {
      const serialized: { name: string; type: string; data: string }[] = []
      for (const f of newFiles) {
        const b64 = await fileToBase64(f)
        serialized.push({ name: f.name, type: f.type, data: b64 })
      }
      sessionStorage.setItem("uploadedFiles", JSON.stringify(serialized))
    }
    storeFiles().catch(console.error)
  }

  const getRestoredFiles = async (): Promise<File[]> => {
    if (files.length > 0) return files
    const raw = sessionStorage.getItem("uploadedFiles")
    if (!raw) return []
    try {
      const serialized: { name: string; type: string; data: string }[] = JSON.parse(raw)
      return serialized.map(({ name, type, data }) => {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
        return new File([bytes], name, { type })
      })
    } catch (e) {
      return []
    }
  }

  const login = async (email: string, password: string): Promise<boolean> => {
    const validUser = await checkCredentials(email, password)
    if (validUser) {
      commitSession(validUser)
      return true
    }
    return false
  }

  // Always verified server-side — including the admin account, which used to be checked
  // against a password hardcoded directly in this file (shipped to every visitor's browser).
  const checkCredentials = async (email: string, password: string): Promise<User | null> => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      })
      const data = await response.json()
      if (data.success && data.user) {
        lastIssuedTokenRef.current = data.token || null
        return data.user
      }
    } catch (e) {
      console.error(e)
    }
    
    return null
  }

  const commitSession = (userObj: User) => {
    setUser(userObj)
    setDocumentsState(userObj.documents || [])

    // Decouple active questions queue from historical userObj.questions
    const activeQuestions = sessionStorage.getItem("active_questions")
    if (activeQuestions) {
      try {
        setQuestionsState(JSON.parse(activeQuestions))
      } catch (e) {
        setQuestionsState([])
      }
    } else {
      setQuestionsState([])
    }

    setCurrentStepState(userObj.currentStep || 1)
    sessionStorage.setItem("active_session", JSON.stringify(userObj))

    // Persist the token issued by the most recent checkCredentials()/signup() call
    const token = lastIssuedTokenRef.current
    setAuthToken(token)
    if (token) sessionStorage.setItem("active_token", token)
    else sessionStorage.removeItem("active_token")

    // Fetch storage info on login
    if (userObj.role === "user") {
      setTimeout(() => refreshStorage(userObj.email), 500)
    }
  }

  const signup = async (email: string, password: string, name: string): Promise<boolean> => {
    // Not a secret — just a client-side UX guard; the backend independently rejects this too.
    if (email === "documindai008@gmail.com") return false

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name })
      })
      const data = await response.json()

      if (data.success && data.user) {
        lastIssuedTokenRef.current = data.token || null
        commitSession(data.user)
        return true
      }
    } catch (e) {
      console.error(e)
    }

    return false
  }

  const updateProfile = async (data: Partial<User>) => {
    if (!user) return

    const updatedUser = { ...user, ...data }
    setUser(updatedUser)
    sessionStorage.setItem("active_session", JSON.stringify(updatedUser))

    if (user.role === "user") {
      try {
        await fetch(`${BACKEND_URL}/api/profile`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, ...data })
        })
      } catch (e) {
        console.error("Failed to update profile to cloud", e)
      }
    }
  }

  const logout = () => {
    setUser(null)
    setAuthToken(null)
    setDocumentsState([])
    setQuestionsState([])
    setCurrentStepState(1)
    sessionStorage.clear() // Wipes user, token, and files
    window.location.href = "/auth"
  }

  return (
    <AuthContext.Provider value={{
      user, authToken, login, checkCredentials, commitSession, signup, updateProfile, logout, loading,
      files, setFiles, getRestoredFiles,
      documents, setDocuments, questions, setQuestions, currentStep, setCurrentStep,
      storageInfo, refreshStorage
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
