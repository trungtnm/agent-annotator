import type { ReactNode } from 'react';

import { ACCENT, BUTTON, FONT, LINE, MUTED, Z } from './overlay-parts';
import { COUNTRIES, COUNTRY_RULES, compilePattern, type RedactionCountry, type RedactionSettings } from './redaction';

const LABEL = { ...FONT, display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' } as const;

/**
 * The toolbar's redaction settings: the on/off switch, the countries whose phone and ID
 * formats are screened, and the user's own patterns, one per line. Changes apply to
 * comments made from now on; a comment already made keeps what was captured.
 */
export function RedactionPanel(props: {
  readonly settings: RedactionSettings;
  /** This browser has its own settings, not the app's defaults. */
  readonly customised: boolean;
  readonly onChange: (settings: RedactionSettings) => void;
  readonly onReset: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const { settings } = props;
  const off = !settings.enabled;
  const update = (patch: Partial<RedactionSettings>): void => props.onChange({ ...settings, ...patch });
  const toggleCountry = (country: RedactionCountry, on: boolean): void =>
    update({ countries: COUNTRIES.filter((each) => (each === country ? on : settings.countries.includes(each))) });
  const errors = settings.patterns.flatMap((source, index) => {
    if (source.trim() === '') return [];
    const compiled = compilePattern(source);
    return typeof compiled === 'string' ? [`Line ${index + 1}: ${compiled}`] : [];
  });

  return (
    <div
      role="dialog"
      aria-label="Redaction settings"
      style={{
        ...FONT,
        position: 'fixed',
        right: 16,
        bottom: 72,
        width: 340,
        maxHeight: '70vh',
        overflowY: 'auto',
        background: '#FFFFFF',
        border: `1px solid ${LINE}`,
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        zIndex: Z + 2,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderBottom: `1px solid ${LINE}` }}>
        <strong style={{ ...FONT, fontWeight: 600 }}>Personal data redaction</strong>
        <button type="button" onClick={props.onClose} aria-label="Close redaction settings" style={{ ...BUTTON, marginLeft: 'auto', padding: '2px 8px' }}>
          Close
        </button>
      </div>
      <div style={{ ...FONT, padding: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ ...LABEL, alignItems: 'center' }}>
          <input
            type="checkbox"
            role="switch"
            checked={settings.enabled}
            aria-checked={settings.enabled}
            onChange={(event) => update({ enabled: event.target.checked })}
          />
          <span style={{ ...FONT, fontWeight: 600 }}>Redact personal data</span>
        </label>
        <p style={{ ...FONT, margin: 0, fontSize: 12, color: off ? '#B42318' : MUTED }}>
          {off
            ? 'Off: new comments carry props, state and page text exactly as the page shows them. Password fields stay hidden.'
            : 'Values under keys like phone, email, name, address, ID, password or token, and every e-mail address, become [redacted].'}
        </p>

        <fieldset disabled={off} style={{ ...FONT, margin: 0, padding: 0, border: 0, opacity: off ? 0.5 : 1 }}>
          <legend style={{ ...FONT, padding: 0, marginBottom: 6, fontWeight: 600 }}>Number formats</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {COUNTRIES.map((country) => (
              <label key={country} style={LABEL}>
                <input
                  type="checkbox"
                  checked={settings.countries.includes(country)}
                  onChange={(event) => toggleCountry(country, event.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span style={FONT}>
                  {COUNTRY_RULES[country].label}
                  <span style={{ ...FONT, display: 'block', fontSize: 11, color: MUTED }}>{COUNTRY_RULES[country].covers}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={off} style={{ ...FONT, margin: 0, padding: 0, border: 0, opacity: off ? 0.5 : 1 }}>
          <legend style={{ ...FONT, padding: 0, marginBottom: 4, fontWeight: 600 }}>Your own patterns</legend>
          <label htmlFor="agent-annotator-patterns" style={{ ...FONT, display: 'block', fontSize: 11, color: MUTED, marginBottom: 4 }}>
            One regular expression per line, e.g. <code>INV-\d{'{6}'}</code> or <code>/acct[0-9]+/i</code>.
          </label>
          <textarea
            id="agent-annotator-patterns"
            value={settings.patterns.join('\n')}
            onChange={(event) => update({ patterns: event.target.value === '' ? [] : event.target.value.split('\n') })}
            rows={3}
            spellCheck={false}
            aria-invalid={errors.length > 0}
            style={{
              ...FONT,
              width: '100%',
              boxSizing: 'border-box',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              padding: 6,
              border: `1px solid ${errors.length > 0 ? '#B42318' : LINE}`,
              borderRadius: 6,
              resize: 'vertical',
            }}
          />
          {errors.length > 0 ? (
            <ul role="alert" style={{ ...FONT, margin: '4px 0 0', paddingLeft: 16, fontSize: 11, color: '#B42318' }}>
              {errors.map((error) => (
                <li key={error}>{error} — skipped</li>
              ))}
            </ul>
          ) : null}
        </fieldset>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...FONT, flex: 1, fontSize: 11, color: MUTED }}>
            Applies to comments made from now on. Saved in this browser.
          </span>
          <button
            type="button"
            onClick={props.onReset}
            disabled={!props.customised}
            style={{ ...BUTTON, color: props.customised ? ACCENT : MUTED, cursor: props.customised ? 'pointer' : 'default' }}
          >
            Use app defaults
          </button>
        </div>
      </div>
    </div>
  );
}
