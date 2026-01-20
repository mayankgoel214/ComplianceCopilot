import { BaseAgent } from '../base/base-agent';
import { AgentMetadata, AgentInput } from '../base/types';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { Tool } from '@langchain/core/tools';
import { DocumentAnalysisTool, VectorRetrievalTool, getAgentTools } from '../tools';
import { z } from 'zod';

export interface GraderInput {
  frameworks: Array<{
    name: string;
    confidence: number;
    priority: 'critical' | 'high' | 'medium' | 'low';
  }>;
  projectDocuments: Array<{
    id: string;
    content: string;
    type: 'policy' | 'procedure' | 'form' | 'code' | 'other';
  }>;
  implementationDetails?: {
    existingPolicies: string[];
    securityMeasures: string[];
    dataHandlingPractices: string[];
    accessControls: string[];
  };
}

export interface ComplianceGap {
  requirement: string;
  framework: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  currentStatus: 'missing' | 'partial' | 'inadequate' | 'needs_review';
  evidence: string[];
  impact: string;
  effort: 'low' | 'medium' | 'high';
}

export interface FrameworkScore {
  framework: string;
  overallScore: number; // 0-100
  breakdown: {
    dataProtection: number;
    accessControls: number;
    documentation: number;
    procedures: number;
    monitoring: number;
  };
  gaps: ComplianceGap[];
  strengths: string[];
  criticalIssues: string[];
  readinessLevel: 'not_ready' | 'partially_ready' | 'mostly_ready' | 'compliant';
}

export interface GraderOutput {
  overallComplianceScore: number; // Weighted average across all frameworks
  frameworkScores: FrameworkScore[];
  prioritizedGaps: ComplianceGap[];
  complianceRoadmap: {
    quickWins: ComplianceGap[];
    criticalPath: ComplianceGap[];
    longTermGoals: ComplianceGap[];
  };
  riskAssessment: {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: string[];
    mitigationPriority: string[];
  };
  certificationReadiness: Record<string, {
    readiness: number; // 0-100
    blockers: string[];
    timeline: string;
  }>;
}

const GraderInputSchema = z.object({
  frameworks: z.array(z.object({
    name: z.string(),
    confidence: z.number(),
    priority: z.enum(['critical', 'high', 'medium', 'low'])
  })),
  projectDocuments: z.array(z.object({
    id: z.string(),
    content: z.string(),
    type: z.enum(['policy', 'procedure', 'form', 'code', 'other'])
  })),
  implementationDetails: z.object({
    existingPolicies: z.array(z.string()),
    securityMeasures: z.array(z.string()),
    dataHandlingPractices: z.array(z.string()),
    accessControls: z.array(z.string())
  }).optional()
});

export class GraderAgent extends BaseAgent<GraderInput, GraderOutput> {
  private frameworkRequirements: Record<string, any>;

  constructor(projectId: string) {
    const metadata: AgentMetadata = {
      id: `grader-agent-${projectId}`,
      name: 'Compliance Grader Agent',
      description: 'Analyzes compliance gaps and assigns detailed scores across multiple frameworks',
      version: '1.0.0',
      capabilities: [
        {
          name: 'compliance_analysis',
          description: 'Analyze documents and implementation against compliance frameworks',
          inputSchema: GraderInputSchema,
          outputSchema: z.object({
            overallComplianceScore: z.number(),
            frameworkScores: z.array(z.object({
              framework: z.string(),
              overallScore: z.number(),
              breakdown: z.object({
                dataProtection: z.number(),
                accessControls: z.number(),
                documentation: z.number(),
                procedures: z.number(),
                monitoring: z.number()
              })
            }))
          })
        }
      ],
      dependencies: ['document-analysis', 'vector-retrieval'],
      tags: ['grading', 'compliance', 'scoring', 'analysis', projectId]
    };

    super(metadata);
    this.frameworkRequirements = this.initializeFrameworkRequirements();
  }

  protected async initializeTools(): Promise<Tool[]> {
    return getAgentTools(this.metadata.id);
  }

