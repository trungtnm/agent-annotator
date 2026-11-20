export type OrderStatus = 'Paid' | 'Pending' | 'Refunded' | 'Shipped';

export interface Order {
  readonly id: string;
  readonly customer: string;
  readonly email: string;
  readonly product: string;
  readonly total: number;
  readonly status: OrderStatus;
  readonly date: string;
}

export const ORDERS: readonly Order[] = [
  { id: 'LM-2048', customer: 'Ava Chen', email: 'ava.chen@example.com', product: 'Aurora Desk Lamp', total: 129, status: 'Paid', date: 'Nov 20' },
  { id: 'LM-2047', customer: 'Noah Patel', email: 'noah@example.com', product: 'Linen Throw · Sand', total: 86.5, status: 'Shipped', date: 'Nov 20' },
  { id: 'LM-2046', customer: 'Mia Rossi', email: 'mia.rossi@example.com', product: 'Ceramic Pour-over Set', total: 64, status: 'Pending', date: 'Nov 19' },
  { id: 'LM-2045', customer: 'Lucas Martin', email: 'lucas.m@example.com', product: 'Walnut Side Table', total: 349, status: 'Paid', date: 'Nov 19' },
  { id: 'LM-2044', customer: 'Sofia García', email: 'sofia.g@example.com', product: 'Wool Rug 160×230', total: 412, status: 'Refunded', date: 'Nov 18' },
  { id: 'LM-2043', customer: 'Ethan Kim', email: 'ethan.kim@example.com', product: 'Glass Carafe', total: 38, status: 'Shipped', date: 'Nov 18' },
];

export interface Kpi {
  readonly label: string;
  readonly value: string;
  readonly delta: number;
  readonly series: readonly number[];
}

export const KPIS: readonly Kpi[] = [
  { label: 'Revenue', value: '$48,290', delta: 12.4, series: [12, 14, 13, 17, 16, 19, 22, 21, 25, 27, 26, 30] },
  { label: 'Orders', value: '1,284', delta: 8.1, series: [30, 28, 31, 35, 33, 36, 34, 39, 41, 40, 44, 46] },
  { label: 'Conversion', value: '3.42%', delta: -0.6, series: [3.6, 3.7, 3.5, 3.6, 3.4, 3.5, 3.3, 3.4, 3.5, 3.3, 3.4, 3.4] },
  { label: 'Avg. order', value: '$37.60', delta: 4.3, series: [31, 32, 33, 32, 34, 35, 34, 36, 35, 37, 36, 38] },
];

export const REVENUE: readonly number[] = [18, 22, 19, 27, 31, 29, 36, 42, 39, 47, 52, 58, 55, 63];
