import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    console.log("Test agent endpoint called");

    const body = await request.json();
    console.log("Request body:", body);

    return NextResponse.json({
      success: true,
      message: "Test agent endpoint working",
      received: body,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Test agent endpoint error:", error);
    return NextResponse.json(
      {
        error: "Test agent endpoint failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
