'use client';

import { useState, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import {
  Plus,
  Edit,
  Trash2,
  BookOpen,
  Search,
  Filter,
  Code,
  Download,
  Upload,
  Copy,
  Play
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';

import { useCommandStore, CommandPreset } from '@/stores/command-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

interface PresetManagerProps {
  className?: string;
  onPresetSelect?: (preset: CommandPreset) => void;
  selectedPresetId?: string;
}

interface PresetFormData {
  name: string;
  description: string;
  command: string;
  category: string;
  agentTypes: string[];
  parameters: Record<string, string>;
}

const defaultCategories = [
  'Development',
  'Git',
  'Docker',
  'Node.js',
  'Python',
  'System',
  'Testing',
  'Deployment',
  'Database',
  'Other'
];

const agentTypes = ['claude', 'gemini', 'codex'];

export default function PresetManager({
  className,
  onPresetSelect,
  selectedPresetId
}: PresetManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editingPreset, setEditingPreset] = useState<CommandPreset | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importData, setImportData] = useState('');

  const {
    presets,
    addPreset,
    updatePreset,
    removePreset,
    clearPresets
  } = useCommandStore();

  const { agents } = useAgentStore();
  const { addNotification } = useUIStore();

  const form = useForm<PresetFormData>({
    defaultValues: {
      name: '',
      description: '',
      command: '',
      category: 'Development',
      agentTypes: [],
      parameters: {}
    }
  });

  // Get unique categories from presets
  const categories = useMemo(() => {
    const uniqueCategories = Array.from(new Set([
      ...defaultCategories,
      ...presets.map(p => p.category)
    ])).sort();
    return uniqueCategories;
  }, [presets]);

  // Filter presets based on search and category
  const filteredPresets = useMemo(() => {
    return presets.filter(preset => {
      const matchesSearch = !searchTerm || (
        preset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        preset.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        preset.command.toLowerCase().includes(searchTerm.toLowerCase())
      );

      const matchesCategory = categoryFilter === 'all' || preset.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [presets, searchTerm, categoryFilter]);

  // Group presets by category
  const groupedPresets = useMemo(() => {
    const groups: Record<string, CommandPreset[]> = {};
    filteredPresets.forEach(preset => {
      if (!groups[preset.category]) {
        groups[preset.category] = [];
      }
      groups[preset.category].push(preset);
    });
    return groups;
  }, [filteredPresets]);

  const openCreateDialog = useCallback(() => {
    form.reset({
      name: '',
      description: '',
      command: '',
      category: 'Development',
      agentTypes: [],
      parameters: {}
    });
    setEditingPreset(null);
    setShowCreateDialog(true);
  }, [form]);

  const openEditDialog = useCallback((preset: CommandPreset) => {
    form.reset({
      name: preset.name,
      description: preset.description,
      command: preset.command,
      category: preset.category,
      agentTypes: preset.agentTypes || [],
      parameters: preset.parameters || {}
    });
    setEditingPreset(preset);
    setShowCreateDialog(true);
  }, [form]);

  const handleSubmit = useCallback(async (data: PresetFormData) => {
    try {
      const presetData: CommandPreset = {
        id: editingPreset?.id || `preset-${Date.now()}`,
        name: data.name.trim(),
        description: data.description.trim(),
        command: data.command.trim(),
        category: data.category,
        agentTypes: data.agentTypes.length > 0 ? data.agentTypes : undefined,
        parameters: Object.keys(data.parameters).length > 0 ? data.parameters : undefined
      };

      if (editingPreset) {
        updatePreset(editingPreset.id, presetData);
        addNotification({
          title: 'Preset Updated',
          description: `Preset "${presetData.name}" has been updated`,
          type: 'success',
        });
      } else {
        addPreset(presetData);
        addNotification({
          title: 'Preset Created',
          description: `Preset "${presetData.name}" has been created`,
          type: 'success',
        });
      }

      setShowCreateDialog(false);
      setEditingPreset(null);
    } catch (error) {
      addNotification({
        title: 'Save Failed',
        description: 'Failed to save preset',
        type: 'error',
      });
    }
  }, [editingPreset, addPreset, updatePreset, addNotification]);

  const handleDelete = useCallback(async (presetId: string) => {
    try {
      const preset = presets.find(p => p.id === presetId);
      removePreset(presetId);
      addNotification({
        title: 'Preset Deleted',
        description: `Preset "${preset?.name}" has been deleted`,
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Delete Failed',
        description: 'Failed to delete preset',
        type: 'error',
      });
    }
  }, [presets, removePreset, addNotification]);

  const handleCopy = useCallback(async (preset: CommandPreset) => {
    try {
      await navigator.clipboard.writeText(preset.command);
      addNotification({
        title: 'Command Copied',
        description: 'Command copied to clipboard',
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Copy Failed',
        description: 'Failed to copy command',
        type: 'error',
      });
    }
  }, [addNotification]);

  const handleExport = useCallback(() => {
    try {
      const data = JSON.stringify(presets, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `command-presets-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addNotification({
        title: 'Export Complete',
        description: 'Presets exported successfully',
        type: 'success',
      });
    } catch (error) {
      addNotification({
        title: 'Export Failed',
        description: 'Failed to export presets',
        type: 'error',
      });
    }
  }, [presets, addNotification]);

  const handleImport = useCallback(() => {
    try {
      const data = JSON.parse(importData);
      if (!Array.isArray(data)) {
        throw new Error('Invalid format: Expected array of presets');
      }

      let imported = 0;
      data.forEach((preset: any) => {
        if (preset.name && preset.command && preset.category) {
          addPreset({
            id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: preset.name,
            description: preset.description || '',
            command: preset.command,
            category: preset.category,
            agentTypes: preset.agentTypes,
            parameters: preset.parameters
          });
          imported++;
        }
      });

      addNotification({
        title: 'Import Complete',
        description: `Successfully imported ${imported} presets`,
        type: 'success',
      });

      setShowImportDialog(false);
      setImportData('');
    } catch (error) {
      addNotification({
        title: 'Import Failed',
        description: 'Failed to import presets. Check the format and try again.',
        type: 'error',
      });
    }
  }, [importData, addPreset, addNotification]);

  const renderPresetCard = useCallback((preset: CommandPreset) => {
    const isSelected = preset.id === selectedPresetId;

    return (
      <Card
        key={preset.id}
        className={cn(
          "cursor-pointer transition-colors hover:bg-muted/50",
          isSelected && "ring-2 ring-primary"
        )}
        onClick={() => onPresetSelect?.(preset)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base truncate">{preset.name}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {preset.description}
              </p>
            </div>
            <div className="flex items-center space-x-1 ml-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(preset);
                }}
                className="h-8 w-8"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditDialog(preset);
                }}
                className="h-8 w-8"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Preset</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{preset.name}"? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDelete(preset.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <pre className="text-sm bg-muted p-2 rounded overflow-x-auto">
              <code>{preset.command}</code>
            </pre>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{preset.category}</Badge>
            {preset.agentTypes?.map(type => (
              <Badge key={type} variant="secondary" className="text-xs">
                {type}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }, [selectedPresetId, onPresetSelect, handleCopy, openEditDialog, handleDelete]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BookOpen className="h-5 w-5" />
              <CardTitle>Command Presets</CardTitle>
              <Badge variant="outline">{presets.length} presets</Badge>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={presets.length === 0}
              >
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>

              <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-1" />
                    Import
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Import Presets</DialogTitle>
                    <DialogDescription>
                      Paste the exported JSON data to import presets.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <textarea
                      className="w-full h-48 p-3 border rounded-md text-sm font-mono"
                      placeholder="Paste JSON data here..."
                      value={importData}
                      onChange={(e) => setImportData(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowImportDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleImport}
                      disabled={!importData.trim()}
                    >
                      Import
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-1" />
                New Preset
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search presets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {/* Presets Grid */}
      <div className="space-y-6">
        {filteredPresets.length > 0 ? (
          Object.entries(groupedPresets).map(([category, categoryPresets]) => (
            <div key={category}>
              <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <span>{category}</span>
                <Badge variant="secondary">{categoryPresets.length}</Badge>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryPresets.map(renderPresetCard)}
              </div>
            </div>
          ))
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Presets Found</h3>
              <p className="text-muted-foreground text-center mb-4">
                {searchTerm || categoryFilter !== 'all'
                  ? "No presets match your current filters"
                  : "Get started by creating your first command preset"
                }
              </p>
              {(!searchTerm && categoryFilter === 'all') && (
                <Button onClick={openCreateDialog}>
                  <Plus className="h-4 w-4 mr-1" />
                  Create First Preset
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingPreset ? 'Edit Preset' : 'Create New Preset'}
            </DialogTitle>
            <DialogDescription>
              {editingPreset
                ? 'Update the preset details below'
                : 'Create a new command preset that can be reused across agents'
              }
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  rules={{ required: 'Name is required' }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Git Status Check" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  rules={{ required: 'Category is required' }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {defaultCategories.map(category => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                rules={{ required: 'Description is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Brief description of what this command does"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="command"
                rules={{ required: 'Command is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Command</FormLabel>
                    <FormControl>
                      <textarea
                        className="w-full min-h-24 p-3 border rounded-md text-sm font-mono resize-y"
                        placeholder="Enter the command to execute"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Use {'{parameterName}'} for parameters that can be customized
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="agentTypes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compatible Agent Types (Optional)</FormLabel>
                    <FormDescription>
                      Leave empty if compatible with all agent types
                    </FormDescription>
                    <div className="flex flex-wrap gap-2">
                      {agentTypes.map(type => {
                        const isSelected = field.value.includes(type);
                        return (
                          <Badge
                            key={type}
                            variant={isSelected ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => {
                              const newValue = isSelected
                                ? field.value.filter(t => t !== type)
                                : [...field.value, type];
                              field.onChange(newValue);
                            }}
                          >
                            {type}
                          </Badge>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {editingPreset ? 'Update Preset' : 'Create Preset'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}