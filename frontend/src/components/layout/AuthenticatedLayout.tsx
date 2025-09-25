'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { EnhancedSidebar } from '@/components/sidebar/enhanced-sidebar';
import { Navbar } from '@/components/navigation/Navbar';
import { cn } from '@/lib/utils';

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut, isAuthenticated } = useAuth();
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    // Load expanded state from localStorage to match sidebar behavior
    if (typeof window !== 'undefined') {
      const savedExpanded = localStorage.getItem('sidebar-expanded');
      return savedExpanded === 'true';
    }
    return false;
  });

  // Listen for changes to sidebar expanded state
  useEffect(() => {
    const handleStorageChange = () => {
      if (typeof window !== 'undefined') {
        const savedExpanded = localStorage.getItem('sidebar-expanded');
        setSidebarExpanded(savedExpanded === 'true');
      }
    };

    // Listen for localStorage changes
    window.addEventListener('storage', handleStorageChange);

    // Also check periodically in case changes happen in same tab
    const interval = setInterval(handleStorageChange, 100);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  // Redirect to login if not authenticated
  React.useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return null; // or a loading spinner
  }

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
      {/* Navigation Bar */}
      <Navbar
        className="h-12 bg-background border-b border-border"
        onLogout={handleLogout}
        showProjectTitle={true}
      />

      {/* Main content area with padding for fixed header */}
      <div className="flex h-screen pt-12">
        {/* Enhanced Sidebar */}
        <EnhancedSidebar />

        {/* Spacer for sidebar - matches the sidebar width */}
        <div
          className={cn(
            'hidden md:block transition-all duration-200 flex-shrink-0',
            sidebarExpanded ? 'w-[250px]' : 'w-[69px]'
          )}
          id="sidebar-spacer"
        />

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden bg-background">
          <main className="flex h-full w-full flex-1 flex-col pt-6 px-6 bg-background">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