  protected createPrompt(): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([
      ['system', `You are a compliance grading specialist who evaluates projects against specific compliance frameworks.

GRADING APPROACH:
1. Analyze each framework systematically using document analysis
2. Score 5 key areas: Data Protection, Access Controls, Documentation, Procedures, Monitoring
3. Identify specific gaps with severity levels
4. Calculate weighted scores based on framework priority
5. Create actionable remediation roadmap

SCORING SCALE (0-100):
- 90-100: Fully compliant, ready for certification
- 75-89: Mostly compliant, minor gaps
- 60-74: Partially compliant, moderate gaps
- 40-59: Basic compliance, significant work needed
- 0-39: Non-compliant, major implementation required

GAP SEVERITY:
- CRITICAL: Legal/regulatory violation risk, immediate action required
- HIGH: Significant compliance risk, address within 30 days
- MEDIUM: Moderate risk, address within 90 days
- LOW: Minor risk, address within 6 months

EVIDENCE-BASED SCORING:
- Base scores on actual document content and implementation details
- Use vector search to find compliance best practices
- Cross-reference requirements with documented practices
- Flag assumptions and areas needing clarification

PROVIDE: Detailed framework scores, prioritized gaps, and practical remediation roadmap.`],
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad')
    ]);
  }

  protected async preprocessInput(input: AgentInput<GraderInput>): Promise<AgentInput<GraderInput>> {
    const validatedData = GraderInputSchema.parse(input.data);
    return { ...input, data: validatedData };
  }

  protected async postprocessOutput(result: any, input: AgentInput<GraderInput>): Promise<GraderOutput> {
    try {
      const aiResponse = result.output || result.text || '';
      let frameworkScores: FrameworkScore[] = [];

      // First try to parse scores from AI response
      if (aiResponse && aiResponse.trim()) {
        frameworkScores = await this.parseFrameworkScoresFromAI(aiResponse, input.data);
      }

      // If AI parsing failed or returned insufficient data, supplement with analysis
      if (frameworkScores.length === 0) {
        console.log('AI returned no framework scores, using fallback analysis');
        frameworkScores = await this.analyzeFrameworks(input.data);
      } else {
        // Enhance AI-parsed scores with additional analysis where needed
        for (const score of frameworkScores) {
          if (score.gaps.length === 0) {
            const additionalGaps = await this.identifyGaps(score.framework, score.breakdown, input.data.projectDocuments, input.data.implementationDetails);
            score.gaps = additionalGaps;
          }
        }
      }

      const overallScore = this.calculateOverallScore(frameworkScores);
      const prioritizedGaps = this.prioritizeGaps(frameworkScores);
      const roadmap = this.createComplianceRoadmap(prioritizedGaps);
      const riskAssessment = this.assessOverallRisk(frameworkScores);
      const certificationReadiness = this.assessCertificationReadiness(frameworkScores);

      return {
        overallComplianceScore: overallScore,
        frameworkScores,
        prioritizedGaps,
        complianceRoadmap: roadmap,
        riskAssessment,
        certificationReadiness
      };
    } catch (error) {
      console.error('Error in grader postprocessing:', error);
      // Return fallback response
      return this.createFallbackGraderResponse(input.data);
    }
  }

  protected formatInputForAgent(input: AgentInput<GraderInput>): string {
    const { frameworks, projectDocuments, implementationDetails } = input.data;

    const frameworkList = frameworks.map(f => `${f.name} (Priority: ${f.priority}, Confidence: ${f.confidence})`).join('\n');
    const documentSummary = projectDocuments.map(d => `${d.type}: ${d.content.substring(0, 100)}...`).join('\n');
    const implementationSummary = implementationDetails ? `
EXISTING POLICIES: ${implementationDetails.existingPolicies.join(', ')}
SECURITY MEASURES: ${implementationDetails.securityMeasures.join(', ')}
DATA HANDLING: ${implementationDetails.dataHandlingPractices.join(', ')}
ACCESS CONTROLS: ${implementationDetails.accessControls.join(', ')}` : 'No implementation details provided';

    return `COMPLIANCE GRADING REQUEST:

FRAMEWORKS TO EVALUATE:
${frameworkList}

PROJECT DOCUMENTS:
${documentSummary}

IMPLEMENTATION DETAILS:${implementationSummary}

Please analyze each framework systematically, providing detailed scores and gap analysis. Use document analysis tools to examine the provided content and vector retrieval to find relevant compliance requirements.`;
  }

  private async analyzeFrameworks(input: GraderInput): Promise<FrameworkScore[]> {
    const frameworkScores: FrameworkScore[] = [];

    for (const framework of input.frameworks) {
      const score = await this.analyzeFramework(framework, input.projectDocuments, input.implementationDetails);
      frameworkScores.push(score);
    }

    return frameworkScores;
  }

  private async analyzeFramework(
    framework: { name: string; confidence: number; priority: string },
    documents: GraderInput['projectDocuments'],
    implementation?: GraderInput['implementationDetails']
  ): Promise<FrameworkScore> {
    const requirements = this.frameworkRequirements[framework.name] || this.frameworkRequirements['General'];

    // Analyze each compliance area
    const breakdown = {
      dataProtection: await this.scoreDataProtection(framework.name, documents, implementation),
      accessControls: await this.scoreAccessControls(framework.name, documents, implementation),
      documentation: await this.scoreDocumentation(framework.name, documents),
      procedures: await this.scoreProcedures(framework.name, documents, implementation),
      monitoring: await this.scoreMonitoring(framework.name, documents, implementation)
    };

    // Calculate weighted overall score
    const weights = { dataProtection: 0.25, accessControls: 0.25, documentation: 0.2, procedures: 0.2, monitoring: 0.1 };
    const overallScore = Object.entries(breakdown).reduce((sum, [area, score]) => {
      return sum + (score * weights[area as keyof typeof weights]);
    }, 0);

    // Identify gaps
    const gaps = await this.identifyGaps(framework.name, breakdown, documents, implementation);

    // Identify strengths
    const strengths = this.identifyStrengths(breakdown, requirements);

    // Identify critical issues
    const criticalIssues = gaps.filter(gap => gap.severity === 'critical').map(gap => gap.requirement);

    // Determine readiness level
    const readinessLevel = this.determineReadinessLevel(overallScore, gaps);

    return {
      framework: framework.name,
      overallScore: Math.round(overallScore),
      breakdown,
      gaps,
      strengths,
      criticalIssues,
      readinessLevel
    };
  }

  private async scoreDataProtection(
    framework: string,
    documents: GraderInput['projectDocuments'],
    implementation?: GraderInput['implementationDetails']
  ): Promise<number> {
    let score = 0;
    const maxScore = 100;

    // Check for encryption policies
    const hasEncryption = documents.some(doc =>
      doc.content.toLowerCase().includes('encrypt') ||
      implementation?.securityMeasures.some(measure => measure.toLowerCase().includes('encrypt'))
    );
    if (hasEncryption) score += 20;

    // Check for data classification
    const hasClassification = documents.some(doc =>
      doc.content.toLowerCase().includes('classification') ||
      doc.content.toLowerCase().includes('sensitive')
    );
    if (hasClassification) score += 15;

    // Check for retention policies
    const hasRetention = documents.some(doc =>
      doc.content.toLowerCase().includes('retention') ||
      doc.content.toLowerCase().includes('delete')
    );
    if (hasRetention) score += 20;

    // Check for privacy notices
    const hasPrivacyNotice = documents.some(doc =>
      doc.content.toLowerCase().includes('privacy') ||
      doc.content.toLowerCase().includes('notice')
    );
    if (hasPrivacyNotice) score += 15;

    // Framework-specific checks
    if (framework === 'FERPA' || framework === 'GDPR') {
      const hasConsent = documents.some(doc => doc.content.toLowerCase().includes('consent'));
      if (hasConsent) score += 20;
    }

    if (framework === 'HIPAA') {
      const hasBaa = documents.some(doc => doc.content.toLowerCase().includes('business associate'));
      if (hasBaa) score += 10;
    }

    return Math.min(score, maxScore);
  }

  private async scoreAccessControls(
    framework: string,
    documents: GraderInput['projectDocuments'],
    implementation?: GraderInput['implementationDetails']
  ): Promise<number> {
    let score = 0;
    const maxScore = 100;

    // Check for authentication requirements
    const hasAuth = documents.some(doc =>
      doc.content.toLowerCase().includes('authentication') ||
      implementation?.accessControls.some(control => control.toLowerCase().includes('auth'))
    );
    if (hasAuth) score += 25;

    // Check for authorization/role-based access
    const hasRbac = documents.some(doc =>
      doc.content.toLowerCase().includes('role') ||
      doc.content.toLowerCase().includes('authorization')
    );
    if (hasRbac) score += 25;

    // Check for audit logging
    const hasAuditLogs = documents.some(doc =>
      doc.content.toLowerCase().includes('audit') ||
      doc.content.toLowerCase().includes('log')
    );
    if (hasAuditLogs) score += 25;

    // Check for access reviews
    const hasAccessReview = documents.some(doc =>
      doc.content.toLowerCase().includes('access review') ||
      doc.content.toLowerCase().includes('periodic review')
    );
    if (hasAccessReview) score += 25;

    return Math.min(score, maxScore);
  }

  private async scoreDocumentation(framework: string, documents: GraderInput['projectDocuments']): Promise<number> {
    let score = 0;
    const maxScore = 100;

    // Check document types
    const hasPolicies = documents.some(doc => doc.type === 'policy');
    if (hasPolicies) score += 30;

    const hasProcedures = documents.some(doc => doc.type === 'procedure');
    if (hasProcedures) score += 30;

    const hasForms = documents.some(doc => doc.type === 'form');
    if (hasForms) score += 20;

    // Check for completeness
    const totalDocLength = documents.reduce((sum, doc) => sum + doc.content.length, 0);
    if (totalDocLength > 5000) score += 20; // Substantial documentation

    return Math.min(score, maxScore);
  }

  private async scoreProcedures(
    framework: string,
    documents: GraderInput['projectDocuments'],
    implementation?: GraderInput['implementationDetails']
  ): Promise<number> {
    let score = 0;
    const maxScore = 100;

    // Check for incident response procedures
    const hasIncidentResponse = documents.some(doc =>
      doc.content.toLowerCase().includes('incident') ||
      doc.content.toLowerCase().includes('breach')
    );
    if (hasIncidentResponse) score += 25;

    // Check for training procedures
    const hasTraining = documents.some(doc =>
      doc.content.toLowerCase().includes('training') ||
      doc.content.toLowerCase().includes('education')
    );
    if (hasTraining) score += 20;

    // Check for change management
    const hasChangeManagement = documents.some(doc =>
      doc.content.toLowerCase().includes('change') ||
      doc.content.toLowerCase().includes('update')
    );
    if (hasChangeManagement) score += 20;

    // Check for vendor management
    const hasVendorManagement = documents.some(doc =>
      doc.content.toLowerCase().includes('vendor') ||
      doc.content.toLowerCase().includes('third party')
    );
    if (hasVendorManagement) score += 20;

    // Check for backup procedures
    const hasBackup = documents.some(doc =>
      doc.content.toLowerCase().includes('backup') ||
      doc.content.toLowerCase().includes('recovery')
    );
    if (hasBackup) score += 15;

    return Math.min(score, maxScore);
  }

  private async scoreMonitoring(
    framework: string,
    documents: GraderInput['projectDocuments'],
    implementation?: GraderInput['implementationDetails']
  ): Promise<number> {
    let score = 0;
    const maxScore = 100;

    // Check for monitoring procedures
    const hasMonitoring = documents.some(doc =>
      doc.content.toLowerCase().includes('monitor') ||
      doc.content.toLowerCase().includes('surveillance')
    );
    if (hasMonitoring) score += 30;

    // Check for audit procedures
    const hasAudit = documents.some(doc =>
      doc.content.toLowerCase().includes('audit')
    );
    if (hasAudit) score += 30;

    // Check for reporting procedures
    const hasReporting = documents.some(doc =>
      doc.content.toLowerCase().includes('report') ||
      doc.content.toLowerCase().includes('notification')
    );
    if (hasReporting) score += 25;

    // Check for metrics/KPIs
    const hasMetrics = documents.some(doc =>
      doc.content.toLowerCase().includes('metric') ||
      doc.content.toLowerCase().includes('measure')
    );
    if (hasMetrics) score += 15;

    return Math.min(score, maxScore);
  }

  private async identifyGaps(
    framework: string,
    breakdown: FrameworkScore['breakdown'],
    documents: GraderInput['projectDocuments'],
    implementation?: GraderInput['implementationDetails']
  ): Promise<ComplianceGap[]> {
    const gaps: ComplianceGap[] = [];
    const requirements = this.frameworkRequirements[framework] || this.frameworkRequirements['General'];

    // Check each compliance area for gaps
    for (const [area, score] of Object.entries(breakdown)) {
      if (score < 60) { // Significant gap
        const areaRequirements = requirements[area] || [];
        for (const requirement of areaRequirements) {
          gaps.push({
            requirement,
            framework,
            severity: this.determineSeverity(score, framework),
            currentStatus: this.determineStatus(score),
            evidence: this.findEvidence(requirement, documents),
            impact: this.describeImpact(requirement, framework),
            effort: this.estimateEffort(requirement)
          });
        }
      }
    }

    return gaps;
  }

  private identifyStrengths(breakdown: FrameworkScore['breakdown'], requirements: any): string[] {
    const strengths = [];
    for (const [area, score] of Object.entries(breakdown)) {
      if (score >= 80) {
        strengths.push(`Strong ${area.replace(/([A-Z])/g, ' $1').toLowerCase()} implementation`);
      }
    }
    return strengths;
  }

  private determineReadinessLevel(score: number, gaps: ComplianceGap[]): FrameworkScore['readinessLevel'] {
    const criticalGaps = gaps.filter(gap => gap.severity === 'critical').length;

    if (score >= 90 && criticalGaps === 0) return 'compliant';
    if (score >= 75 && criticalGaps === 0) return 'mostly_ready';
    if (score >= 60) return 'partially_ready';
    return 'not_ready';
  }

  private determineSeverity(score: number, framework: string): ComplianceGap['severity'] {
    if (score < 40) return 'critical';
    if (score < 60) return 'high';
    if (score < 80) return 'medium';
    return 'low';
  }

  private determineStatus(score: number): ComplianceGap['currentStatus'] {
    if (score === 0) return 'missing';
    if (score < 50) return 'inadequate';
    if (score < 80) return 'partial';
    return 'needs_review';
  }

  private findEvidence(requirement: string, documents: GraderInput['projectDocuments']): string[] {
    return documents
      .filter(doc => doc.content.toLowerCase().includes(requirement.toLowerCase().split(' ')[0]))
      .map(doc => `Found in ${doc.type}: ${doc.content.substring(0, 100)}...`);
  }

  private describeImpact(requirement: string, framework: string): string {
    return `Non-compliance with ${requirement} may result in ${framework} violations and potential penalties`;
  }

  private estimateEffort(requirement: string): ComplianceGap['effort'] {
    const lowEffortKeywords = ['document', 'policy', 'notice'];
    const highEffortKeywords = ['implement', 'system', 'infrastructure'];

    const reqLower = requirement.toLowerCase();
    if (lowEffortKeywords.some(keyword => reqLower.includes(keyword))) return 'low';
    if (highEffortKeywords.some(keyword => reqLower.includes(keyword))) return 'high';
    return 'medium';
  }

  private calculateOverallScore(frameworkScores: FrameworkScore[]): number {
    if (frameworkScores.length === 0) return 0;

    const weightedSum = frameworkScores.reduce((sum, fs) => {
      const weight = fs.framework === 'FERPA' || fs.framework === 'HIPAA' ? 1.5 : 1.0;
      return sum + (fs.overallScore * weight);
    }, 0);

    const totalWeight = frameworkScores.reduce((sum, fs) => {
      return sum + (fs.framework === 'FERPA' || fs.framework === 'HIPAA' ? 1.5 : 1.0);
    }, 0);

    return Math.round(weightedSum / totalWeight);
  }

  private prioritizeGaps(frameworkScores: FrameworkScore[]): ComplianceGap[] {
    const allGaps = frameworkScores.flatMap(fs => fs.gaps);

    return allGaps.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const effortOrder = { low: 3, medium: 2, high: 1 };

      const aPriority = severityOrder[a.severity] * effortOrder[a.effort];
      const bPriority = severityOrder[b.severity] * effortOrder[b.effort];

      return bPriority - aPriority;
    });
  }

  private createComplianceRoadmap(gaps: ComplianceGap[]): GraderOutput['complianceRoadmap'] {
    return {
      quickWins: gaps.filter(gap => gap.effort === 'low' && gap.severity !== 'low').slice(0, 5),
      criticalPath: gaps.filter(gap => gap.severity === 'critical' || gap.severity === 'high').slice(0, 8),
      longTermGoals: gaps.filter(gap => gap.effort === 'high').slice(0, 5)
    };
  }

  private assessOverallRisk(frameworkScores: FrameworkScore[]): GraderOutput['riskAssessment'] {
    const criticalIssues = frameworkScores.flatMap(fs => fs.criticalIssues);
    const averageScore = frameworkScores.reduce((sum, fs) => sum + fs.overallScore, 0) / frameworkScores.length;

    let overallRisk: 'low' | 'medium' | 'high' | 'critical';
    if (criticalIssues.length > 0 || averageScore < 40) {
      overallRisk = 'critical';
    } else if (averageScore < 60) {
      overallRisk = 'high';
    } else if (averageScore < 80) {
      overallRisk = 'medium';
    } else {
      overallRisk = 'low';
    }

    return {
      overallRisk,
      riskFactors: criticalIssues,
      mitigationPriority: criticalIssues.slice(0, 3)
    };
  }

  private assessCertificationReadiness(frameworkScores: FrameworkScore[]): GraderOutput['certificationReadiness'] {
    const readiness: Record<string, any> = {};

    for (const fs of frameworkScores) {
      readiness[fs.framework] = {
        readiness: fs.overallScore,
        blockers: fs.criticalIssues,
        timeline: this.estimateTimeline(fs.overallScore, fs.gaps)
      };
    }

    return readiness;
  }

  private estimateTimeline(score: number, gaps: ComplianceGap[]): string {
    const criticalGaps = gaps.filter(g => g.severity === 'critical').length;
    const highGaps = gaps.filter(g => g.severity === 'high').length;

    if (score >= 90) return '1-2 weeks';
    if (score >= 75) return '4-6 weeks';
    if (criticalGaps > 3) return '6+ months';
    if (highGaps > 5) return '3-6 months';
    return '2-3 months';
  }

  private initializeFrameworkRequirements(): Record<string, any> {
    return {
      'FERPA': {
        dataProtection: ['Student consent management', 'Educational record encryption', 'Data minimization'],
        accessControls: ['Role-based access to educational records', 'Authentication requirements', 'Audit logging'],
        documentation: ['FERPA compliance policy', 'Student privacy procedures', 'Consent forms'],
        procedures: ['Incident response for data breaches', 'Annual compliance training', 'Record retention procedures'],
        monitoring: ['Compliance monitoring program', 'Regular access reviews', 'Violation reporting']
      },
      'HIPAA': {
        dataProtection: ['PHI encryption at rest and in transit', 'Data backup and recovery', 'Secure disposal'],
        accessControls: ['Unique user identification', 'Role-based access controls', 'Audit controls'],
        documentation: ['Security policies and procedures', 'Business associate agreements', 'Risk assessments'],
        procedures: ['Incident response procedures', 'Workforce training', 'Contingency planning'],
        monitoring: ['Regular security evaluations', 'Audit logging and monitoring', 'Compliance reporting']
      },
      'General': {
        dataProtection: ['Data classification', 'Encryption standards', 'Retention policies'],
        accessControls: ['Authentication mechanisms', 'Authorization controls', 'Access reviews'],
        documentation: ['Security policies', 'Procedures documentation', 'Forms and templates'],
        procedures: ['Incident response', 'Training programs', 'Change management'],
        monitoring: ['Security monitoring', 'Audit procedures', 'Compliance reporting']
      }
    };
  }

  private async parseFrameworkScoresFromAI(aiResponse: string, input: GraderInput): Promise<FrameworkScore[]> {
    try {
      const frameworkScores: FrameworkScore[] = [];
      const frameworks = input.frameworks.map(f => f.name);

      for (const framework of frameworks) {
        const score = await this.extractFrameworkScoreFromResponse(aiResponse, framework, input);
        if (score) {
          frameworkScores.push(score);
        }
      }

      return frameworkScores;
    } catch (error) {
      console.error('Error parsing AI framework scores:', error);
      return [];
    }
  }

  private async extractFrameworkScoreFromResponse(aiResponse: string, frameworkName: string, input: GraderInput): Promise<FrameworkScore | null> {
    try {
      const lowerResponse = aiResponse.toLowerCase();
      const lowerFramework = frameworkName.toLowerCase();

      // Look for framework-specific sections in the response
      const frameworkSection = this.extractFrameworkSection(aiResponse, frameworkName);

      // Extract overall score for the framework
      const overallScore = this.extractOverallScore(frameworkSection || aiResponse, frameworkName);

      // Extract breakdown scores
      const breakdown = this.extractBreakdownScores(frameworkSection || aiResponse, frameworkName);

      // Extract gaps mentioned in the AI response
      const gaps = this.extractGapsFromAIResponse(frameworkSection || aiResponse, frameworkName);

      // Extract strengths and issues
      const strengths = this.extractStrengths(frameworkSection || aiResponse, frameworkName);
      const criticalIssues = this.extractCriticalIssues(frameworkSection || aiResponse, frameworkName);

      // Determine readiness level
      const readinessLevel = this.determineReadinessLevel(overallScore, gaps);

      return {
        framework: frameworkName,
        overallScore,
        breakdown,
        gaps,
        strengths,
        criticalIssues,
        readinessLevel
      };
    } catch (error) {
      console.error(`Error extracting score for ${frameworkName}:`, error);
      return null;
    }
  }

  private extractFrameworkSection(response: string, frameworkName: string): string | null {
    const patterns = [
      new RegExp(`${frameworkName}[\\s\\S]*?(?=${frameworkName}|$)`, 'i'),
      new RegExp(`## ${frameworkName}[\\s\\S]*?(?=## |$)`, 'i'),
      new RegExp(`\\*\\*${frameworkName}\\*\\*[\\s\\S]*?(?=\\*\\*|$)`, 'i')
    ];

    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match && match[0].length > 50) {
        return match[0];
      }
    }

    return null;
  }

  private extractOverallScore(text: string, frameworkName: string): number {
    // Look for score patterns like "score: 75", "75/100", "75%"
    const scorePatterns = [
      new RegExp(`${frameworkName}[^\\d]*?(\\d{1,3})(?:/100|%|\\s*(?:out of|score))`, 'gi'),
      new RegExp(`(?:score|rating|grade)[^\\d]*?(\\d{1,3})(?:/100|%|\\s*(?:out of 100))`, 'gi'),
      new RegExp(`(\\d{1,3})(?:/100|%)`, 'g'),
      new RegExp(`(?:overall|total|final)[^\\d]*?(\\d{1,3})`, 'gi')
    ];

    for (const pattern of scorePatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const score = parseInt(match[1]);
        if (score >= 0 && score <= 100) {
          return score;
        }
      }
    }

    // If no score found, estimate based on content sentiment
    return this.estimateScoreFromSentiment(text);
  }

  private extractBreakdownScores(text: string, frameworkName: string): FrameworkScore['breakdown'] {
    const breakdown = {
      dataProtection: 0,
      accessControls: 0,
      documentation: 0,
      procedures: 0,
      monitoring: 0
    };

    const areaPatterns = {
      dataProtection: /data\s*protection[^\\d]*?(\\d{1,3})/i,
      accessControls: /access\s*control[^\\d]*?(\\d{1,3})/i,
      documentation: /documentation[^\\d]*?(\\d{1,3})/i,
      procedures: /procedures?[^\\d]*?(\\d{1,3})/i,
      monitoring: /monitoring[^\\d]*?(\\d{1,3})/i
    };

    for (const [area, pattern] of Object.entries(areaPatterns)) {
      const match = text.match(pattern);
      if (match) {
        const score = parseInt(match[1]);
        if (score >= 0 && score <= 100) {
          breakdown[area as keyof typeof breakdown] = score;
        }
      }
    }

    // Fill in missing scores with estimates
    const avgScore = Object.values(breakdown).reduce((sum, score) => sum + score, 0) / 5;
    for (const [area, score] of Object.entries(breakdown)) {
      if (score === 0) {
        breakdown[area as keyof typeof breakdown] = Math.round(avgScore);
      }
    }

    return breakdown;
  }

  private extractGapsFromAIResponse(text: string, frameworkName: string): ComplianceGap[] {
    const gaps: ComplianceGap[] = [];

    // Look for gap-related keywords and extract issues
    const gapPatterns = [
      /(?:gap|issue|problem|missing|lacking|insufficient|needs?)[^.]*?([^.]+)/gi,
      /(?:recommendation|improve|implement|add)[^.]*?([^.]+)/gi
    ];

    let gapIndex = 0;
    for (const pattern of gapPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 10) {
          const requirement = match[1].trim();
          const severity = this.determineSeverityFromText(match[0]);

          gaps.push({
            requirement,
            framework: frameworkName,
            severity,
            currentStatus: 'missing',
            evidence: [`Found in AI analysis: ${match[0].substring(0, 100)}...`],
            impact: `Non-compliance with ${requirement} may result in ${frameworkName} violations`,
            effort: this.estimateEffort(requirement)
          });

          gapIndex++;
          if (gapIndex >= 5) break; // Limit to 5 gaps per framework
        }
      }
      if (gapIndex >= 5) break;
    }

    return gaps;
  }

  private extractStrengths(text: string, frameworkName: string): string[] {
    const strengths: string[] = [];
    const strengthPatterns = [
      /(?:strong|good|excellent|adequate|compliant|implemented)[^.]*?([^.]+)/gi,
      /(?:strength|advantage|positive)[^.]*?([^.]+)/gi
    ];

    for (const pattern of strengthPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 10) {
          strengths.push(match[1].trim());
        }
      }
    }

    return strengths.slice(0, 3);
  }

  private extractCriticalIssues(text: string, frameworkName: string): string[] {
    const issues: string[] = [];
    const criticalPatterns = [
      /(?:critical|severe|major|urgent|immediate)[^.]*?([^.]+)/gi,
      /(?:violation|breach|non-compliant)[^.]*?([^.]+)/gi
    ];

    for (const pattern of criticalPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 10) {
          issues.push(match[1].trim());
        }
      }
    }

    return issues.slice(0, 3);
  }

  private estimateScoreFromSentiment(text: string): number {
    const positiveWords = ['good', 'excellent', 'compliant', 'adequate', 'strong', 'implemented'];
    const negativeWords = ['poor', 'missing', 'lacking', 'insufficient', 'weak', 'non-compliant'];

    const lowerText = text.toLowerCase();
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;

    const sentiment = positiveCount - negativeCount;

    // Base score of 50, adjust based on sentiment
    let score = 50;
    score += sentiment * 10;

    return Math.max(0, Math.min(100, score));
  }

  private determineSeverityFromText(text: string): ComplianceGap['severity'] {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('critical') || lowerText.includes('severe') || lowerText.includes('urgent')) {
      return 'critical';
    } else if (lowerText.includes('major') || lowerText.includes('important') || lowerText.includes('significant')) {
      return 'high';
    } else if (lowerText.includes('minor') || lowerText.includes('low')) {
      return 'low';
    } else {
      return 'medium';
    }
  }

  private createFallbackGraderResponse(input: GraderInput): GraderOutput {
    return {
      overallComplianceScore: 50,
      frameworkScores: [{
        framework: 'General',
        overallScore: 50,
        breakdown: {
          dataProtection: 50,
          accessControls: 50,
          documentation: 50,
          procedures: 50,
          monitoring: 50
        },
        gaps: [{
          requirement: 'General compliance review needed',
          framework: 'General',
          severity: 'medium',
          currentStatus: 'needs_review',
          evidence: ['Fallback analysis due to AI processing error'],
          impact: 'May not meet compliance requirements',
          effort: 'medium'
        }],
        strengths: ['Basic project structure in place'],
        criticalIssues: [],
        readinessLevel: 'partially_ready'
      }],
      prioritizedGaps: [],
      complianceRoadmap: {
        quickWins: [],
        criticalPath: [],
        longTermGoals: []
      },
      riskAssessment: {
        overallRisk: 'medium',
        riskFactors: ['Incomplete compliance analysis'],
        mitigationPriority: ['Conduct thorough compliance review']
      },
      certificationReadiness: {
        'General': {
          readiness: 50,
          blockers: ['Analysis incomplete'],
          timeline: 'TBD'
        }
      }
    };
  }
}