import {
  ReportData,
  ReportOverview,
  FrameworkScore,
  ComplianceGap,
  DocumentAnalysis,
  ScoreTrend,
  VisualizationData,
  ReportMetadata,
  ReportGenerationRequest,
  ReportGenerationResponse,
} from '@/lib/types/report-types';
import { testingDataService } from './testing-data-service';

interface AgentResults {
  classification?: any;
  grading?: any;
  improvement?: any;
  ideation?: any;
}

export class ReportService {
  private static instance: ReportService;

  public static getInstance(): ReportService {
    if (!ReportService.instance) {
      ReportService.instance = new ReportService();
    }
    return ReportService.instance;
  }

  /**
   * Transform agent analysis results into comprehensive report data
   */
  public async generateReportData(
    projectId: string,
    agentResults: AgentResults,
    documents: any[],
    existingTrends?: ScoreTrend[]
  ): Promise<ReportData> {
    // Check if testing mode is enabled
    if (testingDataService.isTestingMode()) {
      console.log("🔧 Testing mode enabled - generating hardcoded report data");
      return this.generateTestingModeReportData(projectId, documents, existingTrends);
    }

    // Normal processing
    const metadata = this.generateMetadata(projectId, agentResults);

    // Extract framework scores from grading agent (with classification fallback)
    const frameworkScores = this.extractFrameworkScores(agentResults.grading, agentResults.classification);

    // Extract compliance gaps from grading and improvement agents
    const gaps = this.extractComplianceGaps(agentResults.grading, agentResults.improvement);

    // Generate overview from all agent results
    const overview = this.generateOverview(frameworkScores, gaps, documents);

    // Analyze document coverage
    const documentAnalysis = this.analyzeDocuments(documents, agentResults);

    // Generate trend data (if historical data available)
    const trends = this.generateTrends(frameworkScores, existingTrends);

    // Generate visualization data
    const visualizations = this.generateVisualizationData(frameworkScores, gaps, trends);

    return {
      overview,
      frameworkScores,
      gaps,
      documentAnalysis,
      trends,
      visualizations,
      metadata,
    };
  }

  private generateOverview(
    frameworkScores: FrameworkScore[],
    gaps: ComplianceGap[],
    documents: any[]
  ): ReportOverview {
    const overallScore = frameworkScores.length > 0
      ? Math.round(frameworkScores.reduce((sum, f) => sum + f.overallScore, 0) / frameworkScores.length)
      : 0;

    const criticalGaps = gaps.filter(g => g.severity === 'critical').length;
    const highPriorityGaps = gaps.filter(g => g.severity === 'high').length;

    const riskLevel = this.calculateRiskLevel(overallScore, criticalGaps, highPriorityGaps);
    const complianceReadiness = this.calculateComplianceReadiness(overallScore, criticalGaps);

    return {
      overallScore,
      riskLevel,
      frameworkCount: frameworkScores.length,
      documentCount: documents.length,
      lastAssessment: new Date(),
      complianceReadiness,
      criticalGapsCount: criticalGaps,
      highPriorityGapsCount: highPriorityGaps,
    };
  }

