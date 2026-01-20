'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Lightbulb } from 'lucide-react';

interface IdeatePlaceholderProps {
  isLocked: boolean;
}

export function IdeatePlaceholder({ isLocked }: IdeatePlaceholderProps) {
  return (
    <Card className={`min-h-[400px] ${isLocked ? 'opacity-50' : ''}`}>
      <CardContent className="flex items-center justify-center h-[400px]">
        <div className="text-center max-w-md">
          <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6 ${
            isLocked ? 'bg-gray-100' : 'bg-yellow-50'
          }`}>
            <Lightbulb size={32} className={isLocked ? 'text-gray-400' : 'text-yellow-600'} />
          </div>

          <h3 className={`text-xl font-semibold mb-3 ${
            isLocked ? 'text-gray-400' : 'text-gray-900'
          }`}>
            {isLocked ? 'Ideate Tab' : 'Coming Soon'}
          </h3>

          <p className={`text-sm ${
            isLocked ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {isLocked
              ? 'Upload sources to unlock this feature'
              : 'Generate insights from your sources'
            }
          </p>

          {!isLocked && (
            <div className="mt-4 text-xs text-gray-500">
              This feature will help you generate creative insights and ideas based on your uploaded compliance documents.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}