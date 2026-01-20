import { NextRequest, NextResponse } from "next/server";
import { verifyTokenAndGetUser } from "@/lib/auth/auth-service";
import { getProjectsService } from "@/lib/db/projects-service";

// GET /api/projects - Get all projects for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await verifyTokenAndGetUser(
      request.headers.get("authorization")
    );
    const projectsService = getProjectsService();

    // Get project summaries for the user
    const projects = await projectsService.getProjectSummariesByUserId(user.id);

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error in GET /api/projects:", error);

    if (error instanceof Error) {
      if (
        error.message.includes("token") ||
        error.message.includes("authorization")
      ) {
        return NextResponse.json(
          { error: "Authentication failed", details: error.message },
          { status: 401 }
        );
      }

      if (error.message.includes("Firebase Admin credentials not configured")) {
        return NextResponse.json(
          {
            error: "Server configuration error",
            details: "Firebase Admin not properly configured",
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  try {
    const user = await verifyTokenAndGetUser(
      request.headers.get("authorization")
    );

    // Parse request body
    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }

    const projectsService = getProjectsService();

    // Create the project
    const project = await projectsService.createProject({
      user_id: user.id,
      name: name.trim(),
      description: description?.trim() || null,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/projects:", error);

    if (error instanceof Error) {
      if (
        error.message.includes("token") ||
        error.message.includes("authorization")
      ) {
        return NextResponse.json(
          { error: "Authentication failed", details: error.message },
          { status: 401 }
        );
      }

      if (error.message.includes("Firebase Admin credentials not configured")) {
        return NextResponse.json(
          {
            error: "Server configuration error",
            details: "Firebase Admin not properly configured",
          },
          { status: 500 }
        );
      }

      if (
        error.message.includes("database") ||
        error.message.includes("connection")
      ) {
        return NextResponse.json(
          { error: "Database connection error", details: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
