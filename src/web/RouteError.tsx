/**
 * Branded route error boundary (React Router `errorElement`). Replaces the raw "Unexpected
 * Application Error" screen. A failed lazy chunk (deploy skew: the page was loaded from the
 * previous build) reloads once onto the new build; anything else shows a calm card with a
 * Reload button.
 */
import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Button, ButtonLink } from '../ds';
import { IconAlertTriangle, IconRefresh } from '../ds/icons';
import { SiteBar } from '../narrative/components';

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

  const actions = (
    <>
      <Button variant="primary" icon={<IconRefresh size={16} />} onClick={() => window.location.reload()}>
        Reload
      </Button>
      <ButtonLink variant="secondary" to="/">
        Back to the start
      </ButtonLink>
    </>
  );

  // Inside a product shell: a card in the content area, so the sidebar and top bar stay put.
  if (variant === 'product') {
    return (
      <div className="ds-page ds-page--narrow" role="alert" data-testid="route-error">
        <div className="route-error">
          <span className="route-error__icon" aria-hidden="true">
            <IconAlertTriangle size={20} />
          </span>
          <h1 className="route-error__title">{title}</h1>
          <p className="route-error__text">{body}</p>
          <div className="route-error__actions">{actions}</div>
        </div>
      </div>
    );
  }

  return (
    <main className="ds-app sl-n n-page nf" role="alert" data-testid="route-error">
      <SiteBar />
      <div className="nf__body">
        <div className="nf__card">
          <span className="nf__code">{chunk ? 'Update available' : status ? String(status) : 'Error'}</span>
          <h1 className="nf__title">{title}</h1>
          <p className="nf__text">{body}</p>
          <div className="nf__actions">{actions}</div>
        </div>
      </div>
    </main>
  );
}
