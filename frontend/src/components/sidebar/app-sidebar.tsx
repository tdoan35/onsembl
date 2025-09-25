'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronDown,
  ChevronLeft,
  Home,
  Plus,
  Settings,
  User,
  Activity,
  Circle,
  LayoutDashboard,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUIStore } from '@/stores/ui-store';

interface AppSidebarProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AppSidebar({ className, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const {
    sidebarState,
    setSidebarState,
    workspacesExpanded,
    toggleWorkspacesExpanded,
    workspaces,
    currentWorkspace,
    setCurrentWorkspace,
  } = useUIStore();

  const isCollapsed = sidebarState === 'collapsed';

  // Initialize with mock data for now
  React.useEffect(() => {
    if (workspaces.length === 0) {
      useUIStore.getState().setWorkspaces([
        {
          id: '1',
          name: 'Default Workspace',
          agents: [
            { id: 'agent-1', name: 'Agent 1', status: 'online' },
            { id: 'agent-2', name: 'Agent 2', status: 'offline' },
            { id: 'agent-3', name: 'Agent 3', status: 'busy' },
          ],
        },
      ]);
    }
  }, [workspaces]);

  const handleMinimizeToggle = () => {
    setSidebarState(isCollapsed ? 'expanded' : 'collapsed');
  };

  const SidebarButton = ({
    href,
    icon: Icon,
    children,
    isActive,
    onClick,
  }: {
    href?: string;
    icon: React.ElementType;
    children: React.ReactNode;
    isActive?: boolean;
    onClick?: () => void;
  }) => {
    const button = (
      <Button
        variant={isActive ? 'secondary' : 'ghost'}
        className={cn(
          'w-full justify-start gap-3 transition-all duration-200',
          isCollapsed && 'justify-center px-2'
        )}
        onClick={onClick}
        asChild={!!href}
      >
        {href ? (
          <Link href={href}>
            <Icon className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>{children}</span>}
          </Link>
        ) : (
          <>
            <Icon className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>{children}</span>}
          </>
        )}
      </Button>
    );

    if (isCollapsed) {
      return (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right" className="z-50">
              {children}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return button;
  };

  const getAgentStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-500';
      case 'offline':
        return 'text-gray-400';
      case 'busy':
        return 'text-yellow-500';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div
      className={cn(
        'relative h-full transition-all duration-300 ease-in-out',
        isCollapsed ? 'w-20' : 'w-[280px]',
        className
      )}
      {...props}
    >
      <Sidebar className="h-full border-r">
        <SidebarHeader className="border-b px-4 py-4">
          <Link
            href="/"
            className={cn(
              'flex items-center gap-2 font-semibold transition-opacity duration-200',
              isCollapsed && 'justify-center'
            )}
          >
            <span className="text-2xl">🧤</span>
            {!isCollapsed && (
              <span className="text-lg transition-opacity duration-200">
                Onsembl
              </span>
            )}
          </Link>
        </SidebarHeader>

        <SidebarContent className="flex flex-col gap-2 px-3 py-4">
          {/* Main Actions Section */}
          <div className="space-y-2">
            <SidebarButton
              icon={Plus}
              onClick={() => {
                // Add agent functionality
                console.log('Add agent clicked');
              }}
            >
              Add Agent
            </SidebarButton>

            <SidebarButton
              href="/dashboard"
              icon={LayoutDashboard}
              isActive={pathname === '/dashboard'}
            >
              Dashboard
            </SidebarButton>

            <SidebarButton
              href="/agents"
              icon={Activity}
              isActive={pathname === '/agents'}
            >
              Active Agents
            </SidebarButton>
          </div>

          {/* Workspaces Section */}
          <div className="mt-4">
            {isCollapsed ? (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-center px-2"
                      onClick={toggleWorkspacesExpanded}
                    >
                      <Activity className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="z-50">
                    Workspaces
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Collapsible
                open={workspacesExpanded}
                onOpenChange={toggleWorkspacesExpanded}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between px-3 py-2"
                  >
                    <span className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Workspaces
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        workspacesExpanded && 'rotate-180'
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1">
                  {workspaces.map((workspace) => (
                    <div key={workspace.id} className="space-y-1">
                      <Button
                        variant="ghost"
                        className={cn(
                          'w-full justify-start px-6 py-1.5 text-sm',
                          currentWorkspace?.id === workspace.id &&
                            'bg-muted'
                        )}
                        onClick={() => setCurrentWorkspace(workspace)}
                      >
                        {workspace.name}
                      </Button>
                      {currentWorkspace?.id === workspace.id && (
                        <div className="ml-8 space-y-1">
                          {workspace.agents.map((agent) => (
                            <div
                              key={agent.id}
                              className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
                            >
                              <Circle
                                className={cn(
                                  'h-2 w-2 fill-current',
                                  getAgentStatusColor(agent.status)
                                )}
                              />
                              <span>{agent.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </SidebarContent>

        <SidebarFooter className="mt-auto border-t px-3 py-3">
          <div className="space-y-2">
            {/* Minimize Toggle */}
            <SidebarButton
              icon={ChevronLeft}
              onClick={handleMinimizeToggle}
            >
              {isCollapsed ? 'Expand' : 'Minimize'}
            </SidebarButton>

            {/* Settings */}
            <SidebarButton href="/settings" icon={Settings}>
              Settings
            </SidebarButton>

            {/* User Profile */}
            <div className={cn('px-1', isCollapsed && 'px-0')}>
              {isCollapsed ? (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-center px-2"
                      >
                        <User className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="z-50">
                      User Profile
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-2 px-2"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src="/avatar.png" alt="User" />
                        <AvatarFallback>U</AvatarFallback>
                      </Avatar>
                      <span className="truncate">User Name</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Profile</DropdownMenuItem>
                    <DropdownMenuItem>Billing</DropdownMenuItem>
                    <DropdownMenuItem>Team</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Log out</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
    </div>
  );
}