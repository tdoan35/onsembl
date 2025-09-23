# Data Model: Supabase Authentication

## Overview
This document defines the data model for Supabase authentication integration. The primary data is managed by Supabase's auth schema, with extensions for application-specific user data.

## Core Entities

### 1. User (auth.users - Supabase managed)
Primary user entity managed by Supabase authentication system.

**Fields**:
- `id`: UUID - Unique identifier (primary key)
- `email`: string - User's email address (unique)
- `email_confirmed_at`: timestamp - Email verification timestamp
- `phone`: string? - Optional phone number
- `phone_confirmed_at`: timestamp? - Phone verification timestamp
- `confirmed_at`: timestamp? - Account confirmation timestamp
- `last_sign_in_at`: timestamp? - Last authentication timestamp
- `role`: string - User role (default: 'authenticated')
- `created_at`: timestamp - Account creation timestamp
- `updated_at`: timestamp - Last update timestamp
- `aud`: string - Audience claim for JWT
- `raw_app_meta_data`: jsonb - Application metadata
- `raw_user_meta_data`: jsonb - User metadata (username, avatar_url, etc.)

**Relationships**:
- Has many Sessions
- Has many Identities (for OAuth)
- Has one Profile (application-specific)

### 2. Session (auth.sessions - Supabase managed)
Active authentication sessions for users.

**Fields**:
- `id`: UUID - Session identifier
- `user_id`: UUID - Reference to auth.users.id
- `created_at`: timestamp - Session creation time
- `updated_at`: timestamp - Last activity time
- `expires_at`: timestamp - Session expiration time
- `ip`: inet? - IP address of session origin
- `user_agent`: string? - Browser/client information

**Relationships**:
- Belongs to User

### 3. Identity (auth.identities - Supabase managed)
OAuth provider identities linked to users.

**Fields**:
- `id`: string - Provider-specific user ID
- `user_id`: UUID - Reference to auth.users.id
- `provider`: string - OAuth provider name (google, github)
- `identity_data`: jsonb - Provider-specific data
- `created_at`: timestamp - Link creation time
- `updated_at`: timestamp - Last update time

**Relationships**:
- Belongs to User

### 4. UserProfile (public.user_profiles - Application managed)
Extended user profile information for the application.

**Fields**:
- `id`: UUID - Same as auth.users.id (foreign key)
- `username`: string? - Optional display username
- `avatar_url`: string? - Profile picture URL
- `full_name`: string? - User's full name
- `bio`: text? - User biography/description
- `preferences`: jsonb - User preferences/settings
- `created_at`: timestamp - Profile creation time
- `updated_at`: timestamp - Last update time

**Relationships**:
- Belongs to User (1:1)
- Has many Agents
- Has many Commands
- Has many AuditLogs

### 5. Agent (public.agents - Modified)
AI agents owned by users.

**Modified Fields**:
- `user_id`: UUID - Owner of the agent (foreign key to auth.users.id) **[NEW]**
- `id`: UUID - Unique identifier
- `name`: string - Agent name
- `type`: string - Agent type (claude, gemini, codex)
- `status`: string - Current status
- `created_at`: timestamp
- `updated_at`: timestamp

**Relationships**:
- Belongs to User

### 6. Command (public.commands - Modified)
Commands executed by users.

**Modified Fields**:
- `user_id`: UUID - User who executed the command **[NEW]**
- `id`: UUID - Unique identifier
- `agent_id`: UUID - Target agent
- `type`: string - Command type
- `payload`: jsonb - Command data
- `status`: string - Execution status
- `created_at`: timestamp
- `updated_at`: timestamp

**Relationships**:
- Belongs to User
- Belongs to Agent

### 7. AuditLog (public.audit_logs - Modified)
Authentication and security audit trail.

**Modified Fields**:
- `user_id`: UUID? - User involved in the event **[NEW]**
- `id`: UUID - Unique identifier
- `event_type`: string - Type of event (login, logout, password_reset, etc.)
- `event_data`: jsonb - Event details
- `ip_address`: inet? - Origin IP
- `user_agent`: string? - Client information
- `created_at`: timestamp

**Relationships**:
- Belongs to User (optional)

## State Transitions

### User Authentication States
```
Anonymous → Signing Up → Email Verification Pending → Authenticated
                ↓
        Sign Up Failed

Anonymous → Signing In → Authenticated
                ↓
         Sign In Failed

Authenticated → Signing Out → Anonymous

Authenticated → Password Reset Requested → Reset Email Sent → Password Updated
```

