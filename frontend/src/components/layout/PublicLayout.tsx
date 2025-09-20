'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/navigation/Navbar';
import { useAuth } from '@/hooks/useAuth';

interface PublicLayoutProps {
  children: React.ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const handleOpenAuthModal = (mode: 'signup' | 'login') => {
    router.push(`/${mode}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Navigation Bar */}
      <Navbar
        className="h-14 bg-background/95 backdrop-blur-sm border-b"
        onOpenAuthModal={handleOpenAuthModal}
        showDemoMenu={false}
        showProjectTitle={false}
      />

      {/* Main content area with padding for fixed header */}
      <main className="flex-1 pt-14">
        {children}
      </main>

      {/* Optional Footer */}
      <footer className="border-t py-8 px-4 text-center text-sm text-muted-foreground">
        <div className="container mx-auto">
          <p>© 2024 Onsembl.ai - Agent Control Center</p>
        </div>
      </footer>
    </div>
  );
}