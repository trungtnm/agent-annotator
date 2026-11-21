import { useState } from 'react';

import { CUSTOMERS, type Customer } from '../customers-data';

const ID_LABEL: Record<Customer['country'], string> = { VN: 'CCCD', US: 'SSN', SG: 'NRIC/FIN' };

/**
 * A customer list and a detail card, both full of personal data, to try the redaction
 * settings on: comment on a row, the phone column, the note or the detail form, then copy
 * the prompt with different countries, patterns, or redaction off.
 */
export function CustomersPage() {
  const [selectedId, setSelectedId] = useState(CUSTOMERS[0]!.memberId);
  const selected = CUSTOMERS.find((customer) => customer.memberId === selectedId) ?? CUSTOMERS[0]!;
  return (
    <>
      <header className="header">
        <div>
          <p className="eyebrow">Privacy demo · all data is made up</p>
          <h1>Customers</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="btn ghost">
            Export CSV
          </button>
        </div>
      </header>
      <section className="customers-grid">
        <CustomerTable customers={CUSTOMERS} selectedId={selectedId} onSelect={setSelectedId} />
        <CustomerDetail key={selected.memberId} customer={selected} />
      </section>
    </>
  );
}

function CustomerTable(props: {
  readonly customers: readonly Customer[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <article className="card orders">
      <div className="card-head">
        <div>
          <h2>All customers</h2>
          <p className="muted">{props.customers.length} customers in Vietnam, the United States and Singapore</p>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Member</th>
            <th>Customer</th>
            <th>Phone</th>
            <th>ID number</th>
            <th>Lifetime value</th>
          </tr>
        </thead>
        <tbody>
          {props.customers.map((customer) => (
            <CustomerRow
              key={customer.memberId}
              customer={customer}
              selected={customer.memberId === props.selectedId}
              onSelect={() => props.onSelect(customer.memberId)}
            />
          ))}
        </tbody>
      </table>
    </article>
  );
}

function CustomerRow(props: { readonly customer: Customer; readonly selected: boolean; readonly onSelect: () => void }) {
  const { customer } = props;
  return (
    <tr className={props.selected ? 'selected' : undefined} onClick={props.onSelect}>
      <td className="mono">{customer.memberId}</td>
      <td>
        <div className="customer">
          <span className="mini-avatar">{customer.country}</span>
          <div>
            <div>{customer.fullName}</div>
            <div className="muted small">{customer.email}</div>
          </div>
        </div>
      </td>
      <td className="mono">{customer.phone}</td>
      <td className="mono">
        <span className="muted small">{ID_LABEL[customer.country]}</span> {customer.nationalId}
      </td>
      <td className="total">${customer.lifetimeValue.toFixed(2)}</td>
    </tr>
  );
}

function CustomerDetail(props: { readonly customer: Customer }) {
  const { customer } = props;
  const [contactNote, setContactNote] = useState(customer.note);
  const [phoneDraft, setPhoneDraft] = useState(customer.phone);
  return (
    <article className="card detail" aria-label="Customer detail">
      <div className="card-head">
        <div>
          <h2>{customer.fullName}</h2>
          <p className="muted">
            {customer.memberId} · {customer.orders} orders · ${customer.lifetimeValue.toFixed(2)}
          </p>
        </div>
      </div>
      <dl className="facts">
        <dt>Email</dt>
        <dd>{customer.email}</dd>
        <dt>Address</dt>
        <dd>{customer.address}</dd>
        <dt>Date of birth</dt>
        <dd>{customer.dateOfBirth}</dd>
        <dt>{ID_LABEL[customer.country]}</dt>
        <dd className="mono">{customer.nationalId}</dd>
      </dl>
      <label className="field">
        Phone
        <input value={phoneDraft} onChange={(event) => setPhoneDraft(event.target.value)} />
      </label>
      <label className="field">
        Note
        <textarea rows={3} value={contactNote} onChange={(event) => setContactNote(event.target.value)} />
      </label>
      <label className="field">
        Portal PIN
        <input type="password" defaultValue="482913" />
      </label>
      <button type="button" className="btn primary">
        Save customer
      </button>
    </article>
  );
}
