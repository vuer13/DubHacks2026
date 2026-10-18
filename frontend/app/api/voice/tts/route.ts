import { NextResponse } from "next/server";

// Example: curl -X POST -H 'Content-Type: application/json' \\
//   -d '{\"text\":\"Drop-off, left, stop\"}' http://localhost:3000/api/voice/tts
export async function POST() {
  return NextResponse.json(
    { error: "ElevenLabs text-to-speech route is not wired yet." },
    { status: 501 },
  );
}
