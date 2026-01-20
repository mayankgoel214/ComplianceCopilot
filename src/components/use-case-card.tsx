'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UseCase {
  id: string;
  title: string;
  icon: string;
  description?: string;
  hasInput?: boolean;
}

interface UseCaseCardProps {
  useCase: UseCase;
  isSelected: boolean;
  onSelect: (id: string) => void;
  className?: string;
}

export function UseCaseCard({
  useCase,
  isSelected,
  onSelect,
  className
}: UseCaseCardProps) {
  return (
    <Card
      className={cn(
        "use-case-card relative cursor-pointer w-full min-h-[280px] max-w-none",
        "bg-card transition-all duration-200 hover:shadow-lg",
        isSelected && "selected ring-2 ring-primary shadow-lg",
        className
      )}
      onClick={() => onSelect(useCase.id)}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(useCase.id);
        }
      }}
    >
      {/* Selection Indicator */}
      {isSelected && (
        <div className="absolute top-3 right-3 z-10">
          <CheckCircle2 className="h-6 w-6 text-blue-500" />
        </div>
      )}

      <CardHeader className="text-center pb-6 pt-8 px-6">
        <div className="text-5xl mb-6 emoji-text" role="img" aria-label={useCase.title}>
          {useCase.icon}
        </div>
        <CardTitle className="text-xl font-semibold leading-tight">
          {useCase.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 flex-1 flex items-center justify-center px-6 pb-8">
        {useCase.description ? (
          <p
            id={`${useCase.id}-description`}
            className="text-base text-muted-foreground text-center leading-relaxed"
          >
            {useCase.description}
          </p>
        ) : (
          <p className="text-base text-muted-foreground text-center leading-relaxed">
            Click to select and describe your custom project
          </p>
        )}
      </CardContent>
    </Card>
  );
}