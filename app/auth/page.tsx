"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { FileText, Mail, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  
  // OTP State
  const [showOtpInput, setShowOtpInput] = useState(false)
  const [generatedOtp, setGeneratedOtp] = useState("")
  const [inputOtp, setInputOtp] = useState("")
  const [pendingUser, setPendingUser] = useState<any>(null)

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    confirmPassword: "",
  })

  const { login, signup, checkCredentials, commitSession } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inputOtp === generatedOtp && pendingUser) {
      commitSession(pendingUser)
      toast({
        title: "✅ Security Verified",
        description: "Logged in successfully!",
      })
      router.push("/")
    } else {
      toast({
        title: "❌ Invalid OTP",
        description: "The code you entered is incorrect. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleStandardSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (isLogin) {
        // Step 1: Validate Credentials before sending OTP
        const validUser = await checkCredentials(formData.email, formData.password)
        if (validUser) {
          // Generate 6-digit OTP
          const newOtp = Math.floor(100000 + Math.random() * 900000).toString()
          setGeneratedOtp(newOtp)
          setPendingUser(validUser)

          // Send Email via Backend
          await fetch('/api/auth/otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: formData.email, otp: newOtp })
          })

          setShowOtpInput(true)
          toast({
            title: "🔐 OTP Sent",
            description: `We've sent a 6-digit security code to ${formData.email}.`,
          })
        } else {
          toast({
            title: "Error",
            description: "Invalid email or password",
            variant: "destructive",
          })
        }
      } else {
        // Signup Flow
        if (formData.password !== formData.confirmPassword) {
          toast({ title: "Error", description: "Passwords do not match", variant: "destructive" })
          return
        }
        const success = await signup(formData.email, formData.password, formData.name)
        if (success) {
          toast({ title: "Success", description: "Account created successfully!" })
          router.push("/")
        } else {
          toast({ title: "Error", description: "Failed to create account. Email might be in use.", variant: "destructive" })
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center space-x-2">
            <FileText className="h-10 w-10 text-primary" />
            <h1 className="text-3xl font-bold">DocuMind AI</h1>
          </div>
          <p className="text-muted-foreground">Advanced AI-powered document intelligence</p>
          <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
            <span>by</span>
            <Badge variant="secondary" className="font-semibold">
              Tanishk Gupta
            </Badge>
          </div>
        </div>

        <Card className="shadow-lg relative overflow-hidden">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">
              {showOtpInput ? "Two-Factor Verification" : isLogin ? "Welcome Back" : "Create Account"}
            </CardTitle>
            <CardDescription className="text-center">
              {showOtpInput 
                ? "Check your email for the security code" 
                : isLogin 
                  ? "Sign in to your account to continue" 
                  : "Create a new account to get started"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {showOtpInput ? (
              <form onSubmit={handleOtpSubmit} className="space-y-6 animate-in slide-in-from-right-8">
                <div className="flex justify-center mb-4">
                  <div className="h-16 w-16 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center">
                    <ShieldCheck className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Input
                    type="text"
                    maxLength={6}
                    placeholder="• • • • • •"
                    className="text-center text-3xl tracking-[1em] font-mono h-16 bg-muted/50"
                    value={inputOtp}
                    onChange={(e) => setInputOtp(e.target.value.replace(/[^0-9]/g, ''))}
                    required
                    autoFocus
                  />
                  <p className="text-xs text-center text-muted-foreground">Sent to {formData.email}</p>
                </div>
                <Button type="submit" className="w-full" size="lg">
                  Verify & Proceed
                </Button>
                <div className="text-center mt-2">
                  <Button type="button" variant="link" onClick={() => { setShowOtpInput(false); setInputOtp(""); }}>
                    ← Go Back to Login
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleStandardSubmit} className="space-y-4 animate-in slide-in-from-left-8">
                {!isLogin && (
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Enter your full name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      className="pl-10"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      className="pl-10 pr-10"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                {!isLogin && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Confirm your password"
                        className="pl-10"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Please wait..." : isLogin ? "Secure Sign In" : "Create Account"}
                </Button>
                
                <div className="mt-6 text-center">
                  <Button type="button" variant="link" onClick={() => setIsLogin(!isLogin)} className="text-sm">
                    {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground">
          <p>© 2026 DocuMind AI - Tanishk Gupta</p>
          <p>End-to-End Encrypted & 2FA Protected</p>
        </div>
      </div>
    </div>
  )
}
