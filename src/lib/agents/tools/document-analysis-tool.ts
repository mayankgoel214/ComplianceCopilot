import { z } from "zod";
import { BaseTool } from "./base-tool";
import { getDocumentProcessor } from "../../processing/document-processor";
import { getGeminiService } from "../../ai/gemini-service";

const DocumentAnalysisSchema = z.object({
  documentId: z.string(),
  projectId: z.string(),
  analysisType: z
    .enum(["compliance", "risk", "content", "structure"])
    .optional()
    .default("compliance"),
  focusAreas: z.array(z.string()).optional().default([]),
  extractMetadata: z.boolean().optional().default(true),
});

export class DocumentAnalysisTool extends BaseTool {
  constructor() {
    super({
      name: "document_analysis",
      description:
        "Analyze documents for compliance requirements, risk factors, and relevant content extraction",
      schema: DocumentAnalysisSchema,
      category: "analysis",
      dependencies: ["vector_retrieval"],
      fallbackConfig: {
        enabled: true,
        maxRetries: 2,
        retryDelayMs: 1500,
        circuitBreakerThreshold: 3,
      },
    });
  }

  protected async _call(arg: string): Promise<string> {
    try {
      const input = JSON.parse(arg);
      const {
        documentId,
        projectId,
        analysisType,
        focusAreas,
        extractMetadata,
      } = DocumentAnalysisSchema.parse(input);

      const documentProcessor = getDocumentProcessor();
      const geminiService = getGeminiService();

      // Get document content (this would typically retrieve from database)
      const documentContent = await this.getDocumentContent(
        documentId,
        projectId
      );

      if (!documentContent) {
        throw new Error(
          `Document ${documentId} not found in project ${projectId}`
        );
      }

      // Perform analysis based on type
      let analysisResult;
      switch (analysisType) {
        case "compliance":
          analysisResult = await this.analyzeCompliance(
            documentContent,
            focusAreas
          );
          break;
        case "risk":
          analysisResult = await this.analyzeRisk(documentContent, focusAreas);
          break;
        case "content":
          analysisResult = await this.analyzeContent(
            documentContent,
            focusAreas
          );
          break;
        case "structure":
          analysisResult = await this.analyzeStructure(documentContent);
          break;
        default:
          analysisResult = await this.analyzeCompliance(
            documentContent,
            focusAreas
          );
      }

      // Extract metadata if requested
      let metadata = {};
      if (extractMetadata) {
        metadata = await this.extractMetadata(documentContent);
      }

      const response = {
        documentId,
        analysisType,
        result: analysisResult,
        metadata,
        timestamp: new Date().toISOString(),
        processingTime: Date.now(),
      };

      return JSON.stringify(response, null, 2);
    } catch (error) {
      throw new Error(
        `Document analysis failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async getDocumentContent(
    documentId: string,
    projectId: string
  ): Promise<string | null> {
    // This is a mock implementation. In practice, you would retrieve from your database
    // and potentially use the existing document processing pipeline

    // Simulate document retrieval
    const mockDocuments: Record<string, string> = {
      doc1: "This is a privacy policy document containing information about data collection, processing, and retention practices...",
      doc2: "Research protocol for studying user behavior in educational applications with participant consent procedures...",
      doc3: "Terms of service document outlining user rights, data usage, and compliance with educational privacy regulations...",
    };

    return mockDocuments[documentId] || null;
  }

  private async analyzeCompliance(
    content: string,
    focusAreas: string[]
  ): Promise<any> {
    // Mock compliance analysis
    const complianceIndicators = {
      dataCollection:
        content.toLowerCase().includes("data") ||
        content.toLowerCase().includes("collect"),
      consent:
        content.toLowerCase().includes("consent") ||
        content.toLowerCase().includes("agree"),
      privacy:
        content.toLowerCase().includes("privacy") ||
        content.toLowerCase().includes("personal"),
      retention:
        content.toLowerCase().includes("retain") ||
        content.toLowerCase().includes("delete"),
      access:
        content.toLowerCase().includes("access") ||
        content.toLowerCase().includes("view"),
      security:
        content.toLowerCase().includes("security") ||
        content.toLowerCase().includes("encrypt"),
    };

    const frameworksDetected = [];
    if (complianceIndicators.privacy && complianceIndicators.consent) {
      frameworksDetected.push("FERPA", "GDPR");
    }
    if (complianceIndicators.security) {
      frameworksDetected.push("SOC 2", "ISO 27001");
    }

    return {
      complianceScore:
        Object.values(complianceIndicators).filter(Boolean).length /
        Object.keys(complianceIndicators).length,
      indicators: complianceIndicators,
      frameworksDetected,
      gaps: this.identifyComplianceGaps(complianceIndicators),
      recommendations: this.generateComplianceRecommendations(
        complianceIndicators,
        focusAreas
      ),
    };
  }

  private async analyzeRisk(
    content: string,
    focusAreas: string[]
  ): Promise<any> {
    const riskFactors = {
      personalData:
        content.toLowerCase().includes("personal") ||
        content.toLowerCase().includes("pii"),
      minors:
        content.toLowerCase().includes("minor") ||
        content.toLowerCase().includes("child"),
      international:
        content.toLowerCase().includes("international") ||
        content.toLowerCase().includes("global"),
      sensitive:
        content.toLowerCase().includes("sensitive") ||
        content.toLowerCase().includes("confidential"),
      financial:
        content.toLowerCase().includes("payment") ||
        content.toLowerCase().includes("financial"),
      health:
        content.toLowerCase().includes("health") ||
        content.toLowerCase().includes("medical"),
    };

    const riskLevel = this.calculateRiskLevel(riskFactors);

    return {
      riskLevel,
      riskFactors,
      criticalIssues: this.identifyCriticalIssues(riskFactors),
      mitigationStrategies: this.generateMitigationStrategies(
        riskFactors,
        focusAreas
      ),
    };
  }

  private async analyzeContent(
    content: string,
    focusAreas: string[]
  ): Promise<any> {
    const contentFeatures = {
      wordCount: content.split(/\s+/).length,
      hasStructure: content.includes("\n\n") || content.includes("\t"),
      hasPolicies:
        content.toLowerCase().includes("policy") ||
        content.toLowerCase().includes("procedure"),
      hasLegalLanguage:
        content.toLowerCase().includes("shall") ||
        content.toLowerCase().includes("must"),
      hasContactInfo: content.includes("@") || content.includes("phone"),
      hasDateReferences: /\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(content),
    };

    return {
      contentType: this.determineContentType(contentFeatures),
      features: contentFeatures,
      keyTerms: this.extractKeyTerms(content, focusAreas),
      summary: this.generateContentSummary(content),
    };
  }

  private async analyzeStructure(content: string): Promise<any> {
    const structure = {
      sections: content.split("\n\n").length,
      hasHeaders: /^[A-Z][A-Z\s]{2,}$/m.test(content),
      hasBulletPoints:
        content.includes("•") || content.includes("*") || content.includes("-"),
      hasNumberedLists: /^\d+\./.test(content),
      paragraphCount: content
        .split("\n")
        .filter((line) => line.trim().length > 50).length,
    };

    return {
      documentStructure: structure,
      readabilityScore: this.calculateReadabilityScore(content),
      organizationLevel: this.assessOrganizationLevel(structure),
    };
  }

  private async extractMetadata(content: string): Promise<any> {
    return {
      language: "english", // Would use language detection in practice
      documentLength: content.length,
      estimatedReadingTime: Math.ceil(content.split(/\s+/).length / 200), // minutes
      lastModified: new Date().toISOString(),
      contentHash: content.substring(0, 10), // Simple hash for demo
    };
  }

  private identifyComplianceGaps(
    indicators: Record<string, boolean>
  ): string[] {
    const gaps = [];
    if (!indicators.consent) gaps.push("Missing explicit consent mechanisms");
    if (!indicators.privacy) gaps.push("Insufficient privacy disclosures");
    if (!indicators.retention) gaps.push("No data retention policy specified");
    if (!indicators.security) gaps.push("Security measures not documented");
    return gaps;
  }

  private generateComplianceRecommendations(
    indicators: Record<string, boolean>,
    focusAreas: string[]
  ): string[] {
    const recommendations = [];
    if (!indicators.consent)
      recommendations.push("Implement clear consent collection workflows");
    if (!indicators.privacy)
      recommendations.push("Add comprehensive privacy notice");
    if (!indicators.security)
      recommendations.push(
        "Document security controls and encryption practices"
      );
    return recommendations;
  }

  private calculateRiskLevel(
    factors: Record<string, boolean>
  ): "low" | "medium" | "high" | "critical" {
    const riskCount = Object.values(factors).filter(Boolean).length;
    if (riskCount >= 4) return "critical";
    if (riskCount >= 3) return "high";
    if (riskCount >= 2) return "medium";
    return "low";
  }

  private identifyCriticalIssues(factors: Record<string, boolean>): string[] {
    const issues = [];
    if (factors.minors)
      issues.push("Involvement of minors requires additional protections");
    if (factors.health)
      issues.push("Health data handling requires HIPAA compliance");
    if (factors.international)
      issues.push(
        "International data transfers need privacy framework compliance"
      );
    return issues;
  }

  private generateMitigationStrategies(
    factors: Record<string, boolean>,
    focusAreas: string[]
  ): string[] {
    const strategies = [];
    if (factors.personalData)
      strategies.push("Implement data minimization principles");
    if (factors.sensitive)
      strategies.push("Apply enhanced security controls for sensitive data");
    if (factors.minors)
      strategies.push("Obtain parental consent and implement age verification");
    return strategies;
  }

  private determineContentType(features: any): string {
    if (features.hasPolicies && features.hasLegalLanguage)
      return "policy_document";
    if (features.hasStructure && features.hasContactInfo)
      return "procedural_document";
    if (features.hasDateReferences) return "temporal_document";
    return "general_document";
  }

  private extractKeyTerms(content: string, focusAreas: string[]): string[] {
    const words = content.toLowerCase().split(/\W+/);
    const complianceTerms = [
      "privacy",
      "data",
      "consent",
      "security",
      "access",
      "retention",
      "breach",
      "audit",
    ];
    const keyTerms = words.filter(
      (word) =>
        complianceTerms.includes(word) ||
        focusAreas.some((area) => word.includes(area.toLowerCase()))
    );
    return [...new Set(keyTerms)].slice(0, 10);
  }

  private generateContentSummary(content: string): string {
    const sentences = content.split(".").filter((s) => s.trim().length > 20);
    return sentences.slice(0, 2).join(".") + ".";
  }

  private calculateReadabilityScore(content: string): number {
    // Simple readability calculation
    const words = content.split(/\s+/).length;
    const sentences = content.split(/[.!?]+/).length;
    const avgWordsPerSentence = words / sentences;
    return Math.max(0, Math.min(100, 100 - avgWordsPerSentence * 2));
  }

  private assessOrganizationLevel(
    structure: any
  ): "poor" | "fair" | "good" | "excellent" {
    let score = 0;
    if (structure.hasHeaders) score += 25;
    if (structure.hasBulletPoints) score += 25;
    if (structure.hasNumberedLists) score += 25;
    if (structure.sections > 2) score += 25;

    if (score >= 75) return "excellent";
    if (score >= 50) return "good";
    if (score >= 25) return "fair";
    return "poor";
  }

  async healthCheck(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      const geminiService = getGeminiService();
      const isHealthy = await geminiService.isHealthy();

      if (!isHealthy) {
        issues.push("Gemini service is not healthy");
      }

      return {
        status: issues.length === 0 ? "healthy" : "degraded",
        issues,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        issues: [
          error instanceof Error ? error.message : "Health check failed",
        ],
      };
    }
  }
}
