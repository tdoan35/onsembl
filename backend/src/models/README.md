# Models Directory

This directory contains the data models for the Onsembl.ai Agent Control Center backend.

## Available Models

### TerminalOutputModel (`terminal-output.ts`)

Manages terminal output data from command executions with support for:

- **CRUD Operations**: Create, read, update, delete terminal output entries
- **Real-time Streaming**: WebSocket-based streaming for live terminal output
- **ANSI Color Codes**: Metadata support for terminal formatting
- **Automatic Chunking**: Large output splitting (100KB chunks)
- **Batch Operations**: Efficient bulk operations
- **Statistics**: Command output analytics

#### Basic Usage

```typescript
import { TerminalOutputModel } from './terminal-output';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);
const terminalModel = new TerminalOutputModel(supabase);

// Create a terminal output entry
const output = await terminalModel.create({
  command_id: 'command-uuid',
  agent_id: 'agent-uuid',
  type: 'stdout',
  output: 'Hello from terminal',
  timestamp: new Date().toISOString(),
});

// Stream real-time output
const subscriptionId = terminalModel.stream(
  'command-uuid',
  (payload) => {
    console.log('New output:', payload.new);
  },
  { includeExisting: true }
);

// Get command statistics
const stats = await terminalModel.getStats('command-uuid');
```

#### Key Features

1. **Schema Validation**: Zod-based input validation
2. **Error Handling**: Custom error types for better debugging
3. **Performance**: Indexed queries and batch operations
4. **Real-time**: Supabase Realtime integration
5. **Chunking**: Automatic handling of large outputs
6. **ANSI Support**: Parse and store terminal color codes

#### Database Schema

The model interfaces with the `terminal_outputs` table:

```sql
CREATE TABLE terminal_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_id UUID NOT NULL REFERENCES commands(id),
    agent_id UUID NOT NULL REFERENCES agents(id),
    type terminal_output_type NOT NULL, -- 'stdout' | 'stderr' | 'system'
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### CommandPresetModel (`command-preset.ts`)

Manages command presets for reusable prompt templates with variable substitution:

- **CRUD Operations**: Create, read, update, delete command presets
- **Template Engine**: Variable substitution with validation
- **Category Management**: Organize presets by categories
- **Usage Tracking**: Monitor preset popularity and execution counts
- **Template Validation**: Validate variables against schema definitions
- **Public/Private**: Support for sharing presets across users

#### Basic Usage

```typescript
import { CommandPresetModel } from './command-preset';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);
const presetModel = new CommandPresetModel(supabase);

// Create a preset with variables
const preset = await presetModel.create({
  name: 'Code Review Template',
  description: 'Review code with specific criteria',
  category: 'Development',
  type: 'REVIEW',
  prompt_template: 'Review the {{language}} code in {{file}} focusing on {{criteria}}',
  variables: [
    { name: 'language', type: 'select', required: true, options: ['TypeScript', 'Python', 'JavaScript'] },
    { name: 'file', type: 'string', required: true, validation: { min_length: 1 } },
    { name: 'criteria', type: 'string', required: false, default_value: 'performance and security' }
  ],
  created_by: 'user-uuid'
});

// Execute preset with variables
const result = await presetModel.execute(preset.id, {
  variables: {
    language: 'TypeScript',
    file: 'models/command-preset.ts',
    criteria: 'error handling and type safety'
  },
  agent_id: 'agent-uuid'
});

console.log(result.rendered_prompt);
// Output: "Review the TypeScript code in models/command-preset.ts focusing on error handling and type safety"

// Search presets
const searchResults = await presetModel.search('review', {
  category: 'Development',
  is_public: true
});
```

#### Key Features

1. **Variable Substitution**: {{variable}} syntax with type validation
2. **Template Validation**: String length, number ranges, select options
3. **Category Organization**: Group presets by logical categories
4. **Usage Analytics**: Track execution counts and popularity
5. **Public Sharing**: Mark presets as public for team use
6. **Real-time Updates**: Subscribe to preset changes

#### Variable Types

- **string**: Text with optional length/pattern validation
- **number**: Numeric values with min/max constraints
- **boolean**: True/false values
- **select**: Predefined option lists

### Other Models

- **AgentModel** (`agent.ts`): Agent management and status tracking
- **CommandModel** (`command.ts`): Command queue and execution management

## Import Guidelines

Use the centralized index for imports:

```typescript
import {
  TerminalOutputModel,
  AgentModel,
  CommandModel
} from './models';
```

## Testing

Models follow TDD principles and include comprehensive error handling. Each model should have corresponding contract and integration tests.