"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAuth, type DocumentMetadata } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import {
  FileText, File, Mail, Search, Trash2, Download, Eye,
  Calendar, HardDrive, Plus, Tag, X, ChevronDown, ChevronUp,
  BookOpen, Layers, Filter, LayoutGrid, LayoutList,
} from "lucide-react"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001"

const DOC_TYPE_STYLES: Record<string, string> = {
  Legal: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200",
  Medical: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200",
  Academic: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200",
  Financial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200",
  Technical: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border-violet-200",
  General: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200",
}

const TAG_PRESETS = ["Work", "Personal", "Legal", "Finance", "Research", "Archive", "Important"]

export default function DocumentsPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [tagFilter, setTagFilter] = useState<string>("")
  const [typeFilter, setTypeFilter] = useState<string>("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [viewerDoc, setViewerDoc] = useState<DocumentMetadata | null>(null)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [expandedSummary, setExpandedSummary] = useState<Set<string>>(new Set())
  const [editingTags, setEditingTags] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState("")
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null) // id of doc being fetched
  const { user, loading, documents, setDocuments, storageInfo } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.push("/auth")
  }, [user, loading, router])

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
  }

  const getFileIcon = (type: string) => {
    if (type.includes("pdf")) return <FileText className="h-8 w-8 text-red-500" />
    if (type.includes("word") || type.includes("document")) return <File className="h-8 w-8 text-blue-500" />
    if (type.includes("message") || type.includes("email")) return <Mail className="h-8 w-8 text-green-500" />
    return <File className="h-8 w-8 text-gray-500" />
  }

  const getBase64 = async (doc: DocumentMetadata): Promise<string> => {
    // 1. Try sessionStorage first (fastest, current session uploads)
    const raw = sessionStorage.getItem("uploadedFiles")
    if (raw) {
      try {
        const serialized = JSON.parse(raw)
        const found = serialized.find((f: any) => f.name === doc.name)
        if (found?.data) return found.data
      } catch {}
    }
    // 2. Try content already on the document object (loaded from DB on login)
    if ((doc as any).content) return (doc as any).content
    // 3. Fetch from backend API (documents from previous sessions)
    if (user) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/user/documents/${doc.id}/content?email=${encodeURIComponent(user.email)}`)
        if (res.ok) {
          const data = await res.json()
          if (data.content) return data.content
        }
      } catch {}
    }
    return ""
  }

  const downloadDocument = async (doc: DocumentMetadata) => {
    setLoadingDoc(doc.id)
    const base64Data = await getBase64(doc)
    setLoadingDoc(null)
    if (!base64Data) {
      toast({ title: "Download Failed", description: `Content not available. Please re-upload ${doc.name}.`, variant: "destructive" })
      return
    }
    try {
      const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: doc.type })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = doc.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: "✅ Download Started", description: `Downloading ${doc.name}` })
    } catch (e: any) {
      toast({ title: "Download Failed", description: e.message, variant: "destructive" })
    }
  }

  const viewDocument = async (doc: DocumentMetadata) => {
    setLoadingDoc(doc.id)
    const base64Data = await getBase64(doc)
    setLoadingDoc(null)
    if (!base64Data) {
      toast({ title: "View Failed", description: `Content not available. Please re-upload ${doc.name}.`, variant: "destructive" })
      return
    }
    try {
      const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: doc.type })
      const url = URL.createObjectURL(blob)
      setViewerDoc(doc)
      setViewerUrl(url)
    } catch (e: any) {
      toast({ title: "View Failed", description: e.message, variant: "destructive" })
    }
  }

  const closeViewer = () => {
    if (viewerUrl) URL.revokeObjectURL(viewerUrl)
    setViewerUrl(null)
    setViewerDoc(null)
  }

  const deleteDocument = (id: string) => {
    setDocuments(documents.filter(d => d.id !== id))
    toast({ title: "Document Deleted", description: "Removed from your collection." })
  }

  const toggleSummary = (id: string) => {
    setExpandedSummary(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addTag = async (doc: DocumentMetadata, tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed || (doc.tags || []).includes(trimmed)) return
    const newTags = [...(doc.tags || []), trimmed]
    const updatedDocs = documents.map(d => d.id === doc.id ? { ...d, tags: newTags } : d)
    setDocuments(updatedDocs)
    setTagInput("")
    if (user) {
      fetch(`${BACKEND_URL}/api/user/documents/${doc.id}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, tags: newTags })
      }).catch(console.error)
    }
  }

  const removeTag = async (doc: DocumentMetadata, tag: string) => {
    const newTags = (doc.tags || []).filter(t => t !== tag)
    const updatedDocs = documents.map(d => d.id === doc.id ? { ...d, tags: newTags } : d)
    setDocuments(updatedDocs)
    if (user) {
      fetch(`${BACKEND_URL}/api/user/documents/${doc.id}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, tags: newTags })
      }).catch(console.error)
    }
  }

  // Filter logic
  const allTags = Array.from(new Set(documents.flatMap(d => d.tags || [])))
  const allTypes = Array.from(new Set(documents.map(d => d.documentType || "General")))
  const filteredDocs = documents.filter(doc => {
    const matchSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchTag = !tagFilter || (doc.tags || []).includes(tagFilter)
    const matchType = !typeFilter || (doc.documentType || "General") === typeFilter
    return matchSearch && matchTag && matchType
  })

  const storagePercent = storageInfo.percentUsed
  const storageColor = storagePercent > 80 ? "bg-red-500" : storagePercent > 60 ? "bg-amber-500" : "bg-emerald-500"

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* In-Browser Viewer Modal */}
      {viewerDoc && viewerUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 bg-gray-900 text-white">
            <div className="flex items-center gap-3">
              {getFileIcon(viewerDoc.type)}
              <div>
                <p className="font-semibold text-sm">{viewerDoc.name}</p>
                <p className="text-xs text-gray-400">{formatFileSize(viewerDoc.size)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="border-gray-600 text-white hover:bg-gray-700"
                onClick={() => downloadDocument(viewerDoc)}>
                <Download className="h-4 w-4 mr-1" /> Download
              </Button>
              <Button size="sm" variant="outline" className="border-gray-600 text-white hover:bg-gray-700" onClick={closeViewer}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 bg-white">
            <iframe
              src={viewerUrl}
              title={viewerDoc.name}
              className="w-full h-full border-0"
              style={{ minHeight: "calc(100vh - 60px)" }}
            />
          </div>
        </div>
      )}

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">

          {/* Page Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Layers className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-3xl font-bold">Document Vault</h1>
              </div>
              <p className="text-muted-foreground">Manage, organize, and access all your uploaded documents</p>
            </div>
            <Button onClick={() => router.push("/upload")} className="mt-4 sm:mt-0" size="lg">
              <Plus className="mr-2 h-4 w-4" />
              Upload New
            </Button>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <FileText className="h-8 w-8 text-blue-500 flex-shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{documents.length}</p>
                  <p className="text-xs text-muted-foreground">Documents</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Tag className="h-8 w-8 text-purple-500 flex-shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{allTags.length}</p>
                  <p className="text-xs text-muted-foreground">Tags Used</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Calendar className="h-8 w-8 text-orange-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold">
                    {documents.length > 0 ? new Date(documents[documents.length - 1].uploadedAt).toLocaleDateString() : "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground">Last Upload</p>
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-2 md:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="h-4 w-4 text-slate-500" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Storage: {formatFileSize(storageInfo.storageUsed)} / {formatFileSize(storageInfo.storageLimit)}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${storageColor}`}
                    style={{ width: `${Math.min(storagePercent, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{storagePercent}% used</p>
              </CardContent>
            </Card>
          </div>

          {/* Search + Filters */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search documents..." value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
                </div>

                {allTags.length > 0 && (
                  <select value={tagFilter} onChange={e => setTagFilter(e.target.value)}
                    className="border rounded-md px-3 py-2 text-sm bg-background min-w-[130px]">
                    <option value="">All Tags</option>
                    {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}

                {allTypes.length > 1 && (
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                    className="border rounded-md px-3 py-2 text-sm bg-background min-w-[150px]">
                    <option value="">All Types</option>
                    {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}

                <div className="flex gap-1 border rounded-md overflow-hidden">
                  <button onClick={() => setViewMode("grid")}
                    className={`p-2 ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button onClick={() => setViewMode("list")}
                    className={`p-2 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    <LayoutList className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Documents */}
          {filteredDocs.length === 0 ? (
            <Card>
              <CardContent className="p-16 text-center">
                <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">
                  {documents.length === 0 ? "No Documents Yet" : "No Documents Match Filters"}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {documents.length === 0
                    ? "Upload documents to build your vault"
                    : "Try clearing your filters"}
                </p>
                {documents.length === 0 && (
                  <Button onClick={() => router.push("/upload")}>
                    <Plus className="mr-2 h-4 w-4" />Upload Document
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className={viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
              : "flex flex-col gap-3"
            }>
              {filteredDocs.map(doc => (
                <Card key={doc.id} className={`group hover:shadow-lg transition-all duration-200 overflow-hidden ${
                  viewMode === "list" ? "flex flex-col sm:flex-row" : ""
                }`}>
                  <CardHeader className={`pb-2 ${viewMode === "list" ? "sm:w-64 flex-shrink-0" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {getFileIcon(doc.type)}
                        <div className="min-w-0">
                          <CardTitle className="text-sm truncate" title={doc.name}>{doc.name}</CardTitle>
                          <CardDescription className="text-xs">{formatFileSize(doc.size)}</CardDescription>
                        </div>
                      </div>
                      {doc.documentType && doc.documentType !== "General" && (
                        <Badge className={`text-xs flex-shrink-0 border ${DOC_TYPE_STYLES[doc.documentType] || DOC_TYPE_STYLES.General}`}>
                          {doc.documentType}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0 flex-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}</span>
                        <Badge variant="outline" className="text-xs">
                          {doc.type.split("/")[1]?.toUpperCase() || "FILE"}
                        </Badge>
                      </div>

                      {/* AI Summary */}
                      {doc.summary && (
                        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3 text-xs">
                          <button onClick={() => toggleSummary(doc.id)}
                            className="flex items-center justify-between w-full font-semibold text-blue-700 dark:text-blue-400 mb-1">
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3 w-3" /> AI Summary
                            </span>
                            {expandedSummary.has(doc.id)
                              ? <ChevronUp className="h-3 w-3" />
                              : <ChevronDown className="h-3 w-3" />}
                          </button>
                          <p className={`text-muted-foreground leading-relaxed ${
                            expandedSummary.has(doc.id) ? "" : "line-clamp-2"
                          }`}>
                            {doc.summary}
                          </p>
                        </div>
                      )}

                      {/* Tags */}
                      <div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {(doc.tags || []).map(tag => (
                            <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                              {tag}
                              <button onClick={() => removeTag(doc, tag)} className="hover:text-red-500 ml-0.5">
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                          <button onClick={() => setEditingTags(editingTags === doc.id ? null : doc.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
                            <Tag className="h-2.5 w-2.5" />
                            {(doc.tags || []).length === 0 ? "Add tag" : "+"}
                          </button>
                        </div>

                        {editingTags === doc.id && (
                          <div className="space-y-2">
                            <div className="flex gap-1">
                              <Input placeholder="Add tag..." value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") addTag(doc, tagInput) }}
                                className="h-7 text-xs flex-1" />
                              <Button size="sm" className="h-7 px-2 text-xs"
                                onClick={() => addTag(doc, tagInput)}>Add</Button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {TAG_PRESETS.filter(t => !(doc.tags || []).includes(t)).map(preset => (
                                <button key={preset} onClick={() => addTag(doc, preset)}
                                  className="text-xs px-2 py-0.5 rounded-full border hover:bg-muted transition-colors">
                                  {preset}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => viewDocument(doc)}
                          disabled={loadingDoc === doc.id}
                          className="flex-1 text-xs"
                        >
                          {loadingDoc === doc.id
                            ? <><span className="animate-spin mr-1">⏳</span> Loading...</>
                            : <><Eye className="mr-1 h-3 w-3" /> View</>
                          }
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          onClick={() => downloadDocument(doc)}
                          disabled={loadingDoc === doc.id}
                          className="flex-1 text-xs"
                        >
                          {loadingDoc === doc.id
                            ? <><span className="animate-spin mr-1">⏳</span> Loading...</>
                            : <><Download className="mr-1 h-3 w-3" /> Download</>
                          }
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => deleteDocument(doc.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
