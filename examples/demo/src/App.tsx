import { Header } from './components/Header';
import { KpiCard } from './components/KpiCard';
import { OrdersTable } from './components/OrdersTable';
import { RevenueChart } from './components/RevenueChart';
import { Sidebar } from './components/Sidebar';
import { UpgradeCard } from './components/UpgradeCard';
import { KPIS } from './data';

export function App() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
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
      </main>
    </div>
  );
}
