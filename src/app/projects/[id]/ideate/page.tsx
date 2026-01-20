"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store/auth-store";
import { useProjectStore } from "@/stores/project-store/project-store";
import { EnterpriseLayout } from "@/components/enterprise/layout";
import { IdeateSection } from "@/components/dashboard/ideate/ideate-section";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock } from "lucide-react";
import { Project, Document } from "@/lib/db/types";

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

export default function ProjectIdeatePage({
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

  const { project } = projectData;

  // Show locked state if no sources uploaded
  if (!hasUploadedSources) {
    return (
      <EnterpriseLayout>
        <div className="space-y-6">
          {/* Page Header */}
          <div className="enterprise-fade-in">
            <h1 className="text-3xl font-bold text-enterprise-text-primary">
              Ideate
            </h1>
            <p className="text-enterprise-text-secondary mt-2">
              AI-powered ideation and brainstorming for {project.name}
            </p>
          </div>

          {/* Locked State */}
          <div className="enterprise-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="enterprise-card p-12 text-center">
              <div className="w-16 h-16 bg-enterprise-surface-elevated rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock className="h-8 w-8 text-enterprise-text-tertiary" />
              </div>
              <h3 className="text-xl font-semibold text-enterprise-text-primary mb-2">
                Upload Sources First
              </h3>
              <p className="text-enterprise-text-secondary mb-6 max-w-md mx-auto">
                To start ideating, you need to upload documents or connect Google Drive folders to your project first.
              </p>
              <Button
                onClick={() => router.push(`/projects/${id}/sources`)}
                className="enterprise-button-primary"
              >
                Go to Sources
              </Button>
            </div>
          </div>
        </div>
      </EnterpriseLayout>
    );
  }

  return (
    <EnterpriseLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="enterprise-fade-in">
          <h1 className="text-3xl font-bold text-enterprise-text-primary">
            Ideate
          </h1>
          <p className="text-enterprise-text-secondary mt-2">
            AI-powered ideation and brainstorming for {project.name}
          </p>
        </div>

        {/* Ideate Section Component */}
        <div className="enterprise-fade-in" style={{ animationDelay: '0.1s' }}>
          <IdeateSection
            isLocked={false}
            projectId={id}
            projectContext={{
              description: project.description || "",
              detectedFrameworks: projectData.compliance?.frameworks?.map((f: any) => f.name) || [],
              complianceGaps: [], // Will be populated from gap analysis results
            }}
          />
        </div>
      </div>
    </EnterpriseLayout>
  );
}