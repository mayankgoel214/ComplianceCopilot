import { BaseAgent } from "../base/base-agent";
import { AgentMetadata, AgentInput, AgentContext } from "../base/types";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { Tool } from "@langchain/core/tools";
import { VectorRetrievalTool, WebSearchTool, getAgentTools } from "../tools";
import { z } from "zod";
import { testingDataService } from "../../services/testing-data-service";

export interface ClassificationInput {
  projectDescription: string;
  documentContent: string;
  existingFrameworks?: string[];
  analysisDepth?: "quick" | "thorough" | "comprehensive";
}

export interface ClassificationOutput {
  detectedFrameworks: Array<{
    name: string;
    confidence: number;
    relevanceScore: number;
    reasoning: string;
    requirements: string[];
    priority: "critical" | "high" | "medium" | "low";
  }>;
  overallAssessment: {
    primaryDomain: string;
    riskLevel: "low" | "medium" | "high" | "critical";
    recommendedStartFrameworks: string[];
  };
  analysisMetadata: {
    documentsAnalyzed: number;
    vectorSearchResults: number;
    webSearchQueries: number;
    processingTime: number;
  };
}

const ClassificationInputSchema = z.object({
  projectDescription: z.string(),
  documentContent: z.string(),
  existingFrameworks: z.array(z.string()).optional(),
  analysisDepth: z
    .enum(["quick", "thorough", "comprehensive"])
    .optional()
    .default("thorough"),
});

export class ClassificationAgent extends BaseAgent<
  ClassificationInput,
  ClassificationOutput
