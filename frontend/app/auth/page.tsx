"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { FileText, Mail, Lock, Eye, EyeOff, ShieldCheck, RefreshCw, Clock } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import ParticlesBackground from "@/components/particles-background"

const OTP_EXPIRY_SECONDS = 5 * 60 // 5 minutes

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5001"

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  // OTP state — shared between login & signup flows
  const [showOtpInput, setShowOtpInput] = useState(false)
  const [inputOtp, setInputOtp] = useState("")
  const [pendingUser, setPendingUser] = useState<any>(null)
  // For signup: hold form data until OTP is verified, then create account
  const [pendingSignupData, setPendingSignupData] = useState<{ email: string; password: string; name: string } | null>(null)
  const [otpLoading, setOtpLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [otpMode, setOtpMode] = useState<"login" | "signup">("login")

  // Forgot password flow states
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [forgotOtpSent, setForgotOtpSent] = useState(false)
  const [forgotPasswordData, setForgotPasswordData] = useState({
    email: "",
    otp: "",
    newPassword: "",
    confirmNewPassword: "",
  })

  // Countdown
  const [secondsLeft, setSecondsLeft] = useState(OTP_EXPIRY_SECONDS)
  const [otpExpired, setOtpExpired] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const resendCooldownRef = useRef<NodeJS.Timeout | null>(null)

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    confirmPassword: "",
  })

  const { checkCredentials, commitSession, signup } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  // ── Countdown helpers ─────────────────────────────────────────────────────
  const clearCountdown = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
  }, [])

  const startCountdown = useCallback(() => {
    clearCountdown()
    setSecondsLeft(OTP_EXPIRY_SECONDS)
    setOtpExpired(false)
    countdownRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) { clearInterval(countdownRef.current!); countdownRef.current = null; setOtpExpired(true); return 0 }
        return prev - 1
      })
    }, 1000)
  }, [clearCountdown])

  const startResendCooldown = useCallback(() => {
    setResendCooldown(30)
    if (resendCooldownRef.current) clearInterval(resendCooldownRef.current)
    resendCooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => { if (prev <= 1) { clearInterval(resendCooldownRef.current!); return 0 } return prev - 1 })
    }, 1000)
  }, [])

  useEffect(() => {
    return () => {
      clearCountdown()
      if (resendCooldownRef.current) clearInterval(resendCooldownRef.current)
    }
  }, [clearCountdown])

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`

  const countdownColor = otpExpired ? "text-red-500" : secondsLeft <= 60 ? "text-orange-500" : "text-emerald-600 dark:text-emerald-400"

  // ── Send OTP via server ───────────────────────────────────────────────────
  const sendOtp = useCallback(async (email: string): Promise<boolean> => {
    const res = await fetch(`${BACKEND_URL}/api/auth/otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast({ title: "❌ Failed to send OTP", description: data.error || "Could not send email.", variant: "destructive" })
      return false
    }
    return true
  }, [toast])

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resendLoading) return
    setResendLoading(true)
    setInputOtp("")
    const email = otpMode === "login" ? formData.email : (pendingSignupData?.email || formData.email)
    const ok = await sendOtp(email)
    if (ok) { startCountdown(); startResendCooldown(); toast({ title: "📧 New OTP Sent", description: `A fresh code has been sent to ${email}.` }) }
    setResendLoading(false)
  }

  // ── Verify OTP → Login ────────────────────────────────────────────────────
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otpExpired) {
      toast({ title: "⏰ OTP Expired", description: "Your code has expired. Please request a new one.", variant: "destructive" })
      return
    }
    setOtpLoading(true)
    const email = otpMode === "login" ? formData.email : (pendingSignupData?.email || formData.email)

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/otp`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: inputOtp }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: "❌ Invalid Code", description: data.error || "The code you entered is incorrect.", variant: "destructive" })
        setOtpLoading(false)
        return
      }

      // OTP verified ✅
      clearCountdown()

      if (otpMode === "login") {
        // Login: commit the pre-validated user session
        commitSession(pendingUser)
        toast({ title: "✅ Verified!", description: "Welcome back — you're now logged in." })
        router.push("/")
      } else {
        // Signup: now create the account in the DB
        if (!pendingSignupData) { setOtpLoading(false); return }
        const ok = await signup(pendingSignupData.email, pendingSignupData.password, pendingSignupData.name)
        if (ok) {
          toast({ title: "🎉 Account Created!", description: "Your email is verified and account is ready." })
          router.push("/")
        } else {
          toast({ title: "Error", description: "Failed to create account. Email might already be in use.", variant: "destructive" })
          setOtpLoading(false)
        }
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" })
      setOtpLoading(false)
    }
  }

  // ── Login form submit ─────────────────────────────────────────────────────
  const handleStandardSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (isLogin) {
        const validUser = await checkCredentials(formData.email, formData.password)
        if (!validUser) {
          toast({ title: "❌ Authentication Failed", description: "Invalid email or password.", variant: "destructive" })
          return
        }
        const ok = await sendOtp(formData.email)
        if (!ok) return
        setPendingUser(validUser)
        setPendingSignupData(null)
        setOtpMode("login")
        setShowOtpInput(true)
        startCountdown()
        startResendCooldown()
        setInputOtp("")
        toast({ title: "🔐 OTP Sent", description: `A 6-digit code has been sent to ${formData.email}. Valid for 5 minutes.` })
      } else {
        // Signup: validate fields first, then send OTP before creating account
        if (formData.password !== formData.confirmPassword) {
          toast({ title: "Error", description: "Passwords do not match", variant: "destructive" })
          return
        }
        if (formData.password.length < 6) {
          toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" })
          return
        }
        // Check if email already exists
        const checkRes = await fetch(`${BACKEND_URL}/api/auth/signup`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
        // Send OTP to verify email ownership before creating account
        const ok = await sendOtp(formData.email)
        if (!ok) return
        setPendingSignupData({ email: formData.email, password: formData.password, name: formData.name })
        setPendingUser(null)
        setOtpMode("signup")
        setShowOtpInput(true)
        startCountdown()
        startResendCooldown()
        setInputOtp("")
        toast({ title: "📧 Verify Your Email", description: `We've sent a 6-digit code to ${formData.email}. Enter it to complete signup.` })
      }
    } catch (error) {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleBackToLogin = () => {
    clearCountdown()
    if (resendCooldownRef.current) clearInterval(resendCooldownRef.current)
    setShowOtpInput(false)
    setInputOtp("")
    setOtpExpired(false)
    setSecondsLeft(OTP_EXPIRY_SECONDS)
    setResendCooldown(0)
    setPendingSignupData(null)
  }

  const handleForgotSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const ok = await sendOtp(forgotPasswordData.email)
      if (ok) {
        setForgotOtpSent(true)
        setOtpMode("login") // Re-uses countdown timer styling
        startCountdown()
        startResendCooldown()
        toast({ title: "🔐 Verification Code Sent", description: `A 6-digit code has been sent to ${forgotPasswordData.email}.` })
      }
    } catch {
      toast({ title: "Error", description: "Failed to send verification code. Please try again.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (forgotPasswordData.newPassword !== forgotPasswordData.confirmNewPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" })
      return
    }
    if (forgotPasswordData.newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotPasswordData.email,
          otp: forgotPasswordData.otp,
          newPassword: forgotPasswordData.newPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: "❌ Reset Failed", description: data.error || "Failed to reset password.", variant: "destructive" })
        return
      }

      toast({ title: "🎉 Password Reset Successfully!", description: "Your password has been securely updated. You can now log in." })
      setIsForgotPassword(false)
      setForgotOtpSent(false)
      setFormData({ ...formData, email: forgotPasswordData.email, password: "" })
      setForgotPasswordData({ email: "", otp: "", newPassword: "", confirmNewPassword: "" })
      setIsLogin(true)
      clearCountdown()
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleBackToLoginFromForgot = () => {
    clearCountdown()
    setIsForgotPassword(false)
    setForgotOtpSent(false)
    setForgotPasswordData({ email: "", otp: "", newPassword: "", confirmNewPassword: "" })
  }

  const otpEmail = otpMode === "login" ? formData.email : (pendingSignupData?.email || formData.email)

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4 overflow-hidden">
      {/* Particles Background */}
      <ParticlesBackground />

      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center space-x-2">
            <FileText className="h-10 w-10 text-primary" />
            <h1 className="text-3xl font-bold">DocuMind AI</h1>
          </div>
          <p className="text-muted-foreground">Advanced AI-powered document intelligence</p>
          <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
            <span>by</span>
            <Badge variant="secondary" className="font-semibold">Tanishk Gupta</Badge>
          </div>
        </div>

        <Card className="shadow-lg relative overflow-hidden">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">
              {showOtpInput
                ? otpMode === "signup" ? "Verify Your Email" : "Two-Factor Verification"
                : isForgotPassword
                ? forgotOtpSent ? "Reset Password" : "Forgot Password"
                : isLogin ? "Welcome Back" : "Create Account"}
            </CardTitle>
            <CardDescription className="text-center">
              {showOtpInput
                ? otpMode === "signup"
                  ? "Enter the code to confirm your email and create your account"
                  : "Check your email for the security code"
                : isForgotPassword
                ? forgotOtpSent
                  ? "Enter the secure OTP code sent to your email and your new password"
                  : "Enter your registered email address to receive a secure recovery code"
                : isLogin
                ? "Sign in to your account to continue"
                : "Create a new account to get started"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {showOtpInput ? (
              <form onSubmit={handleOtpSubmit} className="space-y-5 animate-in slide-in-from-right-8">
                {/* Icon */}
                <div className="flex justify-center mb-2">
                  <div className="h-16 w-16 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center">
                    <ShieldCheck className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>

                {/* OTP Input */}
                <div className="space-y-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="• • • • • •"
                    className="text-center text-3xl tracking-[1em] font-mono h-16 bg-muted/50"
                    value={inputOtp}
                    onChange={(e) => setInputOtp(e.target.value.replace(/[^0-9]/g, ""))}
                    required
                    autoFocus
                    disabled={otpExpired}
                  />
                  <p className="text-xs text-center text-muted-foreground">
                    Sent to <span className="font-medium text-foreground">{otpEmail}</span>
                  </p>
                </div>

                {/* Countdown */}
                <div className={`flex items-center justify-center gap-2 text-sm font-semibold ${countdownColor} transition-colors`}>
                  <Clock className="h-4 w-4" />
                  {otpExpired ? <span>Code expired — please resend</span> : <span>Code expires in {formatTime(secondsLeft)}</span>}
                </div>

                {/* Verify button */}
                <Button type="submit" className="w-full" size="lg" disabled={otpLoading || otpExpired || inputOtp.length < 6}>
                  {otpLoading ? (
                    <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Verifying…</span>
                  ) : otpMode === "signup" ? (
                    "Verify & Create Account"
                  ) : (
                    "Verify & Proceed"
                  )}
                </Button>

                {/* Resend OTP */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground">Didn't receive the code?</span>
                  <Button type="button" variant="outline" size="sm" className="gap-2 w-full" onClick={handleResendOtp} disabled={resendCooldown > 0 || resendLoading}>
                    {resendLoading ? (
                      <><RefreshCw className="h-4 w-4 animate-spin" />Sending…</>
                    ) : resendCooldown > 0 ? (
                      <><Clock className="h-4 w-4" />Resend in {resendCooldown}s</>
                    ) : (
                      <><RefreshCw className="h-4 w-4" />Resend OTP</>
                    )}
                  </Button>
                </div>

                {/* Back */}
                <div className="text-center">
                  <Button type="button" variant="link" onClick={handleBackToLogin} className="text-sm">
                    ← {otpMode === "signup" ? "Go Back to Sign Up" : "Go Back to Login"}
                  </Button>
                </div>
              </form>
            ) : isForgotPassword ? (
              forgotOtpSent ? (
                <form onSubmit={handleResetPassword} className="space-y-4 animate-in slide-in-from-right-8">
                  {/* OTP Input */}
                  <div className="space-y-2">
                    <Label htmlFor="forgot-otp">Verification Code (OTP)</Label>
                    <div className="relative">
                      <ShieldCheck className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgot-otp"
                        type="text"
                        maxLength={6}
                        placeholder="Enter 6-digit code"
                        className="pl-10 text-center tracking-[0.2em] font-mono text-lg"
                        value={forgotPasswordData.otp}
                        onChange={(e) => setForgotPasswordData({ ...forgotPasswordData, otp: e.target.value.replace(/[^0-9]/g, "") })}
                        required
                        autoFocus
                        disabled={otpExpired}
                      />
                    </div>
                    <p className="text-xs text-center text-muted-foreground">
                      Code sent to <span className="font-semibold text-foreground">{forgotPasswordData.email}</span>
                    </p>
                  </div>

                  {/* Countdown */}
                  <div className={`flex items-center justify-center gap-2 text-sm font-semibold ${countdownColor} transition-colors`}>
                    <Clock className="h-4 w-4" />
                    {otpExpired ? <span>Code expired — please go back and try again</span> : <span>Code expires in {formatTime(secondsLeft)}</span>}
                  </div>

                  {/* New Password */}
                  <div className="space-y-2">
                    <Label htmlFor="forgot-new-password">New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgot-new-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="At least 6 characters"
                        className="pl-10 pr-10"
                        value={forgotPasswordData.newPassword}
                        onChange={(e) => setForgotPasswordData({ ...forgotPasswordData, newPassword: e.target.value })}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <Label htmlFor="forgot-confirm-new-password">Confirm New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgot-confirm-new-password"
                        type="password"
                        placeholder="Confirm new password"
                        className="pl-10"
                        value={forgotPasswordData.confirmNewPassword}
                        onChange={(e) => setForgotPasswordData({ ...forgotPasswordData, confirmNewPassword: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" size="lg" disabled={loading || otpExpired || forgotPasswordData.otp.length < 6}>
                    {loading ? (
                      <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" />Resetting password…</span>
                    ) : (
                      "Reset Password & Sign In"
                    )}
                  </Button>

                  <div className="text-center pt-2">
                    <Button type="button" variant="link" onClick={handleBackToLoginFromForgot} className="text-sm">
                      ← Back to Sign In
                    </Button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleForgotSendOtp} className="space-y-4 animate-in slide-in-from-right-8">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="Enter your email"
                        className="pl-10"
                        value={forgotPasswordData.email}
                        onChange={(e) => setForgotPasswordData({ ...forgotPasswordData, email: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" size="lg" disabled={loading}>
                    {loading ? (
                      <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" />Sending code…</span>
                    ) : (
                      "Send Verification Code →"
                    )}
                  </Button>

                  <div className="text-center pt-2">
                    <Button type="button" variant="link" onClick={handleBackToLoginFromForgot} className="text-sm">
                      ← Back to Sign In
                    </Button>
                  </div>
                </form>
              )
            ) : (
              <form onSubmit={handleStandardSubmit} className="space-y-4 animate-in slide-in-from-left-8">
                {!isLogin && (
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" type="text" placeholder="Enter your full name" value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="email" type="email" placeholder="Enter your email" className="pl-10"
                      value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {isLogin && (
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setIsForgotPassword(true)}
                        className="px-0 font-normal text-xs h-auto text-primary hover:text-primary/80"
                      >
                        Forgot password?
                      </Button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="password" type={showPassword ? "text" : "password"} placeholder="Enter your password"
                      className="pl-10 pr-10" value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })} required />
                    <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                </div>

                {!isLogin && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="confirmPassword" type="password" placeholder="Confirm your password" className="pl-10"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} required />
                    </div>
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" />Please wait…</span>
                  ) : isLogin ? (
                    "Secure Sign In"
                  ) : (
                    "Continue to Verify Email →"
                  )}
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
          <p>End-to-End Encrypted &amp; 2FA Protected</p>
        </div>
      </div>
    </div>
  )
}
