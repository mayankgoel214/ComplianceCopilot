import { create } from 'zustand';
import { ProjectSummary } from '@/lib/db/types';

interface ProjectState {
  // Current selected project
  currentProject: ProjectSummary | null;

  // List of all user projects for the selector
  projects: ProjectSummary[];

  // Loading states
  loading: boolean;
  projectsLoading: boolean;

  // Error states
  error: string | null;

  // Navigation state for project sections
  currentSection: 'sources' | 'ideate' | 'compliance-report' | null;
}

interface ProjectActions {
  // Project selection
  setCurrentProject: (project: ProjectSummary | null) => void;
  selectProjectById: (projectId: string) => void;
  clearCurrentProject: () => void;

  // Projects list management
  setProjects: (projects: ProjectSummary[]) => void;
  addProject: (project: ProjectSummary) => void;
  updateProject: (projectId: string, updates: Partial<ProjectSummary>) => void;
  removeProject: (projectId: string) => void;

  // Loading states
  setLoading: (loading: boolean) => void;
  setProjectsLoading: (loading: boolean) => void;

  // Error handling
  setError: (error: string | null) => void;

  // Navigation
  setCurrentSection: (section: ProjectState['currentSection']) => void;

  // Data fetching
  fetchProjects: (authToken: string) => Promise<void>;
  fetchProjectById: (projectId: string, authToken: string) => Promise<void>;

  // Utility methods
  isProjectSelected: () => boolean;
  getCurrentProjectId: () => string | null;
  getProjectById: (projectId: string) => ProjectSummary | undefined;
}

export type ProjectStore = ProjectState & ProjectActions;

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // Initial state
  currentProject: null,
  projects: [],
  loading: false,
  projectsLoading: false,
  error: null,
  currentSection: null,

  // Project selection actions
  setCurrentProject: (project) => {
    set({
      currentProject: project,
      currentSection: project ? 'sources' : null, // Default to sources when selecting a project
      error: null
    });
  },

  selectProjectById: (projectId) => {
    const { projects } = get();
    const project = projects.find(p => p.id === projectId);
    if (project) {
      get().setCurrentProject(project);
    }
  },

  clearCurrentProject: () => {
    set({
      currentProject: null,
      currentSection: null,
      error: null
    });
  },

  // Projects list management
  setProjects: (projects) => {
    set({ projects, error: null });
  },

  addProject: (project) => {
    set(state => ({
      projects: [...state.projects, project],
      error: null
    }));
  },

  updateProject: (projectId, updates) => {
    set(state => ({
      projects: state.projects.map(p =>
        p.id === projectId ? { ...p, ...updates } : p
      ),
      currentProject: state.currentProject?.id === projectId
        ? { ...state.currentProject, ...updates }
        : state.currentProject,
      error: null
    }));
  },

  removeProject: (projectId) => {
    set(state => ({
      projects: state.projects.filter(p => p.id !== projectId),
      currentProject: state.currentProject?.id === projectId
        ? null
        : state.currentProject,
      currentSection: state.currentProject?.id === projectId
        ? null
        : state.currentSection,
      error: null
    }));
  },

  // Loading states
  setLoading: (loading) => set({ loading }),
  setProjectsLoading: (projectsLoading) => set({ projectsLoading }),

  // Error handling
  setError: (error) => set({ error }),

  // Navigation
  setCurrentSection: (currentSection) => set({ currentSection }),

  // Data fetching
  fetchProjects: async (authToken) => {
    try {
      set({ projectsLoading: true, error: null });

      const response = await fetch('/api/projects', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }

      const data = await response.json();
      set({
        projects: data.projects || [],
        projectsLoading: false,
        error: null
      });
    } catch (error) {
      console.error('Error fetching projects:', error);
      set({
        projectsLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load projects'
      });
    }
  },

  fetchProjectById: async (projectId, authToken) => {
    try {
      set({ loading: true, error: null });

      const response = await fetch(`/api/projects/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Project not found');
        }
        throw new Error(`Failed to fetch project: ${response.statusText}`);
      }

      const data = await response.json();
      const projectSummary: ProjectSummary = {
        id: data.project.id,
        name: data.project.name,
        description: data.project.description,
        use_case: data.project.use_case,
        status: data.project.status,
        created_at: data.project.created_at,
        updated_at: data.project.updated_at,
        user_email: '', // This might need to be populated from auth
        document_count: data.stats?.documentCount || 0,
        framework_count: data.stats?.frameworkCount || 0,
        latest_compliance_score: data.stats?.latestScore || 0,
        last_assessment_date: data.stats?.lastAssessmentDate || new Date(),
      };

      set({
        currentProject: projectSummary,
        loading: false,
        error: null
      });

      // Also update the project in the projects list if it exists
      get().updateProject(projectId, projectSummary);

    } catch (error) {
      console.error('Error fetching project:', error);
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load project'
      });
    }
  },

  // Utility methods
  isProjectSelected: () => {
    return get().currentProject !== null;
  },

  getCurrentProjectId: () => {
    return get().currentProject?.id || null;
  },

  getProjectById: (projectId) => {
    return get().projects.find(p => p.id === projectId);
  },
}));