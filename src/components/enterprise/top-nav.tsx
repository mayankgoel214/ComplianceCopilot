"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Search,
  Bell,
  ChevronDown,
  HelpCircle,
  Globe,
  ChevronRight,
  Home,
  FolderOpen,
  Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store/auth-store';
import { useProjectStore } from '@/stores/project-store/project-store';

interface TopNavProps {
  className?: string;
}

interface Breadcrumb {
  label: string;
  href?: string;
}

export function TopNav({ className }: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    currentProject,
    projects,
    projectsLoading,
    selectProjectById,
    clearCurrentProject,
    fetchProjects
  } = useProjectStore();

  // Helper function to generate initials from user name
  const getInitials = (name: string | null | undefined): string => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  // Get user display info with fallbacks
  const userName = user?.displayName || 'User';
  const userInitials = getInitials(userName);

  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);

  // Load projects when component mounts and user is available
  useEffect(() => {
    if (user && projects.length === 0) {
      user.getIdToken().then(token => {
        fetchProjects(token);
      });
    }
  }, [user, projects.length, fetchProjects]);

  const generateBreadcrumbs = (path: string): Breadcrumb[] => {
    const segments = path.split('/').filter(Boolean);
    const breadcrumbs: Breadcrumb[] = [
      { label: 'Home', href: '/dashboard' }
    ];

    let currentPath = '';
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === segments.length - 1;

      let label = segment.charAt(0).toUpperCase() + segment.slice(1);
      if (segment === 'projects') label = 'Projects';
      if (segment === 'dashboard') label = 'Dashboard';
      if (segment === 'reports') label = 'Reports';
      if (segment === 'analytics') label = 'Analytics';
      if (segment === 'organization') label = 'Organization';
      if (segment === 'settings') label = 'Settings';

      // Check if this segment is a project ID (looks like a UUID) and we have current project
      const isProjectId = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(segment) ||
                         (segments[index - 1] === 'projects' && currentProject?.id === segment);
      if (isProjectId && currentProject && currentProject.id === segment) {
        label = currentProject.name;
      }

      breadcrumbs.push({
        label,
        href: isLast ? undefined : currentPath
      });
    });

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs(pathname);

  const notifications = [
    {
      id: 1,
      title: "Compliance Report Ready",
      message: "Q4 2024 compliance report has been generated",
      time: "2 min ago",
      unread: true,
    },
    {
      id: 2,
      title: "Risk Assessment Update",
      message: "New risk factors identified in Project Alpha",
      time: "1 hour ago",
      unread: true,
    },
    {
      id: 3,
      title: "Team Member Added",
      message: "Sarah Johnson joined the compliance team",
      time: "3 hours ago",
      unread: false,
    },
  ];

  const unreadCount = notifications.filter(n => n.unread).length;

  // Project selection handlers
  const handleProjectSelect = (projectId: string) => {
    selectProjectById(projectId);
    setIsProjectSelectorOpen(false);
    // Navigate to the project's sources section
    router.push(`/projects/${projectId}/sources`);
  };

  const handleClearProject = () => {
    clearCurrentProject();
    setIsProjectSelectorOpen(false);
    // Navigate back to projects list
    router.push('/projects');
  };

  return (
    <header className={cn("enterprise-topnav", className)}>
      <div className="flex items-center justify-between h-full px-6">
        {/* Breadcrumbs and Project Selector */}
        <div className="flex items-center space-x-4">
          {/* Breadcrumbs */}
          <nav className="flex items-center space-x-2 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={index}>
                {index > 0 && (
                  <ChevronRight className="h-4 w-4 text-enterprise-text-tertiary" />
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="text-enterprise-text-tertiary hover:text-enterprise-text-primary transition-colors enterprise-focus rounded px-1 py-0.5"
                  >
                    {index === 0 ? (
                      <Home className="h-4 w-4" />
                    ) : (
                      crumb.label
                    )}
                  </Link>
                ) : (
                  <span className="text-enterprise-text-primary font-medium">
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>

          {/* Project Selector */}
          <div className="relative">
            <button
              onClick={() => setIsProjectSelectorOpen(!isProjectSelectorOpen)}
              className="flex items-center space-x-2 px-3 py-2 bg-enterprise-surface-elevated border border-enterprise-border-primary rounded-lg text-enterprise-text-primary hover:bg-enterprise-surface-elevated/80 transition-colors enterprise-focus"
              aria-label="Select project"
            >
              <FolderOpen className="h-4 w-4 text-enterprise-text-tertiary" />
              <span className="text-sm font-medium max-w-32 md:max-w-48 truncate">
                {currentProject ? currentProject.name : 'Select Project'}
              </span>
              <ChevronDown className={cn(
                "h-4 w-4 transition-transform duration-200",
                isProjectSelectorOpen && "rotate-180"
              )} />
            </button>

            {/* Project Selector Dropdown */}
            {isProjectSelectorOpen && (
              <div className="absolute left-0 mt-2 w-80 enterprise-glass border border-enterprise-border-primary rounded-lg shadow-lg z-50">
                <div className="p-3 border-b border-enterprise-border-primary">
                  <h3 className="text-sm font-semibold text-enterprise-text-primary">
                    Select Project
                  </h3>
                  <p className="text-xs text-enterprise-text-tertiary mt-1">
                    Choose a project to work with
                  </p>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {/* No Project Option */}
                  <button
                    onClick={handleClearProject}
                    className={cn(
                      "w-full flex items-center justify-between p-3 text-left hover:bg-enterprise-surface-elevated transition-colors",
                      !currentProject && "bg-enterprise-surface-elevated"
                    )}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-enterprise-surface-elevated flex items-center justify-center">
                        <Home className="h-4 w-4 text-enterprise-text-tertiary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-enterprise-text-primary">
                          All Projects
                        </p>
                        <p className="text-xs text-enterprise-text-tertiary">
                          View project list
                        </p>
                      </div>
                    </div>
                    {!currentProject && (
                      <Check className="h-4 w-4 text-enterprise-primary" />
                    )}
                  </button>

                  {/* Loading State */}
                  {projectsLoading && (
                    <div className="p-4 text-center">
                      <div className="text-sm text-enterprise-text-tertiary">Loading projects...</div>
                    </div>
                  )}

                  {/* Projects List */}
                  {!projectsLoading && projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleProjectSelect(project.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 text-left hover:bg-enterprise-surface-elevated transition-colors",
                        currentProject?.id === project.id && "bg-enterprise-surface-elevated"
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-enterprise-primary/10 flex items-center justify-center">
                          <FolderOpen className="h-4 w-4 text-enterprise-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-enterprise-text-primary truncate">
                            {project.name}
                          </p>
                          <p className="text-xs text-enterprise-text-tertiary truncate">
                            {project.description || 'No description'}
                          </p>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="text-xs text-enterprise-text-tertiary">
                              {project.document_count} docs
                            </span>
                            <span className="text-enterprise-text-tertiary">•</span>
                            <span className="text-xs text-enterprise-text-tertiary capitalize">
                              {project.status}
                            </span>
                          </div>
                        </div>
                      </div>
                      {currentProject?.id === project.id && (
                        <Check className="h-4 w-4 text-enterprise-primary flex-shrink-0" />
                      )}
                    </button>
                  ))}

                  {/* Empty State */}
                  {!projectsLoading && projects.length === 0 && (
                    <div className="p-4 text-center">
                      <div className="text-sm text-enterprise-text-tertiary">No projects found</div>
                      <Link
                        href="/projects/new"
                        className="text-xs text-enterprise-primary hover:text-enterprise-primary-hover mt-1 inline-block"
                      >
                        Create your first project
                      </Link>
                    </div>
                  )}
                </div>

                <div className="p-3 border-t border-enterprise-border-primary">
                  <Link
                    href="/projects/new"
                    className="w-full text-sm text-enterprise-primary hover:text-enterprise-primary-hover transition-colors enterprise-focus rounded px-2 py-1 block text-center"
                    onClick={() => setIsProjectSelectorOpen(false)}
                  >
                    + Create New Project
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center - Search */}
        <div className="flex-1 max-w-lg mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-enterprise-text-tertiary" />
            <input
              type="text"
              placeholder="Search projects, reports, frameworks..."
              className="w-full pl-10 pr-4 py-2 bg-enterprise-surface-elevated border border-enterprise-border-primary rounded-lg text-enterprise-text-primary placeholder-enterprise-text-tertiary focus:outline-none focus:ring-2 focus:ring-enterprise-primary focus:border-enterprise-primary transition-all enterprise-focus"
            />
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center space-x-4">
          {/* Language Selector */}
          <div className="relative">
            <button className="flex items-center space-x-2 px-3 py-2 text-enterprise-text-tertiary hover:text-enterprise-text-primary transition-colors enterprise-focus rounded-lg">
              <Globe className="h-4 w-4" />
              <span className="text-sm">EN</span>
            </button>
          </div>

          {/* Help */}
          <button className="p-2 text-enterprise-text-tertiary hover:text-enterprise-text-primary transition-colors enterprise-focus rounded-lg">
            <HelpCircle className="h-5 w-5" />
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setIsNotificationOpen(!isNotificationOpen)}
              className="relative p-2 text-enterprise-text-tertiary hover:text-enterprise-text-primary transition-colors enterprise-focus rounded-lg"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 bg-enterprise-error text-enterprise-text-primary text-xs rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {isNotificationOpen && (
              <div className="absolute right-0 mt-2 w-80 enterprise-glass border border-enterprise-border-primary rounded-lg shadow-lg z-50">
                <div className="p-4 border-b border-enterprise-border-primary">
                  <h3 className="text-sm font-semibold text-enterprise-text-primary">
                    Notifications
                  </h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={cn(
                        "p-4 border-b border-enterprise-border-secondary hover:bg-enterprise-surface-elevated transition-colors cursor-pointer",
                        notification.unread && "bg-enterprise-surface-elevated/50"
                      )}
                    >
                      <div className="flex items-start space-x-3">
                        <div className={cn(
                          "w-2 h-2 rounded-full mt-2 flex-shrink-0",
                          notification.unread ? "bg-enterprise-primary" : "bg-enterprise-text-tertiary"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-enterprise-text-primary">
                            {notification.title}
                          </p>
                          <p className="text-sm text-enterprise-text-tertiary">
                            {notification.message}
                          </p>
                          <p className="text-xs text-enterprise-text-tertiary mt-1">
                            {notification.time}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t border-enterprise-border-primary">
                  <button className="w-full text-sm text-enterprise-primary hover:text-enterprise-primary-hover transition-colors enterprise-focus rounded px-2 py-1">
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Avatar - Simplified */}
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-enterprise-primary flex items-center justify-center">
              <span className="text-sm font-semibold text-enterprise-text-primary">
                {userInitials}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Click outside handlers */}
      {(isNotificationOpen || isProjectSelectorOpen) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setIsNotificationOpen(false);
            setIsProjectSelectorOpen(false);
          }}
        />
      )}
    </header>
  );
}