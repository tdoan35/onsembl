'use client';

import { motion } from 'framer-motion';
import { Link2, Monitor, Zap, BarChart3, CheckCircle } from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Connect Your Agents',
    description: 'Link your AI agents through our secure WebSocket connection',
    icon: Link2,
    color: 'from-purple-500 to-purple-600',
  },
  {
    number: '02',
    title: 'Monitor in Real-Time',
    description: 'Watch agent status, terminal output, and execution traces live',
    icon: Monitor,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    number: '03',
    title: 'Execute Commands',
    description: 'Send commands with priority queueing and intelligent routing',
    icon: Zap,
    color: 'from-green-500 to-emerald-500',
  },
  {
    number: '04',
    title: 'Track Performance',
    description: 'Analyze metrics, audit logs, and optimize your workflow',
    icon: BarChart3,
    color: 'from-orange-500 to-red-500',
  },
];

const HowItWorks = () => {
  return (
    <section className="py-20 px-4 relative" id="demo">
      <div className="container mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
            How It Works
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Get started in minutes with our simple 4-step process
          </p>
        </motion.div>

        {/* Timeline */}
        <div className="relative">
          {/* Connection line */}
          <div className="absolute left-1/2 transform -translate-x-1/2 w-0.5 h-full bg-gradient-to-b from-purple-500/50 to-cyan-500/50 hidden md:block" />

          {/* Steps */}
          <div className="space-y-16">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isEven = index % 2 === 0;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: isEven ? -50 : 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.2, duration: 0.8 }}
                  className={`flex flex-col md:flex-row items-center gap-8 ${
                    isEven ? 'md:flex-row' : 'md:flex-row-reverse'
                  }`}
                >
                  {/* Content */}
                  <div className={`flex-1 ${isEven ? 'md:text-right' : 'md:text-left'}`}>
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      className="bg-onsembl-bg-overlay backdrop-blur-sm rounded-2xl border border-purple-500/20 p-6 inline-block"
                    >
                      <div className={`flex items-center gap-4 mb-4 ${
                        isEven ? 'md:flex-row-reverse' : ''
                      }`}>
                        <span className={`text-5xl font-bold bg-gradient-to-br ${step.color} bg-clip-text text-transparent`}>
                          {step.number}
                        </span>
                        <h3 className="text-2xl font-semibold text-white">
                          {step.title}
                        </h3>
                      </div>
                      <p className="text-gray-400">{step.description}</p>
                    </motion.div>
                  </div>

                  {/* Icon Circle */}
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: 360 }}
                    transition={{ duration: 0.5 }}
                    className="relative"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${step.color} blur-xl opacity-50`} />
                    <div className={`relative w-20 h-20 rounded-full bg-gradient-to-br ${step.color} p-0.5`}>
                      <div className="w-full h-full rounded-full bg-onsembl-bg flex items-center justify-center">
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    {/* Pulse animation */}
                    <motion.div
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.5, 0, 0.5],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      className={`absolute inset-0 rounded-full bg-gradient-to-br ${step.color}`}
                    />
                  </motion.div>

                  {/* Placeholder for layout balance */}
                  <div className="flex-1 hidden md:block" />
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Interactive Demo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-20 relative"
        >
          <div className="bg-onsembl-bg-overlay backdrop-blur-xl rounded-2xl border border-purple-500/20 p-8 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-semibold text-white">Live Demo Terminal</h3>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-gray-400">Connected</span>
              </div>
            </div>

            {/* Demo Terminal */}
            <div className="bg-onsembl-bg-overlay-heavy rounded-lg p-4 font-mono text-sm space-y-2">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-green-400"
              >
                $ onsembl init --project my-app
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
                className="text-blue-400 flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Project initialized successfully
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2 }}
                className="text-green-400"
              >
                $ onsembl agent add claude gemini codex
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.5 }}
                className="text-purple-400"
              >
                ⚡ 3 agents connected and ready
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 3 }}
                className="text-green-400"
              >
                $ onsembl execute "Optimize database queries" --agent claude --priority high
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 3.5 }}
                className="text-cyan-400"
              >
                🚀 Command queued with ID: cmd_abc123
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 4 }}
                className="text-yellow-400"
              >
                📊 Execution started... [████████░░] 80%
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HowItWorks;