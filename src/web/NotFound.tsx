/** The site's not-found page: the router's catch-all, and pages whose id isn't known (/write-up/nope). */
import { ButtonLink } from '../ds';
import { SiteBar } from '../narrative/components';

export function NotFound() {
  return (
    <main className="ds-app sl-n n-page nf" data-testid="not-found">
      <SiteBar />
      <div className="nf__body">
        <div className="nf__card">
          <span className="nf__code">404</span>
          <h1 className="nf__title">There’s nothing here.</h1>
          <p className="nf__text">That page doesn’t exist. Pick up from one of these instead.</p>
          <div className="nf__actions">
            <ButtonLink variant="primary" to="/">
              Back to the start
            </ButtonLink>
            <ButtonLink variant="secondary" to="/walkthrough">
              Start the presentation
            </ButtonLink>
            <ButtonLink variant="secondary" to="/write-up">
              Read the write-up
            </ButtonLink>
          </div>
        </div>
      </div>
    </main>
  );
}
