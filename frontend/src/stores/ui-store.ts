import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
export type ColorTheme = 'modern' | 'midnight-terminal' | 'ocean-breeze' | 'forest-night' | 'sunset-glow';
export type SidebarState = 'expanded' | 'collapsed' | 'hidden';
export type WebSocketState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface Agent {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'busy';
  lastSeen?: Date;
}

export interface Workspace {
  id: string;
  name: string;
  agents: Agent[];
}

export interface NotificationConfig {
  id: string;
  title: string;
  message?: string;
  description?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp?: number;
  duration?: number;
  persistent?: boolean;
}

export interface ModalState {
  isOpen: boolean;
  title?: string;
  content?: React.ReactNode;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}

interface UIStore {
  // Theme
  theme: Theme;
  colorTheme: ColorTheme;
  systemTheme: 'light' | 'dark';

  // Layout
  sidebarState: SidebarState;
  isFullscreen: boolean;

  // WebSocket
  webSocketState: WebSocketState;

  // Workspace
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  workspacesExpanded: boolean;

  // Notifications
  notifications: NotificationConfig[];

  // Modals
  modal: ModalState;

  // Loading states
  globalLoading: boolean;
  loadingStates: Record<string, boolean>;

  // Error states
  globalError: string | null;
  errors: Record<string, string>;

  // Terminal
  terminalVisible: boolean;
  terminalMinimized: boolean;

  // Actions
  setTheme: (theme: Theme) => void;
  setColorTheme: (colorTheme: ColorTheme) => void;
  setSystemTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
  setSidebarState: (state: SidebarState) => void;
  toggleFullscreen: () => void;
  setFullscreen: (fullscreen: boolean) => void;

  // Notifications
  addNotification: (notification: Omit<NotificationConfig, 'id'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Modal
  openModal: (config: Omit<ModalState, 'isOpen'>) => void;
  closeModal: () => void;
  confirmModal: () => void;

  // Loading
  setGlobalLoading: (loading: boolean) => void;
  setLoading: (key: string, loading: boolean) => void;
  clearLoading: (key: string) => void;
  isLoading: (key: string) => boolean;

  // Errors
  setGlobalError: (error: string | null) => void;
  setError: (key: string, error: string) => void;
  clearError: (key: string) => void;
  clearAllErrors: () => void;
  hasError: (key: string) => boolean;

  // Terminal
  setTerminalVisible: (visible: boolean) => void;
  setTerminalMinimized: (minimized: boolean) => void;
  toggleTerminal: () => void;

  // WebSocket
  setWebSocketState: (state: WebSocketState) => void;

  // Workspace
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  toggleWorkspacesExpanded: () => void;
  addAgent: (workspaceId: string, agent: Agent) => void;
  updateAgentStatus: (agentId: string, status: Agent['status']) => void;
}

export const useUIStore = create<UIStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      theme: 'system',
      colorTheme: 'midnight-terminal',
      systemTheme: 'light',
      sidebarState: 'expanded',
      isFullscreen: false,
      webSocketState: 'disconnected' as WebSocketState,
      currentWorkspace: null,
      workspaces: [],
      workspacesExpanded: false,
      notifications: [],
      modal: {
        isOpen: false,
      },
      globalLoading: false,
      loadingStates: {},
      globalError: null,
      errors: {},
      terminalVisible: false,
      terminalMinimized: false,

      // Theme actions
      setTheme: (theme) =>
        set(() => ({
          theme,
        })),

      setColorTheme: (colorTheme) =>
        set(() => ({
          colorTheme,
        })),

      setSystemTheme: (systemTheme) =>
        set(() => ({
          systemTheme,
        })),

      // Layout actions
      toggleSidebar: () =>
        set((state) => ({
          sidebarState: state.sidebarState === 'expanded' ? 'collapsed' : 'expanded',
        })),

      setSidebarState: (sidebarState) =>
        set(() => ({
          sidebarState,
        })),

      toggleFullscreen: () =>
        set((state) => ({
          isFullscreen: !state.isFullscreen,
        })),

      setFullscreen: (isFullscreen) =>
        set(() => ({
          isFullscreen,
        })),

      // Notification actions
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            ...state.notifications,
            {
              ...notification,
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            },
          ],
        })),

      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      clearNotifications: () =>
        set(() => ({
          notifications: [],
        })),

      // Modal actions
      openModal: (config) =>
        set(() => ({
          modal: {
            ...config,
            isOpen: true,
          },
        })),

      closeModal: () =>
        set(() => ({
          modal: {
            isOpen: false,
          },
        })),

      confirmModal: () => {
        const state = get();
        if (state.modal.onConfirm) {
          state.modal.onConfirm();
        }
        set(() => ({
          modal: {
            isOpen: false,
          },
        }));
      },

      // Loading actions
      setGlobalLoading: (globalLoading) =>
        set(() => ({
          globalLoading,
        })),

      setLoading: (key, loading) =>
        set((state) => ({
          loadingStates: {
            ...state.loadingStates,
            [key]: loading,
          },
        })),

      clearLoading: (key) =>
        set((state) => {
          const { [key]: _, ...rest } = state.loadingStates;
          return {
            loadingStates: rest,
          };
        }),

      isLoading: (key) => {
        const state = get();
        return state.loadingStates[key] || false;
      },

      // Error actions
      setGlobalError: (globalError) =>
        set(() => ({
          globalError,
        })),

      setError: (key, error) =>
        set((state) => ({
          errors: {
            ...state.errors,
            [key]: error,
          },
        })),

      clearError: (key) =>
        set((state) => {
          const { [key]: _, ...rest } = state.errors;
          return {
            errors: rest,
          };
        }),

      clearAllErrors: () =>
        set(() => ({
          errors: {},
          globalError: null,
        })),

      hasError: (key) => {
        const state = get();
        return Boolean(state.errors[key]);
      },

      // Terminal actions
      setTerminalVisible: (terminalVisible) =>
        set(() => ({
          terminalVisible,
        })),

      setTerminalMinimized: (terminalMinimized) =>
        set(() => ({
          terminalMinimized,
        })),

      toggleTerminal: () =>
        set((state) => ({
          terminalVisible: !state.terminalVisible,
        })),

      // WebSocket actions
      setWebSocketState: (webSocketState) =>
        set(() => ({
          webSocketState,
        })),

      // Workspace actions
      setCurrentWorkspace: (currentWorkspace) =>
        set(() => ({
          currentWorkspace,
        })),

      setWorkspaces: (workspaces) =>
        set(() => ({
          workspaces,
        })),

      toggleWorkspacesExpanded: () =>
        set((state) => ({
          workspacesExpanded: !state.workspacesExpanded,
        })),

      addAgent: (workspaceId, agent) =>
        set((state) => ({
          workspaces: state.workspaces.map((ws) =>
            ws.id === workspaceId
              ? { ...ws, agents: [...ws.agents, agent] }
              : ws
          ),
        })),

      updateAgentStatus: (agentId, status) =>
        set((state) => ({
          workspaces: state.workspaces.map((ws) => ({
            ...ws,
            agents: ws.agents.map((agent) =>
              agent.id === agentId ? { ...agent, status } : agent
            ),
          })),
        })),
    }),
    {
      name: 'ui-store',
    }
  )
);