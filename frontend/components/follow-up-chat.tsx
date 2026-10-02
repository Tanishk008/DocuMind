"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Send, MessageCircle, Bot, User, ChevronDown, ChevronUp, Loader2 } from "lucide-react"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface FollowUpChatProps {
  originalQuestion: string
  originalAnswer: string
  language?: string
  // Stable per-card id (e.g. a result index) used to persist this thread across page
  // reloads/navigation within the session, so a follow-up conversation isn't lost the
  // moment the component unmounts.
  storageKey?: string
  // Lazily resolves the original source file so the backend can re-extract the document
  // and ground the follow-up answer in it, instead of answering from the previous answer
  // text alone (which produces vague replies for anything that answer didn't cover).
  getSourceFile?: () => Promise<File | null>
}

export function FollowUpChat({ originalQuestion, originalAnswer, language = "en", storageKey, getSourceFile }: FollowUpChatProps) {
  const sessionKey = storageKey ? `documind_followup_${storageKey}` : null

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined" || !sessionKey) return []
    try {
      const saved = sessionStorage.getItem(sessionKey)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, open])

  useEffect(() => {
    if (!sessionKey || typeof window === "undefined") return
    if (messages.length === 0) return
    sessionStorage.setItem(sessionKey, JSON.stringify(messages))
  }, [messages, sessionKey])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = { role: "user", content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput("")
    setLoading(true)

    let assistantText = ""
    let started = false

    try {
      const sourceFile = getSourceFile ? await getSourceFile().catch(() => null) : null

      const formData = new FormData()
      formData.append("originalQuestion", originalQuestion)
      formData.append("originalAnswer", originalAnswer)
      formData.append("followUpQuestion", text)
      formData.append("chatHistory", JSON.stringify(messages))
      formData.append("language", language)
      if (sourceFile) formData.append("file", sourceFile)

      const res = await fetch(`${BACKEND_URL}/api/followup-stream`, {
        method: "POST",
        body: formData,
      })

      if (!res.body) throw new Error("Streaming not supported")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split("\n\n")
        buffer = events.pop() || ""

        for (const rawEvent of events) {
          const line = rawEvent.trim()
          if (!line.startsWith("data:")) continue
          let evt: any
          try {
            evt = JSON.parse(line.slice(5).trim())
          } catch {
            continue
          }

          if (evt.token) {
            assistantText += evt.token
            if (!started) {
              started = true
              setMessages([...updatedMessages, { role: "assistant", content: assistantText }])
            } else {
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: "assistant", content: assistantText }
                return next
              })
            }
          } else if (evt.error && !assistantText) {
            setMessages([...updatedMessages, { role: "assistant", content: evt.error }])
            started = true
          }
        }
      }

      if (!started) {
        setMessages([...updatedMessages, { role: "assistant", content: "Sorry, I couldn't process that. Please try again." }])
      }
    } catch (e) {
      // If we already streamed a partial answer before the error, leave it as-is rather
      // than appending a second, duplicate bubble.
      if (!started) {
        setMessages([...updatedMessages, { role: "assistant", content: "Sorry, I couldn't process that. Please try again." }])
      }
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="mt-4 border rounded-xl overflow-hidden bg-background">
      {/* Toggle Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          Ask a follow-up question
          {messages.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
              {messages.length} message{messages.length > 1 ? "s" : ""}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {/* Chat Body */}
      {open && (
        <div className="border-t">
          {/* Messages */}
          <div className="max-h-72 overflow-y-auto p-4 space-y-3 bg-muted/20">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Ask anything about this answer — "tell me more about...", "explain point 2", "give an example"
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted border"
                }`}>
                  {msg.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                </div>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-background border rounded-tl-sm text-foreground"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-2">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted border flex items-center justify-center">
                  <Bot className="h-3 w-3" />
                </div>
                <div className="px-3 py-2 rounded-xl rounded-tl-sm bg-background border text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 p-3 border-t bg-background">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask a follow-up... (Enter to send)"
              className="flex-1 text-xs px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={loading}
            />
            <Button size="sm" onClick={sendMessage} disabled={!input.trim() || loading} className="h-8 px-3">
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
