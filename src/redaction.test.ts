import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_REDACTOR,
  REDACTED,
  compilePattern,
  createRedactor,
  readRedaction,
  resolveRedaction,
  writeRedaction,
  type RedactionSettings,
} from './redaction';

const only = (settings: Partial<RedactionSettings>) =>
  createRedactor({ enabled: true, countries: [], patterns: [], ...settings });

describe('default screening (Vietnam)', () => {
  it('screens e-mail, phone and citizen-ID shaped text inside any string', () => {
    expect(DEFAULT_REDACTOR.text('Gọi 0912 345 678 hoặc +84912345678, mail a.b@tfs.com.vn, CCCD 001234567890')).toBe(
      `Gọi ${REDACTED} hoặc ${REDACTED}, mail ${REDACTED}, CCCD ${REDACTED}`,
    );
  });

  it('leaves amounts, dates and codes alone', () => {
    expect(DEFAULT_REDACTOR.text('Dư nợ 150000000 đ, 1.250.000.000 đ, hạn 02.03.2026, mã HD123456789012')).toBe(
      'Dư nợ 150000000 đ, 1.250.000.000 đ, hạn 02.03.2026, mã HD123456789012',
    );
    expect(DEFAULT_REDACTOR.isPiiKey('outstandingAmount')).toBe(false);
    expect(DEFAULT_REDACTOR.isPiiKey('creditorCode')).toBe(false);
  });

  it('screens country key names only for the selected countries', () => {
    expect(DEFAULT_REDACTOR.isPiiKey('soCccd')).toBe(true);
    expect(only({}).isPiiKey('soCccd')).toBe(false);
    expect(only({}).isPiiKey('phoneNumber')).toBe(true);
  });
});

describe('United States', () => {
  const us = only({ countries: ['us'] });

  it('screens phone numbers and dashed SSNs', () => {
    expect(us.text('Call (415) 555-0132, +1 415.555.0132 or 4155550132; SSN 123-45-6789')).toBe(
      `Call ${REDACTED}, ${REDACTED} or ${REDACTED}; SSN ${REDACTED}`,
    );
    expect(us.isPiiKey('customerSsn')).toBe(true);
    expect(us.isPiiKey('className')).toBe(false);
  });

  it('leaves amounts, dates and impossible numbers alone', () => {
    const text = 'Total $1,500,000.00, 2500000000 cents, due 2026-11-21, ref 000-12-3456';
    expect(us.text(text)).toBe(text);
  });
});

describe('Singapore', () => {
  const sg = only({ countries: ['sg'] });

  it('screens NRIC/FIN numbers and phone numbers with a country code or separator', () => {
    expect(sg.text('NRIC S1234567D, FIN G7654321K, tel +65 9123 4567 or 8123-4567')).toBe(
      `NRIC ${REDACTED}, FIN ${REDACTED}, tel ${REDACTED} or ${REDACTED}`,
    );
    expect(sg.isPiiKey('nricNo')).toBe(true);
  });

  it('leaves a bare 8-digit amount alone', () => {
    expect(sg.text('Budget 91234567 SGD')).toBe('Budget 91234567 SGD');
  });
});

describe('custom patterns', () => {
  it('replaces every match of the user patterns, with or without flags', () => {
    const custom = only({ patterns: ['INV-\\d{6}', '/acct[0-9]+/i', ''] });
    expect(custom.text('INV-123456 and ACCT42 and acct7')).toBe(`${REDACTED} and ${REDACTED} and ${REDACTED}`);
  });

  it('skips invalid patterns and ones that match empty text, saying why', () => {
    expect(compilePattern('(unclosed')).toEqual(expect.any(String));
    expect(compilePattern('a*')).toBe('Matches empty text');
    expect(only({ patterns: ['(unclosed', 'a*'] }).text('aaa (unclosed')).toBe('aaa (unclosed');
  });
});

describe('switched off', () => {
  it('lets every key and string through', () => {
    const off = createRedactor({ enabled: false, countries: ['vn', 'us', 'sg'], patterns: ['secret'] });
    expect(off.enabled).toBe(false);
    expect(off.isPiiKey('password')).toBe(false);
    expect(off.text('a@b.vn 0912345678 secret')).toBe('a@b.vn 0912345678 secret');
  });
});

describe('settings', () => {
  afterEach(() => window.localStorage.clear());

  it('fills defaults and turns RegExps into editable text', () => {
    expect(resolveRedaction(undefined)).toEqual({ enabled: true, countries: ['vn'], patterns: [] });
    expect(resolveRedaction({ countries: ['us', 'sg'], patterns: [/ab+c/gi, 'x\\d'] })).toEqual({
      enabled: true,
      countries: ['us', 'sg'],
      patterns: ['/ab+c/i', 'x\\d'],
    });
  });

  it('round-trips through localStorage and ignores unreadable values', () => {
    const settings: RedactionSettings = { enabled: false, countries: ['sg'], patterns: ['x'] };
    writeRedaction('k', settings);
    expect(readRedaction('k')).toEqual(settings);
    window.localStorage.setItem('k', '{"enabled":"yes"}');
    expect(readRedaction('k')).toBeNull();
    writeRedaction('k', null);
    expect(readRedaction('k')).toBeNull();
  });
});
