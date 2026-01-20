'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Shield } from 'lucide-react';

interface CompliancePlaceholderProps {
  isLocked: boolean;
}

export function CompliancePlaceholder({ isLocked }: CompliancePlaceholderProps) {
  return (
    <Card className={`min-h-[400px] ${isLocked ? 'opacity-50' : ''}`}>
      <CardContent className="flex items-center justify-center h-[400px]">
        <div className="text-center max-w-md">
          <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6 ${
            isLocked ? 'bg-gray-100' : 'bg-blue-50'
          }`}>
            <Shield size={32} className={isLocked ? 'text-gray-400' : 'text-blue-600'} />
          </div>

          <h3 className={`text-xl font-semibold mb-3 ${
            isLocked ? 'text-gray-400' : 'text-gray-900'
          }`}>
            {isLocked ? 'Compliance Report' : 'Coming Soon'}
          </h3>

          <p className={`text-sm ${
            isLocked ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {isLocked
              ? 'Upload sources to unlock this feature'
              : 'Compliance analysis will be available here'
            }
          </p>

          {!isLocked && (
            <div className="mt-4 text-xs text-gray-500">
              This section will provide detailed compliance analysis and reports based on your uploaded documents.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}