/**
 * Example test file demonstrating React Testing Library setup
 * This file can be removed once real components are implemented
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Example component for testing
const ExampleButton: React.FC<{ onClick?: () => void; children: React.ReactNode }> = ({
  onClick,
  children,
}) => (
  <button onClick={onClick} data-testid="example-button">
    {children}
  </button>
);

const ExampleCounter: React.FC = () => {
  const [count, setCount] = React.useState(0);

  return (
    <div>
      <p data-testid="count">Count: {count}</p>
      <button
        data-testid="increment"
        onClick={() => setCount(c => c + 1)}
      >
        Increment
      </button>
      <button
        data-testid="decrement"
        onClick={() => setCount(c => c - 1)}
      >
        Decrement
      </button>
    </div>
  );
};

describe('Example Tests', () => {
  describe('ExampleButton', () => {
    it('renders button with children', () => {
      render(<ExampleButton>Click me</ExampleButton>);

      expect(screen.getByTestId('example-button')).toBeInTheDocument();
      expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('calls onClick when clicked', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      render(<ExampleButton onClick={handleClick}>Click me</ExampleButton>);

      await user.click(screen.getByTestId('example-button'));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick when clicked with fireEvent', () => {
      const handleClick = jest.fn();

      render(<ExampleButton onClick={handleClick}>Click me</ExampleButton>);

      fireEvent.click(screen.getByTestId('example-button'));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('ExampleCounter', () => {
    it('renders initial count', () => {
      render(<ExampleCounter />);

      expect(screen.getByTestId('count')).toHaveTextContent('Count: 0');
    });

    it('increments count when increment button is clicked', async () => {
      const user = userEvent.setup();
      render(<ExampleCounter />);

      await user.click(screen.getByTestId('increment'));

      expect(screen.getByTestId('count')).toHaveTextContent('Count: 1');
    });

    it('decrements count when decrement button is clicked', async () => {
      const user = userEvent.setup();
      render(<ExampleCounter />);

      await user.click(screen.getByTestId('decrement'));

      expect(screen.getByTestId('count')).toHaveTextContent('Count: -1');
    });

    it('handles multiple clicks correctly', async () => {
      const user = userEvent.setup();
      render(<ExampleCounter />);

      // Increment 3 times
      await user.click(screen.getByTestId('increment'));
      await user.click(screen.getByTestId('increment'));
      await user.click(screen.getByTestId('increment'));

      expect(screen.getByTestId('count')).toHaveTextContent('Count: 3');

      // Decrement 1 time
      await user.click(screen.getByTestId('decrement'));

      expect(screen.getByTestId('count')).toHaveTextContent('Count: 2');
    });
  });

  describe('Test Utilities', () => {
    it('has access to global test utilities', () => {
      expect(global.TestUtils).toBeDefined();
      expect(global.TestUtils.createMockComponent).toBeDefined();
      expect(global.TestUtils.createMockStore).toBeDefined();
      expect(global.TestUtils.createMockSupabaseClient).toBeDefined();
    });

    it('can use createMockComponent utility', () => {
      const MockComponent = global.TestUtils.createMockComponent('TestComponent');

      render(<MockComponent test-prop="value" />);

      expect(screen.getByTestId('TestComponent')).toBeInTheDocument();
    });

    it('can use createMockStore utility', () => {
      const mockStore = global.TestUtils.createMockStore({ count: 5 });

      expect(mockStore.getState()).toEqual({ count: 5 });
      expect(mockStore.setState).toBeDefined();
      expect(mockStore.subscribe).toBeDefined();
    });

    it('can use createMockSupabaseClient utility', async () => {
      const mockClient = global.TestUtils.createMockSupabaseClient();

      const result = await mockClient.from('test').select('*');

      expect(result).toEqual({ data: [], error: null });
      expect(mockClient.auth.getSession).toBeDefined();
    });
  });

  describe('Async Operations', () => {
    it('handles async operations with waitFor', async () => {
      const AsyncComponent: React.FC = () => {
        const [loading, setLoading] = React.useState(true);
        const [data, setData] = React.useState<string | null>(null);

        React.useEffect(() => {
          const timer = setTimeout(() => {
            setData('Loaded data');
            setLoading(false);
          }, 100);

          return () => clearTimeout(timer);
        }, []);

        if (loading) {
          return <div data-testid="loading">Loading...</div>;
        }

        return <div data-testid="data">{data}</div>;
      };

      render(<AsyncComponent />);

      expect(screen.getByTestId('loading')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByTestId('data')).toBeInTheDocument();
      });

      expect(screen.getByTestId('data')).toHaveTextContent('Loaded data');
      expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    });
  });
});