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
import { MessageSquare, Send, FileText, Lightbulb, ArrowRight, Plus, X, Sparkles } from "lucide-react"

interface Question {
  id: string
  text: string
  timestamp: Date
}

const sampleQuestions = [
  "What is the main topic or purpose of this document?",
  "Summarize the key points mentioned in this document.",
  "What are the terms and conditions described in this document?",
  "Who are the parties involved in this document?",
  "What are the important dates or deadlines mentioned?",
  "What actions or steps are required according to this document?",
  "Are there any exclusions or limitations mentioned?",
  "What is the total amount or value discussed in this document?",
  "What are the key obligations or responsibilities described?",
  "Is there a definition or explanation of any specific terms?",
  "What conclusions or recommendations are made in this document?",
  "What evidence or supporting data is provided in this document?",
]

export default function QueryPage() {
  const [currentQuestion, setCurrentQuestion] = useState("")
  const { user, loading, documents, questions, setQuestions, setCurrentStep } = useAuth()
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
      toast({
        title: "No Documents",
        description: "Please upload documents first.",
        variant: "destructive",
      })
      router.push("/upload")
    }
  }, [user, loading, router, toast, documents])

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

          {/* Sample Questions */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Lightbulb className="mr-2 h-5 w-5" />
                Sample Questions
              </CardTitle>
              <CardDescription>Click on any sample question to use it as a starting point</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3">
                {sampleQuestions.map((question, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    className="h-auto p-4 text-left justify-start bg-transparent hover:bg-accent/50 transition-colors"
                    onClick={() => setCurrentQuestion(question)}
                  >
                    <Sparkles className="mr-3 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm leading-relaxed text-left break-words">{question}</span>
                  </Button>
                ))}
              </div>
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
