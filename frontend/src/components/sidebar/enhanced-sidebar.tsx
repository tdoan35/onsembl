'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  IconHome,
  IconLayoutDashboard,
  IconUsers,
  IconTerminal,
  IconChartBar,
  IconFileText,
  IconSettings,
  IconCommand,
  IconFilter,
  IconPin,
  IconPinned,
} from '@tabler/icons-react';
import { useUIStore } from '@/stores/ui-store';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar,
  SidebarBody,
  SidebarLink,
} from './sidebar-ui';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const mainLinks = [
  { label: 'Home', href: '/', icon: <IconHome className="h-5 w-5" /> },
  { label: 'Dashboard', href: '/dashboard', icon: <IconLayoutDashboard className="h-5 w-5" /> },
  { label: 'Agents', href: '/agents', icon: <IconUsers className="h-5 w-5" /> },
  { label: 'Commands', href: '/commands', icon: <IconTerminal className="h-5 w-5" /> },
  { label: 'Traces', href: '/traces', icon: <IconChartBar className="h-5 w-5" /> },
  { label: 'Audit', href: '/audit', icon: <IconFileText className="h-5 w-5" /> },
  { label: 'Presets', href: '/presets', icon: <IconCommand className="h-5 w-5" /> },
  { label: 'Reports', href: '/reports', icon: <IconFilter className="h-5 w-5" /> },
  { label: 'Settings', href: '/settings', icon: <IconSettings className="h-5 w-5" /> },
];

export function EnhancedSidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pinned, setPinned] = useState(() => {
    // Load pinned state from localStorage
    if (typeof window !== 'undefined') {
      const savedPinned = localStorage.getItem('sidebar-pinned');
      return savedPinned === 'true';
    }
    return false;
  });

  // Save pinned state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-pinned', pinned.toString());
    }
  }, [pinned]);

  // Set initial open state based on pinned
  useEffect(() => {
    setSidebarOpen(pinned);
  }, [pinned]);

  const links = mainLinks.map((link) => ({
    ...link,
    isActive: pathname === link.href || pathname?.startsWith(link.href + '/'),
  }));

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} pinned={pinned} setPinned={setPinned} animate>
      <SidebarBody className="justify-between gap-2">
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
          {/* Pin button */}
          <div className="flex justify-end mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPinned(!pinned)}
              className={cn(
                "h-8 w-8 transition-opacity",
                sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
            >
              {pinned ? (
                <IconPinned className="h-4 w-4" />
              ) : (
                <IconPin className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Navigation links */}
          <nav className="flex flex-col gap-1">
            {links.map((link, idx) => (
              <SidebarLink key={idx} link={link} />
            ))}
          </nav>
        </div>

        {/* User profile section */}
        <div className="mt-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer transition-colors">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.metadata?.avatar} />
                  <AvatarFallback>
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                {sidebarOpen && (
                  <div className="flex flex-col flex-1 overflow-hidden">
                    <span className="text-sm font-medium truncate">
                      {user?.email || 'User'}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {user?.role || 'Member'}
                    </span>
                  </div>
                )}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Billing</DropdownMenuItem>
              <DropdownMenuItem>Team</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarBody>
    </Sidebar>
  );
}