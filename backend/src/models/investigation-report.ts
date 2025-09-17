/**
 * InvestigationReport Model for Onsembl.ai Agent Control Center
 *
 * Implementation of T074: InvestigationReport model with comprehensive CRUD operations
 *
 * Database Schema Requirements (Extended):
 * - id: uuid (primary key)
 * - command_id: uuid (foreign key to commands table)
 * - agent_id: uuid (foreign key to agents table)
 * - title: string
 * - summary: text
 * - status: DRAFT | IN_PROGRESS | COMPLETE
 * - sections: json (array of sections with title, content, order)
 * - findings: json (array with title, description, severity, evidence)
 * - recommendations: json (array with title, description, priority, actionItems)
 * - metadata: json
 * - created_at: timestamp
 * - updated_at: timestamp
 * - completed_at: timestamp
 *
 * Note: The current database schema in Database types has a simpler structure.
 * This model implements the extended schema requirements from T074.
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { z } from 'zod';

// Report status types
export type InvestigationReportStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETE';

// Section schema for structured report content
export const ReportSectionSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  order: z.number().int().min(0),
});

// Finding schema with severity levels
export const ReportFindingSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  evidence: z.array(z.string()).optional(),
});

// Recommendation schema with priority and action items
export const ReportRecommendationSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  actionItems: z.array(z.string()).optional(),
});

// Main InvestigationReport schema validation
export const InvestigationReportSchema = z.object({
  id: z.string().uuid().optional(),
  command_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  summary: z.string().min(1),
  status: z.enum(['DRAFT', 'IN_PROGRESS', 'COMPLETE']),
  sections: z.array(ReportSectionSchema).optional(),
  findings: z.array(ReportFindingSchema).optional(),
  recommendations: z.array(ReportRecommendationSchema).optional(),
  metadata: z.record(z.any()).optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
});

export type InvestigationReport = z.infer<typeof InvestigationReportSchema>;
export type ReportSection = z.infer<typeof ReportSectionSchema>;
export type ReportFinding = z.infer<typeof ReportFindingSchema>;
export type ReportRecommendation = z.infer<typeof ReportRecommendationSchema>;

// Database type interfaces based on extended schema
export interface InvestigationReportRow {
  id: string;
  command_id: string;
  agent_id: string;
  title: string;
  summary: string;
  status: InvestigationReportStatus;
  sections: ReportSection[] | null;
  findings: ReportFinding[] | null;
  recommendations: ReportRecommendation[] | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface InvestigationReportInsert {
  id?: string;
  command_id: string;
  agent_id: string;
  title: string;
  summary: string;
  status?: InvestigationReportStatus;
  sections?: ReportSection[] | null;
  findings?: ReportFinding[] | null;
  recommendations?: ReportRecommendation[] | null;
  metadata?: Record<string, any> | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}

export interface InvestigationReportUpdate {
  id?: string;
  command_id?: string;
  agent_id?: string;
  title?: string;
  summary?: string;
  status?: InvestigationReportStatus;
  sections?: ReportSection[] | null;
  findings?: ReportFinding[] | null;
  recommendations?: ReportRecommendation[] | null;
  metadata?: Record<string, any> | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}

// Custom error types for better error handling
export class InvestigationReportError extends Error {
  constructor(
    message: string,
    public code: string,
    public reportId?: string
  ) {
    super(message);
    this.name = 'InvestigationReportError';
  }
}

export class InvestigationReportNotFoundError extends InvestigationReportError {
  constructor(id: string) {
    super(`Investigation report with id ${id} not found`, 'REPORT_NOT_FOUND', id);
  }
}

export class InvestigationReportValidationError extends InvestigationReportError {
  constructor(message: string, public validationErrors?: z.ZodIssue[]) {
    super(message, 'REPORT_VALIDATION_ERROR');
  }
}

export class InvestigationReportOperationError extends InvestigationReportError {
  constructor(operation: string, message: string, reportId?: string) {
    super(`Failed to ${operation}: ${message}`, 'REPORT_OPERATION_ERROR', reportId);
  }
}

export class InvestigationReportModel {
  constructor(private supabase: ReturnType<typeof createClient<Database>>) {}

  /**
   * Creates a new investigation report
   * @param report Report data to insert
   * @returns Created report with generated ID and timestamps
   */
  async create(report: InvestigationReportInsert): Promise<InvestigationReportRow> {
    try {
      // Validate input using Zod schema
      const validated = InvestigationReportSchema.parse({
        ...report,
        status: report.status || 'DRAFT',
      });

      const now = new Date().toISOString();
      const insertData: InvestigationReportInsert = {
        command_id: validated.command_id,
        agent_id: validated.agent_id,
        title: validated.title,
        summary: validated.summary,
        status: validated.status || 'DRAFT',
        sections: validated.sections || null,
        findings: validated.findings || null,
        recommendations: validated.recommendations || null,
        metadata: validated.metadata || null,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await (this.supabase as any)
        .from('investigation_reports')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new InvestigationReportOperationError('create report', error.message);
      }

      return data as InvestigationReportRow;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new InvestigationReportValidationError(
          `Validation failed: ${error.errors.map(e => e.message).join(', ')}`,
          error.issues
        );
      }
      if (error instanceof InvestigationReportError) throw error;
      throw new InvestigationReportOperationError('create report', (error as Error).message);
    }
  }

  /**
   * Finds an investigation report by ID
   * @param id Report UUID
   * @returns Report data or throws InvestigationReportNotFoundError
   */
  async findById(id: string): Promise<InvestigationReportRow> {
    try {
      const { data, error } = await this.supabase
        .from('investigation_reports')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new InvestigationReportNotFoundError(id);
        }
        throw new InvestigationReportOperationError('find report by ID', error.message, id);
      }

      return data as InvestigationReportRow;
    } catch (error) {
      if (error instanceof InvestigationReportError) throw error;
      throw new InvestigationReportOperationError('find report by ID', (error as Error).message, id);
    }
  }

  /**
   * Finds investigation reports by command ID
   * @param commandId Command UUID
   * @returns Array of reports for the command
   */
  async findByCommandId(commandId: string): Promise<InvestigationReportRow[]> {
    try {
      const { data, error } = await this.supabase
        .from('investigation_reports')
        .select('*')
        .eq('command_id', commandId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new InvestigationReportOperationError('find reports by command ID', error.message);
      }

      return (data as InvestigationReportRow[]) || [];
    } catch (error) {
      throw new InvestigationReportOperationError('find reports by command ID', (error as Error).message);
    }
  }

  /**
   * Updates an investigation report
   * @param id Report UUID
   * @param updates Partial report data to update
   * @returns Updated report data
   */
  async update(id: string, updates: InvestigationReportUpdate): Promise<InvestigationReportRow> {
    try {
      // Validate partial update data
      const validationResult = InvestigationReportSchema.partial().safeParse(updates);
      if (!validationResult.success) {
        throw new InvestigationReportValidationError(
          'Invalid report update data',
          validationResult.error.issues
        );
      }

      const updateData = {
        ...updates,
        updated_at: new Date().toISOString(),
        ...(updates.status === 'COMPLETE' && !updates.completed_at && { completed_at: new Date().toISOString() }),
      };

      const { data, error } = await (this.supabase as any)
        .from('investigation_reports')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new InvestigationReportNotFoundError(id);
        }
        throw new InvestigationReportOperationError('update report', error.message, id);
      }

      return data as InvestigationReportRow;
    } catch (error) {
      if (error instanceof InvestigationReportError) throw error;
      throw new InvestigationReportOperationError('update report', (error as Error).message, id);
    }
  }

  /**
   * Generates a summary for the investigation report based on findings and recommendations
   * @param id Report UUID
   * @returns Updated report with generated summary
   */
  async generateSummary(id: string): Promise<InvestigationReportRow> {
    try {
      const report = await this.findById(id);

      let summary = '';

      // Generate summary based on findings and recommendations
      if (report.findings && report.findings.length > 0) {
        const criticalFindings = report.findings.filter(f => f.severity === 'CRITICAL').length;
        const highFindings = report.findings.filter(f => f.severity === 'HIGH').length;
        const totalFindings = report.findings.length;

        summary += `Investigation completed with ${totalFindings} findings identified.`;

        if (criticalFindings > 0) {
          summary += ` ${criticalFindings} critical issues require immediate attention.`;
        }

        if (highFindings > 0) {
          summary += ` ${highFindings} high-priority issues need resolution.`;
        }
      }

      if (report.recommendations && report.recommendations.length > 0) {
        const urgentRecs = report.recommendations.filter(r => r.priority === 'URGENT').length;
        const totalRecs = report.recommendations.length;

        if (summary) summary += ' ';
        summary += `${totalRecs} recommendations provided.`;

        if (urgentRecs > 0) {
          summary += ` ${urgentRecs} urgent actions recommended.`;
        }
      }

      if (!summary) {
        summary = 'Investigation report completed with no specific findings or recommendations.';
      }

      return await this.update(id, { summary });
    } catch (error) {
      if (error instanceof InvestigationReportError) throw error;
      throw new InvestigationReportOperationError('generate summary', (error as Error).message, id);
    }
  }

  /**
   * Finds all investigation reports with optional filtering
   * @param filters Optional filters for agent_id, status, limit, offset
   * @returns Array of reports
   */
  async findAll(filters?: {
    agent_id?: string;
    status?: InvestigationReportStatus;
    limit?: number;
    offset?: number;
  }): Promise<InvestigationReportRow[]> {
    try {
      let query = this.supabase.from('investigation_reports').select('*');

      if (filters?.agent_id) {
        query = query.eq('agent_id', filters.agent_id);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        throw new InvestigationReportOperationError('find all reports', error.message);
      }

      return (data as InvestigationReportRow[]) || [];
    } catch (error) {
      throw new InvestigationReportOperationError('find all reports', (error as Error).message);
    }
  }

  /**
   * Adds a section to an investigation report
   * @param id Report UUID
   * @param section Section to add
   * @returns Updated report
   */
  async addSection(id: string, section: ReportSection): Promise<InvestigationReportRow> {
    try {
      const report = await this.findById(id);
      const currentSections = report.sections || [];

      // Validate the section
      const validatedSection = ReportSectionSchema.parse(section);

      const updatedSections = [...currentSections, validatedSection];
      return await this.update(id, { sections: updatedSections });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new InvestigationReportValidationError('Invalid section data', error.issues);
      }
      if (error instanceof InvestigationReportError) throw error;
      throw new InvestigationReportOperationError('add section', (error as Error).message, id);
    }
  }

  /**
   * Adds a finding to an investigation report
   * @param id Report UUID
   * @param finding Finding to add
   * @returns Updated report
   */
  async addFinding(id: string, finding: ReportFinding): Promise<InvestigationReportRow> {
    try {
      const report = await this.findById(id);
      const currentFindings = report.findings || [];

      // Validate the finding
      const validatedFinding = ReportFindingSchema.parse(finding);

      const updatedFindings = [...currentFindings, validatedFinding];
      return await this.update(id, { findings: updatedFindings });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new InvestigationReportValidationError('Invalid finding data', error.issues);
      }
      if (error instanceof InvestigationReportError) throw error;
      throw new InvestigationReportOperationError('add finding', (error as Error).message, id);
    }
  }

  /**
   * Adds a recommendation to an investigation report
   * @param id Report UUID
   * @param recommendation Recommendation to add
   * @returns Updated report
   */
  async addRecommendation(id: string, recommendation: ReportRecommendation): Promise<InvestigationReportRow> {
    try {
      const report = await this.findById(id);
      const currentRecommendations = report.recommendations || [];

      // Validate the recommendation
      const validatedRecommendation = ReportRecommendationSchema.parse(recommendation);

      const updatedRecommendations = [...currentRecommendations, validatedRecommendation];
      return await this.update(id, { recommendations: updatedRecommendations });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new InvestigationReportValidationError('Invalid recommendation data', error.issues);
      }
      if (error instanceof InvestigationReportError) throw error;
      throw new InvestigationReportOperationError('add recommendation', (error as Error).message, id);
    }
  }

  /**
   * Marks a report as complete
   * @param id Report UUID
   * @returns Updated report
   */
  async complete(id: string): Promise<InvestigationReportRow> {
    try {
      return await this.update(id, {
        status: 'COMPLETE',
        completed_at: new Date().toISOString(),
      });
    } catch (error) {
      throw new InvestigationReportOperationError('complete report', (error as Error).message, id);
    }
  }

  /**
   * Marks a report as in progress
   * @param id Report UUID
   * @returns Updated report
   */
  async markInProgress(id: string): Promise<InvestigationReportRow> {
    try {
      return await this.update(id, { status: 'IN_PROGRESS' });
    } catch (error) {
      throw new InvestigationReportOperationError('mark report in progress', (error as Error).message, id);
    }
  }

  /**
   * Gets reports by status
   * @param status Report status
   * @param agentId Optional agent filter
   * @returns Array of reports
   */
  async getReportsByStatus(
    status: InvestigationReportStatus,
    agentId?: string
  ): Promise<InvestigationReportRow[]> {
    try {
      return await this.findAll({
        status,
        agent_id: agentId,
      });
    } catch (error) {
      throw new InvestigationReportOperationError('get reports by status', (error as Error).message);
    }
  }

  /**
   * Gets investigation report statistics
   * @param agentId Optional agent filter
   * @returns Report statistics
   */
  async getReportStats(agentId?: string): Promise<{
    total: number;
    draft: number;
    in_progress: number;
    complete: number;
    by_severity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
  }> {
    try {
      const reports = await this.findAll({ agent_id: agentId });

      const stats = {
        total: reports.length,
        draft: 0,
        in_progress: 0,
        complete: 0,
        by_severity: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        },
      };

      reports.forEach(report => {
        // Count by status
        if (report.status === 'DRAFT') stats.draft++;
        else if (report.status === 'IN_PROGRESS') stats.in_progress++;
        else if (report.status === 'COMPLETE') stats.complete++;

        // Count findings by severity
        if (report.findings) {
          report.findings.forEach(finding => {
            if (finding.severity === 'CRITICAL') stats.by_severity.critical++;
            else if (finding.severity === 'HIGH') stats.by_severity.high++;
            else if (finding.severity === 'MEDIUM') stats.by_severity.medium++;
            else if (finding.severity === 'LOW') stats.by_severity.low++;
          });
        }
      });

      return stats;
    } catch (error) {
      throw new InvestigationReportOperationError('get report stats', (error as Error).message);
    }
  }

  /**
   * Deletes an investigation report
   * @param id Report UUID
   * @returns Success boolean
   */
  async delete(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('investigation_reports')
        .delete()
        .eq('id', id);

      if (error) {
        throw new InvestigationReportOperationError('delete report', error.message, id);
      }

      return true;
    } catch (error) {
      if (error instanceof InvestigationReportError) throw error;
      throw new InvestigationReportOperationError('delete report', (error as Error).message, id);
    }
  }

  /**
   * Searches investigation reports using text search (fallback to basic search)
   * @param searchText Text to search for
   * @param agentId Optional agent filter
   * @param limit Optional result limit
   * @returns Array of matching reports
   */
  async searchReports(
    searchText: string,
    agentId?: string,
    limit?: number
  ): Promise<InvestigationReportRow[]> {
    try {
      // Try to use the database function if available, with proper type checking
      try {
        const { data, error } = await (this.supabase as any)
          .rpc('search_investigation_reports', {
            search_text: searchText,
            agent_filter: agentId,
            limit_count: limit || 50,
          });

        if (!error && data) {
          return (data as InvestigationReportRow[]) || [];
        }
      } catch (rpcError) {
        // Function doesn't exist, fall back to basic search
      }

      // Fallback to basic text search
      let query = this.supabase
        .from('investigation_reports')
        .select('*')
        .or(`title.ilike.%${searchText}%,summary.ilike.%${searchText}%`);

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data: fallbackData, error: fallbackError } = await query.order('created_at', { ascending: false });

      if (fallbackError) {
        throw new InvestigationReportOperationError('search reports', fallbackError.message);
      }

      return (fallbackData as InvestigationReportRow[]) || [];
    } catch (error) {
      throw new InvestigationReportOperationError('search reports', (error as Error).message);
    }
  }
}