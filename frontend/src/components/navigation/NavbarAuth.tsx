import { Button } from '../ui/button';
import { useAuth } from '@/hooks/useAuth';

interface NavbarAuthProps {
  onOpenAuthModal?: (mode: 'signup' | 'login') => void;
  onLogout?: () => void;
}

export function NavbarAuth({ onOpenAuthModal, onLogout }: NavbarAuthProps) {
  const { user, isAuthenticated, signOut } = useAuth();

  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
    } else {
      await signOut();
    }
  };

  if (isAuthenticated) {
    return (
      <div className="hidden md:flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {user?.email}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
        >
          Log out
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden md:flex"
        onClick={() => onOpenAuthModal?.('login')}
      >
        Log in
      </Button>

      <Button
        size="sm"
        className="hidden md:flex bg-blue-600 hover:bg-blue-700 text-white"
        onClick={() => onOpenAuthModal?.('signup')}
      >
        Get Started
      </Button>
    </>
  );
}