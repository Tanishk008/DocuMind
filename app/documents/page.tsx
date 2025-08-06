"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { FileText, File, Mail, Search, Trash2, Download, Eye, Calendar, HardDrive, Plus } from "lucide-react"

interface Document {
  id: string
  name: string
  size: number
  type: string
  url: string
  uploadedAt: Date
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filteredDocs, setFilteredDocs] = useState<Document[]>([])
  const { user, loading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
      return
    }

    // Load documents from localStorage
    if (typeof window !== "undefined") {
      const savedDocs = localStorage.getItem("documents")
      if (savedDocs) {
        const docs = JSON.parse(savedDocs).map((doc: any) => ({
          ...doc,
          uploadedAt: new Date(doc.uploadedAt),
        }))
        setDocuments(docs)
        setFilteredDocs(docs)
      }
    }
  }, [user, loading, router])

  useEffect(() => {
    // Filter documents based on search term
    const filtered = documents.filter((doc) => doc.name.toLowerCase().includes(searchTerm.toLowerCase()))
    setFilteredDocs(filtered)
  }, [searchTerm, documents])

  const deleteDocument = (id: string) => {
    const updatedDocs = documents.filter((doc) => doc.id !== id)
    setDocuments(updatedDocs)

    if (typeof window !== "undefined") {
      localStorage.setItem("documents", JSON.stringify(updatedDocs))
    }

    toast({
      title: "Document Deleted",
      description: "Document has been removed from your collection.",
    })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const getFileIcon = (type: string) => {
    if (type.includes("pdf")) return <FileText className="h-8 w-8 text-red-500" />
    if (type.includes("word") || type.includes("document")) return <File className="h-8 w-8 text-blue-500" />
    if (type.includes("message") || type.includes("email")) return <Mail className="h-8 w-8 text-green-500" />
    return <File className="h-8 w-8 text-gray-500" />
  }

  const getTotalSize = () => {
    return documents.reduce((total, doc) => total + doc.size, 0)
  }

  const downloadDocument = (doc: Document) => {
    // In a real app, this would download from the actual URL
    toast({
      title: "Download Started",
      description: `Downloading ${doc.name}...`,
    })
  }

  const viewDocument = (doc: Document) => {
    // In a real app, this would open the document viewer
    toast({
      title: "Opening Document",
      description: `Opening ${doc.name} in viewer...`,
    })
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
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">My Documents</h1>
              <p className="text-muted-foreground">Manage your uploaded documents and storage with DocuMind AI</p>
            </div>
            <Button onClick={() => router.push("/upload")} className="mt-4 sm:mt-0">
              <Plus className="mr-2 h-4 w-4" />
              Upload New
            </Button>
          </div>

          {/* Storage Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <FileText className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">{documents.length}</p>
                    <p className="text-sm text-muted-foreground">Total Documents</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <HardDrive className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">{formatFileSize(getTotalSize())}</p>
                    <p className="text-sm text-muted-foreground">Storage Used</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      {documents.length > 0 ? documents[documents.length - 1].uploadedAt.toLocaleDateString() : "N/A"}
                    </p>
                    <p className="text-sm text-muted-foreground">Last Upload</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Documents List */}
          {filteredDocs.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {documents.length === 0 ? "No Documents Yet" : "No Documents Found"}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {documents.length === 0
                    ? "Upload your first document to get started with DocuMind AI analysis"
                    : "Try adjusting your search terms"}
                </p>
                {documents.length === 0 && (
                  <Button onClick={() => router.push("/upload")}>
                    <Plus className="mr-2 h-4 w-4" />
                    Upload Document
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDocs.map((doc) => (
                <Card key={doc.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        {getFileIcon(doc.type)}
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate">{doc.name}</CardTitle>
                          <CardDescription>{formatFileSize(doc.size)}</CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Uploaded</span>
                        <span>{doc.uploadedAt.toLocaleDateString()}</span>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Type</span>
                        <Badge variant="secondary" className="text-xs">
                          {doc.type.split("/")[1]?.toUpperCase() || "FILE"}
                        </Badge>
                      </div>

                      <div className="flex space-x-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => viewDocument(doc)} className="flex-1">
                          <Eye className="mr-1 h-3 w-3" />
                          View
                        </Button>

                        <Button variant="outline" size="sm" onClick={() => downloadDocument(doc)} className="flex-1">
                          <Download className="mr-1 h-3 w-3" />
                          Download
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteDocument(doc.id)}
                          className="text-destructive hover:text-destructive"
                        >
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
