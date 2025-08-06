"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X, FileText, LogOut, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/components/auth-provider"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const { user, logout } = useAuth()

  const getCurrentStep = () => {
    if (typeof window !== "undefined") {
      return Number.parseInt(localStorage.getItem("currentStep") || "0")
    }
    return 0
  }

  const currentStep = getCurrentStep()

  const navItems = [
    { name: "Home", href: "/", step: 0 },
    { name: "Upload", href: "/upload", step: 1 },
    { name: "Ask Questions", href: "/query", step: 2 },
    { name: "Results", href: "/results", step: 3 },
    { name: "Documents", href: "/documents", step: 0 },
    { name: "Contact", href: "/contact", step: 0 },
  ]

  const isStepAccessible = (step: number) => {
    if (step === 0) return true // Home, Documents, Contact always accessible
    return currentStep >= step
  }

  if (!user) {
    return null // Don't show navbar if not authenticated
  }

  return (
    <nav className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b border-border/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <FileText className="h-8 w-8 text-primary" />
              <span className="font-bold text-xl">DocuMind AI</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? "bg-primary text-primary-foreground"
                    : isStepAccessible(item.step)
                      ? "text-foreground hover:bg-accent hover:text-accent-foreground"
                      : "text-muted-foreground cursor-not-allowed opacity-50"
                }`}
                onClick={(e) => {
                  if (!isStepAccessible(item.step)) {
                    e.preventDefault()
                  }
                }}
              >
                {item.name}
              </Link>
            ))}

            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <User className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled>
                  <User className="mr-2 h-4 w-4" />
                  {user.name} ({user.type})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center space-x-2">
            <ThemeToggle />
            <Button variant="outline" size="icon" onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                    pathname === item.href
                      ? "bg-primary text-primary-foreground"
                      : isStepAccessible(item.step)
                        ? "text-foreground hover:bg-accent hover:text-accent-foreground"
                        : "text-muted-foreground cursor-not-allowed opacity-50"
                  }`}
                  onClick={(e) => {
                    if (!isStepAccessible(item.step)) {
                      e.preventDefault()
                    } else {
                      setIsOpen(false)
                    }
                  }}
                >
                  {item.name}
                </Link>
              ))}
              <div className="px-3 py-2">
                <Button onClick={logout} variant="outline" className="w-full bg-transparent">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
