/**
 * Jest setup file for React Testing Library
 * This file runs before each test file in the frontend
 */

// Import jest-dom matchers
import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter: () => ({
    route: '/',
    pathname: '/',
    query: {},
    asPath: '/',
    push: jest.fn(),
    pop: jest.fn(),
    reload: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
    beforePopState: jest.fn(),
    events: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    },
    isFallback: false,
    isLocaleDomain: true,
    isReady: true,
    isPreview: false,
  }),
}));

// Mock Next.js navigation (App Router)
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(),
    getAll: jest.fn(),
    has: jest.fn(),
    keys: jest.fn(),
    values: jest.fn(),
    entries: jest.fn(),
    forEach: jest.fn(),
    toString: jest.fn(),
  }),
  usePathname: () => '/',
  notFound: jest.fn(),
  redirect: jest.fn(),
}));

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// Mock Next.js Link component
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }) => {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

// Mock WebSocket
global.WebSocket = jest.fn(() => ({
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  readyState: WebSocket.OPEN,
}));

// Mock xterm.js
jest.mock('xterm', () => ({
  Terminal: jest.fn(() => ({
    open: jest.fn(),
    write: jest.fn(),
    writeln: jest.fn(),
    clear: jest.fn(),
    reset: jest.fn(),
    resize: jest.fn(),
    dispose: jest.fn(),
    onData: jest.fn(),
    onResize: jest.fn(),
    loadAddon: jest.fn(),
    element: document.createElement('div'),
  })),
}));

jest.mock('xterm-addon-fit', () => ({
  FitAddon: jest.fn(() => ({
    activate: jest.fn(),
    dispose: jest.fn(),
    fit: jest.fn(),
  })),
}));

jest.mock('xterm-addon-web-links', () => ({
  WebLinksAddon: jest.fn(() => ({
    activate: jest.fn(),
    dispose: jest.fn(),
  })),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock HTMLElement methods
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  value: jest.fn(),
  writable: true,
});

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  value: jest.fn(),
  writable: true,
});

// Mock console methods for cleaner test output
const originalConsole = console;
global.console = {
  ...originalConsole,
  // Keep error and warn for debugging
  error: originalConsole.error,
  warn: originalConsole.warn,
  // Silence info, log, debug during tests
  info: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
};

// Global test utilities for React Testing Library
global.TestUtils = {
  ...global.TestUtils, // Keep existing utilities from main jest.setup.js

  // React-specific test utilities
  createMockComponent: (name) => {
    const MockComponent = (props) => React.createElement('div', { 'data-testid': name, ...props });
    MockComponent.displayName = `Mock${name}`;
    return MockComponent;
  },

  // Mock Zustand store
  createMockStore: (initialState = {}) => ({
    getState: () => initialState,
    setState: jest.fn(),
    subscribe: jest.fn(),
    destroy: jest.fn(),
  }),

  // Mock Supabase client for frontend
  createMockSupabaseClient: () => ({
    from: jest.fn(() => ({
      select: jest.fn(() => Promise.resolve({ data: [], error: null })),
      insert: jest.fn(() => Promise.resolve({ data: [], error: null })),
      update: jest.fn(() => Promise.resolve({ data: [], error: null })),
      delete: jest.fn(() => Promise.resolve({ data: [], error: null })),
      eq: jest.fn(function() { return this; }),
      neq: jest.fn(function() { return this; }),
      order: jest.fn(function() { return this; }),
      limit: jest.fn(function() { return this; }),
    })),
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    realtime: {
      channel: jest.fn(() => ({
        on: jest.fn(function() { return this; }),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
      })),
    },
  }),
};

// Clean up after each test
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
});