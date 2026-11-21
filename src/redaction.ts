/**
 * What counts as personal data, and the switch that turns screening off. The prompt is
 * pasted into an AI agent, so whatever gets through leaves the machine: a dev database can
 * still hold a copy of real customer data.
 *
 * Two independent screens:
 * - by KEY: a property whose name says it holds personal data or a secret is replaced
 *   whole, whatever its value;
 * - by VALUE: inside every string, an e-mail address, the number formats of the selected
 *   countries and the user's own patterns are replaced where they stand, so text that
 *   merely mentions one (an element's label, a free-text note) is screened too.
 *
 * Amounts survive on purpose: they are what a UI bug is usually about. Every built-in
 * number pattern needs a shape no money figure has (a leading 0 or country code, a
 * separator, letters around the digits).
 */

export const REDACTED = '[redacted]';

export type RedactionCountry = 'vn' | 'us' | 'sg';

export interface RedactionSettings {
  /** Off: props, state and page text go into the prompt as they are. */
  readonly enabled: boolean;
  /** Whose phone and ID formats are screened by value; e-mail addresses always are. */
  readonly countries: readonly RedactionCountry[];
  /**
   * Extra value patterns, as regular expression sources (`INV-\d{6}`) or literals with
   * flags (`/acct[0-9]+/i`). Every match is replaced; blank and invalid lines are skipped.
   */
  readonly patterns: readonly string[];
}

/** What `DevAnnotator`'s `redaction` prop takes: any field left out keeps its default. */
export interface RedactionOptions {
  readonly enabled?: boolean;
  readonly countries?: readonly RedactionCountry[];
  readonly patterns?: ReadonlyArray<string | RegExp>;
}

interface CountryRules {
  readonly label: string;
  /** What the country's patterns catch, for the settings panel. */
  readonly covers: string;
  /** Extra key fragments, matched like the shared ones. */
  readonly keys: readonly RegExp[];
  readonly values: readonly RegExp[];
}

export const COUNTRY_RULES: Readonly<Record<RedactionCountry, CountryRules>> = {
  vn: {
    label: 'Vietnam',
    covers: 'phone numbers, 12-digit citizen IDs (CCCD)',
    keys: [/cccd|cmnd|zalo/],
    values: [
      // +84 or 0, then 9–10 digits, optionally grouped by spaces or dots.
      /(?<!\d)(?:\+?84|0)(?:[\s.]?\d){9,10}(?!\d)/g,
      // CCCD: 12 digits, starting with the 0 of a province code.
      /(?<!\d)0\d{11}(?!\d)/g,
    ],
  },
  us: {
    label: 'United States',
    covers: 'phone numbers, Social Security numbers written with dashes',
    // `ssn` only at either end of the key: in the middle it is "claSSName".
    keys: [/^ssn|ssn$|socialsecurity/],
    values: [
      // SSN with its dashes, minus the ranges never issued.
      /(?<!\d)(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}(?!\d)/g,
      // NANP: optional +1, area code and exchange each starting 2–9, then 4 digits.
      /(?<![\d+])(?:\+1[\s.-]?)?(?:\([2-9]\d{2}\)\s?|[2-9]\d{2}[\s.-]?)[2-9]\d{2}[\s.-]?\d{4}(?!\d)/g,
    ],
  },
  sg: {
    label: 'Singapore',
    covers: 'phone numbers with +65 or a space or dash, NRIC/FIN numbers',
    keys: [/nric/],
    values: [
      /\b[STFGM]\d{7}[A-Z]\b/g,
      // 8 digits starting 3, 6, 8 or 9: with +65, or split 4-4, so a bare amount survives.
      /(?<!\d)(?:\+65[\s-]?[3689]\d{3}[\s-]?\d{4}|[3689]\d{3}[\s-]\d{4})(?!\d)/g,
    ],
  },
};

export const COUNTRIES = Object.keys(COUNTRY_RULES) as RedactionCountry[];

export const DEFAULT_REDACTION: RedactionSettings = { enabled: true, countries: ['vn'], patterns: [] };

