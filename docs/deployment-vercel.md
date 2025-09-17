# Vercel Deployment Guide for Onsembl.ai Frontend

This guide covers deploying the Onsembl.ai Control Center frontend (Next.js application) to Vercel, including environment configuration, Supabase client setup, and optimization for production.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub Repository**: Ensure your code is in a GitHub repository
3. **Node.js 20+**: For local development and testing
4. **Supabase Project**: Backend services configured
5. **Backend Deployment**: Ensure your backend is deployed to Fly.io first

## Initial Setup

### 1. Install Vercel CLI

```bash
# Install Vercel CLI globally
npm install -g vercel

# Or using yarn
yarn global add vercel

# Authenticate with Vercel
vercel login
```

### 2. Prepare Your Frontend Application

Navigate to your frontend directory:

```bash
cd frontend/
```

Ensure your `package.json` is configured correctly:

```json
{
  "name": "@onsembl/frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 3. Next.js Configuration

Create or update `frontend/next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features for better performance
  experimental: {
    optimizePackageImports: ['@radix-ui/react-icons'],
  },

  // Enable TypeScript strict mode
  typescript: {
    ignoreBuildErrors: false,
  },

  // ESLint configuration
  eslint: {
    ignoreDuringBuilds: false,
  },

  // Image optimization
  images: {
    domains: [
      'your-project-id.supabase.co', // Supabase storage
    ],
    formats: ['image/webp', 'image/avif'],
  },

  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },

  // Redirects for better UX
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/dashboard/agents',
        permanent: false,
      },
    ];
  },

  // Environment variables validation
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Output configuration for static export (if needed)
  // output: 'export',
  // trailingSlash: true,
  // images: { unoptimized: true },

  // Bundle analyzer (for optimization)
  webpack: (config, { dev, isServer }) => {
    // Bundle analyzer in development
    if (dev && !isServer) {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
      if (process.env.ANALYZE === 'true') {
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'server',
            openAnalyzer: true,
          })
        );
      }
    }

    return config;
  },
};

module.exports = nextConfig;
```

### 4. Environment Configuration

Create environment files for different stages:

**`.env.local` (local development):**
```bash
# Backend API endpoints
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3002

# Supabase configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Optional: Analytics and monitoring
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=GA-XXXXXXXXX
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Feature flags
NEXT_PUBLIC_ENABLE_DEBUG_MODE=true
NEXT_PUBLIC_ENABLE_BETA_FEATURES=false
```

**`.env.example` (template for team):**
```bash
# Frontend Environment Variables Template
# Copy to .env.local and fill in actual values

# Backend API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3002

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Analytics (Optional)
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=
NEXT_PUBLIC_SENTRY_DSN=

# Feature Flags
NEXT_PUBLIC_ENABLE_DEBUG_MODE=false
NEXT_PUBLIC_ENABLE_BETA_FEATURES=false
```

## Vercel Project Setup

### 1. Connect GitHub Repository

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. Select the `frontend` directory as the root directory

### 2. Project Configuration

Configure the following settings in Vercel:

**Build & Development Settings:**
- Framework Preset: `Next.js`
- Root Directory: `frontend` (if monorepo)
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`
- Development Command: `npm run dev`

**Node.js Version:**
- Set to `20.x` in project settings

### 3. Environment Variables

Add the following environment variables in Vercel dashboard:

**Production Environment:**
```bash
# Backend API (use your Fly.io deployment URL)
NEXT_PUBLIC_API_URL=https://your-backend-app.fly.dev
NEXT_PUBLIC_WS_URL=wss://your-backend-app.fly.dev

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Analytics and Monitoring
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=GA-XXXXXXXXX
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Feature Flags
NEXT_PUBLIC_ENABLE_DEBUG_MODE=false
NEXT_PUBLIC_ENABLE_BETA_FEATURES=false

# Build Configuration
NODE_ENV=production
```

**Preview Environment:**
```bash
# Use staging backend
NEXT_PUBLIC_API_URL=https://your-backend-staging.fly.dev
NEXT_PUBLIC_WS_URL=wss://your-backend-staging.fly.dev

# Same Supabase instance or staging instance
NEXT_PUBLIC_SUPABASE_URL=https://your-staging-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-staging-supabase-anon-key

# Enable debug features for preview
NEXT_PUBLIC_ENABLE_DEBUG_MODE=true
NEXT_PUBLIC_ENABLE_BETA_FEATURES=true
```

## Supabase Client Configuration

### 1. Create Supabase Client

Create `frontend/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Type-safe database interface
export type Database = {
  public: {
    Tables: {
      agents: {
        Row: {
          id: string;
          name: string;
          type: 'CLAUDE' | 'GEMINI' | 'CODEX';
          status: 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'ERROR';
          // ... other fields
        };
        Insert: {
          // ... insert fields
        };
        Update: {
          // ... update fields
        };
      };
      // ... other tables
    };
  };
};
```