> {
  constructor(projectId: string) {
    const metadata: AgentMetadata = {
      id: `classification-agent-${projectId}`,
      name: "Compliance Framework Classification Agent",
      description:
        "Determines applicable compliance frameworks using vector similarity and AI analysis",
      version: "1.0.0",
      capabilities: [
        {
          name: "framework_detection",
          description:
            "Detect relevant compliance frameworks from project description and documents",
          inputSchema: ClassificationInputSchema,
          outputSchema: z.object({
            detectedFrameworks: z.array(
              z.object({
                name: z.string(),
                confidence: z.number(),
                relevanceScore: z.number(),
                reasoning: z.string(),
                requirements: z.array(z.string()),
                priority: z.enum(["critical", "high", "medium", "low"]),
              })
            ),
            overallAssessment: z.object({
              primaryDomain: z.string(),
              riskLevel: z.enum(["low", "medium", "high", "critical"]),
              recommendedStartFrameworks: z.array(z.string()),
            }),
            analysisMetadata: z.object({
              documentsAnalyzed: z.number(),
              vectorSearchResults: z.number(),
              webSearchQueries: z.number(),
              processingTime: z.number(),
            }),
          }),
        },
      ],
      dependencies: ["chromadb", "gemini-embeddings"],
      tags: ["classification", "compliance", "framework-detection", projectId],
    };

    super(metadata);
  }

  protected async initializeTools(): Promise<Tool[]> {
    return getAgentTools(this.metadata.id);
  }

  protected createPrompt(): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are a compliance framework classification expert. Your role is to analyze project descriptions and documents to identify relevant compliance frameworks.

AVAILABLE FRAMEWORKS:
- FERPA: Educational records privacy (US education)
- HIPAA: Health information privacy (US healthcare)
- GDPR: General data protection (EU)
- COPPA: Children's online privacy (US, under 13)
- SOC 2: Security controls (service organizations)
- ISO 27001: Information security management
- IRB/Human Subjects: Research ethics
- Section 508: Digital accessibility (US federal)
- ITAR: Export control (defense articles)
- EAR: Export administration (dual-use items)
- CCPA: California consumer privacy
- PIPEDA: Personal information protection (Canada)

ANALYSIS PROCESS:
1. Use vector_retrieval tool to find similar compliance scenarios
2. Use web_search tool for current compliance information
3. Analyze project context for regulatory triggers
4. Calculate confidence scores based on evidence
5. Prioritize frameworks by implementation urgency

SCORING CRITERIA:
- Confidence: How certain you are this framework applies (0.0-1.0)
- Relevance: How important this framework is to the project (0.0-1.0)
- Priority: Implementation urgency (critical/high/medium/low)

RESPOND WITH: Structured analysis including detected frameworks, confidence scores, reasoning, and recommendations.`,
      ],
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);
  }

  protected async preprocessInput(
    input: AgentInput<ClassificationInput>
  ): Promise<AgentInput<ClassificationInput>> {
    try {
      // Validate and sanitize input schema
      const validatedData = ClassificationInputSchema.parse(input.data);

      // Additional sanitization
      const sanitizedData: ClassificationInput = {
        projectDescription: (validatedData.projectDescription || "")
          .trim()
          .substring(0, 10000), // Limit length
        documentContent: (validatedData.documentContent || "")
          .trim()
          .substring(0, 50000), // Limit length
        existingFrameworks:
          validatedData.existingFrameworks
            ?.map((f) => f.trim())
            .filter((f) => f.length > 0) || [],
        analysisDepth: validatedData.analysisDepth || "thorough",
      };

      return { ...input, data: sanitizedData };
    } catch (error) {
      console.error("Classification agent input preprocessing failed:", error);
      throw new Error(
        `Input validation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  protected async postprocessOutput(
    result: any,
    input: AgentInput<ClassificationInput>
  ): Promise<ClassificationOutput> {
    const startTime = Date.now();

    try {
      // Check if testing mode is enabled
      if (testingDataService.isTestingMode()) {
        console.log("🔧 Testing mode enabled - returning hardcoded classification results");
        return this.createTestingModeResponse(input.data, startTime);
      }

      // Normal AI processing
      // Parse the AI response and structure it properly
      const aiResponse = result.output || result.text || "";

      // Try to parse frameworks from AI response first
      let detectedFrameworks: ClassificationOutput["detectedFrameworks"] = [];

      if (aiResponse && aiResponse.trim()) {
        // First attempt: Parse structured AI response
        detectedFrameworks = await this.parseAIResponse(aiResponse);
      }

      // If AI parsing failed or returned empty results, use keyword-based fallback
      if (detectedFrameworks.length === 0) {
        console.log(
          "AI response was empty or failed, using keyword fallback for classification"
        );
        console.log("Input data for fallback:", {
          projectDescription: input.data.projectDescription?.substring(0, 200),
          documentContentLength: input.data.documentContent?.length,
          documentContentPreview: input.data.documentContent?.substring(0, 200)
        });
        detectedFrameworks = await this.extractFrameworksFromResponse(
          aiResponse,
          input.data.projectDescription,
          input.data.documentContent
        );
        console.log("Keyword-based detected frameworks:", detectedFrameworks);
      }

      // Perform overall assessment
      const overallAssessment = this.performOverallAssessment(
        detectedFrameworks,
        input.data
      );

      // Get metadata from intermediate steps
      const analysisMetadata = this.extractAnalysisMetadata(
        result.intermediateSteps || []
      );

      return {
        detectedFrameworks,
        overallAssessment,
        analysisMetadata: {
          ...analysisMetadata,
          processingTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      console.error("Error in classification postprocessing:", error);

      // Return fallback response with basic framework detection
      return this.createFallbackResponse(input.data);
    }
  }

  protected formatInputForAgent(
    input: AgentInput<ClassificationInput>
  ): string {
    const {
      projectDescription,
      documentContent,
      existingFrameworks,
      analysisDepth,
    } = input.data;

    return `CLASSIFICATION REQUEST:

PROJECT DESCRIPTION:
${projectDescription}

DOCUMENT CONTENT:
${documentContent}

EXISTING FRAMEWORKS: ${existingFrameworks?.join(", ") || "None specified"}
ANALYSIS DEPTH: ${analysisDepth}

Please analyze this project and identify applicable compliance frameworks. Use vector search to find similar compliance scenarios and web search for current requirements.

For each relevant framework, provide:
1. Framework name
2. Confidence score (0.0-1.0)
3. Relevance score (0.0-1.0)
4. Detailed reasoning
5. Key requirements
6. Implementation priority

Focus on frameworks most relevant to the project context and regulatory environment.`;
  }

  private async parseAIResponse(
    aiResponse: string
  ): Promise<ClassificationOutput["detectedFrameworks"]> {
    try {
      // Try to extract structured framework information from AI response
      const frameworks: ClassificationOutput["detectedFrameworks"] = [];

      // Look for framework mentions in the AI response
      const frameworkNames = [
        "FERPA",
        "HIPAA",
        "GDPR",
        "COPPA",
        "IRB",
        "SOC 2",
        "ISO 27001",
        "Section 508",
        "ITAR",
        "EAR",
        "CCPA",
        "PIPEDA",
      ];

      for (const frameworkName of frameworkNames) {
        // Check if framework is mentioned in AI response
        const regex = new RegExp(`\\b${frameworkName}\\b`, "i");
        const match = aiResponse.match(regex);

        if (match) {
          // Extract confidence if mentioned
          const confidenceMatch = aiResponse.match(
            new RegExp(
              `${frameworkName}[^.]*confidence[^.]*?(\\d+(?:\\.\\d+)?)`,
              "i"
            )
          );
          const confidence = confidenceMatch
            ? parseFloat(confidenceMatch[1]) / 100
            : 0.8;

          // Extract priority if mentioned
          const priorityMatch = aiResponse.match(
            new RegExp(`${frameworkName}[^.]*?(critical|high|medium|low)`, "i")
          );
          const priority =
            (priorityMatch?.[1]?.toLowerCase() as
              | "critical"
              | "high"
              | "medium"
              | "low") || "medium";

          frameworks.push({
            name: frameworkName,
            confidence: Math.min(confidence, 1.0),
            relevanceScore: confidence * 0.9, // Slightly lower than confidence
            reasoning: `Identified by AI analysis: ${frameworkName} applies to this project context`,
            requirements: this.getFrameworkRequirements(frameworkName),
            priority,
          });
        }
      }

      return frameworks.sort(
        (a, b) =>
          b.confidence * b.relevanceScore - a.confidence * a.relevanceScore
      );
    } catch (error) {
      console.error("Error parsing AI response:", error);
      return [];
    }
  }

  private getFrameworkRequirements(frameworkName: string): string[] {
    const frameworkDatabase = this.getFrameworkDatabase();
    return (
      frameworkDatabase[frameworkName]?.keyRequirements || [
        "Review compliance requirements",
      ]
    );
  }

  private async extractFrameworksFromResponse(
    aiResponse: string,
    projectDescription: string,
    documentContent: string
  ): Promise<ClassificationOutput["detectedFrameworks"]> {
    // Knowledge base of frameworks with their triggers
    const frameworkDatabase = this.getFrameworkDatabase();

    const detectedFrameworks: ClassificationOutput["detectedFrameworks"] = [];

    // Analyze content for framework triggers
    const combinedContent =
      `${projectDescription} ${documentContent}`.toLowerCase();

    for (const [frameworkName, frameworkInfo] of Object.entries(
      frameworkDatabase
    )) {
      const matches = frameworkInfo.triggers.filter((trigger) =>
        combinedContent.includes(trigger.toLowerCase())
      );

      if (matches.length > 0) {
        const confidence = Math.min(0.95, 0.3 + matches.length * 0.15);
        const relevanceScore = this.calculateRelevanceScore(
          matches,
          frameworkInfo,
          combinedContent
        );

        detectedFrameworks.push({
          name: frameworkName,
          confidence,
          relevanceScore,
          reasoning: `Detected based on: ${matches.join(", ")}. ${
            frameworkInfo.description
          }`,
          requirements: frameworkInfo.keyRequirements,
          priority: this.determinePriority(
            confidence,
            relevanceScore,
            frameworkInfo.riskLevel
          ),
        });
      }
    }

    // Sort by relevance and confidence
    detectedFrameworks.sort(
      (a, b) =>
        b.relevanceScore * b.confidence - a.relevanceScore * a.confidence
    );

    return detectedFrameworks.slice(0, 8); // Return top 8 most relevant
  }

  private getFrameworkDatabase(): Record<string, any> {
    return {
      FERPA: {
        description:
          "Family Educational Rights and Privacy Act - protects student educational records",
        triggers: [
          "student",
          "education",
          "school",
          "university",
          "academic",
          "grade",
          "transcript",
          "enrollment",
        ],
        keyRequirements: [
          "Student consent",
          "Directory information policies",
          "Access controls",
          "Audit logs",
        ],
        riskLevel: "high",
      },
      HIPAA: {
        description:
          "Health Insurance Portability and Accountability Act - protects health information",
        triggers: [
          "health",
          "medical",
          "patient",
          "healthcare",
          "clinical",
          "diagnosis",
          "treatment",
        ],
        keyRequirements: [
          "Data encryption",
          "Access controls",
          "Audit logs",
          "Business associate agreements",
        ],
        riskLevel: "critical",
      },
      GDPR: {
        description:
          "General Data Protection Regulation - EU data protection law",
        triggers: [
          "personal data",
          "eu",
          "europe",
          "privacy",
          "consent",
          "data subject",
        ],
        keyRequirements: [
          "Lawful basis",
          "Consent management",
          "Data subject rights",
          "Privacy by design",
        ],
        riskLevel: "high",
      },
      COPPA: {
        description:
          "Children's Online Privacy Protection Act - protects children under 13",
        triggers: [
          "children",
          "kids",
          "minor",
          "under 13",
          "parental",
          "child",
        ],
        keyRequirements: [
          "Parental consent",
          "Data minimization",
          "Safe harbor",
          "Age verification",
        ],
        riskLevel: "critical",
      },
      IRB: {
        description:
          "Institutional Review Board - human subjects research oversight",
        triggers: [
          "research",
          "human subjects",
          "study",
          "participant",
          "survey",
          "experiment",
        ],
        keyRequirements: [
          "IRB approval",
          "Informed consent",
          "Risk assessment",
          "Data security",
        ],
        riskLevel: "high",
      },
      "SOC 2": {
        description:
          "Service Organization Control 2 - security controls for service providers",
        triggers: [
          "service provider",
          "cloud",
          "security controls",
          "audit",
          "third party",
        ],
        keyRequirements: [
          "Security controls",
          "Monitoring",
          "Risk assessment",
          "Vendor management",
        ],
        riskLevel: "medium",
      },
      "ISO 27001": {
        description: "Information Security Management System standard",
        triggers: [
          "information security",
          "isms",
          "security management",
          "iso",
        ],
        keyRequirements: [
          "Security policy",
          "Risk management",
          "Access controls",
          "Incident response",
        ],
        riskLevel: "medium",
      },
      "Section 508": {
        description: "Federal accessibility requirements for digital content",
        triggers: [
          "accessibility",
          "disability",
          "ada",
          "wcag",
          "federal",
          "government",
        ],
        keyRequirements: [
          "WCAG compliance",
          "Alt text",
          "Keyboard navigation",
          "Screen reader support",
        ],
        riskLevel: "medium",
      },
    };
  }

  private calculateRelevanceScore(
    matches: string[],
    frameworkInfo: any,
    content: string
  ): number {
    let score = 0.4; // Base score for any match

    // Boost score based on number of matches
    score += Math.min(0.3, matches.length * 0.1);

    // Boost score based on framework risk level
    if (frameworkInfo.riskLevel === "critical") score += 0.2;
    else if (frameworkInfo.riskLevel === "high") score += 0.1;

    // Boost score if multiple trigger words appear close together
    const triggerDensity = this.calculateTriggerDensity(matches, content);
    score += triggerDensity * 0.1;

    return Math.min(1.0, score);
  }

  private calculateTriggerDensity(matches: string[], content: string): number {
    // Simple density calculation - could be improved
    const totalWords = content.split(/\s+/).length;
    const triggerWords = matches.length;
    return Math.min(1.0, (triggerWords / totalWords) * 100);
  }

  private determinePriority(
    confidence: number,
    relevance: number,
    riskLevel: string
  ): "critical" | "high" | "medium" | "low" {
    const combinedScore = confidence * relevance;

    if (riskLevel === "critical" && combinedScore > 0.6) return "critical";
    if (riskLevel === "critical" || combinedScore > 0.8) return "high";
    if (combinedScore > 0.6) return "high";
    if (combinedScore > 0.4) return "medium";
    return "low";
  }

  private performOverallAssessment(
    frameworks: ClassificationOutput["detectedFrameworks"],
    input: ClassificationInput
  ): ClassificationOutput["overallAssessment"] {
    // Determine primary domain
    const domains = frameworks.map((f) => this.getDomainForFramework(f.name));
    const primaryDomain = this.getMostCommonDomain(domains);

    // Determine overall risk level
    const highestPriority = frameworks.reduce((highest, current) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[current.priority] > priorityOrder[highest]
        ? current.priority
        : highest;
    }, "low" as const);

    const riskLevel = this.mapPriorityToRisk(highestPriority);

    // Recommend starting frameworks (top 3 by priority and confidence)
    const recommendedStartFrameworks = frameworks
      .filter((f) => f.priority === "critical" || f.priority === "high")
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map((f) => f.name);

    return {
      primaryDomain,
      riskLevel,
      recommendedStartFrameworks,
    };
  }

  private getDomainForFramework(frameworkName: string): string {
    const domainMap: Record<string, string> = {
      FERPA: "education",
      HIPAA: "healthcare",
      GDPR: "data_protection",
      COPPA: "child_protection",
      IRB: "research",
      "SOC 2": "security",
      "ISO 27001": "security",
      "Section 508": "accessibility",
    };
    return domainMap[frameworkName] || "general";
  }

  private getMostCommonDomain(domains: string[]): string {
    const counts = domains.reduce((acc, domain) => {
      acc[domain] = (acc[domain] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return (
      Object.entries(counts).reduce((a, b) => (a[1] > b[1] ? a : b))[0] ||
      "general"
    );
  }

  private mapPriorityToRisk(
    priority: string
  ): "low" | "medium" | "high" | "critical" {
    const mapping: Record<string, "low" | "medium" | "high" | "critical"> = {
      critical: "critical",
      high: "high",
      medium: "medium",
      low: "low",
    };
    return mapping[priority] || "low";
  }

  private extractAnalysisMetadata(
    intermediateSteps: any[]
  ): Omit<ClassificationOutput["analysisMetadata"], "processingTime"> {
    let vectorSearchResults = 0;
    let webSearchQueries = 0;

    for (const step of intermediateSteps) {
      if (step.action?.tool === "vector_retrieval") {
        vectorSearchResults++;
      } else if (step.action?.tool === "web_search") {
        webSearchQueries++;
      }
    }

    return {
      documentsAnalyzed: 1, // For now, analyzing one document at a time
      vectorSearchResults,
      webSearchQueries,
    };
  }

  private createFallbackResponse(
    input: ClassificationInput
  ): ClassificationOutput {
    // Use keyword-based detection as fallback instead of generic response
    const fallbackFrameworks = this.extractFrameworksFromResponse(
      "", // empty AI response
      input.projectDescription,
      input.documentContent
    );

    // If keyword detection found frameworks, use those
    if (fallbackFrameworks.length > 0) {
      return {
        detectedFrameworks: fallbackFrameworks,
        overallAssessment: this.performOverallAssessment(fallbackFrameworks, input),
        analysisMetadata: {
          documentsAnalyzed: 1,
          vectorSearchResults: 0,
          webSearchQueries: 0,
          processingTime: 0,
        },
      };
    }

    // Only return generic if absolutely no frameworks detected
    return {
      detectedFrameworks: [
        {
          name: "General Compliance Review",
          confidence: 0.3,
          relevanceScore: 0.3,
          reasoning: "No specific frameworks detected - manual review recommended",
          requirements: [
            "Review project for applicable regulations",
            "Assess data handling practices",
            "Implement basic security controls",
          ],
          priority: "low",
        },
      ],
      overallAssessment: {
        primaryDomain: "general",
        riskLevel: "low",
        recommendedStartFrameworks: ["General Compliance Review"],
      },
      analysisMetadata: {
        documentsAnalyzed: 1,
        vectorSearchResults: 0,
        webSearchQueries: 0,
        processingTime: 0,
      },
    };
  }

  /**
   * Create testing mode response with hardcoded classification results
   */
  private createTestingModeResponse(
    input: ClassificationInput,
    startTime: number
  ): ClassificationOutput {
    const testingFrameworks = testingDataService.getClassificationFrameworks();

    // Convert testing frameworks to classification output format
    const detectedFrameworks: ClassificationOutput["detectedFrameworks"] = testingFrameworks.map(framework => ({
      name: framework.name,
      confidence: framework.confidence,
      relevanceScore: framework.relevanceScore,
      reasoning: framework.reasoning,
      requirements: framework.requirements,
      priority: framework.priority,
    }));

    // Perform overall assessment
    const overallAssessment = this.performOverallAssessment(
      detectedFrameworks,
      input
    );

    return {
      detectedFrameworks,
      overallAssessment,
      analysisMetadata: {
        documentsAnalyzed: 1,
        vectorSearchResults: 0, // No real vector search in testing mode
        webSearchQueries: 0, // No real web search in testing mode
        processingTime: Date.now() - startTime,
      },
    };
  }
}
