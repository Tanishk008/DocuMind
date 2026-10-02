"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProgressStepper } from "@/components/progress-stepper"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { MessageSquare, Send, FileText, ArrowRight, Plus, X, Sparkles, Brain, Loader2, AlignLeft, BookOpen, Globe, GitCompare, LayoutTemplate } from "lucide-react"
import { QUESTION_TEMPLATES, DOC_TYPE_LABEL_MAP } from "@/lib/question-templates"

interface Question {
  id: string
  text: string
  timestamp: Date
  answerMode: "concise" | "detailed"
  language: string
  compareMode?: boolean
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001"

const FALLBACK_QUESTIONS = [
  "What is the main topic or purpose of this document?",
  "Summarize the key points mentioned in this document.",
  "What are the terms and conditions described?",
  "Who are the parties involved in this document?",
  "What are the important dates or deadlines mentioned?",
  "What actions or steps are required according to this document?",
  "What conclusions or recommendations are made?",
  "What evidence or supporting data is provided?",
]

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिंदी" },
  { code: "bn", label: "বাংলা" },
  { code: "mr", label: "मराठी" },
]

export default function QueryPage() {
  const [currentQuestion, setCurrentQuestion] = useState("")
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(FALLBACK_QUESTIONS)
  const [suggestDocName, setSuggestDocName] = useState<string>("")
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState("en")
  const [defaultMode, setDefaultMode] = useState<"concise" | "detailed">("detailed")
  const [compareMode, setCompareMode] = useState(false)
  const { user, loading, documents, questions, setQuestions, setCurrentStep, files, getRestoredFiles } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  const useSampleQuestion = (question: string) => {
    setCurrentQuestion(question)
  }

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
      return
    }

    if (documents.length === 0) {
      toast({ title: "No Documents", description: "Please upload documents first.", variant: "destructive" })
      router.push("/upload")
      return
    }

    fetchSmartQuestions()
  }, [user, loading, router, toast, documents])

  // Re-generate questions whenever the language changes
  useEffect(() => {
    if (documents.length > 0) {
      fetchSmartQuestions()
    }
  }, [selectedLanguage])

  const fetchSmartQuestions = async () => {
    if (documents.length === 0) return
    setLoadingSuggestions(true)
    try {
      const restoredFiles = await getRestoredFiles()
      let targetFile: File | null = restoredFiles[0] || null

      if (!targetFile) {
        const doc = documents[0]
        if (!doc) {
          setSuggestedQuestions(FALLBACK_QUESTIONS)
          return
        }
        const raw = sessionStorage.getItem("uploadedFiles")
        if (raw) {
          const serialized = JSON.parse(raw)
          const found = serialized.find((f: any) => f.name === doc?.name)
          if (found?.data) {
            const bytes = Uint8Array.from(atob(found.data), c => c.charCodeAt(0))
            targetFile = new File([bytes], doc.name, { type: doc.type })
          }
        }
        if (!targetFile && (doc as any)?.content) {
          const bytes = Uint8Array.from(atob((doc as any).content), c => c.charCodeAt(0))
          targetFile = new File([bytes], doc.name, { type: doc.type })
        }
      }

      if (!targetFile) {
        setSuggestedQuestions(FALLBACK_QUESTIONS)
        return
      }

      const formData = new FormData()
      formData.append("file", targetFile)
      formData.append("language", selectedLanguage)
      const res = await fetch(`${BACKEND_URL}/api/suggest-questions`, { method: "POST", body: formData })
      const data = await res.json()
      if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
        setSuggestedQuestions(data.questions)
        setSuggestDocName(data.documentName || documents[0]?.name || "")
      }
    } catch (e) {
      console.error("Failed to fetch smart questions", e)
      toast({
        title: "AI Question Generation Failed",
        description: "Couldn't generate smart questions. Showing generic questions instead.",
        variant: "destructive",
      })
      setSuggestedQuestions(FALLBACK_QUESTIONS)
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const addQuestion = () => {
    if (!currentQuestion.trim()) {
      toast({
        title: "Empty Question",
        description: "Please enter a question before adding.",
        variant: "destructive",
      })
      return
    }

    const isCompare = compareMode && documents.length > 1

    const newQuestion: Question = {
      id: Math.random().toString(36).substr(2, 9),
      text: currentQuestion.trim(),
      timestamp: new Date(),
      answerMode: defaultMode,
      language: selectedLanguage,
      compareMode: isCompare,
    }

    const updatedQuestions = [...questions, newQuestion]
    setQuestions(updatedQuestions)
    setCurrentQuestion("")

    toast({
      title: "Question Added",
      description: `Question added with ${defaultMode === "concise" ? "Concise" : "Detailed"} answer mode.`,
    })
  }

  const removeQuestion = (id: string) => {
    const updatedQuestions = questions.filter((q) => q.id !== id)
    setQuestions(updatedQuestions)
  }

  const toggleQuestionMode = (id: string) => {
    const updatedQuestions = questions.map((q) =>
      q.id === id
        ? { ...q, answerMode: q.answerMode === "concise" ? "detailed" : "concise" }
        : q
    ) as Question[]
    setQuestions(updatedQuestions)
  }

  const handleAnalyze = () => {
    if (questions.length === 0) {
      toast({
        title: "No Questions",
        description: "Please add at least one question to analyze.",
        variant: "destructive",
      })
      return
    }

    setCurrentStep(3)
    router.push("/results")
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      addQuestion()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const currentLang = LANGUAGES.find(l => l.code === selectedLanguage)
  // Detect doc type from any document that has one
  const detectedDocType = documents.find(d => d.documentType && d.documentType !== "General")?.documentType
    || documents.find(d => d.documentType)?.documentType
  const templateQuestions = detectedDocType ? (QUESTION_TEMPLATES[detectedDocType] || []) : []

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <ProgressStepper />

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-4">Ask Your Query</h1>
            <p className="text-muted-foreground">Ask natural language questions about your uploaded documents — in any language</p>
          </div>

          {/* Document Summary */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Uploaded Documents ({documents.length})
              </CardTitle>
              <CardDescription>Your documents are ready for analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {documents.map((doc, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {doc.name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Compare Mode — shown only when 2+ docs uploaded */}
          {documents.length >= 2 && (
            <Card className="mb-6 border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/10">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <GitCompare className="h-5 w-5 text-orange-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Compare Mode</p>
                      <p className="text-xs text-muted-foreground">When enabled, AI will compare across all {documents.length} uploaded documents</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCompareMode(c => !c)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      compareMode ? "bg-orange-500" : "bg-muted"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      compareMode ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                </div>
                {compareMode && (
                  <p className="mt-3 text-xs text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/20 px-3 py-2 rounded-lg">
                    Questions will be prefixed with "Compare across all documents:" — ask things like "Which document mentions the highest amount?" or "What differs between these contracts?"
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Settings Row: Language + Answer Mode */}
          <Card className="mb-6 border-dashed">
            <CardContent className="pt-5 pb-4">
              <div className="flex flex-wrap gap-6 items-start">
                {/* Language Selector */}
                <div className="flex-1 min-w-[200px]">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" /> Response Language
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang.code}
                        onClick={() => setSelectedLanguage(lang.code)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          selectedLanguage === lang.code
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:border-primary/50 text-foreground"
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Default Answer Mode */}
                <div className="flex-1 min-w-[200px]">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Default Answer Style</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDefaultMode("concise")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        defaultMode === "concise"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:border-primary/50 text-foreground"
                      }`}
                    >
                      <AlignLeft className="h-3 w-3" /> Concise
                    </button>
                    <button
                      onClick={() => setDefaultMode("detailed")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        defaultMode === "detailed"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:border-primary/50 text-foreground"
                      }`}
                    >
                      <BookOpen className="h-3 w-3" /> Detailed + Diagrams
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Question Input */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <MessageSquare className="mr-2 h-5 w-5" />
                Add Your Question
              </CardTitle>
              <CardDescription>
                Type your question in any language — English, हिंदी, বাংলা, or मराठी. AI will understand and answer accordingly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Textarea
                  placeholder="e.g., What are the key points? / मुख्य बिंदु क्या हैं? / মূল বিষয়গুলি কী? / मुख्य मुद्दे काय आहेत?"
                  value={currentQuestion}
                  onChange={(e) => setCurrentQuestion(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="min-h-[100px] resize-none"
                />
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <p className="text-xs text-muted-foreground">
                    Press Ctrl+Enter to add · Mode: <span className="font-medium text-foreground">{defaultMode === "concise" ? "Concise" : "Detailed + Diagrams"}</span> · Language: <span className="font-medium text-foreground">{currentLang?.label}</span>
                  </p>
                  <Button onClick={addQuestion} disabled={!currentQuestion.trim()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Question
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Smart Questions */}
          <Card className="mb-8 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 flex-wrap">
                    <Brain className="h-5 w-5 text-primary flex-shrink-0" />
                    <span>AI-Suggested Questions</span>
                    {suggestDocName && (
                      <Badge variant="secondary" className="text-xs font-normal max-w-[200px] truncate">
                        for {suggestDocName}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {loadingSuggestions
                      ? "AI is analyzing your document to generate smart questions..."
                      : "Click any question to use it, or type your own above"}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchSmartQuestions} disabled={loadingSuggestions} className="flex-shrink-0">
                  {loadingSuggestions
                    ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generating...</>
                    : <><Sparkles className="h-3 w-3 mr-1" />Regenerate</>
                  }
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingSuggestions ? (
                <div className="grid grid-cols-1 gap-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {suggestedQuestions.map((question, index) => (
                    <button
                      key={index}
                      className="w-full flex items-start gap-3 p-3 rounded-lg border border-border bg-background hover:bg-primary/5 hover:border-primary/30 transition-all text-left group"
                      onClick={() => setCurrentQuestion(question)}
                    >
                      <Sparkles className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm leading-relaxed text-left text-foreground break-words whitespace-normal min-w-0 flex-1">
                        {question}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Question Templates by Document Type */}
          {templateQuestions.length > 0 && (
            <Card className="mb-8 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/10">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <LayoutTemplate className="h-5 w-5 text-emerald-600" />
                      Templates for {DOC_TYPE_LABEL_MAP[detectedDocType!] || detectedDocType}
                    </CardTitle>
                    <CardDescription className="mt-1">Pre-built questions tailored for this document type</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2">
                  {templateQuestions.map((q, i) => (
                    <button
                      key={i}
                      className="w-full flex items-start gap-3 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-background hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:border-emerald-400 transition-all text-left"
                      onClick={() => setCurrentQuestion(q)}
                    >
                      <LayoutTemplate className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm leading-relaxed text-foreground break-words whitespace-normal min-w-0 flex-1">{q}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Added Questions */}
          {questions.length > 0 && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Your Questions ({questions.length})
                </CardTitle>
                <CardDescription>Questions ready for AI analysis · Click mode badge to toggle</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {questions.map((question, index) => {
                    const q = question as Question
                    return (
                      <div key={q.id} className="flex items-start justify-between p-4 border rounded-lg gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs flex-shrink-0">
                              Q{index + 1}
                            </Badge>
                            {/* Mode Toggle Badge */}
                            <button
                              onClick={() => toggleQuestionMode(q.id)}
                              title="Click to toggle answer mode"
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                                q.answerMode === "concise"
                                  ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                  : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                              }`}
                            >
                              {q.answerMode === "concise"
                                ? <><AlignLeft className="h-3 w-3" /> Concise</>
                                : <><BookOpen className="h-3 w-3" /> Detailed</>
                              }
                            </button>
                            {/* Language Badge */}
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {LANGUAGES.find(l => l.code === (q.language || "en"))?.label || "English"}
                            </Badge>
                            {q.compareMode && (
                              <Badge variant="outline" className="text-xs flex-shrink-0 border-orange-300 text-orange-600 bg-orange-50">
                                <GitCompare className="h-3 w-3 mr-1" /> Compare
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {new Date(q.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-sm break-words whitespace-normal">{q.text}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeQuestion(q.id)}
                          className="text-destructive hover:text-destructive flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Analyze Button */}
          <div className="text-center">
            <Button size="lg" onClick={handleAnalyze} disabled={questions.length === 0} className="px-8 py-3">
              <Send className="mr-2 h-5 w-5" />
              Analyze Documents
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            {questions.length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">Add at least one question to continue</p>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
