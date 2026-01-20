'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store/auth-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Plus,
  Folder,
  FileText,
  Calendar,
  TrendingUp,
  LogOut,
  Monitor,
  Shield,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Target,
  Zap,
  ArrowRight,
  Star,
  Filter,
  Search,
  Grid3X3,
  List
} from 'lucide-react';
import { ProjectSummary } from '@/lib/db/types';
import { CreateProjectDialog } from '@/components/create-project-dialog';
import { EnterpriseLayout } from '@/components/enterprise/layout';

export default function ProjectsPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuthStore();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      fetchProjects();
    }
  }, [user, loading, router]);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = await user?.getIdToken();
      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch('/api/projects', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }

      const data = await response.json();
      setProjects(data.projects || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
      setError(error instanceof Error ? error.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = () => {
    setIsCreateDialogOpen(true);
  };

  const handleCreateProjectSubmit = async (data: { useCase: string; description?: string }) => {
    if (!user) {
      throw new Error('You must be logged in to create a project');
    }

    try {
      const token = await user.getIdToken();

      const useCaseNames: Record<string, string> = {
        'research-labs': 'Research Lab Project',
        'student-organization': 'Student Organization Project',
        'university-course': 'University Course Project',
        'university-admin': 'University Administration Project',
        'startup': 'Startup Project',
        'other': 'Custom Project'
      };

      const projectName = useCaseNames[data.useCase] || 'New Project';
      const projectDescription = data.description || `Compliance project for ${data.useCase.replace('-', ' ')}`;

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName,
          description: projectDescription,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create project');
      }

      const result = await response.json();

      setIsCreateDialogOpen(false);
      router.push(`/projects/${result.project.id}`);

      await fetchProjects();
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  };

  const handleProjectClick = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };


  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'analyzing':
        return 'secondary';
      case 'draft':
      default:
        return 'outline';
    }
  };

  const mockMetrics = {
    totalProjects: projects.length,
    activeProjects: 1,
    completedProjects: projects.filter(p => p.status === 'completed').length,
    averageCompliance: 70,
    riskScore: 23,
    pendingTasks: 12
  };

  const onboardingSteps = [
    {
      icon: Shield,
      title: "Set up your first compliance project",
      description: "Create a project to start tracking your compliance posture across multiple frameworks.",
      action: "Create Project",
      completed: projects.length > 0,
      onClick: handleCreateProject
    },
    {
      icon: FileText,
      title: "Upload compliance documents",
      description: "Connect your Google Drive or upload documents to begin automated compliance analysis.",
      action: "Upload Documents",
      completed: projects.some(p => p.document_count > 0),
      onClick: () => router.push('/dashboard')
    },
    {
      icon: BarChart3,
      title: "Review compliance insights",
      description: "Analyze your compliance gaps and get actionable recommendations from our AI.",
      action: "View Insights",
      completed: projects.some(p => p.latest_compliance_score > 0),
      onClick: () => router.push('/analytics')
    },
    {
      icon: Users,
      title: "Invite team members",
      description: "Collaborate with your compliance team by inviting members to your organization.",
      action: "Invite Team",
      completed: false,
      onClick: () => router.push('/organization/team')
    }
  ];

  const completedSteps = onboardingSteps.filter(step => step.completed).length;
  const progressPercentage = (completedSteps / onboardingSteps.length) * 100;


  if (loading || isLoading) {
    return (
      <EnterpriseLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="enterprise-shimmer h-8 w-64 rounded mb-2" />
              <div className="enterprise-shimmer h-4 w-96 rounded" />
            </div>
            <div className="enterprise-shimmer h-10 w-32 rounded" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="enterprise-card p-6">
                <div className="enterprise-shimmer h-6 w-3/4 rounded mb-2" />
                <div className="enterprise-shimmer h-8 w-1/2 rounded" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="enterprise-card p-6">
                <div className="enterprise-shimmer h-6 w-3/4 rounded mb-4" />
                <div className="space-y-2">
                  <div className="enterprise-shimmer h-4 w-full rounded" />
                  <div className="enterprise-shimmer h-4 w-2/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </EnterpriseLayout>
    );
  }

  if (error) {
    return (
      <EnterpriseLayout>
        <div className="text-center py-16">
          <AlertTriangle className="h-16 w-16 text-enterprise-error mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-enterprise-text-primary mb-4">Something went wrong</h1>
          <p className="text-enterprise-text-secondary mb-6">{error}</p>
          <Button onClick={fetchProjects} className="enterprise-button-primary">
            Try Again
          </Button>
        </div>
      </EnterpriseLayout>
    );
  }

  return (
    <EnterpriseLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="enterprise-fade-in">
            <h1 className="text-3xl font-bold text-enterprise-text-primary">
              Compliance Projects
            </h1>
            <p className="text-enterprise-text-secondary mt-2">
              Manage your compliance assessment projects and track organizational progress
            </p>
          </div>
          <div className="flex items-center space-x-3 enterprise-fade-in" style={{ animationDelay: '0.1s' }}>
            <Button
              onClick={() => router.push('/dashboard')}
              className="enterprise-button-secondary"
            >
              <Monitor className="h-4 w-4 mr-2" />
              Dashboard
            </Button>
            <Button onClick={handleCreateProject} className="enterprise-button-primary">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </div>
        </div>

        {/* Metrics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="enterprise-card p-6 enterprise-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-enterprise-text-tertiary text-sm font-medium">Total Projects</p>
                <p className="text-3xl font-bold text-enterprise-text-primary">{mockMetrics.totalProjects}</p>
              </div>
              <div className="w-12 h-12 bg-enterprise-primary/10 rounded-lg flex items-center justify-center">
                <Folder className="h-6 w-6 text-enterprise-primary" />
              </div>
            </div>
          </div>

          <div className="enterprise-card p-6 enterprise-fade-in" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-enterprise-text-tertiary text-sm font-medium">Active Projects</p>
                <p className="text-3xl font-bold text-enterprise-text-primary">{mockMetrics.activeProjects}</p>
              </div>
              <div className="w-12 h-12 bg-enterprise-success/10 rounded-lg flex items-center justify-center">
                <Target className="h-6 w-6 text-enterprise-success" />
              </div>
            </div>
          </div>

          <div className="enterprise-card p-6 enterprise-fade-in" style={{ animationDelay: '0.4s' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-enterprise-text-tertiary text-sm font-medium">Avg. Compliance</p>
                <p className="text-3xl font-bold text-enterprise-text-primary">{mockMetrics.averageCompliance}%</p>
              </div>
              <div className="w-12 h-12 bg-enterprise-accent/10 rounded-lg flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-enterprise-accent" />
              </div>
            </div>
          </div>

          <div className="enterprise-card p-6 enterprise-fade-in" style={{ animationDelay: '0.5s' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-enterprise-text-tertiary text-sm font-medium">Risk Score</p>
                <p className="text-3xl font-bold text-enterprise-text-primary">{mockMetrics.riskScore}</p>
              </div>
              <div className="w-12 h-12 bg-enterprise-warning/10 rounded-lg flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-enterprise-warning" />
              </div>
            </div>
          </div>
        </div>

        {/* Onboarding Progress (only shown if not all steps completed) */}
        {completedSteps < onboardingSteps.length && (
          <div className="enterprise-card p-6 enterprise-fade-in" style={{ animationDelay: '0.6s' }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-enterprise-text-primary">
                  Getting Started
                </h3>
                <p className="text-enterprise-text-secondary">
                  Complete these steps to maximize your compliance management
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-enterprise-primary">
                  {completedSteps}/{onboardingSteps.length}
                </p>
                <p className="text-enterprise-text-tertiary text-sm">
                  Steps completed
                </p>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-enterprise-text-secondary">Progress</span>
                <span className="text-sm text-enterprise-text-secondary">{Math.round(progressPercentage)}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {onboardingSteps.map((step, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border transition-all duration-200 ${
                    step.completed
                      ? 'bg-enterprise-success/5 border-enterprise-success/20'
                      : 'border-enterprise-border-primary hover:bg-enterprise-surface-elevated cursor-pointer'
                  }`}
                  onClick={!step.completed ? step.onClick : undefined}
                >
                  <div className="flex items-start space-x-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      step.completed
                        ? 'bg-enterprise-success text-enterprise-text-primary'
                        : 'bg-enterprise-surface-elevated'
                    }`}>
                      {step.completed ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <step.icon className="h-5 w-5 text-enterprise-primary" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-enterprise-text-primary mb-1">
                        {step.title}
                      </h4>
                      <p className="text-sm text-enterprise-text-secondary mb-3">
                        {step.description}
                      </p>
                      {!step.completed && (
                        <Button
                          size="sm"
                          className="enterprise-button-primary text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            step.onClick();
                          }}
                        >
                          {step.action}
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search and View Controls */}
        {projects.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 enterprise-fade-in" style={{ animationDelay: '0.7s' }}>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-enterprise-text-tertiary" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-enterprise-surface-elevated border border-enterprise-border-primary rounded-lg text-enterprise-text-primary placeholder-enterprise-text-tertiary focus:outline-none focus:ring-2 focus:ring-enterprise-primary focus:border-enterprise-primary transition-all enterprise-focus"
                />
              </div>
              <Button className="enterprise-button-secondary">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className={viewMode === 'grid' ? 'enterprise-button-primary' : 'enterprise-button-secondary'}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
                className={viewMode === 'list' ? 'enterprise-button-primary' : 'enterprise-button-secondary'}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Projects Grid/List */}
        {projects.length === 0 ? (
          <div className="text-center py-16 enterprise-fade-in" style={{ animationDelay: '0.8s' }}>
            <div className="w-24 h-24 bg-enterprise-surface-elevated rounded-full flex items-center justify-center mx-auto mb-6">
              <Folder className="h-12 w-12 text-enterprise-text-tertiary" />
            </div>
            <h2 className="text-2xl font-semibold text-enterprise-text-primary mb-2">
              Ready to start your compliance journey?
            </h2>
            <p className="text-enterprise-text-secondary mb-8 max-w-md mx-auto">
              Create your first compliance project to begin tracking your organizational compliance posture across multiple frameworks.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-3 sm:space-y-0 sm:space-x-4">
              <Button onClick={handleCreateProject} className="enterprise-button-primary">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Project
              </Button>
              <Button onClick={() => router.push('/dashboard')} className="enterprise-button-secondary">
                <Monitor className="h-4 w-4 mr-2" />
                Explore Dashboard
              </Button>
            </div>
          </div>
        ) : (
          <div className={`enterprise-fade-in ${
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
              : 'space-y-4'
          }`} style={{ animationDelay: '0.8s' }}>
            {projects
              .filter(project =>
                project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (project.description || '').toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((project, index) => (
                <div
                  key={project.id}
                  className={`enterprise-card cursor-pointer transition-all duration-200 hover:transform hover:-translate-y-1 hover:scale-105 enterprise-stagger-${Math.min(index + 1, 4)}`}
                  onClick={() => handleProjectClick(project.id)}
                >
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-enterprise-text-primary mb-2">
                          {project.name}
                        </h3>
                        <p className="text-enterprise-text-secondary text-sm line-clamp-2">
                          {project.description || 'No description provided'}
                        </p>
                      </div>
                      <Badge
                        variant={getStatusBadgeVariant(project.status)}
                        className="ml-3"
                      >
                        {project.status}
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center space-x-2 text-enterprise-text-tertiary">
                          <FileText className="h-4 w-4" />
                          <span>{project.document_count} documents</span>
                        </div>
                        <div className="flex items-center space-x-2 text-enterprise-text-tertiary">
                          <Shield className="h-4 w-4" />
                          <span>{project.framework_count} frameworks</span>
                        </div>
                      </div>

                      {project.latest_compliance_score > 0 && (
                        <div>
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="text-enterprise-text-tertiary">Compliance Score</span>
                            <span className="text-enterprise-text-primary font-semibold">
                              {Math.round(project.latest_compliance_score)}%
                            </span>
                          </div>
                          <Progress value={project.latest_compliance_score} className="h-2" />
                        </div>
                      )}

                      <div className="flex items-center justify-between text-sm text-enterprise-text-tertiary pt-2 border-t border-enterprise-border-secondary">
                        <div className="flex items-center space-x-2">
                          <Calendar className="h-4 w-4" />
                          <span>Updated {new Date(project.updated_at).toLocaleDateString()}</span>
                        </div>
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Create Project Dialog */}
        <CreateProjectDialog
          isOpen={isCreateDialogOpen}
          onClose={() => setIsCreateDialogOpen(false)}
          onSubmit={handleCreateProjectSubmit}
        />
      </div>
    </EnterpriseLayout>
  );
}
