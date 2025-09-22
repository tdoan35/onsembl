'use client';

import { motion } from 'framer-motion';
import {
  Terminal,
  Users,
  Wifi,
  ListOrdered,
  Eye,
  AlertTriangle,
  Zap,
  Shield,
  BarChart3,
  Globe,
  Database,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

const features = [
  {
    title: 'Real-time Terminal Streaming',
    description: 'Watch command execution in real-time with sub-200ms latency',
    icon: Terminal,
    className: 'col-span-1 md:col-span-2 lg:col-span-2',
    gradient: 'from-primary to-secondary',
  },
  {
    title: 'Multi-Agent Orchestration',
    description: 'Control Claude, Gemini, Codex, and custom agents',
    icon: Users,
    className: 'col-span-1',
    gradient: 'from-blue-500 to-purple-500',
  },
  {
    title: 'WebSocket Communication',
    description: 'Blazing fast bidirectional communication',
    icon: Wifi,
    className: 'col-span-1',
    gradient: 'from-green-500 to-blue-500',
  },
  {
    title: 'Command Queueing',
    description: 'Priority-based execution with interruption support',
    icon: ListOrdered,
    className: 'col-span-1',
    gradient: 'from-orange-500 to-red-500',
  },
  {
    title: 'Trace Visualization',
    description: 'Monitor LLM interactions with detailed trace trees',
    icon: Eye,
    className: 'col-span-1 md:col-span-2',
    gradient: 'from-pink-500 to-purple-500',
  },
  {
    title: 'Emergency Controls',
    description: 'Instant stop with emergency kill switches',
    icon: AlertTriangle,
    className: 'col-span-1',
    gradient: 'from-red-500 to-orange-500',
  },
];

const FeatureCard = ({ feature, index }: { feature: typeof features[0], index: number }) => {
  const Icon = feature.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className={cn(
        'relative group overflow-hidden rounded-2xl bg-onsembl-bg-overlay backdrop-blur-sm border border-primary/20 p-6',
        feature.className
      )}
    >
      {/* Gradient background on hover */}
      <motion.div
        className={cn(
          'absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300',
          `bg-gradient-to-br ${feature.gradient}`
        )}
      />

      {/* Glow effect */}
      <div className="absolute -inset-px bg-gradient-to-r from-transparent via-primary/10 to-transparent opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500" />

      {/* Content */}
      <div className="relative z-10">
        <div className={cn(
          'inline-flex p-3 rounded-lg mb-4',
          `bg-gradient-to-br ${feature.gradient} bg-opacity-10`
        )}>
          <Icon className="w-6 h-6 text-white" />
        </div>

        <h3 className="text-xl font-semibold mb-2 text-white">
          {feature.title}
        </h3>

        <p className="text-gray-400">
          {feature.description}
        </p>

        {/* Animated dots */}
        <motion.div
          animate={{
            opacity: [0.3, 1, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-6 right-6 flex gap-1"
        >
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-1 h-1 rounded-full bg-purple-400"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
};

const FeaturesSection = () => {
  return (
    <section className="py-20 px-4 relative" id="features">
      <div className="container mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
            Powerful Features
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Everything you need to orchestrate AI agents at scale with confidence
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {features.map((feature, index) => (
            <FeatureCard key={index} feature={feature} index={index} />
          ))}
        </div>

        {/* Additional features row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {[
            { icon: Zap, label: '100 msg/sec', description: 'Throughput' },
            { icon: Shield, label: 'Enterprise', description: 'Security' },
            { icon: Clock, label: '99.9%', description: 'Uptime' },
            { icon: Globe, label: 'Global', description: 'Infrastructure' },
          ].map((item, index) => (
            <motion.div
              key={index}
              whileHover={{ scale: 1.05 }}
              className="bg-onsembl-bg-overlay-light backdrop-blur-sm rounded-xl border border-primary/10 p-4 text-center"
            >
              <item.icon className="w-8 h-8 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold text-white">{item.label}</div>
              <div className="text-sm text-gray-500">{item.description}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default FeaturesSection;