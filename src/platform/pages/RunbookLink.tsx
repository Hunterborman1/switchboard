import { Link } from 'react-router-dom';
import { IconBook } from '../ui/icons';
import { runbookTarget } from './Runbook';

/** Runbook button: repo runbooks open the in-app /ops/runbook page; anything else opens externally. */
export function RunbookLink({ url }: { url: string }) {
  const t = runbookTarget(url);
  return t.internal ? (
    <Link className="ao-btn sm" to={t.to}>
      <IconBook /> Runbook
    </Link>
  ) : (
    <a className="ao-btn sm" href={t.href} target="_blank" rel="noreferrer noopener">
      <IconBook /> Runbook
    </a>
  );
}
