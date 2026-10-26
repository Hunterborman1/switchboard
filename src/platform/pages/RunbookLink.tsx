import { ButtonLink } from '../../ds';
import { IconBook, IconExternal } from '../../ds/icons';
import { runbookTarget } from './Runbook';

/** Runbook button: the repo runbook opens the in-app /ops/runbook page; a web address opens in a new tab; anything else has no button. */
export function RunbookLink({ url }: { url: string }) {
  const t = runbookTarget(url);
  if (!t) return null;
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
