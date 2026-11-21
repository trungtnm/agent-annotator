import { useEffect } from 'react';

import { Header } from './components/Header';
import { KpiCard } from './components/KpiCard';
import { OrdersTable } from './components/OrdersTable';
import { RevenueChart } from './components/RevenueChart';
import { Sidebar } from './components/Sidebar';
import { UpgradeCard } from './components/UpgradeCard';
import { KPIS } from './data';
import { CustomersPage } from './pages/CustomersPage';
import { usePath } from './router';

export function App() {
  const path = usePath();
  const customers = path === '/customers';
  useEffect(() => {
    document.title = customers ? 'Lumen · Customers' : 'Lumen · Orders';
  }, [customers]);
  return (
    <div className="shell">
      <Sidebar path={path} />
      <main className="main">{customers ? <CustomersPage /> : <Dashboard />}</main>
    </div>
  );
}

function Dashboard() {
  return (
    <>
      <Header />
      <section className="kpis" aria-label="Key metrics">
        {KPIS.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </section>
      <section className="grid">
        <RevenueChart />
        <UpgradeCard />
      </section>
      <OrdersTable />
    </>
  );
}