  private extractFrameworkScores(gradingResults: any, classificationResults?: any): FrameworkScore[] {
    console.log('Extracting framework scores:', {
      gradingResults: JSON.stringify(gradingResults, null, 2),
      classificationResults: JSON.stringify(classificationResults, null, 2)
    });

    // First try to get framework scores from grading results
    if (gradingResults?.frameworkScores || gradingResults?.data?.frameworkScores) {
      const scores = gradingResults.frameworkScores || gradingResults.data.frameworkScores || [];

      return scores.map((score: any) => ({
        framework: score.framework,
        overallScore: score.overallScore || 0,
        maxScore: score.maxScore || 100,
        percentage: score.percentage || Math.round((score.overallScore / (score.maxScore || 100)) * 100),
        confidence: score.confidence || 0.8,
        priority: this.determinePriority(score.overallScore),
        categoryScores: score.categoryScores || {},
        strengths: score.strengths || [],
        criticalIssues: score.criticalIssues || [],
        readinessLevel: this.determineReadinessLevel(score.overallScore),
      }));
    }

    // If no grading results, fallback to classification results
    if (classificationResults?.detectedFrameworks || classificationResults?.data?.detectedFrameworks) {
      const frameworks = classificationResults.detectedFrameworks || classificationResults.data.detectedFrameworks || [];

      return frameworks.map((framework: any) => ({
        framework: framework.name,
        overallScore: Math.round(framework.confidence * 100),
        maxScore: 100,
        percentage: Math.round(framework.confidence * 100),
        confidence: framework.confidence || 0.8,
        priority: framework.priority || 'medium',
        categoryScores: {},
        strengths: framework.requirements?.slice(0, 3) || [],
        criticalIssues: [],
        readinessLevel: this.determineReadinessLevel(Math.round(framework.confidence * 100)),
      }));
    }

    return [];
  }

  private extractComplianceGaps(gradingResults: any, improvementResults: any): ComplianceGap[] {
    const gaps: ComplianceGap[] = [];

    // Extract gaps from grading results
    if (gradingResults?.prioritizedGaps || gradingResults?.data?.prioritizedGaps) {
      const gradingGaps = gradingResults.prioritizedGaps || gradingResults.data.prioritizedGaps || [];
      gaps.push(...gradingGaps.map((gap: any, index: number) => ({
        id: gap.id || `gap-${index}`,
        framework: gap.framework,
        category: gap.category,
        requirement: gap.description || gap.requirement,
        description: gap.description,
        severity: gap.severity,
        currentScore: gap.currentScore || 0,
        maxScore: gap.maxScore || 100,
        impact: gap.impact || 50,
        effort: gap.effort || 'medium',
        estimatedHours: this.estimateEffort(gap.effort),
        currentStatus: gap.currentStatus || 'missing',
        evidence: gap.evidence ? gap.evidence.map((e: any) => ({
          source: e.source || 'Unknown',
          content: e.content || e,
          relevance: e.relevance || 0.8,
        })) : [],
        recommendations: gap.recommendations || [],
      })));
    }

    // Extract additional gaps from improvement results
    if (improvementResults?.recommendations || improvementResults?.data?.recommendations) {
      const improvements = improvementResults.recommendations || improvementResults.data.recommendations || [];
      improvements.forEach((rec: any, index: number) => {
        if (rec.type === 'gap_fix' || rec.category === 'compliance_gap') {
          gaps.push({
            id: `improvement-gap-${index}`,
            framework: rec.framework || 'General',
            category: rec.category || 'Implementation',
            requirement: rec.title || rec.description,
            description: rec.description,
            severity: rec.priority === 'critical' ? 'critical' : rec.priority || 'medium',
            currentScore: 0,
            maxScore: 100,
            impact: rec.impact || 50,
            effort: rec.effort || 'medium',
            estimatedHours: rec.estimatedHours || this.estimateEffort(rec.effort),
            currentStatus: 'missing',
            evidence: [],
            recommendations: [rec.solution || rec.description],
          });
        }
      });
    }

    return gaps;
  }

  private analyzeDocuments(documents: any[], agentResults: AgentResults): DocumentAnalysis[] {
    return documents.map(doc => {
      const analysis: DocumentAnalysis = {
        documentId: doc.id,
        documentName: doc.name || doc.title,
        documentType: doc.type || 'other',
        coverageScore: this.calculateDocumentCoverage(doc, agentResults),
        frameworkCoverage: this.calculateFrameworkCoverage(doc, agentResults),
        keyFindings: doc.summary ? [doc.summary] : [],
        recommendations: [],
        lastAnalyzed: new Date(),
      };

      return analysis;
    });
  }

