/**
 * Testing Data Service
 * Provides hardcoded responses based on example.md content for testing mode
 */

export interface TestingFramework {
  name: string;
  confidence: number;
  relevanceScore: number;
  reasoning: string;
  requirements: string[];
  priority: "critical" | "high" | "medium" | "low";
}

export interface TestingQuestion {
  id: string;
  question: string;
  category: "implementation" | "gap_filling" | "risk_clarification" | "process";
  priority: "high" | "medium" | "low";
  framework: string;
  reasoning: string;
  expectedAnswerType: "text" | "boolean" | "choice" | "numeric";
  followUpQuestions?: string[];
}

export interface TestingChatResponse {
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

export class TestingDataService {
  private static instance: TestingDataService;

  public static getInstance(): TestingDataService {
    if (!TestingDataService.instance) {
      TestingDataService.instance = new TestingDataService();
    }
    return TestingDataService.instance;
  }

  /**
   * Check if testing mode is enabled
   */
  public isTestingMode(): boolean {
    return process.env.NEXT_PUBLIC_TESTING_MODE === "true";
  }

  /**
   * Get hardcoded classification frameworks based on example.md
   */
  public getClassificationFrameworks(): TestingFramework[] {
    return [
      {
        name: "ITAR",
        confidence: 0.95,
        relevanceScore: 0.92,
        reasoning:
          "Project AETHER WATCH involves defense articles and technical data under USML Category XV (Spacecraft and Related Articles). Export control requirements clearly apply.",
        requirements: [
          "U.S. Person verification for all personnel accessing technical data",
          "Export license required for international collaboration",
          "Technical data must be protected from foreign persons",
          "Deemed export controls for foreign national team members",
          "Proper classification and marking of controlled documents",
        ],
        priority: "critical",
      },
      {
        name: "CMMC Level 2",
        confidence: 0.88,
        relevanceScore: 0.85,
        reasoning:
          "As a subcontractor to AMERICAN SYSTEMS supporting DoD, CMMC Level 2 certification is required for handling CUI.",
        requirements: [
          "110 security controls from NIST SP 800-171",
          "Access control implementation (AC family)",
          "Audit and accountability measures (AU family)",
          "Configuration management (CM family)",
          "Incident response capabilities (IR family)",
          "System and communications protection (SC family)",
        ],
        priority: "critical",
      },
      {
        name: "NIST SP 800-171",
        confidence: 0.9,
        relevanceScore: 0.88,
        reasoning:
          "Required for safeguarding Controlled Unclassified Information (CUI) including satellite telemetry data provided by DoD.",
        requirements: [
          "Multifactor authentication for privileged accounts",
          "Encryption of CUI at rest and in transit",
          "Continuous monitoring and audit logging",
          "Incident response and reporting procedures",
          "Media sanitization according to NIST 800-88",
          "Risk assessment and system security plans",
        ],
        priority: "high",
      },
      {
        name: "IRB",
        confidence: 0.45,
        relevanceScore: 0.4,
        reasoning:
          "While not explicitly mentioned, university research projects may require IRB oversight depending on data collection methods.",
        requirements: [
          "IRB protocol submission if human subjects involved",
          "Informed consent procedures",
          "Data privacy protection measures",
          "Risk assessment for research participants",
        ],
        priority: "low",
      },
    ];
  }

