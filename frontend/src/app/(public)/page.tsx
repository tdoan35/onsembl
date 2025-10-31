'use client';

import { motion } from 'framer-motion';
import HeroSection from '@/components/landing/HeroSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
// import PricingSection from '@/components/landing/PricingSection';
import FAQSection from '@/components/landing/FAQSection';
import Footer from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen antialiased selection:bg-white/10 text-zinc-100 bg-zinc-950">
      <HeroSection />
      <FeaturesSection />
      {/* <PricingSection /> */}
      <FAQSection />
      <Footer />
    </div>
  );
}