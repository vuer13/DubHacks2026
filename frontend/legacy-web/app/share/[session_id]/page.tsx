type SharePageProps = {
  params: {
    session_id: string;
  };
};

export default function SharePage({ params }: SharePageProps) {
  return (
    <main className="share-shell">
      <p className="eyebrow">TrailSense safety share</p>
      <h1>Hike status</h1>
      <p className="share-session">
        Session <strong>{params.session_id}</strong>
      </p>
      <section className="share-card" aria-live="polite">
        <span className="share-dot" aria-hidden="true" />
        <div>
          <h2>Waiting for location</h2>
          <p>The live location and recent trail events will appear here.</p>
        </div>
      </section>
      <a className="back-link" href="/">
        Back to TrailSense
      </a>
    </main>
  );
}
