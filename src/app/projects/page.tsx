'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProjectsRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the root page since the projects dashboard is now there
    router.replace('/');
  }, [router]);

  return null;
}