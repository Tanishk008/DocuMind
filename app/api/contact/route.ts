import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

export async function POST(req: NextRequest) {
  try {
    const { fullName, email, issue, credentials } = await req.json()

    // Validate
    if (!fullName || !email || !issue) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!process.env.EMAIL_PASS) {
      return NextResponse.json({ 
        error: "Server configuration error. EMAIL_PASS is not set in the environment variables." 
      }, { status: 500 })
    }

    // Configure nodemailer with Gmail App Password
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "documindai008@gmail.com",
        pass: process.env.EMAIL_PASS,
      },
    })

    const mailOptions = {
      from: `"DocuMind AI" <documindai008@gmail.com>`,
      to: "documindai008@gmail.com", // Send to your inbox
      replyTo: email,                   // Reply hits the user's email directly
      subject: `DocuMind AI Support: Query from ${fullName}`,
      text: `You have received a new contact submission from DocuMind AI!\n\nName: ${fullName}\nEmail: ${email}\n\nIssue Description:\n${issue}\n\nAdditional Credentials:\n${credentials || 'N/A'}`
    }

    await transporter.sendMail(mailOptions)

    return NextResponse.json({ success: true, message: "Email sent successfully" })
  } catch (error: any) {
    console.error("Nodemailer error:", error)
    return NextResponse.json({ error: "Failed to send email", details: error.message }, { status: 500 })
  }
}
