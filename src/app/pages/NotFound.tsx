/** Any /app path that doesn't match a page: a designed dead end with the two ways back. */
import { ButtonLink, Card, EmptyState, Page } from '../../ds';
import { IconHome, IconInbox, IconSearch } from '../../ds/icons';
import { useDocumentTitle } from '../AppShell';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <Page width="narrow">
      <Card>
        <EmptyState
          icon={<IconSearch />}
          title="Page not found"
          description="There’s nothing at this address. The link may be from an older version of the walkthrough."
          actions={
            <>
              <ButtonLink to="/app/overview" variant="primary" size="sm" icon={<IconHome size={14} />}>
                Go to Overview
              </ButtonLink>
              <ButtonLink to="/app/runs" size="sm" icon={<IconInbox size={14} />}>
                Open Conversations
              </ButtonLink>
            </>
          }
        />
      </Card>
    </Page>
  );
}
