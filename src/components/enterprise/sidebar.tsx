"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store/auth-store';
import { useProjectStore } from '@/stores/project-store/project-store';
import {
  LayoutDashboard,
  FolderOpen,
  BarChart3,
  TrendingUp,
  Settings,
  Shield,
  Menu,
  X,
  ChevronDown,
  Building2,
  Users,
  FileText,
  Lightbulb,
  Folder,
  ArrowLeft,
  HelpCircle,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  className?: string;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  children?: NavItem[];
}

// General navigation items (shown when no project is selected)
const generalNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Projects",
    href: "/projects",
    icon: FolderOpen,
    badge: "New",
  },
  {
    title: "Reports",
    href: "/reports",
    icon: BarChart3,
    children: [
      {
        title: "Compliance Reports",
        href: "/reports/compliance",
        icon: Shield,
      },
      {
        title: "Risk Analysis",
        href: "/reports/risk",
        icon: TrendingUp,
      },
      {
        title: "Audit Trail",
        href: "/reports/audit",
        icon: FileText,
      },
    ],
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: TrendingUp,
  },
  {
    title: "Organization",
    href: "/organization",
    icon: Building2,
    children: [
      {
        title: "Team Members",
        href: "/organization/team",
        icon: Users,
      },
      {
        title: "Settings",
        href: "/organization/settings",
        icon: Settings,
      },
    ],
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

// Project-specific navigation items (shown when a project is selected)
const getProjectNavItems = (projectId: string): NavItem[] => [
  {
    title: "Sources",
    href: `/projects/${projectId}/sources`,
    icon: Folder,
  },
  {
    title: "Q/A",
    href: `/projects/${projectId}/qa`,
    icon: HelpCircle,
  },
  {
    title: "Research",
    href: `/projects/${projectId}/research`,
    icon: MessageSquare,
  },
  {
    title: "Compliance Report",
    href: `/projects/${projectId}/compliance-report`,
    icon: Shield,
  },
  {
    title: "Roadmap",
    href: `/projects/${projectId}/improve`,
    icon: TrendingUp,
  },
];

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { currentProject, clearCurrentProject } = useProjectStore();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Determine which navigation items to show
  const navItems = currentProject
    ? getProjectNavItems(currentProject.id)
    : generalNavItems;

  // Check if we're in project mode
  const isProjectMode = currentProject !== null;

  const toggleExpanded = (title: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(title)) {
      newExpanded.delete(title);
    } else {
      newExpanded.add(title);
    }
    setExpandedItems(newExpanded);
  };

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  const NavItemComponent = ({ item, level = 0 }: { item: NavItem; level?: number }) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.title);
    const itemIsActive = isActive(item.href);

    return (
      <div className="w-full">
        <Link
          href={item.href}
          className={cn(
            "group flex items-center justify-between w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 enterprise-focus",
            level > 0 && "ml-4 pl-8",
            itemIsActive
              ? "bg-enterprise-primary text-enterprise-text-primary shadow-md"
              : "text-enterprise-text-secondary hover:text-enterprise-text-primary hover:bg-enterprise-surface-elevated"
          )}
          onClick={(e) => {
            if (hasChildren) {
              e.preventDefault();
              toggleExpanded(item.title);
            }
          }}
        >
          <div className="flex items-center space-x-3">
            <item.icon className={cn(
              "h-5 w-5 flex-shrink-0 transition-colors",
              itemIsActive
                ? "text-enterprise-text-primary"
                : "text-enterprise-text-tertiary group-hover:text-enterprise-text-primary"
            )} />
            <span className="truncate">{item.title}</span>
            {item.badge && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-enterprise-primary text-enterprise-text-primary">
                {item.badge}
              </span>
            )}
          </div>
          {hasChildren && (
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform duration-200",
              isExpanded && "rotate-180"
            )} />
          )}
        </Link>

        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1 animate-in slide-in-from-top-2 duration-200">
            {item.children!.map((child) => (
              <NavItemComponent key={child.href} item={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden enterprise-button-secondary p-2"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label="Toggle navigation menu"
      >
        {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "enterprise-sidebar",
        isMobileOpen && "mobile-open",
        className
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center px-6 py-4 border-b border-enterprise-border-primary" style={{ minHeight: '120px' }}>
            <div className="w-full flex items-center">
              {/* Always show logo - bigger and more prominent */}
              <div className="flex items-center justify-center mr-4">
                <Image
                  src="/complai.svg"
                  alt="Complai"
                  width={250}
                  height={100}
                  className="w-auto"
                  style={{ height: '100px' }}
                />
              </div>

              {isProjectMode && (
                <div className="flex-1 min-w-0">
                  {/* Project Mode Additional Info */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => clearCurrentProject()}
                      className="flex items-center space-x-1 text-enterprise-text-tertiary hover:text-enterprise-text-primary transition-colors enterprise-focus rounded-lg px-2 py-1"
                      title="Back to all projects"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      <span className="text-xs">Back</span>
                    </button>
                  </div>
                  <div className="flex items-center space-x-2 mt-1">
                    <div className="w-4 h-4 bg-enterprise-primary/10 rounded flex items-center justify-center">
                      <FolderOpen className="h-3 w-3 text-enterprise-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-sm font-bold text-enterprise-text-primary truncate">
                        {currentProject.name}
                      </h1>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {isProjectMode && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-enterprise-text-tertiary uppercase tracking-wider px-3 mb-2">
                  Project Sections
                </h3>
              </div>
            )}
            {navItems.map((item) => (
              <NavItemComponent key={item.href} item={item} />
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-enterprise-border-primary">
            <div className="enterprise-glass rounded-lg p-3">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-enterprise-primary flex items-center justify-center">
                  <span className="text-sm font-semibold text-enterprise-text-primary">
                    {user?.displayName ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase() : 'U'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-enterprise-text-primary truncate">
                    {user?.displayName || 'User'}
                  </p>
                  <p className="text-xs text-enterprise-text-tertiary truncate">
                    {user?.email || 'user@example.com'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}