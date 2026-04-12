"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Users, FileQuestion, Activity, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const router = useRouter()

  const [stats, setStats] = useState({
    totalUsers: 0,
    totalQueries: 0,
  })

  useEffect(() => {
    // Basic protection: kick non-admins
    if (!user || user.role !== "admin") {
      router.push("/")
      return
    }

    // Fetch stats from Remote Cloud Database
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/admin/stats")
        const data = await response.json()
        if (data.success && data.stats) {
          setStats(data.stats)
        }
      } catch (e) {
        console.error("Failed to load global statistics", e)
      }
    }
    
    fetchStats()
  }, [user, router])

  if (!user || user.role !== "admin") return null

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />

      <main className="flex-grow container mx-auto px-4 py-12">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">Admin Gateway</h1>
            <p className="text-muted-foreground mt-1">
              DocuMind Global Statistics & Management
            </p>
          </div>
          <Button variant="destructive" onClick={logout}>
            Force Terminate Session
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Total Registered Accounts</CardTitle>
              <Users className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground mt-1">Active DocuMind users</p>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Total AI Queries Evaluated</CardTitle>
              <FileQuestion className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{stats.totalQueries}</div>
              <p className="text-xs text-muted-foreground mt-1">Analyzed by Gemini Pro</p>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">System Health</CardTitle>
              <Activity className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-green-500">100%</div>
              <p className="text-xs text-muted-foreground mt-1">All services operational</p>
            </CardContent>
          </Card>

          <Card className="shadow-md border-blue-500/50 bg-blue-50/50 dark:bg-blue-900/10">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Admin ID</CardTitle>
              <Mail className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold truncate mt-1">{user.email}</div>
              <p className="text-xs text-muted-foreground mt-2">Super Administrator</p>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  )
}
