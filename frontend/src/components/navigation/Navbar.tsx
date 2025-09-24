import React from 'react';
import { cn } from '@/lib/utils';
import { NavbarBrand } from './NavbarBrand';
import { NavbarCenter } from './NavbarCenter';
import { NavbarActions } from './NavbarActions';
import { useAuth } from '@/hooks/useAuth';

interface NavbarProps {
  className?: string;
  onOpenAuthModal?: (mode: 'signup' | 'login') => void;
  onLogout?: () => void;
  showDemoMenu?: boolean;
  showProjectTitle?: boolean;
  brandClassName?: string;
}

export function Navbar({
  className,
  onOpenAuthModal,
  onLogout,
  showDemoMenu = false,
  showProjectTitle = true,
  brandClassName
}: NavbarProps) {
  const { isAuthenticated } = useAuth();

  return (
    <header className={cn("fixed top-0 left-0 right-0 z-50 border-b border-border", className)}>
      <nav className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex h-12 items-center relative">
          {/* Logo/Brand - far left */}
          <div className={cn("flex items-center h-full", brandClassName)}>
            <NavbarBrand />
          </div>

          {/* Center Content - absolutely centered */}
          <div className="absolute left-1/2 transform -translate-x-1/2">
            <NavbarCenter
              isAuthenticated={isAuthenticated}
              showProjectTitle={showProjectTitle}
            />
          </div>

          {/* Right side controls - far right */}
          <div className="ml-auto flex items-center h-full">
            <NavbarActions
              onOpenAuthModal={onOpenAuthModal}
              onLogout={onLogout}
              showDemoMenu={showDemoMenu}
            />
          </div>
        </div>
      </nav>
    </header>
  );
}