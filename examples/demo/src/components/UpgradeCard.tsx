export function UpgradeCard() {
  return (
    <article className="card upgrade">
      <span className="pill">New</span>
      <h2>Lumen Pro</h2>
      <p>Automated restock alerts, cohort analytics and 0% transaction fees.</p>
      <button type="button" className="btn light">
        Try free for 14 days
      </button>
      <div className="orb" aria-hidden="true" />
    </article>
  );
}
