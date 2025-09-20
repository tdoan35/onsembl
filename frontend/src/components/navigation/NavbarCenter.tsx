import { useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { Edit, Check } from 'lucide-react';
import { useProject } from '@/hooks/useProject';

interface NavbarCenterProps {
  isAuthenticated?: boolean;
  showProjectTitle?: boolean;
}

export function NavbarCenter({ isAuthenticated, showProjectTitle }: NavbarCenterProps) {
  const pathname = usePathname();
  const { currentProject, updateProject } = useProject();
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [projectNameInput, setProjectNameInput] = useState("");
  const [isSavingProjectName, setIsSavingProjectName] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isProjectPage = pathname?.startsWith('/project/');

  const handleProjectNameSave = async () => {
    if (!currentProject || !projectNameInput.trim() || projectNameInput === currentProject.name) {
      setIsEditingProjectName(false);
      return;
    }

    setIsSavingProjectName(true);
    try {
      updateProject(currentProject.id, {
        name: projectNameInput.trim()
      });
    } catch (error) {
      console.error('Error updating project name:', error);
    } finally {
      setIsSavingProjectName(false);
      setIsEditingProjectName(false);
    }
  };

  const handleProjectNameEdit = () => {
    if (currentProject) {
      setProjectNameInput(currentProject.name);
      setIsEditingProjectName(true);
      // Focus input and set cursor at end after popover opens
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const length = inputRef.current.value.length;
          inputRef.current.setSelectionRange(length, length);
        }
      }, 100);
    }
  };

  // Show project title when authenticated and on a project page
  if (isAuthenticated && isProjectPage && currentProject && showProjectTitle) {
    return (
      <div className="hidden md:flex items-center gap-8 mx-auto">
        <Popover open={isEditingProjectName} onOpenChange={setIsEditingProjectName}>
          <PopoverTrigger asChild>
            <button
              onClick={handleProjectNameEdit}
              className="group text-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md px-2 py-0.5 transition-colors flex items-center gap-1.5"
            >
              <h1 className="text-base font-semibold text-foreground">{currentProject.name}</h1>
              <Edit className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 px-3 pt-1">
            <div className="space-y-1">
              <Label htmlFor="project-name" className="text-xs text-muted-foreground">Project title</Label>
              <div className="flex gap-1.5 items-center">
                <Input
                  id="project-name"
                  ref={inputRef}
                  value={projectNameInput}
                  onChange={(e) => setProjectNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleProjectNameSave();
                    } else if (e.key === 'Escape') {
                      setIsEditingProjectName(false);
                    }
                  }}
                  placeholder="Enter project name"
                  className="flex-1 bg-background h-8 text-sm"
                  disabled={isSavingProjectName}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleProjectNameSave}
                  disabled={isSavingProjectName || !projectNameInput.trim() || projectNameInput === currentProject.name}
                  className="h-8 w-8"
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // Show navigation links for non-project pages
  if (!isProjectPage) {
    return (
      <div className="hidden md:flex items-center gap-8 mx-auto h-full">
        <span className="text-sm font-medium text-foreground/40 cursor-not-allowed transition-all duration-200 hover:text-foreground/60">
          Features
        </span>
        <span className="text-sm font-medium text-foreground/40 cursor-not-allowed transition-all duration-200 hover:text-foreground/60">
          Learn
        </span>
        <span className="text-sm font-medium text-foreground/40 cursor-not-allowed transition-all duration-200 hover:text-foreground/60">
          Pricing
        </span>
        <span className="text-sm font-medium text-foreground/40 cursor-not-allowed transition-all duration-200 hover:text-foreground/60">
          Enterprise
        </span>
      </div>
    );
  }

  return null;
}