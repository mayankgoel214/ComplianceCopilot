"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store/auth-store";
import { useProjectStore } from "@/stores/project-store/project-store";
import { EnterpriseLayout } from "@/components/enterprise/layout";
import { QuestionThread } from "@/components/dashboard/ideate/qa-tab/question-thread";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock, HelpCircle } from "lucide-react";
import { Project, Document } from "@/lib/db/types";
import { useCallback, useRef } from 'react';
import {
  Question,
  QuestionGenerationResponse,
  QuestionGenerationRequest,
  QuestionLoadingState
} from "@/components/dashboard/ideate/types";

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

export default function ProjectQAPage({
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
  const [qaThread, setQaThread] = useState<Question[]>([]);
  const [questionLoading, setQuestionLoading] = useState<QuestionLoadingState>({
    isGenerating: false,
    isRegenerating: false,
  });
  const fetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isInitialized && !loading && !user) {
      router.push("/login");
      return;
    }

    if (user && isInitialized) {
      fetchProjectData();
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

  const fetchQuestions = useCallback(async (isRegenerate: boolean = false) => {
    if (!id || !user) {
      console.error('Missing project ID or user');
      return;
    }

    if (fetchingRef.current) {
      console.log('Already fetching questions, skipping duplicate request');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    fetchingRef.current = true;
    setQuestionLoading(prev => ({
      ...prev,
      isGenerating: !isRegenerate,
      isRegenerating: isRegenerate,
      error: undefined,
    }));

    try {
      const token = await user.getIdToken();
      if (!token) {
        throw new Error('No authentication token');
      }

      const requestBody: QuestionGenerationRequest = {
        projectId: id,
        maxQuestions: 5,
        context: {
          detectedFrameworks: projectData?.compliance?.frameworks?.map((f: any) => f.name),
          complianceGaps: [],
        },
      };

      const response = await fetch('/api/agents/questions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to generate questions: ${response.statusText}`);
      }

      const data: QuestionGenerationResponse = await response.json();

      const questionsWithParsedDates = data.questions.map(q => ({
        ...q,
        timestamp: new Date(q.timestamp)
      }));

      setQaThread(questionsWithParsedDates);

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Question generation request was cancelled');
        return;
      }

      console.error('Error fetching questions:', error);
      setQuestionLoading(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to generate questions',
      }));
    } finally {
      fetchingRef.current = false;
      setQuestionLoading(prev => ({
        ...prev,
        isGenerating: false,
        isRegenerating: false,
      }));
    }
  }, [id, projectData, user]);

  const handleQAAnswer = useCallback((questionId: string, answer: string) => {
    setQaThread(prev => prev.map(q =>
      q.id === questionId ? { ...q, answer } : q
    ));
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      fetchingRef.current = false;
    };
  }, []);

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

  if (!hasUploadedSources) {
    return (
      <EnterpriseLayout>
        <div className="space-y-6">
          <div className="enterprise-fade-in">
            <h1 className="text-3xl font-bold text-enterprise-text-primary">
              Q/A Analysis
            </h1>
            <p className="text-enterprise-text-secondary mt-2">
              AI-generated questions and answers for {project.name}
            </p>
          </div>

          <div className="enterprise-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="enterprise-card p-12 text-center">
              <div className="w-16 h-16 bg-enterprise-surface-elevated rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock className="h-8 w-8 text-enterprise-text-tertiary" />
              </div>
              <h3 className="text-xl font-semibold text-enterprise-text-primary mb-2">
                Upload Sources First
              </h3>
              <p className="text-enterprise-text-secondary mb-6 max-w-md mx-auto">
                To start Q/A analysis, you need to upload documents or connect Google Drive folders to your project first.
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
        <div className="enterprise-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <HelpCircle className="h-8 w-8 text-enterprise-primary" />
            <h1 className="text-3xl font-bold text-enterprise-text-primary">
              Q/A Analysis
            </h1>
          </div>
          <p className="text-enterprise-text-secondary">
            AI-generated questions and answers for {project.name}
          </p>
        </div>

        <div className="enterprise-fade-in" style={{ animationDelay: '0.1s' }}>
          <QuestionThread
            questions={qaThread}
            onAnswer={handleQAAnswer}
            hasSourcesUploaded={!false}
            onRegenerate={() => fetchQuestions(true)}
            isLoading={questionLoading.isGenerating || questionLoading.isRegenerating}
            loadingError={questionLoading.error}
            projectId={id}
          />
        </div>
      </div>
    </EnterpriseLayout>
  );
}