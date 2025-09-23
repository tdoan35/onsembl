# Authentication System Documentation

## Overview

Onsembl.ai uses Supabase Authentication with email/password and OAuth providers (Google, GitHub). The system implements Row Level Security (RLS) for multi-tenant data isolation.

## Authentication Requirements

### Email Requirements
- **Format**: Valid email address (RFC 5322)
- **Processing**: Automatically converted to lowercase and trimmed
- **Maximum Length**: 255 characters
- **Uniqueness**: Enforced by Supabase Auth

### Password Requirements

#### Supabase Default Settings
- **Minimum Length**: 6 characters (Supabase default)
- **Maximum Length**: 72 characters (bcrypt limitation)
- **Character Set**: Any UTF-8 characters allowed

#### Recommended Password Strength
For enhanced security, we recommend passwords that include:
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- Special characters (optional but recommended)

### Username Requirements (Optional)
- **Minimum Length**: 3 characters
- **Maximum Length**: 30 characters
- **Allowed Characters**: Letters (a-z, A-Z), numbers (0-9), and underscores (_)
- **Format Regex**: `^[a-zA-Z0-9_]+$`
- **Database Constraint**: CHECK constraint on `user_profiles.username` column

## Database Schema

### User Profiles Table
```sql
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  avatar_url TEXT,
  full_name TEXT,
  bio TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Username format constraint
ALTER TABLE public.user_profiles
ADD CONSTRAINT username_format CHECK (
  username IS NULL OR (
    LENGTH(username) BETWEEN 3 AND 30 AND
    username ~ '^[a-zA-Z0-9_]+$'
  )
);
```

## Row Level Security (RLS)

All tables have RLS policies to ensure users can only access their own data:

### User Profiles RLS
- Users can view their own profile
- Users can update their own profile
- Users can create their own profile on registration
- No delete policy (cascade delete with auth.users)

### Agents Table RLS
- Users can only view their own agents
- Users can only create agents assigned to themselves
- Users can only update their own agents
- Users can only delete their own agents

### Commands Table RLS
- Users can only view their own commands
- Users can only create commands for their own agents
- Users can only update their own commands
- Users can only delete their own commands

### Audit Logs RLS
- Users can only view their own audit logs
- Only service role can insert audit logs

## Authentication Flow

### Email/Password Sign Up
1. User provides email, optional username, and password
2. Frontend validates input against schemas
3. Supabase creates auth.users entry
4. Backend creates user_profiles entry
5. Confirmation email sent (if enabled)
6. Session created after confirmation

### Email/Password Sign In
1. User provides email and password
2. Supabase validates credentials
3. JWT tokens generated (access + refresh)
4. Session established
5. WebSocket connection authenticated

### OAuth Flow (Google/GitHub)
1. User clicks OAuth provider button
2. Redirect to provider's auth page
3. User authorizes application
4. Callback to `/auth/callback` with code
5. Code exchanged for tokens
6. User profile created/updated
7. Session established

### Token Management
- **Access Token**: Valid for 1 hour (default)
- **Refresh Token**: Used to obtain new access tokens
- **Auto-refresh**: Tokens refreshed 5 minutes before expiry
- **WebSocket**: Reconnects with fresh token on refresh

## WebSocket Authentication

### Connection Flow
1. Client connects with token as query parameter
2. Backend validates token on connection
3. DASHBOARD_INIT message sent with userId
4. Backend verifies userId matches token
5. Connection established with subscriptions

### Token Refresh
- TOKEN_REFRESH message sent when token updated
- WebSocket reconnects automatically with new token
- No message loss during reconnection

## Security Features

### Password Security
- Passwords hashed using bcrypt
- Never stored in plain text
- Salt automatically generated per password
- Cost factor: 10 (default)

### Session Security
- JWT tokens signed with HS256
- Tokens include expiry timestamps
- Refresh tokens rotated on use
- Sessions persisted in localStorage (optional)

