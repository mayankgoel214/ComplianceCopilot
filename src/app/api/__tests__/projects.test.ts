import { GET, POST } from '../projects/route';
import { getProjectsService } from '@/lib/db/projects-service';

// Mock dependencies
jest.mock('@/lib/db/projects-service');
jest.mock('firebase-admin', () => ({
  apps: [],
  auth: () => ({
    verifyIdToken: jest.fn(),
  }),
  credential: {
    cert: jest.fn(),
  },
  initializeApp: jest.fn(),
}));

const mockGetProjectsService = getProjectsService as jest.MockedFunction<typeof getProjectsService>;

// Helper function to create mock request
function createMockRequest(options: {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}) {
  return {
    method: options.method || 'GET',
    headers: {
      get: jest.fn((name: string) => {
        return options.headers?.[name.toLowerCase()] || null;
      }),
    },
    json: jest.fn().mockResolvedValue(options.body || {}),
  } as any;
}

describe('/api/projects', () => {
  let mockProjectsService: any;

  beforeEach(() => {
    mockProjectsService = {
      getUserByFirebaseId: jest.fn(),
      createUser: jest.fn(),
      getProjectSummariesByUserId: jest.fn(),
      createProject: jest.fn(),
    };

    mockGetProjectsService.mockReturnValue(mockProjectsService);

    // Mock Firebase Admin
    const admin = require('firebase-admin');
    admin.auth().verifyIdToken.mockResolvedValue({
      uid: 'test-firebase-uid',
      email: 'test@example.com',
      name: 'Test User',
    });

    jest.clearAllMocks();
  });

  describe('GET /api/projects', () => {
    it('should return projects for authenticated user', async () => {
      const mockUser = {
        id: 'test-user-id',
        firebase_uid: 'test-firebase-uid',
        email: 'test@example.com',
        name: 'Test User',
      };

      const mockProjects = [
        {
          id: 'project-1',
          name: 'Test Project 1',
          description: 'Description 1',
          status: 'draft',
          document_count: 2,
          framework_count: 1,
          latest_compliance_score: 75,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'project-2',
          name: 'Test Project 2',
          description: 'Description 2',
          status: 'completed',
          document_count: 5,
          framework_count: 3,
          latest_compliance_score: 90,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockProjectsService.getUserByFirebaseId.mockResolvedValue(mockUser);
      mockProjectsService.getProjectSummariesByUserId.mockResolvedValue(mockProjects);

      const request = createMockRequest({
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.projects).toEqual(mockProjects);
      expect(mockProjectsService.getUserByFirebaseId).toHaveBeenCalledWith('test-firebase-uid');
      expect(mockProjectsService.getProjectSummariesByUserId).toHaveBeenCalledWith('test-user-id');
    });

    it('should create user if not exists', async () => {
      const mockNewUser = {
        id: 'new-user-id',
        firebase_uid: 'test-firebase-uid',
        email: 'test@example.com',
        name: 'Test User',
      };

      mockProjectsService.getUserByFirebaseId.mockResolvedValue(null);
      mockProjectsService.createUser.mockResolvedValue(mockNewUser);
      mockProjectsService.getProjectSummariesByUserId.mockResolvedValue([]);

      const request = createMockRequest({
        headers: {
          authorization: 'Bearer valid-token',
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockProjectsService.createUser).toHaveBeenCalledWith({
        firebase_uid: 'test-firebase-uid',
        email: 'test@example.com',
        name: 'Test User',
      });
      expect(data.projects).toEqual([]);
    });

    it('should return 401 for missing authorization header', async () => {
      const request = createMockRequest({});

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Missing or invalid authorization header');
    });

    it('should return 401 for invalid token', async () => {
      const admin = require('firebase-admin');
      admin.auth().verifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const request = createMockRequest({
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid token');
    });
  });

  describe('POST /api/projects', () => {
    it('should create a new project successfully', async () => {
      const mockUser = {
        id: 'test-user-id',
        firebase_uid: 'test-firebase-uid',
        email: 'test@example.com',
        name: 'Test User',
      };

      const mockProject = {
        id: 'new-project-id',
        user_id: 'test-user-id',
        name: 'New Test Project',
        description: 'New project description',
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockProjectsService.getUserByFirebaseId.mockResolvedValue(mockUser);
      mockProjectsService.createProject.mockResolvedValue(mockProject);

      const request = createMockRequest({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: {
          name: 'New Test Project',
          description: 'New project description',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.project).toEqual(mockProject);
      expect(mockProjectsService.createProject).toHaveBeenCalledWith({
        user_id: 'test-user-id',
        name: 'New Test Project',
        description: 'New project description',
      });
    });

    it('should handle missing project name', async () => {
      const request = createMockRequest({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: {
          description: 'Project without name',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Project name is required');
    });

    it('should handle empty project name', async () => {
      const request = createMockRequest({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: {
          name: '   ',
          description: 'Project with empty name',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Project name is required');
    });

    it('should create project without description', async () => {
      const mockUser = {
        id: 'test-user-id',
        firebase_uid: 'test-firebase-uid',
        email: 'test@example.com',
        name: 'Test User',
      };

      const mockProject = {
        id: 'new-project-id',
        user_id: 'test-user-id',
        name: 'Project Without Description',
        description: null,
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockProjectsService.getUserByFirebaseId.mockResolvedValue(mockUser);
      mockProjectsService.createProject.mockResolvedValue(mockProject);

      const request = createMockRequest({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: {
          name: 'Project Without Description',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.project).toEqual(mockProject);
      expect(mockProjectsService.createProject).toHaveBeenCalledWith({
        user_id: 'test-user-id',
        name: 'Project Without Description',
        description: null,
      });
    });

    it('should handle database errors', async () => {
      const mockUser = {
        id: 'test-user-id',
        firebase_uid: 'test-firebase-uid',
        email: 'test@example.com',
        name: 'Test User',
      };

      mockProjectsService.getUserByFirebaseId.mockResolvedValue(mockUser);
      mockProjectsService.createProject.mockRejectedValue(new Error('Database connection failed'));

      const request = createMockRequest({
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: {
          name: 'Test Project',
          description: 'Test Description',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });
});