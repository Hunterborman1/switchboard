/**
 * Switchboard platform contracts: the larger product Signal Loop runs inside.
 *
 * Switchboard reads any conversation or document (calls, meeting notes, email threads, chat
 * exports, tickets, PDFs, decks), decides what it is, runs the analyses that apply, and sends
 * the result to the right people in the tools they already use. Signal Loop (product feedback
 * → routed, evidence-backed insight) is the one analysis built out here; the others are listed
 * so the catalog reads true, and are marked as not built.
 *
 * Connectors are simulated: connecting one records a workspace-scoped connection with a fake
 * account, and deliveries through it are rendered as in-app previews with receipts. Nothing
 * leaves the Worker.
 */
import { z } from 'zod';
import { PRODUCT_AREAS, type Person } from './contracts.ts';

export const PLATFORM_NAME = 'Switchboard';
export const ANALYSIS_NAME = 'Signal Loop';
/** The public source repository. */
export const REPO_URL = 'https://github.com/Hunterborman1/switchboard';

// ---------------------------------------------------------------- connectors

export const CONNECTOR_IDS = [
  // destinations people work in
  'slack',
  'teams',
  'jira',
  'linear',
  'salesforce',
  'gmail',
  'google_drive',
  // sources conversations come from
  'gong',
  'zoom',
  'zendesk',
  'hubspot',
  'notion',
] as const;
export const ConnectorId = z.enum(CONNECTOR_IDS);
export type ConnectorId = z.infer<typeof ConnectorId>;

/** What the connector is for. Drives the delivery preview and the catalog grouping. */
export type ConnectorCategory = 'chat' | 'tracker' | 'crm' | 'email' | 'docs' | 'recorder' | 'support';
/** source: conversations come in · destination: results go out · both. */
export type ConnectorDirection = 'source' | 'destination' | 'both';

export type ConnectorConfigField = {
  key: string;
  label: string;
  placeholder: string;
  help?: string;
};

export type ConnectorDef = {
  id: ConnectorId;
  name: string;
  vendor: string;
  category: ConnectorCategory;
  direction: ConnectorDirection;
  /** One line for the catalog card. */
  description: string;
  /** What Switchboard does with it, in plain words. */
  sends?: string;
  receives?: string;
  /** Simulated account shown once connected ("invoca.slack.com"). */
  defaultAccount: string;
  /** Scopes shown on the simulated authorize screen. */
  scopes: string[];
  configFields: ConnectorConfigField[];
  /** Which person identity field tags someone in this tool. */
  identity: PersonIdentityKey | null;
};

export const PERSON_IDENTITY_KEYS = ['email', 'slack', 'teams', 'jira', 'linear', 'salesforce'] as const;
export type PersonIdentityKey = (typeof PERSON_IDENTITY_KEYS)[number];

