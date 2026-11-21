/**
 * Customers for the privacy demo: every format the redaction settings know, in the table,
 * in props and in free text. Member IDs (`CUS-…`) and money are what must survive; add
 * `CUS-\d{6}` as your own pattern to see a custom rule catch the IDs.
 * All of it is invented: the numbers follow each country's format and belong to no one.
 */

export type Country = 'VN' | 'US' | 'SG';

export interface Customer {
  readonly memberId: string;
  readonly fullName: string;
  readonly country: Country;
  readonly email: string;
  readonly phone: string;
  /** CCCD in Vietnam, SSN in the US, NRIC/FIN in Singapore. */
  readonly nationalId: string;
  readonly address: string;
  readonly dateOfBirth: string;
  readonly orders: number;
  readonly lifetimeValue: number;
  /** Free text that mentions personal data under a key that does not name it. */
  readonly note: string;
}

export const CUSTOMERS: readonly Customer[] = [
  {
    memberId: 'CUS-100231',
    fullName: 'Nguyễn Thị Lan',
    country: 'VN',
    email: 'lan.nguyen@example.vn',
    phone: '0912 345 678',
    nationalId: '079190001234',
    address: '12 Lê Lợi, Quận 1, TP. Hồ Chí Minh',
    dateOfBirth: '1990-04-12',
    orders: 14,
    lifetimeValue: 1820.5,
    note: 'Gọi 0912 345 678 sau 17h. CCCD 079190001234 đã xác minh.',
  },
  {
    memberId: 'CUS-100245',
    fullName: 'Trần Minh Quân',
    country: 'VN',
    email: 'quan.tran@example.vn',
    phone: '+84 987 654 321',
    nationalId: '001089005678',
    address: '45 Hàng Bài, Hoàn Kiếm, Hà Nội',
    dateOfBirth: '1989-09-02',
    orders: 6,
    lifetimeValue: 640,
    note: 'Prefers Zalo: +84 987 654 321. Refund of 1.250.000 đ sent.',
  },
  {
    memberId: 'CUS-100302',
    fullName: 'Olivia Johnson',
    country: 'US',
    email: 'olivia.j@example.com',
    phone: '(415) 555-0132',
    nationalId: '123-45-6789',
    address: '220 Market St, San Francisco, CA 94105',
    dateOfBirth: '1985-11-30',
    orders: 21,
    lifetimeValue: 3412.75,
    note: 'Call (415) 555-0132 before delivery. Tax form on file, SSN 123-45-6789.',
  },
  {
    memberId: 'CUS-100318',
    fullName: 'Daniel Brooks',
    country: 'US',
    email: 'dan.brooks@example.com',
    phone: '+1 212.555.0199',
    nationalId: '234-56-7890',
    address: '88 Bedford Ave, Brooklyn, NY 11211',
    dateOfBirth: '1992-02-18',
    orders: 3,
    lifetimeValue: 289,
    note: 'Gift order; text +1 212.555.0199. Budget 2500000000 cents is a typo.',
  },
  {
    memberId: 'CUS-100407',
    fullName: 'Tan Wei Ling',
    country: 'SG',
    email: 'weiling.tan@example.sg',
    phone: '+65 9123 4567',
    nationalId: 'S8812345D',
    address: '10 Anson Rd, #12-05, Singapore 079903',
    dateOfBirth: '1988-07-07',
    orders: 9,
    lifetimeValue: 1175.4,
    note: 'NRIC S8812345D checked. WhatsApp +65 9123 4567 only.',
  },
  {
    memberId: 'CUS-100412',
    fullName: 'Rajesh Kumar',
    country: 'SG',
    email: 'rajesh.k@example.sg',
    phone: '8123-4567',
    nationalId: 'G7654321K',
    address: '5 Tampines Ave 3, Singapore 529705',
    dateOfBirth: '1979-12-24',
    orders: 1,
    lifetimeValue: 64,
    note: 'FIN G7654321K. Office line 8123-4567; order total 91234567 is a test.',
  },
];
