import { ProjectsService } from '../projects-service';
import { sql } from '../neon-client';
import { User, Project, CreateUserDTO, CreateProjectDTO, UpdateProjectDTO } from '../types';

// Mock the neon client
jest.mock('../neon-client', () => ({
  sql: jest.fn(),
}));

const mockSql = sql as jest.MockedFunction<typeof sql>;

describe('ProjectsService', () => {
  let projectsService: ProjectsService;

  beforeEach(() => {
    projectsService = new ProjectsService();
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      const userData: CreateUserDTO = {
        firebase_uid: 'test-firebase-uid',
        email: 'test@example.com',
        name: 'Test User',
      };

      const mockUser: User = {
        id: 'test-user-id',
        firebase_uid: 'test-firebase-uid',
        email: 'test@example.com',
        name: 'Test User',
        created_at: new Date(),
      };

      mockSql.mockResolvedValue([mockUser]);

      const result = await projectsService.createUser(userData);

      expect(result).toEqual(mockUser);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        userData.firebase_uid,
        userData.email,
        userData.name,
        null
      );
    });

    it('should handle duplicate firebase_uid with upsert', async () => {
      const userData: CreateUserDTO = {
        firebase_uid: 'existing-uid',
        email: 'updated@example.com',
        name: 'Updated User',
      };

      const mockUser: User = {
        id: 'existing-user-id',
        firebase_uid: 'existing-uid',
        email: 'updated@example.com',
        name: 'Updated User',
        created_at: new Date(),
      };

      mockSql.mockResolvedValue([mockUser]);

      const result = await projectsService.createUser(userData);

      expect(result).toEqual(mockUser);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        userData.firebase_uid,
        userData.email,
        userData.name,
        null
      );
    });

    it('should handle database errors', async () => {
      const userData: CreateUserDTO = {
        firebase_uid: 'test-firebase-uid',
        email: 'test@example.com',
      };

      mockSql.mockRejectedValue(new Error('Database connection failed'));

      await expect(projectsService.createUser(userData)).rejects.toThrow('Database connection failed');
    });
  });

  describe('getUserByFirebaseId', () => {
    it('should return user when found', async () => {
      const mockUser: User = {
        id: 'test-user-id',
        firebase_uid: 'test-firebase-uid',
        email: 'test@example.com',
        name: 'Test User',
        created_at: new Date(),
      };

      mockSql.mockResolvedValue([mockUser]);

      const result = await projectsService.getUserByFirebaseId('test-firebase-uid');

      expect(result).toEqual(mockUser);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        'test-firebase-uid'
      );
    });

    it('should return null when user not found', async () => {
      mockSql.mockResolvedValue([]);

      const result = await projectsService.getUserByFirebaseId('nonexistent-uid');

      expect(result).toBeNull();
    });
  });

  describe('createProject', () => {
    it('should create a new project successfully', async () => {
      const projectData: CreateProjectDTO = {
        user_id: 'test-user-id',
        name: 'Test Project',
        description: 'Test Description',
      };

      const mockProject: Project = {
        id: 'test-project-id',
        user_id: 'test-user-id',
        name: 'Test Project',
        description: 'Test Description',
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockSql.mockResolvedValue([mockProject]);

      const result = await projectsService.createProject(projectData);

      expect(result).toEqual(mockProject);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        projectData.user_id,
        projectData.name,
        projectData.description
      );
    });

    it('should create project with null description', async () => {
      const projectData: CreateProjectDTO = {
        user_id: 'test-user-id',
        name: 'Test Project',
      };

      const mockProject: Project = {
        id: 'test-project-id',
        user_id: 'test-user-id',
        name: 'Test Project',
        description: null,
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockSql.mockResolvedValue([mockProject]);

      const result = await projectsService.createProject(projectData);

      expect(result).toEqual(mockProject);
    });
  });

  describe('getProjectById', () => {
    it('should return project when found', async () => {
      const mockProject: Project = {
        id: 'test-project-id',
        user_id: 'test-user-id',
        name: 'Test Project',
        description: 'Test Description',
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockSql.mockResolvedValue([mockProject]);

      const result = await projectsService.getProjectById('test-project-id');

      expect(result).toEqual(mockProject);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        'test-project-id'
      );
    });

    it('should return null when project not found', async () => {
      mockSql.mockResolvedValue([]);

      const result = await projectsService.getProjectById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('updateProject', () => {
    it('should update project with multiple fields', async () => {
      const updateData: UpdateProjectDTO = {
        name: 'Updated Project',
        description: 'Updated Description',
        status: 'completed',
      };

      const mockUpdatedProject: Project = {
        id: 'test-project-id',
        user_id: 'test-user-id',
        name: 'Updated Project',
        description: 'Updated Description',
        status: 'completed',
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Mock the unsafe method on sql
      const mockUnsafe = jest.fn().mockResolvedValue([mockUpdatedProject]);
      (mockSql as any).unsafe = mockUnsafe;

      const result = await projectsService.updateProject('test-project-id', updateData);

      expect(result).toEqual(mockUpdatedProject);
      expect(mockUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE projects'),
        expect.arrayContaining(['Updated Project', 'Updated Description', 'completed', 'test-project-id'])
      );
    });

    it('should update project with single field', async () => {
      const updateData: UpdateProjectDTO = {
        name: 'Updated Name Only',
      };

      const mockUpdatedProject: Project = {
        id: 'test-project-id',
        user_id: 'test-user-id',
        name: 'Updated Name Only',
        description: 'Original Description',
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockUnsafe = jest.fn().mockResolvedValue([mockUpdatedProject]);
      (mockSql as any).unsafe = mockUnsafe;

      const result = await projectsService.updateProject('test-project-id', updateData);

      expect(result).toEqual(mockUpdatedProject);
    });

    it('should throw error when no fields to update', async () => {
      const updateData: UpdateProjectDTO = {};

      await expect(projectsService.updateProject('test-project-id', updateData))
        .rejects.toThrow('No fields to update');
    });
  });

  describe('deleteProject', () => {
    it('should delete project successfully', async () => {
      mockSql.mockResolvedValue([]);

      await projectsService.deleteProject('test-project-id');

      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        'test-project-id'
      );
    });
  });

  describe('isProjectOwner', () => {
    it('should return true when user owns project', async () => {
      mockSql.mockResolvedValue([{ 1: 1 }]); // Non-empty result

      const result = await projectsService.isProjectOwner('test-project-id', 'test-user-id');

      expect(result).toBe(true);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        'test-project-id',
        'test-user-id'
      );
    });

    it('should return false when user does not own project', async () => {
      mockSql.mockResolvedValue([]); // Empty result

      const result = await projectsService.isProjectOwner('test-project-id', 'wrong-user-id');

      expect(result).toBe(false);
    });

    it('should return false on database error', async () => {
      mockSql.mockRejectedValue(new Error('Database error'));

      const result = await projectsService.isProjectOwner('test-project-id', 'test-user-id');

      expect(result).toBe(false);
    });
  });

  describe('getProjectStats', () => {
    it('should return project statistics', async () => {
      const mockStats = {
        document_count: 5,
        framework_count: 3,
        latest_compliance_score: 85.5,
        last_assessment_date: new Date(),
      };

      mockSql.mockResolvedValue([mockStats]);

      const result = await projectsService.getProjectStats('test-project-id');

      expect(result).toEqual({
        documentCount: 5,
        frameworkCount: 3,
        latestScore: 85.5,
        lastAssessmentDate: mockStats.last_assessment_date,
      });
    });

    it('should return default stats when project not found', async () => {
      mockSql.mockResolvedValue([]);

      const result = await projectsService.getProjectStats('nonexistent-project-id');

      expect(result).toEqual({
        documentCount: 0,
        frameworkCount: 0,
      });
    });
  });
});