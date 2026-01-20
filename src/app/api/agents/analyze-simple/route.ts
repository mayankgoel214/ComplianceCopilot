import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    console.log("Simple analyze endpoint called");

    const body = await request.json();
    console.log("Request body:", body);

    // Basic validation
    if (!body.projectId || !body.projectDescription) {
      return NextResponse.json(
        {
          error: "Project ID and description are required",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Simple analyze endpoint working",
      projectId: body.projectId,
      projectDescription: body.projectDescription,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Simple analyze endpoint error:", error);
    return NextResponse.json(
      {
        error: "Simple analyze endpoint failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
