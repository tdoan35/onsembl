'use client';
import React, { useState, createContext, useContext } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { IconMenu2, IconX } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

interface Links {
  label: string;
  href: string;
  icon: React.ReactNode;
  onClick?: () => void;
  isActive?: boolean;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
  pinned?: boolean;
  setPinned?: React.Dispatch<React.SetStateAction<boolean>>;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined,
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
  pinned: pinnedProp,
  setPinned: setPinnedProp,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
  pinned?: boolean;
  setPinned?: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const [openState, setOpenState] = useState(false);
  const [pinnedState, setPinnedState] = useState(false);
  const [mounted, setMounted] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;
  const pinned = pinnedProp !== undefined ? pinnedProp : pinnedState;
  const setPinned =
    setPinnedProp !== undefined ? setPinnedProp : setPinnedState;

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <SidebarContext.Provider
      value={{ open, setOpen, animate: animate && mounted, pinned, setPinned }}
    >
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
  pinned,
  setPinned,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
  pinned?: boolean;
  setPinned?: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  return (
    <SidebarProvider
      open={open}
      setOpen={setOpen}
      animate={animate}
      pinned={pinned}
      setPinned={setPinned}
    >
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<'div'>)} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate, pinned } = useSidebar();
  return (
    <>
      <motion.div
        className={cn(
          'h-screen px-2 pt-14 pb-4 hidden md:flex md:flex-col flex-shrink-0 fixed left-0 top-0 z-40',
          open
            ? 'bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-r border-neutral-200/20 dark:border-neutral-700/20'
            : 'bg-transparent backdrop-blur-none border-r border-transparent',
          className,
        )}
        initial={{ width: open ? '250px' : '69px' }}
        animate={{
          width: animate ? (open ? '250px' : '69px') : open ? '250px' : '69px',
        }}
        transition={{
          duration: animate ? 0.2 : 0,
          ease: 'easeInOut',
        }}
        {...props}
      >
        {children}
      </motion.div>
    </>
  );
};

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) => {
  const { open, setOpen } = useSidebar();
  return (
    <>
      <div
        className={cn(
          'h-10 px-4 py-4 flex flex-row md:hidden  items-center justify-between bg-transparent backdrop-blur-sm w-full',
        )}
        {...props}
      >
        <div className="flex justify-end z-20 w-full">
          <IconMenu2
            className="text-neutral-800 dark:text-neutral-200"
            onClick={() => setOpen(!open)}
          />
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: 'easeInOut',
              }}
              className={cn(
                'fixed h-full w-full inset-0 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md p-10 z-40 flex flex-col justify-between',
                className,
              )}
            >
              <div
                className="absolute right-10 top-10 z-50 text-neutral-800 dark:text-neutral-200"
                onClick={() => setOpen(!open)}
              >
                <IconX />
              </div>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export const SidebarLink = ({
  link,
  className,
  ...props
}: {
  link: Links;
  className?: string;
  [key: string]: any;
}) => {
  const { open, animate } = useSidebar();

  const handleClick = (e: React.MouseEvent) => {
    if (link.onClick) {
      e.preventDefault();
      link.onClick();
    }
  };

  return (
    <Link
      href={link.href}
      onClick={handleClick}
      className={cn(
        'flex items-center gap-2 group/sidebar py-2 relative rounded-xl transition-colors',
        'mx-1 px-3',
        !link.isActive && 'hover:bg-neutral-50 dark:hover:bg-neutral-900',
        className,
      )}
      {...props}
    >
      {/* Highlight background/outline */}
      {link.isActive && (
        <>
          {/* Background for expanded state */}
          <motion.div
            className="absolute inset-y-0 rounded-xl bg-neutral-100 dark:bg-neutral-800"
            initial={false}
            animate={{
              opacity: open ? 1 : 0,
              left: 0,
              right: 0,
              width: '100%',
            }}
            transition={{
              duration: animate ? 0.2 : 0,
              ease: 'easeInOut',
            }}
          />
          {/* Outline for collapsed state */}
          <motion.div
            className="absolute inset-y-0 rounded-xl border-2 border-neutral-300 dark:border-neutral-600"
            initial={false}
            animate={{
              opacity: open ? 0 : 1,
              left: '50%',
              x: '-50%',
              width: '40px',
            }}
            transition={{
              duration: animate ? 0.2 : 0,
              ease: 'easeInOut',
            }}
          />
        </>
      )}

      <span
        className={cn(
          'flex-shrink-0 relative z-10',
          link.isActive && 'text-neutral-900 dark:text-white',
        )}
      >
        {link.icon}
      </span>

      <motion.span
        initial={{
          opacity: open ? 1 : 0,
          width: open ? 'auto' : 0,
        }}
        animate={{
          opacity: animate ? (open ? 1 : 0) : open ? 1 : 0,
          width: animate ? (open ? 'auto' : 0) : open ? 'auto' : 0,
        }}
        transition={{
          duration: animate ? 0.2 : 0,
          ease: 'easeInOut',
          opacity: {
            duration: animate ? 0.15 : 0,
            delay: animate && open ? 0.05 : 0,
          },
        }}
        className={cn(
          'text-sm whitespace-nowrap overflow-hidden relative z-10',
          link.isActive
            ? 'text-neutral-900 dark:text-white'
            : 'text-neutral-700 dark:text-neutral-200',
        )}
        style={{ originX: 0 }}
      >
        <span className="inline-block pr-2 group-hover/sidebar:translate-x-1 transition-transform duration-150">
          {link.label}
        </span>
      </motion.span>
    </Link>
  );
};
