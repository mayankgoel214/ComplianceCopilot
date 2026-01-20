"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store/auth-store";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading, isInitialized } = useAuthStore();

  useEffect(() => {
    // Only redirect if auth is fully initialized and confirmed no user
    if (isInitialized && !loading && !user) {
      router.push("/login");
      return;
    }

    // Redirect to sources page when accessing the project directly
    if (user && isInitialized) {
      router.replace(`/projects/${id}/sources`);
    }
  }, [user, loading, isInitialized, router, id]);

  // Show loading state while redirecting
  return (
    <div className="min-h-screen bg-enterprise-background flex items-center justify-center">
      <div className="text-center">
        <div className="enterprise-shimmer h-8 w-32 rounded mb-2 mx-auto" />
        <div className="enterprise-shimmer h-4 w-48 rounded mx-auto" />
      </div>
    </div>
  );
}