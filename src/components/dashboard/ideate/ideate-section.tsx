'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, HelpCircle, BarChart3 } from 'lucide-react';
import { QuestionThread } from './qa-tab/question-thread';
import { ChatInterface } from './chat-tab/chat-interface';
import { useAuthStore } from '@/stores/auth-store/auth-store';
import {
  Question,
  ChatMessage,
  ResearchResult,
  IdeateState,
  QuestionGenerationResponse,
  QuestionGenerationRequest,
  QuestionLoadingState
} from './types';

interface IdeateSectionProps {
  isLocked: boolean;
  projectId?: string;
  projectContext?: {
    description?: string;
    detectedFrameworks?: string[];
    complianceGaps?: string[];
  };
}

export function IdeateSection({ isLocked, projectId, projectContext }: IdeateSectionProps) {
  const { user } = useAuthStore();
  const router = useRouter();
  const [state, setState] = useState<IdeateState>({
    qaThread: [],
    chatMessages: [],
    researchResults: [],
    activeTab: 'qa',
    isOnlineLookupEnabled: false
  });

  const [isLoading, setIsLoading] = useState(false);
  const [questionLoading, setQuestionLoading] = useState<QuestionLoadingState>({
    isGenerating: false,
    isRegenerating: false,
  });
  const fetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);


  // Fetch questions from the API
  const fetchQuestions = useCallback(async (isRegenerate: boolean = false) => {
    if (!projectId || !user) {
      console.error('Missing project ID or user');
      return;
    }

    // Prevent duplicate requests
    if (fetchingRef.current) {
      console.log('Already fetching questions, skipping duplicate request');
      return;
    }

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
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
        projectId,
        maxQuestions: 5,
        context: {
          detectedFrameworks: projectContext?.detectedFrameworks,
          complianceGaps: projectContext?.complianceGaps,
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

      // Parse timestamps to ensure they're Date objects
      const questionsWithParsedDates = data.questions.map(q => ({
        ...q,
        timestamp: new Date(q.timestamp)
      }));

      setState(prev => ({
        ...prev,
        qaThread: questionsWithParsedDates,
      }));

    } catch (error) {
      // Don't log or set error state if request was aborted
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
  }, [projectId, projectContext, user]);

  const handleQAAnswer = useCallback((questionId: string, answer: string) => {
    setState(prev => ({
      ...prev,
      qaThread: prev.qaThread.map(q =>
        q.id === questionId ? { ...q, answer } : q
      )
    }));
  }, []);

  const handleSendMessage = useCallback(async (message: string, isOnlineLookup: boolean) => {
    if (!message.trim() || !projectId || !user) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: message,
      role: 'user',
      timestamp: new Date(),
      isOnlineLookup
    };

    setState(prev => ({
      ...prev,
      chatMessages: [...prev.chatMessages, userMessage]
    }));

    setIsLoading(true);

    try {
      const token = await user.getIdToken();
      if (!token) {
        throw new Error('No authentication token');
      }

      const requestBody = {
        projectId,
        userQuery: message,
        conversationHistory: state.chatMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp.toISOString()
        })),
        context: {
          ...projectContext,
          projectDescription: projectContext?.description || '',
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

      // Add AI response
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

      setState(prev => ({
        ...prev,
        chatMessages: [...prev.chatMessages, aiMessage]
      }));

      // Add research results if available
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

        setState(prev => ({
          ...prev,
          researchResults: [...prev.researchResults, researchResult]
        }));
      }

    } catch (error) {
      console.error('Error sending message:', error);

      // Add error message
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        role: 'assistant',
        timestamp: new Date(),
        isError: true
      };

      setState(prev => ({
        ...prev,
        chatMessages: [...prev.chatMessages, errorMessage]
      }));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, projectContext, user, state.chatMessages]);

  const handleTabChange = useCallback((tab: string) => {
    setState(prev => ({
      ...prev,
      activeTab: tab as 'qa' | 'chat'
    }));
  }, []);

  const handleToggleOnlineLookup = useCallback((enabled: boolean) => {
    setState(prev => ({
      ...prev,
      isOnlineLookupEnabled: enabled
    }));
  }, []);

  const handleGenerateReport = useCallback(() => {
    if (projectId) {
      router.push(`/projects/${projectId}/compliance-report`);
    }
  }, [router, projectId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel any pending API requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      // Reset fetching flag
      fetchingRef.current = false;
    };
  }, []);

  // Use questions from state - backend will provide questions when ready
  const questions = state.qaThread;

  return (
    <Card className="min-h-[600px]">
      <CardContent className="p-6">
        <Tabs value={state.activeTab} onValueChange={handleTabChange}>
          <div className="flex items-center justify-between mb-6">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="qa" className="flex items-center gap-2">
                <HelpCircle size={16} />
                <span>Q/A</span>
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex items-center gap-2">
                <MessageSquare size={16} />
                <span>Chat & Research</span>
              </TabsTrigger>
            </TabsList>

            <Button
              onClick={handleGenerateReport}
              className="enterprise-button-primary flex items-center gap-2"
              size="sm"
            >
              <BarChart3 size={16} />
              Generate Report
            </Button>
          </div>

          <TabsContent value="qa" className="mt-0">
            <QuestionThread
              questions={questions}
              onAnswer={handleQAAnswer}
              hasSourcesUploaded={!isLocked}
              onRegenerate={() => fetchQuestions(true)}
              isLoading={questionLoading.isGenerating || questionLoading.isRegenerating}
              loadingError={questionLoading.error}
              projectId={projectId}
            />
          </TabsContent>

          <TabsContent value="chat" className="mt-0">
            <ChatInterface
              messages={state.chatMessages}
              researchResults={state.researchResults}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              onlineLookupEnabled={state.isOnlineLookupEnabled}
              onToggleOnlineLookup={handleToggleOnlineLookup}
              hasSourcesUploaded={!isLocked}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}