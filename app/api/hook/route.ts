import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log("Webhook received:", body);

  return NextResponse.json({ message: "Webhook received successfully!" }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ message: "GET request received — use POST for webhook" });
}
