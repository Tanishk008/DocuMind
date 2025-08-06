import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log("Webhook received:", body);
  return NextResponse.json({ message: "Webhook received successfully!" });
}

export async function GET() {
  return NextResponse.json({ message: "GET method works, but use POST for webhook." });
}
