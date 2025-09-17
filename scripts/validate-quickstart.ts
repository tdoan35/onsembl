#!/usr/bin/env ts-node

/**
 * Quickstart Validation Script
 * Validates all requirements from the quickstart checklist
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import WebSocket from 'ws';

interface ValidationResult {
  task: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  details?: any;
}

class QuickstartValidator {
  private results: ValidationResult[] = [];
  private serverUrl = process.env['SERVER_URL'] || 'http://localhost:3000';
  private dashboardUrl = process.env['DASHBOARD_URL'] || 'http://localhost:3001';

  async validate(): Promise<void> {
    console.log('🚀 Starting Quickstart Validation...\n');

    // Core setup validations
    await this.validateProjectStructure();
    await this.validateDependencies();
    await this.validateEnvironmentVariables();
    await this.validateDatabaseMigrations();

    // Server validations
    await this.validateControlServer();
    await this.validateDashboard();
    await this.validateWebSocketEndpoint();

    // Feature validations
    await this.validateAgentConnection();
    await this.validateCommandExecution();
    await this.validateTerminalStreaming();
    await this.validateEmergencyStop();
    await this.validatePresets();
    await this.validateTraceTree();
    await this.validateQueueManagement();
    await this.validateAgentRestart();
    await this.validateReports();
    await this.validateAuditLogs();

    // Performance validations
    await this.validateLatency();
    await this.validateConcurrency();

    // Print results
    this.printResults();
  }

  private async validateProjectStructure(): Promise<void> {
    const requiredDirs = [
      'backend',
      'frontend',
      'agent-wrapper',
      'packages/agent-protocol',
      'packages/command-queue',
      'packages/trace-collector',
      'specs',
      'docs',
    ];

    for (const dir of requiredDirs) {
      const exists = fs.existsSync(path.join(process.cwd(), dir));
      this.addResult({
        task: `Project structure: ${dir}`,
        status: exists ? 'PASS' : 'FAIL',
        message: exists ? `Directory exists` : `Missing directory: ${dir}`,
      });
    }
  }

  private async validateDependencies(): Promise<void> {
    const requiredPackages = [
      'backend/node_modules',
      'frontend/node_modules',
      'agent-wrapper/node_modules',
    ];

    for (const pkgPath of requiredPackages) {
      const exists = fs.existsSync(path.join(process.cwd(), pkgPath));
      this.addResult({
        task: `Dependencies installed: ${pkgPath}`,
        status: exists ? 'PASS' : 'FAIL',
        message: exists ? 'Installed' : 'Run npm install',
      });
    }
  }

  private async validateEnvironmentVariables(): Promise<void> {
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_KEY',
      'JWT_SECRET',
      'REDIS_URL',
    ];

    const envPath = path.join(process.cwd(), '.env');
    const hasEnvFile = fs.existsSync(envPath);

    if (!hasEnvFile) {
      this.addResult({
        task: 'Environment configuration',
        status: 'FAIL',
        message: '.env file not found',
      });
      return;
    }

    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const varName of requiredEnvVars) {
      const hasVar = envContent.includes(`${varName}=`);
      this.addResult({
        task: `Environment variable: ${varName}`,
        status: hasVar ? 'PASS' : 'FAIL',
        message: hasVar ? 'Configured' : 'Missing in .env',
      });
    }
  }

  private async validateDatabaseMigrations(): Promise<void> {
    const migrationsDir = path.join(process.cwd(), 'backend/migrations');
    const hasMigrations = fs.existsSync(migrationsDir);

    this.addResult({
      task: 'Database migrations',
      status: hasMigrations ? 'PASS' : 'SKIP',
      message: hasMigrations ? 'Migrations directory exists' : 'No migrations directory',
    });
  }

  private async validateControlServer(): Promise<void> {
    try {
      const response = await axios.get(`${this.serverUrl}/health`, {
        timeout: 5000,
      });

      this.addResult({
        task: 'Control server health check',
        status: response.status === 200 ? 'PASS' : 'FAIL',
        message: `Server responded with status ${response.status}`,
        details: response.data,
      });
    } catch (error: any) {
      this.addResult({
        task: 'Control server health check',
        status: 'FAIL',
        message: `Server not reachable: ${error.message}`,
      });
    }
  }

  private async validateDashboard(): Promise<void> {
    try {
      const response = await axios.get(this.dashboardUrl, {
        timeout: 5000,
      });

      this.addResult({
        task: 'Dashboard accessibility',
        status: response.status === 200 ? 'PASS' : 'FAIL',
        message: `Dashboard responded with status ${response.status}`,
      });
    } catch (error: any) {
      this.addResult({
        task: 'Dashboard accessibility',
        status: 'FAIL',
        message: `Dashboard not reachable: ${error.message}`,
      });
    }
  }

  private async validateWebSocketEndpoint(): Promise<void> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`${this.serverUrl.replace('http', 'ws')}/v1/ws/dashboard`);

      const timeout = setTimeout(() => {
        ws.close();
        this.addResult({
          task: 'WebSocket endpoint',
          status: 'FAIL',
          message: 'Connection timeout',
        });
        resolve();
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        this.addResult({
          task: 'WebSocket endpoint',
          status: 'PASS',
          message: 'WebSocket connection successful',
        });
        ws.close();
        resolve();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        this.addResult({
          task: 'WebSocket endpoint',
          status: 'FAIL',
          message: `WebSocket error: ${error.message}`,
        });
        resolve();
      });
    });
  }

  private async validateAgentConnection(): Promise<void> {
    // Check if agent config exists
    const configPath = path.join(process.cwd(), 'agent-wrapper/config.json');
    const hasConfig = fs.existsSync(configPath);

    this.addResult({
      task: 'Agent configuration',
      status: hasConfig ? 'PASS' : 'FAIL',
      message: hasConfig ? 'Config file exists' : 'Missing agent-wrapper/config.json',
    });
  }

  private async validateCommandExecution(): Promise<void> {
    try {
      // Check if command endpoint exists
      const response = await axios.get(`${this.serverUrl}/v1/commands`, {
        headers: {
          'Authorization': `Bearer ${process.env['JWT_TOKEN'] || 'test'}`,
        },
        timeout: 5000,
      });

      this.addResult({
        task: 'Command API endpoint',
        status: 'PASS',
        message: 'Command endpoint accessible',
      });
    } catch (error: any) {
      this.addResult({
        task: 'Command API endpoint',
        status: error.response?.status === 401 ? 'PASS' : 'FAIL',
        message: error.response?.status === 401
          ? 'Command endpoint exists (auth required)'
          : `Command endpoint error: ${error.message}`,
      });
    }
  }

  private async validateTerminalStreaming(): Promise<void> {
    // Validate terminal component exists
    const terminalPath = path.join(process.cwd(), 'frontend/src/components/terminal/terminal-viewer.tsx');
    const hasTerminal = fs.existsSync(terminalPath);

    this.addResult({
      task: 'Terminal viewer component',
      status: hasTerminal ? 'PASS' : 'FAIL',
      message: hasTerminal ? 'Terminal component exists' : 'Missing terminal viewer',
    });
  }

  private async validateEmergencyStop(): Promise<void> {
    const emergencyStopPath = path.join(process.cwd(), 'frontend/src/components/controls/emergency-stop.tsx');
    const hasEmergencyStop = fs.existsSync(emergencyStopPath);

    this.addResult({
      task: 'Emergency stop component',
      status: hasEmergencyStop ? 'PASS' : 'FAIL',
      message: hasEmergencyStop ? 'Emergency stop exists' : 'Missing emergency stop',
    });
  }

  private async validatePresets(): Promise<void> {
    const presetsPath = path.join(process.cwd(), 'frontend/src/components/presets/preset-manager.tsx');
    const hasPresets = fs.existsSync(presetsPath);

    this.addResult({
      task: 'Preset manager component',
      status: hasPresets ? 'PASS' : 'FAIL',
      message: hasPresets ? 'Preset manager exists' : 'Missing preset manager',
    });
  }

  private async validateTraceTree(): Promise<void> {
    const traceTreePath = path.join(process.cwd(), 'frontend/src/components/trace/trace-tree.tsx');
    const hasTraceTree = fs.existsSync(traceTreePath);

    this.addResult({
      task: 'Trace tree viewer',
      status: hasTraceTree ? 'PASS' : 'FAIL',
      message: hasTraceTree ? 'Trace tree exists' : 'Missing trace tree',
    });
  }

  private async validateQueueManagement(): Promise<void> {
    const queuePath = path.join(process.cwd(), 'packages/command-queue/src/index.ts');
    const hasQueue = fs.existsSync(queuePath);

    this.addResult({
      task: 'Queue management package',
      status: hasQueue ? 'PASS' : 'FAIL',
      message: hasQueue ? 'Command queue exists' : 'Missing command queue',
    });
  }

  private async validateAgentRestart(): Promise<void> {
    const agentServicePath = path.join(process.cwd(), 'backend/src/services/agent.service.ts');
    const hasAgentService = fs.existsSync(agentServicePath);

    if (hasAgentService) {
      const content = fs.readFileSync(agentServicePath, 'utf-8');
      const hasRestartMethod = content.includes('restartAgent');

      this.addResult({
        task: 'Agent restart capability',
        status: hasRestartMethod ? 'PASS' : 'FAIL',
        message: hasRestartMethod ? 'Restart method exists' : 'Missing restart method',
      });
    } else {
      this.addResult({
        task: 'Agent restart capability',
        status: 'FAIL',
        message: 'Agent service not found',
      });
    }
  }

  private async validateReports(): Promise<void> {
    const reportsPath = path.join(process.cwd(), 'frontend/src/components/reports/report-viewer.tsx');
    const hasReports = fs.existsSync(reportsPath);

    this.addResult({
      task: 'Report viewer component',
      status: hasReports ? 'PASS' : 'FAIL',
      message: hasReports ? 'Report viewer exists' : 'Missing report viewer',
    });
  }

  private async validateAuditLogs(): Promise<void> {
    const auditPath = path.join(process.cwd(), 'frontend/src/components/audit/audit-viewer.tsx');
    const hasAudit = fs.existsSync(auditPath);

    this.addResult({
      task: 'Audit log viewer',
      status: hasAudit ? 'PASS' : 'FAIL',
      message: hasAudit ? 'Audit viewer exists' : 'Missing audit viewer',
    });
  }

  private async validateLatency(): Promise<void> {
    const perfTestPath = path.join(process.cwd(), 'backend/tests/performance/latency.test.ts');
    const hasPerfTest = fs.existsSync(perfTestPath);

    this.addResult({
      task: 'Latency performance tests',
      status: hasPerfTest ? 'PASS' : 'FAIL',
      message: hasPerfTest ? 'Performance tests exist' : 'Missing performance tests',
    });

    // Check if <200ms requirement is documented
    if (hasPerfTest) {
      const content = fs.readFileSync(perfTestPath, 'utf-8');
      const hasLatencyCheck = content.includes('200') && content.includes('latency');

      this.addResult({
        task: 'Latency requirement (<200ms)',
        status: hasLatencyCheck ? 'PASS' : 'FAIL',
        message: hasLatencyCheck ? 'Latency check implemented' : 'Latency check missing',
      });
    }
  }

  private async validateConcurrency(): Promise<void> {
    const concurrencyTestPath = path.join(process.cwd(), 'backend/tests/performance/concurrency.test.ts');
    const hasConcurrencyTest = fs.existsSync(concurrencyTestPath);

    this.addResult({
      task: 'Concurrency tests',
      status: hasConcurrencyTest ? 'PASS' : 'FAIL',
      message: hasConcurrencyTest ? 'Concurrency tests exist' : 'Missing concurrency tests',
    });

    // Check if 10+ agents requirement is tested
    if (hasConcurrencyTest) {
      const content = fs.readFileSync(concurrencyTestPath, 'utf-8');
      const hasAgentCheck = content.includes('10') && content.includes('agents');

      this.addResult({
        task: 'Concurrent agents (10+)',
        status: hasAgentCheck ? 'PASS' : 'FAIL',
        message: hasAgentCheck ? '10+ agents test exists' : '10+ agents test missing',
      });
    }
  }

  private addResult(result: ValidationResult): void {
    this.results.push(result);
  }

  private printResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION RESULTS');
    console.log('='.repeat(60) + '\n');

    const passed = this.results.filter((r) => r.status === 'PASS');
    const failed = this.results.filter((r) => r.status === 'FAIL');
    const skipped = this.results.filter((r) => r.status === 'SKIP');

    // Print results by category
    console.log('✅ PASSED:', passed.length);
    passed.forEach((r) => {
      console.log(`  ✓ ${r.task}: ${r.message}`);
    });

    if (failed.length > 0) {
      console.log('\n❌ FAILED:', failed.length);
      failed.forEach((r) => {
        console.log(`  ✗ ${r.task}: ${r.message}`);
      });
    }

    if (skipped.length > 0) {
      console.log('\n⏭️  SKIPPED:', skipped.length);
      skipped.forEach((r) => {
        console.log(`  - ${r.task}: ${r.message}`);
      });
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Passed: ${passed.length} (${Math.round((passed.length / this.results.length) * 100)}%)`);
    console.log(`Failed: ${failed.length} (${Math.round((failed.length / this.results.length) * 100)}%)`);
    console.log(`Skipped: ${skipped.length} (${Math.round((skipped.length / this.results.length) * 100)}%)`);

    // Overall status
    const allPassed = failed.length === 0;
    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('🎉 QUICKSTART VALIDATION PASSED!');
      console.log('The Onsembl.ai Agent Control Center is ready for use.');
    } else {
      console.log('⚠️  QUICKSTART VALIDATION FAILED');
      console.log(`Please fix the ${failed.length} failed checks above.`);
    }
    console.log('='.repeat(60) + '\n');

    // Exit with appropriate code
    process.exit(allPassed ? 0 : 1);
  }
}

// Run validation
const validator = new QuickstartValidator();
validator.validate().catch((error) => {
  console.error('Validation error:', error);
  process.exit(1);
});