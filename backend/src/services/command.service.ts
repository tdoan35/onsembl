import { createClient } from '@supabase/supabase-js';
import { FastifyInstance } from 'fastify';
import { Database } from '../types/database';
import { CommandModel, Command, CommandInsert } from '../models/command';
import { EventEmitter } from 'events';

export interface CommandServiceEvents {
  'command:created': (command: Command) => void;
  'command:started': (command: Command) => void;
  'command:completed': (command: Command) => void;
  'command:failed': (command: Command, error: string) => void;
  'command:cancelled': (command: Command) => void;
  'terminal:output': (commandId: string, output: any) => void;
  'trace:added': (commandId: string, trace: any) => void;
}

export class CommandService extends EventEmitter {
  private commandModel: CommandModel;
  private terminalOutputs: Map<string, any[]>;
  private traceEntries: Map<string, any[]>;

  constructor(
    private supabase: ReturnType<typeof createClient<Database>>,
    private fastify: FastifyInstance
  ) {
    super();
    this.commandModel = new CommandModel(supabase);
    this.terminalOutputs = new Map();
    this.traceEntries = new Map();
  }

  async createCommand(agentId: string, data: Partial<CommandInsert>) {
    const command = await this.commandModel.create({
      agent_id: agentId,
      command: data.command!,
      arguments: data.arguments || {},
      priority: data.priority || 1,
      status: 'pending',
    });

    this.emit('command:created', command);
    this.fastify.log.info({ commandId: command.id, agentId }, 'Command created');

    return command;
  }

  async getCommand(id: string) {
    return this.commandModel.findById(id);
  }

  async getCommands(filters?: any) {
    return this.commandModel.findAll(filters);
  }

  async updateCommandStatus(commandId: string, status: Command['status'], metadata?: any) {
    const command = await this.commandModel.updateStatus(commandId, status);

    switch (status) {
      case 'executing':
        this.emit('command:started', command);
        break;
      case 'completed':
        this.emit('command:completed', command);
        break;
      case 'failed':
        this.emit('command:failed', command, metadata?.error || 'Unknown error');
        break;
      case 'cancelled':
        this.emit('command:cancelled', command);
        break;
    }

    this.fastify.log.info({ commandId, status }, 'Command status updated');
    return command;
  }

  async completeCommand(commandId: string, data: {
    status: Command['status'];
    exitCode?: number;
    result?: any;
    error?: string;
    duration?: number;
    startedAt?: string;
    completedAt?: string;
  }) {
    const command = await this.commandModel.update(commandId, {
      status: data.status,
      result: data.result,
      error: data.error,
      started_at: data.startedAt,
      completed_at: data.completedAt || new Date().toISOString(),
    });

    // Store terminal outputs to database
    const outputs = this.terminalOutputs.get(commandId);
    if (outputs && outputs.length > 0) {
      await this.saveTerminalOutputs(commandId, outputs);
    }

    // Store trace entries to database
    const traces = this.traceEntries.get(commandId);
    if (traces && traces.length > 0) {
      await this.saveTraceEntries(commandId, traces);
    }

    // Clean up memory
    this.terminalOutputs.delete(commandId);
    this.traceEntries.delete(commandId);

    if (data.status === 'completed') {
      this.emit('command:completed', command);
    } else if (data.status === 'failed') {
      this.emit('command:failed', command, data.error || 'Unknown error');
    }

    return command;
  }

  async cancelCommand(commandId: string, reason?: string) {
    const command = await this.commandModel.updateStatus(
      commandId,
      'cancelled',
      null,
      reason || 'User cancelled'
    );

    this.emit('command:cancelled', command);
    this.fastify.log.info({ commandId, reason }, 'Command cancelled');

    return command;
  }

  async appendTerminalOutput(commandId: string, output: {
    agentId: string;
    output: string;
    type: 'stdout' | 'stderr' | 'system';
    sequence: number;
    timestamp: string;
  }) {
    // Store in memory for batching
    if (!this.terminalOutputs.has(commandId)) {
      this.terminalOutputs.set(commandId, []);
    }

    this.terminalOutputs.get(commandId)!.push(output);

    // Emit event for real-time streaming
    this.emit('terminal:output', commandId, output);

    // Batch save every 10 outputs or on command completion
    const outputs = this.terminalOutputs.get(commandId)!;
    if (outputs.length >= 10) {
      await this.saveTerminalOutputs(commandId, outputs);
      this.terminalOutputs.set(commandId, []);
    }
  }

