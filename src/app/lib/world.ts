import { useMemo } from 'react';
import type { Account, Person } from '../../shared/contracts';
import { useWorld } from '../api/hooks';

export type WorldIndex = {
  ready: boolean;
  accounts: Account[];
  people: Person[];
  account: (id: string | null | undefined) => Account | null;
  person: (id: string | null | undefined) => Person | null;
  accountName: (id: string | null | undefined) => string;
  personName: (id: string | null | undefined) => string;
};

export function useWorldIndex(): WorldIndex {
  const { data } = useWorld();
  return useMemo(() => {
    const accounts = data?.accounts ?? [];
    const people = data?.people ?? [];
    const am = new Map(accounts.map((a) => [a.id, a]));
    const pm = new Map(people.map((p) => [p.id, p]));
    return {
      ready: !!data,
      accounts,
      people,
      account: (id) => (id ? am.get(id) ?? null : null),
      person: (id) => (id ? pm.get(id) ?? null : null),
      accountName: (id) => (id ? am.get(id)?.name ?? id : 'No account'),
      personName: (id) => (id ? pm.get(id)?.name ?? id : 'Unassigned'),
    };
  }, [data]);
}
