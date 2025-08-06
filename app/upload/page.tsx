"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProgressStepper } from "@/components/progress-stepper"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { Upload, FileText, File, Mail, CheckCircle, X, AlertCircle, ArrowRight } from "lucide-react"

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  url: string
  uploadedAt: Date
}

export default function UploadPage() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const { user, loading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
      return
    }

    // Load existing files from localStorage
    if (typeof window !== "undefined") {
      const savedFiles = localStorage.getItem("documents")
      if (savedFiles) {
        const parsedFiles = JSON.parse(savedFiles).map((file: any) => ({
          ...file,
          uploadedAt: new Date(file.uploadedAt),
        }))
        setFiles(parsedFiles)
      }
    }
  }, [user, loading, router])

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploading(true)
      setUploadProgress(0)

      try {
        for (const file of acceptedFiles) {
          // Simulate file upload with progress
          const uploadedFile: UploadedFile = {
            id: Math.random().toString(36).substr(2, 9),
            name: file.name,
            size: file.size,
            type: file.type,
            url: URL.createObjectURL(file), // In production, this would be a real URL
            uploadedAt: new Date(),
          }

          // Simulate upload progress
          for (let i = 0; i <= 100; i += 10) {
            setUploadProgress(i)
            await new Promise((resolve) => setTimeout(resolve, 100))
          }

          setFiles((prev) => {
            const newFiles = [...prev, uploadedFile]
            if (typeof window !== "undefined") {
              localStorage.setItem("documents", JSON.stringify(newFiles))
            }
            return newFiles
          })
        }

        toast({
          title: "Success",
          description: `${acceptedFiles.length} file(s) uploaded successfully!`,
        })

        // Update current step
        if (typeof window !== "undefined") {
          localStorage.setItem("currentStep", "2")
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to upload files. Please try again.",
          variant: "destructive",
        })
      } finally {
        setUploading(false)
        setUploadProgress(0)
      }
    },
    [toast],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
      "message/rfc822": [".eml"],
      "text/plain": [".txt"],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: true,
  })

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const newFiles = prev.filter((file) => file.id !== id)
      if (typeof window !== "undefined") {
        localStorage.setItem("documents", JSON.stringify(newFiles))
      }
      return newFiles
    })

    toast({
      title: "File Removed",
      description: "File has been removed from your documents.",
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
    if (type.includes("pdf")) return <FileText className="h-6 w-6 text-red-500" />
    if (type.includes("word") || type.includes("document")) return <File className="h-6 w-6 text-blue-500" />
    if (type.includes("message") || type.includes("email")) return <Mail className="h-6 w-6 text-green-500" />
    return <File className="h-6 w-6 text-gray-500" />
  }

  const handleContinue = () => {
    if (files.length === 0) {
      toast({
        title: "No Files",
        description: "Please upload at least one document to continue with DocuMind AI.",
        variant: "destructive",
      })
      return
    }
    router.push("/query")
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
            <h1 className="text-3xl font-bold mb-4">Upload Your Documents</h1>
            <p className="text-muted-foreground">
              Upload PDF, DOCX, or email files to start analyzing with DocuMind AI
            </p>
          </div>

          {/* Upload Area */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Upload className="mr-2 h-5 w-5" />
                Document Upload
              </CardTitle>
              <CardDescription>
                Drag and drop your files here or click to browse. Supports PDF, DOCX, DOC, EML, and TXT files up to 50MB
                each.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                {isDragActive ? (
                  <p className="text-lg font-medium text-primary">Drop the files here...</p>
                ) : (
                  <div>
                    <p className="text-lg font-medium mb-2">Drag & drop files here, or click to select</p>
                    <p className="text-sm text-muted-foreground">PDF, DOCX, DOC, EML, TXT files up to 50MB</p>
                  </div>
                )}
              </div>

              {uploading && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Uploading...</span>
                    <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="w-full" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Uploaded Files */}
          {files.length > 0 && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CheckCircle className="mr-2 h-5 w-5 text-green-500" />
                  Uploaded Documents ({files.length})
                </CardTitle>
                <CardDescription>Your uploaded documents are ready for analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {files.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        {getFileIcon(file.type)}
                        <div>
                          <p className="font-medium">{file.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatFileSize(file.size)} • Uploaded {file.uploadedAt.toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(file.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Instructions */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertCircle className="mr-2 h-5 w-5 text-blue-500" />
                How It Works
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="bg-blue-100 dark:bg-blue-900/20 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                    <span className="text-blue-600 dark:text-blue-400 font-bold">1</span>
                  </div>
                  <h3 className="font-semibold mb-2">Upload Documents</h3>
                  <p className="text-sm text-muted-foreground">Upload your PDF, DOCX, or email files securely</p>
                </div>

                <div className="text-center">
                  <div className="bg-green-100 dark:bg-green-900/20 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                    <span className="text-green-600 dark:text-green-400 font-bold">2</span>
                  </div>
                  <h3 className="font-semibold mb-2">AI Processing</h3>
                  <p className="text-sm text-muted-foreground">Our AI analyzes and indexes your documents</p>
                </div>

                <div className="text-center">
                  <div className="bg-purple-100 dark:bg-purple-900/20 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                    <span className="text-purple-600 dark:text-purple-400 font-bold">3</span>
                  </div>
                  <h3 className="font-semibold mb-2">Ask Questions</h3>
                  <p className="text-sm text-muted-foreground">Query your documents using natural language</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Continue Button */}
          <div className="text-center">
            <Button size="lg" onClick={handleContinue} disabled={files.length === 0} className="px-8 py-3">
              Continue to Questions
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
