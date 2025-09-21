'use client';

import { motion } from 'framer-motion';
import {
  Server,
  Wifi,
  Database,
  Shield,
  Gauge,
  Globe,
  Code2,
  Layers,
  Cloud,
  Lock
} from 'lucide-react';

const technologies = [
  {
    category: 'Backend',
    icon: Server,
    color: 'from-purple-500 to-purple-600',
    items: [
      { name: 'Node.js', version: '20+' },
      { name: 'TypeScript', version: '5.x' },
      { name: 'Fastify', version: '4.x' },
    ],
  },
  {
    category: 'Real-time',
    icon: Wifi,
    color: 'from-blue-500 to-cyan-500',
    items: [
      { name: 'WebSocket', version: 'Native' },
      { name: 'Socket.io', version: '4.x' },
      { name: 'SSE', version: 'HTTP/2' },
    ],
  },
  {
    category: 'Database',
    icon: Database,
    color: 'from-green-500 to-emerald-500',
    items: [
      { name: 'Supabase', version: 'Latest' },
      { name: 'PostgreSQL', version: '15+' },
      { name: 'Redis', version: '7.x' },
    ],
  },
  {
    category: 'Frontend',
    icon: Code2,
    color: 'from-orange-500 to-red-500',
    items: [
      { name: 'Next.js', version: '14' },
      { name: 'React', version: '18' },
      { name: 'Tailwind', version: '3.x' },
    ],
  },
  {
    category: 'Queue',
    icon: Layers,
    color: 'from-pink-500 to-purple-500',
    items: [
      { name: 'BullMQ', version: 'Latest' },
      { name: 'Upstash', version: 'Redis' },
      { name: 'Priority Queue', version: 'Custom' },
    ],
  },
  {
    category: 'Infrastructure',
    icon: Cloud,
    color: 'from-indigo-500 to-blue-500',
    items: [
      { name: 'Fly.io', version: 'Edge' },
      { name: 'Vercel', version: 'Edge' },
      { name: 'Docker', version: '24.x' },
    ],
  },
];

const performanceMetrics = [
  { icon: Gauge, label: '<200ms', description: 'Latency', color: 'text-green-400' },
  { icon: Globe, label: '10+', description: 'Concurrent Agents', color: 'text-blue-400' },
  { icon: Shield, label: '100', description: 'Msg/sec', color: 'text-purple-400' },
  { icon: Lock, label: '256-bit', description: 'Encryption', color: 'text-cyan-400' },
];

const TechStack = () => {
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
            Technology Stack
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Built with cutting-edge technologies for maximum performance and reliability
          </p>
        </motion.div>

        {/* Tech Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {technologies.map((tech, index) => {
            const Icon = tech.icon;

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
                className="relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 to-cyan-600/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300" />
                <div className="relative bg-onsembl-bg-overlay backdrop-blur-sm rounded-2xl border border-purple-500/20 p-6 hover:border-purple-500/40 transition-colors">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${tech.color}`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">{tech.category}</h3>
                  </div>

                  <div className="space-y-2">
                    {tech.items.map((item, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1 + idx * 0.05 }}
                        className="flex justify-between items-center"
                      >
                        <span className="text-gray-300">{item.name}</span>
                        <span className="text-xs text-gray-500 bg-onsembl-bg-overlay-light px-2 py-1 rounded">
                          {item.version}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Performance Metrics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="bg-onsembl-bg-overlay-light backdrop-blur-sm rounded-2xl border border-purple-500/20 p-8"
        >
          <h3 className="text-2xl font-semibold text-white text-center mb-8">
            Performance Metrics
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {performanceMetrics.map((metric, index) => {
              const Icon = metric.icon;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.6 + index * 0.1, duration: 0.5 }}
                  className="text-center"
                >
                  <motion.div
                    whileHover={{ rotate: 360, scale: 1.1 }}
                    transition={{ duration: 0.5 }}
                    className="inline-block mb-3"
                  >
                    <Icon className={`w-10 h-10 ${metric.color}`} />
                  </motion.div>
                  <div className={`text-3xl font-bold mb-1 ${metric.color}`}>
                    {metric.label}
                  </div>
                  <div className="text-sm text-gray-500">{metric.description}</div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Architecture Diagram Preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="mt-12 text-center"
        >
          <div className="inline-block relative">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-cyan-600/20 blur-3xl" />
            <div className="relative bg-onsembl-bg-overlay backdrop-blur-sm rounded-2xl border border-purple-500/20 p-8">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
                  <div className="text-xs text-purple-300">Dashboard</div>
                </div>
                <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                  <div className="text-xs text-blue-300">Control Server</div>
                </div>
                <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                  <div className="text-xs text-green-300">Agents</div>
                </div>
              </div>
              <div className="flex justify-center gap-2 mb-4">
                <div className="w-20 h-0.5 bg-gradient-to-r from-transparent via-purple-500 to-transparent" />
                <div className="w-20 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
                <div className="w-20 h-0.5 bg-gradient-to-r from-transparent via-green-500 to-transparent" />
              </div>
              <div className="bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-green-500/10 rounded-lg p-3 border border-purple-500/20">
                <div className="text-xs text-gray-300">WebSocket Layer</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default TechStack;