export const CONNECTORS: ConnectorDef[] = [
  {
    id: 'slack', name: 'Slack', vendor: 'Slack', category: 'chat', direction: 'both',
    description: 'Post time-sensitive signals to a channel and mention the owner.',
    sends: 'Messages with the customer quote, account context and a link back.', receives: 'Shared channel threads, as chat exports.',
    defaultAccount: 'invoca.slack.com', scopes: ['Post messages to channels you choose', 'Mention workspace members', 'Read messages in shared customer channels'],
    configFields: [{ key: 'defaultChannel', label: 'Default channel', placeholder: '#product-feedback' }], identity: 'slack',
  },
  {
    id: 'teams', name: 'Microsoft Teams', vendor: 'Microsoft', category: 'chat', direction: 'destination',
    description: 'Post signals to a Teams channel for teams that live in Microsoft 365.',
    sends: 'Channel posts with the quote and account context.',
    defaultAccount: 'Invoca (Microsoft 365)', scopes: ['Post to channels you choose', 'Mention organisation members'],
    configFields: [{ key: 'defaultChannel', label: 'Default channel', placeholder: 'Product › Feedback' }], identity: 'teams',
  },
  {
    id: 'jira', name: 'Jira', vendor: 'Atlassian', category: 'tracker', direction: 'destination',
    description: 'Open issues with the evidence attached and assign the owner.',
    sends: 'Issues with the quote, severity, account and ARR. Status changes flow back.',
    defaultAccount: 'invoca.atlassian.net', scopes: ['Create and update issues', 'Assign issues to users', 'Read issue status'],
    configFields: [{ key: 'defaultProject', label: 'Default project', placeholder: 'FEED' }], identity: 'jira',
  },
  {
    id: 'linear', name: 'Linear', vendor: 'Linear', category: 'tracker', direction: 'destination',
    description: 'Create issues in the team that owns the product area.',
    sends: 'Issues with labels, priority and the customer quote. Status changes flow back.',
    defaultAccount: 'linear.app/invoca', scopes: ['Create issues', 'Assign issues', 'Read issue status'],
    configFields: [{ key: 'defaultTeam', label: 'Default team', placeholder: 'Core Product' }], identity: 'linear',
  },
  {
    id: 'salesforce', name: 'Salesforce', vendor: 'Salesforce', category: 'crm', direction: 'both',
    description: 'Log the signal on the account and open a task for the account team.',
    sends: 'An activity on the Account and a follow-up task for its owner.', receives: 'Account tier, ARR, renewal date and owner.',
    defaultAccount: 'invoca.my.salesforce.com', scopes: ['Read accounts and opportunities', 'Create activities and tasks', 'Read users'],
    configFields: [{ key: 'taskQueue', label: 'Task owner when unassigned', placeholder: 'Account owner' }], identity: 'salesforce',
  },
  {
    id: 'gmail', name: 'Gmail', vendor: 'Google', category: 'email', direction: 'both',
    description: 'Email owners directly and send the weekly digest.',
    sends: 'Direct emails and a weekly digest per owner.', receives: 'Forwarded customer email threads.',
    defaultAccount: 'signals@invoca.example', scopes: ['Send email as signals@invoca.example', 'Read messages sent to that address'],
    configFields: [{ key: 'digestDay', label: 'Digest day', placeholder: 'Monday' }], identity: 'email',
  },
  {
    id: 'google_drive', name: 'Google Drive', vendor: 'Google', category: 'docs', direction: 'both',
    description: 'Append signals to a running voice-of-customer doc and import notes.',
    sends: 'A dated entry in the voice-of-customer doc for each product area.', receives: 'Meeting notes, decks and PDFs from a shared folder.',
    defaultAccount: 'Invoca shared drive', scopes: ['Read files in folders you choose', 'Edit documents Switchboard creates'],
    configFields: [{ key: 'folder', label: 'Folder', placeholder: 'Customer Success / Signals' }], identity: 'email',
  },
  {
    id: 'gong', name: 'Gong', vendor: 'Gong', category: 'recorder', direction: 'source',
    description: 'Pull call transcripts as soon as a recorded call ends.',
    receives: 'Transcripts with speakers and timestamps.',
    defaultAccount: 'Invoca (Gong)', scopes: ['Read call transcripts', 'Read call participants'], configFields: [], identity: null,
  },
  {
    id: 'zoom', name: 'Zoom', vendor: 'Zoom', category: 'recorder', direction: 'source',
    description: 'Import cloud-recording transcripts from customer meetings.',
    receives: 'Meeting transcripts (VTT) and participants.',
    defaultAccount: 'invoca.zoom.us', scopes: ['Read cloud recording transcripts'], configFields: [], identity: null,
  },
  {
    id: 'zendesk', name: 'Zendesk', vendor: 'Zendesk', category: 'support', direction: 'source',
    description: 'Read escalated tickets and their customer replies.',
    receives: 'Ticket threads tagged for product feedback.',
    defaultAccount: 'invoca.zendesk.com', scopes: ['Read tickets and comments'], configFields: [{ key: 'tag', label: 'Only tickets tagged', placeholder: 'product-feedback' }], identity: null,
  },
  {
    id: 'hubspot', name: 'HubSpot', vendor: 'HubSpot', category: 'crm', direction: 'source',
    description: 'Import logged calls and notes from HubSpot deals.',
    receives: 'Call notes and email logs on deals.',
    defaultAccount: 'Invoca (HubSpot)', scopes: ['Read engagements on deals and companies'], configFields: [], identity: null,
  },
  {
    id: 'notion', name: 'Notion', vendor: 'Notion', category: 'docs', direction: 'source',
    description: 'Import meeting notes from a Notion database.',
    receives: 'Pages from the databases you share.',
    defaultAccount: 'Invoca workspace', scopes: ['Read pages you share with Switchboard'], configFields: [], identity: null,
  },
];

export const connectorById = (id: string): ConnectorDef | undefined => CONNECTORS.find((c) => c.id === id);

/**
 * The connector each routing channel delivers through. 'triage' is Switchboard's own queue and
 * needs no connector. A rule whose connector is disconnected routes to triage instead, with the
 * reason on the insight ("Jira isn't connected").
 */
