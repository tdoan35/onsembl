/**
 * Contract test for agent:status broadcast
 * Tests agent status change broadcasting to all connected dashboards
 */

import Fastify, { FastifyInstance } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import WebSocket from 'ws'
import {
  DashboardConnectMessage,
  AgentStatusUpdateMessage,
  createMessage,
  isAgentStatusUpdate,
  isAgentList
} from '@onsembl/agent-protocol/websocket-messages'

describe('Agent Status Broadcast Contract', () => {
  let server: FastifyInstance
  let serverUrl: string
  const validToken = 'valid-test-token'
  const connectedDashboards: Set<WebSocket> = new Set()

  beforeAll(async () => {
    server = Fastify({ logger: false })
    await server.register(fastifyWebsocket)

    // Track agents
    const agents = new Map()

    server.register(async function (fastify) {
      fastify.get('/ws/dashboard', { websocket: true }, (connection, req) => {
        const { socket } = connection
        let authenticated = false

        socket.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString())

            if (message.type === 'dashboard:connect' && message.payload.token === validToken) {
              authenticated = true
              connectedDashboards.add(socket)

              // Send connection ack
              socket.send(JSON.stringify(createMessage('connection:ack', {
                connectionId: `conn-${Date.now()}`,
                serverVersion: '1.0.0',
                features: ['real-time']
              })))

              // Send current agent list
              const agentList = Array.from(agents.values())
              socket.send(JSON.stringify(createMessage('agent:list', {
                agents: agentList
              })))
            }
          } catch (error) {
            // Handle error
          }
        })

        socket.on('close', () => {
          connectedDashboards.delete(socket)
        })
      })

      // Agent WebSocket endpoint for simulation
      fastify.get('/ws/agent', { websocket: true }, (connection, req) => {
        const { socket } = connection
        const agentId = req.query.agentId as string
        const agentType = req.query.agentType as string || 'claude'

        // Register agent
        const agentInfo = {
          agentId,
          agentType,
          status: 'online' as const,
          connectedAt: Date.now(),
          lastActivity: Date.now()
        }
        agents.set(agentId, agentInfo)

        // Broadcast agent connected status to all dashboards
        const statusMessage: AgentStatusUpdateMessage = createMessage('agent:status', {
          agentId,
          agentType: agentType as 'claude' | 'gemini' | 'codex',
          status: 'online',
          capabilities: ['execute', 'trace'],
          metadata: {
            version: '1.0.0',
            platform: 'test'
          }
        })

        connectedDashboards.forEach(dashboard => {
          if (dashboard.readyState === WebSocket.OPEN) {
            dashboard.send(JSON.stringify(statusMessage))
          }
        })

        socket.on('close', () => {
          // Update agent status
          if (agents.has(agentId)) {
            agents.get(agentId).status = 'offline'

            // Broadcast agent disconnected status
            const offlineMessage: AgentStatusUpdateMessage = createMessage('agent:status', {
              agentId,
              agentType: agentType as 'claude' | 'gemini' | 'codex',
              status: 'offline'
            })

            connectedDashboards.forEach(dashboard => {
              if (dashboard.readyState === WebSocket.OPEN) {
                dashboard.send(JSON.stringify(offlineMessage))
              }
            })

            // Remove agent after broadcasting
            agents.delete(agentId)
          }
        })
      })
    })

    await server.listen({ port: 0 })
    const address = server.server.address()
    serverUrl = `ws://localhost:${address?.port}`
  })

  afterAll(async () => {
    connectedDashboards.forEach(dashboard => dashboard.close())
    await server.close()
  })

  it('should broadcast agent status to all connected dashboards', async () => {
    return new Promise<void>((resolve, reject) => {
      // Connect two dashboards
      const dashboard1 = new WebSocket(`${serverUrl}/ws/dashboard`)
      const dashboard2 = new WebSocket(`${serverUrl}/ws/dashboard`)

      const dashboard1Messages: any[] = []
      const dashboard2Messages: any[] = []
      let dashboard1Ready = false
      let dashboard2Ready = false

      // Setup dashboard 1
      dashboard1.on('open', () => {
        const connectMsg: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: validToken,
          clientInfo: {
            userAgent: 'Dashboard 1',
            timezone: 'UTC'
          }
        })
        dashboard1.send(JSON.stringify(connectMsg))
      })

      dashboard1.on('message', (data) => {
        const message = JSON.parse(data.toString())
        dashboard1Messages.push(message)

        if (message.type === 'connection:ack') {
          dashboard1Ready = true
          checkAndConnect()
        }

        // Check for agent status updates
        if (message.type === 'agent:status') {
          expect(isAgentStatusUpdate(message)).toBe(true)
          expect(message.payload.agentId).toBe('test-agent-1')
          expect(message.payload.status).toBe('online')
        }
      })

      // Setup dashboard 2
      dashboard2.on('open', () => {
        const connectMsg: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: validToken,
          clientInfo: {
            userAgent: 'Dashboard 2',
            timezone: 'UTC'
          }
        })
        dashboard2.send(JSON.stringify(connectMsg))
      })

      dashboard2.on('message', (data) => {
        const message = JSON.parse(data.toString())
        dashboard2Messages.push(message)

        if (message.type === 'connection:ack') {
          dashboard2Ready = true
          checkAndConnect()
        }

        // Check for agent status updates
        if (message.type === 'agent:status') {
          expect(isAgentStatusUpdate(message)).toBe(true)
          expect(message.payload.agentId).toBe('test-agent-1')
          expect(message.payload.status).toBe('online')

          // Both dashboards should receive the broadcast
          setTimeout(() => {
            const d1StatusMessages = dashboard1Messages.filter(m => m.type === 'agent:status')
            const d2StatusMessages = dashboard2Messages.filter(m => m.type === 'agent:status')

            expect(d1StatusMessages.length).toBeGreaterThan(0)
            expect(d2StatusMessages.length).toBeGreaterThan(0)

            dashboard1.close()
            dashboard2.close()
            resolve()
          }, 100)
        }
      })

      const checkAndConnect = () => {
        if (dashboard1Ready && dashboard2Ready) {
          // Now connect an agent
          const agentWs = new WebSocket(`${serverUrl}/ws/agent?agentId=test-agent-1&agentType=claude`)

          agentWs.on('open', () => {
            // Agent connected, status should be broadcast
          })

          agentWs.on('error', (error) => {
            console.error('Agent connection error:', error)
          })
        }
      }

      dashboard1.on('error', reject)
      dashboard2.on('error', reject)

      setTimeout(() => {
        dashboard1.close()
        dashboard2.close()
        reject(new Error('Timeout waiting for agent status broadcast'))
      }, 5000)
    })
  })

  it('should broadcast agent offline status when agent disconnects', async () => {
    return new Promise<void>((resolve, reject) => {
      const dashboard = new WebSocket(`${serverUrl}/ws/dashboard`)
      const statusMessages: any[] = []
      let agentWs: WebSocket

      dashboard.on('open', () => {
        const connectMsg: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: validToken,
          clientInfo: {
            userAgent: 'Test Dashboard',
            timezone: 'UTC'
          }
        })
        dashboard.send(JSON.stringify(connectMsg))
      })

      dashboard.on('message', (data) => {
        const message = JSON.parse(data.toString())

        if (message.type === 'connection:ack') {
          // Connect an agent
          agentWs = new WebSocket(`${serverUrl}/ws/agent?agentId=test-agent-2&agentType=gemini`)
        }

        if (message.type === 'agent:status') {
          statusMessages.push(message)

          if (message.payload.status === 'online' && message.payload.agentId === 'test-agent-2') {
            // Agent connected, now disconnect it
            setTimeout(() => {
              agentWs.close()
            }, 100)
          }

          if (message.payload.status === 'offline' && message.payload.agentId === 'test-agent-2') {
            // Verify we got both online and offline messages
            const onlineMsg = statusMessages.find(m =>
              m.payload.agentId === 'test-agent-2' && m.payload.status === 'online'
            )
            const offlineMsg = statusMessages.find(m =>
              m.payload.agentId === 'test-agent-2' && m.payload.status === 'offline'
            )

            expect(onlineMsg).toBeDefined()
            expect(offlineMsg).toBeDefined()

            dashboard.close()
            resolve()
          }
        }
      })

      dashboard.on('error', reject)

      setTimeout(() => {
        dashboard.close()
        if (agentWs) agentWs.close()
        reject(new Error('Timeout'))
      }, 5000)
    })
  })

  it('should include agent metadata in status updates', async () => {
    return new Promise<void>((resolve, reject) => {
      const dashboard = new WebSocket(`${serverUrl}/ws/dashboard`)

      dashboard.on('open', () => {
        const connectMsg: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: validToken,
          clientInfo: {
            userAgent: 'Test Dashboard',
            timezone: 'UTC'
          }
        })
        dashboard.send(JSON.stringify(connectMsg))
      })

      dashboard.on('message', (data) => {
        const message = JSON.parse(data.toString())

        if (message.type === 'connection:ack') {
          // Connect an agent with metadata
          const agentWs = new WebSocket(`${serverUrl}/ws/agent?agentId=test-agent-3&agentType=codex`)
        }

        if (message.type === 'agent:status' && message.payload.agentId === 'test-agent-3') {
          expect(isAgentStatusUpdate(message)).toBe(true)
          expect(message.payload.agentType).toBe('codex')
          expect(message.payload.status).toBe('online')
          expect(message.payload.capabilities).toContain('execute')
          expect(message.payload.metadata).toBeDefined()
          expect(message.payload.metadata.version).toBe('1.0.0')
          expect(message.payload.metadata.platform).toBe('test')

          dashboard.close()
          resolve()
        }
      })

      dashboard.on('error', reject)

      setTimeout(() => {
        dashboard.close()
        reject(new Error('Timeout'))
      }, 5000)
    })
  })

  it('should handle multiple agents connecting and disconnecting', async () => {
    return new Promise<void>((resolve, reject) => {
      const dashboard = new WebSocket(`${serverUrl}/ws/dashboard`)
      const agents: WebSocket[] = []
      const statusUpdates = new Map<string, string[]>()

      dashboard.on('open', () => {
        const connectMsg: DashboardConnectMessage = createMessage('dashboard:connect', {
          token: validToken,
          clientInfo: {
            userAgent: 'Test Dashboard',
            timezone: 'UTC'
          }
        })
        dashboard.send(JSON.stringify(connectMsg))
      })

      dashboard.on('message', (data) => {
        const message = JSON.parse(data.toString())

        if (message.type === 'connection:ack') {
          // Connect multiple agents
          for (let i = 1; i <= 3; i++) {
            const agentWs = new WebSocket(`${serverUrl}/ws/agent?agentId=multi-agent-${i}&agentType=claude`)
            agents.push(agentWs)
          }
        }

        if (message.type === 'agent:status') {
          const agentId = message.payload.agentId
          if (!statusUpdates.has(agentId)) {
            statusUpdates.set(agentId, [])
          }
          statusUpdates.get(agentId)!.push(message.payload.status)

          // Check if all agents connected
          const allConnected = ['multi-agent-1', 'multi-agent-2', 'multi-agent-3'].every(id =>
            statusUpdates.get(id)?.includes('online')
          )

          if (allConnected && agents.length === 3) {
            // Disconnect agents one by one
            agents.forEach((agent, index) => {
              setTimeout(() => {
                agent.close()
              }, 100 * (index + 1))
            })
          }

          // Check if all agents disconnected
          const allDisconnected = ['multi-agent-1', 'multi-agent-2', 'multi-agent-3'].every(id =>
            statusUpdates.get(id)?.includes('offline')
          )

          if (allDisconnected) {
            expect(statusUpdates.size).toBe(3)
            statusUpdates.forEach((statuses, agentId) => {
              expect(statuses).toContain('online')
              expect(statuses).toContain('offline')
            })

            dashboard.close()
            resolve()
          }
        }
      })

      dashboard.on('error', reject)

      setTimeout(() => {
        dashboard.close()
        agents.forEach(a => a.close())
        reject(new Error('Timeout'))
      }, 5000)
    })
  })

  it('should send current agent list to newly connected dashboard', async () => {
    return new Promise<void>((resolve, reject) => {
      // First connect an agent
      const agentWs = new WebSocket(`${serverUrl}/ws/agent?agentId=existing-agent&agentType=claude`)

      agentWs.on('open', () => {
        // Now connect a dashboard
        setTimeout(() => {
          const dashboard = new WebSocket(`${serverUrl}/ws/dashboard`)

          dashboard.on('open', () => {
            const connectMsg: DashboardConnectMessage = createMessage('dashboard:connect', {
              token: validToken,
              clientInfo: {
                userAgent: 'New Dashboard',
                timezone: 'UTC'
              }
            })
            dashboard.send(JSON.stringify(connectMsg))
          })

          dashboard.on('message', (data) => {
            const message = JSON.parse(data.toString())

            if (message.type === 'agent:list') {
              expect(isAgentList(message)).toBe(true)
              expect(message.payload.agents).toBeInstanceOf(Array)

              // Should include the existing agent
              const existingAgent = message.payload.agents.find(a => a.agentId === 'existing-agent')
              expect(existingAgent).toBeDefined()
              expect(existingAgent.status).toBe('online')
              expect(existingAgent.agentType).toBe('claude')

              dashboard.close()
              agentWs.close()
              resolve()
            }
          })

          dashboard.on('error', reject)
        }, 200)
      })

      agentWs.on('error', reject)

      setTimeout(() => {
        agentWs.close()
        reject(new Error('Timeout'))
      }, 5000)
    })
  })
})