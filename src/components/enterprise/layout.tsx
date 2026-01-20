"use client";

import React from 'react';
import { Sidebar } from './sidebar';
import { TopNav } from './top-nav';
import { cn } from '@/lib/utils';

interface EnterpriseLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function EnterpriseLayout({ children, className }: EnterpriseLayoutProps) {
  return (
    <div className="min-h-screen bg-enterprise-background">
      <Sidebar />
      <TopNav />
      <main className={cn("enterprise-content", className)}>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}