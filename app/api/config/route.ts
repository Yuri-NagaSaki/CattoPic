import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      apiUrl: process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "",
      remotePatterns: process.env.NEXT_PUBLIC_REMOTE_PATTERNS || "",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
