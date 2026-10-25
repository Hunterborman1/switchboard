/**
 * Product-app binding for the shared model-label helper: resolves ids against the
 * session's configured models (falling back to the known ids while the session loads).
 * Only Settings shows raw ids; everywhere else renders through these.
 */
import { useCallback } from 'react';
import { modelLabel, rewriteModelIds, type ConfiguredModels } from '../../shared/modelLabels';
import { useSession } from '../api/hooks';

export { MODEL_ROLE_LABEL, MODEL_ROLE_SHORT } from '../../shared/modelLabels';

export function useModelLabels(): {
  models: ConfiguredModels | null;
  label: (id: string | null | undefined) => string | null;
  rewrite: (text: string) => string;
} {
  const { data } = useSession();
  const models = data?.models ?? null;
  const label = useCallback((id: string | null | undefined) => modelLabel(id, models), [models]);
  const rewrite = useCallback((text: string) => rewriteModelIds(text, models), [models]);
  return { models, label, rewrite };
}
