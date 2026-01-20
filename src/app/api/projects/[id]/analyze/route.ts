import { NextRequest, NextResponse } from 'next/server';
import { getProjectsService } from '@/lib/db/projects-service';
import { getDocumentsService } from '@/lib/db/documents-service';
import { getComplianceService } from '@/lib/db/compliance-service';
import { getDriveService } from '@/lib/google-drive/drive-service';

// Helper function to verify Firebase token and get user
async function verifyTokenAndGetUser(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const idToken = authHeader.split('Bearer ')[1];
  const admin = await import('firebase-admin');

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const projectsService = getProjectsService();

    let user = await projectsService.getUserByFirebaseId(decodedToken.uid);
    if (!user) {
      user = await projectsService.createUser({
        firebase_uid: decodedToken.uid,
        email: decodedToken.email || '',
        name: decodedToken.name,
      });
    }

    return user;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// Simplified compliance framework detection (placeholder for Gemini integration)
function detectComplianceFrameworks(content: string, projectDescription: string): Array<{
  name: string;
  confidence: number;
  keywords: string[];
}> {
  const frameworks = [
    {
      name: 'FERPA',
      keywords: ['student', 'education', 'academic', 'grade', 'transcript', 'enrollment', 'directory information'],
      confidence: 0
    },
    {
      name: 'HIPAA',
      keywords: ['health', 'medical', 'patient', 'healthcare', 'phi', 'protected health information'],
      confidence: 0
    },
    {
      name: 'IRB',
      keywords: ['research', 'human subjects', 'ethics', 'consent', 'study', 'participants', 'survey'],
      confidence: 0
    },
    {
      name: 'GDPR',
      keywords: ['personal data', 'privacy', 'data protection', 'consent', 'european', 'eu'],
      confidence: 0
    },
    {
      name: 'ADA/Section 508',
      keywords: ['accessibility', 'disability', 'ada', 'section 508', 'wcag', 'assistive technology'],
      confidence: 0
    }
  ];

  const allText = (content + ' ' + projectDescription).toLowerCase();

  return frameworks.map(framework => {
    let matchCount = 0;
    const matchedKeywords: string[] = [];

    framework.keywords.forEach(keyword => {
      if (allText.includes(keyword.toLowerCase())) {
        matchCount++;
        matchedKeywords.push(keyword);
      }
    });

    const confidence = Math.min(matchCount / framework.keywords.length * 2, 0.95);

    return {
      name: framework.name,
      confidence,
      keywords: matchedKeywords
    };
  }).filter(f => f.confidence > 0.2); // Only return frameworks with reasonable confidence
}

// Generate mock compliance gaps and recommendations
function generateComplianceAnalysis(frameworks: Array<{ name: string; confidence: number }>) {
  const gaps = [];
  const recommendations = [];

  frameworks.forEach(framework => {
    const score = Math.max(0.3, Math.random() * 0.8); // Mock score between 30-80%

    // Mock gaps
    if (score < 0.8) {
      gaps.push({
        requirement_id: `${framework.name.toLowerCase()}-001`,
        title: `${framework.name} Documentation Gap`,
        description: `Missing or incomplete ${framework.name} compliance documentation`,
        severity: score < 0.5 ? 'high' : 'medium',
        recommendation: `Review and update ${framework.name} compliance procedures`
      });
    }

    // Mock recommendations
    recommendations.push({
      title: `Improve ${framework.name} Compliance`,
      description: `Enhance ${framework.name} compliance to meet industry standards`,
      action_items: [
        `Review current ${framework.name} policies`,
        `Update documentation templates`,
        `Train staff on ${framework.name} requirements`
      ],
      priority: score < 0.6 ? 'high' : 'medium',
      estimated_effort: '2-4 weeks'
    });
  });

  return { gaps, recommendations };
}

// POST /api/projects/[id]/analyze - Analyze project documents for compliance
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyTokenAndGetUser(request.headers.get('authorization'));
    const { id: projectId } = await params;

    const projectsService = getProjectsService();
    const documentsService = getDocumentsService();
    const complianceService = getComplianceService();

    // Verify project ownership
    const isOwner = await projectsService.isProjectOwner(projectId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    // Get project details
    const project = await projectsService.getProjectById(projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Update project status to analyzing
    await projectsService.updateProjectStatus(projectId, 'analyzing');

    // Get all documents for the project
    const documents = await documentsService.getDocumentsByProjectId(projectId);

    if (documents.length === 0) {
      return NextResponse.json({
        error: 'No documents to analyze. Please link some documents first.',
      }, { status: 400 });
    }

    // Initialize Google Drive service
    const driveService = await getDriveService();
    let allContent = '';
    const processedDocuments = [];

    // Fetch content from each document
    for (const document of documents) {
      try {
        const fileContent = await driveService.getFileContent(document.drive_file_id);
        allContent += `\n\n--- ${document.file_name} ---\n${fileContent.content}`;

        // Mark document as analyzed
        await documentsService.markDocumentAsAnalyzed(document.id);

        processedDocuments.push({
          id: document.id,
          name: document.file_name,
          contentLength: fileContent.content.length,
          mimeType: fileContent.mimeType
        });
      } catch (error) {
        console.error(`Error fetching content for document ${document.id}:`, error);
        processedDocuments.push({
          id: document.id,
          name: document.file_name,
          error: 'Failed to fetch content'
        });
      }
    }

    // Detect compliance frameworks
    const detectedFrameworks = detectComplianceFrameworks(
      allContent,
      project.description || ''
    );

    // Save detected frameworks to database
    const savedFrameworks = [];
    for (const framework of detectedFrameworks) {
      const savedFramework = await complianceService.createComplianceFramework(
        projectId,
        framework.name,
        framework.confidence,
        {
          keywords: framework.keywords,
          detectedAt: new Date().toISOString(),
          contentLength: allContent.length
        }
      );
      savedFrameworks.push(savedFramework);
    }

    // Generate compliance analysis
    const { gaps, recommendations } = generateComplianceAnalysis(detectedFrameworks);

    // Calculate overall score
    const overallScore = detectedFrameworks.length > 0
      ? detectedFrameworks.reduce((sum, f) => sum + f.confidence, 0) / detectedFrameworks.length * 100
      : 0;

    // Save assessment
    const assessment = await complianceService.createAssessment(
      projectId,
      null, // No specific framework for overall assessment
      overallScore,
      gaps,
      recommendations
    );

    // Update project status to completed
    await projectsService.updateProjectStatus(projectId, 'completed');

    return NextResponse.json({
      message: 'Analysis completed successfully',
      analysis: {
        processedDocuments,
        detectedFrameworks: savedFrameworks.map(f => ({
          id: f.id,
          name: f.framework_name,
          confidence: f.confidence_score,
          requirements: f.requirements
        })),
        overallScore: Math.round(overallScore * 100) / 100,
        totalGaps: gaps.length,
        highPriorityGaps: gaps.filter(g => g.severity === 'high').length,
        recommendations: recommendations.length,
        contentAnalyzed: allContent.length,
        assessmentId: assessment.id
      },
      analyzedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in POST /api/projects/[id]/analyze:', error);

    // Reset project status on error
    try {
      await getProjectsService().updateProjectStatus(projectId, 'draft');
    } catch (resetError) {
      console.error('Error resetting project status:', resetError);
    }

    if (error instanceof Error && error.message.includes('token')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error during analysis' },
      { status: 500 }
    );
  }
}