import { sql } from './neon-client';
import {
  Project,
  ProjectSummary,
  CreateProjectDTO,
  UpdateProjectDTO,
  User,
  CreateUserDTO
} from './types';

export class ProjectsService {
  // User operations
  async createUser(userData: CreateUserDTO): Promise<User> {
    try {
      const result = await sql`
        INSERT INTO users (firebase_uid, email, name, google_refresh_token)
        VALUES (${userData.firebase_uid}, ${userData.email}, ${userData.name || null}, ${userData.google_refresh_token || null})
        ON CONFLICT (firebase_uid)
        DO UPDATE SET
          email = EXCLUDED.email,
          name = EXCLUDED.name,
          google_refresh_token = COALESCE(EXCLUDED.google_refresh_token, users.google_refresh_token)
        RETURNING *
      `;

      return result[0] as User;
    } catch (error) {
      console.error('Error creating/updating user:', error);
      throw error;
    }
  }

  async getUserByFirebaseId(firebaseUid: string): Promise<User | null> {
    try {
      const result = await sql`
        SELECT * FROM users
        WHERE firebase_uid = ${firebaseUid}
      `;

      return result.length > 0 ? (result[0] as User) : null;
    } catch (error) {
      console.error('Error getting user by Firebase ID:', error);
      throw error;
    }
  }

  async updateUserRefreshToken(firebaseUid: string, refreshToken: string): Promise<void> {
    try {
      await sql`
        UPDATE users
        SET google_refresh_token = ${refreshToken}
        WHERE firebase_uid = ${firebaseUid}
      `;
    } catch (error) {
      console.error('Error updating user refresh token:', error);
      throw error;
    }
  }

  // Project operations
  async createProject(projectData: CreateProjectDTO): Promise<Project> {
    try {
      const result = await sql`
        INSERT INTO projects (user_id, name, description)
        VALUES (${projectData.user_id}, ${projectData.name}, ${projectData.description || null})
        RETURNING *
      `;

      return result[0] as Project;
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  }

  async getProjectById(projectId: string): Promise<Project | null> {
    try {
      const result = await sql`
        SELECT * FROM projects
        WHERE id = ${projectId}
      `;

      return result.length > 0 ? (result[0] as Project) : null;
    } catch (error) {
      console.error('Error getting project by ID:', error);
      throw error;
    }
  }

  async getProjectsByUserId(userId: string): Promise<Project[]> {
    try {
      const result = await sql`
        SELECT * FROM projects
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC
      `;

      return result as Project[];
    } catch (error) {
      console.error('Error getting projects by user ID:', error);
      throw error;
    }
  }

  async getProjectSummariesByUserId(userId: string): Promise<ProjectSummary[]> {
    try {
      const result = await sql`
        SELECT * FROM project_summaries
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC
      `;

      return result as ProjectSummary[];
    } catch (error) {
      console.error('Error getting project summaries:', error);
      throw error;
    }
  }

  async updateProject(projectId: string, updateData: UpdateProjectDTO): Promise<Project> {
    try {
      // Build the update query dynamically based on provided fields
      const updates: string[] = [];
      const values: any[] = [];

      if (updateData.name !== undefined) {
        updates.push(`name = $${updates.length + 1}`);
        values.push(updateData.name);
      }

      if (updateData.description !== undefined) {
        updates.push(`description = $${updates.length + 1}`);
        values.push(updateData.description);
      }

      if (updateData.status !== undefined) {
        updates.push(`status = $${updates.length + 1}`);
        values.push(updateData.status);
      }

      // Always update the updated_at timestamp
      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      if (updates.length === 1) { // Only timestamp update
        throw new Error('No fields to update');
      }

      const query = `
        UPDATE projects
        SET ${updates.join(', ')}
        WHERE id = $${updates.length + 1}
        RETURNING *
      `;

      values.push(projectId);

      const result = await sql.unsafe(query, values);
      return result[0] as Project;
    } catch (error) {
      console.error('Error updating project:', error);
      throw error;
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    try {
      await sql`
        DELETE FROM projects
        WHERE id = ${projectId}
      `;
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  }

  async updateProjectStatus(projectId: string, status: Project['status']): Promise<void> {
    try {
      await sql`
        UPDATE projects
        SET status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${projectId}
      `;
    } catch (error) {
      console.error('Error updating project status:', error);
      throw error;
    }
  }

  // Helper method to check if user owns project
  async isProjectOwner(projectId: string, userId: string): Promise<boolean> {
    try {
      const result = await sql`
        SELECT 1 FROM projects
        WHERE id = ${projectId} AND user_id = ${userId}
      `;

      return result.length > 0;
    } catch (error) {
      console.error('Error checking project ownership:', error);
      return false;
    }
  }

  // Get project statistics
  async getProjectStats(projectId: string): Promise<{
    documentCount: number;
    frameworkCount: number;
    lastAssessmentDate?: Date;
    latestScore?: number;
  }> {
    try {
      const result = await sql`
        SELECT
          document_count,
          framework_count,
          latest_compliance_score,
          last_assessment_date
        FROM project_summaries
        WHERE id = ${projectId}
      `;

      if (result.length === 0) {
        return {
          documentCount: 0,
          frameworkCount: 0
        };
      }

      const row = result[0];
      return {
        documentCount: row.document_count || 0,
        frameworkCount: row.framework_count || 0,
        lastAssessmentDate: row.last_assessment_date,
        latestScore: row.latest_compliance_score
      };
    } catch (error) {
      console.error('Error getting project stats:', error);
      throw error;
    }
  }
}

// Singleton instance
let projectsServiceInstance: ProjectsService | null = null;

export function getProjectsService(): ProjectsService {
  if (!projectsServiceInstance) {
    projectsServiceInstance = new ProjectsService();
  }
  return projectsServiceInstance;
}