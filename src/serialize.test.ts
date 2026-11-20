import { describe, expect, it } from 'vitest';

import { REDACTED, isPiiKey, redactText, toSnapshot } from './serialize';

describe('personal data screening', () => {
  it('redacts a value whole when its key names personal data, whatever the casing', () => {
    expect(
      toSnapshot({
        nationalId: '012345678901',
        national_id: '079123456789',
        phoneNumber: '0912345678',
        debtorName: 'Nguyễn Văn A',
        fullName: 'Trần Thị B',
        email: 'a@b.vn',
        address: '12 Lê Lợi',
        csrfToken: 'abc',
        loanCode: 'L-001',
      }),
    ).toEqual({
      nationalId: REDACTED,
      national_id: REDACTED,
      phoneNumber: REDACTED,
      debtorName: REDACTED,
      fullName: REDACTED,
      email: REDACTED,
      address: REDACTED,
      csrfToken: REDACTED,
      loanCode: 'L-001',
    });
  });

  it('keeps an EMPTY personal field visible, because "missing" is the bug worth seeing', () => {
    expect(toSnapshot({ phone: null, email: '', fullName: undefined })).toEqual({
      phone: null,
      email: '',
      fullName: '<undefined>',
    });
  });

  it('screens e-mail, phone and citizen-ID shaped text inside any string', () => {
    expect(redactText('Gọi 0912 345 678 hoặc +84912345678, mail a.b@tfs.com.vn, CCCD 001234567890'))
      .toBe(`Gọi ${REDACTED} hoặc ${REDACTED}, mail ${REDACTED}, CCCD ${REDACTED}`);
  });

  it('leaves amounts, dates and codes alone', () => {
    expect(redactText('Dư nợ 150000000 đ, 1.250.000.000 đ, hạn 02.03.2026, mã HD123456789012'))
      .toBe('Dư nợ 150000000 đ, 1.250.000.000 đ, hạn 02.03.2026, mã HD123456789012');
    expect(isPiiKey('outstandingAmount')).toBe(false);
    expect(isPiiKey('creditorCode')).toBe(false);
  });
});

describe('snapshot shape', () => {
  it('cuts depth, keys, items and strings, saying how much it left out', () => {
    const limits = { depth: 2, keys: 2, items: 2, string: 5 };
    expect(toSnapshot({ a: 'abcdefgh', b: [1, 2, 3, 4], c: 1 }, limits)).toEqual({
      a: 'abcde… (+3 chars)',
      b: [1, 2, '… +2'],
      '…': '+1 keys',
    });
    expect(toSnapshot({ deep: { deeper: { deepest: 1 } } }, limits)).toEqual({ deep: { deeper: '{…1 keys}' } });
  });

  it('marks a cycle but prints a shared reference both times', () => {
    const shared = { n: 1 };
    const cyclic: Record<string, unknown> = { shared, again: shared };
    cyclic.self = cyclic;
    expect(toSnapshot(cyclic)).toEqual({ shared: { n: 1 }, again: { n: 1 }, self: '<circular>' });
  });

  it('names machinery instead of walking it', () => {
    class QueryObserver {
      readonly client = { huge: true };
    }
    const element = { $$typeof: Symbol.for('react.transitional.element'), type: function Badge() {}, props: {} };
    expect(
      toSnapshot({
        observer: new QueryObserver(),
        onClick: function handleClick() {},
        icon: element,
        at: new Date('2026-01-02T03:04:05.000Z'),
        pending: Promise.resolve(),
        big: 10n,
        children: 'dropped',
      }),
    ).toEqual({
      observer: '<QueryObserver>',
      onClick: 'ƒ handleClick()',
      icon: '<Badge />',
      at: '2026-01-02T03:04:05.000Z',
      pending: '<Promise>',
      big: '10n',
    });
  });
});