### Session States
```
Created → Active → Refreshing → Active
            ↓          ↓
         Expired    Failed → Expired
            ↓
         Terminated
```

## Validation Rules

### User Registration
- Email: Required, valid format, unique
- Password: Minimum 6 characters (Supabase default)
- Username: Optional, 3-30 characters, alphanumeric + underscore

### OAuth Registration
- Provider ID: Required, must be unique per provider
- Email: Extracted from provider, may be updated

### Session Management
- Token expiry: 1 hour default (configurable)
- Refresh window: 5 minutes before expiry
- Max sessions per user: Unlimited (consider limiting)

## Row Level Security (RLS) Policies

### user_profiles
```sql
-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());
```

### agents
```sql
-- Users can only see their own agents
CREATE POLICY "Users can view own agents" ON agents
  FOR SELECT USING (user_id = auth.uid());

-- Users can only create agents for themselves
CREATE POLICY "Users can create own agents" ON agents
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can only update their own agents
CREATE POLICY "Users can update own agents" ON agents
  FOR UPDATE USING (user_id = auth.uid());

-- Users can only delete their own agents
CREATE POLICY "Users can delete own agents" ON agents
  FOR DELETE USING (user_id = auth.uid());
```

### commands
```sql
-- Users can only see their own commands
CREATE POLICY "Users can view own commands" ON commands
  FOR SELECT USING (user_id = auth.uid());

-- Users can only create commands for their own agents
CREATE POLICY "Users can create commands for own agents" ON commands
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  );
```

### audit_logs
```sql
-- Users can view their own audit logs
CREATE POLICY "Users can view own audit logs" ON audit_logs
  FOR SELECT USING (user_id = auth.uid());

-- System can insert audit logs (using service role)
-- No INSERT policy needed for users
```

## Indexes

### Performance Indexes
```sql
-- User profile lookups
CREATE INDEX idx_user_profiles_username ON user_profiles(username);

-- Agent ownership queries
CREATE INDEX idx_agents_user_id ON agents(user_id);

-- Command history queries
CREATE INDEX idx_commands_user_id ON commands(user_id);
CREATE INDEX idx_commands_agent_id ON commands(agent_id);

-- Audit log queries
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

## Migration Scripts

### Add user_id to existing tables
```sql
-- Add user_id column to agents
ALTER TABLE agents
ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Add user_id column to commands
ALTER TABLE commands
ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Add user_id column to audit_logs
ALTER TABLE audit_logs
ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Create user_profiles table
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  avatar_url TEXT,
  full_name TEXT,
  bio TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
```

## Type Definitions (TypeScript)

```typescript
// User type (from Supabase Auth)
interface User {
  id: string;
  email: string;
  email_confirmed_at?: string;
  phone?: string;
  phone_confirmed_at?: string;
  confirmed_at?: string;
  last_sign_in_at?: string;
  role: string;
  created_at: string;
  updated_at: string;
  app_metadata: Record<string, any>;
  user_metadata: {
    username?: string;
    avatar_url?: string;
    full_name?: string;
  };
}

// Session type
interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
  user: User;
}

// User Profile type
interface UserProfile {
  id: string;
  username?: string;
  avatar_url?: string;
  full_name?: string;
  bio?: string;
  preferences: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Modified Agent type
interface Agent {
  id: string;
  user_id: string; // NEW
  name: string;
  type: 'claude' | 'gemini' | 'codex';
  status: string;
  created_at: string;
  updated_at: string;
}

// Modified Command type
interface Command {
  id: string;
  user_id: string; // NEW
  agent_id: string;
  type: string;
  payload: Record<string, any>;
  status: string;
  created_at: string;
  updated_at: string;
}

// Audit Log type
interface AuditLog {
  id: string;
  user_id?: string; // NEW
  event_type: 'login' | 'logout' | 'password_reset' | 'profile_update' | 'security_alert';
  event_data: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}
```

## Notes

1. **Supabase Managed Tables**: Tables in the `auth` schema are managed by Supabase and should not be modified directly
2. **User Profile Pattern**: Common pattern is to create a `user_profiles` table that references `auth.users`
3. **RLS Enforcement**: Always use `auth.uid()` function in RLS policies for security
4. **Service Role**: Some operations (like audit logging) may require service role key
5. **Soft Deletes**: Consider implementing soft deletes for user data compliance
6. **GDPR Compliance**: Plan for user data export and deletion requests