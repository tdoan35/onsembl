'use client';

import React from 'react';
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
        className="h-14 bg-background/95 backdrop-blur-sm border-b"
        onLogout={handleLogout}
        showProjectTitle={true}
      />

      {/* Main content area with padding for fixed header */}
      <div className="flex h-screen pt-14">
        {/* Enhanced Sidebar */}
        <EnhancedSidebar />

        {/* Spacer for sidebar - matches the sidebar width */}
        <div
          className={cn(
            "hidden md:block transition-all duration-200 flex-shrink-0",
            "w-[69px] data-[open=true]:w-[250px]"
          )}
          data-open="false"
          id="sidebar-spacer"
        />

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex h-full w-full flex-1 flex-col">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}