  private generateTrends(currentScores: FrameworkScore[], existingTrends?: ScoreTrend[]): ScoreTrend[] {
    const trends: ScoreTrend[] = existingTrends || [];

    // Add current data point
    const currentTrend: ScoreTrend = {
      date: new Date(),
      overallScore: currentScores.length > 0
        ? Math.round(currentScores.reduce((sum, f) => sum + f.overallScore, 0) / currentScores.length)
        : 0,
      frameworkScores: currentScores.map(f => ({
        framework: f.framework,
        score: f.overallScore,
      })),
      changeFromPrevious: 0,
      changeType: 'stable',
    };

    // Calculate change from previous if available
    if (trends.length > 0) {
      const previousTrend = trends[trends.length - 1];
      currentTrend.changeFromPrevious = currentTrend.overallScore - previousTrend.overallScore;
      currentTrend.changeType =
        currentTrend.changeFromPrevious > 2 ? 'improvement' :
        currentTrend.changeFromPrevious < -2 ? 'decline' : 'stable';
    }

    return [...trends, currentTrend];
  }

  private generateVisualizationData(
    frameworkScores: FrameworkScore[],
    gaps: ComplianceGap[],
    trends: ScoreTrend[]
  ): VisualizationData {
    return {
      radarData: this.generateRadarData(frameworkScores),
      heatmapData: this.generateHeatmapData(frameworkScores),
      priorityMatrix: this.generatePriorityMatrix(gaps),
      trendData: this.generateTrendChartData(trends),
      gaugeData: this.generateGaugeData(frameworkScores),
    };
  }

  private generateRadarData(frameworkScores: FrameworkScore[]) {
    if (frameworkScores.length === 0) return [];

    // Get all unique categories
    const allCategories = new Set<string>();
    frameworkScores.forEach(fs => {
      Object.keys(fs.categoryScores).forEach(cat => allCategories.add(cat));
    });

    return frameworkScores.map(fs => {
      const data: any = { framework: fs.framework };
      allCategories.forEach(category => {
        data[category] = fs.categoryScores[category]?.percentage || 0;
      });
      return data;
    });
  }

  private generateHeatmapData(frameworkScores: FrameworkScore[]) {
    const heatmapData: any[] = [];

    frameworkScores.forEach(fs => {
      Object.entries(fs.categoryScores).forEach(([category, score]) => {
        heatmapData.push({
          framework: fs.framework,
          category,
          score: score.percentage,
          color: this.getScoreColor(score.percentage),
        });
      });
    });

    return heatmapData;
  }

  private generatePriorityMatrix(gaps: ComplianceGap[]) {
    return gaps.map(gap => ({
      gap,
      x: this.mapEffortToNumber(gap.effort),
      y: gap.impact,
      size: this.mapSeverityToSize(gap.severity),
      color: this.getSeverityColor(gap.severity),
    }));
  }

  private generateTrendChartData(trends: ScoreTrend[]) {
    return trends.map(trend => {
      const data: any = {
        date: trend.date.toISOString().split('T')[0],
        overall: trend.overallScore,
      };

      trend.frameworkScores.forEach(fs => {
        data[fs.framework] = fs.score;
      });

      return data;
    });
  }

  private generateGaugeData(frameworkScores: FrameworkScore[]) {
    return frameworkScores.map(fs => ({
      label: fs.framework,
      value: fs.overallScore,
      maxValue: fs.maxScore,
      color: this.getScoreColor(fs.percentage),
      target: 80, // Target compliance score
    }));
  }

  private generateMetadata(projectId: string, agentResults: AgentResults): ReportMetadata {
    return {
      reportId: `report-${projectId}-${Date.now()}`,
      projectId,
      generatedAt: new Date(),
      generatedBy: 'system', // Would be actual user in production
      analysisVersion: '1.0.0',
      processingTime: 0, // Would be calculated
      agentsUsed: Object.keys(agentResults).filter(key => agentResults[key as keyof AgentResults]),
      documentVersions: [], // Would include actual document versions
    };
  }

