import { NextRequest, NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/mongodb"
import { User } from "@/models/User"

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json()
    const { email, ...updateFields } = data

    if (!email) {
      return NextResponse.json({ error: "Email is required to identify user" }, { status: 400 })
    }

    if (email === "documindai008@gmail.com") {
      return NextResponse.json({ success: true, message: "Admin profile dynamically mocked" })
    }

    await connectToDatabase()

    const updatedUser = await User.findOneAndUpdate(
      { email },
      { $set: updateFields },
      { new: true } // Return the updated document
    )

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const safeUser = {
      id: updatedUser._id.toString(),
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
      phone: updatedUser.phone,
      address: updatedUser.address
    }

    return NextResponse.json({ success: true, user: safeUser })
  } catch (error: any) {
    console.error("Profile update error:", error)
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
  }
}