  /**
   * Get hardcoded Q&A questions based on example.md compliance gaps
   */
  public getIdeationQuestions(): TestingQuestion[] {
    return [
      {
        id: "li-chen-access-status",
        question:
          "What is the current access level for Li Chen (PRC citizen) to ITAR-controlled technical data and algorithms, and what specific export license procedures are in place?",
        category: "implementation",
        priority: "high",
        framework: "ITAR",
        reasoning:
          "Li Chen is listed as non-U.S. Person but needs access to ITAR Category XV technical data - immediate compliance risk",
        expectedAnswerType: "text",
        followUpQuestions: [
          "Has a DDTC export license application been submitted for Li Chen's access?",
          "What data segregation measures are currently preventing foreign national access?",
        ],
      },
      {
        id: "manchester-collaboration-status",
        question:
          "What is the status of the export license application for sharing technical data with Dr. Alistair Smith at University of Manchester?",
        category: "process",
        priority: "high",
        framework: "ITAR",
        reasoning:
          "Meeting notes indicate plan to share algorithm source code with UK collaborator - requires DDTC approval",
        expectedAnswerType: "text",
        followUpQuestions: [
          "What specific technical data will be shared under this collaboration?",
          "Are there temporary measures in place to prevent unauthorized sharing?",
        ],
      },
      {
        id: "aws-cui-security",
        question:
          "How is the CUI satellite telemetry data secured on your commercial AWS infrastructure, and is it properly segregated from other university data?",
        category: "implementation",
        priority: "high",
        framework: "NIST SP 800-171",
        reasoning:
          "System architecture shows CUI data on standard university AWS tenant - needs CMMC-compliant protection",
        expectedAnswerType: "text",
        followUpQuestions: [
          "What specific AWS security controls are configured for CUI protection?",
          "How do you ensure FIPS-validated encryption for data at rest and in transit?",
        ],
      },
      {
        id: "dmp-completion-timeline",
        question:
          "What is your timeline for completing the missing sections of the Data Management Plan, specifically the incident response procedures and media sanitization requirements?",
        category: "gap_filling",
        priority: "medium",
        framework: "NIST SP 800-171",
        reasoning:
          "DMP review found document incomplete - missing critical sections required for CUI handling",
        expectedAnswerType: "text",
        followUpQuestions: [
          "Who is responsible for completing the DMP updates?",
          "What System Security Plan (SSP) will be referenced in the DMP?",
        ],
      },
      {
        id: "audit-log-worm-implementation",
        question:
          "What is your plan to implement WORM (Write Once Read Many) storage for audit logs to meet the AU-02 immutability requirements?",
        category: "risk_clarification",
        priority: "medium",
        framework: "CMMC Level 2",
        reasoning:
          "Test AU-02 showed partial implementation - log immutability not verified, required for CMMC Level 2 certification",
        expectedAnswerType: "text",
        followUpQuestions: [
          "What timeline do you have for implementing object lock on audit storage?",
          "How will you update SIEM parsers to handle immutable log formats?",
        ],
      },
    ];
  }

  /**
   * Get AI-powered chat response using Gemini with full example.md context
   */
  public async getChatResponse(query: string): Promise<TestingChatResponse> {
    try {
      const response = await this.callGeminiWithContext(query);
      return response;
    } catch (error) {
      console.error("Error calling Gemini API:", error);

      // Check if it's a token limit error
      if (error instanceof Error && error.message.includes("token limits")) {
        return {
          response: `I encountered a token limit issue while processing your query about Project AETHER WATCH. The documentation is quite extensive, so I've provided a simplified response based on the key compliance frameworks: ITAR (USML Category XV), CMMC Level 2, and NIST SP 800-171. For more detailed information, please ask more specific questions about individual compliance areas.`,
          sources: [
            {
              type: "knowledge_base",
              title: "Project AETHER WATCH - Compliance Overview",
              content:
                "AI-driven anomaly detection for satellite telemetry with ITAR, CMMC Level 2, and NIST SP 800-171 requirements",
              confidence: 0.7,
            },
          ],
          suggestedActions: [
            "Ask about specific compliance frameworks (ITAR, CMMC, NIST)",
            "Inquire about personnel access controls",
            "Request details on specific security controls",
          ],
          relatedTopics: [
            "ITAR export controls",
            "CMMC Level 2 certification",
            "NIST SP 800-171 controls",
            "CUI handling procedures",
          ],
        };
      }

      // Fallback to a generic response for other errors
      return {
        response: `I apologize, but I encountered an error processing your query about Project AETHER WATCH. The project involves AI/ML algorithms for satellite telemetry analysis with complex compliance requirements including ITAR, CMMC Level 2, and NIST SP 800-171. Please try rephrasing your question.`,
        sources: [
          {
            type: "knowledge_base",
            title: "Project AETHER WATCH Documentation",
            content:
              "Compliance assessment documentation for defense contractor project...",
            confidence: 0.5,
          },
        ],
        suggestedActions: [
          "Try rephrasing your question",
          "Ask about specific compliance frameworks",
          "Review the uploaded documentation",
        ],
        relatedTopics: [
          "ITAR compliance",
          "CMMC Level 2",
          "Export control",
          "CUI handling",
        ],
      };
    }
  }

