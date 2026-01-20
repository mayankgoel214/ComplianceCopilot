'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, ArrowRight } from 'lucide-react';
import { UseCaseCard, UseCase } from './use-case-card';
import { OtherProjectDialog } from './other-project-dialog';
import { cn } from '@/lib/utils';

const USE_CASES: UseCase[] = [
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
  },
  {
    id: 'university-admin',
    title: 'University Administration',
    icon: '🏛️',
    description: 'Ensure compliance across policies and institutional workflows.'
  },
  {
    id: 'startup',
    title: 'Startup',
    icon: '🚀',
    description: 'Stay compliant while building student-led ventures.'
  },
  {
    id: 'other',
    title: 'Other',
    icon: '✍️',
    hasInput: true
  }
];

interface CreateProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { useCase: string; description?: string }) => Promise<void>;
}

export function CreateProjectDialog({
  isOpen,
  onClose,
  onSubmit
}: CreateProjectDialogProps) {
  const [selectedUseCase, setSelectedUseCase] = useState<string>('');
  const [otherDescription, setOtherDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOtherDialog, setShowOtherDialog] = useState(false);

  const handleSubmit = async () => {
    if (!selectedUseCase) return;

    if (selectedUseCase === 'other' && !otherDescription.trim()) {
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        useCase: selectedUseCase,
        description: selectedUseCase === 'other' ? otherDescription.trim() : undefined
      });

      // Reset form state
      setSelectedUseCase('');
      setOtherDescription('');
      onClose();
    } catch (error) {
      console.error('Error creating project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSubmitting) {
      setSelectedUseCase('');
      setOtherDescription('');
      setShowOtherDialog(false);
      onClose();
    }
  };

  const handleUseCaseSelect = (useCaseId: string) => {
    if (useCaseId === 'other') {
      setSelectedUseCase(useCaseId);
      setShowOtherDialog(true);
    } else {
      setSelectedUseCase(useCaseId);
    }
  };

  const handleOtherSubmit = async (data: { title: string; description: string }) => {
    try {
      await onSubmit({
        useCase: 'other',
        description: `${data.title}: ${data.description}`
      });
    } catch (error) {
      throw error; // Re-throw to let OtherProjectDialog handle it
    }
  };

  const handleBackFromOther = () => {
    setShowOtherDialog(false);
    setSelectedUseCase('');
  };

  const isValidSelection = selectedUseCase && selectedUseCase !== 'other';

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "create-project-dialog !w-[90vw] !h-[90vh] !max-w-none !max-h-[90vh] p-0 overflow-hidden rounded-2xl",
          "bg-background border shadow-2xl",
          "fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
        )}
        showCloseButton={false}
      >
        {/* Custom Header with Close Button */}
        <div className="relative p-8 pb-6 border-b border-border">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className={cn(
              "absolute top-6 right-6 p-2 rounded-md transition-all duration-200",
              "hover:bg-accent hover:text-accent-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            )}
            aria-label="Close dialog"
          >
            <X className="h-6 w-6" />
          </button>

          <DialogHeader className="text-center space-y-6">
            <DialogTitle className="text-4xl font-bold">
              Select Your Use Case
            </DialogTitle>
            <DialogDescription className="text-xl text-muted-foreground max-w-4xl mx-auto">
              Choose the type of project you're working on to get tailored compliance checks.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="flex-1 p-8 sm:p-10 lg:p-12 overflow-y-auto">
          <div className="w-full max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10 lg:gap-12 justify-items-stretch place-items-start">
            {USE_CASES.map((useCase) => (
              <UseCaseCard
                key={useCase.id}
                useCase={useCase}
                isSelected={selectedUseCase === useCase.id}
                onSelect={handleUseCaseSelect}
              />
            ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 pt-6 border-t border-border">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {selectedUseCase && (
                <Badge variant="secondary" className="px-3 py-1">
                  {USE_CASES.find(uc => uc.id === selectedUseCase)?.title} selected
                </Badge>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-6"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isValidSelection || isSubmitting}
                className="px-6 gap-2"
              >
                {isSubmitting ? (
                  'Creating...'
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Other Project Dialog */}
      <OtherProjectDialog
        isOpen={showOtherDialog}
        onClose={() => {
          setShowOtherDialog(false);
          setSelectedUseCase('');
        }}
        onSubmit={handleOtherSubmit}
        onBack={handleBackFromOther}
      />
    </Dialog>
  );
}