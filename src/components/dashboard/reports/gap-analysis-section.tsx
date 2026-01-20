'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GapPriorityMatrix } from './gap-priority-matrix';
import { ComplianceGap } from '@/lib/types/report-types';
import {
  AlertTriangle,
  Clock,
  Filter,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  Target,
  Zap,
  CheckCircle2
} from 'lucide-react';

interface GapAnalysisSectionProps {
  gaps: ComplianceGap[];
  onGapClick?: (gap: ComplianceGap) => void;
  selectedGap?: string;
}

type FilterType = 'all' | 'critical' | 'high' | 'medium' | 'low';
type SortType = 'severity' | 'impact' | 'effort' | 'framework';

export function GapAnalysisSection({
  gaps,
  onGapClick,
  selectedGap
}: GapAnalysisSectionProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('severity');
  const [expandedGap, setExpandedGap] = useState<string | null>(selectedGap || null);

  const { filteredGaps, gapStats, priorityGroups } = useMemo(() => {
    if (!gaps || gaps.length === 0) {
      return { filteredGaps: [], gapStats: {}, priorityGroups: {} };
    }

    // Filter gaps
    const filteredGaps = filter === 'all'
      ? gaps
      : gaps.filter(gap => gap.severity === filter);

    // Sort gaps
    const sortedGaps = [...filteredGaps].sort((a, b) => {
      switch (sortBy) {
        case 'severity':
          const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          return severityOrder[b.severity] - severityOrder[a.severity];
        case 'impact':
          return b.impact - a.impact;
        case 'effort':
          const effortOrder = { low: 1, medium: 2, high: 3 };
          return effortOrder[a.effort] - effortOrder[b.effort];
        case 'framework':
          return a.framework.localeCompare(b.framework);
        default:
          return 0;
      }
    });

    // Calculate statistics
    const gapStats = gaps.reduce((stats, gap) => {
      stats[gap.severity] = (stats[gap.severity] || 0) + 1;
      return stats;
    }, {} as Record<string, number>);

    // Group by priority for quick wins analysis
    const priorityGroups = {
      quickWins: gaps.filter(gap => gap.impact >= 70 && gap.effort === 'low'),
      majorProjects: gaps.filter(gap => gap.impact >= 70 && gap.effort === 'high'),
      fillIns: gaps.filter(gap => gap.impact < 50 && gap.effort === 'low'),
      questionable: gaps.filter(gap => gap.impact < 50 && gap.effort === 'high')
    };

    return { filteredGaps: sortedGaps, gapStats, priorityGroups };
  }, [gaps, filter, sortBy]);

  const handleGapToggle = (gapId: string) => {
    setExpandedGap(expandedGap === gapId ? null : gapId);
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-orange-600" />;
      case 'medium':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'low':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case 'low': return 'text-green-600 bg-green-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'high': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (!gaps || gaps.length === 0) {
    return (
      <Card className="enterprise-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-enterprise-text-primary">
            Gap Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <div className="text-enterprise-text-secondary">No compliance gaps found</div>
            <div className="text-sm text-enterprise-text-tertiary mt-1">
              Congratulations! Your project appears to be compliant
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
          <h2 className="text-2xl font-bold text-enterprise-text-primary">Gap Analysis</h2>
          <p className="text-enterprise-text-secondary">
            {gaps.length} compliance gap{gaps.length !== 1 ? 's' : ''} identified across frameworks
          </p>
        </div>
      </div>

      {/* Gap Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { severity: 'critical', label: 'Critical', icon: AlertTriangle, color: 'text-red-600' },
          { severity: 'high', label: 'High', icon: AlertTriangle, color: 'text-orange-600' },
          { severity: 'medium', label: 'Medium', icon: Clock, color: 'text-yellow-600' },
          { severity: 'low', label: 'Low', icon: CheckCircle2, color: 'text-green-600' }
        ].map(({ severity, label, icon: Icon, color }) => (
          <Card key={severity} className="enterprise-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${color}`} />
                <div>
                  <div className="text-sm text-enterprise-text-secondary">{label}</div>
                  <div className={`text-2xl font-bold ${color}`}>
                    {gapStats[severity] || 0}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Priority Matrix */}
      <GapPriorityMatrix
        gaps={gaps}
        title="Gap Priority Matrix"
        height={400}
        onGapClick={onGapClick}
        showQuadrantLabels={true}
      />

      {/* Quick Wins Section */}
      {priorityGroups.quickWins.length > 0 && (
        <Card className="enterprise-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-enterprise-text-primary flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Quick Wins
            </CardTitle>
            <div className="text-sm text-enterprise-text-secondary">
              High impact, low effort gaps - prioritize these for immediate improvement
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {priorityGroups.quickWins.slice(0, 4).map(gap => (
                <div key={gap.id} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-medium text-enterprise-text-primary line-clamp-2">
                      {gap.requirement}
                    </div>
                    <Badge variant="secondary" className="ml-2 bg-yellow-100 text-yellow-800">
                      {gap.impact}% impact
                    </Badge>
                  </div>
                  <div className="text-sm text-enterprise-text-secondary">
                    {gap.framework} • {gap.category}
                  </div>
                  {gap.estimatedHours && (
                    <div className="text-sm text-green-600 mt-1">
                      Est. {gap.estimatedHours} hours
                    </div>
                  )}
                </div>
              ))}
            </div>
            {priorityGroups.quickWins.length > 4 && (
              <div className="text-center mt-4">
                <Button variant="outline" size="sm">
                  View all {priorityGroups.quickWins.length} quick wins
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters and Controls */}
      <Card className="enterprise-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-enterprise-text-primary">
              Detailed Gap List
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Severity Filter */}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterType)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              {/* Sort By */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white"
              >
                <option value="severity">Sort by Severity</option>
                <option value="impact">Sort by Impact</option>
                <option value="effort">Sort by Effort</option>
                <option value="framework">Sort by Framework</option>
              </select>
            </div>
          </div>
          <div className="text-sm text-enterprise-text-secondary">
            Showing {filteredGaps.length} of {gaps.length} gaps
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredGaps.map((gap, index) => (
              <Card key={gap.id} className={`border ${getSeverityColor(gap.severity)}`}>
                <CardContent className="p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => handleGapToggle(gap.id)}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex items-center gap-2">
                        {getSeverityIcon(gap.severity)}
                        <Badge className={getSeverityColor(gap.severity)}>
                          {gap.severity.toUpperCase()}
                        </Badge>
                      </div>

                      <div className="flex-1">
                        <div className="font-medium text-enterprise-text-primary line-clamp-1">
                          {gap.requirement}
                        </div>
                        <div className="text-sm text-enterprise-text-secondary flex items-center gap-4 mt-1">
                          <span>{gap.framework}</span>
                          <span>•</span>
                          <span>{gap.category}</span>
                          <span>•</span>
                          <span>{gap.impact}% impact</span>
                          <span>•</span>
                          <Badge className={getEffortColor(gap.effort)}>
                            {gap.effort} effort
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {gap.estimatedHours && (
                        <div className="text-sm text-enterprise-text-secondary">
                          {gap.estimatedHours}h
                        </div>
                      )}
                      {expandedGap === gap.id ? (
                        <ChevronUp className="w-4 h-4 text-enterprise-text-secondary" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-enterprise-text-secondary" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedGap === gap.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-semibold text-enterprise-text-primary mb-2">Description</h4>
                          <p className="text-sm text-enterprise-text-secondary mb-4">
                            {gap.description}
                          </p>

                          <h4 className="font-semibold text-enterprise-text-primary mb-2">Current Status</h4>
                          <div className="text-sm">
                            <div className="flex justify-between items-center mb-2">
                              <span>Status:</span>
                              <Badge variant="outline" className="capitalize">
                                {gap.currentStatus.replace('_', ' ')}
                              </Badge>
                            </div>
                            <div className="flex justify-between items-center">
                              <span>Score:</span>
                              <span className="font-medium">
                                {gap.currentScore}/{gap.maxScore}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          {gap.recommendations && gap.recommendations.length > 0 && (
                            <div className="mb-4">
                              <h4 className="font-semibold text-enterprise-text-primary mb-2">Recommendations</h4>
                              <ul className="text-sm space-y-1">
                                {gap.recommendations.map((rec, idx) => (
                                  <li key={idx} className="flex items-start gap-2">
                                    <Target className="w-3 h-3 text-blue-600 mt-0.5 flex-shrink-0" />
                                    <span className="text-enterprise-text-secondary">{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {gap.evidence && gap.evidence.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-enterprise-text-primary mb-2">Evidence</h4>
                              <div className="space-y-2">
                                {gap.evidence.map((evidence, idx) => (
                                  <div key={idx} className="p-2 bg-gray-50 rounded text-sm">
                                    <div className="font-medium">{evidence.source}</div>
                                    <div className="text-enterprise-text-secondary line-clamp-2">
                                      {evidence.content}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {onGapClick && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <Button
                            size="sm"
                            onClick={() => onGapClick(gap)}
                            className="enterprise-button-primary"
                          >
                            View Details
                            <ArrowUpRight className="w-4 h-4 ml-2" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}