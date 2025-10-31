/**
 * Authentication Manager
 *
 * High-level interface for CLI authentication combining OAuth device flow
 * with secure credential storage and automatic token refresh
 */

import CLIAuth, { CLIAuthError, TokenResponse } from './cli-auth.js';
import createCredentialStore, { CredentialStore, StoredCredentials } from './credential-store.js';
import chalk from 'chalk';

export interface AuthManagerOptions {
  serverUrl?: string;
  clientId?: string;
  credentialStore?: CredentialStore;
}

export interface AuthStatus {
  authenticated: boolean;
  user_id?: string;
  scopes?: string[];
  expires_at?: number;
  server_url?: string;
}

export class AuthManager {
  private cliAuth: CLIAuth;
  private credentialStore: CredentialStore;

  constructor(options: AuthManagerOptions = {}) {
    const serverUrl = options.serverUrl || process.env['ONSEMBL_SERVER_URL'] || 'http://localhost:3001';

    this.cliAuth = new CLIAuth(serverUrl, options.clientId);
    this.credentialStore = options.credentialStore || createCredentialStore();
  }

  /**
   * Perform login flow
   */
  async login(options: {
    scope?: string;
    openBrowser?: boolean;
    force?: boolean;
  } = {}): Promise<void> {
    const { force = false } = options;

    // Check if already authenticated (unless forced)
    if (!force) {
      const status = await this.getAuthStatus();
      if (status.authenticated) {
        console.log(chalk.green('✓ Already authenticated'));
        console.log(chalk.gray(`  User ID: ${status.user_id}`));
        console.log(chalk.gray(`  Server: ${status.server_url}`));
        return;
      }
    }

    try {
      // Perform OAuth device flow
      const tokens = await this.cliAuth.login(options);

      // Validate and store credentials
      const validation = await this.cliAuth.validateToken(tokens.access_token);

      const credentials: StoredCredentials = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
        user_id: validation.user_id,
        scopes: validation.scopes,
        server_url: this.cliAuth['baseUrl'] // Access private property
      };

      await this.credentialStore.store(credentials);

      console.log(chalk.green('✓ Credentials saved securely'));
      console.log(chalk.gray(`  User ID: ${validation.user_id}`));
      console.log(chalk.gray(`  Scopes: ${validation.scopes.join(', ')}`));

    } catch (error) {
      if (error instanceof CLIAuthError) {
        throw new Error(`Authentication failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Logout and clear stored credentials
   */
  async logout(): Promise<void> {
    const credentials = await this.credentialStore.retrieve();

    if (credentials) {
      try {
        // Revoke tokens on server
        await this.cliAuth.revokeToken(credentials.access_token, 'access_token');
        await this.cliAuth.revokeToken(credentials.refresh_token, 'refresh_token');
      } catch (error) {
        // Continue with logout even if revocation fails
        console.warn(chalk.yellow('⚠ Failed to revoke tokens on server'));
      }
    }

    // Clear local credentials
    await this.credentialStore.delete();
    console.log(chalk.green('✓ Logged out successfully'));
  }

  /**
   * Get current authentication status
   */
  async getAuthStatus(): Promise<AuthStatus> {
    const credentials = await this.credentialStore.retrieve();

    if (!credentials) {
      return { authenticated: false };
    }

    // Check if token is expired (with 5 minute buffer)
    const now = Math.floor(Date.now() / 1000);
    const buffer = 5 * 60; // 5 minutes

    if (credentials.expires_at <= now + buffer) {
      // Try to refresh token
      try {
        await this.refreshTokenIfNeeded();
        const updatedCredentials = await this.credentialStore.retrieve();
        if (updatedCredentials) {
          return {
            authenticated: true,
            user_id: updatedCredentials.user_id,
            scopes: updatedCredentials.scopes,
            expires_at: updatedCredentials.expires_at,
            server_url: updatedCredentials.server_url
          };
        }
      } catch (error) {
        // Refresh failed, consider unauthenticated
        return { authenticated: false };
      }
    }

    return {
      authenticated: true,
      user_id: credentials.user_id,
      scopes: credentials.scopes,
      expires_at: credentials.expires_at,
      server_url: credentials.server_url
    };
  }

  /**
   * Get valid access token (refreshes if needed)
   */
  async getAccessToken(): Promise<string> {
    const credentials = await this.credentialStore.retrieve();

    if (!credentials) {
      throw new Error('Not authenticated. Please run: onsembl auth login');
    }

    // Check if token needs refresh (with 5 minute buffer)
    const now = Math.floor(Date.now() / 1000);
    const buffer = 5 * 60; // 5 minutes

    if (credentials.expires_at <= now + buffer) {
      await this.refreshTokenIfNeeded();
      const updatedCredentials = await this.credentialStore.retrieve();
      if (!updatedCredentials) {
        throw new Error('Failed to refresh token. Please re-authenticate.');
      }
      return updatedCredentials.access_token;
    }

    return credentials.access_token;
  }

  /**
   * Refresh access token if needed
   */
  private async refreshTokenIfNeeded(): Promise<void> {
    const credentials = await this.credentialStore.retrieve();

    if (!credentials) {
      throw new Error('No stored credentials to refresh');
    }

    try {
      const tokens = await this.cliAuth.refreshToken(credentials.refresh_token);

      const updatedCredentials: StoredCredentials = {
        ...credentials,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in
      };

      await this.credentialStore.store(updatedCredentials);
    } catch (error) {
      // Clear invalid credentials
      await this.credentialStore.delete();
      throw new Error('Token refresh failed. Please re-authenticate.');
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const status = await this.getAuthStatus();
    return status.authenticated;
  }

  /**
   * Get current user ID
   */
  async getCurrentUserId(): Promise<string> {
    const status = await this.getAuthStatus();
    if (!status.authenticated || !status.user_id) {
      throw new Error('Not authenticated. Please run: onsembl auth login');
    }
    return status.user_id;
  }
}

export default AuthManager;