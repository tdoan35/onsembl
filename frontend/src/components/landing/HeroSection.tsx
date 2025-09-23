'use client';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import UnicornScene from "unicornstudio-react";
import { Button } from '@/components/ui/button';
import { AuthModal } from '@/components/auth/AuthModal';

const HeroSection = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');

  const handleOpenAuthModal = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setIsAuthModalOpen(true);
  };

  return (
    <section className="relative isolate overflow-hidden h-[850px]">
      {/* Unicorn Studio Animated Background */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-0 bg-white pointer-events-none"
        style={{ width: '100vw', height: '850px' }}
      >
        <UnicornScene
          projectId="rHOkHYoZDQdzU6b4q6iE"
          width="100vw"
          height="100vh"
        />
      </div>

      <div className="relative z-10 max-w-5xl sm:px-6 lg:px-8 sm:pt-20 mr-auto ml-auto pt-14 pr-4 pl-4">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="inline-flex gap-2 text-xs text-zinc-300 bg-white/5 border-white/10 border rounded-full pt-1 pr-3 pb-1 pl-3 items-center">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="font-medium">Now in Private Beta</span>
          </div>

          {/* Main headline */}
          <h1 className="sm:text-6xl md:text-7xl text-4xl font-light tracking-tighter mt-6" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
            Conduct your agents, Anywhere
          </h1>

          {/* Description */}
          <p className="max-w-2xl sm:text-lg text-base text-zinc-300 mt-5">
            Run, monitor, and steer every coding agent from one fast workspace.
          </p>

          {/* CTA Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <Button
              variant="default"
              size="default"
              className="min-w-[140px] text-[15px]"
              onClick={() => handleOpenAuthModal('signup')}
            >
              Get Started
            </Button>

            <a href="#features">
              <Button
                variant="outline"
                size="default"
                className="text-sm"
              >
                Tour the platform
              </Button>
            </a>
          </div>
        </div>

        {/* Product preview */}
        <div className="relative sm:mt-20 mt-16 perspective-none">
          <div className="absolute inset-x-0 -bottom-8 mx-auto h-40 max-w-6xl bg-gradient-to-t from-black/60 to-transparent blur-2xl"></div>

          <div className="max-w-4xl mr-auto ml-auto">

            {/* Mobile Product Preview - Positioned at top right */}
            <div className="absolute -top-48 -right-8 z-20 hidden xl:block">
              {/* iPhone-like bezel/frame */}
              <div className="relative">
                {/* Outer bezel - modern iPhone style matching desktop colors */}
                <div className="relative w-64 h-[32rem] rounded-[2rem] bg-gradient-to-b from-zinc-800/30 to-zinc-900/40 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.4)] backdrop-blur-sm border border-white/10">
                  {/* Inner screen area */}
                  <div className="w-full h-full rounded-[1.75rem] bg-gradient-to-b from-zinc-900/40 to-zinc-950/50 backdrop-blur-md border border-white/10 overflow-hidden relative ring-1 ring-black/10">
                    {/* Mobile content */}
                    <div className="h-full flex flex-col pt-2">
                      {/* Status bar */}
                      <div className="flex items-center justify-between px-6 text-sm text-zinc-400">
                        <span className="font-medium">9:41</span>
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
                          </svg>
                          <div className="w-6 h-3 border-2 border-zinc-500 rounded-sm">
                            <div className="w-4 h-1.5 bg-green-400 rounded-sm m-0.5"></div>
                          </div>
                        </div>
                      </div>

                      {/* App header */}
                      <div className="px-4 py-4 border-b border-white/10">
                        <h2 className="text-sm font-semibold text-white">Claude - Code Review</h2>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                            <div className="h-1.5 w-1.5 bg-emerald-400 rounded-full"></div>
                            Active
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-300">
                            TypeScript
                          </span>
                        </div>
                      </div>

                      {/* Mobile terminal content */}
                      <div className="flex-1 flex flex-col px-4 py-4">
                        <div className="flex items-center gap-1 mb-4 text-xs text-zinc-400">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <polyline points="4 17 10 11 4 5"></polyline>
                            <line x1="12" x2="20" y1="19" y2="19"></line>
                          </svg>
                          <span>Terminal</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                            <path d="m9 18 6-6-6-6"></path>
                          </svg>
                          <span>Claude</span>
                        </div>

                        <div className="mb-3 flex-1 flex flex-col">
                          {/* Command execution */}
                          <div className="flex-1 rounded-xl bg-black/20 p-4 ring-1 ring-white/10 flex flex-col">
                            <div className="mb-3 flex flex-wrap gap-2">
                              <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-zinc-300">npm</span>
                              <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-zinc-300">run</span>
                              <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-zinc-300">dev</span>
                            </div>
                            <pre className="text-xs leading-5 text-zinc-300 overflow-hidden">
                              <code>
                                <span className="text-green-400">✓</span> Server started
                                <br />
                                <span className="text-blue-400">→</span> Local: http://localhost:3000
                                <br />
                                <span className="text-cyan-400">◐</span> Ready in 2.1s
                                <br />
                                <span className="text-purple-400">⚡</span> Hot reload enabled
                              </code>
                            </pre>
                          </div>
                        </div>

                        {/* Chat input - Fixed at bottom */}
                        <div className="px-4 pb-4">
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Send command"
                              className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-zinc-300 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-transparent pr-12"
                            />
                            <button className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 rounded-lg bg-indigo-500/20 border border-indigo-400/30 hover:bg-indigo-500/30 transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-indigo-300">
                                <path d="m22 2-7 20-4-9-9-4Z"/>
                                <path d="M22 2 11 13"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Desktop preview with glass-like bezel */}
            <div className="relative w-full max-w-4xl mx-auto">
              {/* Outer bezel - glass-like framing */}
              <div className="relative bg-gradient-to-b from-zinc-800/30 to-zinc-900/40 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.4)] backdrop-blur-sm border border-white/10 rounded-3xl">
                {/* Inner screen area */}
                <div className="relative ring-1 ring-black/10 shadow-[0_2.8px_2.2px_rgba(0,_0,_0,_0.034),_0_6.7px_5.3px_rgba(0,_0,_0,_0.048),_0_12.5px_10px_rgba(0,_0,_0,_0.06),_0_22.3px_17.9px_rgba(0,_0,_0,_0.072),_0_41.8px_33.4px_rgba(0,_0,_0,_0.086),_0_100px_80px_rgba(0,_0,_0,_0.12)] w-full bg-gradient-to-b from-zinc-900/70 to-zinc-950/80 border-white/10 border rounded-2xl backdrop-blur-lg">
              {/* Window header */}
              <div className="flex border-white/10 border-b pt-3 pr-4 pb-3 pl-4 items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-600"></span>
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-700"></span>
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-800"></span>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
                  </svg>
                  <span>onsembl.app</span>
                </div>
              </div>

              <div className="grid grid-cols-12">
                {/* Sidebar */}
                <aside className="col-span-4 md:col-span-3 sm:p-4 border-white/10 border-r pt-3 pr-3 pb-3 pl-3">
                  <div className="mb-3 flex items-center gap-2 rounded-md bg-white/5 px-2 py-1.5 text-zinc-300 ring-1 ring-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-zinc-400">
                      <path d="m21 21-4.34-4.34"></path>
                      <circle cx="11" cy="11" r="8"></circle>
                    </svg>
                    <input placeholder="Search agents..." className="w-full bg-transparent text-xs outline-none placeholder:text-zinc-500" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-white/5 text-sm text-zinc-100">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-indigo-400">
                          <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                          <path d="M9 9h6v6H9z"></path>
                        </svg>
                        <span className="font-medium">Dashboard</span>
                      </div>
                      <span className="rounded-md bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-300">3</span>
                    </div>
                    <button className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md text-sm text-zinc-300 hover:bg-white/5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                      </svg>
                      Active Agents
                    </button>
                    <button className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md text-sm text-zinc-300 hover:bg-white/5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                        <circle cx="12" cy="16" r="1"></circle>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                      Commands
                    </button>
                    <button className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md text-sm text-zinc-300 hover:bg-white/5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <rect width="10" height="14" x="3" y="8" rx="2"></rect>
                        <path d="M5 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4Z"></path>
                      </svg>
                      Traces
                    </button>
                  </div>

                  <div className="mt-4">
                    <p className="px-2 text-[11px] uppercase tracking-wide text-zinc-500">Agents</p>
                    <div className="mt-1 space-y-1">
                      <button className="flex w-full gap-2 hover:bg-white/5 text-sm text-zinc-300 rounded-md pt-1.5 pr-2 pb-1.5 pl-2 items-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        Claude
                      </button>
                      <button className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md text-sm text-zinc-300 hover:bg-white/5">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        Gemini
                      </button>
                      <button className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md text-sm text-zinc-300 hover:bg-white/5">
                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                        Codex
                      </button>
                    </div>
                  </div>
                </aside>

                {/* Main content area */}
                <main className="col-span-8 md:col-span-9">
                  <div className="grid grid-cols-12">
                    {/* Agent list */}
                    <section className="col-span-6 sm:p-4 border-white/10 border-r pt-3 pr-3 pb-3 pl-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-zinc-200 tracking-tight">Active Agents</h3>
                        <div className="flex items-center gap-2 text-zinc-400">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                            <path d="M3 3v5h5"></path>
                            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
                            <path d="M16 16h5v5"></path>
                          </svg>
                        </div>
                      </div>

                      <ul className="mt-3 space-y-2">
                        <li className="rounded-lg bg-white/5 p-2 ring-1 ring-white/10 hover:bg-white/10">
                          <div className="flex items-start gap-3">
                            <div className="h-7 w-7 object-cover rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">C</div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">Claude - Code Review</p>
                                <span className="text-[10px] text-zinc-400">2m</span>
                              </div>
                              <p className="mt-0.5 line-clamp-1 text-xs text-zinc-400">Analyzing React components for performance optimizations...</p>
                              <div className="mt-1 flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                                  <div className="h-1.5 w-1.5 bg-emerald-400 rounded-full"></div>
                                  Active
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-300">
                                  TypeScript
                                </span>
                              </div>
                            </div>
                          </div>
                        </li>

                        <li className="rounded-lg p-2 hover:bg-white/5">
                          <div className="flex items-start gap-3">
                            <div className="h-7 w-7 object-cover rounded-full bg-gradient-to-r from-green-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">G</div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-zinc-200">Gemini - Documentation</p>
                                <span className="text-[10px] text-zinc-400">5m</span>
                              </div>
                              <p className="mt-0.5 line-clamp-1 text-xs text-zinc-400">Generating API documentation from TypeScript interfaces...</p>
                            </div>
                          </div>
                        </li>

                        <li className="rounded-lg p-2 hover:bg-white/5">
                          <div className="flex items-start gap-3">
                            <div className="h-7 w-7 object-cover rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center text-white text-xs font-bold">X</div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-zinc-200">Codex - Testing</p>
                                <span className="text-[10px] text-zinc-400">8m</span>
                              </div>
                              <p className="mt-0.5 line-clamp-1 text-xs text-zinc-400">Writing unit tests for authentication service...</p>
                            </div>
                          </div>
                        </li>
                      </ul>
                    </section>

                    {/* Terminal panel */}
                    <section className="col-span-6 sm:p-4 pt-3 pr-3 pb-3 pl-3">
                      <div className="flex gap-2 text-xs text-zinc-400 items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <polyline points="4 17 10 11 4 5"></polyline>
                          <line x1="12" x2="20" y1="19" y2="19"></line>
                        </svg>
                        <span>Terminal</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                          <path d="m9 18 6-6-6-6"></path>
                        </svg>
                        <span>Claude</span>
                      </div>

                      <h4 className="text-lg font-semibold tracking-tight mt-2">Real-time execution</h4>

                      <div className="mt-3 space-y-2">
                        <div className="rounded-md bg-black/30 p-3 ring-1 ring-white/10">
                          <div className="mb-2 flex flex-wrap gap-2">
                            <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">npm test</span>
                            <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">--coverage</span>
                          </div>
                          <pre className="overflow-x-auto text-[11px] leading-5 text-zinc-300">
                            <code>
                              <span className="text-green-400">✓</span> Authentication tests passed
                              <br />
                              <span className="text-green-400">✓</span> API endpoint tests passed
                              <br />
                              <span className="text-yellow-400">⚡</span> Coverage: 94%
                            </code>
                          </pre>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-zinc-400">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                            <span>Status</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                                <path d="M20 6 9 17l-5-5"></path>
                              </svg>
                              Complete
                            </span>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </main>
              </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        defaultMode={authMode}
      />
    </section>
  );
};

export default HeroSection;
