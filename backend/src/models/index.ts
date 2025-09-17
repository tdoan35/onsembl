/**
 * Models Export Index
 *
 * Centralized exports for all Onsembl.ai Agent Control Center models
 */

// Agent Model
export {
  AgentModel,
  AgentSchema,
  AgentError,
  AgentNotFoundError,
  AgentValidationError,
  LegacyStatusMap,
  LegacyTypeMap,
} from './agent';

export type {
  Agent,
  AgentType,
  AgentStatus,
  AgentInsert,
  AgentUpdate,
  AgentRow,
  AgentMetadata,
  AgentChangeCallback,
} from './agent';

// Command Model
export {
  CommandModel,
  CommandSchema,
  CommandNotFoundError,
  CommandValidationError,
  CommandOperationError,
} from './command';

export type {
  Command,
  CommandType,
  CommandStatus,
  CommandRow,
  CommandInsert,
  CommandUpdate,
} from './command';

// Terminal Output Model
export {
  TerminalOutputModel,
  TerminalOutputSchema,
  TerminalOutputError,
  TerminalOutputNotFoundError,
  TerminalOutputValidationError,
  TerminalOutputChunkingError,
} from './terminal-output';

export type {
  TerminalOutput,
  TerminalOutputType,
  TerminalOutputRow,
  TerminalOutputInsert,
  TerminalOutputUpdate,
  TerminalOutputMetadata,
  TerminalOutputChangeCallback,
} from './terminal-output';

// CommandPreset Model
export {
  CommandPresetModel,
  CommandPresetSchema,
  VariableDefinitionSchema,
  CommandPresetError,
  CommandPresetNotFoundError,
  CommandPresetValidationError,
  TemplateExecutionError,
} from './command-preset';

export type {
  CommandPreset,
  CommandPresetType,
  VariableDefinition,
  CommandPresetRow,
  CommandPresetInsert,
  CommandPresetUpdate,
  TemplateExecutionContext,
  CommandPresetChangeCallback,
} from './command-preset';

// TraceEntry Model
export {
  TraceEntryModel,
  TraceEntrySchema,
  TraceEntryNotFoundError,
  TraceEntryValidationError,
  TraceEntryOperationError,
  TraceTreeBuildError,
} from './trace-entry';

export type {
  TraceEntry,
  TraceEntryType,
  TraceEntryRow,
  TraceEntryInsert,
  TraceEntryUpdate,
  TraceTreeNode,
  TraceMetrics,
} from './trace-entry';

// InvestigationReport Model
export {
  InvestigationReportModel,
  InvestigationReportSchema,
  ReportSectionSchema,
  ReportFindingSchema,
  ReportRecommendationSchema,
  InvestigationReportError,
  InvestigationReportNotFoundError,
  InvestigationReportValidationError,
  InvestigationReportOperationError,
} from './investigation-report';

export type {
  InvestigationReport,
  InvestigationReportStatus,
  ReportSection,
  ReportFinding,
  ReportRecommendation,
  InvestigationReportRow,
  InvestigationReportInsert,
  InvestigationReportUpdate,
} from './investigation-report';

// AuditLog Model
export {
  AuditLogModel,
  AuditLogSchema,
  AuditLogError,
  AuditLogNotFoundError,
  AuditLogValidationError,
  AuditLogOperationError,
} from './audit-log';

export type {
  AuditLog,
  AuditEventType,
  AuditEntityType,
  AuditLogEntry,
  AuditLogFilters,
  AuditLogRow,
  AuditLogInsert,
  AuditLogUpdate,
} from './audit-log';

// CommandQueue Model
export {
  CommandQueueModel,
  CommandQueueSchema,
  CommandQueueError,
  CommandQueueNotFoundError,
  CommandQueueValidationError,
  CommandQueueOperationError,
} from './command-queue';

export type {
  CommandQueue,
  QueueStatus,
  CommandQueueRow,
  CommandQueueInsert,
  CommandQueueUpdate,
  QueueItemWithCommand,
  QueueChangeCallback,
} from './command-queue';