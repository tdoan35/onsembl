# Supabase Migrations

## Auth Migrations

The following migrations were added to support Supabase authentication:

### Migration Files
- `20250922194153_create_user_profiles.sql` - Creates user_profiles table for extended user data
- `20250922194154_add_user_id_columns.sql` - Adds user_id columns to existing tables
- `20250922194155_user_profiles_rls.sql` - Adds RLS policies for user_profiles
- `20250922194156_agents_rls.sql` - Adds RLS policies for agents table
- `20250922194157_commands_audit_rls.sql` - Adds RLS policies for commands and audit_logs

## Applying Migrations

### Method 1: Using Supabase CLI (Recommended)

```bash
# Make sure you're in the project root
cd /path/to/onsembl

# Apply all pending migrations
npx supabase migration up

# Or apply to a specific project
npx supabase migration up --project-ref your-project-ref
```

### Method 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste each migration file in order
4. Execute each migration

### Method 3: Using the Supabase MCP tool

```bash
# List migrations
mcp supabase list-migrations

# Apply a specific migration
mcp supabase apply-migration --name "create_user_profiles" --query "$(cat supabase/migrations/20250922194153_create_user_profiles.sql)"
```

## Important Notes

1. **Order Matters**: Apply migrations in chronological order (by timestamp)
2. **Foreign Keys**: The user_profiles table references auth.users, which is managed by Supabase
3. **RLS Policies**: These migrations enable Row Level Security - make sure your backend uses the service role key
4. **Existing Data**: If you have existing data, you may need to:
   - Assign a default user_id to existing records
   - Or create a migration user and assign orphaned records to it

## Rollback

To rollback migrations, create a new migration that reverses the changes:

```sql
-- Example rollback for user_profiles
DROP TABLE IF EXISTS public.user_profiles CASCADE;

-- Example rollback for RLS policies
DROP POLICY IF EXISTS "Users can view own agents" ON public.agents;
ALTER TABLE public.agents DISABLE ROW LEVEL SECURITY;
```

## Testing Migrations

After applying migrations, test them:

```sql
-- Test user_profiles table exists
SELECT * FROM public.user_profiles LIMIT 1;

-- Test RLS policies are active
SELECT * FROM pg_policies WHERE tablename = 'agents';

-- Test user_id columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'agents' AND column_name = 'user_id';
```