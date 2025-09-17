/**
 * Contract test for WebSocket handshake
 * Tests the WebSocket connection establishment and initial handshake
 */

import Fastify, { FastifyInstance } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import WebSocket from 'ws'
import {
  ConnectionAckMessage,
  AgentListMessage,
  isConnectionAck,
  isAgentList
} from '@onsembl/agent-protocol/websocket-messages'

describe('WebSocket Handshake Contract', () => {
  let server: FastifyInstance
  let serverUrl: string
  const testToken = 'test-jwt-token'

  beforeAll(async () => {
    // Create test server
    server = Fastify({ logger: false })
    await server.register(fastifyWebsocket)

    // Register WebSocket route
    server.register(async function (fastify) {
      fastify.get('/ws/dashboard', { websocket: true }, (connection, req) => {
        const { socket } = connection
        const token = req.query.token

        // Validate token
        if (!token || token !== testToken) {
          socket.send(JSON.stringify({
            version: '1.0.0',
            type: 'error',
            timestamp: Date.now(),
            payload: {
              code: 'AUTH_FAILED',
              message: 'Invalid or missing token',
              recoverable: false
            }
          }))
          socket.close()
          return
        }

        // Send connection acknowledgment
        const ackMessage: ConnectionAckMessage = {
          version: '1.0.0',
          type: 'connection:ack',
          timestamp: Date.now(),
          payload: {
            connectionId: `conn-${Date.now()}`,
            serverVersion: '1.0.0',
            features: ['real-time', 'command-execution', 'terminal-streaming']
          }
        }
        socket.send(JSON.stringify(ackMessage))

        // Send agent list
        const agentListMessage: AgentListMessage = {
          version: '1.0.0',
          type: 'agent:list',
          timestamp: Date.now(),
          payload: {
            agents: []
          }
        }
        socket.send(JSON.stringify(agentListMessage))
      })
    })

    await server.listen({ port: 0 })
    const address = server.server.address()
    serverUrl = `ws://localhost:${address?.port}/ws/dashboard`
  })

  afterAll(async () => {
    await server.close()
  })

  it('should establish WebSocket connection with valid token', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${serverUrl}?token=${testToken}`)
      const messages: any[] = []

      ws.on('open', () => {
        // Connection established
        expect(ws.readyState).toBe(WebSocket.OPEN)
      })

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())
        messages.push(message)

        // Check for expected messages
        if (messages.length === 2) {
          // First message should be connection:ack
          expect(isConnectionAck(messages[0])).toBe(true)
          expect(messages[0].payload.connectionId).toBeDefined()
          expect(messages[0].payload.serverVersion).toBe('1.0.0')
          expect(messages[0].payload.features).toContain('real-time')

          // Second message should be agent:list
          expect(isAgentList(messages[1])).toBe(true)
          expect(Array.isArray(messages[1].payload.agents)).toBe(true)

          ws.close()
          resolve()
        }
      })

      ws.on('error', reject)

      setTimeout(() => {
        ws.close()
        reject(new Error('Timeout waiting for handshake'))
      }, 5000)
    })
  })

  it('should reject connection with invalid token', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${serverUrl}?token=invalid-token`)

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())

        // Should receive an error message
        expect(message.type).toBe('error')
        expect(message.payload.code).toBe('AUTH_FAILED')
        expect(message.payload.recoverable).toBe(false)
      })

      ws.on('close', () => {
        // Connection should be closed after error
        resolve()
      })

      ws.on('error', (error) => {
        // Connection error is expected for invalid auth
        if (error.message.includes('Unexpected server response')) {
          resolve()
        } else {
          reject(error)
        }
      })

      setTimeout(() => {
        ws.close()
        reject(new Error('Timeout waiting for rejection'))
      }, 5000)
    })
  })

  it('should reject connection without token', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())

        // Should receive an error message
        expect(message.type).toBe('error')
        expect(message.payload.code).toBe('AUTH_FAILED')
      })

      ws.on('close', () => {
        // Connection should be closed after error
        resolve()
      })

      ws.on('error', (error) => {
        // Connection error is expected for missing auth
        if (error.message.includes('Unexpected server response')) {
          resolve()
        } else {
          reject(error)
        }
      })

      setTimeout(() => {
        ws.close()
        reject(new Error('Timeout waiting for rejection'))
      }, 5000)
    })
  })

  it('should upgrade HTTP connection to WebSocket', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${serverUrl}?token=${testToken}`)

      ws.on('upgrade', (response) => {
        // Check upgrade headers
        expect(response.headers.upgrade).toBe('websocket')
        expect(response.headers.connection?.toLowerCase()).toContain('upgrade')
        expect(response.statusCode).toBe(101)
        resolve()
      })

      ws.on('error', reject)

      setTimeout(() => {
        ws.close()
        reject(new Error('Timeout waiting for upgrade'))
      }, 5000)
    })
  })

  it('should include protocol version in all messages', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${serverUrl}?token=${testToken}`)

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())

        // All messages must include version
        expect(message.version).toBe('1.0.0')
        expect(message.timestamp).toBeDefined()
        expect(typeof message.timestamp).toBe('number')

        ws.close()
        resolve()
      })

      ws.on('error', reject)

      setTimeout(() => {
        ws.close()
        reject(new Error('Timeout'))
      }, 5000)
    })
  })
})