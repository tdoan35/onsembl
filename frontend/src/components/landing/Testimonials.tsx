'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Quote, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Senior Developer',
    company: 'TechCorp',
    content: 'Onsembl has revolutionized how we manage our AI agents. The real-time streaming and command queueing features are game-changers.',
    rating: 5,
    avatar: 'SC',
  },
  {
    name: 'Michael Rodriguez',
    role: 'CTO',
    company: 'StartupXYZ',
    content: 'The ability to orchestrate multiple agents simultaneously has increased our productivity by 300%. Incredible platform!',
    rating: 5,
    avatar: 'MR',
  },
  {
    name: 'Emily Johnson',
    role: 'AI Engineer',
    company: 'AI Labs',
    content: 'WebSocket performance is outstanding. Sub-200ms latency makes it feel like the agents are running locally. Highly recommended!',
    rating: 5,
    avatar: 'EJ',
  },
  {
    name: 'David Kim',
    role: 'Lead Architect',
    company: 'CloudScale',
    content: 'The emergency stop feature saved us multiple times during critical deployments. Safety and control at its finest.',
    rating: 5,
    avatar: 'DK',
  },
  {
    name: 'Lisa Thompson',
    role: 'Product Manager',
    company: 'DevTools Inc',
    content: 'Our team loves the trace visualization feature. It gives us unprecedented insight into AI agent behavior and decision-making.',
    rating: 5,
    avatar: 'LT',
  },
];

const stats = [
  { value: '10K+', label: 'Active Users' },
  { value: '1M+', label: 'Commands Executed' },
  { value: '99.9%', label: 'Uptime' },
  { value: '4.9/5', label: 'User Rating' },
];

const Testimonials = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  useEffect(() => {
    if (isAutoPlaying) {
      const interval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % testimonials.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isAutoPlaying]);

  const nextTestimonial = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
    setIsAutoPlaying(false);
  };

  const prevTestimonial = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
    setIsAutoPlaying(false);
  };

  const currentTestimonial = testimonials[currentIndex];

  return (
    <section className="py-20 px-4 relative">
      <div className="container mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
            Trusted by Developers
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Join thousands of developers who are already using Onsembl to supercharge their workflow
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              whileHover={{ scale: 1.05 }}
              className="text-center"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + index * 0.1, duration: 0.5, type: 'spring' }}
                className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent"
              >
                {stat.value}
              </motion.div>
              <div className="text-gray-400 mt-2">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Testimonial Carousel */}
        <div className="relative max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
              className="bg-onsembl-bg-overlay backdrop-blur-sm rounded-2xl border border-purple-500/20 p-8 md:p-12"
            >
              {/* Quote icon */}
              <Quote className="w-10 h-10 text-purple-500/30 mb-6" />

              {/* Content */}
              <p className="text-lg md:text-xl text-gray-300 mb-8 leading-relaxed">
                "{currentTestimonial.content}"
              </p>

              {/* Rating */}
              <div className="flex gap-1 mb-6">
                {[...Array(currentTestimonial.rating)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-yellow-500 text-yellow-500" />
                ))}
              </div>

              {/* Author */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-white font-bold">
                  {currentTestimonial.avatar}
                </div>
                <div>
                  <div className="text-white font-semibold">{currentTestimonial.name}</div>
                  <div className="text-gray-400 text-sm">
                    {currentTestimonial.role} at {currentTestimonial.company}
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex justify-center items-center gap-4 mt-8">
            <Button
              variant="outline"
              size="icon"
              onClick={prevTestimonial}
              className="rounded-full border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>

            {/* Dots indicator */}
            <div className="flex gap-2">
              {testimonials.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentIndex(idx);
                    setIsAutoPlaying(false);
                  }}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    idx === currentIndex
                      ? 'w-8 bg-purple-400'
                      : 'bg-purple-400/30 hover:bg-purple-400/50'
                  }`}
                />
              ))}
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={nextTestimonial}
              className="rounded-full border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Company Logos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-16 text-center"
        >
          <p className="text-gray-500 mb-8">Trusted by teams at</p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
            {['TechCorp', 'StartupXYZ', 'AI Labs', 'CloudScale', 'DevTools Inc'].map((company, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 0.5, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6 + idx * 0.1 }}
                whileHover={{ opacity: 1, scale: 1.05 }}
                className="text-gray-600 font-semibold text-lg"
              >
                {company}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Testimonials;