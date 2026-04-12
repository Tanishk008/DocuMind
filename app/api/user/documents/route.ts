import { NextRequest, NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { User } from "@/models/User"

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get("email")
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 })

    await connectToDatabase()
    const user = await User.findOne({ email })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    return NextResponse.json({ success: true, documents: user.documents || [] })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, documents } = await req.json()
    if (!email || !documents) return NextResponse.json({ error: "Missing data" }, { status: 400 })

    await connectToDatabase()
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { documents } },
      { new: true }
    )

    return NextResponse.json({ success: true, documents: user.documents })
  } catch (error) {
    return NextResponse.json({ error: "Failed to save documents" }, { status: 500 })
  }
}
