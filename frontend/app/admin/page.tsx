"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  Users, FileQuestion, Activity, Mail, FileText, HardDrive,
  LogIn, Upload, Share2, Search, TrendingUp, RefreshCw,
} from "lucide-react"
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001"

const DOC_TYPE_COLORS: Record<string, string> = {
  Academic: "#6366f1",
  Technical: "#8b5cf6",
  Legal: "#ef4444",
  Medical: "#10b981",
  Financial: "#f59e0b",
  General: "#94a3b8",
}

const ACTION_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  LOGIN: { icon: <LogIn className="h-4 w-4" />, color: "text-blue-500", label: "Login" },
  SIGNUP: { icon: <Users className="h-4 w-4" />, color: "text-green-500", label: "Sign Up" },
  QUERY_ANALYZED: { icon: <Search className="h-4 w-4" />, color: "text-purple-500", label: "Query" },
  DOCUMENTS_SYNCED: { icon: <Upload className="h-4 w-4" />, color: "text-orange-500", label: "Sync" },
  SHARE_CREATED: { icon: <Share2 className="h-4 w-4" />, color: "text-pink-500", label: "Share" },
}

interface Stats {
  totalUsers: number
  totalQueries: number
  totalDocuments: number
  totalStorageUsed: number
  userGrowth: { date: string; count: number }[]
  topUsers: { email: string; name: string; queries: number }[]
  docTypeDistribution: { type: string; count: number }[]
}

