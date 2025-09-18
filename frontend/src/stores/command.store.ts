/**
 * Command Store for Onsembl.ai Dashboard
 * State management for command execution and history
 */

import { create } from 'zustand';
import { Database } from '@/types/database';

// Type aliases
type Command = Database['public']['Tables']['commands']['Row'];
type CommandStatus = Database['public']['Enums']['command_status'];
type TerminalOutput = Database['public']['Tables']['terminal_outputs']['Row'];

interface CommandState {
  commands: Map<string, Command>;
  terminalOutputs: Map<string, TerminalOutput[]>;
  activeCommandId: string | null;
  isExecuting: boolean;
  error: string | null;

  // Actions
  setCommands: (commands: Command[]) => void;
  addCommand: (command: Command) => void;
  updateCommand: (commandId: string, updates: Partial<Command>) => void;
  removeCommand: (commandId: string) => void;
  setActiveCommand: (commandId: string | null) => void;
  addTerminalOutput: (commandId: string, output: TerminalOutput) => void;
  setTerminalOutputs: (commandId: string, outputs: TerminalOutput[]) => void;
  clearTerminalOutputs: (commandId: string) => void;
  setExecuting: (isExecuting: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useCommandStore = create<CommandState>((set, get) => ({
  commands: new Map(),
  terminalOutputs: new Map(),
  activeCommandId: null,
  isExecuting: false,
  error: null,

  setCommands: (commands) => set({
    commands: new Map(commands.map(cmd => [cmd.id, cmd]))
  }),

  addCommand: (command) => set((state) => ({
    commands: new Map(state.commands).set(command.id, command)
  })),

  updateCommand: (commandId, updates) => set((state) => {
    const newCommands = new Map(state.commands);
    const existingCommand = newCommands.get(commandId);
    if (existingCommand) {
      newCommands.set(commandId, { ...existingCommand, ...updates });
    }
    return { commands: newCommands };
  }),

  removeCommand: (commandId) => set((state) => {
    const newCommands = new Map(state.commands);
    const newOutputs = new Map(state.terminalOutputs);
    newCommands.delete(commandId);
    newOutputs.delete(commandId);
    return {
      commands: newCommands,
      terminalOutputs: newOutputs,
      activeCommandId: state.activeCommandId === commandId ? null : state.activeCommandId
    };
  }),

  setActiveCommand: (commandId) => set({ activeCommandId: commandId }),

  addTerminalOutput: (commandId, output) => set((state) => {
    const newOutputs = new Map(state.terminalOutputs);
    const existingOutputs = newOutputs.get(commandId) || [];
    newOutputs.set(commandId, [...existingOutputs, output]);
    return { terminalOutputs: newOutputs };
  }),

  setTerminalOutputs: (commandId, outputs) => set((state) => {
    const newOutputs = new Map(state.terminalOutputs);
    newOutputs.set(commandId, outputs);
    return { terminalOutputs: newOutputs };
  }),

  clearTerminalOutputs: (commandId) => set((state) => {
    const newOutputs = new Map(state.terminalOutputs);
    newOutputs.delete(commandId);
    return { terminalOutputs: newOutputs };
  }),

  setExecuting: (isExecuting) => set({ isExecuting }),

  setError: (error) => set({ error }),

  reset: () => set({
    commands: new Map(),
    terminalOutputs: new Map(),
    activeCommandId: null,
    isExecuting: false,
    error: null
  })
}));

// Selectors
export const selectCommandById = (commandId: string) => (state: CommandState) =>
  state.commands.get(commandId);

export const selectAllCommands = (state: CommandState) =>
  Array.from(state.commands.values());

export const selectActiveCommand = (state: CommandState) =>
  state.activeCommandId ? state.commands.get(state.activeCommandId) : null;

export const selectCommandsByStatus = (status: CommandStatus) => (state: CommandState) =>
  Array.from(state.commands.values()).filter(cmd => cmd.status === status);

export const selectTerminalOutputs = (commandId: string) => (state: CommandState) =>
  state.terminalOutputs.get(commandId) || [];

export const selectRecentCommands = (limit: number = 10) => (state: CommandState) =>
  Array.from(state.commands.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);