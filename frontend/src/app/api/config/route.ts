/**
 * API route to verify environment configuration
 * Accessible at /api/config for debugging purposes
 */

import { NextResponse } from 'next/server';
import { config, validateConfig } from '@/services/config';

export async function GET() {
  try {
    // Validate configuration
    validateConfig();

    // Return configuration info (sanitized for security)
    return NextResponse.json({
      success: true,
      config: {
        environment: config.environment,
        api: {
          baseUrl: config.api.baseUrl,
          timeout: config.api.timeout,
        },
        websocket: {
          baseUrl: config.websocket.baseUrl,
          endpoints: config.websocket.endpoints,
        },
        features: {
          debugMode: config.features.debugMode,
        },
      },
      envVars: {
        NEXT_PUBLIC_ENV: process.env['NEXT_PUBLIC_ENV'] || 'not set',
        NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'] || 'not set',
        NEXT_PUBLIC_WS_URL: process.env['NEXT_PUBLIC_WS_URL'] || 'not set',
        NEXT_PUBLIC_API_TIMEOUT: process.env['NEXT_PUBLIC_API_TIMEOUT'] || 'not set',
        NEXT_PUBLIC_DEBUG: process.env['NEXT_PUBLIC_DEBUG'] || 'not set',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Configuration validation failed',
      },
      { status: 500 }
    );
  }
}