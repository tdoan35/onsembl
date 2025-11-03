/**
 * Terminal Stream Manager for Onsembl.ai
 * Handles real-time terminal output streaming with <200ms latency
 */

import { FastifyInstance } from 'fastify';
import { EventEmitter } from 'events';
import { createClient } from '@supabase/supabase-js';
import { MessageRouter } from './message-router.js';
import { TerminalOutputModel, TerminalOutputInsert } from '../models/terminal-output.js';
import { Database } from '../types/database.js';
import {
  TerminalOutputPayload,
  TerminalStreamPayload,
  StreamType
} from '../../../packages/agent-protocol/src/types.js';

export interface TerminalStreamConfig {
  bufferSize: number;
  flushIntervalMs: number;
  maxBufferedLines: number;
}

export interface TerminalSession {
  commandId: string;
  agentId: string;
  buffer: TerminalLine[];
  lastFlush: number;
  totalLines: number;
  totalBytes: number;
  isActive: boolean;
  startedAt: number;
  receivedSequences: Set<number>;  // Track received sequences for deduplication
}

export interface TerminalLine {
  content: string;
  streamType: StreamType;
  timestamp: number;
  sequence: number;
  ansiCodes?: string;    // Changed from boolean to string
  isBlank?: boolean;     // Added for blank line metadata
}

export interface StreamStats {
  activeSessions: number;
  totalLinesProcessed: number;
  totalBytesProcessed: number;
  averageLatency: number;
  flushesPerSecond: number;
  bufferUtilization: number;
}

export class TerminalStreamManager extends EventEmitter {
  private sessions = new Map<string, TerminalSession>();
  private flushTimer?: NodeJS.Timeout;
  private stats: StreamStats = {
    activeSessions: 0,
    totalLinesProcessed: 0,
    totalBytesProcessed: 0,
    averageLatency: 0,
    flushesPerSecond: 0,
    bufferUtilization: 0
  };

  private latencyHistory: number[] = [];
  private flushHistory: number[] = [];
  private terminalOutputModel?: TerminalOutputModel;

  constructor(
    private server: FastifyInstance,
    private messageRouter: MessageRouter,
    private config: TerminalStreamConfig,
    private supabaseClient?: ReturnType<typeof createClient<Database>>
  ) {
    super();

    // Initialize terminal output model if supabase client is provided
    if (supabaseClient) {
      this.terminalOutputModel = new TerminalOutputModel(supabaseClient);
      this.server.log.info('Terminal output model initialized with database persistence');
    } else {
      this.server.log.warn('Terminal output model NOT initialized - no Supabase client provided (output will not be persisted)');
    }
  }

  /**
   * Start terminal stream manager
   */
  start(): void {
    this.startFlushTimer();
    this.server.log.info({
      bufferSize: this.config.bufferSize,
      flushInterval: this.config.flushIntervalMs,
      maxBufferedLines: this.config.maxBufferedLines
    }, 'Terminal stream manager started');

    this.emit('started');
  }

  /**
   * Stop terminal stream manager
   */
  stop(): void {
    this.stopFlushTimer();

    // Flush all remaining buffers
    for (const session of this.sessions.values()) {
      if (session.buffer.length > 0) {
        this.flushSession(session);
      }
    }

    this.sessions.clear();
    this.server.log.info('Terminal stream manager stopped');
    this.emit('stopped');
  }

