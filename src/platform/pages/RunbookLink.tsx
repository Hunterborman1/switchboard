import { ButtonLink } from '../../ds';
import { IconBook, IconExternal } from '../../ds/icons';
import { runbookTarget } from './Runbook';

/** Runbook button: repo runbooks open the in-app /ops/runbook page; anything else opens in a new tab. */
export function RunbookLink({ url }: { url: string }) {
  const t = runbookTarget(url);
  return t.internal ? (
    <ButtonLink size="sm" to={t.to} icon={<IconBook size={14} />}>
      Runbook
    </ButtonLink>
  ) : (
    <a className="ds-btn ds-btn--secondary ds-btn--sm" href={t.href} target="_blank" rel="noreferrer noopener">
      <IconBook size={14} />
      Runbook
      <IconExternal size={12} />
    </a>
  );
}
