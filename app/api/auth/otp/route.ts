import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json()

    if (!email || !otp) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!process.env.EMAIL_PASS) {
      return NextResponse.json({ 
        error: "Server configuration error. EMAIL_PASS is not set." 
      }, { status: 500 })
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "documindai008@gmail.com",
        pass: process.env.EMAIL_PASS,
      },
    })

    const mailOptions = {
      from: `"DocuMind Security" <documindai008@gmail.com>`,
      to: email, // Send OTP strictly to the requested user login email
      subject: `DocuMind AI: Your Login OTP is ${otp}`,
      html: `
        <div style="font-family: sans-serif; max-w-md; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #2563EB;">DocuMind AI Security</h2>
          <p>You recently attempted to log in to DocuMind AI.</p>
          <p>Here is your One-Time Password (OTP) to securely access your account:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; padding: 15px; background: #f3f4f6; text-align: center; border-radius: 6px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="font-size: 13px; color: #666;">If you did not request this login attempt, please ignore this email and reset your password if necessary.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin-top: 30px;" />
          <p style="font-size: 11px; color: #999;">&copy; 2026 DocuMind AI - Tanishk Gupta</p>
        </div>
      `
    }

    await transporter.sendMail(mailOptions)

    return NextResponse.json({ success: true, message: "OTP Email Sent!" })
  } catch (error: any) {
    console.error("OTP email error:", error)
    return NextResponse.json({ error: "Failed to send OTP", details: error.message }, { status: 500 })
  }
}
