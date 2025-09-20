import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import {
  Menu,
  X,
  Home,
  Activity,
  Settings,
  FileText,
  Terminal,
  Users,
  BarChart,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/dashboard', label: 'Dashboard', icon: Activity },
  { path: '/agents', label: 'Agents', icon: Users },
  { path: '/commands', label: 'Commands', icon: Terminal },
  { path: '/traces', label: 'Traces', icon: BarChart },
  { path: '/audit', label: 'Audit', icon: FileText },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function NavbarMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-background/20 [&_svg]:drop-shadow-sm h-8 w-8"
          aria-label="Open navigation menu"
        >
          <Menu className={`h-4 w-4 transition-all ${isOpen ? 'rotate-90 opacity-0' : ''}`} />
          <X className={`h-4 w-4 absolute transition-all ${isOpen ? 'rotate-0 opacity-100' : 'rotate-90 opacity-0'}`} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-background/95 backdrop-blur-md border-border/50">
        {navItems.map(({ path, label, icon: Icon }, index) => (
          <React.Fragment key={path}>
            <DropdownMenuItem asChild>
              <Link
                href={path}
                className="flex items-center gap-3 cursor-pointer"
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </Link>
            </DropdownMenuItem>
            {index === 0 && <DropdownMenuSeparator />}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}