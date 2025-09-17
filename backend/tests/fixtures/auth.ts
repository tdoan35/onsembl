import { v4 as uuidv4 } from 'uuid';

export const authFixtures = {
  validEmail: 'test@onsembl.ai',
  invalidEmail: 'not-an-email',

  magicLinkRequest: {
    email: 'test@onsembl.ai',
  },

  verifyRequest: {
    token: 'valid-magic-link-token',
  },

  authResponse: {
    accessToken: expect.any(String),
    refreshToken: expect.any(String),
    expiresIn: expect.any(Number),
    user: {
      id: expect.any(String),
      email: 'test@onsembl.ai',
      createdAt: expect.any(String),
    },
  },

  messageResponse: {
    message: expect.any(String),
  },

  errorResponse: {
    error: expect.any(String),
  },

  generateMagicLinkToken: (email: string = 'test@onsembl.ai'): string => {
    return Buffer.from(JSON.stringify({
      email,
      timestamp: Date.now(),
      nonce: uuidv4(),
    })).toString('base64');
  },

  generateJWT: (payload: any = {}): string => {
    const header = Buffer.from(JSON.stringify({
      alg: 'HS256',
      typ: 'JWT',
    })).toString('base64');

    const defaultPayload = {
      userId: uuidv4(),
      email: 'test@onsembl.ai',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60),
    };

    const body = Buffer.from(JSON.stringify({
      ...defaultPayload,
      ...payload,
    })).toString('base64');

    const signature = 'test-signature';

    return `${header}.${body}.${signature}`;
  },
};