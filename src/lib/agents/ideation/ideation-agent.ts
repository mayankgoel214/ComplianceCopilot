import { BaseAgent } from "../base/base-agent";
import { AgentMetadata, AgentInput, AgentContext } from "../base/types";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { Tool } from "@langchain/core/tools";
import { VectorRetrievalTool, WebSearchTool, getAgentTools } from "../tools";
import { DynamicTool } from "@langchain/core/tools";
import { z } from "zod";
import { testingDataService } from "../../services/testing-data-service";

export interface IdeationInput {
  mode: "questions" | "chat";
  context: {
    projectDescription: string;
    detectedFrameworks?: string[];
    complianceGaps?: string[];
    userQuery?: string; // For chat mode
  };
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
  }>;
  maxQuestions?: number; // For questions mode
}

export interface QuestionOutput {
  questions: Array<{
    id: string;
    question: string;
    category:
      | "implementation"
      | "gap_filling"
      | "risk_clarification"
      | "process";
    priority: "high" | "medium" | "low";
    framework: string;
    reasoning: string;
    expectedAnswerType: "text" | "boolean" | "choice" | "numeric";
    followUpQuestions?: string[];
  }>;
  questioningStrategy: {
    overallGoal: string;
    progressiveDisclosure: boolean;
    adaptiveFollowUp: boolean;
  };
}

export interface ChatOutput {
  response: string;
  sources: Array<{
    type: "knowledge_base" | "web_search" | "framework_guide";
    title: string;
    content: string;
    confidence: number;
  }>;
  suggestedActions: string[];
  relatedTopics: string[];
}

export type IdeationOutput = QuestionOutput | ChatOutput;

const IdeationInputSchema = z.object({
  mode: z.enum(["questions", "chat"]),
  context: z.object({
    projectDescription: z.string(),
    detectedFrameworks: z.array(z.string()).optional(),
    complianceGaps: z.array(z.string()).optional(),
    userQuery: z.string().optional(),
  }),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        timestamp: z.date(),
      })
    )
    .optional(),
  maxQuestions: z.number().optional().default(5),
});

export class IdeationAgent extends BaseAgent<IdeationInput, IdeationOutput> {
  constructor(projectId: string) {
    const metadata: AgentMetadata = {
      id: `ideation-agent-${projectId}`,
      name: "Compliance Ideation Agent",
      description:
        "Generates clarifying questions and provides interactive compliance knowledge chat",
      version: "1.0.0",
      capabilities: [
        {
          name: "question_generation",
          description:
            "Generate targeted clarifying questions based on compliance gaps",
          inputSchema: IdeationInputSchema,
          outputSchema: z.object({
            questions: z.array(
              z.object({
                id: z.string(),
                question: z.string(),
                category: z.enum([
                  "implementation",
                  "gap_filling",
                  "risk_clarification",
                  "process",
                ]),
                priority: z.enum(["high", "medium", "low"]),
                framework: z.string(),
                reasoning: z.string(),
                expectedAnswerType: z.enum([
                  "text",
                  "boolean",
                  "choice",
                  "numeric",
                ]),
                followUpQuestions: z.array(z.string()).optional(),
              })
            ),
          }),
        },
        {
          name: "knowledge_chat",
          description:
            "Interactive Q&A based on compliance knowledge retrieval",
          inputSchema: IdeationInputSchema,
          outputSchema: z.object({
            response: z.string(),
            sources: z.array(
              z.object({
                type: z.enum([
                  "knowledge_base",
                  "web_search",
                  "framework_guide",
                ]),
                title: z.string(),
                content: z.string(),
                confidence: z.number(),
              })
            ),
            suggestedActions: z.array(z.string()),
            relatedTopics: z.array(z.string()),
          }),
        },
      ],
      dependencies: ["chromadb", "gemini-embeddings", "web-search"],
      tags: ["ideation", "questions", "knowledge", "interactive", projectId],
    };

    super(metadata);
  }

