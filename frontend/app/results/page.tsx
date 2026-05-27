"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProgressStepper } from "@/components/progress-stepper"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import {
  CheckCircle,
  XCircle,
  FileText,
  RefreshCw,
  MessageSquare,
  Copy,
  Save,
  ArrowLeft,
  Brain,
  Clock,
  AlertTriangle,
  Lightbulb,
  RotateCcw,
  Share2,
  Download,
  Quote,
} from "lucide-react"

interface AnalysisResult {
  question: string
  answer: string
  citation?: string
  confidence: number
  sources: string[]
  foundInDocument: boolean
}

type ErrorType = "rate_limit" | "all_exhausted" | "no_text" | "generic" | null

const renderAnswerWithImages = (text: string) => {

  if (!text) return ""
  const regex = /!\[(.*?)\]\((.*?)\)/g
  const parts = []
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {text.substring(lastIndex, match.index)}
        </span>
      )
    }

    const alt = match[1]
    const src = match[2]
    parts.push(
      <span key={`img-${match.index}`} className="block my-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-w-md w-full h-auto rounded-lg border shadow-md mx-auto hover:scale-[1.02] transition-transform duration-200"
        />
        {alt && (
          <span className="block text-center text-xs text-muted-foreground mt-2 font-medium italic">
            {alt}
          </span>
        )}
      </span>
    )

    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${lastIndex}`}>{text.substring(lastIndex)}</span>
    )
  }

  return parts.length > 0 ? parts : text
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001"

interface TypewriterAnswerProps {
  text: string
  speed?: number
}

function TypewriterAnswer({ text, speed = 8 }: TypewriterAnswerProps) {
  const [displayedParts, setDisplayedParts] = useState<React.ReactNode[]>([])

  useEffect(() => {
    if (!text) {
      setDisplayedParts([])
      return
    }

    const regex = /!\[(.*?)\]\((.*?)\)/g
    const parts: { type: "text" | "image"; content: string; alt?: string; src?: string }[] = []
    let lastIndex = 0
    let match

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: text.substring(lastIndex, match.index) })
      }
      parts.push({ type: "image", content: match[0], alt: match[1], src: match[2] })
      lastIndex = regex.lastIndex
    }

    if (lastIndex < text.length) {
      parts.push({ type: "text", content: text.substring(lastIndex) })
    }

    let isCancelled = false
    let partIndex = 0
    let charIndex = 0
    let currentTextBuffer = ""
    const rendered: React.ReactNode[] = []

    setDisplayedParts([])

    const typeNext = () => {
      if (isCancelled) return
      if (partIndex >= parts.length) return

      const currentPart = parts[partIndex]
      if (currentPart.type === "text") {
        if (charIndex < currentPart.content.length) {
          currentTextBuffer += currentPart.content.charAt(charIndex)
          charIndex++

          // Update displayed parts
          const newParts = [...rendered]
          newParts.push(<span key={`typing-text-${partIndex}`}>{currentTextBuffer}</span>)
          setDisplayedParts(newParts)

          setTimeout(typeNext, speed)
        } else {
          // Finished this text part, push final stable span
          rendered.push(<span key={`stable-text-${partIndex}`}>{currentPart.content}</span>)
          partIndex++
          charIndex = 0
          currentTextBuffer = ""
          setTimeout(typeNext, speed)
        }
      } else if (currentPart.type === "image") {
        // Render image immediately with a nice fade-in animation
        rendered.push(
          <span
            key={`stable-img-${partIndex}`}
            className="block my-4 text-center opacity-0"
            style={{
              animation: "fadeInDocuMind 0.6s ease-out forwards",
            }}
          >
            <img
              src={currentPart.src}
              alt={currentPart.alt}
              className="max-w-md w-full h-auto rounded-lg border shadow-md mx-auto hover:scale-[1.02] transition-transform duration-200"
            />
            {currentPart.alt && (
              <span className="block text-center text-xs text-muted-foreground mt-2 font-medium italic">
                {currentPart.alt}
              </span>
            )}
          </span>
        )
        setDisplayedParts([...rendered])
        partIndex++
        setTimeout(typeNext, speed * 2)
      }
    }

    typeNext()

    return () => {
      isCancelled = true
    }
  }, [text, speed])

  return (
    <>
      <style>{`
        @keyframes fadeInDocuMind {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="text-sm leading-relaxed whitespace-pre-wrap">{displayedParts}</div>
    </>
  )
}

