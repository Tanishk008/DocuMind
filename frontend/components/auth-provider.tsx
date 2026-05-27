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
  setDocuments: (docs: DocumentMetadata[]) => void
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
  const [loading, setLoading] = useState(true)
  const [files, setFilesState] = useState<File[]>([])
  const [storageInfo, setStorageInfo] = useState({ storageUsed: 0, storageLimit: 50 * 1024 * 1024, percentUsed: 0 })
  
  // Synced from DB
  const [documents, setDocumentsState] = useState<DocumentMetadata[]>([])
  const [questions, setQuestionsState] = useState<QuestionMetadata[]>([])
  const [currentStep, setCurrentStepState] = useState<number>(1)

  // Keep a ref to always access the latest user inside callbacks (avoids stale closures)
  const userRef = useRef<User | null>(null)
  useEffect(() => { userRef.current = user }, [user])

  useEffect(() => {
    // 1. Purge ALL legacy localStorage data permanently
    const legacyKeys = ["documind_users", "documind_total_queries", "user", "documents", "questions", "currentStep"]
    legacyKeys.forEach(key => localStorage.removeItem(key))

    // 2. Load active session from sessionStorage
    const sessionUser = sessionStorage.getItem("active_session")
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
  const setDocuments = (newDocs: DocumentMetadata[]) => {
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
  const setFiles = (newFiles: File[]) => {
    setFilesState(newFiles)
    const storeFiles = async () => {
      const serialized: { name: string; type: string; data: string }[] = []
      for (const f of newFiles) {
        const buf = await f.arrayBuffer()
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
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

  const checkCredentials = async (email: string, password: string): Promise<User | null> => {
    if (email === "documindai008@gmail.com") {
      if (password === "Tanishk#1234") {
        return { id: "admin", email, name: "Admin", role: "admin" }
      }
      return null
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      })
      const data = await response.json()
      if (data.success && data.user) {
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
    // Fetch storage info on login
    if (userObj.role === "user") {
      setTimeout(() => refreshStorage(userObj.email), 500)
    }
  }

  const signup = async (email: string, password: string, name: string): Promise<boolean> => {
    if (email === "documindai008@gmail.com") return false

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name })
      })
      const data = await response.json()
      
      if (data.success && data.user) {
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
    setDocumentsState([])
    setQuestionsState([])
    setCurrentStepState(1)
    sessionStorage.clear() // Wipes user and files
    window.location.href = "/auth"
  }

  return (
    <AuthContext.Provider value={{ 
      user, login, checkCredentials, commitSession, signup, updateProfile, logout, loading, 
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
