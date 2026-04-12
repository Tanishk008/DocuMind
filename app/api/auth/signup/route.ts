import { NextRequest, NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { User } from "@/models/User"

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json()

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (email === "documindai008@gmail.com") {
      return NextResponse.json({ error: "Reserved admin email" }, { status: 403 })
    }

    await connectToDatabase()

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 })
    }

    const newUser = await User.create({ email, password, name })

    // Return safe user without password
    const safeUser = {
      id: newUser._id.toString(),
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      phone: newUser.phone,
      address: newUser.address,
      documents: [],
      questions: [],
      currentStep: 1
    }

    return NextResponse.json({ success: true, user: safeUser }, { status: 201 })
  } catch (error: any) {
    console.error("Signup error:", error)
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
  }
}
