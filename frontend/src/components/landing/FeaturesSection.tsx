'use client';

import {
  Terminal,
  Users,
  Shield,
  Zap,
  Eye,
  Smartphone,
  ArrowRight
} from 'lucide-react';

const FeaturesSection = () => {
  return (
    <section className="py-24 relative" id="features">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex gap-2 text-xs text-zinc-300 bg-white/5 border-white/10 border rounded-full pt-1 pr-3 pb-1 pl-3 items-center mb-6">
            <Zap className="h-3.5 w-3.5" />
            <span className="font-medium">Platform Features</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-light tracking-tighter text-white mb-4" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
            Everything you need to orchestrate agents
          </h2>
          <p className="text-lg text-zinc-300">Powerful tools that adapt to your workflow, from planning to deployment.</p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Large Feature Card - Analytics */}
          <article className="lg:col-span-2 group relative overflow-hidden transition-all duration-300 hover:shadow-2xl bg-zinc-900/50 border-white/10 border rounded-2xl backdrop-blur-sm">
            <div className="p-6 sm:p-8">
              {/* Illustration */}
              <div className="relative h-64 sm:h-80 rounded-xl bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 ring-1 ring-inset ring-white/5 mb-6">
                {/* Terminal Dashboard */}
                <div className="absolute inset-4 rounded-lg bg-zinc-950/90 backdrop-blur border border-white/10">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <span className="h-2 w-2 rounded-full bg-red-500/60"></span>
                      <span className="h-2 w-2 rounded-full bg-yellow-500/60"></span>
                      <span className="h-2 w-2 rounded-full bg-green-500/60"></span>
                    </div>
                    <span className="text-xs text-zinc-400">Real-time Terminal</span>
                  </div>

                  {/* Content Grid */}
                  <div className="grid grid-cols-12 gap-3 p-4 h-full">
                    {/* Terminal Output */}
                    <div className="col-span-8 bg-white/5 rounded-lg p-3 border border-white/5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-zinc-300 font-medium">Agent Output</span>
                        <span className="text-xs text-emerald-400">● Live</span>
                      </div>
                      <div className="space-y-1 text-[10px] font-mono">
                        <div className="text-green-400">$ npm test</div>
                        <div className="text-zinc-300">✓ Running tests...</div>
                        <div className="text-emerald-400">✓ All tests passed</div>
                        <div className="text-blue-400">➜ Coverage: 94%</div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="col-span-4 space-y-2">
                      <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                        <div className="text-xs text-zinc-400 mb-1">Active Agents</div>
                        <div className="text-lg font-semibold text-white">3</div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                        <div className="text-xs text-zinc-400 mb-1">Response Time</div>
                        <div className="text-lg font-semibold text-emerald-400">120ms</div>
                      </div>
                    </div>

                    {/* Progress Bars */}
                    <div className="col-span-12 space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-16">Claude</span>
                        <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full w-3/4"></div>
                        </div>
                        <span className="text-xs text-blue-400">75%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-16">Gemini</span>
                        <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                          <div className="bg-emerald-500 h-1.5 rounded-full w-4/5"></div>
                        </div>
                        <span className="text-xs text-emerald-400">80%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-16">Codex</span>
                        <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                          <div className="bg-purple-500 h-1.5 rounded-full w-1/2"></div>
                        </div>
                        <span className="text-xs text-purple-400">50%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating notifications */}
                <div className="absolute top-6 right-6 w-48 space-y-2">
                  <div className="bg-zinc-900/95 border border-emerald-500/30 rounded-lg p-2 backdrop-blur">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 bg-emerald-500 rounded-full"></div>
                      <span className="text-xs text-emerald-300">Command completed</span>
                    </div>
                  </div>
                  <div className="bg-zinc-900/95 border border-blue-500/30 rounded-lg p-2 backdrop-blur">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                      <span className="text-xs text-blue-300">Agent connected</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="sm:text-3xl text-2xl font-normal text-white tracking-tight" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
                    Real-time Monitoring
                  </h3>
                </div>
                <p className="text-zinc-300 text-base leading-relaxed">
                  Watch your AI agents work in real-time with sub-200ms terminal streaming, live status updates, and comprehensive execution monitoring.
                </p>
                <div className="mt-6">
                  <a href="#" className="inline-flex items-center gap-2 text-sm font-medium text-white hover:text-zinc-300 transition-colors">
                    See monitoring features
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          </article>

          {/* Small Feature Card - Multi-Agent */}
          <article className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl bg-zinc-900/50 border-white/10 border rounded-2xl backdrop-blur-sm">
            <div className="p-6">
              {/* Illustration */}
              <div className="relative h-48 rounded-xl bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 ring-1 ring-inset ring-white/5 mb-6">
                {/* Agent Grid */}
                <div className="absolute inset-3 rounded-lg bg-zinc-950/90 backdrop-blur border border-white/10 overflow-hidden">
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between px-2 py-1 bg-blue-500/10 rounded border border-blue-500/20">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="text-xs text-blue-300">Claude</span>
                      </div>
                      <span className="text-xs text-blue-400">Active</span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1 bg-emerald-500/10 rounded border border-emerald-500/20">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                        <span className="text-xs text-emerald-300">Gemini</span>
                      </div>
                      <span className="text-xs text-emerald-400">Active</span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1 bg-orange-500/10 rounded border border-orange-500/20">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                        <span className="text-xs text-orange-300">Codex</span>
                      </div>
                      <span className="text-xs text-zinc-400">Idle</span>
                    </div>
                    <div className="mt-3 p-2 bg-white/5 rounded border border-white/10">
                      <div className="text-xs text-zinc-400 mb-1">Queue</div>
                      <div className="text-xs text-zinc-300">2 commands pending</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div>
                <div className="flex gap-3 mb-4 items-center">
                  <h3 className="text-xl font-normal text-white tracking-tight" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
                    Multi-Agent Control
                  </h3>
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  Orchestrate multiple AI agents simultaneously with intelligent queueing, priority management, and seamless coordination.
                </p>
                <div className="mt-6">
                  <a href="#" className="inline-flex items-center gap-2 text-sm font-medium text-white hover:text-zinc-300 transition-colors">
                    View orchestration
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* Second Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Small Feature Card - Security */}
          <article className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl bg-zinc-900/50 border-white/10 border rounded-2xl backdrop-blur-sm">
            <div className="p-6">
              {/* Illustration */}
              <div className="relative h-48 rounded-xl bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 ring-1 ring-inset ring-white/5 mb-6">
                {/* Security Dashboard */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    {/* Center shield */}
                    <div className="w-16 h-16 flex ring-2 ring-emerald-500/30 bg-gradient-to-r from-emerald-900 to-emerald-700 rounded-full items-center justify-center">
                      <Shield className="w-8 h-8 text-emerald-400" />
                    </div>

                    {/* Orbiting security indicators */}
                    <div className="absolute -top-4 -left-6 w-6 h-6 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                    </div>
                    <div className="absolute -top-2 -right-8 w-6 h-6 bg-blue-500/20 border border-blue-500/40 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    </div>
                    <div className="absolute -bottom-4 -right-4 w-6 h-6 bg-purple-500/20 border border-purple-500/40 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                    </div>
                    <div className="absolute -bottom-2 -left-8 w-6 h-6 bg-orange-500/20 border border-orange-500/40 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-xl font-normal text-white tracking-tight" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
                    Enterprise Security
                  </h3>
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  SOC2 compliant with advanced security controls, audit logs, and comprehensive access management for enterprise teams.
                </p>
                <div className="mt-6">
                  <a href="#" className="inline-flex items-center gap-2 text-sm font-medium text-white hover:text-zinc-300 transition-colors">
                    Security details
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          </article>

          {/* Large Feature Card - Automation */}
          <article className="lg:col-span-2 group relative overflow-hidden transition-all duration-300 hover:shadow-2xl bg-zinc-900/50 border-white/10 border rounded-2xl backdrop-blur-sm">
            <div className="p-6 sm:p-8">
              {/* Illustration */}
              <div className="relative h-64 sm:h-80 rounded-xl bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 ring-1 ring-inset ring-white/5 mb-6">
                {/* Workflow Automation */}
                <div className="absolute inset-4">
                  {/* Workflow nodes */}
                  <div className="absolute top-4 left-8 w-16 h-12 bg-blue-500/20 border border-blue-500/40 rounded-lg flex items-center justify-center">
                    <Terminal className="h-5 w-5 text-blue-400" />
                  </div>

                  <div className="absolute top-4 right-8 w-16 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-lg flex items-center justify-center">
                    <Eye className="h-5 w-5 text-emerald-400" />
                  </div>

                  <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-16 h-12 bg-purple-500/20 border border-purple-500/40 rounded-lg flex items-center justify-center">
                    <Shield className="h-5 w-5 text-purple-400" />
                  </div>

                  {/* Animated connection lines */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 300 200">
                    <defs>
                      <marker id="arrowhead2" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="rgba(255,255,255,0.4)"></polygon>
                      </marker>
                    </defs>
                    <path d="M 80 25 Q 150 15 220 25" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none" markerEnd="url(#arrowhead2)" strokeDasharray="4,4">
                      <animate attributeName="stroke-dashoffset" values="0;-8" dur="2s" repeatCount="indefinite"></animate>
                    </path>
                    <path d="M 220 40 Q 200 100 150 150" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none" markerEnd="url(#arrowhead2)" strokeDasharray="4,4">
                      <animate attributeName="stroke-dashoffset" values="0;-8" dur="2s" repeatCount="indefinite"></animate>
                    </path>
                    <path d="M 140 150 Q 100 100 80 40" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none" markerEnd="url(#arrowhead2)" strokeDasharray="4,4">
                      <animate attributeName="stroke-dashoffset" values="0;-8" dur="2s" repeatCount="indefinite"></animate>
                    </path>
                  </svg>

                  {/* Status indicators */}
                  <div className="absolute top-20 left-4 space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></div>
                      <span className="text-emerald-400">Workflow active</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-blue-400">Commands queued</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="h-2 w-2 bg-yellow-500 rounded-full"></div>
                      <span className="text-yellow-400">Monitoring</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="sm:text-3xl text-2xl font-normal text-white tracking-tight" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
                    Intelligent Automation
                  </h3>
                </div>
                <p className="text-zinc-300 text-base leading-relaxed">
                  Streamline your workflow with smart automation. From command execution to agent coordination, reduce manual work and eliminate bottlenecks.
                </p>
                <div className="mt-6">
                  <a href="#" className="inline-flex items-center gap-2 text-sm font-medium text-white hover:text-zinc-300 transition-colors">
                    Build workflows
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* Third Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Large Feature Card - Trace Visualization */}
          <article className="lg:col-span-2 group relative overflow-hidden transition-all duration-300 hover:shadow-2xl bg-zinc-900/50 border-white/10 border rounded-2xl backdrop-blur-sm">
            <div className="p-6 sm:p-8">
              {/* Illustration */}
              <div className="relative h-64 sm:h-80 rounded-xl bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 ring-1 ring-inset ring-white/5 mb-6">
                {/* Trace Tree Visualization */}
                <div className="absolute inset-4 rounded-lg bg-zinc-950/90 backdrop-blur border border-white/10 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <span className="text-sm text-zinc-300 font-medium">Trace Visualization</span>
                    <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">Live</span>
                  </div>

                  <div className="p-4 space-y-3">
                    {/* Trace entries */}
                    <div className="flex items-center gap-3 p-2 bg-white/5 rounded border border-white/5">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-xs text-zinc-300 flex-1">Claude: Code analysis</span>
                      <span className="text-xs text-zinc-500">250ms</span>
                    </div>
                    <div className="flex items-center gap-3 p-2 bg-white/5 rounded border border-white/5 ml-4">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                      <span className="text-xs text-zinc-300 flex-1">→ Function review</span>
                      <span className="text-xs text-zinc-500">120ms</span>
                    </div>
                    <div className="flex items-center gap-3 p-2 bg-white/5 rounded border border-white/5 ml-8">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <span className="text-xs text-zinc-300 flex-1">→ Performance check</span>
                      <span className="text-xs text-zinc-500">85ms</span>
                    </div>
                    <div className="flex items-center gap-3 p-2 bg-emerald-500/10 rounded border border-emerald-500/20">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-emerald-300 flex-1">✓ Analysis complete</span>
                      <span className="text-xs text-emerald-400">Total: 455ms</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="sm:text-3xl text-2xl font-normal text-white tracking-tight" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
                    Trace Visualization
                  </h3>
                </div>
                <p className="text-zinc-300 text-base leading-relaxed">
                  Monitor every LLM interaction with detailed trace trees, performance metrics, and real-time debugging capabilities for complete visibility.
                </p>
                <div className="mt-6">
                  <a href="#" className="inline-flex items-center gap-2 text-sm font-medium text-white hover:text-zinc-300 transition-colors">
                    Explore traces
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          </article>

          {/* Small Feature Card - API Access */}
          <article className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl bg-zinc-900/50 border-white/10 border rounded-2xl backdrop-blur-sm">
            <div className="p-6">
              {/* Illustration */}
              <div className="relative h-48 rounded-xl bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 ring-1 ring-inset ring-white/5 mb-6">
                {/* API Interface */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-32 bg-zinc-950/90 rounded-xl border-2 border-white/20 overflow-hidden">
                    {/* API Header */}
                    <div className="h-4 bg-zinc-900 flex items-center justify-center">
                      <div className="w-8 h-1 bg-white/30 rounded-full"></div>
                    </div>

                    {/* API Content */}
                    <div className="p-2 space-y-1">
                      <div className="h-2 bg-blue-500/30 rounded text-xs"></div>
                      <div className="space-y-1">
                        <div className="h-1 bg-white/10 rounded w-3/4"></div>
                        <div className="h-1 bg-white/10 rounded w-1/2"></div>
                      </div>
                      <div className="flex gap-1">
                        <div className="flex-1 h-6 bg-emerald-500/20 rounded border border-emerald-500/40 flex items-center justify-center">
                          <div className="text-[8px] text-emerald-300">POST</div>
                        </div>
                        <div className="flex-1 h-6 bg-white/10 rounded"></div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-1 bg-white/10 rounded"></div>
                        <div className="h-1 bg-white/10 rounded w-2/3"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-xl font-normal text-white tracking-tight" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
                    API Access
                  </h3>
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed">
                  Integrate with your existing tools using our comprehensive REST API. Full programmatic access to all platform features.
                </p>
                <div className="mt-6">
                  <a href="#" className="inline-flex items-center gap-2 text-sm font-medium text-white hover:text-zinc-300 transition-colors">
                    API documentation
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;