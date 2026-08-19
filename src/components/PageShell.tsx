// Common chrome for a routed page: close control + scrollable body. The
// page's own <h2> is part of its content (each page component supplies its
// own, exactly as it did as a modal) rather than duplicated here — `title`
// is used for the region's accessible name only.
import type { ReactNode } from "react";

export function PageShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="page" role="region" aria-label={title}>
      <div className="page__inner">
        <button className="detail__close" onClick={onClose} aria-label="Back to map">
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
