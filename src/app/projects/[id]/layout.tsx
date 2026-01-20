"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store/auth-store";
import { useProjectStore } from "@/stores/project-store/project-store";

interface ProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading, isInitialized } = useAuthStore();
  const { currentProject, fetchProjectById, setCurrentSection } = useProjectStore();

  useEffect(() => {
    // Only redirect if auth is fully initialized and confirmed no user
    if (isInitialized && !loading && !user) {
      router.push("/login");
      return;
    }

    // Fetch project data when we have a user and project ID
    if (user && isInitialized && id) {
      user.getIdToken().then(token => {
        fetchProjectById(id, token);
      });
    }
  }, [user, loading, isInitialized, router, id, fetchProjectById]);

  // Update current section based on URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      if (path.includes('/sources')) {
        setCurrentSection('sources');
      } else if (path.includes('/ideate')) {
        setCurrentSection('ideate');
      } else if (path.includes('/compliance-report')) {
        setCurrentSection('compliance-report');
      } else {
        setCurrentSection(null);
      }
    }
  }, [setCurrentSection]);

  return <>{children}</>;
}