import { NextResponse } from "next/server";

// Example: curl http://localhost:3000/api/voice/token
export async function GET() {
  return NextResponse.json(
    { error: "ElevenLabs conversation token route is not wired yet." },
    { status: 501 },
  );
}
