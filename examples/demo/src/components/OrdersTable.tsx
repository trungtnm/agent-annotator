import { ORDERS, type OrderStatus } from '../data';

const STATUS_CLASS: Record<OrderStatus, string> = {
  Paid: 'status paid',
  Pending: 'status pending',
  Refunded: 'status refunded',
  Shipped: 'status shipped',
};

export function OrdersTable() {
  return (
    <article className="card orders">
      <div className="card-head">
        <div>
          <h2>Recent orders</h2>
          <p className="muted">{ORDERS.length} orders today</p>
        </div>
        <a href="#" className="link">
          View all →
        </a>
      </div>
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Product</th>
            <th>Date</th>
            <th>Status</th>
            {/* Deliberately left-aligned: money columns read better aligned right. */}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {ORDERS.map((order) => (
            <tr key={order.id}>
              <td className="mono">{order.id}</td>
              <td>
                <div className="customer">
                  <span className="mini-avatar">{order.customer.split(' ').map((part) => part[0]).join('')}</span>
                  <div>
                    <div>{order.customer}</div>
                    <div className="muted small">{order.email}</div>
                  </div>
                </div>
              </td>
              <td>{order.product}</td>
              <td className="muted">{order.date}</td>
              <td>
                <span className={STATUS_CLASS[order.status]}>{order.status}</span>
              </td>
              <td className="total">${order.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
