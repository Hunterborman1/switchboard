import { useNavigate } from 'react-router-dom';
import { Button } from '../../system/components/primitives/Button.jsx';
import { EmptyState } from '../../uis/EmptyState';
import { AppPageHeader } from '../components/ui';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="sl-page">
      <AppPageHeader title="Page not found" dataAsOf={null} />
      <EmptyState
        variant="no-data"
        size="lg"
        icon="404"
        title="There is nothing at this address"
        description="The link may come from an older version of the walkthrough. Every page is in the sidebar."
        action={
          <Button size="sm" iconLeft="arrowRight" onClick={() => navigate('/app/new')}>
            Go to New call
          </Button>
        }
      />
    </div>
  );
}
