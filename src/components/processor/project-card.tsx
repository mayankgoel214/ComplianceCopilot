'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, TrendingUp, Calendar } from 'lucide-react';
import { ProjectSummary } from '@/lib/db/types';

interface ProjectCardProps {
  project: ProjectSummary;
  onClick?: () => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default' as const;
      case 'analyzing':
        return 'secondary' as const;
      case 'draft':
      default:
        return 'outline' as const;
    }
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow duration-200"
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg mb-2">{project.name}</CardTitle>
            <CardDescription className="line-clamp-2">
              {project.description || 'No description provided'}
            </CardDescription>
          </div>
          <Badge variant={getStatusBadgeVariant(project.status)}>
            {project.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {/* Documents */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileText size={16} />
            <span>{project.document_count} documents</span>
          </div>

          {/* Frameworks */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <TrendingUp size={16} />
            <span>{project.framework_count} frameworks detected</span>
          </div>

          {/* Compliance Score */}
          {project.latest_compliance_score > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${project.latest_compliance_score}%` }}
                />
              </div>
              <span className="text-gray-600 min-w-0">
                {Math.round(project.latest_compliance_score)}%
              </span>
            </div>
          )}

          {/* Last Updated */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar size={16} />
            <span>
              Updated {new Date(project.updated_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}