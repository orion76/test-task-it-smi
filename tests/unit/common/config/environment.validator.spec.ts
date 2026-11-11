import { validateEnvironment } from '@src/common/config/environment.validator';

/**
 * The validator reads `config/environment.schema.yml` from the project root and compiles it once per
 * process, so every test passes a fresh object: AJV coerces the values in place and fills in the
 * defaults, and an object reused by two tests would arrive already coerced.
 */

const DATABASE_URL = 'postgresql://user:password@localhost:5432/it_smi?schema=public';

/** Runs the validator and returns the thrown message, failing the test when nothing was thrown. */
function messageOf(config: Record<string, unknown>): string {
  try {
    validateEnvironment(config);
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }

    throw error;
  }

  throw new Error('expected the configuration to be rejected');
}

describe('validateEnvironment', () => {
  it('accepts a minimal configuration and fills in the defaults', () => {
    const config = validateEnvironment({ DATABASE_URL });

    expect(config.DATABASE_URL).toBe(DATABASE_URL);
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
  });

  it('rejects a configuration without DATABASE_URL', () => {
    expect(messageOf({})).toBe('DATABASE_URL is required');
  });

  it('rejects an empty DATABASE_URL as a missing one', () => {
    expect(messageOf({ DATABASE_URL: '' })).toBe('DATABASE_URL is required');
  });

  it('reports a non-numeric PORT as an integer of the accepted range', () => {
    const message = messageOf({ DATABASE_URL, PORT: 'abc' });

    expect(message).toBe('PORT must be an integer between 1 and 65535');
  });

  it('reports a PORT above the maximum as out of range', () => {
    const message = messageOf({ DATABASE_URL, PORT: '70000' });

    expect(message).toBe('PORT must be less than or equal to 65535');
  });

  it('reports a PORT below the minimum as out of range', () => {
    const message = messageOf({ DATABASE_URL, PORT: '0' });

    expect(message).toBe('PORT must be greater than or equal to 1');
  });

  it('reports an unknown NODE_ENV with the allowed values', () => {
    const message = messageOf({ DATABASE_URL, NODE_ENV: 'staging' });

    expect(message).toBe('NODE_ENV must be one of: development, production, test');
  });

  it('coerces PORT to a number', () => {
    const config = validateEnvironment({ DATABASE_URL, PORT: '8080' });

    expect(config.PORT).toBe(8080);
    expect(typeof config.PORT).toBe('number');
  });

  it('keeps a valid NODE_ENV', () => {
    const config = validateEnvironment({ DATABASE_URL, NODE_ENV: 'test' });

    expect(config.NODE_ENV).toBe('test');
  });

  it('joins every violation of one configuration into a single message', () => {
    const message = messageOf({ PORT: 'abc', NODE_ENV: 'staging' });

    expect(message).toContain('DATABASE_URL is required');
    expect(message).toContain('PORT must be an integer between 1 and 65535');
    expect(message).toContain('NODE_ENV must be one of: development, production, test');
  });
});
