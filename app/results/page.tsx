"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProgressStepper } from "@/components/progress-stepper"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  RefreshCw,
  MessageSquare,
  Copy,
  Save,
  ArrowLeft,
  Info,
  TrendingUp,
  Brain,
  Clock,
} from "lucide-react"

interface AnalysisResult {
  question: string
  decision: "approved" | "rejected" | "conditional"
  amount?: string
  justification: string
  clauses: string[]
  confidence: number
  keyFindings?: { [key: string]: string }
}

export default function ResultsPage() {
  const [results, setResults] = useState<AnalysisResult[]>([])
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth")
      return
    }

    // Load questions and documents
    if (typeof window !== "undefined") {
      const savedQuestions = localStorage.getItem("questions")
      const savedDocs = localStorage.getItem("documents")

      if (!savedQuestions || !savedDocs) {
        toast({
          title: "Missing Data",
          description: "Please complete the previous steps first.",
          variant: "destructive",
        })
        router.push("/upload")
        return
      }

      const questionsData = JSON.parse(savedQuestions)
      const docsData = JSON.parse(savedDocs)

      if (questionsData.length === 0) {
        router.push("/query")
        return
      }

      setQuestions(questionsData)
      setDocuments(docsData)

      // Start analysis
      analyzeDocuments(questionsData, docsData)
    }
  }, [user, authLoading, router, toast])

  const analyzeDocuments = async (questionsData: any[], docsData: any[]) => {
    setLoading(true)

    try {
      const analysisResults: AnalysisResult[] = []

      for (const question of questionsData) {
        // Simulate AI analysis with realistic responses
        const result = await simulateAIAnalysis(question.text, docsData)
        analysisResults.push(result)

        // Add delay to simulate processing
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      setResults(analysisResults)

      toast({
        title: "Analysis Complete",
        description: `Successfully analyzed ${questionsData.length} questions.`,
      })
    } catch (error) {
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze documents. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const simulateAIAnalysis = async (question: string, docs: any[]): Promise<AnalysisResult> => {
    const lowerQuestion = question.toLowerCase()

    // Handle common spelling mistakes and rephrase questions
    let processedQuestion = lowerQuestion
    if (lowerQuestion.includes("transport") || lowerQuestion.includes("discharge")) {
      processedQuestion = "transport from hospital to home after discharge"
    } else if (lowerQuestion.includes("pre existing") || lowerQuestion.includes("preexisting")) {
      processedQuestion = "What are the exclusions for pre-existing conditions?"
    }

    if (processedQuestion.includes("maternity") || processedQuestion.includes("pregnancy")) {
      return {
        question,
        decision: "conditional",
        amount: "Up to $50,000",
        justification:
          "Maternity expenses are covered under this policy with specific conditions. Coverage requires continuous enrollment for 24 months prior to conception. Benefits include prenatal care, delivery, and postnatal care.",
        clauses: [
          "HDFC Ergo: Section 4.2: Maternity Benefits - Coverage available after 24-month waiting period",
          "HDFC Ergo: Section 4.2.1: Maximum benefit of $50,000 per pregnancy",
          "HDFC Ergo: Section 4.2.2: Limited to two pregnancies during policy term",
        ],
        confidence: 92,
        keyFindings: {
          "Waiting Period": "24 months",
          "Maximum Coverage": "$50,000",
          "Pregnancy Limit": "2 pregnancies",
        },
      }
    }

    if (processedQuestion.includes("cataract") || processedQuestion.includes("eye surgery")) {
      return {
        question,
        decision: "conditional",
        amount: "Up to $15,000",
        justification:
          "Cataract surgery is covered under the policy with a mandatory waiting period. The procedure must be deemed medically necessary by a qualified ophthalmologist.",
        clauses: [
          "HDFC Ergo: Section 6.3: Eye Care Benefits - Cataract surgery covered after 2-year waiting period",
          "HDFC Ergo: Section 6.3.1: Maximum coverage of $15,000 per eye",
          "HDFC Ergo: Section 6.3.2: Requires pre-authorization and medical necessity certification",
        ],
        confidence: 95,
        keyFindings: {
          "Waiting Period": "2 years",
          "Coverage Per Eye": "$15,000",
          Authorization: "Required",
        },
      }
    }

    // Default response for other questions
    return {
      question,
      decision: "conditional",
      justification:
        "This query requires detailed policy review. Based on the available information, coverage may be available subject to policy terms and conditions. Please consult the full policy document for specific details.",
      clauses: [
        "General Terms and Conditions - Section 1.1",
        "Coverage Limitations - Section 2.3",
        "Claims Process - Section 9.1",
      ],
      confidence: 75,
      keyFindings: {
        Status: "Under Review",
        "Action Required": "Policy Consultation",
      },
    }
  }

  const getDecisionIcon = (decision: string) => {
    switch (decision) {
      case "approved":
        return <CheckCircle className="h-8 w-8 text-green-500" />
      case "rejected":
        return <XCircle className="h-8 w-8 text-red-500" />
      case "conditional":
        return <AlertCircle className="h-8 w-8 text-yellow-500" />
      default:
        return <AlertCircle className="h-8 w-8 text-gray-500" />
    }
  }

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case "approved":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 border-green-200"
      case "rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 border-red-200"
      case "conditional":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-200"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400 border-gray-200"
    }
  }

  const getDecisionText = (decision: string) => {
    switch (decision) {
      case "approved":
        return "✓ Approved"
      case "rejected":
        return "✗ Not Approved"
      case "conditional":
        return "⚠ Conditional"
      default:
        return "Under Review"
    }
  }

  const copyResult = (result: AnalysisResult) => {
    const text = `Question: ${result.question}\nDecision: ${result.decision}\nConfidence: ${result.confidence}%\nExplanation: ${result.justification}`
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied",
      description: "Result copied to clipboard",
    })
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

    toast({
      title: "Saved",
      description: "Result saved successfully",
    })
  }

  const askAnotherQuestion = () => {
    router.push("/query")
  }

  const startOver = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("questions")
      localStorage.setItem("currentStep", "1")
    }
    router.push("/upload")
  }

  const clearResults = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("questions")
      localStorage.setItem("currentStep", "2")
    }
    router.push("/query")
  }

  if (authLoading) {
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
        <div className="max-w-6xl mx-auto">
          <ProgressStepper />

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center space-x-2">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                <span className="text-lg">Analyzing documents...</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">This may take a few moments</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                <div>
                  <h1 className="text-3xl font-bold mb-2">Your Results</h1>
                  <p className="text-muted-foreground">Here's what we found in your documents</p>
                </div>
                <div className="flex gap-3 mt-4 sm:mt-0">
                  <Button onClick={askAnotherQuestion} variant="outline" size="lg">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Ask Another Query
                  </Button>
                  <Button onClick={startOver} variant="outline" size="lg">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Start Over
                  </Button>
                  <Button onClick={clearResults} variant="destructive" size="lg">
                    Clear Results
                  </Button>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
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
                        <p className="text-sm text-muted-foreground">Questions</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="text-2xl font-bold">{results.filter((r) => r.decision === "approved").length}</p>
                        <p className="text-sm text-muted-foreground">Approved</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <Clock className="h-5 w-5 text-orange-500" />
                      <div>
                        <p className="text-2xl font-bold">
                          {Math.round(results.reduce((acc, r) => acc + r.confidence, 0) / results.length)}%
                        </p>
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
                          {getDecisionIcon(result.decision)}
                          <div>
                            <CardTitle className="text-xl">Decision</CardTitle>
                            <CardDescription>Based on your documents and question</CardDescription>
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

                    <CardContent className="p-6">
                      {/* Decision Summary */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="text-center">
                          <div
                            className={`inline-flex items-center px-4 py-2 rounded-full border-2 font-semibold ${getDecisionColor(
                              result.decision,
                            )}`}
                          >
                            {getDecisionText(result.decision)}
                          </div>
                          <p className="text-sm text-muted-foreground mt-2">Final Decision</p>
                        </div>

                        <div className="text-center">
                          <div className="text-2xl font-bold">{result.amount || "No Amount"}</div>
                          <p className="text-sm text-muted-foreground">Amount Involved</p>
                        </div>

                        <div className="text-center">
                          <div className="text-2xl font-bold">{result.confidence}%</div>
                          <p className="text-sm text-muted-foreground">Confidence Level</p>
                        </div>
                      </div>

                      <Separator className="my-6" />

                      {/* Your Question */}
                      <div className="mb-6">
                        <div className="flex items-center mb-3">
                          <MessageSquare className="mr-2 h-5 w-5" />
                          <h3 className="text-lg font-semibold">Your Question</h3>
                        </div>
                        <div className="bg-muted/50 p-4 rounded-lg">
                          <p className="text-base">{result.question}</p>
                        </div>
                      </div>

                      {/* Simple Explanation */}
                      <div className="mb-6">
                        <div className="flex items-center mb-3">
                          <Info className="mr-2 h-5 w-5" />
                          <h3 className="text-lg font-semibold">Simple Explanation</h3>
                        </div>
                        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-l-primary">
                          <div className="flex items-start space-x-2">
                            {result.decision === "rejected" && (
                              <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                            )}
                            {result.decision === "approved" && (
                              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                            )}
                            {result.decision === "conditional" && (
                              <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                            )}
                            <div>
                              <p className="font-semibold mb-1">
                                {result.decision === "rejected" && "**Not Covered**"}
                                {result.decision === "approved" && "**Covered**"}
                                {result.decision === "conditional" && "**Conditionally Covered**"}
                              </p>
                              <p className="text-sm leading-relaxed">{result.justification}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Key Findings */}
                      {result.keyFindings && (
                        <div className="mb-6">
                          <div className="flex items-center mb-3">
                            <TrendingUp className="mr-2 h-5 w-5" />
                            <h3 className="text-lg font-semibold">What We Found in Your Question</h3>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Object.entries(result.keyFindings).map(([key, value]) => (
                              <div key={key} className="bg-muted/30 p-3 rounded-lg">
                                <div className="flex justify-between items-center">
                                  <span className="font-medium text-sm">{key}</span>
                                  <span className="text-sm text-muted-foreground">{value}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Referenced Clauses */}
                      <div>
                        <div className="flex items-center mb-3">
                          <FileText className="mr-2 h-5 w-5" />
                          <h3 className="text-lg font-semibold">Referenced Policy Clauses</h3>
                        </div>
                        <div className="space-y-2">
                          {result.clauses.map((clause, clauseIndex) => (
                            <div key={clauseIndex} className="flex items-start space-x-2 p-3 bg-muted/30 rounded-lg">
                              <FileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                              <span className="text-sm">{clause}</span>
                            </div>
                          ))}
                        </div>
                      </div>
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
