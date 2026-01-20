import { NextRequest, NextResponse } from 'next/server';
import { getDocumentProcessor } from '@/lib/processing/document-processor';
import { sql } from '@/lib/db/neon-client';

// Helper function to verify Firebase token
async function verifyToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const idToken = authHeader.split('Bearer ')[1];
  const admin = await import('firebase-admin');

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// GET /api/projects/[id]/processing-status - Get processing status for a project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify Firebase ID token for user authentication
    await verifyToken(request.headers.get('authorization'));

    const { id: projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const jobId = url.searchParams.get('job_id');

    const processor = getDocumentProcessor();

    // If job_id is provided, get specific job status
    if (jobId) {
      const jobStatus = await processor.getJobStatus(jobId);

      if (!jobStatus) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        );
      }

      // Verify job belongs to this project
      if (jobStatus.project_id !== projectId) {
        return NextResponse.json(
          { error: 'Job not found in this project' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        job: jobStatus,
        project_id: projectId
      });
    }

    // Get all recent processing jobs for the project
    const recentJobs = await sql`
      SELECT
        id,
        project_id,
        document_id,
        job_type,
        status,
        total_documents,
        processed_documents,
        total_chunks,
        processed_chunks,
        started_at,
        completed_at,
        error_message,
        created_at,
        EXTRACT(EPOCH FROM (COALESCE(completed_at, CURRENT_TIMESTAMP) - started_at)) as duration_seconds
      FROM processing_jobs
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
      LIMIT 20
    `;

    // Get processing statistics for the project
    const projectStats = await sql`
      SELECT
        COUNT(DISTINCT d.id) as total_documents,
        COUNT(DISTINCT dc.id) as total_chunks,
        SUM(dc.tokens) as total_tokens,
        AVG(dc.tokens) as avg_chunk_size,
        COUNT(DISTINCT d.id) FILTER (WHERE d.last_analyzed IS NOT NULL) as processed_documents,
        MAX(d.last_analyzed) as last_processing_date
      FROM documents d
      LEFT JOIN document_chunks dc ON d.id = dc.document_id
      WHERE d.project_id = ${projectId}
    `;

    const stats = projectStats[0] as any;

    // Get current active jobs
    const activeJobs = recentJobs.filter((job: any) =>
      job.status === 'pending' || job.status === 'running'
    );

    // Calculate overall project processing status
    const isProcessing = activeJobs.length > 0;
    const processingProgress = stats.total_documents > 0 ?
      (stats.processed_documents / stats.total_documents) * 100 : 0;

    return NextResponse.json({
      project_id: projectId,
      processing_status: {
        is_processing: isProcessing,
        active_jobs: activeJobs.length,
        progress_percentage: Math.round(processingProgress),
        last_processing_date: stats.last_processing_date
      },
      statistics: {
        total_documents: parseInt(stats.total_documents) || 0,
        processed_documents: parseInt(stats.processed_documents) || 0,
        total_chunks: parseInt(stats.total_chunks) || 0,
        total_tokens: parseInt(stats.total_tokens) || 0,
        average_chunk_size: Math.round(parseFloat(stats.avg_chunk_size) || 0)
      },
      recent_jobs: recentJobs.map((job: any) => ({
        job_id: job.id,
        document_id: job.document_id,
        job_type: job.job_type,
        status: job.status,
        progress: {
          documents: {
            total: job.total_documents || 0,
            processed: job.processed_documents || 0
          },
          chunks: {
            total: job.total_chunks || 0,
            processed: job.processed_chunks || 0
          }
        },
        timing: {
          started_at: job.started_at,
          completed_at: job.completed_at,
          duration_seconds: job.duration_seconds ? Math.round(job.duration_seconds) : null
        },
        error: job.error_message ? { message: job.error_message } : null,
        created_at: job.created_at
      }))
    });

  } catch (error) {
    console.error('Error in GET /api/projects/[id]/processing-status:', error);

    if (error instanceof Error) {
      if (error.message.includes('token') || error.message.includes('unauthorized')) {
        return NextResponse.json(
          { error: 'Authentication failed. Please sign out and sign in again.' },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to get processing status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}