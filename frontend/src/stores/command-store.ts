import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type CommandStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type CommandPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Command {
  id: string;
  agentId: string;
  content: string;
  status: CommandStatus;
  priority: CommandPriority;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  output?: string;
  error?: string;
  exitCode?: number;
  estimatedDuration?: number;
  actualDuration?: number;
}

export interface CommandPreset {
  id: string;
  name: string;
  description: string;
  command: string;
  category: string;
  parameters?: Record<string, string>;
  agentTypes?: string[];
}

export interface CommandHistory {
  command: string;
  agentId: string;
  timestamp: string;
}

interface CommandStore {
  commands: Command[];
  presets: CommandPreset[];
  history: CommandHistory[];
  selectedCommandId: string | null;
  isExecuting: boolean;
  error: string | null;

  // Actions
  addCommand: (command: Command) => void;
  updateCommand: (commandId: string, updates: Partial<Command>) => void;
  removeCommand: (commandId: string) => void;
  clearCommands: () => void;
  selectCommand: (commandId: string | null) => void;
  setExecuting: (executing: boolean) => void;
  setError: (error: string | null) => void;

  // Preset actions
  addPreset: (preset: CommandPreset) => void;
  updatePreset: (presetId: string, updates: Partial<CommandPreset>) => void;
  removePreset: (presetId: string) => void;
  clearPresets: () => void;

  // History actions
  addToHistory: (entry: CommandHistory) => void;
  clearHistory: () => void;

  // Selectors
  getCommandById: (commandId: string) => Command | undefined;
  getCommandsByAgent: (agentId: string) => Command[];
  getCommandsByStatus: (status: CommandStatus) => Command[];
  getRunningCommands: () => Command[];
  getPresetById: (presetId: string) => CommandPreset | undefined;
  getPresetsByCategory: (category: string) => CommandPreset[];
  getRecentHistory: (limit?: number) => CommandHistory[];
}

export const useCommandStore = create<CommandStore>()(
  devtools(
    (set, get) => ({
      commands: [],
      presets: [],
      history: [],
      selectedCommandId: null,
      isExecuting: false,
      error: null,

      addCommand: (command) =>
        set((state) => ({
          commands: [command, ...state.commands],
        })),

      updateCommand: (commandId, updates) =>
        set((state) => ({
          commands: state.commands.map((cmd) =>
            cmd.id === commandId ? { ...cmd, ...updates } : cmd
          ),
        })),

      removeCommand: (commandId) =>
        set((state) => ({
          commands: state.commands.filter((cmd) => cmd.id !== commandId),
          selectedCommandId:
            state.selectedCommandId === commandId ? null : state.selectedCommandId,
        })),

      clearCommands: () =>
        set(() => ({
          commands: [],
          selectedCommandId: null,
        })),

      selectCommand: (commandId) =>
        set(() => ({
          selectedCommandId: commandId,
        })),

      setExecuting: (executing) =>
        set(() => ({
          isExecuting: executing,
        })),

      setError: (error) =>
        set(() => ({
          error,
        })),

      // Preset actions
      addPreset: (preset) =>
        set((state) => ({
          presets: [...state.presets.filter((p) => p.id !== preset.id), preset],
        })),

      updatePreset: (presetId, updates) =>
        set((state) => ({
          presets: state.presets.map((preset) =>
            preset.id === presetId ? { ...preset, ...updates } : preset
          ),
        })),

      removePreset: (presetId) =>
        set((state) => ({
          presets: state.presets.filter((preset) => preset.id !== presetId),
        })),

      clearPresets: () =>
        set(() => ({
          presets: [],
        })),

      // History actions
      addToHistory: (entry) =>
        set((state) => ({
          history: [entry, ...state.history.slice(0, 99)], // Keep only last 100 entries
        })),

      clearHistory: () =>
        set(() => ({
          history: [],
        })),

      // Selectors
      getCommandById: (commandId) => {
        const state = get();
        return state.commands.find((cmd) => cmd.id === commandId);
      },

      getCommandsByAgent: (agentId) => {
        const state = get();
        return state.commands.filter((cmd) => cmd.agentId === agentId);
      },

      getCommandsByStatus: (status) => {
        const state = get();
        return state.commands.filter((cmd) => cmd.status === status);
      },

      getRunningCommands: () => {
        const state = get();
        return state.commands.filter((cmd) => cmd.status === 'running');
      },

      getPresetById: (presetId) => {
        const state = get();
        return state.presets.find((preset) => preset.id === presetId);
      },

      getPresetsByCategory: (category) => {
        const state = get();
        return state.presets.filter((preset) => preset.category === category);
      },

      getRecentHistory: (limit = 20) => {
        const state = get();
        return state.history.slice(0, limit);
      },
    }),
    {
      name: 'command-store',
    }
  )
);