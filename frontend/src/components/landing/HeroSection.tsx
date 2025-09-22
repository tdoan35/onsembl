'use client';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useUIStore } from '@/stores/ui-store';

const HeroSection = () => {
  const [isHovered, setIsHovered] = useState(false);
  const { theme } = useUIStore();
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('dark');

  // Determine current theme
  useEffect(() => {
    const getEffectiveTheme = () => {
      if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return theme as 'light' | 'dark';
    };

    const updateTheme = () => {
      setCurrentTheme(getEffectiveTheme());
    };

    updateTheme();

    // Listen for system theme changes when using system theme
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', updateTheme);
      return () => mediaQuery.removeEventListener('change', updateTheme);
    }
  }, [theme]);

  useEffect(() => {
    let sceneRef: any = null;
    let isDestroyed = false;

    // Get the project ID based on current theme
    const getProjectId = () => {
      return currentTheme === 'light' ? 'lM3tXcef123NHlF3X3rW' : '8q8d7qlWmhGiCOtljtkP';
    };

    // Clean up existing scene completely
    const cleanupScene = () => {
      if (sceneRef && sceneRef.destroy) {
        sceneRef.destroy();
        sceneRef = null;
      }

      // Also destroy any global scenes
      if (typeof window !== 'undefined' && (window as any).UnicornStudio) {
        (window as any).UnicornStudio.destroy();
      }

      // Clear the container completely
      const container = document.getElementById('unicorn-bg');
      if (container) {
        container.innerHTML = '';
      }
    };

    // Initialize Unicorn Studio with better error handling
    const initUnicornStudio = async () => {
      if (isDestroyed) return; // Don't initialize if component is being destroyed

      if (typeof window !== 'undefined' && (window as any).UnicornStudio) {
        try {
          console.log(`UnicornStudio detected, initializing with ${currentTheme} theme...`);

          // Clean up any existing scenes first
          cleanupScene();

          // Small delay to ensure cleanup is complete
          await new Promise(resolve => setTimeout(resolve, 100));

          if (isDestroyed) return; // Check again after delay

          // Try the addScene method first as it's more reliable
          sceneRef = await (window as any).UnicornStudio.addScene({
            elementId: 'unicorn-bg',
            projectId: getProjectId(),
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
            `Unicorn Studio scene initialized via addScene for ${currentTheme} theme:`,
            sceneRef,
          );
        } catch (error) {
          console.error('addScene failed:', error);

          if (isDestroyed) return;

          // If addScene fails, try cleaning up and retrying once
          cleanupScene();
          await new Promise(resolve => setTimeout(resolve, 200));

          if (isDestroyed) return;

          try {
            sceneRef = await (window as any).UnicornStudio.addScene({
              elementId: 'unicorn-bg',
              projectId: getProjectId(),
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
            console.log('Retry successful:', sceneRef);
          } catch (retryError) {
            console.error('Retry also failed:', retryError);
          }
        }
      } else {
        console.log('UnicornStudio not yet available');
      }
    };

    // Try to initialize immediately if available
    if (typeof window !== 'undefined' && (window as any).UnicornStudio) {
      initUnicornStudio();
    } else {
      // If UnicornStudio is not loaded yet, set up a listener
      const checkForUnicornStudio = setInterval(() => {
        if (isDestroyed) {
          clearInterval(checkForUnicornStudio);
          return;
        }

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

      // Store cleanup for timeout
      const originalCleanup = () => {
        clearInterval(checkForUnicornStudio);
        clearTimeout(timeout);
      };

      // Return combined cleanup
      return () => {
        isDestroyed = true;
        originalCleanup();
        cleanupScene();
      };
    }

    // Cleanup function
    return () => {
      isDestroyed = true;
      cleanupScene();
    };
  }, [currentTheme]);

  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 pt-80 pb-20 overflow-hidden">
      {/* Unicorn Studio Animated Background */}
      <div
        id="unicorn-bg"
        className="unicorn-embed absolute inset-0 w-full h-full opacity-60"
        data-us-project={currentTheme === 'light' ? 'lM3tXcef123NHlF3X3rW' : '8q8d7qlWmhGiCOtljtkP'}
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 mb-8"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary">Now in Public Beta</span>
          </motion.div>

          {/* Main headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="text-5xl md:text-7xl font-bold mb-6 text-foreground"
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
              className="bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent bg-[length:200%_auto]"
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
                className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white px-8 py-6 text-lg rounded-full group relative overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-primary/90 to-secondary/90"
                  initial={{ x: '100%' }}
                  whileHover={{ x: 0 }}
                  transition={{ duration: 0.3 }}
                />
              </Button>
            </Link>
          </motion.div>
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
        <div className="w-6 h-10 rounded-full border border-primary/30 flex justify-center">
          <div className="w-1 h-3 bg-primary rounded-full mt-2" />
        </div>
      </motion.div>
    </section>
  );
};

export default HeroSection;
