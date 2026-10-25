/**
 * Branded route error boundary (React Router `errorElement`). Replaces the raw "Unexpected
 * Application Error" screen. A failed lazy chunk (deploy skew: the page was loaded from the
 * previous build) reloads once onto the new build; anything else shows a calm card with a
 * Reload button.
 */
import { useEffect } from 'react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Display, Lede } from '../narrative/components';
import { SceneTopBar } from '../narrative/Scene';

const RELOAD_KEY = 'sl-chunk-reload';

export function isChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch dynamically|ChunkLoadError|Unable to preload CSS|is not a valid JavaScript MIME type/i.test(msg);
}

/** Reload once per session (sessionStorage guard) so a persistent failure can't loop. */
export function reloadOnce(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function RouteError({ variant = 'narrative' }: { variant?: 'narrative' | 'product' }) {
  const err = useRouteError();
  const chunk = isChunkError(err);
  useEffect(() => {
    if (chunk) reloadOnce();
    else console.error(err);
  }, [chunk, err]);

  const status = isRouteErrorResponse(err) ? err.status : null;
  const title = chunk ? 'A newer version is ready.' : status === 404 ? 'There’s nothing here.' : 'Something went wrong.';
  const body = chunk
    ? 'This page was built before the latest update. Reload to pick it up; nothing you did is lost.'
    : 'This view hit an error. Reloading usually clears it; your walkthrough progress is saved.';

  if (variant === 'product') {
    return (
      <div className="sl-page" role="alert" data-testid="route-error">
        <div className="sl-route-error">
          <h1>{title}</h1>
          <p>{body}</p>
          <div className="sl-row">
            <button type="button" className="sl-route-error__btn" onClick={() => window.location.reload()}>
              Reload
            </button>
            <Link to="/">Back to the start</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="sl-n n-page nf" role="alert" data-testid="route-error">
      <SceneTopBar />
      <div className="nf__body">
        <div className="nf__card">
          <span className="n-label">{chunk ? 'Update available' : 'Error'}</span>
          <Display size="md">{title}</Display>
          <Lede>{body}</Lede>
          <div className="nf__actions">
            <button type="button" className="n-btn n-btn--primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <Link className="n-btn" to="/">
              Back to the start
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
