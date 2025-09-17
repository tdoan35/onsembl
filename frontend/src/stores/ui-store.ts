import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
export type SidebarState = 'expanded' | 'collapsed' | 'hidden';

export interface NotificationConfig {
  id: string;
  title: string;
  description?: string;
  type: 'info' | 'success' | 'warning' | 'error';
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
  systemTheme: 'light' | 'dark';

  // Layout
  sidebarState: SidebarState;
  isFullscreen: boolean;

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
}

export const useUIStore = create<UIStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      theme: 'system',
      systemTheme: 'light',
      sidebarState: 'expanded',
      isFullscreen: false,
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
    }),
    {
      name: 'ui-store',
    }
  )
);