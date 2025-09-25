'use client';

import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Sun, Moon, Monitor, Palette, Check } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useEffect } from 'react';
import type { Theme, ColorTheme } from '@/stores/ui-store';

const themeOptions: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const colorThemeOptions: { value: ColorTheme; label: string; description: string }[] = [
  { value: 'modern', label: 'Modern', description: 'Clean and minimalist design' },
  { value: 'midnight-terminal', label: 'Midnight Terminal', description: 'Aqua and amber terminal vibes' },
  { value: 'ocean-breeze', label: 'Ocean Breeze', description: 'Cool blues and teals' },
  { value: 'forest-night', label: 'Forest Night', description: 'Earthy greens and browns' },
  { value: 'sunset-glow', label: 'Sunset Glow', description: 'Warm oranges and pinks' },
];

export function ThemeSelector() {
  const { theme, colorTheme, setTheme, setColorTheme } = useUIStore();

  // Apply theme classes to document
  useEffect(() => {
    const root = document.documentElement;

    // Remove all existing theme classes
    root.classList.remove('light', 'dark');
    colorThemeOptions.forEach(option => {
      root.classList.remove(`theme-${option.value}`);
    });

    // Add color theme class
    root.classList.add(`theme-${colorTheme}`);

    // Add light/dark mode class
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme, colorTheme]);

  const currentThemeOption = themeOptions.find(option => option.value === theme);
  const CurrentThemeIcon = currentThemeOption?.icon || Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-background/20 [&_svg]:drop-shadow-sm h-8 w-8"
          aria-label="Theme options"
        >
          <CurrentThemeIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Dark/Light Mode Options */}
        {themeOptions.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setTheme(option.value)}
              className="flex items-center gap-2"
            >
              <Icon className="h-4 w-4" />
              <span>{option.label}</span>
              {theme === option.value && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        {/* Color Theme Submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            <span>Theme</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            {colorThemeOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setColorTheme(option.value)}
                className="flex flex-col items-start gap-1 p-3"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-medium">{option.label}</span>
                  {colorTheme === option.value && <Check className="h-4 w-4" />}
                </div>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}