export const CHANNEL_CONNECTOR = {
  slack: 'slack',
  teams: 'teams',
  jira: 'jira',
  linear: 'linear',
  salesforce: 'salesforce',
  email: 'gmail',
  email_digest: 'gmail',
  google_drive: 'google_drive',
  triage: null,
} as const satisfies Record<string, ConnectorId | null>;
export type RoutableChannel = keyof typeof CHANNEL_CONNECTOR;

export const CHANNEL_LABEL: Record<RoutableChannel, string> = {
  slack: 'Slack',
  teams: 'Teams',
  jira: 'Jira',
  linear: 'Linear',
  salesforce: 'Salesforce',
  email: 'Email',
  email_digest: 'Weekly digest',
  google_drive: 'Google Drive',
  triage: 'Triage queue',
};

/**
 * Platform API (all under /repo/invoca/api, gated, JSON, Envelope<T>). Writes go to the viewer's
 * own workspace and need the usual write guard (x-signal-loop: 1 + JSON body).
 *
 *   GET    /connections                    Connection[] (every catalog connector, workspace state applied)
 *   GET    /connections/:id                { connection: Connection; activity: ConnectionActivity[] }
 *   PUT    /connections/:id  UpdateConnection   Connection
 *   POST   /connections/:id/test  {}       ConnectionTestResult (writes a 'test' activity row)
 *   GET    /people                         Person[] (seed directory with workspace edits; inactive included, flagged)
 *   POST   /people           PersonInput   Person (custom: true)
 *   PUT    /people/:id       PersonInput (partial) + { active?: boolean }   Person
 *   DELETE /people/:id                     { person: Person; reassignedRules: string[] } (deactivates; rules owned by
 *                                          them move to the triage owner in this workspace)
 *   GET    /me                             Actor
 *   PUT    /me               { personId }  Actor
 *   GET    /analyses                       AnalysisDef[] with { runs: number } for built ones
 *   GET    /overview?days=30               PlatformOverview
 */

export const ConnectionStatus = z.enum(['connected', 'disconnected', 'error']);
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;

/** A connector's state in one workspace. Absent rows read as the seed default. */
export const Connection = z.object({
  id: ConnectorId,
  status: ConnectionStatus,
  account: z.string().nullable(),
  config: z.record(z.string(), z.string()),
  connectedAt: z.string().nullable(),
  /** Person id of whoever connected it (the acting user), when known. */
  connectedBy: z.string().nullable(),
  /** Last delivery or import through it, from the activity log. */
  lastActivityAt: z.string().nullable(),
  /** Deliveries sent through it (destinations) or conversations imported (sources), all time. */
  activityCount: z.number().int(),
});
export type Connection = z.infer<typeof Connection>;

/** Connected out of the box in the seed workspace; everything else starts disconnected. */
export const SEED_CONNECTED: ConnectorId[] = ['slack', 'jira', 'linear', 'gmail', 'gong', 'zoom', 'google_drive'];

export const UpdateConnection = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect'), account: z.string().min(1).max(120).optional(), config: z.record(z.string(), z.string().max(120)).optional() }),
  z.object({ action: z.literal('configure'), config: z.record(z.string(), z.string().max(120)) }),
  z.object({ action: z.literal('disconnect') }),
]);
export type UpdateConnection = z.infer<typeof UpdateConnection>;

export type ConnectionTestResult = { ok: boolean; ms: number; receipt: string | null; message: string };

/** GET /connections/:id */
export type ConnectionDetail = { connection: Connection; activity: ConnectionActivity[] };

/** Activity through a connector: a delivery out, or an import in. */
export type ConnectionActivity = {
  id: string;
  connectorId: ConnectorId;
  direction: 'in' | 'out';
  at: string;
  title: string;
  detail: string;
  /** Run or insight it belongs to, for the link back. */
  runId: string | null;
  insightId: string | null;
  status: 'ok' | 'retried' | 'failed' | 'test';
};

// ---------------------------------------------------------------- what a document is

export const DOC_KINDS = ['call_transcript', 'meeting_notes', 'email_thread', 'chat_thread', 'support_ticket', 'survey_response', 'document', 'other'] as const;
export const DocKind = z.enum(DOC_KINDS);
export type DocKind = z.infer<typeof DocKind>;
export const DOC_KIND_LABEL: Record<DocKind, string> = {
  call_transcript: 'Call transcript',
  meeting_notes: 'Meeting notes',
  email_thread: 'Email thread',
  chat_thread: 'Chat thread',
  support_ticket: 'Support ticket',
  survey_response: 'Survey response',
  document: 'Document',
  other: 'Other',
};