### 2. Authentication Middleware

Create `frontend/middleware.ts`:

```typescript
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // Refresh session if expired
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Protect dashboard routes
  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', req.url));
    }
  }

  // Redirect authenticated users away from auth pages
  if (req.nextUrl.pathname.startsWith('/auth')) {
    if (session) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*', '/auth/:path*'],
};
```

## Performance Optimization

### 1. Code Splitting and Lazy Loading

Optimize component loading:

```typescript
// frontend/components/dynamic-imports.ts
import dynamic from 'next/dynamic';

// Lazy load heavy components
export const Terminal = dynamic(() => import('./Terminal'), {
  loading: () => <div>Loading terminal...</div>,
  ssr: false, // Disable SSR for terminal components
});

export const CodeEditor = dynamic(() => import('./CodeEditor'), {
  loading: () => <div>Loading editor...</div>,
  ssr: false,
});

export const TraceViewer = dynamic(() => import('./TraceViewer'), {
  loading: () => <div>Loading trace viewer...</div>,
});
```

### 2. Bundle Optimization

Create `frontend/.env.production`:

```bash
# Production optimizations
ANALYZE=false
NEXT_TELEMETRY_DISABLED=1
```

Add bundle analysis script to `package.json`:

```json
{
  "scripts": {
    "analyze": "ANALYZE=true npm run build",
    "build:analyze": "cross-env ANALYZE=true next build"
  }
}
```

### 3. Image Optimization

Configure image handling:

```typescript
// frontend/components/OptimizedImage.tsx
import Image from 'next/image';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  priority = false
}: OptimizedImageProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      placeholder="blur"
      blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
      className="rounded-lg"
    />
  );
}
```

## Custom Domain Configuration

### 1. Add Custom Domain

In Vercel dashboard:

1. Go to Project Settings → Domains
2. Add your domain (e.g., `app.onsembl.ai`)
3. Configure DNS records as instructed

### 2. DNS Configuration

Add these DNS records to your domain provider:

```
Type: CNAME
Name: app (or your subdomain)
Value: cname.vercel-dns.com

Type: A
Name: @ (for root domain)
Value: 76.76.19.61

Type: AAAA
Name: @ (for root domain)
Value: 2606:4700:90:0:76:76:19:61
```

### 3. SSL Certificate

Vercel automatically provisions SSL certificates. Verify by:

1. Checking certificate status in dashboard
2. Testing HTTPS access to your domain
3. Ensuring redirects work correctly

## Analytics and Monitoring

### 1. Vercel Analytics

Enable Vercel Analytics:

```typescript
// frontend/app/layout.tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

### 2. Google Analytics 4

Add GA4 tracking:

```typescript
// frontend/lib/analytics.ts
export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID;

export function pageview(url: string) {
  if (!GA_TRACKING_ID) return;

  window.gtag('config', GA_TRACKING_ID, {
    page_path: url,
  });
}

export function event({
  action,
  category,
  label,
  value,
}: {
  action: string;
  category: string;
  label?: string;
  value?: number;
}) {
  if (!GA_TRACKING_ID) return;

  window.gtag('event', action, {
    event_category: category,
    event_label: label,
    value: value,
  });
}
```

Include GA script in `_document.tsx`:

```typescript
// frontend/pages/_document.tsx
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID}');
                `,
              }}
            />
          </>
        )}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
```

### 3. Error Monitoring with Sentry

Install and configure Sentry:

```bash
npm install @sentry/nextjs
```

Create `frontend/sentry.client.config.js`:

```javascript
import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    debug: false,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    integrations: [
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}
```

## Edge Functions Setup

### 1. API Routes for Edge Runtime

Create edge API routes for better performance:

```typescript
// frontend/app/api/health/route.ts
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  return new Response(
    JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      region: process.env.VERCEL_REGION || 'unknown',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    }
  );
}
```

### 2. Middleware for Edge Runtime

Optimize middleware for edge:

```typescript
// frontend/middleware.ts (updated for edge)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  runtime: 'edge',
  matcher: ['/dashboard/:path*', '/auth/:path*'],
};

export function middleware(request: NextRequest) {
  // Add security headers
  const response = NextResponse.next();

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}
```

## Build and Deployment

### 1. Pre-deployment Checklist

Before deploying, ensure:

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Build test
npm run build

# Test the built app locally
npm run start
```

### 2. Automatic Deployment

Configure automatic deployments:

1. **Production**: Deploy from `main` branch
2. **Preview**: Deploy from pull requests
3. **Development**: Deploy from `develop` branch

### 3. Deploy Command

Manual deployment:

```bash
# Deploy to Vercel
vercel --prod

