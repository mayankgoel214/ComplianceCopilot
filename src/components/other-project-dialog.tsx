'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OtherProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; description: string }) => Promise<void>;
  onBack: () => void;
}

export function OtherProjectDialog({
  isOpen,
  onClose,
  onSubmit,
  onBack
}: OtherProjectDialogProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.description.trim()) {
      setError('Both project title and description are required');
      return;
    }

    if (formData.description.trim().length < 20) {
      setError('Please provide a more detailed description (at least 20 characters)');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await onSubmit({
        title: formData.title.trim(),
        description: formData.description.trim()
      });

      // Reset form
      setFormData({ title: '', description: '' });
      onClose();
    } catch (error) {
      console.error('Error submitting other project:', error);
      setError('Failed to create project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSubmitting) {
      setFormData({ title: '', description: '' });
      setError(null);
      onClose();
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const isValid = formData.title.trim().length > 0 && formData.description.trim().length >= 20;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-w-none w-[700px] max-h-[85vh] p-0 overflow-hidden",
          "bg-background border shadow-xl"
        )}
        showCloseButton={false}
      >
        {/* Header */}
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
            <X className="h-5 w-5" />
          </button>

          <button
            onClick={onBack}
            disabled={isSubmitting}
            className={cn(
              "absolute top-6 left-6 p-2 rounded-md transition-all duration-200",
              "hover:bg-accent hover:text-accent-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            )}
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <DialogHeader className="text-center space-y-4 px-16">
            <div className="text-4xl mb-2">✍️</div>
            <DialogTitle className="text-2xl font-bold">
              Describe Your Project
            </DialogTitle>
            <DialogDescription className="text-base text-muted-foreground">
              Tell us about your specific project so we can provide tailored compliance guidance.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="space-y-6 max-w-md mx-auto">
            {/* Project Title */}
            <div className="space-y-2">
              <Label htmlFor="project-title" className="text-base font-medium">
                Project Title *
              </Label>
              <Input
                id="project-title"
                placeholder="e.g., Student Data Analytics Platform"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                disabled={isSubmitting}
                className="h-12 text-base"
              />
            </div>

            {/* Project Description */}
            <div className="space-y-2">
              <Label htmlFor="project-description" className="text-base font-medium">
                Project Description *
              </Label>
              <Textarea
                id="project-description"
                placeholder="Describe your project in detail. What does it do? Who will use it? What data or processes are involved? The more details you provide, the better we can help you identify relevant compliance requirements."
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                disabled={isSubmitting}
                rows={8}
                className="resize-none text-base leading-relaxed"
              />
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Minimum 20 characters required</span>
                <span className={cn(
                  formData.description.length >= 20 ? 'text-green-600' : 'text-muted-foreground'
                )}>
                  {formData.description.length} / 20
                </span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 pt-6 border-t border-border">
          <div className="flex gap-3 justify-end max-w-md mx-auto">
            <Button
              variant="outline"
              onClick={onBack}
              disabled={isSubmitting}
              className="px-6"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isValid || isSubmitting}
              className="px-6 gap-2"
            >
              {isSubmitting ? (
                'Creating Project...'
              ) : (
                <>
                  Create Project
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}