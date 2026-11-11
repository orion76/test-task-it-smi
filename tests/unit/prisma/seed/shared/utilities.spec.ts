/**
 * The shared helpers of the seed engine: a calendar date is stored as midnight UTC, a value from
 * YAML is narrowed to a mapping, a path is displayed relative to the working directory and a failure
 * gets the place it happened with the original error preserved. All four are what makes a failed
 * container start point at the exact thing to fix.
 */
import { join, resolve } from 'node:path';

import { parseDateValue } from '@seed/shared/date-value.parser';
import { toErrorMessage } from '@seed/shared/error-message';
import { withContext } from '@seed/shared/error-context';
import { formatPath, toDisplayPath } from '@seed/shared/path';
import { isRecord } from '@seed/shared/record';
import { SeedError } from '@seed/shared/seed.error';

describe('parseDateValue', () => {
  it('parses a calendar date as midnight UTC, independent of the process time zone', () => {
    const date = parseDateValue('2021-03-01');

    expect(date.toISOString()).toBe('2021-03-01T00:00:00.000Z');
    expect(date.getTime()).toBe(Date.UTC(2021, 2, 1));
    expect(date.getUTCHours()).toBe(0);
  });
});

describe('isRecord', () => {
  it('accepts a plain object', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ name: 'x' })).toBe(true);
  });

  it('rejects null, arrays and scalars', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe('toDisplayPath', () => {
  it('shows a path under the working directory as relative', () => {
    expect(toDisplayPath('data/profile.yml')).toBe('data/profile.yml');
    expect(toDisplayPath(join(process.cwd(), 'config', 'api-fields.yml'))).toBe(
      'config/api-fields.yml',
    );
  });

  it('keeps an absolute path resolveable for a file outside the working directory', () => {
    const display = toDisplayPath('/etc/passwd');

    expect(resolve(display)).toBe(resolve('/etc/passwd'));
  });
});

describe('formatPath', () => {
  it('names the document root for no segments', () => {
    expect(formatPath([])).toBe('root');
  });

  it('indexes collections with brackets and joins the rest with dots', () => {
    expect(formatPath(['profile', 'skills', '0', 'name'])).toBe('profile.skills[0].name');
    expect(formatPath(['profile', 'links'])).toBe('profile.links');
  });
});

describe('withContext', () => {
  it('prefixes the first line once and indents the rest of a multi-line message', () => {
    const cause = new Error('head\nsecond line');

    const error = withContext('config/api-fields.yml', cause);

    expect(error).toBeInstanceOf(SeedError);
    expect(error.message).toBe('config/api-fields.yml: head\n  second line');
    expect(error.cause).toBe(cause);
  });

  it('keeps the original error as the cause', () => {
    const cause = new Error('boom');
    const error = withContext('profile.skills[0]', cause);

    expect(error.cause).toBe(cause);
  });

  it('renders a non-Error value and keeps it as the cause', () => {
    const error = withContext('version', 'unexpected');

    expect(error.message).toBe('version: unexpected');
    expect(error.cause).toBe('unexpected');
  });
});

describe('toErrorMessage', () => {
  it('renders an Error by its message', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('renders a non-Error value as a string', () => {
    expect(toErrorMessage('raw')).toBe('raw');
    expect(toErrorMessage(42)).toBe('42');
    expect(toErrorMessage(null)).toBe('null');
    expect(toErrorMessage(undefined)).toBe('undefined');
  });
});