# Deploy with specific environment
vercel --prod --env NEXT_PUBLIC_API_URL=https://your-backend.fly.dev
```

## Testing in Production

### 1. Smoke Tests

Create basic production tests:

```bash
# Test health endpoint
curl https://your-app.vercel.app/api/health

# Test page loads
curl -I https://your-app.vercel.app/

# Test authentication flow
curl https://your-app.vercel.app/auth/login
```

### 2. Performance Testing

Use Lighthouse CI:

```bash
# Install Lighthouse CI
npm install -g @lhci/cli

# Run Lighthouse tests
lhci autorun --upload.target=temporary-public-storage
```

### 3. End-to-End Testing

Configure Playwright for production:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://your-app.vercel.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { browserName: 'chromium' },
    },
    {
      name: 'Mobile Safari',
      use: { browserName: 'webkit', isMobile: true },
    },
  ],
});
```

## Troubleshooting

### Common Issues

1. **Build Failures**
   ```bash
   # Check build logs in Vercel dashboard
   # Verify environment variables
   # Check TypeScript errors
   ```

2. **Runtime Errors**
   ```bash
   # Check function logs in Vercel dashboard
   # Verify API endpoints are accessible
   # Check CORS configuration
   ```

3. **Performance Issues**
   ```bash
   # Use Vercel Analytics to identify slow pages
   # Check bundle size with analyzer
   # Optimize images and fonts
   ```

4. **Authentication Issues**
   ```bash
   # Verify Supabase configuration
   # Check redirect URLs in Supabase dashboard
   # Ensure middleware is working correctly
   ```

### Debugging Tools

1. **Vercel CLI**
   ```bash
   # Pull environment variables
   vercel env pull .env.local

   # Check deployment logs
   vercel logs

   # Link local project
   vercel link
   ```

2. **Local Development**
   ```bash
   # Test with production environment
   npm run build && npm run start

   # Debug with production API
   NEXT_PUBLIC_API_URL=https://your-backend.fly.dev npm run dev
   ```

## Security Best Practices

### 1. Environment Variables

- Never commit `.env` files
- Use Vercel's environment variable encryption
- Rotate API keys regularly
- Use different keys for different environments

### 2. Content Security Policy

Add CSP headers:

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline' *.googletagmanager.com;
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: blob: *.supabase.co;
      connect-src 'self' *.supabase.co *.fly.dev;
      frame-src 'none';
    `.replace(/\s{2,}/g, ' ').trim()
  }
];

module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};
```

### 3. Rate Limiting

Implement client-side rate limiting:

```typescript
// frontend/lib/rate-limit.ts
const rateLimitMap = new Map();

export function rateLimit(ip: string, limit = 10, window = 60000) {
  const now = Date.now();
  const windowStart = now - window;

  const requests = rateLimitMap.get(ip) || [];
  const recentRequests = requests.filter((time: number) => time > windowStart);

  if (recentRequests.length >= limit) {
    return false;
  }

  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);

  return true;
}
```

## Performance Monitoring

### 1. Core Web Vitals

Monitor Core Web Vitals:

```typescript
// frontend/lib/web-vitals.ts
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

function sendToAnalytics(metric: any) {
  // Send to your analytics service
  if (window.gtag) {
    window.gtag('event', metric.name, {
      value: Math.round(metric.value),
      metric_id: metric.id,
      metric_value: metric.value,
      metric_delta: metric.delta,
    });
  }
}

export function reportWebVitals() {
  getCLS(sendToAnalytics);
  getFID(sendToAnalytics);
  getFCP(sendToAnalytics);
  getLCP(sendToAnalytics);
  getTTFB(sendToAnalytics);
}
```

### 2. Runtime Performance

Monitor runtime performance:

```typescript
// frontend/lib/performance.ts
export function measurePerformance(name: string, fn: () => void) {
  const start = performance.now();
  fn();
  const end = performance.now();

  console.log(`${name} took ${end - start} milliseconds`);

  // Send to analytics
  if (window.gtag) {
    window.gtag('event', 'performance_measure', {
      custom_parameter: name,
      value: Math.round(end - start),
    });
  }
}
```

## Production Checklist

Before going live:

- ✅ Environment variables configured for production
- ✅ Custom domain added and SSL working
- ✅ Analytics and monitoring set up
- ✅ Error tracking configured
- ✅ Performance optimizations applied
- ✅ Security headers configured
- ✅ CORS properly configured for backend
- ✅ Authentication flow tested
- ✅ Build and deployment pipeline working
- ✅ End-to-end tests passing
- ✅ Performance benchmarks met
- ✅ Accessibility standards met

## Next Steps

After successful deployment:

1. Set up monitoring dashboards
2. Configure alerts for errors and performance issues
3. Implement A/B testing framework
4. Set up staging environment
5. Configure CI/CD pipeline
6. Document operational procedures
7. Plan for scaling and optimization

For backend deployment, see the [Fly.io Deployment Guide](./deployment-flyio.md).