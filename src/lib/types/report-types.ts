export interface ReportOverview {
  overallScore: number; // 0-100
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  frameworkCount: number;
  documentCount: number;
  lastAssessment: Date;
  complianceReadiness: 'not_ready' | 'partially_ready' | 'mostly_ready' | 'compliant';
  criticalGapsCount: number;
  highPriorityGapsCount: number;
}

export interface FrameworkScore {
  framework: string;
  overallScore: number; // 0-100
  maxScore: number;
  percentage: number;
  confidence: number; // 0-1
  priority: 'critical' | 'high' | 'medium' | 'low';
  categoryScores: {
    [category: string]: {
      score: number;
      maxScore: number;
      percentage: number;
    };
  };
  strengths: string[];
  criticalIssues: string[];
  readinessLevel: 'not_ready' | 'partially_ready' | 'mostly_ready' | 'compliant';
}

export interface ComplianceGap {
  id: string;
  framework: string;
  category: string;
  requirement: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  currentScore: number;
  maxScore: number;
  impact: number; // 0-100
  effort: 'low' | 'medium' | 'high';
  estimatedHours?: number;
  currentStatus: 'missing' | 'partial' | 'inadequate' | 'needs_review';
  evidence: Array<{
    source: string;
    content: string;
    relevance: number;
  }>;
  recommendations: string[];
  dueDate?: Date;
}

export interface DocumentAnalysis {
  documentId: string;
  documentName: string;
  documentType: 'policy' | 'procedure' | 'form' | 'code' | 'other';
  coverageScore: number; // 0-100
  frameworkCoverage: Array<{
    framework: string;
    coverage: number; // 0-100
    gaps: string[];
    strengths: string[];
  }>;
  keyFindings: string[];
  recommendations: string[];
  lastAnalyzed: Date;
}

export interface ScoreTrend {
  date: Date;
  overallScore: number;
  frameworkScores: Array<{
    framework: string;
    score: number;
  }>;
  changeFromPrevious: number;
  changeType: 'improvement' | 'decline' | 'stable';
}

export interface ReportMetadata {
  reportId: string;
  projectId: string;
  generatedAt: Date;
  generatedBy: string;
  analysisVersion: string;
  processingTime: number; // milliseconds
  agentsUsed: string[];
  documentVersions: Array<{
    documentId: string;
    version: string;
    analyzedAt: Date;
  }>;
}

export interface VisualizationData {
  // For radar charts
  radarData: Array<{
    framework: string;
    [category: string]: number | string;
  }>;

  // For heatmap
  heatmapData: Array<{
    framework: string;
    category: string;
    score: number;
    color: string;
  }>;

  // For priority matrix
  priorityMatrix: Array<{
    gap: ComplianceGap;
    x: number; // effort
    y: number; // impact
    size: number; // severity weight
    color: string;
  }>;

  // For trend lines
  trendData: Array<{
    date: string;
    overall: number;
    [framework: string]: number | string;
  }>;

  // For gauge charts
  gaugeData: Array<{
    label: string;
    value: number;
    maxValue: number;
    color: string;
    target?: number;
  }>;
}

export interface ReportData {
  overview: ReportOverview;
  frameworkScores: FrameworkScore[];
  gaps: ComplianceGap[];
  documentAnalysis: DocumentAnalysis[];
  trends: ScoreTrend[];
  visualizations: VisualizationData;
  metadata: ReportMetadata;
}

export interface ReportGenerationRequest {
  projectId: string;
  includeHistoricalData?: boolean;
  analysisDepth?: 'quick' | 'thorough' | 'comprehensive';
  focusFrameworks?: string[];
  includeDocumentAnalysis?: boolean;
  generateVisualizations?: boolean;
}

export interface ReportGenerationResponse {
  success: boolean;
  reportId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number; // 0-100
  estimatedTimeRemaining?: number; // seconds
  partialData?: Partial<ReportData>;
  error?: string;
}

export interface ReportExportOptions {
  format: 'pdf' | 'excel' | 'csv' | 'json';
  sections: Array<'overview' | 'frameworks' | 'gaps' | 'documents' | 'trends'>;
  includeCharts: boolean;
  includeSummary: boolean;
  customization?: {
    companyName?: string;
    logoUrl?: string;
    theme?: 'light' | 'dark' | 'enterprise';
  };
}

// Utility types for component props
export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
  }>;
}

export interface FilterOptions {
  frameworks?: string[];
  severity?: Array<'critical' | 'high' | 'medium' | 'low'>;
  dateRange?: {
    start: Date;
    end: Date;
  };
  documentTypes?: string[];
  categories?: string[];
}

export interface DrillDownContext {
  type: 'framework' | 'gap' | 'document' | 'category';
  id: string;
  name: string;
  filters?: FilterOptions;
}