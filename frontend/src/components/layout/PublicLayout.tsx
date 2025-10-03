'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AuthModal } from '@/components/auth/AuthModal';

interface PublicLayoutProps {
  children: React.ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const router = useRouter();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const handleOpenAuthModal = (mode: 'signup' | 'login') => {
    setAuthMode(mode === 'login' ? 'signin' : 'signup');
    setIsAuthModalOpen(true);
  };

  return (
    <div className="min-h-screen antialiased selection:bg-white/10 text-zinc-100 bg-zinc-950">
      {/* Navigation Bar */}
      <header className="w-full">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center ring-1 ring-white/10 bg-zinc-800 rounded-full">
                🪄
              </span>
              <span className="text-2xl tracking-tight">Onsembl</span>
            </Link>

            <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-300">
              <a href="#features" className="hover:text-zinc-100 transition-colors">Features</a>
              <a href="#pricing" className="hover:text-zinc-100 transition-colors">Pricing</a>
              <a href="/docs" className="hover:text-zinc-100 transition-colors">Docs</a>
              <a href="/changelog" className="hover:text-zinc-100 transition-colors">Changelog</a>
            </nav>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenAuthModal('login')}
                className="hidden sm:inline-flex"
              >
                Log in
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleOpenAuthModal('signup')}
                className="hidden sm:inline-flex min-w-[140px]"
              >
                Get Started
              </Button>
              <button className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md ring-1 ring-white/10 hover:bg-white/5">
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1">{children}</main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        defaultMode={authMode}
      />
    </div>
  );
}
