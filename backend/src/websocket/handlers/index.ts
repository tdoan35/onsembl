/**
 * WebSocket Message Handlers
 * Exports all message handlers for WebSocket communication
 */

export { handleDashboardConnect } from './dashboard-connect.js'
export { handleCommandRequest } from './command-request.js'
export { handleCommandInterrupt } from './command-interrupt.js'
export { handleHeartbeat } from './heartbeat.js'
export { handleError } from './error.js'