### Rate Limiting
- Sign-in attempts: 5 per 5 minutes per IP
- Email requests: 3 per hour per email
- Token refresh: 10 per hour per user

### Audit Logging
All authentication events are logged:
- Login attempts (success/failure)
- Logout events
- Password changes
- Profile updates
- Token refreshes
- WebSocket connections

## Frontend Implementation

### Validation Library
Located at: `frontend/src/lib/auth-validation.ts`

```typescript
import {
  emailSchema,
  usernameSchema,
  passwordSchema,
  loginSchema,
  signupSchema,
  getPasswordStrength,
  isValidEmail,
  isValidUsername,
  isValidPassword
} from '@/lib/auth-validation';
```

### Components
- `AuthModal`: Login/signup modal with forms
- `AuthProvider`: Context provider for auth state
- `ProtectedRoute`: Route wrapper requiring auth
- `UserProfileMenu`: User dropdown menu
- `PasswordStrengthIndicator`: Visual password strength

### Hooks
- `useAuth()`: Access auth state and methods
- `useApiClient()`: Auto-sync API client with auth

## Backend Implementation

### Middleware
- `authenticateSupabase`: Validates JWT tokens
- Extracts user from token
- Attaches to request context
- Logs auth events

### Services
- `AuthService`: Handles auth operations
- Token validation
- Session management
- Audit logging

### WebSocket Auth
- Token validated on connection
- User ID verification
- Automatic token refresh
- Graceful disconnection on logout

## Testing

### E2E Tests
- `supabase-auth.spec.ts`: Full auth flow tests
- `websocket-auth.spec.ts`: WebSocket auth tests
- `auth.spec.ts`: Legacy magic link tests

### Test Coverage
- Login/signup validation
- OAuth flow simulation
- Protected route access
- Session persistence
- Token refresh
- WebSocket connection/disconnection
- Error handling
- Rate limiting

## Environment Variables

### Required
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Backend only
SUPABASE_SERVICE_ROLE_KEY=your-service-key
```

### Optional
```env
# Session Configuration
SESSION_EXPIRY=3600 # seconds (default: 3600)
REFRESH_BUFFER=300 # seconds before expiry to refresh (default: 300)

# Security
ENABLE_RATE_LIMITING=true
MAX_LOGIN_ATTEMPTS=5
RATE_LIMIT_WINDOW=300 # seconds
```

## Troubleshooting

### Common Issues

#### "Invalid authentication token"
- Token may be expired - check expiry time
- Token may be malformed - verify JWT structure
- Service key vs anon key mismatch

#### "Username already taken"
- Username must be unique across all users
- Check case sensitivity (usernames are case-sensitive)

#### "Password too weak"
- Must be at least 6 characters
- Consider implementing stronger requirements

#### "WebSocket won't connect"
- Check if user is authenticated
- Verify token is being sent in connection
- Check CORS settings

#### "RLS policy violation"
- Ensure user_id is set on records
- Check RLS policies are enabled
- Verify service role key for admin operations

### Debug Mode

Enable debug logging:
```typescript
// Frontend
localStorage.setItem('debug', 'onsembl:*');

// Backend
DEBUG=onsembl:* npm run dev
```

## Migration Guide

### From Magic Links to Email/Password

1. Update database schema:
```bash
npx supabase migration up
```

2. Update environment variables:
```bash
# Add to .env.local
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

3. Update auth components:
- Replace magic link forms with email/password
- Add OAuth provider buttons
- Update validation schemas

4. Test thoroughly:
```bash
npm run test:e2e
```

## Best Practices

1. **Never expose service role key** in frontend code
2. **Always validate** input on both frontend and backend
3. **Use HTTPS** in production for all auth endpoints
4. **Implement rate limiting** to prevent abuse
5. **Log all auth events** for security auditing
6. **Rotate keys regularly** in production
7. **Use strong passwords** for admin accounts
8. **Enable 2FA** for sensitive operations (future)
9. **Monitor failed login attempts** for security
10. **Keep Supabase SDK updated** for security patches