  protected async initializeTools(): Promise<Tool[]> {
    // Get the project ID from the agent metadata
    const projectId = this.metadata.tags.find(tag =>
      tag !== 'ideation' &&
      tag !== 'questions' &&
      tag !== 'knowledge' &&
      tag !== 'interactive'
    ) || '';

    // Create a project-specific vector retrieval tool
    const projectVectorTool = new DynamicTool({
      name: "vector_retrieval",
      description: "Search through uploaded compliance documents for this project using semantic similarity. Input should be a search query string.",
      func: async (query: string) => {
        try {
          // Create the base vector retrieval tool
          const vectorTool = new VectorRetrievalTool();

          // Prepare the input with the project ID automatically included
          const input = JSON.stringify({
            projectId: projectId,
            query: query,
            limit: 10,
            threshold: 0.3 // Much lower threshold to get more results (0.3 instead of 0.5)
          });

          // Call the tool
          const result = await vectorTool.call(input);

          // If no results found, be explicit about it
          if (result.includes("No chunks found") || result.includes("No relevant")) {
            return `No relevant information found in uploaded documents for query: "${query}". The documents may not contain information about this topic.`;
          }

          return result;
        } catch (error) {
          console.error('Vector retrieval error:', error);
          return `Error searching documents: ${error instanceof Error ? error.message : 'Unknown error'}. Please try a different search query.`;
        }
      },
    });

    // Get other standard tools
    const standardTools = getAgentTools(this.metadata.id).filter(
      tool => tool.name !== 'vector_retrieval'
    );

    // Return project-specific vector tool first, then other tools
    return [projectVectorTool, ...standardTools];
  }