/** Matched against the key lower-cased with `_`, `-` and spaces removed. */
const SHARED_KEY =
  /(nationalid|citizenid|identitynumber|idnumber|idcard|passport|phone|mobile|msisdn|email|fullname|(debtor|borrower|customer|guarantor|contact|person|holder|relative|spouse|recipient|payer)name|address|dob|dateofbirth|birthday|birthdate|bankaccount|accountnumber|cardnumber|password|passwd|secret|token|otp|apikey|authorization|cookie|signature)/;

const EMAIL = /[^\s@<>()[\]"']+@[^\s@<>()[\]"']+\.[a-z]{2,}/gi;

/** Screens one capture: applied to every key and string the prompt will carry. */
export interface Redactor {
  readonly enabled: boolean;
  /** Whether a property of this name is replaced whole. */
  readonly isPiiKey: (key: string) => boolean;
  /** The text with every personal-data match replaced. */
  readonly text: (text: string) => string;
}

export function createRedactor(settings: RedactionSettings): Redactor {
  if (!settings.enabled) return { enabled: false, isPiiKey: () => false, text: (text) => text };
  const rules = settings.countries.map((country) => COUNTRY_RULES[country]);
  const keys = [SHARED_KEY, ...rules.flatMap((rule) => rule.keys)];
  const values = [
    EMAIL,
    ...rules.flatMap((rule) => rule.values),
    ...settings.patterns
      .filter((source) => source.trim() !== '')
      .map((source) => compilePattern(source))
      .filter((pattern) => pattern instanceof RegExp),
  ];
  return {
    enabled: true,
    isPiiKey: (key) => {
      const normalised = key.toLowerCase().replace(/[\s_-]/g, '');
      return keys.some((pattern) => pattern.test(normalised));
    },
    text: (text) => values.reduce((out, pattern) => out.replace(pattern, REDACTED), text),
  };
}

export const DEFAULT_REDACTOR = createRedactor(DEFAULT_REDACTION);

/**
 * A user pattern as a global RegExp, or the reason it cannot be one. `/source/flags`
 * keeps its flags; anything else is a bare source. A pattern that matches the empty
 * string would put `[redacted]` between every character, so it is refused.
 */
export function compilePattern(source: string): RegExp | string {
  const literal = /^\/(.+)\/([a-z]*)$/s.exec(source);
  const body = literal?.[1] ?? source;
  const flags = new Set(literal?.[2] ?? '');
  flags.add('g');
  let pattern: RegExp;
  try {
    pattern = new RegExp(body, [...flags].join(''));
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid pattern';
  }
  if (pattern.test('')) return 'Matches empty text';
  pattern.lastIndex = 0;
  return pattern;
}

/** Defaults filled in, RegExps turned into the `/source/flags` text the panel edits. */
export function resolveRedaction(options: RedactionOptions | undefined): RedactionSettings {
  return {
    enabled: options?.enabled ?? DEFAULT_REDACTION.enabled,
    countries: (options?.countries ?? DEFAULT_REDACTION.countries).filter((country) => country in COUNTRY_RULES),
    patterns: (options?.patterns ?? DEFAULT_REDACTION.patterns).map((pattern) =>
      typeof pattern === 'string' ? pattern : `/${pattern.source}/${pattern.flags.replace('g', '')}`,
    ),
  };
}

/** Settings saved in this browser, or `null` when there are none or they are unreadable. */
export function readRedaction(key: string): RedactionSettings | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const value = JSON.parse(raw) as Partial<Record<keyof RedactionSettings, unknown>>;
    if (typeof value.enabled !== 'boolean' || !Array.isArray(value.countries) || !Array.isArray(value.patterns)) return null;
    return {
      enabled: value.enabled,
      countries: value.countries.filter((country): country is RedactionCountry => typeof country === 'string' && country in COUNTRY_RULES),
      patterns: value.patterns.filter((pattern): pattern is string => typeof pattern === 'string'),
    };
  } catch {
    return null;
  }
}

/** `null` forgets the saved settings, so the app's defaults apply again. */
export function writeRedaction(key: string, settings: RedactionSettings | null): void {
  try {
    if (settings === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // The settings last until reload; nothing to report.
  }
}