  // Helper methods
  private calculateRiskLevel(overallScore: number, criticalGaps: number, highPriorityGaps: number): 'critical' | 'high' | 'medium' | 'low' {
    if (overallScore < 40 || criticalGaps > 0) return 'critical';
    if (overallScore < 60 || highPriorityGaps > 2) return 'high';
    if (overallScore < 80) return 'medium';
    return 'low';
  }

  private calculateComplianceReadiness(overallScore: number, criticalGaps: number): 'not_ready' | 'partially_ready' | 'mostly_ready' | 'compliant' {
    if (criticalGaps > 0 || overallScore < 30) return 'not_ready';
    if (overallScore < 60) return 'partially_ready';
    if (overallScore < 85) return 'mostly_ready';
    return 'compliant';
  }

  private determinePriority(score: number): 'critical' | 'high' | 'medium' | 'low' {
    if (score < 40) return 'critical';
    if (score < 60) return 'high';
    if (score < 80) return 'medium';
    return 'low';
  }

  private determineReadinessLevel(score: number): 'not_ready' | 'partially_ready' | 'mostly_ready' | 'compliant' {
    if (score < 30) return 'not_ready';
    if (score < 60) return 'partially_ready';
    if (score < 85) return 'mostly_ready';
    return 'compliant';
  }

  private calculateDocumentCoverage(doc: any, agentResults: AgentResults): number {
    // Simple heuristic based on document having analysis results
    if (doc.summary || doc.analysis) return 85;
    if (doc.processed) return 60;
    return 30;
  }

  private calculateFrameworkCoverage(doc: any, agentResults: AgentResults) {
    // Extract frameworks from classification results instead of hardcoding
    if (agentResults.classification?.detectedFrameworks) {
      return agentResults.classification.detectedFrameworks.map((framework: any) => ({
        framework: framework.name,
        coverage: Math.round(framework.confidence * 100),
        gaps: framework.requirements?.filter((_: any, i: number) => i % 2 === 0) || [],
        strengths: framework.requirements?.filter((_: any, i: number) => i % 2 === 1) || []
      }));
    }

    // Fallback only if no classification results
    return [
      { framework: 'General Compliance', coverage: 50, gaps: ['Framework detection needed'], strengths: [] }
    ];
  }

  private estimateEffort(effort: string): number {
    switch (effort) {
      case 'low': return 8;
      case 'medium': return 24;
      case 'high': return 80;
      default: return 24;
    }
  }

  private mapEffortToNumber(effort: string): number {
    switch (effort) {
      case 'low': return 20;
      case 'medium': return 50;
      case 'high': return 80;
      default: return 50;
    }
  }

  private mapSeverityToSize(severity: string): number {
    switch (severity) {
      case 'critical': return 20;
      case 'high': return 15;
      case 'medium': return 10;
      case 'low': return 5;
      default: return 10;
    }
  }