export default function ResultsPage() {

  const [results, setResults] = useState<AnalysisResult[]>([])
  const [loading, setLoading] = useState(true)
  const [errorType, setErrorType] = useState<ErrorType>(null)
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [countdown, setCountdown] = useState<number | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const autoRetryFiredRef = useRef(false)
  const analysisStartedRef = useRef(false)

  const { user, loading: authLoading, getRestoredFiles, questions, setQuestions, documents, setCurrentStep } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const [shareLoading, setShareLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)

  // --- Cleanup countdown on unmount ---
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  // --- Start countdown timer, optionally auto-retry when done ---
  const startCountdown = useCallback((seconds: number, autoRetry: boolean, retryFn: () => void) => {
    autoRetryFiredRef.current = false
    setCountdown(seconds)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownRef.current!)
          if (autoRetry && !autoRetryFiredRef.current) {
            autoRetryFiredRef.current = true
            retryFn()
          }
          return null
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  const analyzeDocuments = useCallback(async (questionsData: any[], docsData: any[]) => {
    setLoading(true)
    setErrorType(null)
    setErrorMessage("")
    setCountdown(null)
    if (countdownRef.current) clearInterval(countdownRef.current)

    try {
      const restoredFiles = await getRestoredFiles()

      if (restoredFiles.length === 0) {
        toast({
          title: "No Files Found",
          description: "Your files are no longer available. Please upload them again.",
          variant: "destructive",
        })
        router.push("/upload")
        return
      }

      const formData = new FormData()
      restoredFiles.forEach((file: File) => formData.append("files", file))
      formData.append("questions", JSON.stringify(questionsData.map((q) => q.text)))
      if (user && user.email) {
        formData.append("email", user.email)
      }

      const response = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: "POST",
        body: formData,
      })

      const textResponse = await response.text()
      let result: any
      try {
        result = JSON.parse(textResponse)
      } catch (e) {
        throw new Error(`Server returned non-JSON (${response.status}): ` + textResponse.substring(0, 200))
      }

      // --- Handle rate limits ---
      if (response.status === 429) {
        const waitSecs: number = result.retryAfterSeconds ?? 60
        const isAllExhausted: boolean = result.allExhausted === true

        if (isAllExhausted) {
          setErrorType("all_exhausted")
          setErrorMessage(result.message || "All AI models have hit their daily quota.")
          // Show countdown to quota reset (could be hours — just show hrs/mins)
          setCountdown(Math.min(waitSecs, 3600)) // cap display at 1 hour
        } else {
          setErrorType("rate_limit")
          setErrorMessage(result.message || `Rate limited. Retrying in ${waitSecs} seconds…`)
          // Auto-retry after the wait
          startCountdown(waitSecs, true, () => analyzeDocuments(questionsData, docsData))
        }
        return
      }

      if (!response.ok) {
        throw new Error(result.error || result.message || "Failed to analyze document")
      }

      if (result.error === "NO_TEXT") {
        setErrorType("no_text")
        setErrorMessage("Could not extract any text from the uploaded document(s). Please try a different file format.")
        return
      }

      if (result.answers && Array.isArray(result.answers)) {
        setResults(result.answers)
      } else {
        throw new Error("Invalid response format from server")
      }

      // Track metric for Admin Dashboard
      try {
        if (user) {
          fetch(`${BACKEND_URL}/api/queries`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email, increment: questionsData.length }),
          })
        }
      } catch (e) {
        console.error("Failed to log queries to DB", e)
      }

      toast({
        title: "✅ Done!",
        description: `Answered ${questionsData.length} question(s) from your document.`,
      })
    } catch (error: any) {
      console.error("Analysis error:", error)
      const isRateLimit = error?.message?.includes("429") || error?.message?.toLowerCase().includes("rate")
      if (isRateLimit) {
        setErrorType("rate_limit")
        setErrorMessage("The AI API is busy. Retry in a moment.")
        startCountdown(60, false, () => {})
      } else {
        setErrorType("generic")
        setErrorMessage(error?.message || "An unexpected error occurred. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getRestoredFiles, router, toast, user, startCountdown])

  useEffect(() => {
    if (authLoading) return // Wait for active session restoration

    if (!user) {
      router.push("/auth")
      return
    }

    if (questions.length === 0 || documents.length === 0) {
      toast({
        title: "Missing Data",
        description: "Please complete the previous steps first.",
        variant: "destructive",
      })
      router.push("/upload")
      return
    }

    if (analysisStartedRef.current) return // Prevent duplicate concurrent executions
    analysisStartedRef.current = true

    analyzeDocuments(questions, documents)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  const handleRetry = () => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setCountdown(null)
    analyzeDocuments(questions, documents)
  }

  const copyResult = (result: AnalysisResult) => {
    const text = `Question: ${result.question}\n\nAnswer: ${result.answer}\n\nSources: ${result.sources.join(", ")}`
    navigator.clipboard.writeText(text)
    toast({ title: "Copied", description: "Result copied to clipboard" })
  }

  const saveResult = (result: AnalysisResult) => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `result-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast({ title: "Saved", description: "Result saved successfully" })
  }

  const askAnotherQuestion = () => router.push("/query")

  const startOver = () => {
    setQuestions([])
    setCurrentStep(1)
    router.push("/upload")
  }

  const clearResults = () => {
    setQuestions([])
    setCurrentStep(2)
    router.push("/query")
  }

  const shareResults = async () => {
    if (!user || results.length === 0) return
    setShareLoading(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          documentNames: documents.map(d => d.name),
          answers: results,
        })
      })
      const data = await res.json()
      if (data.success) {
        const fullUrl = `${window.location.origin}/share/${data.shareId}`
        await navigator.clipboard.writeText(fullUrl)
        toast({ title: "🔗 Share Link Copied!", description: "Link copied to clipboard. Valid for 7 days." })
      }
    } catch (e) {
      toast({ title: "Share Failed", description: "Could not create share link", variant: "destructive" })
    } finally {
      setShareLoading(false)
    }
  }

  const exportPDF = async () => {
    setExportLoading(true)
    try {
      const { exportResultsToPdf } = await import("@/lib/export-pdf")
      await exportResultsToPdf(
        results.map(r => ({
          question: r.question,
          answer: r.answer,
          citation: r.citation,
          confidence: r.confidence,
          sources: r.sources,
          foundInDocument: r.foundInDocument,
        })),
        documents.map(d => d.name),
        user?.name
      )
      toast({ title: "✅ PDF Exported", description: "Your analysis report has been downloaded." })
    } catch (e) {
      toast({ title: "Export Failed", description: "Could not generate PDF", variant: "destructive" })
    } finally {
      setExportLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) return null

  const avgConfidence = results.length
    ? Math.round(results.reduce((acc, r) => acc + r.confidence, 0) / results.length)
    : 0

  // --- Format countdown for display ---
  const formatCountdown = (secs: number) => {
    if (secs >= 3600) {
      const h = Math.floor(secs / 3600)
      const m = Math.floor((secs % 3600) / 60)
      return `${h}h ${m}m`
    }
    if (secs >= 60) {
      const m = Math.floor(secs / 60)
      const s = secs % 60
      return `${m}m ${s}s`
    }
    return `${secs}s`
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <ProgressStepper />

          {/* ─── LOADING STATE ─── */}
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-flex flex-col items-center space-y-4">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full border-4 border-muted border-t-primary animate-spin" />
                  <Brain className="h-6 w-6 text-primary absolute inset-0 m-auto" />
                </div>
                <p className="text-lg font-medium">Analyzing your document…</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  The AI is reading and processing your document. This may take 10–30 seconds.
                </p>
              </div>
            </div>

          ) : errorType ? (
            /* ─── ERROR STATE ─── */
            <div className="max-w-2xl mx-auto py-8">
              {/* Error Card */}
              <Card className={`border-2 mb-6 ${
                errorType === "all_exhausted"
                  ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20"
                  : "border-red-400 bg-red-50 dark:bg-red-950/20"
              }`}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      errorType === "all_exhausted" ? "bg-orange-100 dark:bg-orange-900/30" : "bg-red-100 dark:bg-red-900/30"
                    }`}>
                      <AlertTriangle className={`h-6 w-6 ${
                        errorType === "all_exhausted" ? "text-orange-500" : "text-red-500"
                      }`} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {errorType === "rate_limit" && "⏳ AI Rate Limited"}
                        {errorType === "all_exhausted" && "☕ Daily Quota Exhausted"}
                        {errorType === "no_text" && "📄 No Text Found"}
                        {errorType === "generic" && "⚠️ Analysis Failed"}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Countdown timer for rate_limit */}
                  {errorType === "rate_limit" && countdown !== null && (
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-background/60 border">
                      <Clock className="h-5 w-5 text-primary animate-pulse" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {countdown > 0
                            ? `Auto-retrying in ${formatCountdown(countdown)}…`
                            : "Retrying now…"}
                        </p>
                        <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all duration-1000"
                            style={{ width: `${Math.max(0, (countdown || 0) / 60 * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quota reset info for all_exhausted */}
                  {errorType === "all_exhausted" && (
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-background/60 border">
                      <Clock className="h-5 w-5 text-orange-500" />
                      <div>
                        <p className="text-sm font-medium">Quota resets at midnight Pacific Time</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          All free-tier Gemini models share a daily quota. Add a second API key in your .env.local to get double the capacity.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button onClick={handleRetry} className="flex-1 sm:flex-none" disabled={loading}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {countdown !== null && countdown > 0 ? "Retry Now (Skip Wait)" : "Retry"}
                    </Button>
                    <Button variant="outline" onClick={askAnotherQuestion} className="flex-1 sm:flex-none">
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Change Questions
                    </Button>
                    <Button variant="outline" onClick={startOver} className="flex-1 sm:flex-none">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Start Over
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Tips Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Lightbulb className="h-4 w-4 text-yellow-500" />
                    Tips to avoid this issue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold mt-0.5">1.</span>
                      <span><strong>Ask one question at a time</strong> — fewer requests means lower chance of hitting limits.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold mt-0.5">2.</span>
                      <span><strong>Add a second API key</strong> — set <code className="bg-muted px-1 rounded text-xs">GOOGLE_GENERATIVE_AI_API_KEY_2</code> in your <code className="bg-muted px-1 rounded text-xs">.env.local</code> file for double capacity.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold mt-0.5">3.</span>
                      <span><strong>Wait a few minutes</strong> — per-minute rate limits reset quickly; only daily limits require waiting until midnight.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold mt-0.5">4.</span>
                      <span><strong>Use a smaller document</strong> — very large documents use more tokens per request, exhausting quotas faster.</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

          ) : (
            /* ─── SUCCESS STATE ─── */
            <>
              {/* Header */}
              <div className="mb-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h1 className="text-3xl font-bold mb-1">Your Answers</h1>
                    <p className="text-muted-foreground text-sm">Here&apos;s what the AI found in your documents</p>
                  </div>
                  {/* Primary actions */}
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={askAnotherQuestion} size="sm">
                      <MessageSquare className="mr-1.5 h-4 w-4" /> Ask More
                    </Button>
                    <Button onClick={handleRetry} variant="outline" size="sm">
                      <RefreshCw className="mr-1.5 h-4 w-4" /> Re-Analyze
                    </Button>
                  </div>
                </div>
                {/* Secondary actions row */}
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                  <Button onClick={shareResults} variant="outline" size="sm" disabled={shareLoading} className="text-xs">
                    <Share2 className="mr-1.5 h-3 w-3" />
                    {shareLoading ? "Sharing…" : "Share Results"}
                  </Button>
                  <Button onClick={exportPDF} variant="outline" size="sm" disabled={exportLoading} className="text-xs">
                    <Download className="mr-1.5 h-3 w-3" />
                    {exportLoading ? "Exporting…" : "Export PDF"}
                  </Button>
                  <div className="flex-1" />
                  <Button onClick={startOver} variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="mr-1.5 h-3 w-3" /> Start Over
                  </Button>
                  <Button onClick={clearResults} variant="destructive" size="sm" className="text-xs">
                    Clear Results
                  </Button>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="text-2xl font-bold">{documents.length}</p>
                        <p className="text-sm text-muted-foreground">Documents</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <Brain className="h-5 w-5 text-purple-500" />
                      <div>
                        <p className="text-2xl font-bold">{questions.length}</p>
                        <p className="text-sm text-muted-foreground">Questions Asked</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <Clock className="h-5 w-5 text-orange-500" />
                      <div>
                        <p className="text-2xl font-bold">{avgConfidence}%</p>
                        <p className="text-sm text-muted-foreground">Avg Confidence</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Results */}
              <div className="space-y-6 mb-8">
                {results.map((result, index) => (
                  <Card key={index} className="overflow-hidden">
                    <CardHeader className="bg-muted/30">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-3">
                          {result.foundInDocument ? (
                            <CheckCircle className="h-7 w-7 text-green-500" />
                          ) : (
                            <XCircle className="h-7 w-7 text-red-400" />
                          )}
                          <div>
                            <CardTitle className="text-xl">
                              {result.foundInDocument ? "Answer Found" : "Not Found in Document"}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              Confidence: {result.confidence}%
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => copyResult(result)}>
                            <Copy className="mr-1 h-3 w-3" />
                            Copy
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => saveResult(result)}>
                            <Save className="mr-1 h-3 w-3" />
                            Save
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-6 space-y-6">
                      {/* Question */}
                      <div>
                        <div className="flex items-center mb-2">
                          <MessageSquare className="mr-2 h-5 w-5 text-primary" />
                          <h3 className="text-base font-semibold">Your Question</h3>
                        </div>
                        <div className="bg-muted/50 p-4 rounded-lg">
                          <p className="text-base">{result.question}</p>
                        </div>
                      </div>

                      <Separator />

                      {/* Answer */}
                      <div>
                        <div className="flex items-center mb-2">
                          <Brain className="mr-2 h-5 w-5 text-primary" />
                          <h3 className="text-base font-semibold">Answer</h3>
                        </div>
                        <div
                          className={`p-4 rounded-lg border-l-4 ${
                            result.foundInDocument
                              ? "bg-green-50 dark:bg-green-900/10 border-l-green-500"
                              : "bg-red-50 dark:bg-red-900/10 border-l-red-400"
                          }`}
                        >
                          <div className="text-sm leading-relaxed whitespace-pre-wrap">
                            <TypewriterAnswer text={result.answer} speed={8} />
                          </div>
                        </div>
                      </div>

                      {/* Citation */}
                      {result.citation && result.foundInDocument && (
                        <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Quote className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                            <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">Source Citation</span>
                          </div>
                          <p className="text-sm text-yellow-800 dark:text-yellow-300 italic leading-relaxed">
                            &ldquo;{result.citation}&rdquo;
                          </p>
                        </div>
                      )}

                      {/* Sources */}
                      {result.sources.length > 0 && (
                        <div>
                          <div className="flex items-center mb-2">
                            <FileText className="mr-2 h-5 w-5 text-primary" />
                            <h3 className="text-base font-semibold">Source Documents</h3>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {result.sources.map((src, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-sm font-medium"
                              >
                                <FileText className="h-3 w-3" />
                                {src}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
