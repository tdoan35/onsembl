/**
 * Terminal Store
 * Manages terminal output from agents
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface TerminalOutput {
  id: string;
  commandId: string;
  agentId: string;
  content: string;
  type: 'stdout' | 'stderr';
  timestamp: number;
}

interface TerminalStore {
  outputs: TerminalOutput[];
  maxOutputs: number;

  // Actions
  addOutput: (output: TerminalOutput) => void;
  clearOutputs: () => void;
  clearOutputsByCommand: (commandId: string) => void;
  clearOutputsByAgent: (agentId: string) => void;

  // Selectors
  getOutputsByCommand: (commandId: string) => TerminalOutput[];
  getOutputsByAgent: (agentId: string) => TerminalOutput[];
}

export const useTerminalStore = create<TerminalStore>()(
  devtools(
    (set, get) => ({
      outputs: [],
      maxOutputs: 1000,

      addOutput: (output) =>
        set((state) => {
          const outputs = [...state.outputs, output];
          // Keep only the last maxOutputs entries
          if (outputs.length > state.maxOutputs) {
            return { outputs: outputs.slice(-state.maxOutputs) };
          }
          return { outputs };
        }),

      clearOutputs: () =>
        set(() => ({
          outputs: [],
        })),

      clearOutputsByCommand: (commandId) =>
        set((state) => ({
          outputs: state.outputs.filter((o) => o.commandId !== commandId),
        })),

      clearOutputsByAgent: (agentId) =>
        set((state) => ({
          outputs: state.outputs.filter((o) => o.agentId !== agentId),
        })),

      // Selectors
      getOutputsByCommand: (commandId) => {
        const state = get();
        return state.outputs.filter((o) => o.commandId === commandId);
      },

      getOutputsByAgent: (agentId) => {
        const state = get();
        return state.outputs.filter((o) => o.agentId === agentId);
      },
    }),
    {
      name: 'terminal-store',
    }
  )
);