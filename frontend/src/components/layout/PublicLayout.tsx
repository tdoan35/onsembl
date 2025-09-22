'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import Link from 'next/link';

interface PublicLayoutProps {
  children: React.ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const router = useRouter();

  const handleOpenAuthModal = (mode: 'signup' | 'login') => {
    router.push(`/${mode}`);
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
              <span className="text-2xl font-semibold tracking-tight">Onsembl</span>
            </Link>

            <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-300">
              <a href="#features" className="hover:text-zinc-100 transition-colors">Platform</a>
              <a href="#features" className="hover:text-zinc-100 transition-colors">Features</a>
              <a href="#pricing" className="hover:text-zinc-100 transition-colors">Pricing</a>
              <a href="/docs" className="hover:text-zinc-100 transition-colors">Docs</a>
              <a href="/changelog" className="hover:text-zinc-100 transition-colors">Changelog</a>
            </nav>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleOpenAuthModal('login')}
                className="hidden sm:inline-flex gap-2 hover:text-zinc-100 hover:bg-white/5 ring-1 ring-white/5 text-sm text-zinc-300 rounded-md pt-1.5 pr-3 pb-1.5 pl-3 items-center"
              >
                <span className="font-medium">Log in</span>
              </button>
              <button
                onClick={() => handleOpenAuthModal('signup')}
                type="button"
                role="button"
                aria-label="Create Account"
                className="group relative inline-flex shadow-[0_8px_16px_-4px_rgba(255,255,255,0.05)] hover:shadow-[0_12px_20px_-6px_rgba(255,255,255,0.1)] transition duration-300 ease-out select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 transform-gpu hover:-translate-y-0.5 text-white rounded-lg pt-[1px] pr-[1px] pb-[1px] pl-[1px] items-center justify-center"
                style={{ backgroundImage: 'linear-gradient(144deg,rgba(255,255,255,0.3), rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.2))' }}
              >
                <span className="flex items-center justify-center gap-2 leading-none min-w-[140px] w-full h-full transition-colors duration-300 group-hover:bg-black/50 font-medium bg-black/80 rounded-lg pt-1.5 pr-3 pb-1.5 pl-3">
                  <span className="text-sm">Create Account</span>
                </span>
              </button>
              <button className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md ring-1 ring-white/10 hover:bg-white/5">
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
