'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/stores/auth-store/auth-store';
import {
  ReportOverview,
  FrameworkBreakdown,
  GapAnalysisSection,
  ScoreTrendChart
} from './index';
import { ReportData, ComplianceGap, ReportGenerationRequest } from '@/lib/types/report-types';
import {
  BarChart3,
  Shield,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Download,
  FileText,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface ReportDashboardProps {
  projectId: string;
  initialData?: ReportData | null;
  isLocked?: boolean;
}

export function ReportDashboard({
  projectId,
  initialData = null,
  isLocked = false
}: ReportDashboardProps) {
  const { user } = useAuthStore();
  const [reportData, setReportData] = useState<ReportData | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'frameworks' | 'gaps' | 'trends'>('overview');
  const [selectedGap, setSelectedGap] = useState<string | null>(null);
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);

  const generateReport = useCallback(async (regenerate: boolean = false) => {
    if (!user || !projectId) {
      setError('Authentication required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();

      const requestBody: ReportGenerationRequest = {
        projectId,
        analysisDepth: 'thorough',
        includeHistoricalData: true,
        includeDocumentAnalysis: true,
        generateVisualizations: true
      };

      const response = await fetch(`/api/projects/${projectId}/reports`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to generate report: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        setReportData(result.data);
      } else {
        throw new Error(result.error || 'Failed to generate report data');
      }

    } catch (error) {
      console.error('Error generating report:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate report');
    } finally {
      setIsLoading(false);
    }
  }, [user, projectId]);

  const handleExport = useCallback(async () => {
    // TODO: Implement export functionality
    console.log('Export report not yet implemented');
  }, []);

  const handleGapClick = useCallback((gap: ComplianceGap) => {
    setSelectedGap(gap.id);
    setActiveTab('gaps');
  }, []);

  const handleFrameworkClick = useCallback((framework: string) => {
    setSelectedFramework(framework);
    setActiveTab('frameworks');
  }, []);

  // Auto-generate report on mount if no initial data
  useEffect(() => {
    if (!reportData && !isLocked && user && projectId) {
      generateReport();
    }
  }, [reportData, isLocked, user, projectId, generateReport]);

  // Show locked state
  if (isLocked) {
    return (
      <Card className="enterprise-card">
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center">
            <FileText className="w-16 h-16 text-enterprise-text-tertiary mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-enterprise-text-primary mb-2">
              Upload Sources First
            </h3>
            <p className="text-enterprise-text-secondary mb-6 max-w-md">
              To generate compliance reports, you need to upload documents or connect Google Drive folders to your project first.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show loading state
  if (isLoading && !reportData) {
    return (
      <Card className="enterprise-card">
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-enterprise-primary mx-auto mb-4 animate-spin" />
            <h3 className="text-xl font-semibold text-enterprise-text-primary mb-2">
              Generating Report
            </h3>
            <p className="text-enterprise-text-secondary">
              Analyzing your documents and generating compliance insights...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show error state
  if (error && !reportData) {
    return (
      <Card className="enterprise-card">
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-enterprise-text-primary mb-2">
              Report Generation Failed
            </h3>
            <p className="text-enterprise-text-secondary mb-6 max-w-md">
              {error}
            </p>
            <Button
              onClick={() => generateReport(true)}
              className="enterprise-button-primary"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show empty state
  if (!reportData) {
    return (
      <Card className="enterprise-card">
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center">
            <BarChart3 className="w-16 h-16 text-enterprise-text-tertiary mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-enterprise-text-primary mb-2">
              No Report Data
            </h3>
            <p className="text-enterprise-text-secondary mb-6">
              Click below to generate your compliance report
            </p>
            <Button
              onClick={() => generateReport()}
              className="enterprise-button-primary"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-red-800 text-sm">{error}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setError(null)}
              className="ml-auto text-red-600 border-red-200"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <Card className="enterprise-card">
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="frameworks" className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span className="hidden sm:inline">Frameworks</span>
              </TabsTrigger>
              <TabsTrigger value="gaps" className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="hidden sm:inline">Gaps</span>
              </TabsTrigger>
              <TabsTrigger value="trends" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                <span className="hidden sm:inline">Trends</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <ReportOverview
                overview={reportData.overview}
                frameworkScores={reportData.frameworkScores}
                onRefresh={() => generateReport(true)}
                onExport={handleExport}
                isLoading={isLoading}
              />
            </TabsContent>

            <TabsContent value="frameworks" className="mt-6">
              <FrameworkBreakdown
                frameworkScores={reportData.frameworkScores}
                onFrameworkClick={handleFrameworkClick}
                selectedFramework={selectedFramework}
              />
            </TabsContent>

            <TabsContent value="gaps" className="mt-6">
              <GapAnalysisSection
                gaps={reportData.gaps}
                onGapClick={handleGapClick}
                selectedGap={selectedGap}
              />
            </TabsContent>

            <TabsContent value="trends" className="mt-6">
              {reportData.trends && reportData.trends.length > 0 ? (
                <ScoreTrendChart
                  trends={reportData.trends}
                  title="Compliance Score Trends"
                  height={400}
                  targetScore={80}
                />
              ) : (
                <Card className="enterprise-card">
                  <CardContent className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <TrendingUp className="w-16 h-16 text-enterprise-text-tertiary mx-auto mb-4" />
                      <div className="text-enterprise-text-secondary">No trend data available</div>
                      <div className="text-sm text-enterprise-text-tertiary mt-1">
                        Generate more reports over time to see trends
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}