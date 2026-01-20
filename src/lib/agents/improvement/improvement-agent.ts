import { BaseAgent } from '../base/base-agent';
import { AgentMetadata, AgentInput } from '../base/types';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { Tool } from '@langchain/core/tools';
import { WebSearchTool, VectorRetrievalTool, getAgentTools } from '../tools';
import { ComplianceGap, FrameworkScore } from '../grader/grader-agent';
import { z } from 'zod';

export interface ImprovementInput {
  frameworkScores: FrameworkScore[];
  prioritizedGaps: ComplianceGap[];
  projectContext: {
    type: 'academic' | 'research' | 'commercial' | 'government';
    size: 'small' | 'medium' | 'large';
    budget: 'limited' | 'moderate' | 'ample';
    timeline: 'urgent' | 'normal' | 'flexible';
    resources: {
      technical: 'low' | 'medium' | 'high';
      legal: 'low' | 'medium' | 'high';
      administrative: 'low' | 'medium' | 'high';
    };
  };
  preferences?: {
    prioritizeQuickWins: boolean;
    focusOnCritical: boolean;
    includeTraining: boolean;
    includeAutomation: boolean;
  };
}

export interface ImprovementRecommendation {
  id: string;
  title: string;
  description: string;
  category: 'policy' | 'process' | 'technology' | 'training' | 'documentation';
  priority: 'critical' | 'high' | 'medium' | 'low';
  effort: {
    level: 'low' | 'medium' | 'high';
    estimatedHours: number;
    resources: string[];
  };
  implementation: {
    steps: Array<{
      step: number;
      action: string;
      owner: string;
      duration: string;
      dependencies: string[];
    }>;
    timeline: string;
    milestones: string[];
  };
  impact: {
    frameworksAffected: string[];
    riskReduction: 'low' | 'medium' | 'high';
    complianceImprovement: number; // Expected score improvement
  };
  resources: {
    templates: string[];
    guidelines: string[];
    tools: string[];
    training: string[];
  };
  success_criteria: string[];
  risks: string[];
  alternatives: string[];
}

export interface ImprovementOutput {
  recommendations: ImprovementRecommendation[];
  implementationPlan: {
    phases: Array<{
      phase: number;
      name: string;
      duration: string;
      recommendations: string[];
      dependencies: string[];
      deliverables: string[];
    }>;
    totalTimeline: string;
    criticalPath: string[];
    resourceRequirements: {
      internal: string[];
      external: string[];
      budget: string;
    };
  };
  quickWins: {
    recommendations: ImprovementRecommendation[];
    expectedImpact: string;
    timeline: string;
  };
  bestPractices: {
    industry: string[];
    regulatory: string[];
    technical: string[];
  };
  monitoring: {
    kpis: string[];
    checkpoints: string[];
    reviewSchedule: string;
  };
}

const ImprovementInputSchema = z.object({
  frameworkScores: z.array(z.object({
    framework: z.string(),
    overallScore: z.number(),
    gaps: z.array(z.object({
      requirement: z.string(),
      framework: z.string(),
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      effort: z.enum(['low', 'medium', 'high'])
    }))
  })),
  prioritizedGaps: z.array(z.object({
    requirement: z.string(),
    framework: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    effort: z.enum(['low', 'medium', 'high'])
  })),
  projectContext: z.object({
    type: z.enum(['academic', 'research', 'commercial', 'government']),
    size: z.enum(['small', 'medium', 'large']),
    budget: z.enum(['limited', 'moderate', 'ample']),
    timeline: z.enum(['urgent', 'normal', 'flexible']),
    resources: z.object({
      technical: z.enum(['low', 'medium', 'high']),
      legal: z.enum(['low', 'medium', 'high']),
      administrative: z.enum(['low', 'medium', 'high'])
    })
  }),
  preferences: z.object({
    prioritizeQuickWins: z.boolean(),
    focusOnCritical: z.boolean(),
    includeTraining: z.boolean(),
    includeAutomation: z.boolean()
  }).optional()
});

export class ImprovementAgent extends BaseAgent<ImprovementInput, ImprovementOutput> {
  private improvementTemplates: Record<string, any>;
  private bestPracticesDatabase: Record<string, any>;

  constructor(projectId: string) {
    const metadata: AgentMetadata = {
      id: `improvement-agent-${projectId}`,
      name: 'Compliance Improvement Agent',
      description: 'Generates actionable improvement recommendations and remediation strategies',
      version: '1.0.0',
      capabilities: [
        {
          name: 'remediation_planning',
          description: 'Create detailed remediation plans for compliance gaps',
          inputSchema: ImprovementInputSchema,
          outputSchema: z.object({
            recommendations: z.array(z.object({
              id: z.string(),
              title: z.string(),
              priority: z.enum(['critical', 'high', 'medium', 'low']),
              effort: z.object({
                level: z.enum(['low', 'medium', 'high']),
                estimatedHours: z.number()
              })
            }))
          })
        }
      ],
      dependencies: ['web-search', 'vector-retrieval'],
      tags: ['improvement', 'recommendations', 'remediation', projectId]
    };

    super(metadata);
    this.improvementTemplates = this.initializeImprovementTemplates();
    this.bestPracticesDatabase = this.initializeBestPractices();
  }

  protected async initializeTools(): Promise<Tool[]> {
    return getAgentTools(this.metadata.id);
  }