  /**
   * Process terminal output from agent
   */
  async processOutput(payload: TerminalOutputPayload): Promise<void> {
    const sessionKey = `${payload.commandId}-${payload.agentId}`;
    const now = Date.now();

    // Get or create session
    let session = this.sessions.get(sessionKey);
    if (!session) {
      session = this.createSession(payload.commandId, payload.agentId);
      this.sessions.set(sessionKey, session);
    }

    // Deduplication: Check if sequence was already received
    if (session.receivedSequences.has(payload.sequence)) {
      this.server.log.warn({
        commandId: payload.commandId,
        agentId: payload.agentId,
        sequence: payload.sequence
      }, 'Duplicate terminal output sequence detected - skipping');
      return;  // Skip duplicate
    }

    // Mark sequence as received
    session.receivedSequences.add(payload.sequence);

    // Log gap detection (for debugging out-of-order messages)
    const expectedSequence = session.totalLines;
    if (payload.sequence !== expectedSequence && expectedSequence > 0) {
      this.server.log.debug({
        commandId: payload.commandId,
        agentId: payload.agentId,
        expected: expectedSequence,
        received: payload.sequence,
        gap: payload.sequence - expectedSequence
      }, 'Out-of-order terminal output sequence detected');
    }

    // Create terminal line
    const line: TerminalLine = {
      content: payload.content,
      streamType: payload.streamType,
      timestamp: now,
      sequence: payload.sequence,
      ansiCodes: payload.ansiCodes,
      isBlank: payload.isBlank
    };

    // Add to buffer
    session.buffer.push(line);
    session.totalLines++;
    session.totalBytes += Buffer.byteLength(payload.content);

    // Update statistics
    this.stats.totalLinesProcessed++;
    this.stats.totalBytesProcessed += Buffer.byteLength(payload.content);

    this.server.log.debug({
      commandId: payload.commandId,
      agentId: payload.agentId,
      sequence: payload.sequence,
      streamType: payload.streamType,
      contentLength: payload.content.length,
      bufferSize: session.buffer.length
    }, 'Terminal output processed');

    // Check if buffer needs immediate flush
    if (this.shouldFlushImmediately(session)) {
      await this.flushSession(session);
    }

    // Emit processing event
    this.emit('outputProcessed', { sessionKey, line, bufferSize: session.buffer.length });
  }

