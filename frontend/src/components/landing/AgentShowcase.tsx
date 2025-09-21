'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Bot, Activity, Code, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

const agents = [
  {
    name: 'Claude',
    icon: Bot,
    description: 'Anthropic\'s advanced AI assistant with deep reasoning capabilities',
    features: ['Code generation', 'Debugging', 'Documentation', 'Architecture design'],
    status: 'active',
    color: 'from-purple-500 to-purple-600',
    commands: [
      'claude analyze --file src/auth.ts',
      'claude refactor --pattern MVC',
      'claude test --coverage',
    ],
  },
  {
    name: 'Gemini',
    icon: Activity,
    description: 'Google\'s multimodal AI with cutting-edge performance',
    features: ['Data analysis', 'Code review', 'Performance optimization', 'Testing'],
    status: 'active',
    color: 'from-blue-500 to-cyan-500',
    commands: [
      'gemini optimize --target performance',
      'gemini review --branch main',
      'gemini analyze --metrics',
    ],
  },
  {
    name: 'Codex',
    icon: Code,
    description: 'OpenAI\'s specialized coding model for development tasks',
    features: ['Auto-completion', 'Code translation', 'Bug fixes', 'API integration'],
    status: 'active',
    color: 'from-green-500 to-emerald-500',
    commands: [
      'codex complete --context 2000',
      'codex translate --from python --to typescript',
      'codex integrate --api stripe',
    ],
  },
  {
    name: 'Custom Agents',
    icon: Terminal,
    description: 'Deploy your own custom AI agents with full control',
    features: ['Custom models', 'Private deployment', 'Fine-tuning', 'Domain-specific'],
    status: 'coming-soon',
    color: 'from-orange-500 to-red-500',
    commands: [
      'custom deploy --model your-model',
      'custom train --dataset custom.json',
      'custom configure --endpoint https://api.your-domain.com',
    ],
  },
];

const AgentShowcase = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextAgent = () => {
    setCurrentIndex((prev) => (prev + 1) % agents.length);
  };

  const prevAgent = () => {
    setCurrentIndex((prev) => (prev - 1 + agents.length) % agents.length);
  };

  const currentAgent = agents[currentIndex];
  const Icon = currentAgent.icon;

  return (
    <section className="py-20 px-4 relative overflow-hidden" id="agents">
      <div className="container mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
            Supported Agents
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Connect and orchestrate the most powerful AI coding agents
          </p>
        </motion.div>

        {/* Agent Carousel */}
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
              className="grid md:grid-cols-2 gap-8 items-center"
            >
              {/* Agent Visual */}
              <div className="relative">
                <motion.div
                  animate={{
                    rotate: [0, 5, -5, 0],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="relative"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${currentAgent.color} blur-3xl opacity-30`} />
                  <div className="relative bg-onsembl-bg-overlay backdrop-blur-xl rounded-2xl border border-purple-500/20 p-8">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl bg-gradient-to-br ${currentAgent.color}`}>
                          <Icon className="w-8 h-8 text-white" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-white">{currentAgent.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <div className={`w-2 h-2 rounded-full ${
                              currentAgent.status === 'active' ? 'bg-green-500' : 'bg-yellow-500'
                            } animate-pulse`} />
                            <span className="text-sm text-gray-400">
                              {currentAgent.status === 'active' ? 'Active' : 'Coming Soon'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Command Examples */}
                    <div className="space-y-2 font-mono text-sm">
                      {currentAgent.commands.map((command, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className="bg-onsembl-bg-overlay-light rounded-lg p-3 border border-purple-500/10"
                        >
                          <span className="text-green-400">$ </span>
                          <span className="text-gray-300">{command}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Agent Details */}
              <div>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-lg text-gray-400 mb-6"
                >
                  {currentAgent.description}
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-3"
                >
                  <h4 className="text-white font-semibold mb-3">Key Features:</h4>
                  {currentAgent.features.map((feature, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + idx * 0.1 }}
                      className="flex items-center gap-3"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                      <span className="text-gray-300">{feature}</span>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex justify-center items-center gap-4 mt-8">
            <Button
              variant="outline"
              size="icon"
              onClick={prevAgent}
              className="rounded-full border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>

            {/* Dots indicator */}
            <div className="flex gap-2">
              {agents.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
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
              onClick={nextAgent}
              className="rounded-full border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AgentShowcase;