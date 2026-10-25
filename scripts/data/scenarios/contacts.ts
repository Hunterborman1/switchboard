/** Customer-side contacts per account (fictional), plus the account's local UTC offset in October. */
import type { Attendee } from '../lib/types.ts';
import { accountById, personById } from '../world.ts';

type Contact = { name: string; title: string; email: string };

const c = (name: string, title: string, domain: string): Contact => ({
  name,
  title,
  email: `${name.split(' ')[0]!.toLowerCase()}.${name.split(' ').slice(-1)[0]!.toLowerCase()}@${domain}`,
});

export const CONTACTS: Record<string, Contact[]> = {
  acct_brightline: [
    c('Dana Ortiz', 'Director of Marketing', 'brightlinehome.example'),
    c('Jeff Kim', 'Director of Operations', 'brightlinehome.example'),
    c('Carla Nguyen', 'Dispatch Manager', 'brightlinehome.example'),
    c('Priyanka Shah', 'Marketing Operations Specialist', 'brightlinehome.example'),
  ],
  acct_meridian: [
    c('Lauren Whitfield', 'VP, Patient Access', 'meridianhp.example'),
    c('Kevin Osei', 'Director, Digital Marketing', 'meridianhp.example'),
    c('Sandra Pruitt', 'Privacy & Compliance Officer', 'meridianhp.example'),
    c('Mark Delgado', 'Contact Center Manager', 'meridianhp.example'),
  ],
  acct_atlas: [
    c('Greg Hollis', 'VP, Marketing', 'atlasautogroup.example'),
    c('Tanya Mercer', 'BDC Director', 'atlasautogroup.example'),
    c('Raj Malhotra', 'Group Controller', 'atlasautogroup.example'),
    c('Steve Kowalski', 'Director of Fixed Operations', 'atlasautogroup.example'),
  ],
  acct_keystone: [
    c('Patricia Hale', 'SVP, Distribution & Marketing', 'keystonemutual.example'),
    c('Nate Simmons', 'Director, Contact Center Operations', 'keystonemutual.example'),
    c('Erin Walsh', 'Marketing Analytics Manager', 'keystonemutual.example'),
    c('Luis Ortega', 'Claims Operations Manager', 'keystonemutual.example'),
  ],
  acct_northwind: [
    c('Brandon Hughes', 'Director, Sales Operations', 'northwindtel.example'),
    c('Michelle Tran', 'Contact Center Technology Manager', 'northwindtel.example'),
    c('Owen Price', 'VP, Digital Marketing', 'northwindtel.example'),
    c('Kayla Jensen', 'Senior Procurement Manager', 'northwindtel.example'),
  ],
  acct_harbor: [
    c('Linda Sorensen', 'VP, Member Experience', 'harborfcu.example'),
    c('Jason Park', 'Marketing Operations Manager', 'harborfcu.example'),
    c('Denise Morales', 'Compliance Manager', 'harborfcu.example'),
    c('Tyler Reed', 'Salesforce Administrator', 'harborfcu.example'),
  ],
  acct_sunpeak: [
    c('Marisol Vega', 'Director of Sales', 'sunpeaksolar.example'),
    c('Cody Barrett', 'Head of Growth Marketing', 'sunpeaksolar.example'),
    c('Hector Ruiz', 'Spanish Sales Team Lead', 'sunpeaksolar.example'),
    c('Amanda Pierce', 'Finance Director', 'sunpeaksolar.example'),
  ],
  acct_cedarridge: [
    c('Heather Collins', 'Director of Practice Operations', 'cedarridgedental.example'),
    c('Megan Foster', 'Marketing Manager', 'cedarridgedental.example'),
    c('Rosa Jimenez', 'Practice Manager, Hillcrest office', 'cedarridgedental.example'),
  ],
  acct_evergreen: [
    c('Kyle Brennan', 'Owner', 'evergreenpestlawn.example'),
    c('Ashley Moore', 'Marketing Manager', 'evergreenpestlawn.example'),
  ],
  acct_coastal: [
    c('Vanessa Grant', 'VP, Ecommerce & Marketing', 'coastalcomfort.example'),
    c('Darnell Wright', 'Contact Center Director', 'coastalcomfort.example'),
    c('Julie Hammond', 'Retail Operations Analyst', 'coastalcomfort.example'),
  ],
  acct_ridgeway: [
    c('Frank DeLuca', 'General Manager', 'ridgewaymotors.example'),
    c('Brittany Sawyer', 'BDC Manager', 'ridgewaymotors.example'),
    c('Mike Castillo', 'Internet Sales Director', 'ridgewaymotors.example'),
  ],
  acct_bluewater: [
    c('Gwen Albright', 'Chief Operating Officer', 'bluewaterins.example'),
    c('Sanjay Iyer', 'Director, Agency Operations', 'bluewaterins.example'),
    c('Carol Bennett', 'Quality Assurance Manager', 'bluewaterins.example'),
    c('Peter Lang', 'CRM & Telephony Administrator', 'bluewaterins.example'),
  ],
  acct_prairielink: [
    c('Dale Henderson', 'Director of Digital', 'prairielink.example'),
    c('Becca Lund', 'Customer Care Manager', 'prairielink.example'),
    c('Ryan Fischer', 'Web Development Lead', 'prairielink.example'),
  ],
  acct_frontier: [
    c('Monica Chen', 'SVP, Consumer Direct Lending', 'frontierhl.example'),
    c('Andre Williams', 'Director, Contact Center Operations', 'frontierhl.example'),
    c('Stacy Klein', 'Salesforce Platform Owner', 'frontierhl.example'),
    c('Victor Huang', 'Chief Compliance Officer', 'frontierhl.example'),
  ],
};