/** How noisy the input is, as triage reads it. Recorded and shown; extraction does not branch on it (long inputs are split by length). */
export const Complexity = z.enum(['clean', 'noisy', 'very_noisy']);
export type Complexity = z.infer<typeof Complexity>;

/** Where a conversation came from. A connector id, or a manual route in. */
export const SOURCE_IDS = ['upload', 'paste', 'library', 'gong', 'zoom', 'gmail', 'slack', 'google_drive', 'zendesk', 'hubspot', 'notion', 'salesforce'] as const;
export const SourceId = z.enum(SOURCE_IDS);
export type SourceId = z.infer<typeof SourceId>;

/** File types the intake understands. Binary formats are converted to text in the browser. */
export const SOURCE_FORMATS = ['txt', 'md', 'vtt', 'srt', 'eml', 'chat', 'json', 'csv', 'html', 'rtf', 'pdf', 'docx', 'pptx', 'xlsx', 'odt'] as const;
export type SourceFormat = (typeof SOURCE_FORMATS)[number];

/**
 * Where a library file "came from", for runs whose row has no source (seeded history, and
 * library files run by a viewer). Deterministic from the file name and format: Zoom names its
 * cloud transcripts GMT….transcript.vtt, other recordings come from Gong, emails from Gmail,
 * chat exports from Slack, notes from Google Drive, and plain text was uploaded.
 */
export function sourceForLibraryFile(filename: string, format: string | null): SourceId {
  switch (format) {
    case 'vtt':
    case 'srt':
      return /^GMT\d|\.transcript\.vtt$/i.test(filename) ? 'zoom' : 'gong';
    case 'eml':
      return 'gmail';
    case 'chat':
      return 'slack';
    case 'md':
    case 'doc':
      return 'google_drive';
    default:
      return 'upload';
  }
}

/**
 * What a document is when the run predates triage's doc_kind (seeded history, recorded
 * replays): from the parsed format and the screen's call kind.
 */
export function inferDocKind(format: string | null, callKind: string | null | undefined): DocKind {
  if (callKind === 'email' || format === 'eml') return 'email_thread';
  if (format === 'chat') return 'chat_thread';
  if (callKind === 'notes' || format === 'md') return 'meeting_notes';
  if (format === 'doc') return 'document';
  return 'call_transcript';
}

// ---------------------------------------------------------------- analyses

export const ANALYSIS_IDS = ['product_feedback', 'follow_ups', 'deal_risk', 'support_escalation', 'compliance', 'coaching'] as const;
export const AnalysisId = z.enum(ANALYSIS_IDS);
export type AnalysisId = z.infer<typeof AnalysisId>;

export type AnalysisDef = {
  id: AnalysisId;
  name: string;
  description: string;
  /** built: runs in this workspace. not_built: listed for the roadmap; never runs. */
  availability: 'built' | 'not_built';
  produces: string;
  defaultDestinations: ConnectorId[];
};

/** GET /analyses: the catalog, with this workspace's run count on built analyses. */
export type AnalysisSummary = AnalysisDef & { runs?: number };

export const ANALYSES: AnalysisDef[] = [
  {
    id: 'product_feedback', name: 'Signal Loop', availability: 'built',
    description: 'Finds product feedback, proves it with the customer’s own words, and routes it to the owner.',
    produces: 'Insights, themes and tickets', defaultDestinations: ['jira', 'linear', 'slack', 'gmail'],
  },
  {
    id: 'follow_ups', name: 'Follow-ups', availability: 'not_built',
    description: 'Pulls out commitments and next steps, with an owner and a date.',
    produces: 'Tasks', defaultDestinations: ['salesforce', 'gmail'],
  },
  {
    id: 'deal_risk', name: 'Renewal risk', availability: 'not_built',
    description: 'Scores renewal and expansion risk from what the customer said.',
    produces: 'Account risk notes', defaultDestinations: ['salesforce', 'slack'],
  },
  {
    id: 'support_escalation', name: 'Escalations', availability: 'not_built',
    description: 'Spots outages and blockers that need support now, not next sprint.',
    produces: 'Escalation tickets', defaultDestinations: ['jira', 'slack'],
  },
  {
    id: 'compliance', name: 'Compliance review', availability: 'not_built',
    description: 'Checks for disclosures, consent language and sensitive data handling.',
    produces: 'Review findings', defaultDestinations: ['google_drive', 'gmail'],
  },
  {
    id: 'coaching', name: 'Call coaching', availability: 'not_built',
    description: 'Scores talk ratio, discovery and objection handling for CSM coaching.',
    produces: 'Coaching notes', defaultDestinations: ['google_drive', 'slack'],
  },
];

