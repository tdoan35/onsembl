'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Github,
  Twitter,
  Linkedin,
  Mail,
  ArrowRight,
  Heart,
  Terminal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

const footerLinks = {
  Company: [
    { name: 'About', href: '/about' },
    { name: 'Blog', href: '/blog' },
    { name: 'Careers', href: '/careers' },
    { name: 'Contact', href: '/contact' },
  ],
  Product: [
    { name: 'Features', href: '#features' },
    { name: 'Pricing', href: '#pricing' },
    { name: 'Changelog', href: '/changelog' },
    { name: 'Roadmap', href: '/roadmap' },
  ],
  Developers: [
    { name: 'Documentation', href: '/docs' },
    { name: 'API Reference', href: '/api' },
    { name: 'Examples', href: '/examples' },
    { name: 'Status', href: 'https://status.onsembl.ai' },
  ],
  Legal: [
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Terms of Service', href: '/terms' },
    { name: 'Security', href: '/security' },
    { name: 'Compliance', href: '/compliance' },
  ],
};

const socialLinks = [
  { name: 'GitHub', icon: Github, href: 'https://github.com/onsembl' },
  { name: 'Twitter', icon: Twitter, href: 'https://twitter.com/onsembl' },
  { name: 'LinkedIn', icon: Linkedin, href: 'https://linkedin.com/company/onsembl' },
  { name: 'Email', icon: Mail, href: 'mailto:hello@onsembl.ai' },
];

const Footer = () => {
  const [email, setEmail] = useState('');

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle newsletter subscription
    console.log('Newsletter subscription:', email);
    setEmail('');
  };

  return (
    <footer className="relative pt-20 pb-10 px-4 border-t border-purple-500/10">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/5 to-onsembl-bg" />

      <div className="container mx-auto max-w-5xl relative">
        {/* Newsletter Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mb-16"
        >
          <div className="bg-gradient-to-r from-purple-600/10 to-cyan-600/10 backdrop-blur-sm rounded-2xl border border-purple-500/20 p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">
                  Stay in the loop
                </h3>
                <p className="text-gray-400">
                  Get the latest updates on features, integrations, and AI agent capabilities.
                </p>
              </div>
              <form onSubmit={handleNewsletterSubmit} className="flex gap-3">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-onsembl-bg-overlay border-purple-500/30 text-white placeholder:text-gray-500 focus:border-purple-500"
                  required
                />
                <Button
                  type="submit"
                  className="bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white px-6 rounded-lg group"
                >
                  Subscribe
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </form>
            </div>
          </div>
        </motion.div>

        {/* Main Footer Content */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          {/* Logo and Description */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="col-span-2"
          >
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="w-8 h-8 text-purple-400" />
              <span className="text-2xl font-bold text-white">Onsembl.ai</span>
            </div>
            <p className="text-gray-400 mb-6">
              Orchestrate AI agents at scale with real-time WebSocket streaming and intelligent command routing.
            </p>
            <div className="flex gap-3">
              {socialLinks.map((social, index) => {
                const Icon = social.icon;
                return (
                  <motion.a
                    key={index}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.1 }}
                    className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center hover:bg-purple-500/20 hover:border-purple-500/30 transition-colors"
                  >
                    <Icon className="w-5 h-5 text-purple-400" />
                  </motion.a>
                );
              })}
            </div>
          </motion.div>

          {/* Footer Links */}
          {Object.entries(footerLinks).map(([category, links], categoryIndex) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 * categoryIndex, duration: 0.5 }}
            >
              <h4 className="text-white font-semibold mb-4">{category}</h4>
              <ul className="space-y-2">
                {links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <Link
                      href={link.href}
                      className="text-gray-400 hover:text-purple-400 transition-colors text-sm"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-purple-500/10 pt-8 mb-4" />

        {/* Bottom Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="flex flex-col md:flex-row justify-between items-center gap-4"
        >
          <div className="text-center md:text-left">
            <p className="text-gray-500 text-sm">
              © {new Date().getFullYear()} Onsembl.ai. All rights reserved.
            </p>
          </div>

          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <span>Built with</span>
            <Heart className="w-4 h-4 text-red-500 fill-red-500" />
            <span>by developers, for developers</span>
          </div>

          <div className="flex gap-6">
            <Link
              href="/sitemap"
              className="text-gray-500 hover:text-purple-400 text-sm transition-colors"
            >
              Sitemap
            </Link>
            <Link
              href="/accessibility"
              className="text-gray-500 hover:text-purple-400 text-sm transition-colors"
            >
              Accessibility
            </Link>
            <Link
              href="/support"
              className="text-gray-500 hover:text-purple-400 text-sm transition-colors"
            >
              Support
            </Link>
          </div>
        </motion.div>

        {/* Decorative element */}
        <motion.div
          animate={{
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-gradient-to-t from-purple-600/20 to-transparent blur-3xl"
        />
      </div>
    </footer>
  );
};

export default Footer;