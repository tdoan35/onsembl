/**
 * Contract test for command:request message
 * Tests command execution request handling via WebSocket
 */

import Fastify, { FastifyInstance } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import WebSocket from 'ws'
import {
  DashboardConnectMessage,
  CommandRequestMessage,
  CommandStatusUpdateMessage,
  createMessage,
  isCommandStatusUpdate,
  isError
} from '@onsembl/agent-protocol/websocket-messages'

describe('Command Request Message Contract', () => {
  let server: FastifyInstance
  let serverUrl: string
  const validToken = 'valid-test-token'
  const mockAgents = [
    { agentId: 'agent-claude-1', agentType: 'claude', status: 'online' },
    { agentId: 'agent-gemini-1', agentType: 'gemini', status: 'online' },
    { agentId: 'agent-offline', agentType: 'claude', status: 'offline' }
  ]

  beforeAll(async () => {
    server = Fastify({ logger: false })
    await server.register(fastifyWebsocket)

    server.register(async function (fastify) {
      fastify.get('/ws/dashboard', { websocket: true }, (connection, req) => {
        const { socket } = connection
        let authenticated = false

        socket.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString())

            if (message.type === 'dashboard:connect' && message.payload.token === validToken) {
              authenticated = true

              // Send connection ack
              socket.send(JSON.stringify(createMessage('connection:ack', {
                connectionId: `conn-${Date.now()}`,
                serverVersion: '1.0.0',
                features: ['command-execution']
              })))

              // Send agent list
              socket.send(JSON.stringify(createMessage('agent:list', {
                agents: mockAgents.map(a => ({
                  ...a,
                  connectedAt: Date.now() - 3600000,
                  lastActivity: Date.now() - 60000
                }))
              })))
            } else if (message.type === 'command:request' && authenticated) {
              const { agentId, command, priority, timeout } = message.payload

              // Find agent
              const agent = mockAgents.find(a => a.agentId === agentId)

              if (!agent) {
                socket.send(JSON.stringify(createMessage('error', {
                  code: 'AGENT_NOT_FOUND',
                  message: `Agent ${agentId} not found`,
                  recoverable: true,
                  details: null
                })))
                return
              }

              if (agent.status === 'offline') {
                socket.send(JSON.stringify(createMessage('error', {
                  code: 'AGENT_OFFLINE',
                  message: `Agent ${agentId} is offline`,
                  recoverable: true,
                  details: null
                })))
                return
              }

              // Generate command ID
              const commandId = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

              // Send queued status
              const queuedStatus: CommandStatusUpdateMessage = createMessage('command:status', {
                commandId,
                agentId,
                status: 'queued',
                exitCode: undefined,
                error: undefined,
                executionTime: undefined
              })
              socket.send(JSON.stringify(queuedStatus))

              // Simulate command execution after delay
              setTimeout(() => {
                // Send running status
                const runningStatus: CommandStatusUpdateMessage = createMessage('command:status', {
                  commandId,
                  agentId,
                  status: 'running',
                  exitCode: undefined,
                  error: undefined,
                  executionTime: undefined
                })
                socket.send(JSON.stringify(runningStatus))

                // Simulate completion after another delay
                setTimeout(() => {
                  const completedStatus: CommandStatusUpdateMessage = createMessage('command:status', {
                    commandId,
                    agentId,
                    status: 'completed',
                    exitCode: 0,
                    error: undefined,
                    executionTime: 150
                  })
                  socket.send(JSON.stringify(completedStatus))
                }, 150)
              }, 50)
            } else if (!authenticated) {
              socket.send(JSON.stringify(createMessage('error', {
                code: 'UNAUTHORIZED',
                message: 'Not authenticated',
                recoverable: false,
                details: null
              })))
              socket.close()
            }
          } catch (error) {
            socket.send(JSON.stringify(createMessage('error', {
              code: 'INVALID_MESSAGE',
              message: 'Failed to parse message',
              recoverable: true,
              details: null
            })))
          }
        })
      })
    })

    await server.listen({ port: 0 })
    const address = server.server.address()
    serverUrl = `ws://localhost:${address?.port}/ws/dashboard`
  })

  afterAll(async () => {
    await server.close()
  })

  it('should queue command request for online agent', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      const messages: any[] = []

      ws.on('open', () => {
        // First authenticate
        const connectMsg: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: validToken,
          clientInfo: {
            userAgent: 'Test Agent',
            timezone: 'UTC'
          }
        })
        ws.send(JSON.stringify(connectMsg))
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())
        messages.push(message)

        // After authentication, send command request
        if (messages.length === 2) { // After connection:ack and agent:list
          const commandRequest: CommandRequestMessage = createMessage('command:request', {
            agentId: 'agent-claude-1',
            command: 'echo "Hello World"',
            priority: 'normal'
          })
          ws.send(JSON.stringify(commandRequest))
        }

        // Check for command status messages
        if (message.type === 'command:status') {
          expect(isCommandStatusUpdate(message)).toBe(true)

          if (message.payload.status === 'queued') {
            expect(message.payload.commandId).toBeDefined()
            expect(message.payload.agentId).toBe('agent-claude-1')
          }

          if (message.payload.status === 'completed') {
            expect(message.payload.exitCode).toBe(0)
            expect(message.payload.executionTime).toBeGreaterThan(0)
            ws.close()
            resolve()
          }
        }
      })

      ws.on('error', reject)

      setTimeout(() => {
        ws.close()
        reject(new Error('Timeout waiting for command completion'))
      }, 5000)
    })
  })

  it('should reject command for offline agent', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      let authenticated = false

      ws.on('open', () => {
        // Authenticate first
        const connectMsg: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: validToken,
          clientInfo: {
            userAgent: 'Test Agent',
            timezone: 'UTC'
          }
        })
        ws.send(JSON.stringify(connectMsg))
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())

        if (message.type === 'connection:ack') {
          authenticated = true
        }

        if (authenticated && message.type === 'agent:list') {
          // Send command to offline agent
          const commandRequest: CommandRequestMessage = createMessage('command:request', {
            agentId: 'agent-offline',
            command: 'ls -la',
            priority: 'high'
          })
          ws.send(JSON.stringify(commandRequest))
        }

        if (message.type === 'error') {
          expect(isError(message)).toBe(true)
          expect(message.payload.code).toBe('AGENT_OFFLINE')
          expect(message.payload.recoverable).toBe(true)
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

  it('should reject command for non-existent agent', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      let authenticated = false

      ws.on('open', () => {
        // Authenticate first
        const connectMsg: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: validToken,
          clientInfo: {
            userAgent: 'Test Agent',
            timezone: 'UTC'
          }
        })
        ws.send(JSON.stringify(connectMsg))
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())

        if (message.type === 'connection:ack') {
          authenticated = true
        }

        if (authenticated && message.type === 'agent:list') {
          // Send command to non-existent agent
          const commandRequest: CommandRequestMessage = createMessage('command:request', {
            agentId: 'agent-does-not-exist',
            command: 'pwd',
            priority: 'low'
          })
          ws.send(JSON.stringify(commandRequest))
        }

        if (message.type === 'error') {
          expect(isError(message)).toBe(true)
          expect(message.payload.code).toBe('AGENT_NOT_FOUND')
          expect(message.payload.recoverable).toBe(true)
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

  it('should handle command with all priority levels', async () => {
    const priorities: Array<'high' | 'normal' | 'low'> = ['high', 'normal', 'low']

    for (const priority of priorities) {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(serverUrl)
        let authenticated = false

        ws.on('open', () => {
          const connectMsg: DashboardConnectMessage = createMessage('dashboard:connect', {
            token: validToken,
            clientInfo: {
              userAgent: 'Test Agent',
              timezone: 'UTC'
            }
          })
          ws.send(JSON.stringify(connectMsg))
        })

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString())

          if (message.type === 'connection:ack') {
            authenticated = true
          }

          if (authenticated && message.type === 'agent:list') {
            const commandRequest: CommandRequestMessage = createMessage('command:request', {
              agentId: 'agent-claude-1',
              command: `test command with ${priority} priority`,
              priority
            })
            ws.send(JSON.stringify(commandRequest))
          }

          if (message.type === 'command:status' && message.payload.status === 'queued') {
            expect(message.payload.commandId).toBeDefined()
            ws.close()
            resolve()
          }
        })

        ws.on('error', reject)

        setTimeout(() => {
          ws.close()
          reject(new Error(`Timeout for priority ${priority}`))
        }, 2000)
      })
    }
  })

  it('should handle command with optional timeout', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      let authenticated = false

      ws.on('open', () => {
        const connectMsg: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: validToken,
          clientInfo: {
            userAgent: 'Test Agent',
            timezone: 'UTC'
          }
        })
        ws.send(JSON.stringify(connectMsg))
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())

        if (message.type === 'connection:ack') {
          authenticated = true
        }

        if (authenticated && message.type === 'agent:list') {
          const commandRequest: CommandRequestMessage = createMessage('command:request', {
            agentId: 'agent-gemini-1',
            command: 'sleep 5',
            priority: 'normal',
            timeout: 10000 // 10 second timeout
          })
          ws.send(JSON.stringify(commandRequest))
        }

        if (message.type === 'command:status' && message.payload.status === 'queued') {
          expect(message.payload.commandId).toBeDefined()
          expect(message.payload.agentId).toBe('agent-gemini-1')
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

  it('should track command status transitions', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      const statusTransitions: string[] = []

      ws.on('open', () => {
        const connectMsg: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: validToken,
          clientInfo: {
            userAgent: 'Test Agent',
            timezone: 'UTC'
          }
        })
        ws.send(JSON.stringify(connectMsg))
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())

        if (message.type === 'agent:list') {
          const commandRequest: CommandRequestMessage = createMessage('command:request', {
            agentId: 'agent-claude-1',
            command: 'test command',
            priority: 'normal'
          })
          ws.send(JSON.stringify(commandRequest))
        }

        if (message.type === 'command:status') {
          statusTransitions.push(message.payload.status)

          if (message.payload.status === 'completed') {
            expect(statusTransitions).toEqual(['queued', 'running', 'completed'])
            ws.close()
            resolve()
          }
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