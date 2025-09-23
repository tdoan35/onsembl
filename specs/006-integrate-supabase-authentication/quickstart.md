# Quickstart: Supabase Authentication

## Prerequisites

1. **Supabase Project**: Create a project at [supabase.com](https://supabase.com)
2. **Environment Variables**: Copy credentials from Supabase dashboard
3. **OAuth Providers**: Configure Google and GitHub OAuth (optional)

## Setup Steps

### 1. Install Dependencies

```bash
# Frontend
cd frontend
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs @supabase/auth-helpers-react

# Backend
cd ../backend
npm install @supabase/supabase-js jsonwebtoken @types/jsonwebtoken
```

### 2. Configure Environment Variables

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Update `backend/.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
SUPABASE_JWT_SECRET=your-jwt-secret
```

### 3. Configure OAuth Providers (Optional)

In Supabase Dashboard → Authentication → Providers:

#### Google OAuth:
1. Enable Google provider
2. Add Client ID and Secret from Google Console
3. Set redirect URL: `https://your-project.supabase.co/auth/v1/callback`

#### GitHub OAuth:
1. Enable GitHub provider
2. Add Client ID and Secret from GitHub Settings
3. Set redirect URL: `https://your-project.supabase.co/auth/v1/callback`

### 4. Set Up Database

Run migrations to add user-related columns:

```sql
-- In Supabase SQL Editor

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

-- Add user_id to agents table
ALTER TABLE agents
ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Add user_id to commands table
ALTER TABLE commands
ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Users can view own agents" ON agents
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage own agents" ON agents
  FOR ALL USING (user_id = auth.uid());
```

### 5. Initialize Supabase Clients

Frontend (`frontend/src/lib/supabase.ts`):
```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

Backend (`backend/src/lib/supabase.ts`):
```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // Use service key for admin operations
);
```

### 6. Test Authentication Flows

Start both servers:
```bash
# Terminal 1
cd frontend && npm run dev

# Terminal 2
cd backend && npm run dev
```

## Verification Tests

### Test 1: Email Sign Up
1. Open browser to `http://localhost:3000`
2. Click "Sign Up" in auth modal
3. Enter email, password, and optional username
4. Click "Create Account"
5. **Expected**: User created and logged in to dashboard

### Test 2: Email Sign In
1. Click "Sign Out" in header
2. Enter existing email and password
3. Click "Sign In"
4. **Expected**: User logged in and sees dashboard

### Test 3: OAuth Sign In (Google)
1. Click "Sign in with Google"
2. Complete Google OAuth flow
3. **Expected**: User authenticated and redirected to dashboard

### Test 4: OAuth Sign In (GitHub)
1. Click "Sign in with GitHub"
2. Complete GitHub OAuth flow
3. **Expected**: User authenticated and redirected to dashboard

### Test 5: Password Reset
1. Click "Forgot your password?"
2. Enter email address
3. Click "Send Reset Email"
4. Check email for reset link
5. Click link and set new password
6. **Expected**: Can log in with new password

### Test 6: Session Persistence
1. Log in successfully
2. Refresh the page (F5)
3. **Expected**: Still logged in

### Test 7: Protected Routes
1. Log out
2. Try to navigate to `/dashboard`
3. **Expected**: Redirected to login page

### Test 8: WebSocket Authentication
1. Log in successfully
2. Open browser console
3. **Expected**: See "WebSocket connected" and "Authenticated successfully"

### Test 9: Data Isolation
1. Create an agent as User A
2. Log out and log in as User B
3. **Expected**: User B cannot see User A's agent

### Test 10: Logout
1. Click "Sign Out" in header
2. **Expected**: Returned to login page, session cleared

## Troubleshooting

### Common Issues

#### "Invalid API Key"
- Check `SUPABASE_URL` and `SUPABASE_ANON_KEY` match dashboard values
- Ensure no trailing slashes in URLs

#### OAuth Not Working
- Verify redirect URLs in provider settings
- Check client ID and secret are correct
- Ensure provider is enabled in Supabase

#### RLS Policies Blocking Access
- Verify RLS is enabled on tables
- Check policies use `auth.uid()` correctly
- Test with service role key to bypass RLS

#### WebSocket Authentication Fails
- Ensure JWT token is passed in connection headers
- Check token hasn't expired
- Verify backend JWT validation logic

#### Session Not Persisting
- Check localStorage is not blocked
- Verify auth state listener is set up
- Ensure cookies are enabled if using SSR

## CLI Commands

### Generate TypeScript Types
```bash
npx supabase gen types typescript --project-id your-project-id > types/supabase.ts
```

### Test JWT Validation
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3010/api/auth/validate
```

### Check RLS Policies
```sql
SELECT * FROM pg_policies WHERE tablename = 'agents';
```

## Success Criteria

- [ ] Users can sign up with email/password
- [ ] Users can sign in with email/password
- [ ] Users can sign in with Google OAuth
- [ ] Users can sign in with GitHub OAuth
- [ ] Users can reset forgotten passwords
- [ ] Sessions persist across page refreshes
- [ ] Protected routes require authentication
- [ ] WebSocket connections require valid JWT
- [ ] Each user sees only their own data
- [ ] Logout clears session completely

## Next Steps

1. **Add MFA**: Enable multi-factor authentication
2. **Email Verification**: Require email confirmation
3. **User Roles**: Implement role-based access control
4. **Social Profiles**: Import profile data from OAuth providers
5. **Session Management**: Add "Remember Me" option
6. **Account Settings**: Build profile management UI
7. **Audit Logging**: Track all auth events
8. **Rate Limiting**: Prevent brute force attacks

## Resources

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Next.js Auth Helpers](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)
- [RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [JWT Debugger](https://jwt.io)