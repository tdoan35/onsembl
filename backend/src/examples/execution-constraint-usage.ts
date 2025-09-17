/**
 * ExecutionConstraint Model Usage Examples
 *
 * This file demonstrates how to use the ExecutionConstraintModel
 * for managing execution limits in the Onsembl.ai Agent Control Center.
 */

import { createClient } from '@supabase/supabase-js';
import { ExecutionConstraintModel, type ConstraintEvaluationContext } from '../models/execution-constraint';
import { Database } from '../types/database';

// Example usage of ExecutionConstraintModel
export async function executionConstraintExamples() {
  // Initialize Supabase client (use environment variables in real implementation)
  const supabase = createClient<Database>(
    process.env['SUPABASE_URL'] || 'your-supabase-url',
    process.env['SUPABASE_ANON_KEY'] || 'your-supabase-anon-key'
  );

  // Create model instance
  const constraintModel = new ExecutionConstraintModel(supabase);

  try {
    // Example 1: Create a standard constraint profile
    console.log('Creating standard constraint profile...');
    const standardConstraint = await constraintModel.create({
      name: 'Standard Execution Limits',
      description: 'Standard constraints for production environment',
      time_limit_ms: 300000,  // 5 minutes
      token_budget: 2000,     // 2000 tokens
      memory_limit_mb: 1024,  // 1GB
      cpu_limit_percent: 80,  // 80% CPU
      is_default: true
    });
    console.log('Created constraint:', standardConstraint);

    // Example 2: Create a restrictive constraint for testing
    console.log('\nCreating restrictive constraint profile...');
    const testingConstraint = await constraintModel.create({
      name: 'Testing Limits',
      description: 'Restrictive constraints for testing environment',
      time_limit_ms: 60000,   // 1 minute
      token_budget: 500,      // 500 tokens
      memory_limit_mb: 256,   // 256MB
      cpu_limit_percent: 50   // 50% CPU
    });
    console.log('Created constraint:', testingConstraint);

    // Example 3: Find all active constraints
    console.log('\nFinding all active constraints...');
    const allConstraints = await constraintModel.findActive();
    console.log('Active constraints:', allConstraints.length);

    // Example 4: Find default constraint
    console.log('\nFinding default constraint...');
    const defaultConstraint = await constraintModel.findDefault();
    console.log('Default constraint:', defaultConstraint?.name);

    // Example 5: Evaluate constraint against execution context
    console.log('\nEvaluating constraint against execution context...');
    const evaluationContext: ConstraintEvaluationContext = {
      execution_time_ms: 250000,  // 4 minutes 10 seconds
      current_tokens: 1800,       // 1800 tokens used
      memory_usage_mb: 800,       // 800MB used
      cpu_usage_percent: 75       // 75% CPU usage
    };

    const evaluationResult = await constraintModel.evaluate(
      standardConstraint.id,
      evaluationContext
    );

    if (evaluationResult.isValid) {
      console.log('✅ All constraints satisfied');
    } else {
      console.log('❌ Constraint violations detected:');
      evaluationResult.violations.forEach(violation => {
        console.log(`  - ${violation.type}: ${violation.message}`);
      });
    }

    // Example 6: Test violation scenario
    console.log('\nTesting violation scenario...');
    const violationContext: ConstraintEvaluationContext = {
      execution_time_ms: 350000,  // 5 minutes 50 seconds (exceeds limit)
      current_tokens: 2500,       // 2500 tokens (exceeds budget)
      memory_usage_mb: 1200,      // 1200MB (exceeds limit)
      cpu_usage_percent: 90       // 90% CPU (exceeds limit)
    };

    const violationResult = await constraintModel.evaluate(
      standardConstraint.id,
      violationContext
    );

    if (!violationResult.isValid) {
      console.log('Expected violations detected:');
      violationResult.violations.forEach(violation => {
        console.log(`  - ${violation.type}: Current ${violation.current}, Limit ${violation.limit}`);
      });
    }

    // Example 7: Find constraints by type
    console.log('\nFinding constraints by type...');
    const timeConstraints = await constraintModel.findByType('TIME_LIMIT');
    const tokenConstraints = await constraintModel.findByType('MAX_TOKENS');
    console.log(`Time constraints: ${timeConstraints.length}`);
    console.log(`Token constraints: ${tokenConstraints.length}`);

    // Example 8: Update constraint
    console.log('\nUpdating constraint...');
    const updatedConstraint = await constraintModel.update(testingConstraint.id, {
      description: 'Updated testing constraints with new limits',
      time_limit_ms: 90000,  // Increase to 1.5 minutes
      token_budget: 750      // Increase to 750 tokens
    });
    console.log('Updated constraint:', updatedConstraint.name);

    // Example 9: Validate constraint configuration
    console.log('\nValidating constraint configurations...');

    const validConfig = {
      name: 'Valid Config',
      time_limit_ms: 180000,
      memory_limit_mb: 512
    };
    const validResult = constraintModel.validateConstraint(validConfig);
    console.log('Valid config result:', validResult.isValid);

    const invalidConfig = {
      name: 'Invalid Config',
      cpu_limit_percent: 150  // Invalid: >100%
    };
    const invalidResult = constraintModel.validateConstraint(invalidConfig);
    console.log('Invalid config errors:', invalidResult.errors);

    // Example 10: Subscribe to real-time changes
    console.log('\nSetting up real-time subscription...');
    const subscriptionId = constraintModel.subscribeToChanges((payload) => {
      console.log('Constraint changed:', payload.eventType, payload.new?.name || payload.old?.name);
    });

    // Simulate some time passing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Clean up subscription
    constraintModel.unsubscribe(subscriptionId);
    console.log('Unsubscribed from real-time changes');

    // Example 11: Disable constraint (soft delete)
    console.log('\nDisabling constraint...');
    await constraintModel.disable(testingConstraint.id);
    console.log('Constraint disabled');

    // Example 12: Clean up - delete constraints
    console.log('\nCleaning up test constraints...');
    await constraintModel.delete(standardConstraint.id);
    await constraintModel.delete(testingConstraint.id);
    console.log('Test constraints deleted');

  } catch (error) {
    console.error('Error in execution constraint examples:', error);
  }
}

