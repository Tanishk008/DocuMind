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
import { MessageSquare, Send, FileText, Lightbulb, ArrowRight, Plus, X, Sparkles, Brain, Loader2 } from "lucide-react"

interface Question {
  id: string
  text: string
  timestamp: Date
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

export default function QueryPage() {
  const [currentQuestion, setCurrentQuestion] = useState("")
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(FALLBACK_QUESTIONS)
  const [suggestDocName, setSuggestDocName] = useState<string>("")
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
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

    // Fetch AI-generated smart questions for the first document
    fetchSmartQuestions()
  }, [user, loading, router, toast, documents])

  const fetchSmartQuestions = async () => {
    if (documents.length === 0) return
    setLoadingSuggestions(true)
    try {
      const restoredFiles = await getRestoredFiles()
      let targetFile: File | null = restoredFiles[0] || null

      // If no restored file, use the document content from DB
      if (!targetFile) {
        const doc = documents[0]
        const raw = sessionStorage.getItem("uploadedFiles")
        if (raw) {
          const serialized = JSON.parse(raw)
          const found = serialized.find((f: any) => f.name === doc.name)
          if (found?.data) {
            const bytes = Uint8Array.from(atob(found.data), c => c.charCodeAt(0))
            targetFile = new File([bytes], doc.name, { type: doc.type })
          }
        }
        if (!targetFile && (doc as any).content) {
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
      const res = await fetch(`${BACKEND_URL}/api/suggest-questions`, { method: "POST", body: formData })
      const data = await res.json()
      if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
        setSuggestedQuestions(data.questions)
        setSuggestDocName(data.documentName || documents[0]?.name || "")
      }
    } catch (e) {
      console.error("Failed to fetch smart questions", e)
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

    const newQuestion: Question = {
      id: Math.random().toString(36).substr(2, 9),
      text: currentQuestion.trim(),
      timestamp: new Date(),
    }

    const updatedQuestions = [...questions, newQuestion]
    setQuestions(updatedQuestions)
    setCurrentQuestion("")

    toast({
      title: "Question Added",
      description: "Your question has been added to the queue.",
    })
  }

  const removeQuestion = (id: string) => {
    const updatedQuestions = questions.filter((q) => q.id !== id)
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <ProgressStepper />

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-4">Ask Your Query</h1>
            <p className="text-muted-foreground">Ask natural language questions about your uploaded documents</p>
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

          {/* Question Input */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <MessageSquare className="mr-2 h-5 w-5" />
                Add Your Question
              </CardTitle>
              <CardDescription>
                Type your question in natural language. Our AI will understand context and provide detailed answers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Textarea
                  placeholder="e.g., What are the key points discussed in this document?"
                  value={currentQuestion}
                  onChange={(e) => setCurrentQuestion(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="min-h-[100px] resize-none"
                />
                <div className="flex justify-between items-center">
                  <p className="text-xs text-muted-foreground">Press Ctrl+Enter to add question quickly</p>
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
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    AI-Suggested Questions
                    {suggestDocName && (
                      <Badge variant="secondary" className="text-xs ml-1 font-normal">
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
                <Button variant="outline" size="sm" onClick={fetchSmartQuestions} disabled={loadingSuggestions}>
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
                <div className="grid grid-cols-1 gap-3">
                  {suggestedQuestions.map((question, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      className="h-auto p-4 text-left justify-start bg-background hover:bg-primary/5 hover:border-primary/30 transition-all"
                      onClick={() => setCurrentQuestion(question)}
                    >
                      <Sparkles className="mr-3 h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm leading-relaxed text-left break-words">{question}</span>
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>


          {/* Added Questions */}
          {questions.length > 0 && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Your Questions ({questions.length})
                </CardTitle>
                <CardDescription>Questions ready for AI analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {questions.map((question, index) => (
                    <div key={question.id} className="flex items-start justify-between p-4 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center mb-2">
                          <Badge variant="secondary" className="text-xs mr-2">
                            Q{index + 1}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(question.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm break-words">{question.text}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeQuestion(question.id)}
                        className="text-destructive hover:text-destructive ml-2 flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
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