  async addTraceEntry(entry: {
    commandId: string;
    agentId: string;
    parentId?: string;
    type: string;
    content: any;
    metadata?: any;
  }) {
    // Store in memory for batching
    if (!this.traceEntries.has(entry.commandId)) {
      this.traceEntries.set(entry.commandId, []);
    }

    this.traceEntries.get(entry.commandId)!.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });

    // Emit event for real-time updates
    this.emit('trace:added', entry.commandId, entry);

    // Batch save every 5 entries or on command completion
    const traces = this.traceEntries.get(entry.commandId)!;
    if (traces.length >= 5) {
      await this.saveTraceEntries(entry.commandId, traces);
      this.traceEntries.set(entry.commandId, []);
    }
  }

  private async saveTerminalOutputs(commandId: string, outputs: any[]) {
    try {
      const { error } = await this.supabase
        .from('terminal_outputs')
        .insert(
          outputs.map((output) => ({
            command_id: commandId,
            agent_id: output.agentId,
            output: output.output,
            type: output.type,
            timestamp: output.timestamp,
            created_at: new Date().toISOString(),
          }))
        );

      if (error) throw error;

      this.fastify.log.debug(
        { commandId, count: outputs.length },
        'Terminal outputs saved'
      );
    } catch (error) {
      this.fastify.log.error(
        { error, commandId },
        'Failed to save terminal outputs'
      );
    }
  }

  private async saveTraceEntries(commandId: string, traces: any[]) {
    try {
      const { error } = await this.supabase
        .from('trace_entries')
        .insert(
          traces.map((trace) => ({
            command_id: commandId,
            agent_id: trace.agentId,
            parent_id: trace.parentId,
            type: trace.type,
            content: trace.content,
            metadata: trace.metadata,
            timestamp: trace.timestamp,
            created_at: new Date().toISOString(),
          }))
        );

      if (error) throw error;

      this.fastify.log.debug(
        { commandId, count: traces.length },
        'Trace entries saved'
      );
    } catch (error) {
      this.fastify.log.error(
        { error, commandId },
        'Failed to save trace entries'
      );
    }
  }

  async getTerminalOutput(commandId: string, limit = 100) {
    const { data, error } = await this.supabase
      .from('terminal_outputs')
      .select('*')
      .eq('command_id', commandId)
      .order('timestamp', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  async getTraceTree(commandId: string) {
    const { data, error } = await this.supabase
      .from('trace_entries')
      .select('*')
      .eq('command_id', commandId)
      .order('timestamp', { ascending: true });

    if (error) throw error;

    // Build tree structure
    const tree = this.buildTraceTree(data || []);
    return tree;
  }

  private buildTraceTree(entries: any[]) {
    const map = new Map();
    const roots: any[] = [];

    // First pass: create all nodes
    entries.forEach((entry) => {
      map.set(entry.id, {
        ...entry,
        children: [],
      });
    });

    // Second pass: build tree
    entries.forEach((entry) => {
      if (entry.parent_id) {
        const parent = map.get(entry.parent_id);
        if (parent) {
          parent.children.push(map.get(entry.id));
        }
      } else {
        roots.push(map.get(entry.id));
      }
    });

    return roots;
  }

  async getCommandStats(agentId?: string) {
    return this.commandModel.getCommandStats(agentId);
  }

  async getNextCommand(agentId: string) {
    return this.commandModel.getNextCommand(agentId);
  }

  async cleanup() {
    // Save any remaining outputs and traces
    for (const [commandId, outputs] of this.terminalOutputs.entries()) {
      if (outputs.length > 0) {
        await this.saveTerminalOutputs(commandId, outputs);
      }
    }

    for (const [commandId, traces] of this.traceEntries.entries()) {
      if (traces.length > 0) {
        await this.saveTraceEntries(commandId, traces);
      }
    }

    this.terminalOutputs.clear();
    this.traceEntries.clear();
  }
}