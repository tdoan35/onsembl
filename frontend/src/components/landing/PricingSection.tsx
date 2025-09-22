'use client';

import { Check, ShoppingCart } from 'lucide-react';
import Link from 'next/link';

const PricingSection = () => {
  return (
    <section className="relative bg-black pt-24 pb-24" id="pricing">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex gap-2 text-xs text-zinc-300 bg-white/5 border-white/10 border rounded-full pt-1 pr-3 pb-1 pl-3 items-center mb-6">
            <ShoppingCart className="h-3.5 w-3.5" />
            <span className="font-medium">Pricing</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-light tracking-tighter text-white mb-4" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-zinc-300">Start building for free, then add a site plan to go live. Account plans unlock additional features.</p>
        </div>

        {/* Pricing Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          {/* Starter Plan */}
          <div className="relative group rounded-2xl bg-zinc-900/50 border border-white/10 backdrop-blur-sm p-8">
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>Starter</h3>
              <p className="text-zinc-400 text-sm mt-2">Perfect for personal projects and small teams getting started.</p>
            </div>

            <div className="mb-8">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-light text-white" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>$0</span>
                <span className="text-zinc-400">/month</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">Free forever</p>
            </div>

            <ul className="space-y-3 mb-8 text-sm">
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Up to 3 AI agents</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">100 commands per month</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Basic terminal streaming</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Email support</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Community integrations</span>
              </li>
            </ul>

            <Link href="/login">
              <button className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/30 rounded-lg py-3 px-4 text-sm font-medium transition-all duration-200">
                Get Started
              </button>
            </Link>
          </div>

          {/* Pro Plan - Featured */}
          <div className="relative group rounded-2xl bg-zinc-900/50 border-2 border-white/30 backdrop-blur-sm p-8">
            {/* Popular badge */}
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-white text-black text-xs font-semibold px-3 py-1 rounded-full">Most Popular</span>
            </div>

            <div className="mb-6">
              <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>Pro</h3>
              <p className="text-zinc-400 text-sm mt-2">For growing teams that need more power and collaboration features.</p>
            </div>

            <div className="mb-8">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-light text-white" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>$19</span>
                <span className="text-zinc-400">/agent/month</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">Billed annually or $24 monthly</p>
            </div>

            <ul className="space-y-3 mb-8 text-sm">
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Everything in Starter</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Unlimited AI agents</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Unlimited commands</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Advanced analytics & insights</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Custom workflows & automation</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Priority support</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Advanced integrations</span>
              </li>
            </ul>

            <Link href="/login">
              <button
                type="button"
                role="button"
                aria-label="Start Pro Trial"
                className="group relative inline-flex w-full shadow-[0_8px_16px_-4px_rgba(255,255,255,0.05)] hover:shadow-[0_12px_20px_-6px_rgba(255,255,255,0.1)] transition duration-300 ease-out select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 transform-gpu hover:-translate-y-0.5 text-white rounded-lg pt-[1px] pr-[1px] pb-[1px] pl-[1px] items-center justify-center"
                style={{ backgroundImage: 'linear-gradient(144deg,rgba(255,255,255,0.3), rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.2))' }}
              >
                <span className="flex items-center justify-center gap-2 leading-none w-full h-full transition-colors duration-300 group-hover:bg-black/50 font-medium bg-black/80 rounded-lg pt-3 pr-4 pb-3 pl-4">
                  <span className="text-sm">Start Free Trial</span>
                </span>
              </button>
            </Link>
          </div>

          {/* Enterprise Plan */}
          <div className="relative group rounded-2xl bg-zinc-900/50 border border-white/10 backdrop-blur-sm p-8">
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>Enterprise</h3>
              <p className="text-zinc-400 text-sm mt-2">Advanced security and compliance features for large organizations.</p>
            </div>

            <div className="mb-8">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-light text-white" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>$49</span>
                <span className="text-zinc-400">/agent/month</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">Custom pricing available</p>
            </div>

            <ul className="space-y-3 mb-8 text-sm">
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Everything in Pro</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">SOC2 compliance</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">SSO & advanced security</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Dedicated success manager</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">Custom integrations</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span className="text-zinc-300">99.9% SLA guarantee</span>
              </li>
            </ul>

            <button className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/30 rounded-lg py-3 px-4 text-sm font-medium transition-all duration-200">
              Contact Sales
            </button>
          </div>
        </div>

        {/* Trust indicators */}
        <section className="relative z-10 sm:py-24 pt-8 pb-8">
          <div className="max-w-5xl sm:px-6 lg:px-8 mr-auto ml-auto pr-4 pl-4">
            <div className="text-center mb-12">
              <p className="uppercase text-xs font-medium text-zinc-500 tracking-wide">Trusted by teams at</p>
            </div>

            {/* Ticker Container */}
            <div className="relative overflow-hidden">
              {/* Gradient Overlays */}
              <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-black via-black/80 to-transparent z-10 pointer-events-none"></div>
              <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-black via-black/80 to-transparent z-10 pointer-events-none"></div>

              {/* Animated Ticker */}
              <div className="ticker-track flex gap-16 pt-2 pb-2 items-center">
                {/* First set of logos */}
                <div className="flex gap-16 shrink-0 items-center">
                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-normal tracking-tighter">TechFlow</span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-bold tracking-tighter">Nexus Labs</span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-semibold tracking-tighter">DataSync</span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-normal tracking-tighter">VisionCorp</span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-semibold tracking-tighter">CloudBase</span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-normal tracking-tighter">InnovateTech</span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-bold tracking-tighter">FlowState</span>
                  </div>
                </div>

                {/* Duplicate set for seamless loop */}
                <div className="flex items-center gap-16 shrink-0">
                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-normal tracking-tighter">TechFlow</span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-bold tracking-tighter">Nexus Labs</span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-semibold tracking-tighter">DataSync</span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-normal tracking-tighter">VisionCorp</span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-semibold tracking-tighter">CloudBase</span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-normal tracking-tighter">InnovateTech</span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-400 hover:text-white transition-colors duration-300">
                    <span className="text-lg font-bold tracking-tighter">FlowState</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <style jsx>{`
            @keyframes ticker {
              0% {
                transform: translateX(0);
              }
              100% {
                transform: translateX(-100%);
              }
            }

            .ticker-track {
              animation: ticker 40s linear infinite;
              width: calc(200% + 16px);
            }

            .ticker-track:hover {
              animation-play-state: paused;
            }
          `}</style>
        </section>
      </div>
    </section>
  );
};

export default PricingSection;