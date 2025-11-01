'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  IconLayoutDashboard,
  IconUsers,
  IconTerminal,
  IconChartBar,
  IconSettings,
  IconChevronsLeft,
  IconChevronsRight,
  IconSearch,
  IconUser,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { useAgentStore } from '@/stores/agent-store';
import { Sidebar, SidebarBody, SidebarLink } from './sidebar-ui';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// Core navigation items as specified in ONS-35
const coreNavigation = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: <IconLayoutDashboard className="h-5 w-5" />,
  },
  {
    label: 'Active Agents',
    href: '/agents',
    icon: <IconUsers className="h-5 w-5" />,
  },
  {
    label: 'Commands',
    href: '/commands',
    icon: <IconTerminal className="h-5 w-5" />,
    disabled: true,
  },
  {
    label: 'Traces',
    href: '/traces',
    icon: <IconChartBar className="h-5 w-5" />,
    disabled: true,
  },
];

// Agent status indicator component
const AgentStatusIndicator = ({ status }: { status: string }) => {
  const statusColors = {
    online: 'bg-green-500',
    offline: 'bg-gray-400',
    error: 'bg-red-500',
    connecting: 'bg-yellow-500',
  };

  return (
    <div
      className={cn(
        'w-2 h-2 rounded-full',
        statusColors[status as keyof typeof statusColors] || 'bg-gray-400',
      )}
    />
  );
};

export function EnhancedSidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { agents } = useAgentStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [agentsExpanded, setAgentsExpanded] = useState(true);
  const [expanded, setExpanded] = useState(() => {
    // Load expanded state from localStorage
    if (typeof window !== 'undefined') {
      const savedExpanded = localStorage.getItem('sidebar-expanded');
      return savedExpanded === 'true';
    }
    return false;
  });

  // Save expanded state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-expanded', expanded.toString());
    }
  }, [expanded]);

  // Set initial open state based on expanded
  useEffect(() => {
    setSidebarOpen(expanded);
  }, [expanded]);

  // Load agents expanded state from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedExpanded = localStorage.getItem('sidebar-agents-expanded');
      setAgentsExpanded(savedExpanded !== 'false');
    }
  }, []);

  // Save agents expanded state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'sidebar-agents-expanded',
        agentsExpanded.toString(),
      );
    }
  }, [agentsExpanded]);

  // Filter navigation and agents based on search
  const filteredNavigation = useMemo(() => {
    if (!searchQuery.trim()) {
      return coreNavigation.map(link => ({
        ...link,
        isActive:
          pathname === link.href || pathname?.startsWith(link.href + '/'),
      }));
    }

    return coreNavigation
      .filter(link =>
        link.label.toLowerCase().includes(searchQuery.toLowerCase()),
      )
      .map(link => ({
        ...link,
        isActive:
          pathname === link.href || pathname?.startsWith(link.href + '/'),
      }));
  }, [pathname, searchQuery]);

  const filteredAgents = useMemo(() => {
    // Only show active or connecting agents (exclude offline)
    const activeAgents = agents.filter(agent => agent.status !== 'offline');

    if (!searchQuery.trim()) return activeAgents;

    return activeAgents.filter(
      agent =>
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.type.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [agents, searchQuery]);

  const handleSignOut = async () => {
    await signOut();
  };

  const toggleSidebar = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    setSidebarOpen(newExpanded);
  };

  return (
    <Sidebar
      open={sidebarOpen}
      setOpen={setSidebarOpen}
      pinned={false}
      setPinned={() => {}}
      animate
    >
      <SidebarBody className="gap-2 overflow-hidden min-h-0">
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden min-h-0">
            {/* Top Section - Search Input */}
            <div className="px-2 pt-2 mb-4">
              {/* Search Input */}
              <div className="relative">
                <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  disabled
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={cn(
                    'pl-10 h-10 transition-all duration-200 text-sm bg-muted/50 border-border text-foreground placeholder:text-muted-foreground focus:ring-ring focus:border-ring',
                    sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
                  )}
                />
              </div>
            </div>

            {/* Core Navigation Section */}
            <nav className="flex flex-col gap-1 mb-6">
              {filteredNavigation.map((link, idx) => (
                <SidebarLink key={idx} link={link} />
              ))}
            </nav>

            {/* Agents Section */}
            <div className="mb-4">
              {/* Agents Section Header */}
              <div className="flex items-center justify-between px-3 py-2 mb-2">
                {sidebarOpen && (
                  <>
                    <span className="text-sm font-medium text-muted-foreground">
                      Agents
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setAgentsExpanded(!agentsExpanded)}
                      className="h-6 w-6 p-0"
                    >
                      {agentsExpanded ? (
                        <IconChevronUp className="h-4 w-4" />
                      ) : (
                        <IconChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </>
                )}
              </div>

              {/* Agents List */}
              {agentsExpanded && (
                <div className="space-y-1">
                  {filteredAgents.length === 0
                    ? sidebarOpen && (
                        <div className="px-4 py-2 text-sm text-muted-foreground whitespace-nowrap">
                          {searchQuery
                            ? 'No agents match your search'
                            : 'No active agents'}
                        </div>
                      )
                    : filteredAgents.map(agent => (
                        <SidebarLink
                          key={agent.id}
                          link={{
                            label: agent.name,
                            href: `/agents/${agent.id}`,
                            icon: (
                              <div className="flex items-center gap-2">
                                <AgentStatusIndicator status={agent.status} />
                              </div>
                            ),
                            isActive:
                              pathname === `/agents/${agent.id}` ||
                              pathname?.startsWith(`/agents/${agent.id}/`),
                          }}
                        />
                      ))}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Section - Sidebar Toggle, Settings and User Profile */}
          <div className="space-y-2 flex-shrink-0 pb-2">
            {/* Sidebar Toggle Button */}
            <div className="flex justify-start px-3 mb-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="h-8 w-8 flex-shrink-0 relative"
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  {expanded ? (
                    <IconChevronsLeft className="h-4 w-4" />
                  ) : (
                    <IconChevronsRight className="h-4 w-4" />
                  )}
                </div>
              </Button>
            </div>

            {/* Settings Link */}
            <SidebarLink
              link={{
                label: 'Settings',
                href: '/settings',
                icon: <IconSettings className="h-5 w-5" />,
                isActive:
                  pathname === '/settings' || pathname?.startsWith('/settings/'),
              }}
            />

            {/* User Profile Section */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-2 px-3 py-2 mx-1 rounded-xl hover:bg-accent cursor-pointer transition-colors">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={user?.metadata?.['avatar_url']} />
                    <AvatarFallback>
                      {user?.email?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  {sidebarOpen && (
                    <div className="flex flex-col flex-1 overflow-hidden">
                      <span className="text-sm font-medium truncate">
                        {user?.metadata?.['full_name'] || user?.email || 'User'}
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
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </SidebarBody>
    </Sidebar>
  );
}
