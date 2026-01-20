import { BaseAgent } from '../base/base-agent';
import { AgentMetadata, AgentInput } from '../base/types';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { Tool } from '@langchain/core/tools';
import { getAgentTools } from '../tools';
import { z } from 'zod';

// Import types from other agents for validation
import { ClassificationOutput } from '../classification/classification-agent';
import { IdeationOutput } from '../ideation/ideation-agent';
import { GraderOutput } from '../grader/grader-agent';
import { ImprovementOutput } from '../improvement/improvement-agent';

export interface ValidationInput {
  results: {
    classification?: ClassificationOutput;
    ideation?: IdeationOutput;
    grading?: GraderOutput;
    improvement?: ImprovementOutput;
  };
  context: {
    projectDescription: string;
    documentContent: string;
    expectedFrameworks?: string[];
    validationLevel: 'basic' | 'thorough' | 'comprehensive';
  };
  crossValidationRules: {
    requireFrameworkConsistency: boolean;
    requireScoreReasonableness: boolean;
    requireRecommendationFeasibility: boolean;
    minimumConfidenceThreshold: number;
  };
}

export interface ValidationIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'consistency' | 'accuracy' | 'completeness' | 'feasibility' | 'logical_flow';
  agent: string;
  field: string;
  description: string;
  expectedValue?: any;
  actualValue?: any;
  suggestion: string;
  autoFixable: boolean;
}

export interface ValidationOutput {
  overall: {
    valid: boolean;
    confidence: number; // 0-1
    qualityScore: number; // 0-100
  };
  agentValidation: {
    classification: {
      valid: boolean;
      confidence: number;
      issues: ValidationIssue[];
    };
    ideation: {
      valid: boolean;
      confidence: number;
      issues: ValidationIssue[];
    };
    grading: {
      valid: boolean;
      confidence: number;
      issues: ValidationIssue[];
    };
    improvement: {
      valid: boolean;
      confidence: number;
      issues: ValidationIssue[];
    };
  };
  crossValidation: {
    frameworkConsistency: {
      consistent: boolean;
      issues: ValidationIssue[];
    };
    scoreReasonableness: {
      reasonable: boolean;
      issues: ValidationIssue[];
    };
    recommendationAlignment: {
      aligned: boolean;
      issues: ValidationIssue[];
    };
  };
  summary: {
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
    autoFixableIssues: number;
    recommendedActions: string[];
  };
}

const ValidationInputSchema = z.object({
  results: z.object({
    classification: z.any().optional(),
    ideation: z.any().optional(),
    grading: z.any().optional(),
    improvement: z.any().optional()
  }),
  context: z.object({
    projectDescription: z.string(),
    documentContent: z.string(),
    expectedFrameworks: z.array(z.string()).optional(),
    validationLevel: z.enum(['basic', 'thorough', 'comprehensive'])
  }),
  crossValidationRules: z.object({
    requireFrameworkConsistency: z.boolean(),
    requireScoreReasonableness: z.boolean(),
    requireRecommendationFeasibility: z.boolean(),
    minimumConfidenceThreshold: z.number()
  })
});

export class ValidationAgent extends BaseAgent<ValidationInput, ValidationOutput> {
  private validationRules: Record<string, any>;

  constructor(projectId: string) {
    const metadata: AgentMetadata = {
      id: `validation-agent-${projectId}`,
      name: 'Multi-Agent Validation Agent',
      description: 'Validates and cross-checks outputs from other agents for consistency and accuracy',
      version: '1.0.0',
      capabilities: [
        {
          name: 'cross_validation',
          description: 'Cross-validate results from multiple agents',
          inputSchema: ValidationInputSchema,
          outputSchema: z.object({
            overall: z.object({
              valid: z.boolean(),
              confidence: z.number(),
              qualityScore: z.number()
            })
          })
        }
      ],
      dependencies: ['vector-retrieval', 'document-analysis'],
      tags: ['validation', 'quality-assurance', 'cross-checking', projectId]
    };

    super(metadata);
    this.validationRules = this.initializeValidationRules();
  }

  protected async initializeTools(): Promise<Tool[]> {
    return getAgentTools(this.metadata.id);
  }