// ---------------------------------------------------------------- people

/**
 * People the platform can tag. Extends the world `Person` with per-tool identities and an
 * active flag. Workspace edits are copy-on-write over the seed directory.
 */
export const PersonIdentities = z.object({
  email: z.string().max(160).optional(),
  slack: z.string().max(80).optional(),
  teams: z.string().max(160).optional(),
  jira: z.string().max(80).optional(),
  linear: z.string().max(80).optional(),
  salesforce: z.string().max(80).optional(),
});
export type PersonIdentities = z.infer<typeof PersonIdentities>;

export const PERSON_ROLES = ['csm', 'pm', 'vp_product', 'competitive_intel', 'pricing', 'support_escalation', 'eng_manager', 'sales_lead', 'triage'] as const;
export const PERSON_ROLE_LABEL: Record<(typeof PERSON_ROLES)[number], string> = {
  csm: 'Customer success',
  pm: 'Product manager',
  vp_product: 'Product leadership',
  competitive_intel: 'Competitive intel',
  pricing: 'Pricing',
  support_escalation: 'Support',
  eng_manager: 'Engineering',
  sales_lead: 'Sales',
  triage: 'Product ops',
};

export const PersonInput = z.object({
  name: z.string().min(2).max(80),
  title: z.string().min(2).max(120),
  role: z.enum(PERSON_ROLES),
  productArea: z.enum(PRODUCT_AREAS).nullable().optional(),
  email: z.string().email().max(160),
  identities: PersonIdentities.optional(),
});
export type PersonInput = z.infer<typeof PersonInput>;

/** PUT /people/:id: any PersonInput fields, plus reactivation. */
export const PersonUpdate = PersonInput.partial().extend({ active: z.boolean().optional() });
export type PersonUpdate = z.infer<typeof PersonUpdate>;

/** DELETE /people/:id: the deactivated person and the rules handed to the triage owner. */
export type DeactivatePersonResult = { person: Person; reassignedRules: string[] };

/**
 * How a person is tagged in a tool: their identity for that connector, else the Slack handle
 * for chat, the email address for email and docs, and the name for trackers and the CRM.
 * Triage (no connector) uses the name.
 */
export function personHandle(person: Person, connectorId: ConnectorId | null): string {
  const def = connectorId ? connectorById(connectorId) : undefined;
  const own = def?.identity ? person.identities?.[def.identity]?.trim() : undefined;
  if (own) return own;
  switch (def?.category) {
    case 'chat':
      return person.slackHandle;
    case 'email':
    case 'docs':
      return person.email;
    default:
      return person.name;
  }
}

// ---------------------------------------------------------------- who is acting

/** The person the viewer is acting as. Review actions, connections and edits record it. */
export type Actor = { personId: string; name: string; title: string; initials: string; isAdmin: boolean };

/** Who a new workspace acts as: the VP Product, the agent's business owner (docs/RUNBOOK.md). */
export const DEFAULT_ACTOR_ID = 'ppl_elena';

/** Admins in the directory: product leadership, product ops, and VP / director titles. */
export function isAdminPerson(p: Pick<Person, 'role' | 'title'>): boolean {
  return p.role === 'vp_product' || p.role === 'triage' || /\b(VP|Vice President|Director|Head of)\b/i.test(p.title);
}

export function actorFor(p: Person): Actor {
  return { personId: p.id, name: p.name, title: p.title, initials: p.initials, isAdmin: isAdminPerson(p) };
}

// ---------------------------------------------------------------- overview

export type PlatformOverview = {
  window: { from: string; to: string; days: number };
  conversations: number;
  conversationsPrev: number;
  byKind: { kind: DocKind; count: number }[];
  bySource: { source: SourceId; count: number }[];
  analysesRun: { id: AnalysisId; count: number }[];
  deliveries: number;
  byConnector: { connectorId: ConnectorId | 'triage'; count: number }[];
  peopleTagged: number;
  awaitingReview: number;
  medianMinutesToOwner: number | null;
  connectedCount: number;
};