  /**
   * End terminal session
   */
  endSession(commandId: string, agentId: string): void {
    const sessionKey = `${commandId}-${agentId}`;
    const session = this.sessions.get(sessionKey);

    if (session) {
      // Final flush
      if (session.buffer.length > 0) {
        this.flushSession(session);
      }

      session.isActive = false;

      this.server.log.info({
        commandId,
        agentId,
        duration: Date.now() - session.startedAt,
        totalLines: session.totalLines,
        totalBytes: session.totalBytes
      }, 'Terminal session ended');

      // Remove session after a delay to allow final processing
      setTimeout(() => {
        this.sessions.delete(sessionKey);
        this.updateStats();
      }, 5000);

      this.emit('sessionEnded', { commandId, agentId, session });
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): Map<string, TerminalSession> {
    const active = new Map<string, TerminalSession>();

    for (const [key, session] of this.sessions.entries()) {
      if (session.isActive) {
        active.set(key, { ...session, buffer: [...session.buffer] });
      }
    }

    return active;
  }

  /**
   * Get session statistics
   */
  getSessionStats(commandId: string, agentId: string): {
    totalLines: number;
    totalBytes: number;
    duration: number;
    averageLineLength: number;
    linesPerSecond: number;
  } | null {
    const sessionKey = `${commandId}-${agentId}`;
    const session = this.sessions.get(sessionKey);

    if (!session) {
      return null;
    }

    const duration = Date.now() - session.startedAt;

    return {
      totalLines: session.totalLines,
      totalBytes: session.totalBytes,
      duration,
      averageLineLength: session.totalLines > 0 ? session.totalBytes / session.totalLines : 0,
      linesPerSecond: duration > 0 ? (session.totalLines / duration) * 1000 : 0
    };
  }

  /**
   * Get stream statistics
   */
  getStats(): StreamStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Force flush all sessions
   */
  flushAll(): void {
    let flushedCount = 0;

    for (const session of this.sessions.values()) {
      if (session.buffer.length > 0) {
        this.flushSession(session);
        flushedCount++;
      }
    }

    this.server.log.debug({ flushedCount }, 'Forced flush of all sessions');
    this.emit('forceFlush', { flushedCount });
  }

  /**
   * Force flush specific session
   */
  flushSession(session: TerminalSession): void {
    if (session.buffer.length === 0) {
      return;
    }

    const startTime = Date.now();
    const lines = session.buffer.splice(0); // Clear buffer
    const flushLatency = startTime - session.lastFlush;

    // Create combined payload for streaming
    const combinedContent = lines.map(line => line.content).join('');
    // Collect all ANSI codes from lines that have them
    const ansiCodes = lines
      .map(line => line.ansiCodes)
      .filter(codes => codes !== undefined)
      .join('');

    const streamPayload: TerminalStreamPayload = {
      commandId: session.commandId,
      agentId: session.agentId,
      content: combinedContent,
      streamType: lines[0]?.streamType || 'STDOUT',
      ansiCodes: ansiCodes || undefined,  // Changed from boolean to string
      timestamp: startTime,
      sequence: lines[0]?.sequence,        // Include first sequence for reference
      isBlank: lines.every(line => line.isBlank)  // All lines blank
    };

    // Stream to dashboards via message router
    this.messageRouter.streamTerminalOutput(streamPayload);

    // Persist to database asynchronously (non-blocking)
    this.persistToDatabase(session, lines).catch(error => {
      this.server.log.error({
        commandId: session.commandId,
        agentId: session.agentId,
        error: error.message,
        linesCount: lines.length
      }, 'Failed to persist terminal output to database');
    });

    // Update session
    session.lastFlush = startTime;

    // Update latency tracking
    this.updateLatencyHistory(flushLatency);

    this.server.log.debug({
      commandId: session.commandId,
      agentId: session.agentId,
      linesCount: lines.length,
      contentLength: combinedContent.length,
      flushLatency
    }, 'Terminal session flushed');

    this.emit('sessionFlushed', {
      session,
      linesCount: lines.length,
      contentLength: combinedContent.length,
      latency: flushLatency
    });
  }

  /**
   * Create new terminal session
   */
  private createSession(commandId: string, agentId: string): TerminalSession {
    const session: TerminalSession = {
      commandId,
      agentId,
      buffer: [],
      lastFlush: Date.now(),
      totalLines: 0,
      totalBytes: 0,
      isActive: true,
      startedAt: Date.now(),
      receivedSequences: new Set<number>()  // Initialize deduplication tracking
    };

    this.server.log.debug({ commandId, agentId }, 'Terminal session created');
    this.emit('sessionCreated', { commandId, agentId });

    return session;
  }

  /**
   * Check if session should be flushed immediately
   */
  private shouldFlushImmediately(session: TerminalSession): boolean {
    const now = Date.now();

    // Flush if buffer is full
    if (session.buffer.length >= this.config.maxBufferedLines) {
      return true;
    }

    // Flush if buffer size exceeds configured limit
    const bufferSize = session.buffer.reduce((size, line) =>
      size + Buffer.byteLength(line.content), 0);
    if (bufferSize >= this.config.bufferSize) {
      return true;
    }

    // Flush if too much time has passed since last flush
    if (now - session.lastFlush >= this.config.flushIntervalMs * 2) {
      return true;
    }

    // Flush if we have stderr content (errors should be streamed immediately)
    if (session.buffer.some(line => line.streamType === 'STDERR')) {
      return true;
    }

    return false;
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.processFlushCycle();
    }, this.config.flushIntervalMs);
  }

  /**
   * Stop flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * Process flush cycle
   */
  private processFlushCycle(): void {
    const now = Date.now();
    let flushedSessions = 0;

    for (const session of this.sessions.values()) {
      if (!session.isActive || session.buffer.length === 0) {
        continue;
      }

      // Flush if interval has passed
      if (now - session.lastFlush >= this.config.flushIntervalMs) {
        this.flushSession(session);
        flushedSessions++;
      }
    }

    // Update flush rate tracking
    this.flushHistory.push(flushedSessions);
    if (this.flushHistory.length > 60) { // Keep last 60 cycles (1 minute)
      this.flushHistory.shift();
    }

    if (flushedSessions > 0) {
      this.server.log.debug({ flushedSessions }, 'Flush cycle completed');
    }
  }

  /**
   * Update latency history
   */
  private updateLatencyHistory(latency: number): void {
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > 100) {
      this.latencyHistory.shift();
    }
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    // Count active sessions
    this.stats.activeSessions = Array.from(this.sessions.values())
      .filter(session => session.isActive).length;

    // Calculate average latency
    if (this.latencyHistory.length > 0) {
      this.stats.averageLatency = this.latencyHistory
        .reduce((sum, lat) => sum + lat, 0) / this.latencyHistory.length;
    }

    // Calculate flushes per second
    if (this.flushHistory.length > 0) {
      const totalFlushes = this.flushHistory.reduce((sum, count) => sum + count, 0);
      this.stats.flushesPerSecond = totalFlushes / this.flushHistory.length;
    }

    // Calculate buffer utilization
    let totalBufferUsed = 0;
    let totalPossibleBuffer = 0;

    for (const session of this.sessions.values()) {
      totalBufferUsed += session.buffer.length;
      totalPossibleBuffer += this.config.maxBufferedLines;
    }

    this.stats.bufferUtilization = totalPossibleBuffer > 0 ?
      (totalBufferUsed / totalPossibleBuffer) * 100 : 0;
  }

  /**
   * Get buffer status for monitoring
   */
  getBufferStatus(): {
    sessionId: string;
    commandId: string;
    agentId: string;
    bufferLines: number;
    bufferBytes: number;
    lastFlush: number;
    isActive: boolean;
  }[] {
    const status: any[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const bufferBytes = session.buffer.reduce((size, line) =>
        size + Buffer.byteLength(line.content), 0);

      status.push({
        sessionId,
        commandId: session.commandId,
        agentId: session.agentId,
        bufferLines: session.buffer.length,
        bufferBytes,
        lastFlush: session.lastFlush,
        isActive: session.isActive
      });
    }

    return status;
  }

  /**
   * Clear old inactive sessions
   */
  clearOldSessions(maxAge: number = 300000): number {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [sessionKey, session] of this.sessions.entries()) {
      if (!session.isActive && (now - session.lastFlush > maxAge)) {
        toRemove.push(sessionKey);
      }
    }

    toRemove.forEach(sessionKey => {
      this.sessions.delete(sessionKey);
    });

    if (toRemove.length > 0) {
      this.server.log.info({ removedCount: toRemove.length }, 'Cleared old terminal sessions');
    }

    return toRemove.length;
  }

  /**
   * Persist terminal output lines to database
   * @param session Terminal session
   * @param lines Terminal lines to persist
   */
  private async persistToDatabase(
    session: TerminalSession,
    lines: TerminalLine[]
  ): Promise<void> {
    // Skip if no terminal output model is available
    if (!this.terminalOutputModel) {
      this.server.log.warn({
        commandId: session.commandId,
        agentId: session.agentId,
        linesCount: lines.length
      }, 'Terminal output model not available, skipping database persistence');
      return;
    }

    if (lines.length === 0) {
      return;
    }

    this.server.log.info({
      commandId: session.commandId,
      agentId: session.agentId,
      linesCount: lines.length
    }, 'Attempting to persist terminal output to database');

    try {
      // Convert terminal lines to database format
      const terminalOutputs: Omit<TerminalOutputInsert, 'id' | 'created_at'>[] = lines.map(line => {
        // Convert StreamType to database type
        const type: 'stdout' | 'stderr' = line.streamType === 'STDERR' ? 'stderr' : 'stdout';

        // Handle command_id: For agent monitoring output, commandId might be a session key like "agent-session-{uuid}"
        // Extract the actual agent UUID, or use a null command_id for monitoring output
        let command_id: string | null = session.commandId;

        // If commandId looks like a monitoring session key, it's not a real command
        // Set command_id to NULL (monitoring output is not tied to a specific command)
        if (!command_id || command_id.startsWith('agent-session-')) {
          // For monitoring output without a command, use NULL
          command_id = null;
        }

        return {
          command_id,
          agent_id: session.agentId,
          type,
          output: line.content,
          timestamp: new Date(line.timestamp).toISOString(),
          sequence: line.sequence,         // Include sequence for deduplication
          is_blank: line.isBlank || false  // Include blank line metadata
        };
      });

      this.server.log.debug({
        commandId: session.commandId,
        agentId: session.agentId,
        sampleOutput: terminalOutputs[0]
      }, 'Calling terminalOutputModel.createBatch with data');

      // Batch insert for performance
      const result = await this.terminalOutputModel.createBatch(terminalOutputs);

      this.server.log.info({
        commandId: session.commandId,
        agentId: session.agentId,
        linesCount: lines.length,
        rowsInserted: result.length
      }, 'Terminal output successfully persisted to database');
    } catch (error) {
      this.server.log.error({
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        commandId: session.commandId,
        agentId: session.agentId
      }, 'Database persistence failed');

      // Rethrow to be caught by caller
      throw new Error(`Database persistence failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}