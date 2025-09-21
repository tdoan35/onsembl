'use client';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

const HeroSection = () => {
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let sceneRef: any = null;

    // Initialize Unicorn Studio with better error handling
    const initUnicornStudio = async () => {
      if (typeof window !== 'undefined' && (window as any).UnicornStudio) {
        try {
          console.log('UnicornStudio detected, attempting to initialize...');

          // Try the addScene method first as it's more reliable
          sceneRef = await (window as any).UnicornStudio.addScene({
            elementId: 'unicorn-bg',
            projectId: '8q8d7qlWmhGiCOtljtkP',
            scale: 1,
            dpi: 1.5,
            lazyLoad: false,
            production: true,
            interactivity: {
              mouse: {
                disableMobile: true,
              },
            },
          });

          console.log(
            'Unicorn Studio scene initialized via addScene:',
            sceneRef,
          );
        } catch (error) {
          console.error('addScene failed, trying init method:', error);

          // Fallback to init method
          try {
            const scenes = await (window as any).UnicornStudio.init();
            console.log('Unicorn Studio scenes initialized via init:', scenes);
          } catch (initError) {
            console.error('Both methods failed:', initError);
          }
        }
      } else {
        console.log('UnicornStudio not yet available');
      }
    };

    // Check if script is loaded
    const checkScript = () => {
      const script = document.querySelector('script[src*="unicornStudio"]');
      console.log('UnicornStudio script found:', !!script);
      console.log(
        'UnicornStudio object available:',
        !!(window as any).UnicornStudio,
      );
    };

    checkScript();

    // Try to initialize immediately
    initUnicornStudio();

    // If UnicornStudio is not loaded yet, set up a listener
    const checkForUnicornStudio = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).UnicornStudio) {
        console.log('UnicornStudio now available, initializing...');
        initUnicornStudio();
        clearInterval(checkForUnicornStudio);
      }
    }, 100);

    // Stop checking after 10 seconds
    const timeout = setTimeout(() => {
      console.log('Timeout reached, stopping UnicornStudio check');
      clearInterval(checkForUnicornStudio);
    }, 10000);

    // Cleanup function
    return () => {
      clearInterval(checkForUnicornStudio);
      clearTimeout(timeout);

      if (sceneRef && sceneRef.destroy) {
        sceneRef.destroy();
      } else if (
        typeof window !== 'undefined' &&
        (window as any).UnicornStudio
      ) {
        (window as any).UnicornStudio.destroy();
      }
    };
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 pt-80 pb-20 overflow-hidden">
      {/* Unicorn Studio Animated Background */}
      <div
        id="unicorn-bg"
        className="unicorn-embed absolute inset-0 w-full h-full opacity-60"
        data-us-project="8q8d7qlWmhGiCOtljtkP"
        data-us-scale="1"
        data-us-dpi="1.5"
        data-us-lazyload="false"
        data-us-production="true"
        style={{ zIndex: 0 }}
      />

      {/* Gradient overlay for better text readability */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-onsembl-bg/50 via-transparent to-onsembl-bg/80"
        style={{ zIndex: 1 }}
      />

      <div className="container mx-auto max-w-7xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-left"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20 mb-8"
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-purple-300">Now in Public Beta</span>
          </motion.div>

          {/* Main headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="text-5xl md:text-7xl font-bold mb-6 text-white"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            Orchestrate
            <br />
            Agents,
            <br />
            <motion.span
              animate={{
                backgroundPosition: isHovered ? '200% center' : '0% center',
              }}
              transition={{ duration: 3, ease: 'linear', repeat: Infinity }}
              className="bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent bg-[length:200%_auto]"
            >
              Anywhere.
            </motion.span>
          </motion.h1>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="flex flex-col sm:flex-row gap-4 justify-start items-start"
          >
            <Link href="/login">
              <Button
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white px-8 py-6 text-lg rounded-full group relative overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-purple-700 to-cyan-700"
                  initial={{ x: '100%' }}
                  whileHover={{ x: 0 }}
                  transition={{ duration: 0.3 }}
                />
              </Button>
            </Link>
          </motion.div>
        </motion.div>

        {/* Demo Video Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 1 }}
          className="mt-20 flex justify-center"
        >
          <div className="relative">
            {/* iPad-style bezel */}
            <div className="relative bg-gradient-to-b from-gray-300 to-gray-600 rounded-[2.5rem] p-6 shadow-2xl">
              {/* Inner screen bezel */}
              <div className="bg-black rounded-[1.5rem] p-1">
                {/* Screen content */}
                <div className="relative aspect-video w-[800px] max-w-[90vw] bg-gray-900 rounded-[1rem] overflow-hidden">
                  {/* Temporary Unsplash image */}
                  <img
                    src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80"
                    alt="Onsembl Demo Dashboard"
                    className="w-full h-full object-cover"
                  />

                  {/* Play button overlay */}
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center backdrop-blur-[1px]">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 hover:bg-white/30 transition-colors"
                    >
                      <div className="w-0 h-0 border-l-[16px] border-l-white border-y-[10px] border-y-transparent ml-1"></div>
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* Home indicator */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-16 h-1 bg-gray-400 rounded-full"></div>
            </div>

            {/* Floating elements */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -top-6 -left-6 bg-gradient-to-br from-purple-500/20 to-purple-600/20 backdrop-blur-sm rounded-lg p-3 border border-purple-500/30"
            >
              <div className="text-xs text-purple-300 font-mono">
                Real-time Updates
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 0.5,
              }}
              className="absolute -bottom-6 -right-6 bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 backdrop-blur-sm rounded-lg p-3 border border-cyan-500/30"
            >
              <div className="text-xs text-cyan-300 font-mono">
                200ms Latency
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        animate={{
          y: [0, 10, 0],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2"
      >
        <div className="w-6 h-10 rounded-full border border-purple-500/30 flex justify-center">
          <div className="w-1 h-3 bg-purple-400 rounded-full mt-2" />
        </div>
      </motion.div>
    </section>
  );
};

export default HeroSection;