  /**
   * Call Gemini API directly with user query and full example.md context
   */
  private async callGeminiWithContext(
    userQuery: string
  ): Promise<TestingChatResponse> {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GOOGLE_GEMINI_API_KEY not found in environment variables"
      );
    }

    const exampleMdContent = await this.getExampleMdContent();

    // Truncate the context to avoid token limits (keep first 40000 characters)
    // Increased from 20000 to 40000 since we increased maxOutputTokens to 16384
    const truncatedContext =
      exampleMdContent.length > 40000
        ? exampleMdContent.substring(0, 40000) +
          "... [Content truncated for token limits]"
        : exampleMdContent;

    const prompt = `You are a compliance expert analyzing Project AETHER WATCH documentation. Answer the user's question based on the provided context.

CONTEXT:
${truncatedContext}

USER QUESTION: ${userQuery}

Provide a concise response with:
1. Direct answer to the question
2. Key compliance requirements mentioned
3. 2-3 suggested actions
4. 2-3 related topics

Format as JSON:
{
  "response": "Your answer here...",
  "sources": [{"type": "knowledge_base", "title": "Section", "content": "Excerpt", "confidence": 0.9}],
  "suggestedActions": ["Action 1", "Action 2"],
  "relatedTopics": ["Topic 1", "Topic 2"]
}`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        topK: 32,
        topP: 1,
        maxOutputTokens: 16384,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
      ],
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Gemini API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    // Log the response structure for debugging
    console.log(
      "Gemini API response structure:",
      JSON.stringify(data, null, 2)
    );

    if (
      !data.candidates ||
      !data.candidates[0] ||
      !data.candidates[0].content
    ) {
      throw new Error("Invalid response format from Gemini API");
    }

    // Check if the response was truncated due to token limits
    if (data.candidates[0].finishReason === "MAX_TOKENS") {
      console.warn("Gemini API response truncated due to token limits");
      // Instead of throwing an error, return a partial response with a warning
      const partialText = data.candidates[0].content.parts[0]?.text || "";
      return {
        response:
          partialText +
          "\n\n[Response was truncated due to length limits. Please ask a more specific question for a complete answer.]",
        sources: [
          {
            type: "knowledge_base",
            title: "Response truncated",
            content: "The response exceeded token limits and was truncated",
            confidence: 0.5,
          },
        ],
        suggestedActions: [
          "Ask a more specific question",
          "Break down your question into smaller parts",
          "Focus on a specific compliance area",
        ],
        relatedTopics: [
          "ITAR compliance",
          "CMMC Level 2",
          "Export control",
          "CUI handling",
        ],
      };
    }

    // Check if parts array exists and has content
    if (
      !data.candidates[0].content.parts ||
      !data.candidates[0].content.parts[0] ||
      !data.candidates[0].content.parts[0].text
    ) {
      console.error(
        "Invalid parts structure in Gemini response:",
        data.candidates[0].content
      );
      throw new Error(
        "Invalid response format from Gemini API - missing parts or text content"
      );
    }

    const generatedText = data.candidates[0].content.parts[0].text;

    try {
      // Clean the generated text - remove code blocks and extra formatting
      let cleanedText = generatedText.trim();

      // Remove markdown code blocks if present
      if (cleanedText.startsWith("```json")) {
        cleanedText = cleanedText
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "");
      } else if (cleanedText.startsWith("```")) {
        cleanedText = cleanedText.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      // Try to parse the cleaned JSON response
      const parsedResponse = JSON.parse(cleanedText);

      // Validate the parsed response has the expected structure
      if (
        parsedResponse &&
        typeof parsedResponse === "object" &&
        parsedResponse.response
      ) {
        return {
          response: parsedResponse.response || "",
          sources: parsedResponse.sources || [
            {
              type: "knowledge_base" as const,
              title: "Project AETHER WATCH Compliance Assessment",
              content:
                "AI-generated response based on compliance documentation",
              confidence: 0.8,
            },
          ],
          suggestedActions: parsedResponse.suggestedActions || [
            "Review the specific documentation sections mentioned",
            "Consult with compliance team for implementation guidance",
            "Assess current project status against requirements",
          ],
          relatedTopics: parsedResponse.relatedTopics || [
            "ITAR compliance requirements",
            "CMMC Level 2 controls",
            "Export control procedures",
            "CUI handling requirements",
          ],
        };
      } else {
        throw new Error("Invalid response structure");
      }
    } catch (parseError) {
      console.log(
        "JSON parsing failed, treating as plain text response:",
        parseError
      );
      // If JSON parsing fails, create a structured response from the text
      return {
        response: generatedText,
        sources: [
          {
            type: "knowledge_base" as const,
            title: "Project AETHER WATCH Compliance Assessment",
            content: "AI-generated response based on compliance documentation",
            confidence: 0.8,
          },
        ],
        suggestedActions: [
          "Review the specific documentation sections mentioned",
          "Consult with compliance team for implementation guidance",
          "Assess current project status against requirements",
        ],
        relatedTopics: [
          "ITAR compliance requirements",
          "CMMC Level 2 controls",
          "Export control procedures",
          "CUI handling requirements",
        ],
      };
    }
  }

  /**
   * Get the full content of example.md file
   */
  private async getExampleMdContent(): Promise<string> {
    // In a real implementation, you would read this from the file system
    // For now, we'll include the content directly since it's for testing mode
    return `Project AETHER WATCH: Compliance Assessment Dossier
Part 1: Project Scoping and Contractual Basis
1.1 Research Grant Proposal
Format: PDF Document
Cover Page
Project Title: Project AETHER WATCH: AI-Driven Anomaly Detection for Enhanced Space Domain Awareness
Submitting Institution: Purdue University, Advanced Signal Processing Lab
Principal Investigator: Dr. Eleanor Vance
Co-Investigators: Dr. Samuel Carter
Submission Date: October 1, 2025
Proposed Funder: Defense Technical Information Center (DTIC), Information Analysis Center (IAC) Program

1.0 Executive Summary
Project AETHER WATCH proposes the development of a novel artificial intelligence/machine learning (AI/ML) framework to enhance Space Domain Awareness (SDA). Our primary objective is to create and validate algorithms capable of analyzing satellite telemetry data in near-real-time to identify Cyber-Suspicious Indicators (CSI). By detecting subtle deviations in satellite behavior indicative of potential cyber threats, this project will provide a critical early-warning capability, contributing directly to the security and resilience of national space assets. This proposal seeks funding to support a 24-month research and development effort, leveraging the unique expertise of Purdue University's Advanced Signal Processing Lab. This work is proposed as a subcontract under the DTIC IAC's multiple-award contract for research and development, aligning with its mission to provide technical expertise in critical defense areas. The partnership builds upon Purdue's established relationship with industry leaders in national security, including a recent initiative with AMERICAN SYSTEMS to advance space security.

2.0 Technical Approach
The core of Project AETHER WATCH is a hybrid AI model combining recurrent neural networks (RNNs) for time-series analysis of telemetry streams with a graph neural network (GNN) to model inter-satellite communications and relationships. The methodology involves three phases:
Phase 1 (Months 1-6): Data Ingestion and Model Scaffolding. We will develop a robust data pipeline to process the government-furnished dataset. The initial AI model architecture will be constructed.
Phase 2 (Months 7-18): Algorithm Training and Refinement. The model will be trained on the provided dataset to establish a baseline of normal satellite behavior. We will then introduce simulated anomaly data to train the CSI detection capabilities.
Phase 3 (Months 19-24): Validation and Reporting. The model's performance will be rigorously tested and validated. Final reports and a prototype software deliverable will be prepared.

3.0 Data Management
The project will utilize a significant dataset of proprietary satellite telemetry provided by the Department of Defense (DoD). This dataset is designated as Controlled Unclassified Information (CUI) and contains sensitive operational parameters. All project data, including the CUI dataset, intermediate processing files, and resulting models, will be stored securely on the university's central cloud infrastructure, which utilizes a standard commercial AWS tenant. Access will be managed by the university's IT services according to standard research protocols.

4.0 Collaboration and Peer Review
To ensure the scientific rigor of our algorithmic development, we have established a collaboration with Dr. Alistair Smith, a leading expert in statistical signal processing at the University of Manchester, UK. Dr. Smith will assist in the validation of our core algorithms, providing an independent peer review of our methodology and results. This international collaboration is vital for achieving state-of-the-art performance.

5.0 Personnel
The project team comprises faculty, postdoctoral researchers, and graduate students with extensive experience in AI/ML and satellite systems.
Table 1: Project Personnel Roster
Name | Role | Affiliation | Citizenship | U.S. Person Status (Y/N)
Dr. Eleanor Vance | Principal Investigator | Purdue University | USA | Y
Dr. Samuel Carter | Co-Investigator | Purdue University | USA | Y
Dr. Maria Flores | Postdoctoral Researcher | Purdue University | USA | Y
John Miller | Postdoctoral Researcher | Purdue University | USA | Y
Li Chen | Ph.D. Student | Purdue University | People's Republic of China | N

6.0 Budget and Justification
(Detailed budget table follows, including line items for personnel salaries, equipment, and overhead. A notable line item is included for "Cloud Computing Resources - $25,000" with the justification mentioning standard university-provisioned AWS services.)

7.0 Expected Outcomes
Project AETHER WATCH will deliver:
A validated AI/ML framework for detecting Cyber-Suspicious Indicators in satellite telemetry.
A final technical report detailing the model architecture, training methodology, and performance metrics.
A prototype software package containing the developed algorithms.
This project's success will represent a significant advancement in Space Domain Awareness, directly supporting the national security mission of the Department of Defense.

1.2 Statement of Work (SOW) from AMERICAN SYSTEMS
Format: DOCX Document
Statement of Work Between AMERICAN SYSTEMS CORPORATION 14151 Park Meadow Dr, Chantilly, VA 20151 and Purdue University, Advanced Signal Processing Lab
1.0 Project Title: Project AETHER WATCH
2.0 Period of Performance: November 1, 2025 – October 31, 2027
3.0 Background: AMERICAN SYSTEMS, in its capacity as a prime contractor supporting the Department of Defense (DoD), requires advanced research and development in the area of Space Domain Awareness (SDA). This Statement of Work (SOW) establishes the terms for a subcontract with Purdue University to develop novel AI/ML algorithms for this purpose.
4.0 Scope of Work: The Subcontractor (Purdue University) shall perform the necessary research and development to design, build, and validate an AI/ML framework capable of identifying Cyber-Suspicious Indicators (CSI) from government-furnished satellite telemetry data.
5.0 Deliverables:
Quarterly Progress Reports
Monthly Technical Interchange Meetings
Final Technical Report
Prototype Software and Source Code
6.0 Security and Compliance Requirements:
6.1 Data Handling: This project involves the processing, storing, and transmitting of Controlled Unclassified Information (CUI) and ITAR-controlled technical data. The data and any derivative products (including algorithms and source code) are subject to U.S. export control laws.
6.2 Compliance Frameworks: The Subcontractor must adhere to the following regulations and standards for the entire period of performance: * DFARS 252.204-7012: Safeguarding Covered Defense Information and Cyber Incident Reporting. The Subcontractor's information systems must comply with the security requirements specified in NIST SP 800-171. * Cybersecurity Maturity Model Certification (CMMC) Level 2: The Subcontractor must achieve and maintain CMMC Level 2 certification for all information systems that process, store, or transmit CUI in connection with this project. This requirement reflects AMERICAN SYSTEMS' own commitment to the highest security standards, as demonstrated by its own CMMC Level 2 certification.
* International Traffic in Arms Regulations (ITAR): The algorithms, source code, and technical data developed under this SOW are considered "defense articles" and "technical data" as defined under the United States Munitions List (USML), Category XV (Spacecraft and Related Articles). Transfer of this technical data to any foreign person or entity, whether in the U.S. or abroad, is strictly prohibited without an explicit license from the U.S. Department of State.
6.3 Personnel: All personnel with access to ITAR-controlled technical data must be U.S. Persons as defined by ITAR unless a specific exemption or license is obtained.
7.0 Government Furnished Information (GFI): A dataset of satellite telemetry, classified as CUI, will be provided by the government customer via a secure transfer method designated by AMERICAN SYSTEMS.

1.3 Meeting Minutes - Project Kickoff
Format: TXT Document
PROJECT KICKOFF MEETING NOTES
Project: AETHER WATCH Date: November 5, 2025 Attendees: Dr. Eleanor Vance (Purdue), Dr. Samuel Carter (Purdue), Li Chen (Purdue), Mark Johnson (AMERICAN SYSTEMS PM)
------------------------------------------------------------------
DISCUSSION TOPICS:
1. Introductions and Project Overview - Mark J. welcomed the Purdue team. - Dr. Vance gave an overview of the lab's capabilities and excitement for the project. - Reviewed high-level goals from the SOW.
2. Data Transfer Plan - Mark J. confirmed the CUI dataset is ready for transfer. - Purdue team confirmed their AWS environment is provisioned and ready to receive the data. - Mark J. to initiate secure transfer by EOW.
3. Initial Technical Tasks - The team discussed the first steps for Phase 1. - Focus will be on data preprocessing and building the initial model structure. - Dr. Vance noted that the core RSO trajectory prediction module is the most critical first component.
4. Collaboration with U. Manchester - Dr. Vance mentioned the plan to have Dr. Smith at the University of Manchester review the algorithms for validation purposes. - Mark J. asked for Dr. Smith's contact info to keep in the project stakeholder list.
ACTION ITEMS:
AI-1: Li Chen to begin developing the core RSO trajectory prediction module using the initial CUI dataset once it is received. (Owner: L. Chen, Due: Dec 15, 2025)
AI-2: Mark Johnson to initiate secure transfer of the CUI dataset to Purdue's designated endpoint. (Owner: M. Johnson, Due: Nov 8, 2025)
AI-3: Purdue team to share preliminary algorithm source code with Dr. Smith (U. Manchester) via university GitHub for peer review by end of Q1 2026. (Owner: E. Vance, Due: Mar 31, 2026)
AI-4: Schedule next technical interchange meeting for first week of December. (Owner: M. Johnson)
------------------------------------------------------------------ END OF NOTES

ITAR Compliance Brief: The algorithms, source code, and technical specifications developed under the project are defined as USML Category XV articles. Providing a non-U.S. Person, such as a foreign national graduate student, with access to this technical data constitutes a deemed export. This action requires an export license from the Department of State's Directorate of Defense Trade Controls (DDTC) before access is granted.

Key compliance issues identified:
- Li Chen (PRC citizen) listed as non-U.S. Person requiring export license for ITAR data access
- Collaboration with Dr. Smith at University of Manchester requires DDTC export license
- All algorithms and source code subject to deemed export restrictions
- Email correspondence shows potential technical data sharing without proper export controls

CMMC Level 2 Requirements:
- 110 security controls from NIST SP 800-171
- Current implementation gaps in MFA deployment, audit log immutability, incident response procedures
- 7 of 10 tested controls passing with partial implementations noted
- Critical gaps in access control, audit accountability, and system protection

Risk Assessment:
- Medium likelihood, High impact: Non-U.S. Person access to ITAR code/data
- Low likelihood, High impact: Egress to foreign validation service enabled by default
- Medium likelihood, Medium impact: Incomplete DMP for CUI specifics
- Medium likelihood, High impact: Audit log immutability not proven

Current compliance readiness estimated at 65% with technical infrastructure largely in place but policy gaps in international collaboration procedures and access controls for foreign nationals.`;
  }

  /**
   * Get hardcoded vector search results based on query
   */
  public getVectorSearchResults(query: string): {
    query: string;
    chunks: Array<{
      id: string;
      content: string;
      metadata: {
        document_id: string;
        source_file_name: string;
        chunk_type: string;
      };
      similarity: number;
      relevanceScore: number;
    }>;
  } {
    const lowerQuery = query.toLowerCase();

    // Return relevant sections from example.md based on query
    const baseResponse = {
      query,
      resultsFound: 3,
      totalResults: 3,
      threshold: 0.7,
      executionTime: Date.now(),
      serviceInfo: {
        vectorService: "TestingDataService",
        embeddingService: "TestingDataService",
      },
    };

    if (lowerQuery.includes("itar") || lowerQuery.includes("export")) {
      return {
        ...baseResponse,
        chunks: [
          {
            id: "itar-compliance-1",
            content:
              "ITAR Compliance Brief: The algorithms, source code, and technical specifications developed under the project are defined as USML Category XV articles. Providing a non-U.S. Person, such as a foreign national graduate student, with access to this technical data constitutes a deemed export. This action requires an export license from the Department of State's Directorate of Defense Trade Controls (DDTC) before access is granted.",
            metadata: {
              document_id: "example-md",
              source_file_name: "example.md",
              chunk_type: "compliance_requirement",
            },
            similarity: 0.92,
            relevanceScore: 0.92,
          },
          {
            id: "itar-personnel-1",
            content:
              "Li Chen (Ph.D. Student, Purdue University, People's Republic of China, U.S. Person Status: N). Constraint: ITAR-controlled technical data and code MUST NOT be accessible by non–U.S. Persons (e.g., Li Chen) absent an export license.",
            metadata: {
              document_id: "example-md",
              source_file_name: "example.md",
              chunk_type: "personnel_restriction",
            },
            similarity: 0.88,
            relevanceScore: 0.88,
          },
        ],
      };
    }

    if (lowerQuery.includes("cmmc") || lowerQuery.includes("security")) {
      return {
        ...baseResponse,
        chunks: [
          {
            id: "cmmc-controls-1",
            content:
              "CMMC Level 2 Controls (Based on NIST SP 800-171 Rev 2): Access Control (AC) 3.1.1: Limit information system access to authorized users. 3.5.3: Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts.",
            metadata: {
              document_id: "example-md",
              source_file_name: "example.md",
              chunk_type: "security_control",
            },
            similarity: 0.9,
            relevanceScore: 0.9,
          },
          {
            id: "cmmc-testing-1",
            content:
              "Test Results: AC-01 Pass (MFA enforcement verified), AC-02 Pass (least privilege IAM roles), SC-01 Pass (FIPS-validated TLS), AU-02 Partial (log immutability gaps), IR-01 Partial (incident response plan needs DFARS reporting).",
            metadata: {
              document_id: "example-md",
              source_file_name: "example.md",
              chunk_type: "test_results",
            },
            similarity: 0.85,
            relevanceScore: 0.85,
          },
        ],
      };
    }

    // Default comprehensive response
    return {
      ...baseResponse,
      chunks: [
        {
          id: "project-overview-1",
          content:
            "Project AETHER WATCH: AI-Driven Anomaly Detection for Enhanced Space Domain Awareness. Our primary objective is to create and validate algorithms capable of analyzing satellite telemetry data in near-real-time to identify Cyber-Suspicious Indicators (CSI). This project seeks funding to support a 24-month research and development effort, leveraging the unique expertise of Purdue University's Advanced Signal Processing Lab.",
          metadata: {
            document_id: "example-md",
            source_file_name: "example.md",
            chunk_type: "project_description",
          },
          similarity: 0.8,
          relevanceScore: 0.8,
        },
        {
          id: "compliance-scope-1",
          content:
            "Compliance Scope: DFARS 252.204-7012 • NIST SP 800-171 (CMMC Level 2) • ITAR (USML Cat XV). The project involves processing, storing, and transmitting of Controlled Unclassified Information (CUI) and ITAR-controlled technical data.",
          metadata: {
            document_id: "example-md",
            source_file_name: "example.md",
            chunk_type: "compliance_framework",
          },
          similarity: 0.78,
          relevanceScore: 0.78,
        },
        {
          id: "risk-assessment-1",
          content:
            "Risk Register: R-01 Non–U.S. Person access to ITAR code/data (Medium likelihood, High impact). R-02 Egress to foreign validation service enabled by default (Low likelihood, High impact). R-03 Incomplete DMP for CUI specifics (Medium likelihood, Medium impact).",
          metadata: {
            document_id: "example-md",
            source_file_name: "example.md",
            chunk_type: "risk_analysis",
          },
          similarity: 0.75,
          relevanceScore: 0.75,
        },
      ],
    };
  }
}

export const testingDataService = TestingDataService.getInstance();
