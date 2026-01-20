'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  BookOpen
} from 'lucide-react';

interface ComplianceFramework {
  id: string;
  name: string;
  score?: number;
  confidence: number;
  gapCount: number;
}

interface ComplianceOverviewProps {
  frameworks: ComplianceFramework[];
  averageScore: number;
  highPriorityGaps: number;
  totalFrameworks: number;
  lastAssessmentDate?: Date;
  isLoading?: boolean;
  onAnalyze?: () => void;
  onViewDetails?: (frameworkId: string) => void;
}

export function ComplianceOverview({
  frameworks,
  averageScore,
  highPriorityGaps,
  totalFrameworks,
  lastAssessmentDate,
  isLoading = false,
  onAnalyze,
  onViewDetails
}: ComplianceOverviewProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Compliance Overview</CardTitle>
            <CardDescription>Loading compliance data...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (totalFrameworks === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Shield size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No compliance frameworks detected
          </h3>
          <p className="text-gray-600 mb-4">
            Link documents and run analysis to identify applicable compliance frameworks
          </p>
          {onAnalyze && (
            <Button onClick={onAnalyze} className="flex items-center gap-2">
              <Shield size={16} />
              Start Analysis
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    return 'destructive';
  };

  const completedFrameworks = frameworks.filter(f => f.score !== undefined && f.score >= 80).length;
  const inProgressFrameworks = frameworks.filter(f => f.score !== undefined && f.score < 80).length;
  const pendingFrameworks = frameworks.filter(f => f.score === undefined).length;

  return (
    <div className="space-y-6">
      {/* Overall Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Overall Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(averageScore)}`}>
              {averageScore > 0 ? `${Math.round(averageScore)}%` : 'N/A'}
            </div>
            {averageScore > 0 && (
              <Progress value={averageScore} className="h-2 mt-2" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">High Priority Gaps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{highPriorityGaps}</div>
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
              <AlertTriangle size={12} />
              <span>Need immediate attention</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Frameworks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFrameworks}</div>
            <div className="text-xs text-gray-500 mt-1">
              {completedFrameworks} complete, {inProgressFrameworks} in progress
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Last Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {lastAssessmentDate ? (
                new Date(lastAssessmentDate).toLocaleDateString()
              ) : (
                'Not yet'
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
              <Clock size={12} />
              <span>
                {lastAssessmentDate
                  ? `${Math.floor((Date.now() - new Date(lastAssessmentDate).getTime()) / (1000 * 60 * 60 * 24))} days ago`
                  : 'Run initial assessment'
                }
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* High Priority Alert */}
      {highPriorityGaps > 0 && (
        <Alert variant="destructive">
          <AlertTriangle size={16} />
          <AlertDescription>
            You have {highPriorityGaps} high priority compliance gaps that need immediate attention.
          </AlertDescription>
        </Alert>
      )}

      {/* Frameworks Grid */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Detected Frameworks</h3>
          {onAnalyze && (
            <Button variant="outline" onClick={onAnalyze} className="flex items-center gap-2">
              <TrendingUp size={16} />
              Re-analyze
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {frameworks.map((framework) => (
            <Card key={framework.id} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-base">{framework.name}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Target size={12} />
                      Confidence: {Math.round(framework.confidence * 100)}%
                    </CardDescription>
                  </div>
                  {framework.score !== undefined && (
                    <Badge variant={getScoreBadgeVariant(framework.score)}>
                      {Math.round(framework.score)}%
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-3">
                  {/* Progress Bar */}
                  {framework.score !== undefined && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Compliance Progress</span>
                        <span className={getScoreColor(framework.score)}>
                          {Math.round(framework.score)}%
                        </span>
                      </div>
                      <Progress value={framework.score} className="h-2" />
                    </div>
                  )}

                  {/* Gaps */}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Gaps to address:</span>
                    <div className="flex items-center gap-1">
                      {framework.gapCount > 0 ? (
                        <>
                          <AlertTriangle size={12} className="text-red-500" />
                          <span className="text-red-600 font-medium">{framework.gapCount}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle size={12} className="text-green-500" />
                          <span className="text-green-600 font-medium">0</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  {onViewDetails && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewDetails(framework.id)}
                      className="w-full flex items-center gap-2"
                    >
                      <BookOpen size={14} />
                      View Details
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}