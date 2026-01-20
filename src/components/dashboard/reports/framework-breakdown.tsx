'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FrameworkRadarChart } from './framework-radar-chart';
import { ComplianceHeatmap } from './compliance-heatmap';
import { ComplianceScoreGauge } from './compliance-score-gauge';
import { FrameworkScore } from '@/lib/types/report-types';
import {
  ChevronDown,
  ChevronUp,
  Shield,
  AlertCircle,
  CheckCircle,
  Info,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface FrameworkBreakdownProps {
  frameworkScores: FrameworkScore[];
  onFrameworkClick?: (framework: string) => void;
  selectedFramework?: string;
}

export function FrameworkBreakdown({
  frameworkScores,
  onFrameworkClick,
  selectedFramework
}: FrameworkBreakdownProps) {
  const [expandedFramework, setExpandedFramework] = useState<string | null>(selectedFramework || null);
  const [activeTab, setActiveTab] = useState<'radar' | 'heatmap'>('radar');

  const { radarData, sortedFrameworks, categoryStats } = useMemo(() => {
    if (!frameworkScores || frameworkScores.length === 0) {
      return { radarData: [], sortedFrameworks: [], categoryStats: {} };
    }

    // Sort frameworks by score
    const sortedFrameworks = [...frameworkScores].sort((a, b) => b.overallScore - a.overallScore);

    // Prepare radar chart data
    const radarData = frameworkScores.map(fs => {
      const data: any = { framework: fs.framework };
      Object.entries(fs.categoryScores).forEach(([category, score]) => {
        data[category] = score.percentage;
      });
      return data;
    });

    // Calculate category statistics
    const allCategories = new Set<string>();
    frameworkScores.forEach(fs => {
      Object.keys(fs.categoryScores).forEach(cat => allCategories.add(cat));
    });

    const categoryStats: Record<string, { avg: number; min: number; max: number }> = {};
    allCategories.forEach(category => {
      const scores = frameworkScores
        .map(fs => fs.categoryScores[category]?.percentage || 0)
        .filter(score => score > 0);

      if (scores.length > 0) {
        categoryStats[category] = {
          avg: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
          min: Math.min(...scores),
          max: Math.max(...scores)
        };
      }
    });

    return { radarData, sortedFrameworks, categoryStats };
  }, [frameworkScores]);

  const handleFrameworkToggle = (framework: string) => {
    setExpandedFramework(expandedFramework === framework ? null : framework);
    if (onFrameworkClick) {
      onFrameworkClick(framework);
    }
  };

  const getReadinessIcon = (readiness: string) => {
    switch (readiness) {
      case 'compliant':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'mostly_ready':
        return <TrendingUp className="w-5 h-5 text-blue-600" />;
      case 'partially_ready':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'not_ready':
        return <TrendingDown className="w-5 h-5 text-red-600" />;
      default:
        return <Info className="w-5 h-5 text-gray-600" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (!frameworkScores || frameworkScores.length === 0) {
    return (
      <Card className="enterprise-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-enterprise-text-primary">
            Framework Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-enterprise-text-secondary">No frameworks detected</div>
            <div className="text-sm text-enterprise-text-tertiary mt-1">
              Upload more documents or run analysis to detect compliance frameworks
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-enterprise-text-primary">Framework Analysis</h2>
          <p className="text-enterprise-text-secondary">
            Detailed breakdown of {frameworkScores.length} detected compliance frameworks
          </p>
        </div>
      </div>

      {/* Visualization Tabs */}
      <Card className="enterprise-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-enterprise-text-primary">
            Framework Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'radar' | 'heatmap')}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="radar">Radar View</TabsTrigger>
              <TabsTrigger value="heatmap">Heatmap View</TabsTrigger>
            </TabsList>

            <TabsContent value="radar">
              <FrameworkRadarChart
                data={radarData}
                title=""
                height={400}
                showLegend={true}
              />
            </TabsContent>

            <TabsContent value="heatmap">
              <ComplianceHeatmap
                frameworkScores={frameworkScores}
                title=""
                showPercentages={true}
                onCellClick={(framework, category, score) => {
                  console.log('Cell clicked:', framework, category, score);
                }}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Individual Framework Details */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-enterprise-text-primary">Individual Frameworks</h3>

        {sortedFrameworks.map((framework, index) => (
          <Card key={framework.framework} className="enterprise-card">
            {/* Framework Header */}
            <CardHeader className="pb-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => handleFrameworkToggle(framework.framework)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-enterprise-primary text-white flex items-center justify-center text-sm font-semibold">
                      {index + 1}
                    </div>
                    <Shield className="w-6 h-6 text-enterprise-text-secondary" />
                  </div>

                  <div>
                    <div className="font-semibold text-enterprise-text-primary text-lg">
                      {framework.framework}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-enterprise-text-secondary">
                      <span>Score: {framework.overallScore}%</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(framework.priority)}`}>
                        {framework.priority.toUpperCase()}
                      </span>
                      <div className="flex items-center gap-1">
                        {getReadinessIcon(framework.readinessLevel)}
                        <span className="capitalize">{framework.readinessLevel.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <ComplianceScoreGauge
                    score={framework.overallScore}
                    maxScore={framework.maxScore}
                    size="sm"
                    showPercentage={true}
                    title=""
                  />
                  {expandedFramework === framework.framework ? (
                    <ChevronUp className="w-5 h-5 text-enterprise-text-secondary" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-enterprise-text-secondary" />
                  )}
                </div>
              </div>
            </CardHeader>

            {/* Expanded Details */}
            {expandedFramework === framework.framework && (
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Category Scores */}
                  <div>
                    <h4 className="font-semibold text-enterprise-text-primary mb-3">Category Breakdown</h4>
                    <div className="space-y-3">
                      {Object.entries(framework.categoryScores).map(([category, score]) => (
                        <div key={category} className="flex items-center justify-between p-3 bg-enterprise-surface-elevated rounded-lg">
                          <div>
                            <div className="font-medium text-enterprise-text-primary">
                              {category.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                            </div>
                            <div className="text-sm text-enterprise-text-secondary">
                              {score.score}/{score.maxScore} points
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-enterprise-text-primary">
                              {score.percentage}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Strengths and Issues */}
                  <div className="space-y-4">
                    {framework.strengths && framework.strengths.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-enterprise-text-primary mb-3 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          Strengths
                        </h4>
                        <div className="space-y-2">
                          {framework.strengths.map((strength, idx) => (
                            <div key={idx} className="p-2 bg-green-50 rounded-lg text-sm text-green-800">
                              {strength}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {framework.criticalIssues && framework.criticalIssues.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-enterprise-text-primary mb-3 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-red-600" />
                          Critical Issues
                        </h4>
                        <div className="space-y-2">
                          {framework.criticalIssues.map((issue, idx) => (
                            <div key={idx} className="p-2 bg-red-50 rounded-lg text-sm text-red-800">
                              {issue}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* Category Performance Summary */}
      {Object.keys(categoryStats).length > 0 && (
        <Card className="enterprise-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-enterprise-text-primary">
              Category Performance Summary
            </CardTitle>
            <div className="text-sm text-enterprise-text-secondary">
              Average performance across all frameworks by category
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(categoryStats).map(([category, stats]) => (
                <div key={category} className="p-4 bg-enterprise-surface-elevated rounded-lg">
                  <div className="font-medium text-enterprise-text-primary mb-2">
                    {category.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-enterprise-text-secondary">Average:</span>
                      <span className="font-medium">{stats.avg}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-enterprise-text-secondary">Range:</span>
                      <span className="font-medium">{stats.min}% - {stats.max}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}