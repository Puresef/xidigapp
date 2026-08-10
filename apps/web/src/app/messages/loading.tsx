/**
 * f1 — inbox loading: plain ROWS only. Request cards never skeleton — a
 * skeleton card would imply a stranger is waiting before the data says so.
 * Mirrors the loaded row hierarchy 1:1 (disc + name line + preview line);
 * shimmer rides the shared .xidig-skeleton gating (data-motion AND
 * prefers-reduced-motion).
 */
export default function MessagesLoading() {
  return (
    <main className="xidig-section" aria-busy="true">
      <div className="xidig-skeleton-stack">
        <span className="xidig-skeleton" style={{ width: '7.5rem', height: '1.4rem' }} />
        <span className="xidig-skeleton" style={{ width: '12rem', height: '0.8rem' }} />
        {[0, 1, 2].map((row) => (
          <span key={row} className="xidig-dm-rowskeleton">
            <span
              className="xidig-skeleton"
              style={{ width: '38px', height: '38px', borderRadius: '999px', flex: 'none' }}
            />
            <span className="xidig-dm-rowskeleton__lines">
              <span
                className="xidig-skeleton"
                style={{ width: `${42 - row * 3}%`, height: '0.7rem' }}
              />
              <span
                className="xidig-skeleton"
                style={{ width: `${88 - row * 7}%`, height: '0.6rem' }}
              />
            </span>
          </span>
        ))}
      </div>
    </main>
  );
}
