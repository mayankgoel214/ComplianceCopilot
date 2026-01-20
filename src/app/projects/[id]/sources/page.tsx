"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store/auth-store";
import { useProjectStore } from "@/stores/project-store/project-store";
import { EnterpriseLayout } from "@/components/enterprise/layout";
import { SourcesUpload } from "@/components/dashboard/sources-upload";
import { ProcessingStatus } from "@/components/processor/processing-status";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { Project, Document } from "@/lib/db/types";
import { User } from "firebase/auth";

interface ProjectData {
  project: Project;
  documents: Document[];
  stats: {
    documentCount: number;
    frameworkCount: number;
    lastAssessmentDate?: Date;
    latestScore?: number;
  };
}

export default function ProjectSourcesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading, isInitialized } = useAuthStore();
  const { setCurrentProject, fetchProjectById } = useProjectStore();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUploadedSources, setHasUploadedSources] = useState(false);

  useEffect(() => {
    // Only redirect if auth is fully initialized and confirmed no user
    if (isInitialized && !loading && !user) {
      router.push("/login");
      return;
    }

    // Only fetch data if we have a user
    if (user && isInitialized) {
      fetchProjectData();
      // Also fetch the project for the store
      user.getIdToken().then(token => {
        fetchProjectById(id, token);
      });
    }
  }, [user, loading, isInitialized, router, id, fetchProjectById]);

  const fetchProjectData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = await user?.getIdToken();
      if (!token) {
        throw new Error("No authentication token");
      }

      const response = await fetch(`/api/projects/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Project not found");
        }
        throw new Error(`Failed to fetch project: ${response.statusText}`);
      }

      const data = await response.json().catch(() => {
        throw new Error("Invalid response format from server");
      });
      setProjectData(data);
      setHasUploadedSources(data.documents && data.documents.length > 0);
    } catch (error) {
      console.error("Error fetching project:", error);
      setError(
        error instanceof Error ? error.message : "Failed to load project"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDriveFile = async (fileId: string) => {
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("No authentication token");

      // Get Google OAuth token for Drive access
      const { getDriveAccessToken } = await import("@/lib/firebase/firebase");
      const googleToken = await getDriveAccessToken();
      if (!googleToken)
        throw new Error("No Google Drive access token available");

      const response = await fetch(`/api/projects/${id}/documents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Google-Token": googleToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ driveFileId: fileId }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to link document");
      }

      const responseData = await response.json().catch(() => {
        throw new Error("Invalid response format from server");
      });

      // Refresh project data to show new document
      await fetchProjectData();

      // Update sources uploaded state
      setHasUploadedSources(true);

      // Show success message with processing status
      if (responseData.processing_triggered) {
        console.log("Document processing started in background");
        // You could add a toast notification here
      }
    } catch (error) {
      console.error("Error linking document:", error);
      setError(
        error instanceof Error ? error.message : "Failed to link document"
      );
    }
  };

  // Wrapper component to handle async token retrieval
  const ProcessingStatusWrapper = ({
    projectId,
    user,
  }: {
    projectId: string;
    user: User;
  }) => {
    const [authToken, setAuthToken] = useState<string | null>(null);

    useEffect(() => {
      const getToken = async () => {
        try {
          const token = await user.getIdToken();
          setAuthToken(token);
        } catch (error) {
          console.error("Failed to get auth token:", error);
        }
      };
      getToken();
    }, [user]);

    if (!authToken) {
      return (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-gray-500">
              <p className="text-sm">Loading processing status...</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return <ProcessingStatus projectId={projectId} authToken={authToken} />;
  };

  if (loading || !isInitialized || isLoading) {
    return (
      <EnterpriseLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="enterprise-shimmer h-8 w-64 rounded mb-2" />
              <div className="enterprise-shimmer h-4 w-96 rounded" />
            </div>
          </div>
          <div className="enterprise-shimmer h-96 rounded" />
        </div>
      </EnterpriseLayout>
    );
  }

  if (error) {
    return (
      <EnterpriseLayout>
        <div className="text-center py-16">
          <AlertTriangle className="h-16 w-16 text-enterprise-error mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-enterprise-text-primary mb-4">
            Something went wrong
          </h1>
          <p className="text-enterprise-text-secondary mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.push("/projects")} className="enterprise-button-secondary">
              Back to Projects
            </Button>
            <Button onClick={fetchProjectData} className="enterprise-button-primary">
              Try Again
            </Button>
          </div>
        </div>
      </EnterpriseLayout>
    );
  }

  if (!projectData) {
    return <EnterpriseLayout><div>Project not found</div></EnterpriseLayout>;
  }

  const { project, documents } = projectData;

  return (
    <EnterpriseLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="enterprise-fade-in">
          <h1 className="text-3xl font-bold text-enterprise-text-primary">
            Sources
          </h1>
          <p className="text-enterprise-text-secondary mt-2">
            Upload and manage documents for {project.name}
          </p>
        </div>

        {/* Sources Upload Component */}
        <div className="enterprise-fade-in" style={{ animationDelay: '0.1s' }}>
          <SourcesUpload
            projectId={id}
            onFolderSelected={handleSelectDriveFile}
            hasUploadedSources={hasUploadedSources}
            selectedFiles={documents.map((doc) => doc.drive_file_id)}
            selectedFolders={Array.from(
              new Set(
                documents.map((doc) => doc.parent_folder_id).filter(Boolean)
              )
            )}
            disabled={false}
          />
        </div>

        {/* Processing Status */}
        {user && (
          <div className="enterprise-fade-in" style={{ animationDelay: '0.2s' }}>
            <ProcessingStatusWrapper projectId={id} user={user} />
          </div>
        )}

        {/* Sources Menu */}
        {hasUploadedSources && (
          <div className="enterprise-fade-in" style={{ animationDelay: '0.3s' }}>
            <Card className="enterprise-card">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-enterprise-text-primary mb-2">
                  Connected Sources
                </h3>
                <p className="text-enterprise-text-secondary mb-4">
                  Google Drive folders and documents linked to this project
                </p>
                <div className="text-enterprise-text-tertiary text-center py-4">
                  <p className="text-sm">
                    Connected sources will be displayed here
                  </p>
                  {documents.length > 0 && (
                    <p className="text-xs mt-1">
                      {documents.length} document
                      {documents.length !== 1 ? "s" : ""} currently linked
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </EnterpriseLayout>
  );
}