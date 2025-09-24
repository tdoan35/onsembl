/**
 * Cross-platform credential storage for CLI tokens
 *
 * Uses OS keychain/credential store when available, falls back to encrypted file storage
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import * as crypto from 'crypto';

export interface StoredCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user_id: string;
  scopes: string[];
  server_url: string;
}

export interface CredentialStore {
  store(credentials: StoredCredentials): Promise<void>;
  retrieve(): Promise<StoredCredentials | null>;
  delete(): Promise<void>;
  exists(): Promise<boolean>;
}

/**
 * Keychain-based credential store for macOS/Linux/Windows
 */
class KeychainCredentialStore implements CredentialStore {
  private serviceName = 'onsembl-cli';
  private accountName = 'default';

  async store(credentials: StoredCredentials): Promise<void> {
    try {
      const keytar = await this.getKeytar();
      if (!keytar) {
        throw new Error('Keychain not available');
      }

      await keytar.setPassword(
        this.serviceName,
        this.accountName,
        JSON.stringify(credentials)
      );
    } catch (error) {
      throw new Error(`Failed to store credentials in keychain: ${error}`);
    }
  }

  async retrieve(): Promise<StoredCredentials | null> {
    try {
      const keytar = await this.getKeytar();
      if (!keytar) {
        return null;
      }

      const credentialsJson = await keytar.getPassword(this.serviceName, this.accountName);
      if (!credentialsJson) {
        return null;
      }

      return JSON.parse(credentialsJson);
    } catch (error) {
      // Return null instead of throwing to allow fallback
      return null;
    }
  }

  async delete(): Promise<void> {
    try {
      const keytar = await this.getKeytar();
      if (!keytar) {
        return;
      }

      await keytar.deletePassword(this.serviceName, this.accountName);
    } catch (error) {
      // Ignore deletion errors
    }
  }

  async exists(): Promise<boolean> {
    const credentials = await this.retrieve();
    return credentials !== null;
  }

  private async getKeytar() {
    try {
      // Dynamic import to handle optional dependency
      return await import('keytar');
    } catch (error) {
      return null;
    }
  }
}

/**
 * File-based encrypted credential store (fallback)
 */
class FileCredentialStore implements CredentialStore {
  private filePath: string;
  private keyPath: string;

  constructor() {
    const configDir = this.getConfigDir();
    this.filePath = path.join(configDir, 'credentials.enc');
    this.keyPath = path.join(configDir, '.key');

    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }
  }

  async store(credentials: StoredCredentials): Promise<void> {
    try {
      const key = await this.getOrCreateKey();
      const encrypted = this.encrypt(JSON.stringify(credentials), key);

      await promisify(fs.writeFile)(this.filePath, encrypted, { mode: 0o600 });
    } catch (error) {
      throw new Error(`Failed to store credentials to file: ${error}`);
    }
  }

  async retrieve(): Promise<StoredCredentials | null> {
    try {
      if (!fs.existsSync(this.filePath)) {
        return null;
      }

      const key = await this.getOrCreateKey();
      const encrypted = await promisify(fs.readFile)(this.filePath, 'utf8');
      const decrypted = this.decrypt(encrypted, key);

      return JSON.parse(decrypted);
    } catch (error) {
      return null;
    }
  }

  async delete(): Promise<void> {
    try {
      if (fs.existsSync(this.filePath)) {
        await promisify(fs.unlink)(this.filePath);
      }
      if (fs.existsSync(this.keyPath)) {
        await promisify(fs.unlink)(this.keyPath);
      }
    } catch (error) {
      // Ignore deletion errors
    }
  }

  async exists(): Promise<boolean> {
    return fs.existsSync(this.filePath);
  }

  private getConfigDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.onsembl');
  }

  private async getOrCreateKey(): Promise<string> {
    try {
      if (fs.existsSync(this.keyPath)) {
        return await promisify(fs.readFile)(this.keyPath, 'utf8');
      }

      // Generate new key
      const key = crypto.randomBytes(32).toString('hex');
      await promisify(fs.writeFile)(this.keyPath, key, { mode: 0o600 });
      return key;
    } catch (error) {
      throw new Error(`Failed to manage encryption key: ${error}`);
    }
  }

  private encrypt(text: string, key: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', key);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedData: string, key: string): string {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0] || '', 'hex');
    const encrypted = parts[1] || '';
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

/**
 * Create appropriate credential store for the current platform
 */
export function createCredentialStore(): CredentialStore {
  // Try keychain first, fall back to file store
  return new CompositeCredentialStore([
    new KeychainCredentialStore(),
    new FileCredentialStore()
  ]);
}

/**
 * Composite store that tries multiple backends
 */
class CompositeCredentialStore implements CredentialStore {
  constructor(private stores: CredentialStore[]) {}

  async store(credentials: StoredCredentials): Promise<void> {
    let lastError: Error | null = null;

    for (const store of this.stores) {
      try {
        await store.store(credentials);
        return; // Success
      } catch (error) {
        lastError = error as Error;
        continue;
      }
    }

    throw lastError || new Error('All credential stores failed');
  }

  async retrieve(): Promise<StoredCredentials | null> {
    for (const store of this.stores) {
      try {
        const credentials = await store.retrieve();
        if (credentials) {
          return credentials;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  async delete(): Promise<void> {
    // Delete from all stores
    await Promise.allSettled(
      this.stores.map(store => store.delete())
    );
  }

  async exists(): Promise<boolean> {
    for (const store of this.stores) {
      try {
        if (await store.exists()) {
          return true;
        }
      } catch (error) {
        continue;
      }
    }

    return false;
  }
}

export default createCredentialStore;