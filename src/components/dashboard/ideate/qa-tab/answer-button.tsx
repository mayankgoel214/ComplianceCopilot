'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AnswerButtonProps {
  children: React.ReactNode;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'outline';
  className?: string;
}

export function AnswerButton({
  children,
  isSelected,
  onClick,
  disabled = false,
  variant = 'outline',
  className
}: AnswerButtonProps) {
  return (
    <Button
      variant={isSelected ? 'default' : variant}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'justify-start text-left h-auto py-3 px-4 whitespace-normal',
        'transition-all duration-200 hover:scale-[1.02]',
        isSelected && 'bg-blue-600 hover:bg-blue-700 text-white',
        !isSelected && 'hover:bg-gray-50 hover:border-gray-300',
        className
      )}
    >
      {children}
    </Button>
  );
}