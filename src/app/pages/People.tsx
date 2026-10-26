/**
 * People: who Switchboard can tag, and their handle in each connected tool. Edits are private
 * to this workspace. Removing someone keeps their history and moves their routing rules to
 * product ops triage.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Person, ProductArea } from '../../shared/contracts';
import { PRODUCT_AREAS } from '../../shared/contracts';
import { PERSON_ROLE_LABEL, PERSON_ROLES, type PersonInput } from '../../shared/platform';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  ConnectorMark,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  Modal,
  Page,
  PageHeader,
  SearchInput,
  Select,
  Table,
  TableSkeleton,
  Toolbar,
  useToast,
} from '../../ds';
import { IconMore, IconUserPlus, IconUsers } from '../../ds/icons';
import { api } from '../api/client';
import { invalidate, useMe, usePeople, useRules } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { ErrorState } from '../components/domain';
import { AREA_LABEL } from '../lib/labels';
import styles from './people/people.module.css';

type Role = (typeof PERSON_ROLES)[number];

const IDENTITY_FIELDS: { key: 'slack' | 'teams' | 'jira' | 'linear' | 'salesforce'; label: string; placeholder: string; connector: string }[] = [
  { key: 'slack', label: 'Slack', placeholder: '@first.last', connector: 'slack' },
  { key: 'teams', label: 'Microsoft Teams', placeholder: 'first.last@invoca.example', connector: 'teams' },
  { key: 'jira', label: 'Jira', placeholder: 'Jira user name', connector: 'jira' },
  { key: 'linear', label: 'Linear', placeholder: 'Linear user name', connector: 'linear' },
  { key: 'salesforce', label: 'Salesforce', placeholder: 'Salesforce user', connector: 'salesforce' },
];

function slackOf(p: Person): string {
  return p.identities?.slack ?? p.slackHandle;
}

export default function PeoplePage() {
  useDocumentTitle('People');
  const people = usePeople();
  const rules = useRules();
  const me = useMe();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);

  const q = (params.get('q') ?? '').toLowerCase();
  const role = params.get('role') ?? '';
  const showRemoved = params.get('removed') === '1';
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const ruleCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rules.data ?? []) if (r.enabled) m.set(r.ownerId, (m.get(r.ownerId) ?? 0) + 1);
    return m;
  }, [rules.data]);

  const all = people.data ?? [];
  const rows = all
    .filter((p) => (showRemoved ? true : p.active !== false))
    .filter((p) => !role || p.role === role)
    .filter((p) => !q || `${p.name} ${p.title} ${p.email} ${slackOf(p)}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.active !== false) - Number(a.active !== false) || a.name.localeCompare(b.name));

  const actAs = async (p: Person) => {
    try {
      await api.setMe(p.id);
      invalidate('me', 'session', 'notifications');
      toast({ tone: 'success', title: `You’re now acting as ${p.name}`, body: 'Reviews and changes you make are recorded under this name.' });
    } catch (err) {
      toast({ tone: 'danger', title: 'Couldn’t switch user', body: err instanceof Error ? err.message : String(err) });
    }
  };

  const remove = async (p: Person) => {
    setBusy(true);
    try {
      const { data: r } = await api.deactivatePerson(p.id);
      invalidate('people', 'world', 'routing');
      toast({
        tone: 'success',
        title: `${p.name} removed`,
        body: r.reassignedRules.length ? `${r.reassignedRules.length} routing rule${r.reassignedRules.length === 1 ? '' : 's'} moved to product ops triage.` : 'They owned no routing rules.',
      });
      setRemoving(null);
    } catch (err) {
      toast({ tone: 'danger', title: 'Couldn’t remove', body: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (p: Person) => {
    try {
      await api.updatePerson(p.id, { active: true });
      invalidate('people', 'world');
      toast({ tone: 'success', title: `${p.name} restored` });
    } catch (err) {
      toast({ tone: 'danger', title: 'Couldn’t restore', body: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Page>
      <PageHeader
        title="People"
        description="Who Switchboard can tag, and how to reach each person in the tools you’ve connected."
        actions={
          <Button variant="primary" icon={<IconUserPlus />} onClick={() => setEditing('new')}>
            Add person
          </Button>
        }
      />

      <Toolbar
        start={
          <>
            <SearchInput placeholder="Search people" value={params.get('q') ?? ''} onChange={(e) => setParam('q', e.target.value || null)} aria-label="Search people" />
            <Select
              aria-label="Filter by role"
              value={role}
              onChange={(e) => setParam('role', e.target.value || null)}
              options={[{ value: '', label: 'All roles' }, ...PERSON_ROLES.map((r) => ({ value: r, label: PERSON_ROLE_LABEL[r] }))]}
              style={{ width: 180 }}
            />
          </>
        }
        end={
          <Checkbox checked={showRemoved} onChange={(v) => setParam('removed', v ? '1' : null)}>
            Show removed
          </Checkbox>
        }
      />

      {people.loading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : people.error && !people.data ? (
        <Card>
          <ErrorState error={people.error} onRetry={() => void people.refresh()} what="people" />
        </Card>
      ) : (
        <Card flush footer={<span>{rows.length} {rows.length === 1 ? 'person' : 'people'}</span>}>
          {rows.length === 0 ? (
            <EmptyState icon={<IconUsers />} title="No one matches" actions={<Button size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</Button>} />
          ) : (
            <Table label="People" minWidth={860}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Product area</th>
                  <th>Reach them in</th>
                  <th className="is-num">Owns rules</th>
                  <th className="is-shrink">
                    <span className="ds-sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const active = p.active !== false;
                  const isMe = me.data?.personId === p.id;
                  const tools = IDENTITY_FIELDS.filter((f) => !!(p.identities?.[f.key] ?? (f.key === 'slack' ? p.slackHandle : undefined)));
                  return (
                    <tr key={p.id} className="is-clickable" onClick={() => setEditing(p)}>
                      <td style={{ maxWidth: 320 }}>
                        <span className="ds-person">
                          <Avatar name={p.name} initials={p.initials} size="lg" />
                          <span className="ds-person__text">
                            <span className="ds-person__name">
                              <button type="button" className={styles.nameButton} onClick={(e) => { e.stopPropagation(); setEditing(p); }}>
                                {p.name}
                              </button>
                              {isMe ? <Badge tone="accent" className={styles.inlineBadge}>You</Badge> : null}
                              {!active ? <Badge className={styles.inlineBadge}>Removed</Badge> : null}
                            </span>
                            <span className="ds-person__sub">{p.title}</span>
                          </span>
                        </span>
                      </td>
                      <td className="is-nowrap">{PERSON_ROLE_LABEL[p.role as Role] ?? p.role}</td>
                      <td className="is-nowrap">{p.productArea ? AREA_LABEL[p.productArea] : <span className="ds-subtle">Any</span>}</td>
                      <td>
                        <span className={styles.tools}>
                          <span className={styles.email} title={p.email}>{p.email}</span>
                          {tools.map((t) => (
                            <span key={t.key} title={`${t.label}: ${p.identities?.[t.key] ?? p.slackHandle}`}>
                              <ConnectorMark id={t.connector} size={16} />
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="is-num">{ruleCount.get(p.id) ?? <span className="ds-subtle">0</span>}</td>
                      <td className="is-shrink" onClick={(e) => e.stopPropagation()}>
                        <Menu
                          label={`Actions for ${p.name}`}
                          trigger={<IconButton label={`Actions for ${p.name}`} icon={<IconMore />} size="sm" tooltip={false} />}
                          items={[
                            { label: 'Edit details', onSelect: () => setEditing(p) },
                            ...(active && !isMe ? [{ label: 'Act as this person', onSelect: () => void actAs(p) }] : []),
                            { kind: 'separator' as const },
                            active
                              ? { label: 'Remove from workspace', danger: true, disabled: isMe, onSelect: () => setRemoving(p) }
                              : { label: 'Restore', onSelect: () => void restore(p) },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {editing ? <PersonDrawer person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} ownsRules={editing === 'new' ? 0 : ruleCount.get(editing.id) ?? 0} /> : null}

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={removing ? `Remove ${removing.name}?` : ''}
        description={
          removing
            ? (ruleCount.get(removing.id) ?? 0) > 0
              ? `They own ${ruleCount.get(removing.id)} routing rule${ruleCount.get(removing.id) === 1 ? '' : 's'}. Those move to product ops triage. Past insights and deliveries keep their name.`
              : 'They stop receiving anything new. Past insights and deliveries keep their name.'
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={busy} onClick={() => removing && void remove(removing)}>
              Remove
            </Button>
          </>
        }
      />
    </Page>
  );
}

function PersonDrawer({ person, onClose, ownsRules }: { person: Person | null; onClose: () => void; ownsRules: number }) {
  const toast = useToast();
  const [form, setForm] = useState<PersonInput>(() => ({
    name: person?.name ?? '',
    title: person?.title ?? '',
    role: (person?.role as Role) ?? 'csm',
    productArea: person?.productArea ?? null,
    email: person?.email ?? '',
    identities: { slack: person ? slackOf(person) : '', ...(person?.identities ?? {}) },
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PersonInput>(k: K, v: PersonInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setId = (k: string, v: string) => setForm((f) => ({ ...f, identities: { ...(f.identities ?? {}), [k]: v } }));

  const valid = form.name.trim().length >= 2 && form.title.trim().length >= 2 && /.+@.+\..+/.test(form.email);

  const save = async () => {
    setBusy(true);
    setError(null);
    const identities = Object.fromEntries(Object.entries(form.identities ?? {}).filter(([, v]) => typeof v === 'string' && v.trim()));
    const body: PersonInput = { ...form, name: form.name.trim(), title: form.title.trim(), email: form.email.trim(), identities };
    try {
      const { data: saved } = person ? await api.updatePerson(person.id, body) : await api.createPerson(body);
      invalidate('people', 'world', 'me');
      toast({ tone: 'success', title: person ? 'Changes saved' : `${saved.name} added`, body: person ? undefined : 'They can now own routing rules and be tagged in deliveries.' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width={520}
      title={person ? person.name : 'Add a person'}
      description={person ? person.title : 'They can own routing rules and be tagged in every connected tool.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={() => void save()}>
            {person ? 'Save changes' : 'Add person'}
          </Button>
        </>
      }
    >
      <section className={styles.formSection}>
        <h3 className={styles.formTitle}>Profile</h3>
        <div className={styles.formGrid}>
          <Field label="Name" htmlFor="p-name">
            <Input id="p-name" value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Title" htmlFor="p-title">
            <Input id="p-title" value={form.title} onChange={(e) => set('title', e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Role" htmlFor="p-role">
            <Select id="p-role" value={form.role} onChange={(e) => set('role', e.target.value as Role)} options={PERSON_ROLES.map((r) => ({ value: r, label: PERSON_ROLE_LABEL[r] }))} />
          </Field>
          <Field label="Product area" htmlFor="p-area">
            <Select
              id="p-area"
              value={form.productArea ?? ''}
              onChange={(e) => set('productArea', (e.target.value || null) as ProductArea | null)}
              options={[{ value: '', label: 'Any area' }, ...PRODUCT_AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] }))]}
            />
          </Field>
          <Field label="Work email" htmlFor="p-email" className={styles.span2}>
            <Input id="p-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />
          </Field>
        </div>
      </section>

      <section className={styles.formSection}>
        <h3 className={styles.formTitle}>Handles in connected tools</h3>
        <p className={styles.formHint}>Used to mention them. Leave a tool blank to tag them by name.</p>
        <div className={styles.handles}>
          {IDENTITY_FIELDS.map((f) => (
            <div key={f.key} className={styles.handleRow}>
              <label htmlFor={`p-id-${f.key}`} className={styles.handleLabel}>
                <ConnectorMark id={f.connector} size={20} />
                {f.label}
              </label>
              <Input id={`p-id-${f.key}`} placeholder={f.placeholder} value={(form.identities?.[f.key] as string | undefined) ?? ''} onChange={(e) => setId(f.key, e.target.value)} autoComplete="off" />
            </div>
          ))}
        </div>
      </section>

      {person && ownsRules > 0 ? (
        <Callout tone="info">
          Owns {ownsRules} routing rule{ownsRules === 1 ? '' : 's'}. Changes to their handles apply to the next delivery.
        </Callout>
      ) : null}
      {error ? <Callout tone="danger">{error}</Callout> : null}
    </Drawer>
  );
}