  protected createPrompt(): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are a compliance ideation specialist with access to tools for searching documents and the web.

AVAILABLE TOOLS:
- vector_retrieval: Search through uploaded compliance documents using semantic search
  Usage: Call with just a search query string, e.g., "ebay compliance issues" or "data privacy requirements"
  The tool automatically searches the project's uploaded documents
- web_search: Search the internet for current information
- document_analysis: Analyze document structure and content

You operate in two primary modes:

QUESTIONS MODE:
Generate smart, targeted questions to fill compliance gaps and clarify implementation details.

Question Categories:
- IMPLEMENTATION REALITY CHECKS: Verify actual vs. stated practices
- GAP FILLING: Identify missing compliance elements
- RISK CLARIFICATION: Understand specific risk scenarios
- PROCESS: Clarify workflows and procedures

Question Guidelines:
- Be specific and actionable
- Avoid yes/no questions when possible
- Include context about why the question matters
- Suggest what a good answer should include
- Prioritize based on risk and compliance impact

CHAT MODE:
**IMPORTANT**: You MUST follow these steps for EVERY user query:
1. FIRST, use the vector_retrieval tool by calling it with the user's query or relevant search terms
   Example: If user asks "what are ebay's compliance issues?", call vector_retrieval with "ebay compliance issues"
2. If the vector search returns relevant results, base your response primarily on those results
3. Try multiple searches if needed with different keywords to find relevant information
4. If needed, supplement with web_search for additional current information
5. NEVER give generic responses without first searching the uploaded documents

Chat Guidelines:
- ALWAYS start by searching uploaded documents using vector_retrieval
- Only provide information based on actual search results
- Include specific citations from the documents you found
- If no relevant information is found, explicitly state that
- Be clear about what information comes from uploaded docs vs web search

Remember: Your primary job is to search through the user's uploaded compliance documents and provide answers based on what you find there, not to give generic advice.`,
      ],
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);
  }

  protected async preprocessInput(
    input: AgentInput<IdeationInput>
  ): Promise<AgentInput<IdeationInput>> {
    try {
      // Validate and sanitize input schema
      const validatedData = IdeationInputSchema.parse(input.data);

      // Additional sanitization
      const sanitizedData: IdeationInput = {
        mode: validatedData.mode,
        context: {
          projectDescription: (validatedData.context.projectDescription || "")
            .trim()
            .substring(0, 10000),
          detectedFrameworks:
            validatedData.context.detectedFrameworks
              ?.map((f) => f.trim())
              .filter((f) => f.length > 0) || [],
          complianceGaps:
            validatedData.context.complianceGaps
              ?.map((g) => g.trim())
              .filter((g) => g.length > 0) || [],
          userQuery: validatedData.context.userQuery
            ? validatedData.context.userQuery.trim().substring(0, 2000)
            : undefined,
        },
        conversationHistory: (validatedData.conversationHistory || []).map(
          (msg) => ({
            role: msg.role,
            content: msg.content.trim().substring(0, 2000),
            timestamp: msg.timestamp,
          })
        ),
        maxQuestions: Math.min(
          Math.max(validatedData.maxQuestions || 5, 1),
          20
        ), // Limit between 1-20
      };

      return { ...input, data: sanitizedData };
    } catch (error) {
      console.error("Ideation agent input preprocessing failed:", error);
      throw new Error(
        `Input validation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  protected async postprocessOutput(
    result: any,
    input: AgentInput<IdeationInput>
  ): Promise<IdeationOutput> {
    try {
      // Check if testing mode is enabled
      if (testingDataService.isTestingMode()) {
        console.log("🔧 Testing mode enabled - using Gemini with full context");
        if (input.data.mode === "questions") {
          return this.processTestingModeQuestions(input);
        } else {
          return await this.processTestingModeChat(input);
        }
      }

      // Normal AI processing
      if (input.data.mode === "questions") {
        return await this.processQuestionModeOutput(result, input);
      } else {
        return await this.processChatModeOutput(result, input);
      }
    } catch (error) {
      console.error("Error in ideation postprocessing:", error);
      // Return fallback response
      if (input.data.mode === "questions") {
        return this.createFallbackQuestionResponse(input.data);
      } else {
        return this.createFallbackChatResponse(input.data);
      }
    }
  }

  protected formatInputForAgent(input: AgentInput<IdeationInput>): string {
    const { mode, context, conversationHistory, maxQuestions } = input.data;

    if (mode === "questions") {
      return this.formatQuestionModeInput(context, maxQuestions || 5);
    } else {
      return this.formatChatModeInput(context, conversationHistory || []);
    }
  }

  private formatQuestionModeInput(
    context: IdeationInput["context"],
    maxQuestions: number
  ): string {
    return `QUESTION GENERATION REQUEST:

PROJECT DESCRIPTION:
${context.projectDescription}

DETECTED FRAMEWORKS: ${context.detectedFrameworks?.join(", ") || "None"}
IDENTIFIED GAPS: ${context.complianceGaps?.join(", ") || "None specified"}
REQUESTED QUESTIONS: ${maxQuestions}

Please generate targeted clarifying questions to help understand compliance requirements and implementation details. Use vector search to find relevant compliance scenarios and web search for current requirements.

For each question, provide:
1. Clear, specific question text
2. Category (implementation/gap_filling/risk_clarification/process)
3. Priority level (high/medium/low)
4. Associated framework
5. Reasoning for why this question is important
6. Expected answer type
7. Potential follow-up questions

Focus on questions that will provide the most valuable information for compliance assessment.`;
  }

  private formatChatModeInput(
    context: IdeationInput["context"],
    history: any[]
  ): string {
    const conversationContext =
      history.length > 0
        ? `\nCONVERSATION HISTORY:\n${history
            .map((msg) => `${msg.role}: ${msg.content}`)
            .join("\n")}`
        : "";

    return `KNOWLEDGE CHAT REQUEST:

PROJECT DESCRIPTION:
${context.projectDescription}

DETECTED FRAMEWORKS: ${context.detectedFrameworks?.join(", ") || "None"}
USER QUERY: ${context.userQuery || "General compliance guidance"}
${conversationContext}

**MANDATORY STEPS TO ANSWER THIS QUERY:**
1. IMMEDIATELY use the vector_retrieval tool with the query: "${context.userQuery}"
   (Just pass the search query as a string, the tool will handle the rest)
2. Analyze the search results to find relevant information
3. If needed, perform additional searches with related terms like:
   - Key words from the user's question
   - Related compliance terms
   - Framework names mentioned
4. Only use web_search if you need current regulatory updates not found in the documents

**YOUR RESPONSE MUST:**
- Be based on actual content from the uploaded documents (found via vector_retrieval)
- Quote specific passages or sections from the documents
- Clearly indicate which document the information comes from
- If no relevant information is found in the documents, explicitly state: "I searched the uploaded documents but couldn't find information about [topic]"

DO NOT give generic advice without searching the documents first.
DO NOT make up information that isn't in the search results.
ALWAYS cite your sources from the vector search results.`;
  }

  private async processQuestionModeOutput(
    result: any,
    input: AgentInput<IdeationInput>
  ): Promise<QuestionOutput> {
    const context = input.data.context;
    const maxQuestions = input.data.maxQuestions || 5;
    const aiResponse = result.output || result.text || "";

    let questions: QuestionOutput["questions"] = [];

    // First try to parse questions from AI response
    if (aiResponse && aiResponse.trim()) {
      questions = await this.parseQuestionsFromAIResponse(aiResponse, context);
    }

    // If AI parsing failed or returned insufficient questions, supplement with generated ones
    if (questions.length < Math.min(3, maxQuestions)) {
      console.log(
        "AI returned insufficient questions, supplementing with template-based questions"
      );
      const templateQuestions = await this.generateQuestionsFromContext(
        context,
        maxQuestions - questions.length
      );
      questions = [...questions, ...templateQuestions].slice(0, maxQuestions);
    }

    return {
      questions: questions.slice(0, maxQuestions),
      questioningStrategy: {
        overallGoal: this.determineQuestioningGoal(context),
        progressiveDisclosure: true,
        adaptiveFollowUp: true,
      },
    };
  }

  private async processChatModeOutput(
    result: any,
    input: AgentInput<IdeationInput>
  ): Promise<ChatOutput> {
    const aiResponse = result.output || result.text || "";

    // Extract sources from intermediate steps
    const sources = this.extractSourcesFromSteps(
      result.intermediateSteps || []
    );

    // Generate suggested actions
    const suggestedActions = this.generateSuggestedActions(
      input.data.context,
      aiResponse
    );

    // Generate related topics
    const relatedTopics = this.generateRelatedTopics(input.data.context);

    return {
      response: aiResponse,
      sources,
      suggestedActions,
      relatedTopics,
    };
  }

  /**
   * Process testing mode questions - return hardcoded questions from testing data
   */
  private processTestingModeQuestions(
    input: AgentInput<IdeationInput>
  ): QuestionOutput {
    const maxQuestions = input.data.maxQuestions || 5;
    const testingQuestions = testingDataService.getIdeationQuestions();

    // Filter questions based on detected frameworks if available
    let filteredQuestions = testingQuestions;
    if (input.data.context.detectedFrameworks && input.data.context.detectedFrameworks.length > 0) {
      const frameworks = input.data.context.detectedFrameworks;
      filteredQuestions = testingQuestions.filter(q =>
        frameworks.includes(q.framework) || q.framework === "General"
      );
    }

    // Take the requested number of questions
    const selectedQuestions = filteredQuestions.slice(0, maxQuestions);

    return {
      questions: selectedQuestions,
      questioningStrategy: {
        overallGoal: "Assess compliance readiness for Project AETHER WATCH requirements (Testing Mode)",
        progressiveDisclosure: true,
        adaptiveFollowUp: true,
      },
    };
  }

  /**
   * Process testing mode chat - return AI-powered responses using Gemini with full context
   */
  private async processTestingModeChat(
    input: AgentInput<IdeationInput>
  ): Promise<ChatOutput> {
    const query = input.data.context.userQuery || "general compliance";
    const testingResponse = await testingDataService.getChatResponse(query);

    return {
      response: testingResponse.response,
      sources: testingResponse.sources,
      suggestedActions: testingResponse.suggestedActions,
      relatedTopics: testingResponse.relatedTopics,
    };
  }

  private async generateQuestionsFromContext(
    context: IdeationInput["context"],
    maxQuestions: number
  ): Promise<QuestionOutput["questions"]> {
    const questions: QuestionOutput["questions"] = [];
    const frameworks = context.detectedFrameworks || [];
    const gaps = context.complianceGaps || [];

    // Question templates by category
    const questionTemplates = this.getQuestionTemplates();

    // Generate questions for each framework
    for (const framework of frameworks.slice(0, 3)) {
      // Limit to top 3 frameworks
      const frameworkQuestions = this.generateFrameworkQuestions(
        framework,
        questionTemplates
      );
      questions.push(...frameworkQuestions);
    }

    // Generate questions for identified gaps
    for (const gap of gaps.slice(0, 2)) {
      // Limit to top 2 gaps
      const gapQuestions = this.generateGapQuestions(gap, questionTemplates);
      questions.push(...gapQuestions);
    }

    // Generate general project questions
    const generalQuestions = this.generateGeneralQuestions(
      context,
      questionTemplates
    );
    questions.push(...generalQuestions);

    // Sort by priority and return top questions
    return questions
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      })
      .slice(0, maxQuestions);
  }

  private getQuestionTemplates(): Record<string, any> {
    return {
      implementation: {
        FERPA: [
          "What specific encryption standards do you use for storing student educational records?",
          "How do you obtain and document student consent for data sharing?",
          "Who is designated as your FERPA compliance officer?",
        ],
        HIPAA: [
          "What specific encryption standards do you use for health information?",
          "Do you have signed business associate agreements with all vendors?",
          "How do you handle patient consent for research participation?",
        ],
        GDPR: [
          "What is your lawful basis for processing personal data of EU residents?",
          "How do you handle data subject access requests?",
          "Do you have a Data Protection Officer appointed?",
        ],
      },
      gap_filling: [
        "What is your data retention and deletion schedule?",
        "How do you handle data breach notifications?",
        "What backup and recovery procedures do you have in place?",
        "How do you conduct regular compliance audits?",
      ],
      risk_clarification: [
        "Are any of your research participants under 18?",
        "Do you share data with international collaborators?",
        "Do you collect sensitive personal information?",
        "Are you planning to commercialize any research outcomes?",
      ],
      process: [
        "What is your process for onboarding new team members to compliance requirements?",
        "How do you train staff on data handling procedures?",
        "What is your incident response process for compliance violations?",
      ],
    };
  }

  private generateFrameworkQuestions(
    framework: string,
    templates: Record<string, any>
  ): QuestionOutput["questions"] {
    const frameworkTemplates = templates.implementation[framework] || [];
    return frameworkTemplates
      .slice(0, 2)
      .map((template: string, index: number) => ({
        id: `${framework.toLowerCase()}-impl-${index}`,
        question: template,
        category: "implementation" as const,
        priority: "high" as const,
        framework,
        reasoning: `Critical for ${framework} compliance implementation`,
        expectedAnswerType: "text" as const,
        followUpQuestions: this.generateFollowUpQuestions(template),
      }));
  }

  private generateGapQuestions(
    gap: string,
    templates: Record<string, any>
  ): QuestionOutput["questions"] {
    const gapTemplates = templates.gap_filling.filter((template: string) =>
      template.toLowerCase().includes(gap.toLowerCase().split(" ")[0])
    );

    return gapTemplates.slice(0, 1).map((template: string, index: number) => ({
      id: `gap-${gap.replace(/\s+/g, "-").toLowerCase()}-${index}`,
      question: template,
      category: "gap_filling" as const,
      priority: "medium" as const,
      framework: "General",
      reasoning: `Addresses identified compliance gap: ${gap}`,
      expectedAnswerType: "text" as const,
    }));
  }

  private generateGeneralQuestions(
    context: IdeationInput["context"],
    templates: Record<string, any>
  ): QuestionOutput["questions"] {
    const riskQuestions = templates.risk_clarification.slice(0, 2);
    const processQuestions = templates.process.slice(0, 1);

    const questions = [
      ...riskQuestions.map((template: string, index: number) => ({
        id: `risk-${index}`,
        question: template,
        category: "risk_clarification" as const,
        priority: "medium" as const,
        framework: "General",
        reasoning:
          "Important for understanding overall compliance risk profile",
        expectedAnswerType: "boolean" as const,
      })),
      ...processQuestions.map((template: string, index: number) => ({
        id: `process-${index}`,
        question: template,
        category: "process" as const,
        priority: "low" as const,
        framework: "General",
        reasoning: "Helps understand organizational compliance maturity",
        expectedAnswerType: "text" as const,
      })),
    ];

    return questions;
  }

  private generateFollowUpQuestions(question: string): string[] {
    // Simple follow-up generation based on question content
    if (question.includes("encryption")) {
      return [
        "What key management system do you use?",
        "How often do you rotate encryption keys?",
      ];
    }
    if (question.includes("consent")) {
      return [
        "How do you document consent withdrawal?",
        "What is your consent renewal process?",
      ];
    }
    if (question.includes("officer") || question.includes("designated")) {
      return [
        "What are their specific responsibilities?",
        "How often do they report to leadership?",
      ];
    }
    return [];
  }

  private determineQuestioningGoal(context: IdeationInput["context"]): string {
    const frameworks = context.detectedFrameworks || [];
    const gaps = context.complianceGaps || [];

    if (frameworks.length > 2) {
      return "Understand implementation details across multiple compliance frameworks";
    } else if (gaps.length > 0) {
      return "Fill identified compliance gaps and clarify requirements";
    } else {
      return "Assess overall compliance readiness and identify key requirements";
    }
  }

  private extractSourcesFromSteps(steps: any[]): ChatOutput["sources"] {
    const sources: ChatOutput["sources"] = [];

    for (const step of steps) {
      if (step.action?.tool === "vector_retrieval" && step.observation) {
        sources.push({
          type: "knowledge_base",
          title: "Compliance Knowledge Base",
          content: step.observation.substring(0, 200) + "...",
          confidence: 0.8,
        });
      } else if (step.action?.tool === "web_search" && step.observation) {
        sources.push({
          type: "web_search",
          title: "Current Compliance Information",
          content: step.observation.substring(0, 200) + "...",
          confidence: 0.7,
        });
      }
    }

    return sources.slice(0, 3); // Return top 3 sources
  }

  private generateSuggestedActions(
    context: IdeationInput["context"],
    response: string
  ): string[] {
    const actions = [];

    if (context.detectedFrameworks?.includes("FERPA")) {
      actions.push("Review your student data collection and consent processes");
    }
    if (context.detectedFrameworks?.includes("HIPAA")) {
      actions.push("Conduct a HIPAA risk assessment");
    }
    if (context.detectedFrameworks?.includes("IRB")) {
      actions.push("Submit your research protocol to the IRB for review");
    }

    // Add general actions based on response content
    if (response.toLowerCase().includes("policy")) {
      actions.push("Draft or update relevant compliance policies");
    }
    if (response.toLowerCase().includes("training")) {
      actions.push("Schedule compliance training for team members");
    }

    return actions.slice(0, 4);
  }

  private generateRelatedTopics(context: IdeationInput["context"]): string[] {
    const topics = [];

    if (context.detectedFrameworks?.includes("FERPA")) {
      topics.push(
        "Directory information policies",
        "Student consent management"
      );
    }
    if (context.detectedFrameworks?.includes("HIPAA")) {
      topics.push(
        "Business associate agreements",
        "Breach notification procedures"
      );
    }
    if (context.detectedFrameworks?.includes("GDPR")) {
      topics.push("Data subject rights", "Privacy impact assessments");
    }

    topics.push(
      "Compliance monitoring",
      "Risk assessment procedures",
      "Incident response planning"
    );

    return topics.slice(0, 5);
  }

  private async parseQuestionsFromAIResponse(
    aiResponse: string,
    context: IdeationInput["context"]
  ): Promise<QuestionOutput["questions"]> {
    try {
      const questions: QuestionOutput["questions"] = [];

      // Look for numbered questions or bullet points in the response
      const questionPatterns = [
        /(\d+)\.\s*(.+?)(?=\d+\.|$)/gs, // Numbered list
        /[-*]\s*(.+?)(?=[-*]|$)/gs, // Bullet points
        /(?:^|\n)(.+\?)(?=\n|$)/gm, // Lines ending with question marks
      ];

      for (const pattern of questionPatterns) {
        const matches = [...aiResponse.matchAll(pattern)];

        for (const match of matches) {
          const questionText = (match[2] || match[1])?.trim();

          if (
            questionText &&
            questionText.length > 10 &&
            questionText.includes("?")
          ) {
            const question = this.createQuestionFromText(
              questionText,
              context,
              questions.length
            );
            if (question) {
              questions.push(question);
            }
          }
        }

        if (questions.length > 0) break; // Use first successful pattern
      }

      // Remove duplicates and limit results
      const uniqueQuestions = questions.filter(
        (q, index, arr) =>
          arr.findIndex(
            (other) => other.question.toLowerCase() === q.question.toLowerCase()
          ) === index
      );

      return uniqueQuestions.slice(0, 10);
    } catch (error) {
      console.error("Error parsing AI questions:", error);
      return [];
    }
  }

  private createQuestionFromText(
    questionText: string,
    context: IdeationInput["context"],
    index: number
  ): QuestionOutput["questions"][0] | null {
    if (!questionText || questionText.length < 10) return null;

    // Determine category based on question content
    const category = this.categorizeQuestion(questionText);

    // Determine priority based on context and content
    const priority = this.prioritizeQuestion(questionText, context);

    // Determine framework association
    const framework = this.associateWithFramework(
      questionText,
      context.detectedFrameworks
    );

    return {
      id: `ai-question-${index}-${Date.now()}`,
      question: questionText,
      category,
      priority,
      framework,
      reasoning: `AI-generated question based on project context and compliance analysis`,
      expectedAnswerType: this.determineAnswerType(questionText),
      followUpQuestions: this.generateFollowUpQuestions(questionText),
    };
  }

  private categorizeQuestion(
    questionText: string
  ): "implementation" | "gap_filling" | "risk_clarification" | "process" {
    const lowerText = questionText.toLowerCase();

    if (
      lowerText.includes("implement") ||
      lowerText.includes("setup") ||
      lowerText.includes("configure")
    ) {
      return "implementation";
    } else if (
      lowerText.includes("process") ||
      lowerText.includes("procedure") ||
      lowerText.includes("workflow")
    ) {
      return "process";
    } else if (
      lowerText.includes("risk") ||
      lowerText.includes("threat") ||
      lowerText.includes("vulnerability")
    ) {
      return "risk_clarification";
    } else {
      return "gap_filling";
    }
  }

  private prioritizeQuestion(
    questionText: string,
    context: IdeationInput["context"]
  ): "high" | "medium" | "low" {
    const lowerText = questionText.toLowerCase();
    const urgentKeywords = [
      "critical",
      "required",
      "must",
      "compliance",
      "violation",
      "breach",
    ];
    const importantKeywords = [
      "should",
      "recommend",
      "best practice",
      "security",
    ];

    if (urgentKeywords.some((keyword) => lowerText.includes(keyword))) {
      return "high";
    } else if (
      importantKeywords.some((keyword) => lowerText.includes(keyword))
    ) {
      return "medium";
    } else {
      return "low";
    }
  }

  private associateWithFramework(
    questionText: string,
    frameworks?: string[]
  ): string {
    if (!frameworks || frameworks.length === 0) return "General";

    const lowerText = questionText.toLowerCase();

    for (const framework of frameworks) {
      if (lowerText.includes(framework.toLowerCase())) {
        return framework;
      }
    }

    // Framework-specific keyword matching
    if (lowerText.includes("student") || lowerText.includes("education"))
      return "FERPA";
    if (lowerText.includes("health") || lowerText.includes("medical"))
      return "HIPAA";
    if (lowerText.includes("research") || lowerText.includes("participant"))
      return "IRB";
    if (lowerText.includes("personal data") || lowerText.includes("privacy"))
      return "GDPR";

    return frameworks[0] || "General";
  }

  private determineAnswerType(
    questionText: string
  ): "text" | "boolean" | "choice" | "numeric" {
    const lowerText = questionText.toLowerCase();

    if (
      lowerText.includes("yes/no") ||
      lowerText.includes("true/false") ||
      lowerText.startsWith("do you") ||
      lowerText.startsWith("are you") ||
      lowerText.startsWith("is ") ||
      lowerText.startsWith("have you")
    ) {
      return "boolean";
    } else if (
      lowerText.includes("how many") ||
      lowerText.includes("number of")
    ) {
      return "numeric";
    } else if (
      lowerText.includes("which") ||
      lowerText.includes("choose") ||
      lowerText.includes("select")
    ) {
      return "choice";
    } else {
      return "text";
    }
  }

  private createFallbackQuestionResponse(input: IdeationInput): QuestionOutput {
    const context = input.context;
    const maxQuestions = input.maxQuestions || 5;

    return {
      questions: [
        {
          id: `fallback-question-${Date.now()}`,
          question:
            "What specific compliance requirements are you most concerned about for this project?",
          category: "gap_filling",
          priority: "high",
          framework: "General",
          reasoning: "Fallback question due to AI processing error",
          expectedAnswerType: "text",
          followUpQuestions: [
            "What is your timeline for compliance implementation?",
          ],
        },
      ],
      questioningStrategy: {
        overallGoal: "Gather basic compliance requirements information",
        progressiveDisclosure: true,
        adaptiveFollowUp: true,
      },
    };
  }

  private createFallbackChatResponse(input: IdeationInput): ChatOutput {
    return {
      response:
        "I apologize, but I encountered an issue processing your request. Could you please rephrase your question or provide more specific details about your compliance needs?",
      sources: [],
      suggestedActions: [
        "Review project compliance requirements",
        "Identify applicable frameworks",
      ],
      relatedTopics: ["General compliance guidance", "Risk assessment"],
    };
  }
}
