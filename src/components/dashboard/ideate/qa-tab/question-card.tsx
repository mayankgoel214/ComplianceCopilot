'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AnswerButton } from './answer-button';
import { Question } from '../types';

interface QuestionCardProps {
  question: Question;
  onAnswer: (questionId: string, answer: string) => void;
  isAnswered: boolean;
  showTimestamp?: boolean;
}

export function QuestionCard({
  question,
  onAnswer,
  isAnswered,
  showTimestamp = true
}: QuestionCardProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(
    question.answer || null
  );

  const handleAnswerSelect = (answer: string) => {
    if (isAnswered) return; // Prevent re-answering

    setSelectedAnswer(answer);
    onAnswer(question.id, answer);
  };

  const formatTime = (date: Date | string) => {
    // Handle both Date objects and date strings
    const dateObj = date instanceof Date ? date : new Date(date);

    // Check if the date is valid
    if (isNaN(dateObj.getTime())) {
      return 'Invalid date';
    }

    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(dateObj);
  };

  return (
    <Card className="ideate-question-card transition-all duration-200 hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-gray-900 leading-relaxed">
            {question.text}
          </p>
          {showTimestamp && (
            <Badge variant="outline" className="text-xs shrink-0">
              {formatTime(question.timestamp)}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-2">
          {question.type === 'yes-no' && (
            <div className="grid grid-cols-2 gap-3">
              <AnswerButton
                isSelected={selectedAnswer === 'yes'}
                onClick={() => handleAnswerSelect('yes')}
                disabled={isAnswered}
              >
                Yes
              </AnswerButton>
              <AnswerButton
                isSelected={selectedAnswer === 'no'}
                onClick={() => handleAnswerSelect('no')}
                disabled={isAnswered}
              >
                No
              </AnswerButton>
            </div>
          )}

          {question.type === 'multiple-choice' && question.options && (
            <div className="space-y-2">
              {question.options.map((option, index) => (
                <AnswerButton
                  key={index}
                  isSelected={selectedAnswer === option}
                  onClick={() => handleAnswerSelect(option)}
                  disabled={isAnswered}
                  className="answer-button"
                >
                  {option}
                </AnswerButton>
              ))}
            </div>
          )}

          {isAnswered && selectedAnswer && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-sm text-blue-600 font-medium">
                ✓ Answered: {selectedAnswer}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}