  private getScoreColor(percentage: number): string {
    if (percentage >= 80) return '#16A34A'; // Green
    if (percentage >= 60) return '#CA8A04'; // Yellow
    if (percentage >= 40) return '#EA580C'; // Orange
    return '#DC2626'; // Red
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return '#DC2626';
      case 'high': return '#EA580C';
      case 'medium': return '#CA8A04';
      case 'low': return '#16A34A';
      default: return '#6B7280';
    }
  }

  /**
   * Generate hardcoded report data for testing mode
   */
  private generateTestingModeReportData(
    projectId: string,
    documents: any[],
    existingTrends?: ScoreTrend[]
  ): ReportData {
    // Generate hardcoded framework scores based on example.md assessment
    const frameworkScores: FrameworkScore[] = [
      {
        framework: 'ITAR',
        overallScore: 65,
        maxScore: 100,
        percentage: 65,
        confidence: 0.95,
        priority: 'critical',
        categoryScores: {
          'Export Control': { score: 45, maxScore: 100, percentage: 45 },
          'Personnel Verification': { score: 80, maxScore: 100, percentage: 80 },
          'Technical Data Protection': { score: 70, maxScore: 100, percentage: 70 }
        },
        strengths: [
          'U.S. Person verification procedures documented',
          'Technical data classification implemented'
        ],
        criticalIssues: [
          'Li Chen (foreign national) needs export license for ITAR data access',
          'International collaboration requires DDTC approval'
        ],
        readinessLevel: 'partially_ready'
      },
      {
        framework: 'CMMC Level 2',
        overallScore: 72,
        maxScore: 100,
        percentage: 72,
        confidence: 0.88,
        priority: 'critical',
        categoryScores: {
          'Access Control': { score: 80, maxScore: 100, percentage: 80 },
          'Audit & Accountability': { score: 65, maxScore: 100, percentage: 65 },
          'System Protection': { score: 75, maxScore: 100, percentage: 75 },
          'Incident Response': { score: 60, maxScore: 100, percentage: 60 }
        },
        strengths: [
          'MFA implementation verified',
          'TLS encryption with FIPS validation',
          'Least privilege IAM roles configured'
        ],
        criticalIssues: [
          'Audit log immutability gaps (WORM storage needed)',
          'Incident response plan missing DFARS reporting procedures'
        ],
        readinessLevel: 'mostly_ready'
      },
      {
        framework: 'NIST SP 800-171',
        overallScore: 68,
        maxScore: 100,
        percentage: 68,
        confidence: 0.90,
        priority: 'high',
        categoryScores: {
          'CUI Protection': { score: 70, maxScore: 100, percentage: 70 },
          'Encryption': { score: 85, maxScore: 100, percentage: 85 },
          'Access Controls': { score: 75, maxScore: 100, percentage: 75 },
          'Media Protection': { score: 45, maxScore: 100, percentage: 45 }
        },
        strengths: [
          'FIPS-validated encryption implemented',
          'CUI data classification in place',
          'Network segmentation configured'
        ],
        criticalIssues: [
          'Data Management Plan incomplete',
          'Media sanitization procedures not documented'
        ],
        readinessLevel: 'partially_ready'
      }
    ];

    // Generate hardcoded compliance gaps based on example.md test results
    const gaps: ComplianceGap[] = [
      {
        id: 'gap-foreign-national-access',
        framework: 'ITAR',
        category: 'Export Control',
        requirement: 'U.S. Person access restriction',
        description: 'Li Chen (PRC citizen) requires export license before accessing ITAR-controlled technical data',
        severity: 'critical',
        currentScore: 0,
        maxScore: 100,
        impact: 95,
        effort: 'medium',
        estimatedHours: 24,
        currentStatus: 'missing',
        evidence: [{
          source: 'Personnel Roster',
          content: 'Li Chen - Ph.D. Student, Purdue University, People\'s Republic of China, U.S. Person Status: N',
          relevance: 0.95
        }],
        recommendations: [
          'Submit DDTC export license application immediately',
          'Implement repository access controls to block foreign national access',
          'Establish temporary data segregation procedures'
        ]
      },
      {
        id: 'gap-audit-immutability',
        framework: 'CMMC Level 2',
        category: 'Audit & Accountability',
        requirement: 'AU-02 Log immutability',
        description: 'Audit log immutability not verified - WORM storage implementation needed',
        severity: 'high',
        currentScore: 40,
        maxScore: 100,
        impact: 75,
        effort: 'high',
        estimatedHours: 80,
        currentStatus: 'partial',
        evidence: [{
          source: 'Test Results AU-02',
          content: 'Partial implementation - WORM storage not verified, monitoring for drift needed',
          relevance: 0.88
        }],
        recommendations: [
          'Enable object lock/WORM on audit log storage',
          'Update SIEM parsers for immutable log format',
          'Implement drift monitoring for configuration changes'
        ]
      },
      {
        id: 'gap-incident-response',
        framework: 'CMMC Level 2',
        category: 'Incident Response',
        requirement: 'IR-01 DFARS reporting',
        description: 'Incident response plan missing DIBNet reporting procedures and 72-hour timeline',
        severity: 'high',
        currentScore: 60,
        maxScore: 100,
        impact: 70,
        effort: 'medium',
        estimatedHours: 24,
        currentStatus: 'partial',
        evidence: [{
          source: 'IR Plan Review',
          content: 'Plan exists but lacks DFARS 252.204-7012 specific reporting requirements',
          relevance: 0.82
        }],
        recommendations: [
          'Update IR plan with DIBNet reporting procedures',
          'Add 72-hour reporting timeline requirements',
          'Conduct tabletop exercise to test procedures'
        ]
      },
      {
        id: 'gap-data-management-plan',
        framework: 'NIST SP 800-171',
        category: 'Data Management',
        requirement: 'Complete DMP for CUI',
        description: 'Data Management Plan incomplete - missing SSP references and media sanitization procedures',
        severity: 'medium',
        currentScore: 45,
        maxScore: 100,
        impact: 60,
        effort: 'medium',
        estimatedHours: 24,
        currentStatus: 'partial',
        evidence: [{
          source: 'DMP Review',
          content: 'Document incomplete - lacks incident response plan, logging requirements, and media sanitization sections',
          relevance: 0.75
        }],
        recommendations: [
          'Complete missing DMP sections per NIST 800-171 requirements',
          'Add System Security Plan (SSP) references',
          'Document media sanitization procedures per NIST 800-88'
        ]
      }
    ];

    // Generate overview
    const overview = this.generateOverview(frameworkScores, gaps, documents);

    // Generate document analysis
    const documentAnalysis: DocumentAnalysis[] = documents.map(doc => ({
      documentId: doc.id || 'example-md',
      documentName: doc.name || 'Project AETHER WATCH Compliance Assessment',
      documentType: doc.type || 'compliance_assessment',
      coverageScore: 85,
      frameworkCoverage: [
        { framework: 'ITAR', coverage: 95, gaps: ['Export license procedures'], strengths: ['Personnel verification', 'Technical data classification'] },
        { framework: 'CMMC Level 2', coverage: 80, gaps: ['Log immutability', 'IR procedures'], strengths: ['Access controls', 'Encryption'] },
        { framework: 'NIST SP 800-171', coverage: 75, gaps: ['DMP completion', 'Media sanitization'], strengths: ['CUI classification', 'Network security'] }
      ],
      keyFindings: [
        'ITAR export control requirements identified for international collaboration',
        'CMMC Level 2 controls mostly implemented with specific gaps',
        'CUI protection measures in place but policy documentation incomplete'
      ],
      recommendations: [
        'Immediate: Submit export license for Li Chen access',
        'High priority: Implement audit log immutability',
        'Medium priority: Complete Data Management Plan'
      ],
      lastAnalyzed: new Date()
    }));

    // Generate trends
    const trends = this.generateTrends(frameworkScores, existingTrends);

    // Generate visualizations
    const visualizations = this.generateVisualizationData(frameworkScores, gaps, trends);

    // Generate metadata
    const metadata: ReportMetadata = {
      reportId: `testing-report-${projectId}-${Date.now()}`,
      projectId,
      generatedAt: new Date(),
      generatedBy: 'testing-mode',
      analysisVersion: '1.0.0-testing',
      processingTime: 150, // Simulated processing time
      agentsUsed: ['classification', 'grading', 'improvement', 'ideation'],
      documentVersions: documents.map(doc => ({ id: doc.id || 'example-md', version: '1.0.0' }))
    };

    return {
      overview,
      frameworkScores,
      gaps,
      documentAnalysis,
      trends,
      visualizations,
      metadata
    };
  }
}

export const reportService = ReportService.getInstance();