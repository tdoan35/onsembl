/**
 * CLI OAuth Device Flow Authentication
 *
 * Implements the OAuth device flow for CLI authentication following industry standards
 * (similar to `gh auth login`, `docker login`, etc.)
 */

import open from 'open';
import chalk from 'chalk';
import ora from 'ora';

export interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface TokenValidationResponse {
  valid: boolean;
  user_id: string;
  scopes: string[];
  expires_at: number;
}

export class CLIAuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'CLIAuthError';
  }
}

export class CLIAuth {
  private baseUrl: string;
  private clientId: string;

  constructor(baseUrl: string = 'http://localhost:3001', clientId: string = 'onsembl-cli') {
    this.baseUrl = baseUrl;
    this.clientId = clientId;
  }

  /**
   * Start OAuth device flow authentication
   */
  async login(options: {
    scope?: string;
    openBrowser?: boolean;
    timeout?: number;
  } = {}): Promise<TokenResponse> {
    const {
      scope = 'agent:manage',
      openBrowser = true,
      timeout = 600 // 10 minutes
    } = options;

    console.log(chalk.blue('🔐 Starting Onsembl CLI authentication...'));

    // Step 1: Request device authorization
    const deviceAuth = await this.requestDeviceAuthorization(scope);

    // Step 2: Display user code and verification URL
    console.log('\n' + chalk.yellow('Please complete the authentication in your browser:'));
    console.log('');
    console.log(chalk.white(`  ${chalk.bold('User Code:')} ${chalk.cyan(deviceAuth.user_code)}`));
    console.log(chalk.white(`  ${chalk.bold('Verification URL:')} ${chalk.cyan(deviceAuth.verification_uri)}`));
    console.log('');

    // Step 3: Open browser if requested
    if (openBrowser) {
      try {
        await open(deviceAuth.verification_uri_complete);
        console.log(chalk.green('✓ Browser opened automatically'));
      } catch (error) {
        console.log(chalk.yellow('⚠ Could not open browser automatically'));
      }
    }

    console.log(chalk.gray('Waiting for authentication...'));

    // Step 4: Poll for token
    const tokens = await this.pollForTokens(deviceAuth, timeout);

    console.log(chalk.green('✓ Authentication successful!'));
    return tokens;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const response = await fetch(`${this.baseUrl}/api/auth/cli/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new CLIAuthError(
        `Failed to refresh token: ${error}`,
        'REFRESH_FAILED',
        response.status
      );
    }

    return response.json() as Promise<TokenResponse>;
  }

  /**
   * Validate access token
   */
  async validateToken(accessToken: string): Promise<TokenValidationResponse> {
    const response = await fetch(`${this.baseUrl}/api/auth/cli/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: accessToken
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new CLIAuthError(
        `Failed to validate token: ${error}`,
        'VALIDATION_FAILED',
        response.status
      );
    }

    return response.json() as Promise<TokenValidationResponse>;
  }

  /**
   * Revoke access or refresh token
   */
  async revokeToken(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/auth/cli/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        ...(tokenTypeHint && { token_type_hint: tokenTypeHint })
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new CLIAuthError(
        `Failed to revoke token: ${error}`,
        'REVOKE_FAILED',
        response.status
      );
    }
  }

  /**
   * Request device authorization from server
   */
  private async requestDeviceAuthorization(scope: string): Promise<DeviceAuthResponse> {
    const response = await fetch(`${this.baseUrl}/api/auth/device/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        scope
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new CLIAuthError(
        `Failed to start device authorization: ${error}`,
        'DEVICE_AUTH_FAILED',
        response.status
      );
    }

    return response.json() as Promise<DeviceAuthResponse>;
  }

  /**
   * Poll for access tokens after user authorization
   */
  private async pollForTokens(deviceAuth: DeviceAuthResponse, timeout: number): Promise<TokenResponse> {
    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    const pollInterval = deviceAuth.interval * 1000; // Convert to milliseconds

    const spinner = ora('Waiting for authorization...').start();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`${this.baseUrl}/api/auth/device/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            device_code: deviceAuth.device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
          }),
        });

        if (response.ok) {
          spinner.succeed('Authorization completed');
          return response.json() as Promise<TokenResponse>;
        }

        const errorData = await response.json() as { error: string; error_description?: string };

        if (errorData.error === 'authorization_pending') {
          // Still waiting for user to authorize
          await this.sleep(pollInterval);
          continue;
        } else if (errorData.error === 'slow_down') {
          // Server requested slower polling
          await this.sleep(pollInterval * 2);
          continue;
        } else if (errorData.error === 'expired_token') {
          spinner.fail('Device code expired');
          throw new CLIAuthError(
            'Device code has expired. Please try again.',
            'DEVICE_CODE_EXPIRED'
          );
        } else {
          spinner.fail('Authorization failed');
          throw new CLIAuthError(
            `Authorization failed: ${errorData.error_description || errorData.error}`,
            'AUTH_FAILED'
          );
        }
      } catch (error) {
        if (error instanceof CLIAuthError) {
          throw error;
        }
        // Network error, continue polling
        await this.sleep(pollInterval);
      }
    }

    spinner.fail('Authentication timed out');
    throw new CLIAuthError(
      'Authentication timed out. Please try again.',
      'TIMEOUT'
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default CLIAuth;