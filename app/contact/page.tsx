"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { Mail, Phone, MapPin, Clock, Send, MessageSquare, Users, Headphones } from "lucide-react"

export default function ContactPage() {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    issue: "",
    credentials: "",
  })
  const [loading, setLoading] = useState(false)
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validate Gmail
      if (!formData.email.endsWith("@gmail.com")) {
        toast({
          title: "Invalid Email",
          description: "Please use a Gmail address.",
          variant: "destructive",
        })
        return
      }

      // Simulate email sending
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Show success modal
      toast({
        title: "✅ Thank you!",
        description: "Our team will contact you very soon.",
        duration: 5000,
      })

      // Reset form
      setFormData({
        fullName: "",
        email: "",
        phone: "",
        issue: "",
        credentials: "",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Get in Touch with DocuMind AI</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Have questions about DocuMind AI? Our expert team is here to help you unlock the full potential of
              intelligent document analysis.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Send us a Message
                </CardTitle>
                <CardDescription>
                  Fill out the form below and we'll get back to you as soon as possible.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name *</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Enter your full name"
                      value={formData.fullName}
                      onChange={(e) => handleInputChange("fullName", e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@gmail.com"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">Please use a Gmail address for faster response</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      value={formData.phone}
                      onChange={(e) => handleInputChange("phone", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="issue">Issue Description *</Label>
                    <Textarea
                      id="issue"
                      placeholder="Please describe your issue or question in detail..."
                      className="min-h-[120px] resize-none"
                      value={formData.issue}
                      onChange={(e) => handleInputChange("issue", e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="credentials">Additional Credentials (Optional)</Label>
                    <Textarea
                      id="credentials"
                      placeholder="Any additional information that might help us assist you better..."
                      className="min-h-[80px] resize-none"
                      value={formData.credentials}
                      onChange={(e) => handleInputChange("credentials", e.target.value)}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <div className="space-y-8">
              {/* Contact Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Headphones className="mr-2 h-5 w-5" />
                    Contact Information
                  </CardTitle>
                  <CardDescription>Multiple ways to reach our support team</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-start space-x-3">
                    <Mail className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Email Support</p>
                      <p className="text-sm text-muted-foreground">theteambytehog@gmail.com</p>
                      <p className="text-xs text-muted-foreground mt-1">Response within 24 hours</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Phone className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Phone Support</p>
                      <p className="text-sm text-muted-foreground">+1 (555) 123-4567</p>
                      <p className="text-xs text-muted-foreground mt-1">Mon-Fri, 9 AM - 6 PM EST</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <MapPin className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Office Location</p>
                      <p className="text-sm text-muted-foreground">
                        123 AI Innovation Drive
                        <br />
                        Tech Valley, CA 94000
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Clock className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Business Hours</p>
                      <p className="text-sm text-muted-foreground">
                        Monday - Friday: 9:00 AM - 6:00 PM EST
                        <br />
                        Saturday: 10:00 AM - 4:00 PM EST
                        <br />
                        Sunday: Closed
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5 text-primary mt-0.5"
                    >
                      <rect width="16" height="12" x="4" y="2" rx="2" ry="2" />
                      <line x1="4" x2="20" y1="8" y2="8" />
                      <line x1="6" x2="6" y1="14" y2="18" />
                      <line x1="18" x2="18" y1="14" y2="18" />
                    </svg>
                    <div>
                      <p className="font-medium">🌐 Website</p>
                      <p className="text-sm text-muted-foreground">documind-ai.com</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Team Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Users className="mr-2 h-5 w-5" />
                    Meet The DocuMind AI Team
                  </CardTitle>
                  <CardDescription>Passionate developers building the future of document analysis</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-semibold mb-2">🚀 Our Mission</h4>
                      <p className="text-sm text-muted-foreground">
                        To revolutionize document analysis through advanced AI, making complex information instantly
                        accessible and actionable for everyone.
                      </p>
                    </div>

                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-semibold mb-2">💡 Innovation Focus</h4>
                      <p className="text-sm text-muted-foreground">
                        Next-generation AI technology combined with intuitive design for maximum intelligence and
                        productivity.
                      </p>
                    </div>

                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-semibold mb-2">🤝 Support Promise</h4>
                      <p className="text-sm text-muted-foreground">
                        24/7 availability with personalized support to ensure your success with our platform.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* FAQ Quick Links */}
              <Card>
                <CardHeader>
                  <CardTitle>Frequently Asked Questions</CardTitle>
                  <CardDescription>Quick answers to common questions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium text-sm mb-1">What file formats are supported?</h4>
                      <p className="text-xs text-muted-foreground">
                        PDF, DOCX, DOC, EML, and TXT files up to 50MB each.
                      </p>
                    </div>

                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium text-sm mb-1">How secure is my data?</h4>
                      <p className="text-xs text-muted-foreground">
                        Enterprise-grade encryption with secure processing and privacy compliance.
                      </p>
                    </div>

                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium text-sm mb-1">Can I delete my documents?</h4>
                      <p className="text-xs text-muted-foreground">
                        Yes, you have full control over your documents in the Documents section.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