  protected createPrompt(): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([
      ['system', `You are a validation specialist responsible for ensuring quality and consistency across multi-agent outputs.

VALIDATION APPROACH:
1. Check individual agent output quality and completeness
2. Verify cross-agent consistency (same frameworks, logical flow)
3. Validate score reasonableness and recommendation feasibility
4. Identify logical inconsistencies and gaps
5. Suggest fixes for identified issues

VALIDATION CATEGORIES:
- CONSISTENCY: Results align across agents
- ACCURACY: Results match input data and context
- COMPLETENESS: All required fields populated
- FEASIBILITY: Recommendations are practical
- LOGICAL_FLOW: Results follow logical progression

QUALITY SCORING (0-100):
- 90-100: Excellent quality, minimal issues
- 75-89: Good quality, minor inconsistencies
- 60-74: Acceptable quality, moderate issues
- 40-59: Poor quality, significant problems
- 0-39: Unacceptable quality, major issues

ISSUE SEVERITY:
- CRITICAL: Renders results unusable, immediate fix required
- HIGH: Significant impact on reliability, fix soon
- MEDIUM: Moderate impact, address when possible
- LOW: Minor issue, cosmetic or enhancement

PROVIDE: Detailed validation report with specific issues, severity assessment, and actionable recommendations.`],
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad')
    ]);
  }

  protected async preprocessInput(input: AgentInput<ValidationInput>): Promise<AgentInput<ValidationInput>> {
    const validatedData = ValidationInputSchema.parse(input.data);
    return { ...input, data: validatedData };
  }

  protected async postprocessOutput(result: any, input: AgentInput<ValidationInput>): Promise<ValidationOutput> {
    const { results, context, crossValidationRules } = input.data;

    // Validate individual agent outputs
    const agentValidation = {
      classification: await this.validateClassificationOutput(results.classification, context),
      ideation: await this.validateIdeationOutput(results.ideation, context),
      grading: await this.validateGradingOutput(results.grading, context),
      improvement: await this.validateImprovementOutput(results.improvement, context)
    };

    // Perform cross-validation
    const crossValidation = await this.performCrossValidation(results, crossValidationRules);

    // Calculate overall quality metrics
    const overall = this.calculateOverallQuality(agentValidation, crossValidation);

    // Generate summary
    const summary = this.generateSummary(agentValidation, crossValidation);

    return {
      overall,
      agentValidation,
      crossValidation,
      summary
    };
  }

  protected formatInputForAgent(input: AgentInput<ValidationInput>): string {
    const { results, context } = input.data;

    const resultsSummary = Object.entries(results)
      .filter(([_, value]) => value !== undefined)
      .map(([agent, _]) => agent)
      .join(', ');

    return `VALIDATION REQUEST:

AGENTS TO VALIDATE: ${resultsSummary}
PROJECT DESCRIPTION: ${context.projectDescription.substring(0, 200)}...
VALIDATION LEVEL: ${context.validationLevel}

Please validate these agent outputs for consistency, accuracy, and quality. Check for:
1. Individual agent output completeness and accuracy
2. Cross-agent consistency (frameworks, scores, recommendations)
3. Logical flow from classification → grading → improvement
4. Feasibility of recommendations
5. Overall quality and reliability

Identify specific issues with severity levels and provide actionable fixes.`;
  }

  private async validateClassificationOutput(
    output: ClassificationOutput | undefined,
    context: ValidationInput['context']
  ): Promise<ValidationOutput['agentValidation']['classification']> {
    const issues: ValidationIssue[] = [];

    if (!output) {
      issues.push({
        id: 'classification-missing',
        severity: 'critical',
        category: 'completeness',
        agent: 'classification',
        field: 'output',
        description: 'Classification output is missing',
        suggestion: 'Re-run classification agent',
        autoFixable: false
      });

      return { valid: false, confidence: 0, issues };
    }

    // Check for detected frameworks
    if (!output.detectedFrameworks || output.detectedFrameworks.length === 0) {
      issues.push({
        id: 'no-frameworks-detected',
        severity: 'high',
        category: 'completeness',
        agent: 'classification',
        field: 'detectedFrameworks',
        description: 'No compliance frameworks were detected',
        suggestion: 'Review project description and ensure it contains compliance-relevant content',
        autoFixable: false
      });
    }

    // Check confidence scores
    if (output.detectedFrameworks) {
      output.detectedFrameworks.forEach((framework, index) => {
        if (framework.confidence < 0.3) {
          issues.push({
            id: `low-confidence-${index}`,
            severity: 'medium',
            category: 'accuracy',
            agent: 'classification',
            field: `detectedFrameworks[${index}].confidence`,
            description: `Very low confidence (${framework.confidence}) for framework ${framework.name}`,
            actualValue: framework.confidence,
            expectedValue: '>= 0.3',
            suggestion: 'Consider removing low-confidence frameworks or improving input data',
            autoFixable: true
          });
        }
      });
    }

    // Check for expected frameworks if provided
    if (context.expectedFrameworks) {
      const detectedNames = output.detectedFrameworks?.map(f => f.name) || [];
      const missing = context.expectedFrameworks.filter(name => !detectedNames.includes(name));

      missing.forEach(name => {
        issues.push({
          id: `missing-expected-${name}`,
          severity: 'high',
          category: 'accuracy',
          agent: 'classification',
          field: 'detectedFrameworks',
          description: `Expected framework ${name} was not detected`,
          expectedValue: name,
          suggestion: 'Review project description for framework-specific keywords',
          autoFixable: false
        });
      });
    }

    const confidence = Math.max(0, 1 - (issues.length * 0.2));
    const valid = issues.filter(i => i.severity === 'critical').length === 0;

    return { valid, confidence, issues };
  }

  private async validateIdeationOutput(
    output: IdeationOutput | undefined,
    context: ValidationInput['context']
  ): Promise<ValidationOutput['agentValidation']['ideation']> {
    const issues: ValidationIssue[] = [];

    if (!output) {
      // Ideation is often optional
      return { valid: true, confidence: 1, issues: [] };
    }

    // Check if it's a question output
    if ('questions' in output) {
      const questionOutput = output as any; // QuestionOutput type

      if (!questionOutput.questions || questionOutput.questions.length === 0) {
        issues.push({
          id: 'no-questions-generated',
          severity: 'medium',
          category: 'completeness',
          agent: 'ideation',
          field: 'questions',
          description: 'No clarifying questions were generated',
          suggestion: 'Review compliance gaps to generate relevant questions',
          autoFixable: false
        });
      }

      // Check question quality
      if (questionOutput.questions) {
        questionOutput.questions.forEach((question: any, index: number) => {
          if (question.question.length < 10) {
            issues.push({
              id: `short-question-${index}`,
              severity: 'low',
              category: 'accuracy',
              agent: 'ideation',
              field: `questions[${index}].question`,
              description: 'Question is too short to be meaningful',
              actualValue: question.question.length,
              expectedValue: '>= 10 characters',
              suggestion: 'Generate more detailed, specific questions',
              autoFixable: true
            });
          }
        });
      }
    }

    // Check if it's a chat output
    if ('response' in output) {
      const chatOutput = output as any; // ChatOutput type

      if (!chatOutput.response || chatOutput.response.length < 50) {
        issues.push({
          id: 'insufficient-chat-response',
          severity: 'medium',
          category: 'completeness',
          agent: 'ideation',
          field: 'response',
          description: 'Chat response is too brief',
          actualValue: chatOutput.response?.length || 0,
          expectedValue: '>= 50 characters',
          suggestion: 'Provide more detailed and helpful responses',
          autoFixable: false
        });
      }
    }

    const confidence = Math.max(0.5, 1 - (issues.length * 0.15));
    const valid = issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0;

    return { valid, confidence, issues };
  }

  private async validateGradingOutput(
    output: GraderOutput | undefined,
    context: ValidationInput['context']
  ): Promise<ValidationOutput['agentValidation']['grading']> {
    const issues: ValidationIssue[] = [];

    if (!output) {
      issues.push({
        id: 'grading-missing',
        severity: 'critical',
        category: 'completeness',
        agent: 'grader',
        field: 'output',
        description: 'Grading output is missing',
        suggestion: 'Re-run grader agent',
        autoFixable: false
      });

      return { valid: false, confidence: 0, issues };
    }

    // Check overall compliance score
    if (output.overallComplianceScore < 0 || output.overallComplianceScore > 100) {
      issues.push({
        id: 'invalid-overall-score',
        severity: 'critical',
        category: 'accuracy',
        agent: 'grader',
        field: 'overallComplianceScore',
        description: 'Overall compliance score is out of valid range',
        actualValue: output.overallComplianceScore,
        expectedValue: '0-100',
        suggestion: 'Recalculate overall compliance score',
        autoFixable: true
      });
    }

    // Check framework scores
    if (!output.frameworkScores || output.frameworkScores.length === 0) {
      issues.push({
        id: 'no-framework-scores',
        severity: 'high',
        category: 'completeness',
        agent: 'grader',
        field: 'frameworkScores',
        description: 'No framework scores provided',
        suggestion: 'Ensure grader receives classification results',
        autoFixable: false
      });
    } else {
      output.frameworkScores.forEach((fs, index) => {
        if (fs.overallScore < 0 || fs.overallScore > 100) {
          issues.push({
            id: `invalid-framework-score-${index}`,
            severity: 'high',
            category: 'accuracy',
            agent: 'grader',
            field: `frameworkScores[${index}].overallScore`,
            description: `Framework ${fs.framework} has invalid score`,
            actualValue: fs.overallScore,
            expectedValue: '0-100',
            suggestion: 'Recalculate framework score',
            autoFixable: true
          });
        }

        // Check breakdown scores
        Object.entries(fs.breakdown).forEach(([area, score]) => {
          if (score < 0 || score > 100) {
            issues.push({
              id: `invalid-breakdown-${index}-${area}`,
              severity: 'medium',
              category: 'accuracy',
              agent: 'grader',
              field: `frameworkScores[${index}].breakdown.${area}`,
              description: `Invalid ${area} score for ${fs.framework}`,
              actualValue: score,
              expectedValue: '0-100',
              suggestion: `Recalculate ${area} score`,
              autoFixable: true
            });
          }
        });
      });
    }

    // Check for gaps
    if (!output.prioritizedGaps || output.prioritizedGaps.length === 0) {
      if (output.overallComplianceScore < 90) {
        issues.push({
          id: 'missing-gaps-low-score',
          severity: 'medium',
          category: 'consistency',
          agent: 'grader',
          field: 'prioritizedGaps',
          description: 'Low compliance score but no gaps identified',
          suggestion: 'Review gap identification logic',
          autoFixable: false
        });
      }
    }

    const confidence = Math.max(0, 1 - (issues.length * 0.15));
    const valid = issues.filter(i => i.severity === 'critical').length === 0;

    return { valid, confidence, issues };
  }

  private async validateImprovementOutput(
    output: ImprovementOutput | undefined,
    context: ValidationInput['context']
  ): Promise<ValidationOutput['agentValidation']['improvement']> {
    const issues: ValidationIssue[] = [];

    if (!output) {
      issues.push({
        id: 'improvement-missing',
        severity: 'high',
        category: 'completeness',
        agent: 'improvement',
        field: 'output',
        description: 'Improvement output is missing',
        suggestion: 'Re-run improvement agent',
        autoFixable: false
      });

      return { valid: false, confidence: 0, issues };
    }

    // Check recommendations
    if (!output.recommendations || output.recommendations.length === 0) {
      issues.push({
        id: 'no-recommendations',
        severity: 'medium',
        category: 'completeness',
        agent: 'improvement',
        field: 'recommendations',
        description: 'No improvement recommendations provided',
        suggestion: 'Ensure grader results are passed to improvement agent',
        autoFixable: false
      });
    } else {
      // Check recommendation quality
      output.recommendations.forEach((rec, index) => {
        if (!rec.implementation || !rec.implementation.steps || rec.implementation.steps.length === 0) {
          issues.push({
            id: `missing-implementation-${index}`,
            severity: 'medium',
            category: 'completeness',
            agent: 'improvement',
            field: `recommendations[${index}].implementation`,
            description: `Recommendation "${rec.title}" lacks implementation steps`,
            suggestion: 'Provide detailed implementation steps for all recommendations',
            autoFixable: false
          });
        }

        if (!rec.effort || rec.effort.estimatedHours <= 0) {
          issues.push({
            id: `invalid-effort-${index}`,
            severity: 'low',
            category: 'accuracy',
            agent: 'improvement',
            field: `recommendations[${index}].effort.estimatedHours`,
            description: `Invalid effort estimate for "${rec.title}"`,
            actualValue: rec.effort?.estimatedHours,
            expectedValue: '> 0',
            suggestion: 'Provide realistic effort estimates',
            autoFixable: true
          });
        }
      });
    }

    // Check implementation plan
    if (!output.implementationPlan || !output.implementationPlan.phases) {
      issues.push({
        id: 'missing-implementation-plan',
        severity: 'medium',
        category: 'completeness',
        agent: 'improvement',
        field: 'implementationPlan',
        description: 'Implementation plan is missing or incomplete',
        suggestion: 'Generate phased implementation plan',
        autoFixable: false
      });
    }

    const confidence = Math.max(0.3, 1 - (issues.length * 0.12));
    const valid = issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0;

    return { valid, confidence, issues };
  }

  private async performCrossValidation(
    results: ValidationInput['results'],
    rules: ValidationInput['crossValidationRules']
  ): Promise<ValidationOutput['crossValidation']> {
    const issues: ValidationIssue[] = [];

    // Framework consistency check
    const frameworkConsistency = this.checkFrameworkConsistency(results, rules, issues);

    // Score reasonableness check
    const scoreReasonableness = this.checkScoreReasonableness(results, rules, issues);

    // Recommendation alignment check
    const recommendationAlignment = this.checkRecommendationAlignment(results, rules, issues);

    return {
      frameworkConsistency: {
        consistent: frameworkConsistency,
        issues: issues.filter(i => i.category === 'consistency')
      },
      scoreReasonableness: {
        reasonable: scoreReasonableness,
        issues: issues.filter(i => i.category === 'logical_flow')
      },
      recommendationAlignment: {
        aligned: recommendationAlignment,
        issues: issues.filter(i => i.category === 'feasibility')
      }
    };
  }

  private checkFrameworkConsistency(
    results: ValidationInput['results'],
    rules: ValidationInput['crossValidationRules'],
    issues: ValidationIssue[]
  ): boolean {
    if (!rules.requireFrameworkConsistency) return true;

    const classificationFrameworks = results.classification?.detectedFrameworks?.map(f => f.name) || [];
    const gradingFrameworks = results.grading?.frameworkScores?.map(fs => fs.framework) || [];
    const improvementFrameworks = results.improvement?.recommendations?.flatMap(r => r.impact.frameworksAffected) || [];

    // Check classification vs grading consistency
    const missingInGrading = classificationFrameworks.filter(name => !gradingFrameworks.includes(name));
    if (missingInGrading.length > 0) {
      issues.push({
        id: 'frameworks-missing-in-grading',
        severity: 'high',
        category: 'consistency',
        agent: 'grader',
        field: 'frameworkScores',
        description: `Frameworks detected in classification but missing in grading: ${missingInGrading.join(', ')}`,
        suggestion: 'Ensure all detected frameworks are graded',
        autoFixable: false
      });
    }

    return missingInGrading.length === 0;
  }

  private checkScoreReasonableness(
    results: ValidationInput['results'],
    rules: ValidationInput['crossValidationRules'],
    issues: ValidationIssue[]
  ): boolean {
    if (!rules.requireScoreReasonableness) return true;

    const grading = results.grading;
    if (!grading) return true;

    let reasonable = true;

    // Check if overall score aligns with framework scores
    if (grading.frameworkScores && grading.frameworkScores.length > 0) {
      const avgFrameworkScore = grading.frameworkScores.reduce((sum, fs) => sum + fs.overallScore, 0) / grading.frameworkScores.length;
      const scoreDifference = Math.abs(grading.overallComplianceScore - avgFrameworkScore);

      if (scoreDifference > 20) {
        issues.push({
          id: 'unreasonable-overall-score',
          severity: 'medium',
          category: 'logical_flow',
          agent: 'grader',
          field: 'overallComplianceScore',
          description: `Overall score (${grading.overallComplianceScore}) significantly differs from average framework score (${avgFrameworkScore.toFixed(1)})`,
          suggestion: 'Review overall score calculation logic',
          autoFixable: true
        });
        reasonable = false;
      }
    }

    return reasonable;
  }

  private checkRecommendationAlignment(
    results: ValidationInput['results'],
    rules: ValidationInput['crossValidationRules'],
    issues: ValidationIssue[]
  ): boolean {
    if (!rules.requireRecommendationFeasibility) return true;

    const grading = results.grading;
    const improvement = results.improvement;

    if (!grading || !improvement) return true;

    let aligned = true;

    // Check if recommendations address identified gaps
    const criticalGaps = grading.prioritizedGaps?.filter(gap => gap.severity === 'critical') || [];
    const recommendedFrameworks = improvement.recommendations?.flatMap(r => r.impact.frameworksAffected) || [];

    const unaddressedCriticalGaps = criticalGaps.filter(gap =>
      !recommendedFrameworks.includes(gap.framework)
    );

    if (unaddressedCriticalGaps.length > 0) {
      issues.push({
        id: 'unaddressed-critical-gaps',
        severity: 'high',
        category: 'feasibility',
        agent: 'improvement',
        field: 'recommendations',
        description: `Critical gaps not addressed by recommendations: ${unaddressedCriticalGaps.map(g => g.requirement).join(', ')}`,
        suggestion: 'Generate recommendations for all critical gaps',
        autoFixable: false
      });
      aligned = false;
    }

    return aligned;
  }

  private calculateOverallQuality(
    agentValidation: ValidationOutput['agentValidation'],
    crossValidation: ValidationOutput['crossValidation']
  ): ValidationOutput['overall'] {
    const agentConfidences = Object.values(agentValidation).map(av => av.confidence);
    const avgAgentConfidence = agentConfidences.reduce((sum, conf) => sum + conf, 0) / agentConfidences.length;

    const crossValidationSuccess = [
      crossValidation.frameworkConsistency.consistent,
      crossValidation.scoreReasonableness.reasonable,
      crossValidation.recommendationAlignment.aligned
    ];
    const crossValidationScore = crossValidationSuccess.filter(Boolean).length / crossValidationSuccess.length;

    const overallConfidence = (avgAgentConfidence + crossValidationScore) / 2;
    const qualityScore = Math.round(overallConfidence * 100);

    const allValid = Object.values(agentValidation).every(av => av.valid) &&
                    crossValidationSuccess.every(Boolean);

    return {
      valid: allValid,
      confidence: overallConfidence,
      qualityScore
    };
  }

  private generateSummary(
    agentValidation: ValidationOutput['agentValidation'],
    crossValidation: ValidationOutput['crossValidation']
  ): ValidationOutput['summary'] {
    const allIssues = [
      ...Object.values(agentValidation).flatMap(av => av.issues),
      ...Object.values(crossValidation).flatMap(cv => cv.issues)
    ];

    const criticalIssues = allIssues.filter(i => i.severity === 'critical').length;
    const highIssues = allIssues.filter(i => i.severity === 'high').length;
    const autoFixableIssues = allIssues.filter(i => i.autoFixable).length;

    const recommendedActions: string[] = [];

    if (criticalIssues > 0) {
      recommendedActions.push('Address critical issues immediately before proceeding');
    }
    if (highIssues > 0) {
      recommendedActions.push('Review and fix high-severity issues');
    }
    if (autoFixableIssues > 0) {
      recommendedActions.push(`${autoFixableIssues} issues can be automatically fixed`);
    }
    if (allIssues.length === 0) {
      recommendedActions.push('Results validation passed - proceed with confidence');
    }

    return {
      totalIssues: allIssues.length,
      criticalIssues,
      highIssues,
      autoFixableIssues,
      recommendedActions
    };
  }

  private initializeValidationRules(): Record<string, any> {
    return {
      scoreBounds: {
        min: 0,
        max: 100
      },
      confidenceThresholds: {
        minimum: 0.3,
        good: 0.7,
        excellent: 0.9
      },
      frameworkConsistency: {
        allowMissingInGrading: false,
        allowMissingInImprovement: true
      },
      recommendationQuality: {
        minimumImplementationSteps: 1,
        minimumEffortHours: 1,
        requireResourcesList: true
      }
    };
  }
}

export { ValidationAgent };