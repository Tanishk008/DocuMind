"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  CheckCircle,
  XCircle,
  FileText,
  Brain,
  Clock,
  Share2,
  AlertTriangle,
  Copy,
} from "lucide-react"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001"

interface AnalysisResult {
  question: string
  answer: string
  citation?: string
  confidence: number
  sources: string[]
  foundInDocument: boolean
}

const renderAnswerWithImages = (text: string) => {
  if (!text) return ""
  const regex = /!\[(.*?)\]\((.*?)\)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t-${lastIndex}`}>{text.substring(lastIndex, match.index)}</span>)
    }
    const alt = match[1]
    const src = match[2]
    parts.push(
      <span key={`img-${match.index}`} className="block my-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="max-w-md w-full h-auto rounded-lg border shadow-md mx-auto" />
        {alt && <span className="block text-center text-xs text-muted-foreground mt-2 italic">{alt}</span>}
      </span>
    )
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push(<span key={`t-${lastIndex}`}>{text.substring(lastIndex)}</span>)
  }
  return parts.length > 0 ? parts : text
}

export default function ShareViewPage() {
  const params = useParams()
  const shareId = params?.shareId as string

  const [results, setResults] = useState<AnalysisResult[]>([])
  const [documentNames, setDocumentNames] = useState<string[]>([])
  const [expiresAt, setExpiresAt] = useState<string>("")
  const [createdAt, setCreatedAt] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!shareId) return
    const fetchShare = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/share/${shareId}`)
        const data = await res.json()
        if (!res.ok || !data.success) {
          setError(data.error || "Failed to load shared analysis")
          return
        }
        setResults(data.answers || [])
        setDocumentNames(data.documentNames || [])
        setExpiresAt(data.expiresAt || "")
        setCreatedAt(data.createdAt || "")
      } catch (e) {
        setError("Failed to connect to server")
      } finally {
        setLoading(false)
      }
    }
    fetchShare()
  }, [shareId])

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const avgConf = results.length
    ? Math.round(results.reduce((a, r) => a + r.confidence, 0) / results.length)
    : 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="h-16 w-16 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">Loading shared analysis...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="max-w-md w-full border-red-200">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-700 dark:text-red-400 mb-2">Link Not Available</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button variant="outline" onClick={() => window.location.href = "/"}>Go to DocuMind AI</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
      {/* Branded Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <Share2 className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 opacity-80" />
                  <span className="font-bold text-xl">DocuMind AI</span>
                </div>
                <p className="text-blue-100 text-sm mt-0.5">Shared Analysis Report</p>
              </div>
            </div>
            <Button
              onClick={copyLink}
              variant="outline"
              size="sm"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20"
            >
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copied!" : "Copy Link"}
            </Button>
          </div>

          {/* Meta info */}
          <div className="mt-6 flex flex-wrap gap-3">
            {documentNames.map(name => (
              <Badge key={name} className="bg-white/20 text-white border-white/30 text-sm">
                <FileText className="h-3 w-3 mr-1" />
                {name}
              </Badge>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-6 text-sm text-blue-100">
            <span className="flex items-center gap-1">
              <Brain className="h-4 w-4" />
              {results.length} question{results.length !== 1 ? "s" : ""} analyzed
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4" />
              {results.filter(r => r.foundInDocument).length} answers found
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Avg. confidence: {avgConf}%
            </span>
            {expiresAt && (
              <span className="flex items-center gap-1">
                ⏳ Expires: {new Date(expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        {results.map((result, index) => (
          <Card key={index} className="overflow-hidden shadow-sm">
            <CardHeader className="bg-muted/30 pb-3">
              <div className="flex items-start gap-3">
                {result.foundInDocument ? (
                  <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">Q{index + 1}</Badge>
                    {result.confidence > 0 && (
                      <Badge variant="secondary" className="text-xs">{result.confidence}% confidence</Badge>
                    )}
                    {!result.foundInDocument && (
                      <Badge variant="destructive" className="text-xs">Not found</Badge>
                    )}
                  </div>
                  <CardTitle className="text-base mt-2 font-medium">{result.question}</CardTitle>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              {/* Answer */}
              <div className={`p-4 rounded-lg border-l-4 ${
                result.foundInDocument
                  ? "bg-green-50 dark:bg-green-900/10 border-l-green-500"
                  : "bg-red-50 dark:bg-red-900/10 border-l-red-400"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">AI Answer</span>
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {renderAnswerWithImages(result.answer)}
                </div>
              </div>

              {/* Citation */}
              {result.citation && result.foundInDocument && (
                <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800">
                  <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 mb-1">📌 Source Citation</p>
                  <p className="text-sm text-yellow-800 dark:text-yellow-300 italic">"{result.citation}"</p>
                </div>
              )}

              {/* Sources */}
              {result.sources.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    {result.sources.map((src, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted text-xs font-medium">
                        <FileText className="h-3 w-3" />{src}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}

        {/* Footer */}
        <div className="text-center pt-4 pb-8">
          <p className="text-sm text-muted-foreground mb-4">This analysis was generated by DocuMind AI</p>
          <Button onClick={() => window.location.href = "/"} variant="outline">
            <FileText className="mr-2 h-4 w-4" />
            Try DocuMind AI with your own documents
          </Button>
        </div>
      </div>
    </div>
  )
}
