import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentCard } from '@/components/agents/agent-card';

describe('AgentCard Component', () => {
  const mockAgent = {
    id: 'agent-1',
    name: 'Claude Agent',
    type: 'claude' as const,
    status: 'online' as const,
    version: '1.0.0',
    lastPing: new Date().toISOString(),
    capabilities: ['code_execution', 'file_operations'],
  };

  it('should render agent information', () => {
    render(<AgentCard agent={mockAgent} />);

    expect(screen.getByText('Claude Agent')).toBeInTheDocument();
    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.getByText('online')).toBeInTheDocument();
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
  });

  it('should show online status with green indicator', () => {
    render(<AgentCard agent={mockAgent} />);

    const statusElement = screen.getByText('online');
    expect(statusElement).toHaveClass('text-green-600');
  });

  it('should show offline status with red indicator', () => {
    const offlineAgent = { ...mockAgent, status: 'offline' as const };
    render(<AgentCard agent={offlineAgent} />);

    const statusElement = screen.getByText('offline');
    expect(statusElement).toHaveClass('text-red-600');
  });

  it('should display capabilities', () => {
    render(<AgentCard agent={mockAgent} />);

    expect(screen.getByText('code_execution')).toBeInTheDocument();
    expect(screen.getByText('file_operations')).toBeInTheDocument();
  });

  it('should handle click event', () => {
    const handleClick = jest.fn();
    render(<AgentCard agent={mockAgent} onClick={handleClick} />);

    const card = screen.getByRole('article');
    fireEvent.click(card);

    expect(handleClick).toHaveBeenCalledWith(mockAgent);
  });

  it('should show last ping time', () => {
    render(<AgentCard agent={mockAgent} />);

    // Should show relative time like "just now" or "2 minutes ago"
    expect(screen.getByText(/ago|just now/i)).toBeInTheDocument();
  });

  it('should show executing status with spinner', () => {
    const executingAgent = { ...mockAgent, status: 'executing' as const };
    render(<AgentCard agent={executingAgent} />);

    expect(screen.getByText('executing')).toBeInTheDocument();
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });
});