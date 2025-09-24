import { useRouter, usePathname } from 'next/navigation';
import { Edit, Palette } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/hooks/useProject';
import { ThemeSelector } from './ThemeSelector';
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
      {/* Demo Menu - show for demo pages or authenticated users */}
      {(showDemoMenu || isAuthenticated) && <NavbarMenu />}

      {/* Theme Selector */}
      <ThemeSelector />

      {/* Auth Buttons/User Info */}
      {!isAuthenticated && (
        <NavbarAuth onOpenAuthModal={onOpenAuthModal} onLogout={onLogout} />
      )}
    </div>
  );
}