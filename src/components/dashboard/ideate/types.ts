export interface Question {
  id: string;
  text: string;
  type: 'multiple-choice' | 'yes-no' | 'text' | 'boolean' | 'number';
  options?: string[];
  answer?: string;
  timestamp: Date | string; // Allow both Date objects and ISO strings
  // Additional fields from ideation agent
  category?: 'implementation' | 'gap_filling' | 'risk_clarification' | 'process';
  priority?: 'high' | 'medium' | 'low';
  framework?: string;
  reasoning?: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isOnlineLookup?: boolean;
  isError?: boolean;
  metadata?: {
    sources?: Array<{
      type: string;
      title: string;
      content: string;
      confidence: number;
    }>;
    suggestedActions?: string[];
    relatedTopics?: string[];
  };
}

export interface ResearchResult {
  id: string;
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    source: string;
  }>;
  timestamp: Date;
}

export interface IdeateState {
  qaThread: Question[];
  chatMessages: ChatMessage[];
  researchResults: ResearchResult[];
  activeTab: 'qa' | 'chat';
  isOnlineLookupEnabled: boolean;
}

export type QuestionType = Question['type'];
export type MessageRole = ChatMessage['role'];

// API Response Types
export interface QuestionGenerationResponse {
  success: boolean;
  projectId: string;
  questions: Question[];
  metadata: {
    agentId: string;
    timestamp: string;
    sessionId: string;
    strategy?: any;
    documentCount: number;
    totalGenerated: number;
  };
}

export interface QuestionGenerationRequest {
  projectId: string;
  maxQuestions?: number;
  context?: {
    detectedFrameworks?: string[];
    complianceGaps?: string[];
    [key: string]: any;
  };
}

// Loading states for question operations
export interface QuestionLoadingState {
  isGenerating: boolean;
  isRegenerating: boolean;
  error?: string;
}