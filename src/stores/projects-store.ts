import { create } from "zustand";
import {
  Project,
  ProjectSummary,
  CreateProjectDTO,
  UpdateProjectDTO,
} from "@/lib/db/types";

interface ProjectsState {
  // State
  projects: ProjectSummary[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchProjects: () => Promise<void>;
  createProject: (data: CreateProjectDTO) => Promise<Project>;
  selectProject: (id: string) => Promise<void>;
  updateProject: (id: string, data: UpdateProjectDTO) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

// Helper function to get auth token
async function getAuthToken(): Promise<string> {
  // This will be replaced with proper Firebase auth token retrieval
  const { auth } = await import("@/lib/firebase/firebase");
  const user = auth.currentUser;

  if (!user) {
    throw new Error("No authenticated user");
  }

  return user.getIdToken();
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  // Initial state
  projects: [],
  currentProject: null,
  isLoading: false,
  error: null,

  // Fetch all projects for the current user
  fetchProjects: async () => {
    try {
      set({ isLoading: true, error: null });

      const token = await getAuthToken();
      const response = await fetch("/api/projects", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }

      const data = await response.json().catch(() => {
        throw new Error("Invalid response format from server");
      });
      set({ projects: data.projects || [], isLoading: false });
    } catch (error) {
      console.error("Error fetching projects:", error);
      set({
        error:
          error instanceof Error ? error.message : "Failed to fetch projects",
        isLoading: false,
      });
    }
  },

  // Create a new project
  createProject: async (projectData: CreateProjectDTO) => {
    try {
      set({ isLoading: true, error: null });

      const token = await getAuthToken();
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(projectData),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to create project");
      }

      const data = await response.json().catch(() => {
        throw new Error("Invalid response format from server");
      });
      const newProject = data.project;

      // Refresh projects list to get updated summary data
      await get().fetchProjects();

      set({ isLoading: false });
      return newProject;
    } catch (error) {
      console.error("Error creating project:", error);
      set({
        error:
          error instanceof Error ? error.message : "Failed to create project",
        isLoading: false,
      });
      throw error;
    }
  },

  // Select and load a specific project
  selectProject: async (projectId: string) => {
    try {
      set({ isLoading: true, error: null });

      const token = await getAuthToken();
      const response = await fetch(`/api/projects/${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Project not found");
        }
        throw new Error(`Failed to fetch project: ${response.statusText}`);
      }

      const data = await response.json().catch(() => {
        throw new Error("Invalid response format from server");
      });
      set({ currentProject: data.project, isLoading: false });
    } catch (error) {
      console.error("Error selecting project:", error);
      set({
        error:
          error instanceof Error ? error.message : "Failed to load project",
        isLoading: false,
      });
    }
  },

  // Update a project
  updateProject: async (projectId: string, updateData: UpdateProjectDTO) => {
    try {
      set({ isLoading: true, error: null });

      const token = await getAuthToken();
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to update project");
      }

      const data = await response.json().catch(() => {
        throw new Error("Invalid response format from server");
      });
      const updatedProject = data.project;

      // Update current project if it's the one being updated
      const { currentProject } = get();
      if (currentProject?.id === projectId) {
        set({ currentProject: updatedProject });
      }

      // Refresh projects list to get updated summary data
      await get().fetchProjects();

      set({ isLoading: false });
    } catch (error) {
      console.error("Error updating project:", error);
      set({
        error:
          error instanceof Error ? error.message : "Failed to update project",
        isLoading: false,
      });
      throw error;
    }
  },

  // Delete a project
  deleteProject: async (projectId: string) => {
    try {
      set({ isLoading: true, error: null });

      const token = await getAuthToken();
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to delete project");
      }

      // Remove from projects list
      const { projects, currentProject } = get();
      const updatedProjects = projects.filter((p) => p.id !== projectId);

      // Clear current project if it's the one being deleted
      const updatedCurrentProject =
        currentProject?.id === projectId ? null : currentProject;

      set({
        projects: updatedProjects,
        currentProject: updatedCurrentProject,
        isLoading: false,
      });
    } catch (error) {
      console.error("Error deleting project:", error);
      set({
        error:
          error instanceof Error ? error.message : "Failed to delete project",
        isLoading: false,
      });
      throw error;
    }
  },

  // Clear error state
  clearError: () => {
    set({ error: null });
  },

  // Reset store to initial state
  reset: () => {
    set({
      projects: [],
      currentProject: null,
      isLoading: false,
      error: null,
    });
  },
}));
