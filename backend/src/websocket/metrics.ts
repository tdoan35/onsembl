import { WebSocket } from 'ws';
import type { WebSocketMessage } from '@onsembl/agent-protocol/websocket';

export interface MetricsSample {
  timestamp: number;
  value: number;
}

export interface ConnectionMetrics {
  connectionId: string;
  connectedAt: number;
  messagesReceived: number;
  messagesSent: number;
  bytesReceived: number;
  bytesSent: number;
  latencySamples: MetricsSample[];
  errorCount: number;
  lastActivity: number;
}

export interface AggregatedMetrics {
  connections: {
    active: number;
    total: number;
    peak: number;
  };
  messages: {
    received: number;
    sent: number;
    perSecond: number;
    perMinute: number;
  };
  bandwidth: {
    bytesReceived: number;
    bytesSent: number;
    receivedPerSecond: number;
    sentPerSecond: number;
  };
  latency: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  errors: {
    total: number;
    rate: number;
  };
  messageTypes: Record<string, number>;
}

export class WebSocketMetrics {
  private connections = new Map<WebSocket, ConnectionMetrics>();
  private globalMetrics = {
    totalConnections: 0,
    peakConnections: 0,
    totalMessagesReceived: 0,
    totalMessagesSent: 0,
    totalBytesReceived: 0,
    totalBytesSent: 0,
    totalErrors: 0,
    messageTypes: new Map<string, number>(),
    startTime: Date.now()
  };

  private samplingInterval = 1000; // 1 second
  private maxSamples = 300; // Keep 5 minutes of samples
  private recentMessages: MetricsSample[] = [];
  private recentBandwidth: {
    received: MetricsSample[];
    sent: MetricsSample[];
  } = { received: [], sent: [] };

  private metricsTimer?: NodeJS.Timer;