interface ActivityLog {
  _id: string
  userEmail: string
  action: string
  details: string
  timestamp: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0, totalQueries: 0, totalDocuments: 0, totalStorageUsed: 0,
    userGrowth: [], topUsers: [], docTypeDistribution: []
  })
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!user || user.role !== "admin") {
      router.push("/")
      return
    }
    fetchAll()
  }, [user, router])

  const fetchAll = async () => {
    setRefreshing(true)
    await Promise.all([fetchStats(), fetchLogs()])
    setRefreshing(false)
  }

  const fetchStats = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/stats`)
      const data = await res.json()
      if (data.success && data.stats) setStats(data.stats)
    } catch (e) { console.error("Failed to load stats", e) }
  }

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/logs?limit=50`)
      const data = await res.json()
      if (data.success) setLogs(data.logs || [])
    } catch (e) { console.error("Failed to load logs", e) }
  }

  if (!user || user.role !== "admin") return null

  const pieData = stats.docTypeDistribution.length > 0
    ? stats.docTypeDistribution
    : [{ type: "No Data", count: 1 }]

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />

      <main className="flex-grow container mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">Admin Gateway</h1>
            <p className="text-muted-foreground mt-1">DocuMind Global Statistics, Charts & Activity Logs</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={fetchAll} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="destructive" onClick={logout}>Force Terminate Session</Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
            <TabsTrigger value="activity">Activity Logs</TabsTrigger>
          </TabsList>

          {/* ─── OVERVIEW TAB ─── */}
          <TabsContent value="overview" className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <Card className="shadow-md border-blue-200 dark:border-blue-800">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">Total Registered Users</CardTitle>
                  <Users className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">{stats.totalUsers}</div>
                  <p className="text-xs text-muted-foreground mt-1">Active DocuMind accounts</p>
                </CardContent>
              </Card>

              <Card className="shadow-md border-purple-200 dark:border-purple-800">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">Total AI Queries</CardTitle>
                  <FileQuestion className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-purple-600 dark:text-purple-400">{stats.totalQueries}</div>
                  <p className="text-xs text-muted-foreground mt-1">Documents analyzed</p>
                </CardContent>
              </Card>

              <Card className="shadow-md border-emerald-200 dark:border-emerald-800">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">Total Documents Stored</CardTitle>
                  <FileText className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">{stats.totalDocuments}</div>
                  <p className="text-xs text-muted-foreground mt-1">Across all users</p>
                </CardContent>
              </Card>

              <Card className="shadow-md border-orange-200 dark:border-orange-800">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">Total Storage Used</CardTitle>
                  <HardDrive className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">{formatBytes(stats.totalStorageUsed)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Across all accounts</p>
                </CardContent>
              </Card>
            </div>

            {/* System Health + Admin ID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Card className="shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">System Health</CardTitle>
                  <Activity className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-green-500">100%</div>
                  <p className="text-xs text-muted-foreground mt-1">All services operational</p>
                  <div className="mt-3 space-y-1.5">
                    {["MongoDB Auth DB", "MongoDB Data DB", "Groq AI", "Express Backend"].map(svc => (
                      <div key={svc} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{svc}</span>
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">Operational</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-md border-blue-500/50 bg-blue-50/50 dark:bg-blue-900/10">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">Admin Session</CardTitle>
                  <Mail className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-semibold truncate mt-1">{user.email}</div>
                  <p className="text-xs text-muted-foreground mt-1">Super Administrator</p>
                  <Separator className="my-3" />
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>• Full database access</p>
                    <p>• User management enabled</p>
                    <p>• Activity monitoring active</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Users Table */}
            {stats.topUsers.length > 0 && (
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Top Users by Query Count
                  </CardTitle>
                  <CardDescription>Most active DocuMind users</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.topUsers.map((u, i) => (
                      <div key={u.email} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className={`font-bold text-sm w-6 ${i === 0 ? "text-yellow-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                            #{i + 1}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                        <Badge variant="secondary">{u.queries} queries</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ─── CHARTS TAB ─── */}
          <TabsContent value="charts" className="space-y-6">
            {/* User Growth Chart */}
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle>User Growth — Last 30 Days</CardTitle>
                <CardDescription>New user registrations per day</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.userGrowth.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={stats.userGrowth} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [v, "New Users"]} labelFormatter={l => `Date: ${l}`} />
                      <Legend />
                      <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5}
                        dot={{ r: 4, fill: "#6366f1" }} activeDot={{ r: 7 }} name="New Users" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-40 text-muted-foreground">
                    No user registration data in the last 30 days
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Users Bar Chart */}
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle>Queries per User</CardTitle>
                <CardDescription>Top 10 most active users by AI query count</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.topUsers.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={stats.topUsers} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [v, "Queries"]} />
                      <Bar dataKey="queries" fill="#8b5cf6" radius={[6, 6, 0, 0]} name="Queries" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-40 text-muted-foreground">No query data yet</div>
                )}
              </CardContent>
            </Card>

            {/* Document Type Pie Chart */}
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle>Document Type Distribution</CardTitle>
                <CardDescription>Breakdown of uploaded documents by AI-detected category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-center gap-8">
                  <ResponsiveContainer width="100%" height={240} className="max-w-sm">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                        paddingAngle={3} dataKey="count" nameKey="type">
                        {pieData.map((entry, i) => (
                          <Cell key={`cell-${i}`}
                            fill={DOC_TYPE_COLORS[entry.type] || "#94a3b8"} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, name) => [v, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2 min-w-[140px]">
                    {pieData.map(entry => (
                      <div key={entry.type} className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: DOC_TYPE_COLORS[entry.type] || "#94a3b8" }} />
                        <span className="text-sm">{entry.type}</span>
                        <span className="text-sm font-semibold ml-auto">{entry.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── ACTIVITY LOGS TAB ─── */}
          <TabsContent value="activity" className="space-y-4">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Live Activity Feed
                </CardTitle>
                <CardDescription>Last 50 user actions across all accounts</CardDescription>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Activity className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p>No activity logs yet. Actions will appear here in real time.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                    {logs.map(log => {
                      const meta = ACTION_META[log.action] || { icon: <Activity className="h-4 w-4" />, color: "text-slate-500", label: log.action }
                      return (
                        <div key={log._id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                          <div className={`mt-0.5 flex-shrink-0 ${meta.color}`}>{meta.icon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs px-1.5 py-0">{meta.label}</Badge>
                              <span className="text-sm font-medium truncate">{log.userEmail}</span>
                            </div>
                            {log.details && <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.details}</p>}
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0 mt-0.5">
                            {timeAgo(log.timestamp)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
    </div>
  )
}
