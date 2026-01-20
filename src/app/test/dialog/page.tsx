'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const TEST_USE_CASES = [
  {
    id: 'research-labs',
    title: 'Research Labs',
    icon: '🧪',
    description: 'For academic research groups, IRB, and grant compliance.'
  },
  {
    id: 'student-organization',
    title: 'Student Organization',
    icon: '🎓',
    description: 'Manage compliance for events, memberships, and fundraising.'
  },
  {
    id: 'university-course',
    title: 'University Course Project',
    icon: '📚',
    description: 'Check compliance for apps, assignments, and student projects.'
  }
];

function TestCard({ useCase, isSelected, onSelect }: {
  useCase: typeof TEST_USE_CASES[0];
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      className={cn(
        "use-case-card relative cursor-pointer",
        "bg-card hover:shadow-lg border-2",
        isSelected && "ring-2 ring-primary shadow-lg border-primary"
      )}
      onClick={onSelect}
    >
      {isSelected && (
        <div className="absolute top-3 right-3 z-10">
          <CheckCircle2 className="h-6 w-6 text-blue-500" />
        </div>
      )}

      <CardHeader className="text-center pb-4 pt-8 px-4">
        <div className="text-6xl mb-4 emoji-text" role="img" aria-label={useCase.title}>
          {useCase.icon}
        </div>
        <CardTitle className="text-xl font-bold leading-tight">
          {useCase.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 flex-1 flex items-center justify-center px-4 pb-6">
        <p className="text-base text-muted-foreground text-center leading-relaxed">
          {useCase.description}
        </p>
      </CardContent>
    </Card>
  );
}

export default function TestDialogPage() {
  const [selectedId, setSelectedId] = useState<string>('');

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Card Testing Page</h1>

        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Current Implementation Test</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-items-center">
            {TEST_USE_CASES.map((useCase) => (
              <TestCard
                key={useCase.id}
                useCase={useCase}
                isSelected={selectedId === useCase.id}
                onSelect={() => setSelectedId(useCase.id)}
              />
            ))}
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Debug Information</h2>
          <div className="bg-muted p-4 rounded-lg">
            <p><strong>Selected:</strong> {selectedId || 'None'}</p>
            <p><strong>Card CSS Class:</strong> use-case-card</p>
            <p><strong>Expected Dimensions:</strong> 320px × 420px</p>
            <p><strong>Actual Available Space:</strong> ~272px width (after padding)</p>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Emoji Fallback Test</h2>
          <div className="grid grid-cols-6 gap-4">
            <div className="text-6xl text-center emoji-text">🧪</div>
            <div className="text-6xl text-center emoji-text">🎓</div>
            <div className="text-6xl text-center emoji-text">📚</div>
            <div className="text-6xl text-center emoji-text">🏛️</div>
            <div className="text-6xl text-center emoji-text">🚀</div>
            <div className="text-6xl text-center emoji-text">✍️</div>
          </div>
        </div>

        <Button onClick={() => setSelectedId('')} className="mt-4">
          Clear Selection
        </Button>
      </div>
    </div>
  );
}