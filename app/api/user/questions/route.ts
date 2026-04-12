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

    return NextResponse.json({ success: true, questions: user.questions || [] })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, questions } = await req.json()
    if (!email || !questions) return NextResponse.json({ error: "Missing data" }, { status: 400 })

    await connectToDatabase()
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { questions } },
      { new: true }
    )

    return NextResponse.json({ success: true, questions: user.questions })
  } catch (error) {
    return NextResponse.json({ error: "Failed to save questions" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 })

    await connectToDatabase()
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { questions: [] } },
      { new: true }
    )

    return NextResponse.json({ success: true, questions: [] })
  } catch (error) {
    return NextResponse.json({ error: "Failed to clear questions" }, { status: 500 })
  }
}
