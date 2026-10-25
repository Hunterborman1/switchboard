import { readFileSync } from 'node:fs';
import type { Account, Person, RoutingRule } from '../../src/shared/contracts.ts';

const root = new URL('../fixtures/', import.meta.url);
export const world = JSON.parse(readFileSync(new URL('world.json', root), 'utf8')) as { accounts: Account[]; people: Person[]; rules: RoutingRule[] };
export function fixtureFile(name: string): string {
  return readFileSync(new URL(`files/${name}`, root), 'utf8');
}
export const account = (id: string) => world.accounts.find((a) => a.id === id)!;