/** Partner platforms each account actually connects to Invoca (generator context; keeps stories consistent). */
export const INTEGRATIONS_USED: Record<string, string[]> = {
  acct_brightline: ['Google Ads (offline conversions for Smart Bidding)', 'Meta'],
  acct_meridian: ['Genesys (central scheduling)', 'Salesforce Health Cloud', 'Google Ads'],
  acct_atlas: ['Google Ads', 'Meta', 'Salesforce (BDC leads)'],
  acct_keystone: ['Genesys', 'Salesforce', 'Google Ads', 'Adobe Analytics'],
  acct_northwind: ['Genesys', 'Google Ads', 'Adobe Analytics'],
  acct_harbor: ['Salesforce Financial Services Cloud', 'Google Ads'],
  acct_sunpeak: ['Google Ads', 'Meta', 'Salesforce'],
  acct_cedarridge: ['Google Ads', 'Meta'],
  acct_evergreen: ['Google Ads'],
  acct_coastal: ['Amazon Connect', 'Google Ads', 'Meta'],
  acct_ridgeway: ['Google Ads', 'Salesforce (BDC leads)'],
  acct_bluewater: ['Genesys', 'Salesforce', 'Google Ads'],
  acct_prairielink: ['Google Ads', 'Marketo'],
  acct_frontier: ['Five9', 'Salesforce (custom Loan Application object)', 'Google Ads', 'Adobe Analytics'],
};

/** First names already used by Invoca staff or other accounts; generated side characters must avoid them. */
export function reservedFirstNames(accountId: string | null): string[] {
  const names = new Set<string>(['Marcus', 'Priya', 'Diego', 'Rachel', 'Tom', 'Aisha', 'Renee', 'Nina', 'Omar', 'Lena', 'Sam', 'Grace', 'Ben', 'Alex', 'Elena', 'Jordan', 'Kate', 'Derek', 'Mei', 'Chris', 'Jamie', 'Leah', 'Paul']);
  for (const [id, list] of Object.entries(CONTACTS)) if (id !== accountId) for (const x of list) names.add(x.name.split(' ')[0] as string);
  return [...names].sort();
}

/** UTC offset in late October 2026 (before DST ends on Nov 1). */
export const ACCOUNT_TZ: Record<string, string> = {
  acct_brightline: '-04:00', acct_meridian: '-05:00', acct_atlas: '-07:00', acct_keystone: '-04:00',
  acct_northwind: '-06:00', acct_harbor: '-07:00', acct_sunpeak: '-05:00', acct_cedarridge: '-06:00',
  acct_evergreen: '-04:00', acct_coastal: '-04:00', acct_ridgeway: '-05:00', acct_bluewater: '-04:00',
  acct_prairielink: '-05:00', acct_frontier: '-05:00',
};

/** Customer attendee by account and first name. */
export function contact(accountId: string, first: string): Attendee {
  const found = (CONTACTS[accountId] ?? []).find((x) => x.name.split(' ')[0] === first);
  if (!found) throw new Error(`no contact ${first} at ${accountId}`);
  return { name: found.name, org: 'customer', title: found.title, email: found.email };
}

/** Invoca attendee from people.json. */
export function invoca(personId: string): Attendee {
  const p = personById(personId);
  return { name: p.name, org: 'invoca', title: p.title, email: p.email };
}

/** The account's CSM as an attendee. */
export function csmOf(accountId: string): Attendee {
  return invoca(accountById(accountId).csmId);
}
