/**
 * Contract test for terminal:output streaming
 * Tests real-time terminal output streaming via WebSocket
 */

import Fastify, { FastifyInstance } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import WebSocket from 'ws'
import {
  DashboardConnectMessage,
  CommandRequestMessage,
  TerminalOutputMessage,
  CommandStatusUpdateMessage,
  createMessage,
  isTerminalOutput,
  isCommandStatusUpdate
} from '@onsembl/agent-protocol/websocket-messages'

describe('Terminal Output Streaming Contract', () => {
  let server: FastifyInstance
  let serverUrl: string
  const validToken = 'valid-test-token'

  beforeAll(async () => {
    server = Fastify({ logger: false })
    await server.register(fastifyWebsocket)

    const activeCommands = new Map<string, { agentId: string; status: string }>()

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
                features: ['terminal-streaming']
              })))

              // Send agent list
              socket.send(JSON.stringify(createMessage('agent:list', {
                agents: [{
                  agentId: 'agent-1',
                  agentType: 'claude',
                  status: 'online',
                  connectedAt: Date.now() - 3600000,
                  lastActivity: Date.now()
                }]
              })))
            } else if (message.type === 'command:request' && authenticated) {
              const { agentId, command } = message.payload
              const commandId = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

              activeCommands.set(commandId, { agentId, status: 'queued' })

              // Send queued status
              socket.send(JSON.stringify(createMessage('command:status', {
                commandId,
                agentId,
                status: 'queued'
              })))

              // Start execution
              setTimeout(() => {
                activeCommands.set(commandId, { agentId, status: 'running' })

                // Send running status
                socket.send(JSON.stringify(createMessage('command:status', {
                  commandId,
                  agentId,
                  status: 'running'
                })))

                // Simulate terminal output
                if (command.includes('echo')) {
                  // Simple echo command
                  const output = command.replace('echo ', '') + '\n'
                  const outputMessage: TerminalOutputMessage = createMessage('terminal:output', {
                    commandId,
                    agentId,
                    data: output,
                    stream: 'stdout',
                    sequence: 1
                  })
                  socket.send(JSON.stringify(outputMessage))
                } else if (command.includes('multiline')) {
                  // Multi-line output
                  const lines = [
                    'Line 1: Starting execution',
                    'Line 2: Processing data',
                    'Line 3: Analyzing results',
                    'Line 4: Generating report',
                    'Line 5: Execution complete'
                  ]

                  lines.forEach((line, index) => {
                    setTimeout(() => {
                      const outputMessage: TerminalOutputMessage = createMessage('terminal:output', {
                        commandId,
                        agentId,
                        data: line + '\n',
                        stream: 'stdout',
                        sequence: index + 1
                      })
                      socket.send(JSON.stringify(outputMessage))
                    }, 50 * index)
                  })
                } else if (command.includes('error')) {
                  // Error output
                  const errorMessage: TerminalOutputMessage = createMessage('terminal:output', {
                    commandId,
                    agentId,
                    data: 'Error: Command failed\n',
                    stream: 'stderr',
                    sequence: 1
                  })
                  socket.send(JSON.stringify(errorMessage))
                } else if (command.includes('mixed')) {
                  // Mixed stdout and stderr
                  const outputs = [
                    { data: 'Starting process...\n', stream: 'stdout' as const, sequence: 1 },
                    { data: 'Warning: Low memory\n', stream: 'stderr' as const, sequence: 2 },
                    { data: 'Process running...\n', stream: 'stdout' as const, sequence: 3 },
                    { data: 'Error: Resource unavailable\n', stream: 'stderr' as const, sequence: 4 },
                    { data: 'Process completed with warnings\n', stream: 'stdout' as const, sequence: 5 }
                  ]

                  outputs.forEach((output, index) => {
                    setTimeout(() => {
                      const outputMessage: TerminalOutputMessage = createMessage('terminal:output', {
                        commandId,
                        agentId,
                        data: output.data,
                        stream: output.stream,
                        sequence: output.sequence
                      })
                      socket.send(JSON.stringify(outputMessage))
                    }, 30 * index)
                  })
                } else if (command.includes('large')) {
                  // Large output (simulating compression)
                  const largeData = 'x'.repeat(10000) // 10KB
                  const outputMessage: TerminalOutputMessage = createMessage('terminal:output', {
                    commandId,
                    agentId,
                    data: Buffer.from(largeData).toString('base64'),
                    stream: 'stdout',
                    sequence: 1,
                    isCompressed: true
                  })
                  socket.send(JSON.stringify(outputMessage))
                }

                // Send completion after outputs
                setTimeout(() => {
                  activeCommands.set(commandId, { agentId, status: 'completed' })

                  socket.send(JSON.stringify(createMessage('command:status', {
                    commandId,
                    agentId,
                    status: 'completed',
                    exitCode: command.includes('error') ? 1 : 0,
                    executionTime: 300
                  })))
                }, 500)
              }, 100)
            }
          } catch (error) {
            // Handle error
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

  it('should stream terminal output for simple command', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      const outputs: string[] = []

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
            agentId: 'agent-1',
            command: 'echo "Hello WebSocket"',
            priority: 'normal'
          })
          ws.send(JSON.stringify(commandRequest))
        }

        if (message.type === 'terminal:output') {
          expect(isTerminalOutput(message)).toBe(true)
          expect(message.payload.stream).toBe('stdout')
          expect(message.payload.sequence).toBe(1)
          expect(message.payload.data).toBe('"Hello WebSocket"\n')
          outputs.push(message.payload.data)
        }

        if (message.type === 'command:status' && message.payload.status === 'completed') {
          expect(outputs).toHaveLength(1)
          expect(outputs[0]).toBe('"Hello WebSocket"\n')
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

  it('should stream multi-line terminal output with sequence numbers', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      const outputs: Array<{ data: string; sequence: number }> = []

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
            agentId: 'agent-1',
            command: 'multiline output test',
            priority: 'normal'
          })
          ws.send(JSON.stringify(commandRequest))
        }

        if (message.type === 'terminal:output') {
          expect(isTerminalOutput(message)).toBe(true)
          outputs.push({
            data: message.payload.data,
            sequence: message.payload.sequence
          })
        }

        if (message.type === 'command:status' && message.payload.status === 'completed') {
          expect(outputs).toHaveLength(5)

          // Check sequence numbers
          outputs.forEach((output, index) => {
            expect(output.sequence).toBe(index + 1)
            expect(output.data).toContain(`Line ${index + 1}`)
          })

          // Check ordering
          for (let i = 1; i < outputs.length; i++) {
            expect(outputs[i].sequence).toBeGreaterThan(outputs[i - 1].sequence)
          }

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

  it('should stream stderr output separately', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      let stderrReceived = false

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
            agentId: 'agent-1',
            command: 'error command test',
            priority: 'normal'
          })
          ws.send(JSON.stringify(commandRequest))
        }

        if (message.type === 'terminal:output') {
          expect(isTerminalOutput(message)).toBe(true)
          expect(message.payload.stream).toBe('stderr')
          expect(message.payload.data).toContain('Error')
          stderrReceived = true
        }

        if (message.type === 'command:status' && message.payload.status === 'completed') {
          expect(stderrReceived).toBe(true)
          expect(message.payload.exitCode).toBe(1) // Error exit code
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

  it('should handle mixed stdout and stderr streams', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      const outputs: Array<{ stream: string; data: string; sequence: number }> = []

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
            agentId: 'agent-1',
            command: 'mixed output streams',
            priority: 'normal'
          })
          ws.send(JSON.stringify(commandRequest))
        }

        if (message.type === 'terminal:output') {
          outputs.push({
            stream: message.payload.stream,
            data: message.payload.data,
            sequence: message.payload.sequence
          })
        }

        if (message.type === 'command:status' && message.payload.status === 'completed') {
          expect(outputs).toHaveLength(5)

          // Check we have both stdout and stderr
          const stdoutCount = outputs.filter(o => o.stream === 'stdout').length
          const stderrCount = outputs.filter(o => o.stream === 'stderr').length
          expect(stdoutCount).toBe(3)
          expect(stderrCount).toBe(2)

          // Check sequence is maintained
          for (let i = 1; i < outputs.length; i++) {
            expect(outputs[i].sequence).toBeGreaterThan(outputs[i - 1].sequence)
          }

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

  it('should handle compressed large output', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)

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
            agentId: 'agent-1',
            command: 'large output test',
            priority: 'normal'
          })
          ws.send(JSON.stringify(commandRequest))
        }

        if (message.type === 'terminal:output') {
          expect(isTerminalOutput(message)).toBe(true)
          expect(message.payload.isCompressed).toBe(true)

          // Verify it's base64 encoded
          expect(() => {
            Buffer.from(message.payload.data, 'base64')
          }).not.toThrow()

          // Decode and verify size
          const decoded = Buffer.from(message.payload.data, 'base64').toString()
          expect(decoded.length).toBe(10000)
          expect(decoded).toBe('x'.repeat(10000))

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

  it('should maintain output order across multiple commands', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      const outputsByCommand = new Map<string, string[]>()
      let completedCommands = 0

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
          // Send multiple commands
          ['echo "Command 1"', 'echo "Command 2"', 'echo "Command 3"'].forEach(cmd => {
            const commandRequest: CommandRequestMessage = createMessage('command:request', {
              agentId: 'agent-1',
              command: cmd,
              priority: 'normal'
            })
            ws.send(JSON.stringify(commandRequest))
          })
        }

        if (message.type === 'terminal:output') {
          const commandId = message.payload.commandId
          if (!outputsByCommand.has(commandId)) {
            outputsByCommand.set(commandId, [])
          }
          outputsByCommand.get(commandId)!.push(message.payload.data)
        }

        if (message.type === 'command:status' && message.payload.status === 'completed') {
          completedCommands++

          if (completedCommands === 3) {
            // Verify each command has its own output
            expect(outputsByCommand.size).toBe(3)
            outputsByCommand.forEach((outputs, commandId) => {
              expect(outputs).toHaveLength(1)
              expect(outputs[0]).toMatch(/^"Command \d"\n$/)
            })

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

  it('should include all required fields in terminal output messages', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(serverUrl)

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
            agentId: 'agent-1',
            command: 'echo "Test"',
            priority: 'normal'
          })
          ws.send(JSON.stringify(commandRequest))
        }

        if (message.type === 'terminal:output') {
          // Verify all required fields
          expect(message.version).toBe('1.0.0')
          expect(message.type).toBe('terminal:output')
          expect(message.timestamp).toBeDefined()
          expect(typeof message.timestamp).toBe('number')
          expect(message.payload).toBeDefined()
          expect(message.payload.commandId).toBeDefined()
          expect(message.payload.agentId).toBe('agent-1')
          expect(message.payload.data).toBeDefined()
          expect(['stdout', 'stderr']).toContain(message.payload.stream)
          expect(message.payload.sequence).toBeGreaterThan(0)

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