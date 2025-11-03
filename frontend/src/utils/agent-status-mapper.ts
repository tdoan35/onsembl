/**
 * Centralized agent status mapping utility
 * Maps backend agent status values to frontend status values
 */

export type FrontendAgentStatus = 'online' | 'offline' | 'error' | 'connecting';

/**
 * Map backend agent status to frontend agent status
 * Handles various backend status formats and normalizes them
 *
 * @param backendStatus - Status string from backend (case-insensitive)
 * @returns Normalized frontend status
 */
export function mapAgentStatus(backendStatus: string): FrontendAgentStatus {
  const normalizedStatus = backendStatus?.toLowerCase();

  switch (normalizedStatus) {
    // Online states
    case 'connected':
    case 'online':
    case 'busy':
    case 'idle':
      return 'online';

    // Offline states
    case 'disconnected':
    case 'offline':
      return 'offline';

    // Error states
    case 'error':
    case 'crashed':
    case 'failed':
      return 'error';

    // Connecting states
    case 'connecting':
    case 'initializing':
      return 'connecting';

    // Default to offline for unknown states
    default:
      console.warn(`[AgentStatusMapper] Unknown backend status: "${backendStatus}", defaulting to offline`);
      return 'offline';
  }
}

/**
 * Check if a backend status indicates the agent is available for work
 * @param backendStatus - Status string from backend
 * @returns True if agent is available
 */
export function isAgentAvailable(backendStatus: string): boolean {
  const frontendStatus = mapAgentStatus(backendStatus);
  return frontendStatus === 'online';
}

/**
 * Check if a backend status indicates the agent is in an error state
 * @param backendStatus - Status string from backend
 * @returns True if agent is in error state
 */
export function isAgentErrored(backendStatus: string): boolean {
  const frontendStatus = mapAgentStatus(backendStatus);
  return frontendStatus === 'error';
}
