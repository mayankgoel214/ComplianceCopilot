import { NextRequest, NextResponse } from "next/server";
import { verifyTokenAndGetUser } from "@/lib/auth/auth-service";

// GET /api/auth/status - Check authentication status
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          authenticated: false,
          error: "Missing or invalid authorization header",
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    // Verify token and get user
    const user = await verifyTokenAndGetUser(authHeader);

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        firebase_uid: user.firebase_uid,
        email: user.email,
        name: user.name,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Auth status check failed:", error);

    return NextResponse.json(
      {
        authenticated: false,
        error: error instanceof Error ? error.message : "Authentication failed",
        timestamp: new Date().toISOString(),
      },
      { status: 401 }
    );
  }
}

// POST /api/auth/status - Validate token and return user info
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        {
          authenticated: false,
          error: "Token is required",
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Create authorization header from token
    const authHeader = `Bearer ${token}`;
    const user = await verifyTokenAndGetUser(authHeader);

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        firebase_uid: user.firebase_uid,
        email: user.email,
        name: user.name,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Token validation failed:", error);

    return NextResponse.json(
      {
        authenticated: false,
        error:
          error instanceof Error ? error.message : "Token validation failed",
        timestamp: new Date().toISOString(),
      },
      { status: 401 }
    );
  }
}
