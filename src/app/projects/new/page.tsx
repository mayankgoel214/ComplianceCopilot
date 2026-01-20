'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store/auth-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus } from 'lucide-react';
import { EnterpriseLayout } from '@/components/enterprise/layout';

export default function NewProjectPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setError('You must be logged in to create a project');
      return;
    }

    if (!formData.name.trim()) {
      setError('Project name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const token = await user.getIdToken();
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create project');
      }

      const data = await response.json();
      router.push(`/projects/${data.project.id}`);
    } catch (error) {
      console.error('Error creating project:', error);
      setError(error instanceof Error ? error.message : 'Failed to create project');
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

  return (
    <EnterpriseLayout>
      <div className="max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="flex items-center gap-2 enterprise-button-secondary"
          >
            <ArrowLeft size={16} />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-enterprise-text-primary">
              Create New Project
            </h1>
            <p className="text-enterprise-text-secondary mt-2">
              Start a new compliance assessment project
            </p>
          </div>
        </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Project Details</CardTitle>
          <CardDescription>
            Provide basic information about your compliance project
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Project Name */}
            <div>
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Student Data Privacy Assessment"
                required
                className="mt-1"
              />
              <p className="text-sm text-enterprise-text-tertiary mt-1">
                Choose a descriptive name for your project
              </p>
            </div>

            {/* Project Description */}
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe what this project is about, what data you're collecting, who's involved, etc."
                rows={4}
                className="mt-1"
              />
              <p className="text-sm text-enterprise-text-tertiary mt-1">
                Provide context about your project to help AI identify relevant compliance frameworks
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !formData.name.trim()}
                className="flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>Creating...</>
                ) : (
                  <>
                    <Plus size={16} />
                    Create Project
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">What happens next?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-enterprise-text-secondary">
            <div className="flex gap-3">
              <div className="bg-enterprise-primary/10 text-enterprise-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">
                1
              </div>
              <p>Link your Google Drive documents containing project information</p>
            </div>
            <div className="flex gap-3">
              <div className="bg-enterprise-primary/10 text-enterprise-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">
                2
              </div>
              <p>AI will analyze your documents and identify applicable compliance frameworks</p>
            </div>
            <div className="flex gap-3">
              <div className="bg-enterprise-primary/10 text-enterprise-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">
                3
              </div>
              <p>Get instant compliance assessment and step-by-step remediation guidance</p>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </EnterpriseLayout>
  );
}