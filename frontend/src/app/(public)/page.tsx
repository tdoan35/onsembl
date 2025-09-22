'use client';

import { motion } from 'framer-motion';
import HeroSection from '@/components/landing/HeroSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import AgentShowcase from '@/components/landing/AgentShowcase';
import HowItWorks from '@/components/landing/HowItWorks';
import TechStack from '@/components/landing/TechStack';
import PricingSection from '@/components/landing/PricingSection';
import Testimonials from '@/components/landing/Testimonials';
import Footer from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-background text-foreground overflow-x-hidden"
    >
      {/* Animated gradient background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/10 to-primary/10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
      </div>

      <HeroSection />
      <FeaturesSection />
      <AgentShowcase />
      <HowItWorks />
      <TechStack />
      <PricingSection />
      <Testimonials />
      <Footer />
    </motion.div>
  );
}