  protected createPrompt(): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([
      ['system', `You are a compliance improvement specialist who creates actionable remediation plans.

IMPROVEMENT APPROACH:
1. Analyze compliance gaps and framework scores
2. Consider project context (type, size, budget, timeline, resources)
3. Generate specific, actionable recommendations
4. Create phased implementation plans
5. Identify quick wins and critical path items
6. Use web search for current best practices
7. Use vector search for proven solutions

RECOMMENDATION STRUCTURE:
- TITLE: Clear, action-oriented description
- CATEGORY: Policy, Process, Technology, Training, Documentation
- IMPLEMENTATION: Step-by-step actions with owners and timelines
- RESOURCES: Templates, tools, training materials needed
- SUCCESS CRITERIA: Measurable outcomes

PRIORITIZATION FACTORS:
- Risk reduction impact (high priority for critical/high severity gaps)
- Implementation effort (prefer low effort for quick wins)
- Resource availability (match to project capabilities)
- Dependencies (sequence properly)
- Budget constraints (provide options)

CONTEXT ADAPTATION:
- Academic: Focus on FERPA, IRB, educational standards
- Research: Emphasize data protection, ethics, collaboration
- Commercial: Balance compliance with business needs
- Government: Strict adherence to regulations

PROVIDE: Detailed recommendations with implementation plans, timelines, and resource requirements.`],
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad')
    ]);
  }

  protected async preprocessInput(input: AgentInput<ImprovementInput>): Promise<AgentInput<ImprovementInput>> {
    const validatedData = ImprovementInputSchema.parse(input.data);
    return { ...input, data: validatedData };
  }

  protected async postprocessOutput(result: any, input: AgentInput<ImprovementInput>): Promise<ImprovementOutput> {
    try {
      const aiResponse = result.output || result.text || '';
      let recommendations: ImprovementRecommendation[] = [];

      // First try to parse recommendations from AI response
      if (aiResponse && aiResponse.trim()) {
        recommendations = await this.parseRecommendationsFromAI(aiResponse, input.data);
      }

      // If AI parsing failed or returned insufficient data, supplement with template-based recommendations
      if (recommendations.length === 0) {
        console.log('AI returned no recommendations, using template-based generation');
        recommendations = await this.generateRecommendations(input.data);
      } else if (recommendations.length < 3) {
        // Supplement with a few template recommendations
        const templateRecommendations = await this.generateRecommendations(input.data);
        recommendations = [...recommendations, ...templateRecommendations.slice(0, 3 - recommendations.length)];
      }

      const implementationPlan = this.createImplementationPlan(recommendations, input.data.projectContext);
      const quickWins = this.identifyQuickWins(recommendations);
      const bestPractices = await this.gatherBestPractices(input.data);
      const monitoring = this.createMonitoringPlan(recommendations);

      return {
        recommendations,
        implementationPlan,
        quickWins,
        bestPractices,
        monitoring
      };
    } catch (error) {
      console.error('Error in improvement postprocessing:', error);
      // Return fallback response
      return this.createFallbackImprovementResponse(input.data);
    }
  }

  protected formatInputForAgent(input: AgentInput<ImprovementInput>): string {
    const { frameworkScores, prioritizedGaps, projectContext, preferences } = input.data;

    const scoresSummary = frameworkScores.map(fs =>
      `${fs.framework}: ${fs.overallScore}/100 (${fs.gaps.length} gaps)`
    ).join('\n');

    const gapsSummary = prioritizedGaps.slice(0, 10).map(gap =>
      `${gap.severity.toUpperCase()}: ${gap.requirement} (${gap.framework}) - Effort: ${gap.effort}`
    ).join('\n');

    const contextSummary = `
PROJECT TYPE: ${projectContext.type}
SIZE: ${projectContext.size}
BUDGET: ${projectContext.budget}
TIMELINE: ${projectContext.timeline}
RESOURCES: Technical: ${projectContext.resources.technical}, Legal: ${projectContext.resources.legal}, Admin: ${projectContext.resources.administrative}`;

    const preferencesSummary = preferences ? `
PREFERENCES:
- Prioritize Quick Wins: ${preferences.prioritizeQuickWins}
- Focus on Critical: ${preferences.focusOnCritical}
- Include Training: ${preferences.includeTraining}
- Include Automation: ${preferences.includeAutomation}` : 'No specific preferences provided';

    return `IMPROVEMENT PLANNING REQUEST:

FRAMEWORK SCORES:
${scoresSummary}

TOP PRIORITY GAPS:
${gapsSummary}

PROJECT CONTEXT:${contextSummary}
${preferencesSummary}

Please generate actionable improvement recommendations that address these gaps. Use web search for current best practices and vector search for proven compliance solutions. Create a detailed implementation plan that considers the project context and resource constraints.`;
  }

  private async generateRecommendations(input: ImprovementInput): Promise<ImprovementRecommendation[]> {
    const recommendations: ImprovementRecommendation[] = [];

    // Group gaps by framework and severity
    const gapsByFramework = this.groupGapsByFramework(input.prioritizedGaps);

    for (const [framework, gaps] of Object.entries(gapsByFramework)) {
      const frameworkRecommendations = await this.generateFrameworkRecommendations(
        framework,
        gaps,
        input.projectContext,
        input.preferences
      );
      recommendations.push(...frameworkRecommendations);
    }

    // Add cross-cutting recommendations
    const crossCuttingRecommendations = this.generateCrossCuttingRecommendations(
      input.frameworkScores,
      input.projectContext
    );
    recommendations.push(...crossCuttingRecommendations);

    // Sort by priority and effort
    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const effortOrder = { low: 3, medium: 2, high: 1 };

      const aScore = priorityOrder[a.priority] * effortOrder[a.effort.level];
      const bScore = priorityOrder[b.priority] * effortOrder[b.effort.level];

      return bScore - aScore;
    });
  }

  private groupGapsByFramework(gaps: ComplianceGap[]): Record<string, ComplianceGap[]> {
    return gaps.reduce((grouped, gap) => {
      if (!grouped[gap.framework]) {
        grouped[gap.framework] = [];
      }
      grouped[gap.framework].push(gap);
      return grouped;
    }, {} as Record<string, ComplianceGap[]>);
  }

  private async generateFrameworkRecommendations(
    framework: string,
    gaps: ComplianceGap[],
    context: ImprovementInput['projectContext'],
    preferences?: ImprovementInput['preferences']
  ): Promise<ImprovementRecommendation[]> {
    const recommendations: ImprovementRecommendation[] = [];
    const templates = this.improvementTemplates[framework] || this.improvementTemplates['General'];

    for (const gap of gaps.slice(0, 5)) { // Limit to top 5 gaps per framework
      const template = this.findBestTemplate(gap, templates);
      const recommendation = this.createRecommendationFromTemplate(gap, template, context, framework);
      recommendations.push(recommendation);
    }

    return recommendations;
  }

  private findBestTemplate(gap: ComplianceGap, templates: any[]): any {
    // Find template that best matches the gap requirement
    const gapKeywords = gap.requirement.toLowerCase().split(' ');
    let bestTemplate = templates[0]; // Default fallback
    let bestScore = 0;

    for (const template of templates) {
      const templateKeywords = template.keywords || [];
      const matchScore = gapKeywords.filter(keyword =>
        templateKeywords.some((tk: string) => tk.toLowerCase().includes(keyword))
      ).length;

      if (matchScore > bestScore) {
        bestScore = matchScore;
        bestTemplate = template;
      }
    }

    return bestTemplate;
  }

  private createRecommendationFromTemplate(
    gap: ComplianceGap,
    template: any,
    context: ImprovementInput['projectContext'],
    framework: string
  ): ImprovementRecommendation {
    const id = `rec-${framework.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      id,
      title: template.title.replace('{requirement}', gap.requirement),
      description: template.description.replace('{requirement}', gap.requirement),
      category: template.category,
      priority: gap.severity,
      effort: {
        level: gap.effort,
        estimatedHours: this.estimateHours(gap.effort, template.baseHours),
        resources: template.resources
      },
      implementation: {
        steps: template.steps.map((step: any, index: number) => ({
          step: index + 1,
          action: step.action.replace('{requirement}', gap.requirement),
          owner: this.determineOwner(step.type, context),
          duration: step.duration,
          dependencies: step.dependencies || []
        })),
        timeline: this.calculateTimeline(gap.effort, context.timeline),
        milestones: template.milestones || []
      },
      impact: {
        frameworksAffected: [framework],
        riskReduction: gap.severity === 'critical' ? 'high' : gap.severity === 'high' ? 'medium' : 'low',
        complianceImprovement: this.estimateImprovementScore(gap.severity)
      },
      resources: {
        templates: template.templates || [],
        guidelines: template.guidelines || [],
        tools: template.tools || [],
        training: template.training || []
      },
      success_criteria: template.success_criteria || [],
      risks: template.risks || [],
      alternatives: template.alternatives || []
    };
  }

  private generateCrossCuttingRecommendations(
    frameworkScores: FrameworkScore[],
    context: ImprovementInput['projectContext']
  ): ImprovementRecommendation[] {
    const recommendations: ImprovementRecommendation[] = [];

    // General security improvement
    if (this.needsGeneralSecurity(frameworkScores)) {
      recommendations.push(this.createSecurityImprovementRecommendation(context));
    }

    // Training program
    if (this.needsTrainingProgram(frameworkScores)) {
      recommendations.push(this.createTrainingProgramRecommendation(context));
    }

    // Monitoring and audit system
    if (this.needsMonitoringSystem(frameworkScores)) {
      recommendations.push(this.createMonitoringSystemRecommendation(context));
    }

    return recommendations;
  }

  private needsGeneralSecurity(frameworkScores: FrameworkScore[]): boolean {
    return frameworkScores.some(fs =>
      fs.breakdown.accessControls < 70 || fs.breakdown.dataProtection < 70
    );
  }

  private needsTrainingProgram(frameworkScores: FrameworkScore[]): boolean {
    return frameworkScores.some(fs => fs.breakdown.procedures < 60);
  }

  private needsMonitoringSystem(frameworkScores: FrameworkScore[]): boolean {
    return frameworkScores.some(fs => fs.breakdown.monitoring < 60);
  }

  private createSecurityImprovementRecommendation(context: ImprovementInput['projectContext']): ImprovementRecommendation {
    return {
      id: `rec-security-${Date.now()}`,
      title: 'Implement Comprehensive Security Controls',
      description: 'Establish fundamental security controls including access management, encryption, and monitoring',
      category: 'technology',
      priority: 'high',
      effort: {
        level: context.resources.technical === 'high' ? 'medium' : 'high',
        estimatedHours: 40,
        resources: ['Security team', 'IT infrastructure', 'Security tools']
      },
      implementation: {
        steps: [
          {
            step: 1,
            action: 'Conduct security assessment',
            owner: 'Security Officer',
            duration: '1 week',
            dependencies: []
          },
          {
            step: 2,
            action: 'Implement access controls',
            owner: 'IT Team',
            duration: '2 weeks',
            dependencies: ['Security assessment']
          },
          {
            step: 3,
            action: 'Deploy encryption solutions',
            owner: 'IT Team',
            duration: '1 week',
            dependencies: ['Access controls']
          }
        ],
        timeline: '4 weeks',
        milestones: ['Assessment complete', 'Access controls active', 'Encryption deployed']
      },
      impact: {
        frameworksAffected: ['All'],
        riskReduction: 'high',
        complianceImprovement: 15
      },
      resources: {
        templates: ['Security policy template', 'Access control matrix'],
        guidelines: ['NIST security framework', 'ISO 27001 guidelines'],
        tools: ['Identity management system', 'Encryption tools'],
        training: ['Security awareness training']
      },
      success_criteria: [
        'All users have unique credentials',
        'Data encryption is implemented',
        'Access logs are monitored'
      ],
      risks: ['Resource constraints', 'User resistance', 'Technical complexity'],
      alternatives: ['Phased implementation', 'Cloud-based solutions', 'Third-party services']
    };
  }

  private createTrainingProgramRecommendation(context: ImprovementInput['projectContext']): ImprovementRecommendation {
    return {
      id: `rec-training-${Date.now()}`,
      title: 'Develop Compliance Training Program',
      description: 'Create and implement comprehensive compliance training for all team members',
      category: 'training',
      priority: 'medium',
      effort: {
        level: 'medium',
        estimatedHours: 20,
        resources: ['Training coordinator', 'Subject matter experts', 'Training materials']
      },
      implementation: {
        steps: [
          {
            step: 1,
            action: 'Develop training curriculum',
            owner: 'Compliance Officer',
            duration: '2 weeks',
            dependencies: []
          },
          {
            step: 2,
            action: 'Create training materials',
            owner: 'Training Team',
            duration: '3 weeks',
            dependencies: ['Training curriculum']
          },
          {
            step: 3,
            action: 'Conduct training sessions',
            owner: 'Compliance Officer',
            duration: '2 weeks',
            dependencies: ['Training materials']
          }
        ],
        timeline: '7 weeks',
        milestones: ['Curriculum approved', 'Materials ready', 'Training completed']
      },
      impact: {
        frameworksAffected: ['All'],
        riskReduction: 'medium',
        complianceImprovement: 10
      },
      resources: {
        templates: ['Training plan template', 'Assessment questionnaire'],
        guidelines: ['Adult learning principles', 'Compliance training best practices'],
        tools: ['Learning management system', 'Training tracking tools'],
        training: ['Train-the-trainer sessions']
      },
      success_criteria: [
        '100% staff completion rate',
        'Passing scores on assessments',
        'Regular refresher training scheduled'
      ],
      risks: ['Low attendance', 'Knowledge retention', 'Resource availability'],
      alternatives: ['Online training modules', 'External training providers', 'Peer-to-peer training']
    };
  }

  private createMonitoringSystemRecommendation(context: ImprovementInput['projectContext']): ImprovementRecommendation {
    return {
      id: `rec-monitoring-${Date.now()}`,
      title: 'Establish Compliance Monitoring System',
      description: 'Implement ongoing monitoring and reporting for compliance status',
      category: 'process',
      priority: 'medium',
      effort: {
        level: context.resources.administrative === 'high' ? 'low' : 'medium',
        estimatedHours: 15,
        resources: ['Compliance officer', 'Monitoring tools', 'Reporting systems']
      },
      implementation: {
        steps: [
          {
            step: 1,
            action: 'Define monitoring metrics',
            owner: 'Compliance Officer',
            duration: '1 week',
            dependencies: []
          },
          {
            step: 2,
            action: 'Set up monitoring tools',
            owner: 'IT Team',
            duration: '2 weeks',
            dependencies: ['Monitoring metrics']
          },
          {
            step: 3,
            action: 'Create reporting dashboard',
            owner: 'IT Team',
            duration: '1 week',
            dependencies: ['Monitoring tools']
          }
        ],
        timeline: '4 weeks',
        milestones: ['Metrics defined', 'Tools deployed', 'Dashboard active']
      },
      impact: {
        frameworksAffected: ['All'],
        riskReduction: 'medium',
        complianceImprovement: 8
      },
      resources: {
        templates: ['Monitoring checklist', 'Report templates'],
        guidelines: ['Compliance monitoring standards', 'KPI frameworks'],
        tools: ['Monitoring software', 'Dashboard tools'],
        training: ['Monitoring system training']
      },
      success_criteria: [
        'Real-time compliance status visibility',
        'Regular automated reports',
        'Trend analysis capabilities'
      ],
      risks: ['Data accuracy', 'Tool reliability', 'Resource allocation'],
      alternatives: ['Manual monitoring', 'Third-party services', 'Simplified metrics']
    };
  }

  private estimateHours(effort: 'low' | 'medium' | 'high', baseHours: number): number {
    const multipliers = { low: 0.5, medium: 1.0, high: 2.0 };
    return Math.round(baseHours * multipliers[effort]);
  }

  private determineOwner(stepType: string, context: ImprovementInput['projectContext']): string {
    const ownerMap: Record<string, string> = {
      policy: 'Compliance Officer',
      technical: 'IT Team',
      training: 'Training Coordinator',
      legal: 'Legal Team',
      administrative: 'Project Manager'
    };

    return ownerMap[stepType] || 'Project Manager';
  }

  private calculateTimeline(effort: 'low' | 'medium' | 'high', projectTimeline: string): string {
    const baseTimelines = {
      low: { urgent: '1 week', normal: '2 weeks', flexible: '3 weeks' },
      medium: { urgent: '2 weeks', normal: '4 weeks', flexible: '6 weeks' },
      high: { urgent: '4 weeks', normal: '8 weeks', flexible: '12 weeks' }
    };

    return baseTimelines[effort][projectTimeline as keyof typeof baseTimelines.low];
  }

  private estimateImprovementScore(severity: 'critical' | 'high' | 'medium' | 'low'): number {
    const improvements = { critical: 25, high: 15, medium: 10, low: 5 };
    return improvements[severity];
  }

  private createImplementationPlan(
    recommendations: ImprovementRecommendation[],
    context: ImprovementInput['projectContext']
  ): ImprovementOutput['implementationPlan'] {
    // Group recommendations into phases
    const phases = this.createPhases(recommendations, context);

    // Calculate total timeline
    const totalTimeline = this.calculateTotalTimeline(phases);

    // Identify critical path
    const criticalPath = this.identifyCriticalPath(recommendations);

    // Estimate resource requirements
    const resourceRequirements = this.estimateResourceRequirements(recommendations, context);

    return {
      phases,
      totalTimeline,
      criticalPath,
      resourceRequirements
    };
  }

  private createPhases(
    recommendations: ImprovementRecommendation[],
    context: ImprovementInput['projectContext']
  ): ImprovementOutput['implementationPlan']['phases'] {
    const criticalRecommendations = recommendations.filter(r => r.priority === 'critical');
    const highRecommendations = recommendations.filter(r => r.priority === 'high');
    const mediumRecommendations = recommendations.filter(r => r.priority === 'medium');
    const lowRecommendations = recommendations.filter(r => r.priority === 'low');

    return [
      {
        phase: 1,
        name: 'Critical Issues Resolution',
        duration: '4-6 weeks',
        recommendations: criticalRecommendations.map(r => r.id),
        dependencies: [],
        deliverables: ['Critical compliance gaps addressed', 'Security vulnerabilities resolved']
      },
      {
        phase: 2,
        name: 'High Priority Implementation',
        duration: '6-8 weeks',
        recommendations: highRecommendations.map(r => r.id),
        dependencies: ['Phase 1 completion'],
        deliverables: ['Core compliance framework implemented', 'Training program established']
      },
      {
        phase: 3,
        name: 'Process Optimization',
        duration: '4-6 weeks',
        recommendations: mediumRecommendations.map(r => r.id),
        dependencies: ['Phase 2 completion'],
        deliverables: ['Monitoring systems active', 'Process improvements implemented']
      },
      {
        phase: 4,
        name: 'Continuous Improvement',
        duration: 'Ongoing',
        recommendations: lowRecommendations.map(r => r.id),
        dependencies: ['Phase 3 completion'],
        deliverables: ['Regular compliance reviews', 'Ongoing optimization']
      }
    ];
  }

  private calculateTotalTimeline(phases: any[]): string {
    const sequentialPhases = phases.filter(p => p.name !== 'Continuous Improvement');
    const totalWeeks = sequentialPhases.reduce((sum, phase) => {
      const weeks = parseInt(phase.duration.split('-')[1] || phase.duration.split('-')[0]);
      return sum + weeks;
    }, 0);

    return `${totalWeeks} weeks`;
  }

  private identifyCriticalPath(recommendations: ImprovementRecommendation[]): string[] {
    return recommendations
      .filter(r => r.priority === 'critical' || r.priority === 'high')
      .map(r => r.title);
  }

  private estimateResourceRequirements(
    recommendations: ImprovementRecommendation[],
    context: ImprovementInput['projectContext']
  ): ImprovementOutput['implementationPlan']['resourceRequirements'] {
    const internal = ['Compliance Officer', 'IT Team', 'Project Manager', 'Legal Counsel'];
    const external = ['External auditor', 'Security consultant', 'Training provider'];

    let budgetEstimate = 'TBD';
    if (context.budget === 'limited') {
      budgetEstimate = '$10,000 - $25,000';
    } else if (context.budget === 'moderate') {
      budgetEstimate = '$25,000 - $75,000';
    } else {
      budgetEstimate = '$75,000+';
    }

    return {
      internal,
      external,
      budget: budgetEstimate
    };
  }

  private identifyQuickWins(recommendations: ImprovementRecommendation[]): ImprovementOutput['quickWins'] {
    const quickWinRecs = recommendations
      .filter(r => r.effort.level === 'low' && (r.priority === 'high' || r.priority === 'medium'))
      .slice(0, 5);

    const totalImpact = quickWinRecs.reduce((sum, r) => sum + r.impact.complianceImprovement, 0);

    return {
      recommendations: quickWinRecs,
      expectedImpact: `${totalImpact} point compliance score improvement`,
      timeline: '2-4 weeks'
    };
  }

  private async gatherBestPractices(input: ImprovementInput): Promise<ImprovementOutput['bestPractices']> {
    const practices = this.bestPracticesDatabase[input.projectContext.type] || this.bestPracticesDatabase['general'];

    return {
      industry: practices.industry || [],
      regulatory: practices.regulatory || [],
      technical: practices.technical || []
    };
  }

  private createMonitoringPlan(recommendations: ImprovementRecommendation[]): ImprovementOutput['monitoring'] {
    return {
      kpis: [
        'Overall compliance score',
        'Number of critical gaps',
        'Implementation progress percentage',
        'Training completion rate'
      ],
      checkpoints: [
        'Weekly progress reviews',
        'Monthly compliance assessments',
        'Quarterly comprehensive audits'
      ],
      reviewSchedule: 'Monthly reviews with quarterly deep dives'
    };
  }

  private initializeImprovementTemplates(): Record<string, any> {
    return {
      'FERPA': [
        {
          title: 'Implement {requirement} for FERPA Compliance',
          description: 'Address {requirement} to ensure student privacy protection',
          category: 'policy',
          keywords: ['consent', 'privacy', 'student', 'record'],
          baseHours: 15,
          resources: ['Privacy officer', 'Legal review', 'IT support'],
          steps: [
            { action: 'Review current {requirement} implementation', type: 'administrative', duration: '3 days' },
            { action: 'Draft policy updates for {requirement}', type: 'policy', duration: '1 week' },
            { action: 'Implement technical controls for {requirement}', type: 'technical', duration: '1 week' }
          ],
          templates: ['FERPA policy template', 'Consent form template'],
          guidelines: ['FERPA compliance guide', 'Student privacy handbook'],
          tools: ['Privacy management system'],
          training: ['FERPA training module'],
          success_criteria: ['Policy implemented', 'Staff trained', 'Controls tested'],
          risks: ['Legal review delays', 'Technical implementation challenges'],
          alternatives: ['Phased implementation', 'External consultation']
        }
      ],
      'General': [
        {
          title: 'Implement {requirement}',
          description: 'Address {requirement} to improve compliance posture',
          category: 'process',
          keywords: ['general', 'compliance', 'requirement'],
          baseHours: 10,
          resources: ['Compliance officer', 'Project team'],
          steps: [
            { action: 'Assess current state of {requirement}', type: 'administrative', duration: '2 days' },
            { action: 'Develop implementation plan for {requirement}', type: 'administrative', duration: '3 days' },
            { action: 'Execute {requirement} implementation', type: 'administrative', duration: '1 week' }
          ],
          templates: ['Generic policy template'],
          guidelines: ['Compliance best practices'],
          tools: ['Project management tools'],
          training: ['General compliance training'],
          success_criteria: ['Implementation complete', 'Documentation updated'],
          risks: ['Resource constraints', 'Timeline delays'],
          alternatives: ['Simplified approach', 'External support']
        }
      ]
    };
  }

  private initializeBestPractices(): Record<string, any> {
    return {
      'academic': {
        industry: [
          'Implement role-based access controls for student data',
          'Regular FERPA compliance training for all staff',
          'Automated data retention and deletion policies'
        ],
        regulatory: [
          'Annual compliance audits',
          'Incident response procedures for data breaches',
          'Privacy impact assessments for new systems'
        ],
        technical: [
          'Encryption for data at rest and in transit',
          'Multi-factor authentication for system access',
          'Regular security assessments and penetration testing'
        ]
      },
      'general': {
        industry: [
          'Implement comprehensive security framework',
          'Regular compliance monitoring and reporting',
          'Staff training and awareness programs'
        ],
        regulatory: [
          'Stay current with regulatory changes',
          'Maintain compliance documentation',
          'Regular internal audits'
        ],
        technical: [
          'Security-by-design principles',
          'Regular software updates and patches',
          'Backup and disaster recovery planning'
        ]
      }
    };
  }

  private async parseRecommendationsFromAI(aiResponse: string, input: ImprovementInput): Promise<ImprovementRecommendation[]> {
    try {
      const recommendations: ImprovementRecommendation[] = [];

      // Look for recommendation sections in the AI response
      const recommendationSections = this.extractRecommendationSections(aiResponse);

      for (const section of recommendationSections) {
        const recommendation = await this.parseRecommendationFromText(section, input, recommendations.length);
        if (recommendation) {
          recommendations.push(recommendation);
        }
      }

      return recommendations.slice(0, 10); // Limit to 10 recommendations
    } catch (error) {
      console.error('Error parsing AI recommendations:', error);
      return [];
    }
  }

  private extractRecommendationSections(response: string): string[] {
    const sections: string[] = [];

    // Pattern 1: Numbered recommendations (1. Title\nDescription...)
    const numberedPattern = /(\d+\.\s*[^\n]+(?:\n(?!\d+\.)[^\n]*)*)/g;
    const numberedMatches = [...response.matchAll(numberedPattern)];
    for (const match of numberedMatches) {
      if (match[1] && match[1].length > 50) {
        sections.push(match[1]);
      }
    }

    // Pattern 2: Bullet point recommendations (- Title\nDescription...)
    if (sections.length === 0) {
      const bulletPattern = /([-*]\s*[^\n]+(?:\n(?![-*])[^\n]*)*)/g;
      const bulletMatches = [...response.matchAll(bulletPattern)];
      for (const match of bulletMatches) {
        if (match[1] && match[1].length > 50) {
          sections.push(match[1]);
        }
      }
    }

    // Pattern 3: Header-based sections (## Title\nDescription...)
    if (sections.length === 0) {
      const headerPattern = /(##?\s*[^\n]+(?:\n(?!##)[^\n]*)*)/g;
      const headerMatches = [...response.matchAll(headerPattern)];
      for (const match of headerMatches) {
        if (match[1] && match[1].length > 50) {
          sections.push(match[1]);
        }
      }
    }

    return sections.slice(0, 10);
  }

  private async parseRecommendationFromText(
    text: string,
    input: ImprovementInput,
    index: number
  ): Promise<ImprovementRecommendation | null> {
    try {
      // Extract title (first line or sentence)
      const title = this.extractTitle(text);
      if (!title || title.length < 10) return null;

      // Extract description
      const description = this.extractDescription(text, title);

      // Determine category based on content
      const category = this.categorizeRecommendation(text);

      // Determine priority from text
      const priority = this.determinePriorityFromText(text);

      // Estimate effort
      const effortLevel = this.estimateEffortFromText(text);
      const estimatedHours = this.estimateHours(effortLevel, 20); // Base 20 hours

      // Extract implementation steps if available
      const steps = this.extractImplementationSteps(text);

      // Determine affected frameworks
      const frameworksAffected = this.identifyAffectedFrameworks(text, input.frameworkScores);

      // Estimate impact
      const riskReduction = priority === 'critical' ? 'high' : priority === 'high' ? 'medium' : 'low';
      const complianceImprovement = this.estimateImprovementScore(priority);

      return {
        id: `ai-rec-${index}-${Date.now()}`,
        title,
        description,
        category,
        priority,
        effort: {
          level: effortLevel,
          estimatedHours,
          resources: this.extractResources(text)
        },
        implementation: {
          steps: steps.length > 0 ? steps : this.generateDefaultSteps(title, category),
          timeline: this.calculateTimeline(effortLevel, input.projectContext.timeline),
          milestones: this.extractMilestones(text)
        },
        impact: {
          frameworksAffected,
          riskReduction,
          complianceImprovement
        },
        resources: {
          templates: this.extractTemplates(text),
          guidelines: this.extractGuidelines(text),
          tools: this.extractTools(text),
          training: this.extractTraining(text)
        },
        success_criteria: this.extractSuccessCriteria(text),
        risks: this.extractRisks(text),
        alternatives: this.extractAlternatives(text)
      };
    } catch (error) {
      console.error('Error parsing recommendation:', error);
      return null;
    }
  }

  private extractTitle(text: string): string {
    // Try to extract title from various formats
    const patterns = [
      /^\d+\.\s*(.+?)(?:\n|$)/,  // "1. Title"
      /^[-*]\s*(.+?)(?:\n|$)/,   // "- Title"
      /^##?\s*(.+?)(?:\n|$)/,    // "## Title"
      /^([^.\n]+)/               // First sentence
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1] && match[1].trim().length > 5) {
        return match[1].trim();
      }
    }

    return '';
  }

  private extractDescription(text: string, title: string): string {
    // Remove title and get the rest as description
    const withoutTitle = text.replace(title, '').trim();
    const lines = withoutTitle.split('\n').filter(line => line.trim().length > 0);

    // Take first few lines as description
    return lines.slice(0, 3).join(' ').trim().substring(0, 300);
  }

  private categorizeRecommendation(text: string): ImprovementRecommendation['category'] {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('policy') || lowerText.includes('procedure') || lowerText.includes('document')) {
      return 'policy';
    } else if (lowerText.includes('training') || lowerText.includes('education') || lowerText.includes('awareness')) {
      return 'training';
    } else if (lowerText.includes('technology') || lowerText.includes('system') || lowerText.includes('software')) {
      return 'technology';
    } else if (lowerText.includes('process') || lowerText.includes('workflow') || lowerText.includes('procedure')) {
      return 'process';
    } else {
      return 'documentation';
    }
  }

  private determinePriorityFromText(text: string): ImprovementRecommendation['priority'] {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('critical') || lowerText.includes('urgent') || lowerText.includes('immediate')) {
      return 'critical';
    } else if (lowerText.includes('important') || lowerText.includes('high') || lowerText.includes('significant')) {
      return 'high';
    } else if (lowerText.includes('low') || lowerText.includes('minor') || lowerText.includes('optional')) {
      return 'low';
    } else {
      return 'medium';
    }
  }

  private estimateEffortFromText(text: string): 'low' | 'medium' | 'high' {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('complex') || lowerText.includes('major') || lowerText.includes('significant effort')) {
      return 'high';
    } else if (lowerText.includes('simple') || lowerText.includes('quick') || lowerText.includes('easy')) {
      return 'low';
    } else {
      return 'medium';
    }
  }

  private extractImplementationSteps(text: string): Array<{
    step: number;
    action: string;
    owner: string;
    duration: string;
    dependencies: string[];
  }> {
    const steps: any[] = [];
    const stepPatterns = [
      /step\s*(\d+)[:\-\s]*(.+?)(?=step\s*\d+|$)/gi,
      /(\d+)\.\s*(.+?)(?=\d+\.|$)/g
    ];

    for (const pattern of stepPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (match[2] && match[2].trim().length > 10) {
          steps.push({
            step: parseInt(match[1]) || steps.length + 1,
            action: match[2].trim(),
            owner: 'Project Team',
            duration: '1 week',
            dependencies: []
          });
        }
      }
      if (steps.length > 0) break;
    }

    return steps.slice(0, 5);
  }

  private generateDefaultSteps(title: string, category: ImprovementRecommendation['category']): Array<{
    step: number;
    action: string;
    owner: string;
    duration: string;
    dependencies: string[];
  }> {
    const baseSteps = [
      { step: 1, action: `Assess current state for ${title}`, owner: 'Compliance Officer', duration: '3 days', dependencies: [] },
      { step: 2, action: `Plan implementation of ${title}`, owner: 'Project Manager', duration: '1 week', dependencies: ['Assess current state'] },
      { step: 3, action: `Execute ${title} implementation`, owner: 'Implementation Team', duration: '2 weeks', dependencies: ['Plan implementation'] }
    ];

    return baseSteps;
  }

  private extractResources(text: string): string[] {
    const resources: string[] = [];
    const resourcePatterns = [
      /resource[s]?[:\-\s]*(.+?)(?=\n|$)/gi,
      /need[s]?[:\-\s]*(.+?)(?=\n|$)/gi,
      /require[s]?[:\-\s]*(.+?)(?=\n|$)/gi
    ];

    for (const pattern of resourcePatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 5) {
          resources.push(match[1].trim());
        }
      }
    }

    return resources.slice(0, 3);
  }

  private identifyAffectedFrameworks(text: string, frameworkScores: any[]): string[] {
    const frameworks: string[] = [];
    const frameworkNames = frameworkScores.map(fs => fs.framework);

    for (const framework of frameworkNames) {
      if (text.toLowerCase().includes(framework.toLowerCase())) {
        frameworks.push(framework);
      }
    }

    return frameworks.length > 0 ? frameworks : ['General'];
  }

  private extractMilestones(text: string): string[] {
    const milestones: string[] = [];
    const milestonePatterns = [
      /milestone[s]?[:\-\s]*(.+?)(?=\n|$)/gi,
      /deliverable[s]?[:\-\s]*(.+?)(?=\n|$)/gi
    ];

    for (const pattern of milestonePatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 5) {
          milestones.push(match[1].trim());
        }
      }
    }

    return milestones.slice(0, 3);
  }

  private extractTemplates(text: string): string[] {
    const templates: string[] = [];
    if (text.toLowerCase().includes('template')) {
      templates.push('Compliance template');
    }
    return templates;
  }

  private extractGuidelines(text: string): string[] {
    const guidelines: string[] = [];
    if (text.toLowerCase().includes('guideline') || text.toLowerCase().includes('best practice')) {
      guidelines.push('Best practices guide');
    }
    return guidelines;
  }

  private extractTools(text: string): string[] {
    const tools: string[] = [];
    if (text.toLowerCase().includes('tool') || text.toLowerCase().includes('software')) {
      tools.push('Implementation tools');
    }
    return tools;
  }

  private extractTraining(text: string): string[] {
    const training: string[] = [];
    if (text.toLowerCase().includes('training') || text.toLowerCase().includes('education')) {
      training.push('Training materials');
    }
    return training;
  }

  private extractSuccessCriteria(text: string): string[] {
    const criteria: string[] = [];
    const criteriaPatterns = [
      /success[:\-\s]*(.+?)(?=\n|$)/gi,
      /criteria[:\-\s]*(.+?)(?=\n|$)/gi,
      /measure[s]?[:\-\s]*(.+?)(?=\n|$)/gi
    ];

    for (const pattern of criteriaPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 5) {
          criteria.push(match[1].trim());
        }
      }
    }

    return criteria.slice(0, 3);
  }

  private extractRisks(text: string): string[] {
    const risks: string[] = [];
    const riskPatterns = [
      /risk[s]?[:\-\s]*(.+?)(?=\n|$)/gi,
      /challenge[s]?[:\-\s]*(.+?)(?=\n|$)/gi
    ];

    for (const pattern of riskPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 5) {
          risks.push(match[1].trim());
        }
      }
    }

    return risks.slice(0, 2);
  }

  private extractAlternatives(text: string): string[] {
    const alternatives: string[] = [];
    const altPatterns = [
      /alternative[s]?[:\-\s]*(.+?)(?=\n|$)/gi,
      /option[s]?[:\-\s]*(.+?)(?=\n|$)/gi
    ];

    for (const pattern of altPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 5) {
          alternatives.push(match[1].trim());
        }
      }
    }

    return alternatives.slice(0, 2);
  }

  private createFallbackImprovementResponse(input: ImprovementInput): ImprovementOutput {
    const fallbackRecommendation: ImprovementRecommendation = {
      id: `fallback-rec-${Date.now()}`,
      title: 'General Compliance Review',
      description: 'Conduct a comprehensive compliance assessment due to processing limitations',
      category: 'process',
      priority: 'medium',
      effort: {
        level: 'medium',
        estimatedHours: 20,
        resources: ['Compliance Officer', 'Project Team']
      },
      implementation: {
        steps: [
          { step: 1, action: 'Review current compliance status', owner: 'Compliance Officer', duration: '1 week', dependencies: [] },
          { step: 2, action: 'Identify improvement areas', owner: 'Project Team', duration: '1 week', dependencies: ['Review current status'] },
          { step: 3, action: 'Implement improvements', owner: 'Implementation Team', duration: '2 weeks', dependencies: ['Identify areas'] }
        ],
        timeline: '4 weeks',
        milestones: ['Assessment complete', 'Plan approved', 'Implementation done']
      },
      impact: {
        frameworksAffected: ['General'],
        riskReduction: 'medium',
        complianceImprovement: 10
      },
      resources: {
        templates: ['Compliance checklist'],
        guidelines: ['General compliance guide'],
        tools: ['Assessment tools'],
        training: ['Compliance training']
      },
      success_criteria: ['Compliance gaps identified', 'Improvement plan created'],
      risks: ['Resource constraints', 'Timeline delays'],
      alternatives: ['External consultation', 'Phased approach']
    };

    return {
      recommendations: [fallbackRecommendation],
      implementationPlan: {
        phases: [{
          phase: 1,
          name: 'Assessment Phase',
          duration: '4 weeks',
          recommendations: [fallbackRecommendation.id],
          dependencies: [],
          deliverables: ['Compliance assessment report']
        }],
        totalTimeline: '4 weeks',
        criticalPath: ['General Compliance Review'],
        resourceRequirements: {
          internal: ['Compliance Officer', 'Project Team'],
          external: ['External auditor (optional)'],
          budget: 'TBD'
        }
      },
      quickWins: {
        recommendations: [],
        expectedImpact: 'Basic compliance review',
        timeline: '2 weeks'
      },
      bestPractices: {
        industry: ['Regular compliance assessments'],
        regulatory: ['Stay current with regulations'],
        technical: ['Document all processes']
      },
      monitoring: {
        kpis: ['Compliance score improvement'],
        checkpoints: ['Weekly reviews'],
        reviewSchedule: 'Monthly'
      }
    };
  }
}