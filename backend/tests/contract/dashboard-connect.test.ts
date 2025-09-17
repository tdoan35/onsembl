/**
 * Contract test for dashboard:connect message
 * Tests the dashboard connection protocol and initial handshake
 */

import Fastify, { FastifyInstance } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import WebSocket from 'ws'
import {
  DashboardConnectMessage,
  ConnectionAckMessage,
  AgentListMessage,
  createMessage,
  isDashboardConnect,
  isConnectionAck,
  isAgentList,
  isError
} from '@onsembl/agent-protocol/websocket-messages'

describe('Dashboard Connect Message Contract', () => {
  let server: FastifyInstance
  let serverUrl: string
  let connectedClients: Set<WebSocket> = new Set()

  beforeAll(async () => {
    // Create test server with dashboard connect handling
    server = Fastify({ logger: false })
    await server.register(fastifyWebsocket)

    server.register(async function (fastify) {
      fastify.get('/ws/dashboard', { websocket: true }, (connection, req) => {
        const { socket } = connection
        let authenticated = false

        socket.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString())

            // Handle dashboard:connect message
            if (isDashboardConnect(message)) {
              const { token, clientInfo } = message.payload

              // Validate token (simplified for test)
              if (token === 'valid-token') {
                authenticated = true
                connectedClients.add(socket)

                // Send connection acknowledgment
                const ackMessage: ConnectionAckMessage = createMessage('connection:ack', {
                  connectionId: `conn-${Date.now()}`,
                  serverVersion: '1.0.0',
                  features: ['real-time', 'command-execution', 'terminal-streaming']
                })
                socket.send(JSON.stringify(ackMessage))

                // Send initial agent list
                const agentListMessage: AgentListMessage = createMessage('agent:list', {
                  agents: [
                    {
                      agentId: 'agent-claude-1',
                      agentType: 'claude',
                      status: 'online',
                      connectedAt: Date.now() - 3600000,
                      lastActivity: Date.now() - 60000
                    },
                    {
                      agentId: 'agent-gemini-1',
                      agentType: 'gemini',
                      status: 'offline',
                      connectedAt: Date.now() - 7200000,
                      lastActivity: Date.now() - 1800000
                    }
                  ]
                })
                socket.send(JSON.stringify(agentListMessage))
              } else {
                // Send error for invalid token
                const errorMessage = createMessage('error', {
                  code: 'AUTH_FAILED',
                  message: 'Invalid authentication token',
                  recoverable: false,
                  details: null
                })
                socket.send(JSON.stringify(errorMessage))
                socket.close()
              }
            } else if (!authenticated) {
              // Reject other messages if not authenticated
              const errorMessage = createMessage('error', {
                code: 'UNAUTHORIZED',
                message: 'Must send dashboard:connect first',
                recoverable: false,
                details: null
              })
              socket.send(JSON.stringify(errorMessage))
              socket.close()
            }
          } catch (error) {
            const errorMessage = createMessage('error', {
              code: 'INVALID_MESSAGE',
              message: 'Failed to parse message',
              recoverable: true,
              details: null
            })
            socket.send(JSON.stringify(errorMessage))
          }
        })

        socket.on('close', () => {
          connectedClients.delete(socket)
        })
      })
    })

    await server.listen({ port: 0 })
    const address = server.server.address()
    serverUrl = `ws://localhost:${address?.port}/ws/dashboard`
  })

  afterAll(async () => {
    // Close all connected clients
    connectedClients.forEach(client => client.close())
    await server.close()
  })

  it('should connect successfully with valid dashboard:connect message', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      const messages: any[] = []

      ws.on('open', () => {
        // Send dashboard:connect message
        const connectMessage: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: 'valid-token',
          clientInfo: {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            timezone: 'America/New_York',
            viewport: {
              width: 1920,
              height: 1080
            }
          }
        })
        ws.send(JSON.stringify(connectMessage))
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())
        messages.push(message)

        if (messages.length === 2) {
          // First message should be connection:ack
          expect(isConnectionAck(messages[0])).toBe(true)
          expect(messages[0].payload.connectionId).toBeDefined()
          expect(messages[0].payload.serverVersion).toBe('1.0.0')
          expect(messages[0].payload.features).toContain('real-time')

          // Second message should be agent:list
          expect(isAgentList(messages[1])).toBe(true)
          expect(messages[1].payload.agents).toHaveLength(2)
          expect(messages[1].payload.agents[0].agentId).toBe('agent-claude-1')
          expect(messages[1].payload.agents[0].status).toBe('online')

          ws.close()
          resolve()
        }
      })

      ws.on('error', reject)
      ws.on('close', () => {
        if (messages.length < 2) {
          reject(new Error('Connection closed before receiving all messages'))
        }
      })

      setTimeout(() => {
        ws.close()
        reject(new Error('Timeout waiting for messages'))
      }, 5000)
    })
  })

  it('should reject connection with invalid token', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)

      ws.on('open', () => {
        // Send dashboard:connect with invalid token
        const connectMessage: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: 'invalid-token',
          clientInfo: {
            userAgent: 'Test Agent',
            timezone: 'UTC'
          }
        })
        ws.send(JSON.stringify(connectMessage))
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())

        // Should receive error message
        expect(isError(message)).toBe(true)
        expect(message.payload.code).toBe('AUTH_FAILED')
        expect(message.payload.recoverable).toBe(false)
      })

      ws.on('close', () => {
        // Connection should close after auth failure
        resolve()
      })

      ws.on('error', reject)

      setTimeout(() => {
        ws.close()
        reject(new Error('Timeout'))
      }, 5000)
    })
  })

  it('should reject messages before dashboard:connect', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)

      ws.on('open', () => {
        // Try to send a different message type without authenticating first
        const heartbeatMessage = createMessage('heartbeat', {
          sequence: 1
        })
        ws.send(JSON.stringify(heartbeatMessage))
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())

        // Should receive error about needing to authenticate first
        expect(isError(message)).toBe(true)
        expect(message.payload.code).toBe('UNAUTHORIZED')
        expect(message.payload.message).toContain('dashboard:connect')
      })

      ws.on('close', () => {
        resolve()
      })

      ws.on('error', reject)

      setTimeout(() => {
        ws.close()
        reject(new Error('Timeout'))
      }, 5000)
    })
  })

  it('should include required client information', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)

      ws.on('open', () => {
        // Send dashboard:connect with full client info
        const connectMessage: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: 'valid-token',
          clientInfo: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
            timezone: 'Europe/London',
            viewport: {
              width: 2560,
              height: 1440
            }
          }
        })
        ws.send(JSON.stringify(connectMessage))
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())

        if (isConnectionAck(message)) {
          // Verify server acknowledged the connection
          expect(message.payload.connectionId).toBeDefined()
          expect(typeof message.payload.connectionId).toBe('string')

          ws.close()
          resolve()
        }
      })

      ws.on('error', reject)

      setTimeout(() => {
        ws.close()
        reject(new Error('Timeout'))
      }, 5000)
    })
  })

  it('should handle malformed dashboard:connect message', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)

      ws.on('open', () => {
        // Send malformed message (missing required fields)
        const malformedMessage = {
          version: '1.0.0',
          type: 'dashboard:connect',
          timestamp: Date.now(),
          payload: {
            // Missing token and clientInfo
          }
        }
        ws.send(JSON.stringify(malformedMessage))
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())

        // Should receive error for malformed message
        expect(isError(message)).toBe(true)
        expect(message.payload.code).toBe('AUTH_FAILED')
      })

      ws.on('close', () => {
        resolve()
      })

      ws.on('error', reject)

      setTimeout(() => {
        ws.close()
        reject(new Error('Timeout'))
      }, 5000)
    })
  })

  it('should support optional viewport information', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)

      ws.on('open', () => {
        // Send dashboard:connect without viewport (optional field)
        const connectMessage: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: 'valid-token',
          clientInfo: {
            userAgent: 'Mobile Safari',
            timezone: 'Asia/Tokyo'
            // No viewport provided
          }
        })
        ws.send(JSON.stringify(connectMessage))
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())

        if (isConnectionAck(message)) {
          // Should still connect successfully without viewport
          expect(message.payload.connectionId).toBeDefined()
          ws.close()
          resolve()
        }
      })

      ws.on('error', reject)

      setTimeout(() => {
        ws.close()
        reject(new Error('Timeout'))
      }, 5000)
    })
  })

  it('should maintain message version consistency', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      const receivedMessages: any[] = []

      ws.on('open', () => {
        const connectMessage: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: 'valid-token',
          clientInfo: {
            userAgent: 'Test Agent',
            timezone: 'UTC'
          }
        })
        ws.send(JSON.stringify(connectMessage))
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())
        receivedMessages.push(message)

        // Check version on all messages
        expect(message.version).toBe('1.0.0')
        expect(message.timestamp).toBeDefined()
        expect(typeof message.timestamp).toBe('number')

        if (receivedMessages.length === 2) {
          ws.close()
          resolve()
        }
      })

      ws.on('error', reject)

      setTimeout(() => {
        ws.close()
        reject(new Error('Timeout'))
      }, 5000)
    })
  })
})