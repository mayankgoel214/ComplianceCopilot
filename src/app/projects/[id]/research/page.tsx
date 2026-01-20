"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store/auth-store";
import { useProjectStore } from "@/stores/project-store/project-store";
import { EnterpriseLayout } from "@/components/enterprise/layout";
import { ChatInterface } from "@/components/dashboard/ideate/chat-tab/chat-interface";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock, MessageSquare } from "lucide-react";
import { Project, Document } from "@/lib/db/types";
import { useCallback } from 'react';
import {
  ChatMessage,
  ResearchResult
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

export default function ProjectResearchPage({
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [researchResults, setResearchResults] = useState<ResearchResult[]>([]);
  const [isOnlineLookupEnabled, setIsOnlineLookupEnabled] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);

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

  const handleSendMessage = useCallback(async (message: string, isOnlineLookup: boolean) => {
    if (!message.trim() || !id || !user) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: message,
      role: 'user',
      timestamp: new Date(),
      isOnlineLookup
    };

    setChatMessages(prev => [...prev, userMessage]);
    setIsChatLoading(true);

    try {
      const token = await user.getIdToken();
      if (!token) {
        throw new Error('No authentication token');
      }

      const requestBody = {
        projectId: id,
        userQuery: message,
        conversationHistory: chatMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp.toISOString()
        })),
        context: {
          ...projectData,
          projectDescription: projectData?.project?.description || '',
          userId: user.uid,
          sessionId: `session-${Date.now()}`,
          preferences: {
            onlineLookupEnabled: isOnlineLookup
          }
        }
      };

      const response = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Chat request failed: ${response.statusText}`);
      }

      const data = await response.json();

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: data.response || 'I couldn\'t process your request. Please try again.',
        role: 'assistant',
        timestamp: new Date(),
        metadata: {
          sources: data.sources,
          suggestedActions: data.suggestedActions,
          relatedTopics: data.relatedTopics
        }
      };

      setChatMessages(prev => [...prev, aiMessage]);

      if (data.sources && data.sources.length > 0) {
        const researchResult: ResearchResult = {
          id: Date.now().toString(),
          query: message,
          results: data.sources.map((source: any) => ({
            title: source.title || 'Source',
            url: source.url || '#',
            snippet: source.content || '',
            source: source.type || 'knowledge_base'
          })),
          timestamp: new Date()
        };

        setResearchResults(prev => [...prev, researchResult]);
      }

    } catch (error) {
      console.error('Error sending message:', error);

      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        role: 'assistant',
        timestamp: new Date(),
        isError: true
      };

      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  }, [id, projectData, user, chatMessages]);

  const handleToggleOnlineLookup = useCallback((enabled: boolean) => {
    setIsOnlineLookupEnabled(enabled);
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
              Research
            </h1>
            <p className="text-enterprise-text-secondary mt-2">
              AI-powered research and exploration for {project.name}
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
                To start research, you need to upload documents or connect Google Drive folders to your project first.
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
            <MessageSquare className="h-8 w-8 text-enterprise-primary" />
            <h1 className="text-3xl font-bold text-enterprise-text-primary">
              Research
            </h1>
          </div>
          <p className="text-enterprise-text-secondary">
            AI-powered research and exploration for {project.name}
          </p>
        </div>

        <div className="enterprise-fade-in" style={{ animationDelay: '0.1s' }}>
          <ChatInterface
            messages={chatMessages}
            researchResults={researchResults}
            onSendMessage={handleSendMessage}
            isLoading={isChatLoading}
            onlineLookupEnabled={isOnlineLookupEnabled}
            onToggleOnlineLookup={handleToggleOnlineLookup}
            hasSourcesUploaded={!false}
          />
        </div>
      </div>
    </EnterpriseLayout>
  );
}