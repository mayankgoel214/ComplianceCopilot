import { sql } from './neon-client';
import {
  ComplianceFramework,
  Assessment,
  ComplianceRequirement,
  ComplianceGap,
  ComplianceRecommendation
} from './types';

export class ComplianceService {
  // Compliance Framework operations
  async createComplianceFramework(
    projectId: string,
    frameworkName: string,
    confidenceScore: number,
    requirements: Record<string, any>
  ): Promise<ComplianceFramework> {
    try {
      const result = await sql`
        INSERT INTO compliance_frameworks (project_id, framework_name, confidence_score, requirements)
        VALUES (${projectId}, ${frameworkName}, ${confidenceScore}, ${JSON.stringify(requirements)})
        ON CONFLICT (project_id, framework_name)
        DO UPDATE SET
          confidence_score = EXCLUDED.confidence_score,
          requirements = EXCLUDED.requirements,
          created_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      return result[0] as ComplianceFramework;
    } catch (error) {
      console.error('Error creating compliance framework:', error);
      throw error;
    }
  }

  async getComplianceFrameworksByProject(projectId: string): Promise<ComplianceFramework[]> {
    try {
      const result = await sql`
        SELECT * FROM compliance_frameworks
        WHERE project_id = ${projectId}
        ORDER BY confidence_score DESC, created_at DESC
      `;

      return result as ComplianceFramework[];
    } catch (error) {
      console.error('Error getting compliance frameworks:', error);
      throw error;
    }
  }

  async getComplianceFrameworkById(frameworkId: string): Promise<ComplianceFramework | null> {
    try {
      const result = await sql`
        SELECT * FROM compliance_frameworks
        WHERE id = ${frameworkId}
      `;

      return result.length > 0 ? (result[0] as ComplianceFramework) : null;
    } catch (error) {
      console.error('Error getting compliance framework by ID:', error);
      throw error;
    }
  }

  async updateComplianceFramework(
    frameworkId: string,
    confidenceScore?: number,
    requirements?: Record<string, any>
  ): Promise<ComplianceFramework> {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (confidenceScore !== undefined) {
        updates.push(`confidence_score = $${updates.length + 1}`);
        values.push(confidenceScore);
      }

      if (requirements !== undefined) {
        updates.push(`requirements = $${updates.length + 1}`);
        values.push(JSON.stringify(requirements));
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      const query = `
        UPDATE compliance_frameworks
        SET ${updates.join(', ')}
        WHERE id = $${updates.length + 1}
        RETURNING *
      `;

      values.push(frameworkId);

      const result = await sql.unsafe(query, values);
      return result[0] as ComplianceFramework;
    } catch (error) {
      console.error('Error updating compliance framework:', error);
      throw error;
    }
  }

  async deleteComplianceFramework(frameworkId: string): Promise<void> {
    try {
      await sql`
        DELETE FROM compliance_frameworks
        WHERE id = ${frameworkId}
      `;
    } catch (error) {
      console.error('Error deleting compliance framework:', error);
      throw error;
    }
  }

  // Assessment operations
  async createAssessment(
    projectId: string,
    frameworkId: string | null,
    score: number,
    gaps: ComplianceGap[],
    recommendations: ComplianceRecommendation[]
  ): Promise<Assessment> {
    try {
      const result = await sql`
        INSERT INTO assessments (project_id, framework_id, score, gaps, recommendations)
        VALUES (
          ${projectId},
          ${frameworkId},
          ${score},
          ${JSON.stringify(gaps)},
          ${JSON.stringify(recommendations)}
        )
        RETURNING *
      `;

      return result[0] as Assessment;
    } catch (error) {
      console.error('Error creating assessment:', error);
      throw error;
    }
  }

  async getAssessmentsByProject(projectId: string): Promise<Assessment[]> {
    try {
      const result = await sql`
        SELECT * FROM assessments
        WHERE project_id = ${projectId}
        ORDER BY assessed_at DESC
      `;

      return result as Assessment[];
    } catch (error) {
      console.error('Error getting assessments by project:', error);
      throw error;
    }
  }

  async getAssessmentsByFramework(frameworkId: string): Promise<Assessment[]> {
    try {
      const result = await sql`
        SELECT * FROM assessments
        WHERE framework_id = ${frameworkId}
        ORDER BY assessed_at DESC
      `;

      return result as Assessment[];
    } catch (error) {
      console.error('Error getting assessments by framework:', error);
      throw error;
    }
  }

  async getLatestAssessmentByProject(projectId: string): Promise<Assessment | null> {
    try {
      const result = await sql`
        SELECT * FROM assessments
        WHERE project_id = ${projectId}
        ORDER BY assessed_at DESC
        LIMIT 1
      `;

      return result.length > 0 ? (result[0] as Assessment) : null;
    } catch (error) {
      console.error('Error getting latest assessment:', error);
      throw error;
    }
  }

  async getLatestAssessmentByFramework(
    projectId: string,
    frameworkId: string
  ): Promise<Assessment | null> {
    try {
      const result = await sql`
        SELECT * FROM assessments
        WHERE project_id = ${projectId} AND framework_id = ${frameworkId}
        ORDER BY assessed_at DESC
        LIMIT 1
      `;

      return result.length > 0 ? (result[0] as Assessment) : null;
    } catch (error) {
      console.error('Error getting latest framework assessment:', error);
      throw error;
    }
  }

  // Compliance analysis and statistics
  async getComplianceOverview(projectId: string): Promise<{
    totalFrameworks: number;
    averageScore: number;
    highPriorityGaps: number;
    lastAssessmentDate?: Date;
    frameworks: Array<{
      id: string;
      name: string;
      score?: number;
      confidence: number;
      gapCount: number;
    }>;
  }> {
    try {
      // Get frameworks with their latest assessments
      const frameworksResult = await sql`
        SELECT
          cf.id,
          cf.framework_name as name,
          cf.confidence_score as confidence,
          latest_assessment.score,
          latest_assessment.gaps,
          latest_assessment.assessed_at
        FROM compliance_frameworks cf
        LEFT JOIN (
          SELECT DISTINCT ON (framework_id)
            framework_id,
            score,
            gaps,
            assessed_at
          FROM assessments
          WHERE project_id = ${projectId}
          ORDER BY framework_id, assessed_at DESC
        ) latest_assessment ON cf.id = latest_assessment.framework_id
        WHERE cf.project_id = ${projectId}
        ORDER BY cf.confidence_score DESC
      `;

      const frameworks = frameworksResult.map((row: any) => ({
        id: row.id,
        name: row.name,
        score: row.score,
        confidence: row.confidence || 0,
        gapCount: row.gaps ? JSON.parse(row.gaps).length : 0
      }));

      // Calculate statistics
      const totalFrameworks = frameworks.length;
      const scoresWithValues = frameworks.filter(f => f.score !== null);
      const averageScore = scoresWithValues.length > 0
        ? scoresWithValues.reduce((sum, f) => sum + (f.score || 0), 0) / scoresWithValues.length
        : 0;

      // Count high priority gaps
      const allGaps = frameworksResult.flatMap((row: any) =>
        row.gaps ? JSON.parse(row.gaps) : []
      );
      const highPriorityGaps = allGaps.filter((gap: ComplianceGap) =>
        gap.severity === 'high'
      ).length;

      // Get latest assessment date
      const latestAssessment = await this.getLatestAssessmentByProject(projectId);

      return {
        totalFrameworks,
        averageScore: Math.round(averageScore * 100) / 100,
        highPriorityGaps,
        lastAssessmentDate: latestAssessment?.assessed_at,
        frameworks
      };
    } catch (error) {
      console.error('Error getting compliance overview:', error);
      throw error;
    }
  }

  async getComplianceHistory(
    projectId: string,
    limit: number = 10
  ): Promise<Array<{
    date: Date;
    overallScore: number;
    frameworkScores: Record<string, number>;
  }>> {
    try {
      const result = await sql`
        SELECT
          a.assessed_at as date,
          a.score,
          cf.framework_name
        FROM assessments a
        JOIN compliance_frameworks cf ON a.framework_id = cf.id
        WHERE a.project_id = ${projectId}
        ORDER BY a.assessed_at DESC
        LIMIT ${limit * 5}  -- Get more records to group by date
      `;

      // Group assessments by date and calculate overall scores
      const groupedByDate = new Map();

      result.forEach((row: any) => {
        const dateKey = row.date.toISOString().split('T')[0]; // Group by date only
        if (!groupedByDate.has(dateKey)) {
          groupedByDate.set(dateKey, {
            date: row.date,
            frameworkScores: {},
            scores: []
          });
        }

        const group = groupedByDate.get(dateKey);
        group.frameworkScores[row.framework_name] = row.score;
        group.scores.push(row.score);
      });

      // Calculate overall scores and format result
      const history = Array.from(groupedByDate.values())
        .map(group => ({
          date: group.date,
          overallScore: group.scores.reduce((sum: number, score: number) => sum + score, 0) / group.scores.length,
          frameworkScores: group.frameworkScores
        }))
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, limit);

      return history;
    } catch (error) {
      console.error('Error getting compliance history:', error);
      throw error;
    }
  }

  // Helper methods
  async isFrameworkInProject(frameworkId: string, projectId: string): Promise<boolean> {
    try {
      const result = await sql`
        SELECT 1 FROM compliance_frameworks
        WHERE id = ${frameworkId} AND project_id = ${projectId}
      `;

      return result.length > 0;
    } catch (error) {
      console.error('Error checking framework project ownership:', error);
      return false;
    }
  }

  async deleteAllProjectCompliance(projectId: string): Promise<void> {
    try {
      // Delete assessments first (due to foreign key constraints)
      await sql`DELETE FROM assessments WHERE project_id = ${projectId}`;
      // Then delete frameworks
      await sql`DELETE FROM compliance_frameworks WHERE project_id = ${projectId}`;
    } catch (error) {
      console.error('Error deleting project compliance data:', error);
      throw error;
    }
  }
}

// Singleton instance
let complianceServiceInstance: ComplianceService | null = null;

export function getComplianceService(): ComplianceService {
  if (!complianceServiceInstance) {
    complianceServiceInstance = new ComplianceService();
  }
  return complianceServiceInstance;
}