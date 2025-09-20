import { useRouter, usePathname } from 'next/navigation';
import { Edit, Palette, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/hooks/useProject';
import { useUIStore } from '@/stores/ui-store';
import { ThemeToggle } from './ThemeToggle';
import { NavbarAuth } from './NavbarAuth';
import { NavbarMenu } from './NavbarMenu';

interface NavbarActionsProps {
  onOpenAuthModal?: (mode: 'signup' | 'login') => void;
  onLogout?: () => void;
  showDemoMenu?: boolean;
}

export function NavbarActions({ onOpenAuthModal, onLogout, showDemoMenu = false }: NavbarActionsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const { currentProject } = useProject();
  const { webSocketState } = useUIStore();

  const isProjectPage = pathname?.startsWith('/project/');
  const isEditorPage = pathname?.includes('/editor');

  const handleViewChange = (value: string) => {
    if (!currentProject) return;

    if (value === 'design') {
      router.push(`/project/${currentProject.id}`);
    } else if (value === 'editor') {
      router.push(`/project/${currentProject.id}/editor`);
    }
  };

  return (
    <div className="absolute right-0 flex items-center gap-2 h-full">
      {/* WebSocket status indicator - only show when authenticated */}
      {isAuthenticated && (
        <div className="flex items-center space-x-1 px-2">
          {webSocketState === 'connected' ? (
            <>
              <Wifi className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground hidden sm:inline">Connected</span>
            </>
          ) : webSocketState === 'connecting' ? (
            <>
              <Wifi className="h-4 w-4 text-yellow-500 animate-pulse" />
              <span className="text-xs text-muted-foreground hidden sm:inline">Connecting</span>
            </>
          ) : webSocketState === 'error' ? (
            <>
              <WifiOff className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground hidden sm:inline">Error</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-gray-500" />
              <span className="text-xs text-muted-foreground hidden sm:inline">Offline</span>
            </>
          )}
        </div>
      )}

      {/* Demo Menu - show for demo pages or authenticated users */}
      {(showDemoMenu || isAuthenticated) && <NavbarMenu />}

      {/* Theme Toggle */}
      <ThemeToggle />

      {/* Auth Buttons/User Info */}
      {!isAuthenticated && (
        <NavbarAuth onOpenAuthModal={onOpenAuthModal} onLogout={onLogout} />
      )}
    </div>
  );
}