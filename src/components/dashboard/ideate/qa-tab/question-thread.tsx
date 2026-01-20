'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { QuestionCard } from './question-card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Question } from '../types';

interface QuestionThreadProps {
  questions: Question[];
  onAnswer: (questionId: string, answer: string) => void;
  hasSourcesUploaded: boolean;
  onRegenerate?: () => void;
  isLoading?: boolean;
  loadingError?: string;
  projectId?: string;
}

export function QuestionThread({
  questions,
  onAnswer,
  hasSourcesUploaded,
  onRegenerate,
  isLoading = false,
  loadingError,
  projectId
}: QuestionThreadProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new questions are added
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [questions.length]);

  // Auto-generate questions on first load if sources are uploaded and projectId is available
  useEffect(() => {
    // Use a flag to prevent double-calling in StrictMode
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    if (hasSourcesUploaded && projectId && questions.length === 0 && onRegenerate && !isLoading) {
      // Add a small delay to prevent immediate double-calls in StrictMode
      timeoutId = setTimeout(() => {
        if (isMounted) {
          onRegenerate();
        }
      }, 100);
    }

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
    // Intentionally only run on mount and when questions change from non-empty to empty
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length]);

  if (!hasSourcesUploaded) {
    return (
      <div className="flex items-center justify-center h-64 text-center">
        <div className="max-w-md">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Upload a Source
          </h3>
          <p className="text-gray-600 text-sm">
            Upload compliance documents in the Sources tab to start your Q&A session. The AI will ask you questions to help generate insights.
          </p>
        </div>
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="max-w-md">
          <h3 className="text-lg font-semibold text-red-600 mb-2">
            Error Loading Questions
          </h3>
          <p className="text-gray-600 text-sm mb-4">
            {loadingError}
          </p>
          {onRegenerate && (
            <Button
              onClick={onRegenerate}
              variant="outline"
              size="sm"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (isLoading && questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Generating Questions...
          </h3>
          <p className="text-gray-600 text-sm">
            AI is analyzing your documents to create relevant questions
          </p>
        </div>
      </div>
    );
  }

  if (questions.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="max-w-md">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Ready to Start!
          </h3>
          <p className="text-gray-600 text-sm mb-4">
            Generate questions based on your uploaded compliance documents.
          </p>
          {onRegenerate && (
            <Button
              onClick={onRegenerate}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
            >
              Generate Questions
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Main content with questions and regenerate button
  return (
    <div className="h-full flex flex-col">
      {/* Header with regenerate button */}
      {onRegenerate && questions.length > 0 && (
        <div className="flex justify-between items-center mb-4">
          <div>
            <span className="text-sm text-gray-600">
              {questions.filter(q => q.answer).length}/{questions.length} questions answered
            </span>
          </div>
          <Button
            onClick={onRegenerate}
            variant="outline"
            size="sm"
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Regenerating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Regenerate Questions
              </>
            )}
          </Button>
        </div>
      )}

      {/* Questions scroll area */}
      <ScrollArea className="h-[450px] w-full pr-4 flex-1" ref={scrollAreaRef}>
        <div className="space-y-0">
          {questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              question={question}
              onAnswer={onAnswer}
              isAnswered={!!question.answer}
              showTimestamp={index === 0 || index === questions.length - 1}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}