  constructor() {
    // Start metrics collection
    this.startMetricsCollection();
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.collectPeriodicMetrics();
    }, this.samplingInterval);
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }
  }

  /**
   * Track new WebSocket connection
   */
  trackConnection(socket: WebSocket, connectionId: string): void {
    const metrics: ConnectionMetrics = {
      connectionId,
      connectedAt: Date.now(),
      messagesReceived: 0,
      messagesSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      latencySamples: [],
      errorCount: 0,
      lastActivity: Date.now()
    };

    this.connections.set(socket, metrics);
    this.globalMetrics.totalConnections++;

    // Update peak connections
    const activeCount = this.connections.size;
    if (activeCount > this.globalMetrics.peakConnections) {
      this.globalMetrics.peakConnections = activeCount;
    }

    // Clean up on disconnect
    socket.on('close', () => {
      this.connections.delete(socket);
    });
  }

  /**
   * Track incoming message
   */
  trackIncomingMessage(socket: WebSocket, message: WebSocketMessage, size: number): void {
    const metrics = this.connections.get(socket);
    if (!metrics) return;

    metrics.messagesReceived++;
    metrics.bytesReceived += size;
    metrics.lastActivity = Date.now();

    this.globalMetrics.totalMessagesReceived++;
    this.globalMetrics.totalBytesReceived += size;

    // Track message type
    const typeCount = this.globalMetrics.messageTypes.get(message.type) || 0;
    this.globalMetrics.messageTypes.set(message.type, typeCount + 1);

    // Track latency for ping/pong
    if (message.type === 'heartbeat:pong' && (message as any).timestamp) {
      const latency = Date.now() - new Date((message as any).timestamp).getTime();
      this.trackLatency(metrics, latency);
    }
  }

  /**
   * Track outgoing message
   */
  trackOutgoingMessage(socket: WebSocket, message: WebSocketMessage, size: number): void {
    const metrics = this.connections.get(socket);
    if (!metrics) return;

    metrics.messagesSent++;
    metrics.bytesSent += size;

    this.globalMetrics.totalMessagesSent++;
    this.globalMetrics.totalBytesSent += size;
  }

  /**
   * Track error
   */
  trackError(socket: WebSocket | null): void {
    if (socket) {
      const metrics = this.connections.get(socket);
      if (metrics) {
        metrics.errorCount++;
      }
    }
    this.globalMetrics.totalErrors++;
  }

  /**
   * Track latency sample
   */
  private trackLatency(metrics: ConnectionMetrics, latency: number): void {
    metrics.latencySamples.push({
      timestamp: Date.now(),
      value: latency
    });

    // Keep only recent samples
    if (metrics.latencySamples.length > this.maxSamples) {
      metrics.latencySamples.shift();
    }
  }

  /**
   * Collect periodic metrics
   */
  private collectPeriodicMetrics(): void {
    const now = Date.now();

    // Calculate message rate
    const recentMessageCount = this.globalMetrics.totalMessagesReceived + 
                               this.globalMetrics.totalMessagesSent;
    
    this.recentMessages.push({
      timestamp: now,
      value: recentMessageCount
    });

    if (this.recentMessages.length > this.maxSamples) {
      this.recentMessages.shift();
    }

    // Calculate bandwidth
    this.recentBandwidth.received.push({
      timestamp: now,
      value: this.globalMetrics.totalBytesReceived
    });

    this.recentBandwidth.sent.push({
      timestamp: now,
      value: this.globalMetrics.totalBytesSent
    });

    if (this.recentBandwidth.received.length > this.maxSamples) {
      this.recentBandwidth.received.shift();
      this.recentBandwidth.sent.shift();
    }
  }

  /**
   * Get metrics for a specific connection
   */
  getConnectionMetrics(socket: WebSocket): ConnectionMetrics | null {
    return this.connections.get(socket) || null;
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(): AggregatedMetrics {
    const now = Date.now();
    const uptime = (now - this.globalMetrics.startTime) / 1000; // seconds

    // Calculate message rates
    const messagePerSecond = this.calculateRate(this.recentMessages, 1000);
    const messagePerMinute = this.calculateRate(this.recentMessages, 60000);

    // Calculate bandwidth rates
    const bytesReceivedPerSecond = this.calculateRate(this.recentBandwidth.received, 1000);
    const bytesSentPerSecond = this.calculateRate(this.recentBandwidth.sent, 1000);

    // Calculate latency stats
    const latencyStats = this.calculateLatencyStats();

    // Convert message types map to object
    const messageTypes: Record<string, number> = {};
    for (const [type, count] of this.globalMetrics.messageTypes.entries()) {
      messageTypes[type] = count;
    }

    return {
      connections: {
        active: this.connections.size,
        total: this.globalMetrics.totalConnections,
        peak: this.globalMetrics.peakConnections
      },
      messages: {
        received: this.globalMetrics.totalMessagesReceived,
        sent: this.globalMetrics.totalMessagesSent,
        perSecond: messagePerSecond,
        perMinute: messagePerMinute
      },
      bandwidth: {
        bytesReceived: this.globalMetrics.totalBytesReceived,
        bytesSent: this.globalMetrics.totalBytesSent,
        receivedPerSecond: bytesReceivedPerSecond,
        sentPerSecond: bytesSentPerSecond
      },
      latency: latencyStats,
      errors: {
        total: this.globalMetrics.totalErrors,
        rate: uptime > 0 ? this.globalMetrics.totalErrors / uptime : 0
      },
      messageTypes
    };
  }

  /**
   * Calculate rate from samples
   */
  private calculateRate(samples: MetricsSample[], window: number): number {
    if (samples.length < 2) return 0;

    const now = Date.now();
    const windowStart = now - window;

    // Find samples within window
    const recentSamples = samples.filter(s => s.timestamp >= windowStart);
    if (recentSamples.length < 2) return 0;

    const first = recentSamples[0];
    const last = recentSamples[recentSamples.length - 1];
    const timeDiff = (last.timestamp - first.timestamp) / 1000; // seconds

    if (timeDiff === 0) return 0;

    const valueDiff = last.value - first.value;
    return valueDiff / timeDiff;
  }

  /**
   * Calculate latency statistics
   */
  private calculateLatencyStats(): AggregatedMetrics['latency'] {
    const allLatencies: number[] = [];

    for (const metrics of this.connections.values()) {
      const recentLatencies = metrics.latencySamples
        .filter(s => s.timestamp > Date.now() - 60000) // Last minute
        .map(s => s.value);
      allLatencies.push(...recentLatencies);
    }

    if (allLatencies.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    }

    allLatencies.sort((a, b) => a - b);

    return {
      min: allLatencies[0],
      max: allLatencies[allLatencies.length - 1],
      avg: allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length,
      p50: this.percentile(allLatencies, 0.5),
      p95: this.percentile(allLatencies, 0.95),
      p99: this.percentile(allLatencies, 0.99)
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Export metrics for monitoring systems
   */
  exportPrometheus(): string {
    const metrics = this.getAggregatedMetrics();
    const lines: string[] = [];

    // Connection metrics
    lines.push(`# HELP websocket_connections_active Active WebSocket connections`);
    lines.push(`# TYPE websocket_connections_active gauge`);
    lines.push(`websocket_connections_active ${metrics.connections.active}`);

    lines.push(`# HELP websocket_connections_total Total WebSocket connections`);
    lines.push(`# TYPE websocket_connections_total counter`);
    lines.push(`websocket_connections_total ${metrics.connections.total}`);

    // Message metrics
    lines.push(`# HELP websocket_messages_total Total WebSocket messages`);
    lines.push(`# TYPE websocket_messages_total counter`);
    lines.push(`websocket_messages_total{direction="received"} ${metrics.messages.received}`);
    lines.push(`websocket_messages_total{direction="sent"} ${metrics.messages.sent}`);

    // Bandwidth metrics
    lines.push(`# HELP websocket_bytes_total Total bytes transferred`);
    lines.push(`# TYPE websocket_bytes_total counter`);
    lines.push(`websocket_bytes_total{direction="received"} ${metrics.bandwidth.bytesReceived}`);
    lines.push(`websocket_bytes_total{direction="sent"} ${metrics.bandwidth.bytesSent}`);

    // Latency metrics
    lines.push(`# HELP websocket_latency_seconds WebSocket latency in seconds`);
    lines.push(`# TYPE websocket_latency_seconds summary`);
    lines.push(`websocket_latency_seconds{quantile="0.5"} ${metrics.latency.p50 / 1000}`);
    lines.push(`websocket_latency_seconds{quantile="0.95"} ${metrics.latency.p95 / 1000}`);
    lines.push(`websocket_latency_seconds{quantile="0.99"} ${metrics.latency.p99 / 1000}`);

    // Error metrics
    lines.push(`# HELP websocket_errors_total Total WebSocket errors`);
    lines.push(`# TYPE websocket_errors_total counter`);
    lines.push(`websocket_errors_total ${metrics.errors.total}`);

    return lines.join('\n');
  }
}

// Export singleton instance
export const wsMetrics = new WebSocketMetrics();