// Example of integration with command execution
export async function integrateWithCommandExecution() {
  const supabase = createClient<Database>(
    process.env['SUPABASE_URL'] || 'your-supabase-url',
    process.env['SUPABASE_ANON_KEY'] || 'your-supabase-anon-key'
  );

  const constraintModel = new ExecutionConstraintModel(supabase);

  try {
    // Get default constraint for command execution
    const defaultConstraint = await constraintModel.findDefault();

    if (!defaultConstraint) {
      console.log('No default constraint found, creating one...');
      await constraintModel.create({
        name: 'Default Constraint',
        time_limit_ms: 300000,
        token_budget: 1000,
        memory_limit_mb: 512,
        cpu_limit_percent: 80,
        is_default: true
      });
    }

    // Simulate command execution monitoring
    const simulateCommandExecution = async (constraintId: string) => {
      console.log('\nSimulating command execution...');
      const startTime = Date.now();
      let tokensUsed = 0;
      let memoryUsed = 100; // Starting memory usage

      // Simulate periodic checks during execution
      for (let i = 0; i < 10; i++) {
        const executionTime = Date.now() - startTime;
        tokensUsed += Math.floor(Math.random() * 100) + 50; // Random token usage
        memoryUsed += Math.floor(Math.random() * 50) + 10;  // Random memory increase
        const cpuUsage = Math.floor(Math.random() * 40) + 40; // Random CPU 40-80%

        const context: ConstraintEvaluationContext = {
          execution_time_ms: executionTime,
          current_tokens: tokensUsed,
          memory_usage_mb: memoryUsed,
          cpu_usage_percent: cpuUsage
        };

        const result = await constraintModel.evaluate(constraintId, context);

        console.log(`Check ${i + 1}: Time=${executionTime}ms, Tokens=${tokensUsed}, Memory=${memoryUsed}MB, CPU=${cpuUsage}%`);

        if (!result.isValid) {
          console.log('🚨 Constraint violation detected, stopping execution:');
          result.violations.forEach(violation => {
            console.log(`  - ${violation.message}`);
          });
          return false; // Would stop command execution
        }

        // Simulate some execution time
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('✅ Command execution completed within constraints');
      return true;
    };

    // Run simulation with default constraint
    if (defaultConstraint) {
      await simulateCommandExecution(defaultConstraint.id);
    }

  } catch (error) {
    console.error('Error in command execution integration:', error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  console.log('ExecutionConstraint Model Usage Examples');
  console.log('=====================================');

  executionConstraintExamples()
    .then(() => {
      console.log('\n--- Command Execution Integration ---');
      return integrateWithCommandExecution();
    })
    .then(() => {
      console.log('\nAll examples completed successfully!');
    })
    .catch(error => {
      console.error('Examples failed:', error);
      process.exit(1);
    });
}