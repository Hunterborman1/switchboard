/**
 * Model naming for display. Vendor model ids stay in the data (API responses, spans, logs,
 * fixtures) but the UI shows the role a model plays, never its id. The one exception is
 * the product's Settings page ("Model configuration"), which shows the configured ids.
 *
 * Resolution order for an id:
 *   1. the configured models passed in (the product session's `models`), when known;
 *   2. the known deployment ids (wrangler.jsonc MODEL_PRIMARY / MODEL_SECONDARY) and the
 *      simulated Agent Ops agents' models (data/platform/agents.json);
 *   3. anything else that looks like a model id reads as a generic "Other model".
 */

export type ModelRole = 'primary' | 'secondary';
export type ConfiguredModels = { primary: string; secondary: string };

export const MODEL_ROLE_LABEL: Record<ModelRole, string> = {
  primary: 'Main model',
  secondary: 'Backup model',
};

/** Short forms for inline copy ("Runs live on the real models · fast tier, fallback & judge"). */
export const MODEL_ROLE_SHORT: Record<ModelRole, string> = {
  primary: 'main model',
  secondary: 'backup model',
};

/** Other Agent Ops agents' models: labelled by order/role, not tier. */
const OTHER_AGENT_LABEL: Record<ModelRole, string> = {
  primary: 'Primary model',
  secondary: 'Secondary model',
};

export const OTHER_MODEL_LABEL = 'Other model';

type Known = { agentId: string; role: ModelRole };

/**
 * Known ids, keyed by id. Data only: used to recognise ids in API payloads, spans and
 * log text so they can be relabelled; never rendered.
 */
const KNOWN: Record<string, Known> = {
  // Signal Loop (wrangler.jsonc vars)
  'deepseek/deepseek-v4.1-flash': { agentId: 'agt_signal_loop', role: 'primary' },
  'anthropic/claude-haiku-5.5': { agentId: 'agt_signal_loop', role: 'secondary' },
  // Simulated RFP & Security Questionnaire Responder (data/platform/agents.json)
  'anthropic/claude-sonnet-5.5': { agentId: 'agt_rfp_responder', role: 'primary' },
  'openai/gpt-5.4-mini': { agentId: 'agt_rfp_responder', role: 'secondary' },
};

const SIGNAL_LOOP = 'agt_signal_loop';

/** vendor/model ids (OpenRouter style) and bare family-version ids. */
const ID_PATTERN =
  /\b(?:(?:openai|anthropic|deepseek|google|meta-llama|mistralai|x-ai|qwen|moonshotai|cohere|z-ai)\/[\w.:-]+|(?:claude|gpt|gemini|deepseek|llama|mistral|haiku|sonnet|opus)-[\w.:-]*\d[\w.:-]*)/gi;

export function looksLikeModelId(value: string): boolean {
  ID_PATTERN.lastIndex = 0;
  const hit = ID_PATTERN.test(value);
  ID_PATTERN.lastIndex = 0;
  return hit;
}

/** The role of a model id, if it can be resolved. */
export function modelRole(id: string | null | undefined, configured?: ConfiguredModels | null): ModelRole | null {
  if (!id) return null;
  if (configured) {
    if (id === configured.primary) return 'primary';
    if (id === configured.secondary) return 'secondary';
  }
  const k = KNOWN[id];
  return k && k.agentId === SIGNAL_LOOP ? k.role : null;
}

/**
 * Display label for a model id: "Main model", "Backup model",
 * "Primary model"/"Secondary model" for other agents, else "Other model".
 * Null or empty input returns null so callers can show their own "code, no model" copy.
 */
export function modelLabel(id: string | null | undefined, configured?: ConfiguredModels | null): string | null {
  if (!id) return null;
  const role = modelRole(id, configured);
  if (role) return MODEL_ROLE_LABEL[role];
  const k = KNOWN[id];
  if (k) return OTHER_AGENT_LABEL[k.role];
  return OTHER_MODEL_LABEL;
}

/** The Agent Ops agent a known model id belongs to (for cross-agent tables), else null. */
export function modelAgentId(id: string | null | undefined): string | null {
  return (id && KNOWN[id]?.agentId) || null;
}

/** Rewrites every model id inside free text (log messages, span names, changelog copy). */
export function rewriteModelIds(text: string, configured?: ConfiguredModels | null): string;
export function rewriteModelIds(text: string | null | undefined, configured?: ConfiguredModels | null): string | null | undefined;
export function rewriteModelIds(text: string | null | undefined, configured?: ConfiguredModels | null): string | null | undefined {
  if (!text) return text;
  let out = text;
  // Exact configured/known ids first (they may not match the generic pattern).
  const ids = [...(configured ? [configured.primary, configured.secondary] : []), ...Object.keys(KNOWN)];
  for (const id of ids) if (id && out.includes(id)) out = out.split(id).join(modelLabel(id, configured) ?? OTHER_MODEL_LABEL);
  return out.replace(ID_PATTERN, (m) => modelLabel(m, configured) ?? OTHER_MODEL_LABEL);
}

/** Deep-maps a JSON-ish value (span attrs, log fields), relabelling every string that holds a model id. */
export function relabelModelsDeep<T>(value: T, configured?: ConfiguredModels | null): T {
  if (typeof value === 'string') return rewriteModelIds(value, configured) as T;
  if (Array.isArray(value)) return value.map((v) => relabelModelsDeep(v, configured)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = relabelModelsDeep(v, configured);
    return out as T;
  }
  return value;
}
