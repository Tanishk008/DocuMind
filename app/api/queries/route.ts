import { NextRequest, NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { User } from "@/models/User"

export async function POST(req: NextRequest) {
  try {
    const { email, increment } = await req.json()

    if (!email || !increment) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Ignore admin email since Admin is hardcoded and has no document
    if (email === "documindai008@gmail.com") {
      return NextResponse.json({ success: true, message: "Ignored metric for admin" })
    }

    await connectToDatabase()

    await User.findOneAndUpdate(
      { email },
      { $inc: { totalQueries: increment } }
    )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Metric increment error:", error)
    return NextResponse.json({ error: "Failed to increment query count" }, { status: 500 })
  }
}
