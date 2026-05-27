"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  History,
  MessageSquare,
  CheckCircle,
  XCircle,
  FileText,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  Brain,
  BookOpen,
} from "lucide-react"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001"

interface QALog {
  id: string
  text: string
  answer: string
  citation?: string
  confidence: number
  sources: string[]
  documentName?: string
  foundInDocument: boolean
  timestamp: string
}

interface GroupedHistory {
  documentName: string
  entries: QALog[]
}

const DOC_TYPE_COLORS: Record<string, string> = {
  Legal: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Medical: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Academic: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Financial: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  Technical: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  General: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
}

export default function HistoryPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [allLogs, setAllLogs] = useState<QALog[]>([])
  const [fetching, setFetching] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
      return
    }
    if (user && user.role === "user") {
      fetchHistory()
    } else if (user && user.role === "admin") {
      setFetching(false)
    }
  }, [user, loading, router])

  const fetchHistory = async () => {
    setFetching(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/user/questions?email=${encodeURIComponent(user!.email)}`)
      const data = await res.json()
      if (data.success) {
        setAllLogs(data.questions || [])
        // Auto-expand all groups initially
        const groups = new Set<string>()
        ;(data.questions || []).forEach((q: QALog) => {
          groups.add(q.documentName || "General Query")
        })
        setExpandedGroups(groups)
      }
    } catch (e) {
      console.error("Failed to fetch history", e)
    } finally {
      setFetching(false)
    }
  }

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleAnswer = (id: string) => {
    setExpandedAnswers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Group logs by document name
  const grouped: GroupedHistory[] = []
  const groupMap = new Map<string, QALog[]>()
  const filtered = allLogs.filter(q =>
    q.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (q.documentName || "").toLowerCase().includes(searchTerm.toLowerCase())
  )
  filtered.forEach(q => {
    const key = q.documentName || "General Query"
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(q)
  })
  groupMap.forEach((entries, documentName) => {
    grouped.push({ documentName, entries: entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) })
  })
  grouped.sort((a, b) => new Date(b.entries[0].timestamp).getTime() - new Date(a.entries[0].timestamp).getTime())

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-primary/10">
                  <History className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-3xl font-bold">Chat History</h1>
              </div>
              <p className="text-muted-foreground">All your past Q&amp;A sessions, grouped by document</p>
            </div>
            <div className="flex gap-3 mt-4 sm:mt-0">
              <Badge variant="secondary" className="text-sm px-3 py-1">
                <MessageSquare className="h-3 w-3 mr-1" />
                {allLogs.length} total queries
              </Badge>
              <Badge variant="secondary" className="text-sm px-3 py-1">
                <FileText className="h-3 w-3 mr-1" />
                {grouped.length} documents
              </Badge>
            </div>
          </div>

          {/* Search */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search questions or document names..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Loading */}
          {fetching && (
            <div className="text-center py-16">
              <Brain className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
              <p className="text-muted-foreground">Loading your history...</p>
            </div>
          )}

          {/* Empty */}
          {!fetching && allLogs.length === 0 && (
            <Card>
              <CardContent className="p-16 text-center">
                <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No History Yet</h3>
                <p className="text-muted-foreground mb-6">Upload documents and ask questions to build your history.</p>
                <Button onClick={() => router.push("/upload")}>Upload Your First Document</Button>
              </CardContent>
            </Card>
          )}

          {/* Groups */}
          {!fetching && grouped.map(group => (
            <Card key={group.documentName} className="mb-4 overflow-hidden">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.documentName)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between p-5 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-base">{group.documentName}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {group.entries.length} question{group.entries.length !== 1 ? "s" : ""} • Last asked {new Date(group.entries[0].timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{group.entries.length}</Badge>
                    {expandedGroups.has(group.documentName) ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </button>

              {/* Entries */}
              {expandedGroups.has(group.documentName) && (
                <div className="border-t divide-y">
                  {group.entries.map(entry => (
                    <div key={entry.id} className="p-5">
                      {/* Question */}
                      <div className="flex items-start gap-3 mb-3">
                        {entry.foundInDocument ? (
                          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-sm leading-relaxed">{entry.text}</p>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {entry.confidence > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {entry.confidence}%
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Answer toggle */}
                      {entry.answer && (
                        <div className="ml-8">
                          <button
                            onClick={() => toggleAnswer(entry.id)}
                            className="flex items-center gap-1 text-xs text-primary hover:underline mb-2 font-medium"
                          >
                            <Brain className="h-3 w-3" />
                            {expandedAnswers.has(entry.id) ? "Hide Answer" : "View Answer"}
                            {expandedAnswers.has(entry.id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>

                          {expandedAnswers.has(entry.id) && (
                            <div className={`p-4 rounded-lg border-l-4 text-sm whitespace-pre-wrap leading-relaxed ${
                              entry.foundInDocument
                                ? "bg-green-50 dark:bg-green-900/10 border-l-green-500"
                                : "bg-red-50 dark:bg-red-900/10 border-l-red-400"
                            }`}>
                              {entry.answer}

                              {/* Citation */}
                              {entry.citation && (
                                <div className="mt-3 p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800">
                                  <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 mb-1">📌 Citation</p>
                                  <p className="text-xs text-yellow-800 dark:text-yellow-300 italic">"{entry.citation}"</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  )
}
