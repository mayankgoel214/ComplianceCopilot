'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ComplianceScoreGauge } from './compliance-score-gauge';
import { ReportOverview as ReportOverviewType, FrameworkScore } from '@/lib/types/report-types';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  TrendingUp,
  Download,
  RefreshCw
} from 'lucide-react';

interface ReportOverviewProps {
  overview: ReportOverviewType;
  frameworkScores: FrameworkScore[];
  onRefresh?: () => void;
  onExport?: () => void;
  isLoading?: boolean;
}

export function ReportOverview({
  overview,
  frameworkScores,
  onRefresh,
  onExport,
  isLoading = false
}: ReportOverviewProps) {
  const { riskLevelConfig, topFrameworks, complianceLevel } = useMemo(() => {
    const riskLevelConfig = {
      critical: { color: '#DC2626', icon: AlertTriangle, label: 'Critical Risk', bgColor: 'bg-red-50', textColor: 'text-red-700' },
      high: { color: '#EA580C', icon: AlertTriangle, label: 'High Risk', bgColor: 'bg-orange-50', textColor: 'text-orange-700' },
      medium: { color: '#CA8A04', icon: Shield, label: 'Medium Risk', bgColor: 'bg-yellow-50', textColor: 'text-yellow-700' },
      low: { color: '#16A34A', icon: CheckCircle, label: 'Low Risk', bgColor: 'bg-green-50', textColor: 'text-green-700' }
    };

    const topFrameworks = frameworkScores
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, 3);

    const complianceLevel = {
      compliant: { label: 'Compliant', color: 'text-green-600', bgColor: 'bg-green-50' },
      mostly_ready: { label: 'Mostly Ready', color: 'text-blue-600', bgColor: 'bg-blue-50' },
      partially_ready: { label: 'Partially Ready', color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
      not_ready: { label: 'Not Ready', color: 'text-red-600', bgColor: 'bg-red-50' }
    };

    return { riskLevelConfig, topFrameworks, complianceLevel };
  }, [overview.riskLevel, frameworkScores, overview.complianceReadiness]);

  const RiskIcon = riskLevelConfig[overview.riskLevel].icon;

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-enterprise-text-primary">Compliance Overview</h2>
          <p className="text-enterprise-text-secondary">
            Last updated: {new Date(overview.lastAssessment).toLocaleDateString()} at {new Date(overview.lastAssessment).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex gap-2">
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="enterprise-button-secondary"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          )}
          {onExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              className="enterprise-button-secondary"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Main metrics grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overall Score Gauge */}
        <div className="lg:col-span-1">
          <ComplianceScoreGauge
            score={overview.overallScore}
            title="Overall Compliance Score"
            size="lg"
            target={80}
            riskLevel={overview.riskLevel}
          />
        </div>

        {/* Key Metrics */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          {/* Risk Level */}
          <Card className="enterprise-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-full ${riskLevelConfig[overview.riskLevel].bgColor}`}>
                  <RiskIcon className="w-6 h-6" style={{ color: riskLevelConfig[overview.riskLevel].color }} />
                </div>
                <div>
                  <div className="text-sm text-enterprise-text-secondary">Risk Level</div>
                  <div className={`text-lg font-semibold ${riskLevelConfig[overview.riskLevel].textColor}`}>
                    {riskLevelConfig[overview.riskLevel].label}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Compliance Readiness */}
          <Card className="enterprise-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-full ${complianceLevel[overview.complianceReadiness].bgColor}`}>
                  <CheckCircle className={`w-6 h-6 ${complianceLevel[overview.complianceReadiness].color}`} />
                </div>
                <div>
                  <div className="text-sm text-enterprise-text-secondary">Readiness</div>
                  <div className={`text-lg font-semibold ${complianceLevel[overview.complianceReadiness].color}`}>
                    {complianceLevel[overview.complianceReadiness].label}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Critical Gaps */}
          <Card className="enterprise-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-red-50">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <div className="text-sm text-enterprise-text-secondary">Critical Gaps</div>
                  <div className="text-2xl font-bold text-red-600">
                    {overview.criticalGapsCount}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* High Priority Gaps */}
          <Card className="enterprise-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-orange-50">
                  <Clock className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <div className="text-sm text-enterprise-text-secondary">High Priority</div>
                  <div className="text-2xl font-bold text-orange-600">
                    {overview.highPriorityGapsCount}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Frameworks Detected */}
        <Card className="enterprise-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-enterprise-text-primary flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Frameworks Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-enterprise-text-primary mb-2">
              {overview.frameworkCount}
            </div>
            <div className="text-sm text-enterprise-text-secondary">
              Compliance frameworks identified
            </div>
          </CardContent>
        </Card>

        {/* Documents Analyzed */}
        <Card className="enterprise-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-enterprise-text-primary flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Documents Analyzed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-enterprise-text-primary mb-2">
              {overview.documentCount}
            </div>
            <div className="text-sm text-enterprise-text-secondary">
              Source documents processed
            </div>
          </CardContent>
        </Card>

        {/* Analysis Status */}
        <Card className="enterprise-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-enterprise-text-primary flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Analysis Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-green-600 mb-2">
              Complete
            </div>
            <div className="text-sm text-enterprise-text-secondary">
              {new Date().toLocaleDateString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performing Frameworks */}
      {topFrameworks.length > 0 && (
        <Card className="enterprise-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-enterprise-text-primary">
              Top Performing Frameworks
            </CardTitle>
            <div className="text-sm text-enterprise-text-secondary">
              Frameworks with highest compliance scores
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topFrameworks.map((framework, index) => (
                <div key={framework.framework} className="flex items-center justify-between p-4 bg-enterprise-surface-elevated rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-enterprise-primary text-white flex items-center justify-center text-sm font-semibold">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium text-enterprise-text-primary">
                        {framework.framework}
                      </div>
                      <div className="text-sm text-enterprise-text-secondary capitalize">
                        {framework.readinessLevel.replace('_', ' ')} • {framework.priority} priority
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-enterprise-text-primary">
                      {framework.overallScore}%
                    </div>
                    <div className="text-sm text-enterprise-text-secondary">
                      {framework.overallScore}/{framework.maxScore}
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