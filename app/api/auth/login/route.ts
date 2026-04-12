import { NextRequest, NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { User } from "@/models/User"

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 })
    }

    // Harcoded Admin
    if (email === "documindai008@gmail.com") {
      if (password === "Tanishk#1234") {
        return NextResponse.json({
          success: true,
          user: { id: "admin", email, name: "Admin", role: "admin" }
        })
      }
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    await connectToDatabase()

    // Find User
    const foundUser = await User.findOne({ email, password }) // Note: Storing plain passwords isn't ideal but we are migrating 1:1 format.
    
    if (!foundUser) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    const safeUser = {
      id: foundUser._id.toString(),
      email: foundUser.email,
      name: foundUser.name,
      role: foundUser.role,
      phone: foundUser.phone,
      address: foundUser.address,
      documents: foundUser.documents || [],
      questions: foundUser.questions || [],
      currentStep: foundUser.currentStep || 1
    }

    return NextResponse.json({ success: true, user: safeUser })
  } catch (error: any) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}
