export default function AnalyticsLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="merchant-main analytics-page analytics-loading"
      id="main-content"
      lang="en"
    >
      <p className="sr-only" role="status">
        Loading reconciled analytics.
      </p>
      <div className="analytics-loading-heading">
        <span />
        <strong />
        <i />
      </div>
      <div className="analytics-loading-integrity" />
      <div className="analytics-loading-cards">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="analytics-loading-panels">
        <span />
        <span />
      </div>
    </main>
  );
}
