'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Save } from 'lucide-react';
import { Project } from '@/lib/db/types';

interface ProjectFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string }) => Promise<void>;
  project?: Project | null;
  title?: string;
  description?: string;
  submitLabel?: string;
}

export function ProjectForm({
  isOpen,
  onClose,
  onSubmit,
  project = null,
  title = 'Create New Project',
  description = 'Start a new compliance assessment project',
  submitLabel = 'Create Project'
}: ProjectFormProps) {
  const [formData, setFormData] = useState({
    name: project?.name || '',
    description: project?.description || '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError('Project name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await onSubmit({
        name: formData.name.trim(),
        description: formData.description.trim() || '',
      });

      // Reset form on successful submission
      if (!project) {
        setFormData({ name: '', description: '' });
      }
      onClose();
    } catch (error) {
      console.error('Error submitting project form:', error);
      setError(error instanceof Error ? error.message : 'Failed to save project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error when user starts typing
    if (error) {
      setError(null);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSubmitting) {
      onClose();
    }
  };

  // Reset form when dialog opens/closes or project changes
  const resetForm = () => {
    setFormData({
      name: project?.name || '',
      description: project?.description || '',
    });
    setError(null);
  };

  // Reset form when dialog opens or project changes
  useState(() => {
    if (isOpen) {
      resetForm();
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project Name */}
          <div>
            <Label htmlFor="project-name">Project Name *</Label>
            <Input
              id="project-name"
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="e.g., Student Data Privacy Assessment"
              required
              disabled={isSubmitting}
              className="mt-1"
            />
          </div>

          {/* Project Description */}
          <div>
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe what this project is about..."
              rows={3}
              disabled={isSubmitting}
              className="mt-1"
            />
            <p className="text-sm text-gray-500 mt-1">
              Help AI identify relevant compliance frameworks
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !formData.name.trim()}
              className="flex-1 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>Saving...</>
              ) : (
                <>
                  {project ? <Save size={16} /> : <Plus size={16} />}
                  {submitLabel}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}