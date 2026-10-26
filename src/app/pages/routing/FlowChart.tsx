/**
 * Where insights go: insight type → product area → owner, under the current (or previewed)
 * rules. A small hand-laid-out flow chart: SVG for the bars and links, HTML for the labels so
 * every label sits in its own gutter, truncates with an ellipsis and carries the full value in
 * a title. Links are coloured by insight type, on both hops, at low opacity. Below 560px wide
 * the same data reads as a ranked list of owners.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { INSIGHT_TYPES, type InsightType, type ProductArea } from '../../../shared/contracts';
import { DotLabel } from '../../../ds';
import { AREA_SHORT, TYPE_COLOR, TYPE_LABEL } from '../../lib/labels';
import styles from './routing.module.css';

export type Flow = {
  type: InsightType;
  area: string;
  ownerId: string;
  count: number;
};

const BAR = 8;
const MIN_H = 24;
const GAP = 12;
const HEAD = 28;

type Col = 'type' | 'area' | 'owner';
type Node = {
  col: Col;
  key: string;
  label: string;
  value: number;
  y: number;
  h: number;
};
type Link = {
  id: string;
  type: InsightType;
  from: Node;
  to: Node;
  value: number;
  w: number;
  y0: number;
  y1: number;
};
type Focus = { col: Col; key: string } | { link: string } | null;

const areaLabel = (a: string) => AREA_SHORT[a as ProductArea] ?? a;

function sizes(width: number) {
  return width >= 900 ? { typeW: 172, midW: 176, ownerW: 176 } : { typeW: 168, midW: 140, ownerW: 148 };
}

function layout(flows: Flow[], width: number, personName: (id: string) => string) {
  const total = flows.reduce((s, f) => s + f.count, 0);
  const sum = (pred: (f: Flow) => boolean) => flows.filter(pred).reduce((s, f) => s + f.count, 0);

  // Column order: types in their fixed order (colour follows the type), areas and owners by the
  // weighted position of what flows into them, so lines cross as little as possible.
  const types = INSIGHT_TYPES.filter((t) => flows.some((f) => f.type === t));
  const typeIdx = new Map(types.map((t, i) => [t, i]));
  const bary = <K,>(keys: K[], keyOf: (f: Flow) => K, posOf: (f: Flow) => number) =>
    keys
      .map((k) => {
        const fs = flows.filter((f) => keyOf(f) === k);
        const w = fs.reduce((s, f) => s + f.count, 0) || 1;
        return { k, pos: fs.reduce((s, f) => s + posOf(f) * f.count, 0) / w };
      })
      .sort((a, b) => a.pos - b.pos)
      .map((x) => x.k);
  const areas = bary(
    [...new Set(flows.map((f) => f.area))].sort(),
    (f) => f.area,
    (f) => typeIdx.get(f.type) ?? 0,
  );
  const areaIdx = new Map(areas.map((a, i) => [a, i]));
  const owners = bary(
    [...new Set(flows.map((f) => f.ownerId))].sort((a, b) => personName(a).localeCompare(personName(b))),
    (f) => f.ownerId,
    (f) => areaIdx.get(f.area) ?? 0,
  );
  const ownerIdx = new Map(owners.map((o, i) => [o, i]));

  // Scale: the busiest column sets pixels per insight; small nodes get a minimum height so their
  // label always fits beside them.
  const nMax = Math.max(types.length, areas.length, owners.length);
  const target = Math.max(300, Math.min(560, nMax * 40));
  const k = Math.max(0.2, (target - GAP * (nMax - 1)) / Math.max(total, 1));
  const column = (col: Col, keys: string[], value: (key: string) => number, label: (key: string) => string): Node[] => {
    let y = 0;
    return keys.map((key) => {
      const v = value(key);
      const h = Math.max(MIN_H, v * k);
      const n = { col, key, label: label(key), value: v, y, h };
      y += h + GAP;
      return n;
    });
  };
  const typeNodes = column(
    'type',
    types,
    (t) => sum((f) => f.type === t),
    (t) => TYPE_LABEL[t as InsightType],
  );
  const areaNodes = column('area', areas, (a) => sum((f) => f.area === a), areaLabel);
  const ownerNodes = column('owner', owners, (o) => sum((f) => f.ownerId === o), personName);
  const colH = (ns: Node[]) => (ns.length ? ns[ns.length - 1]!.y + ns[ns.length - 1]!.h : 0);
  const height = Math.max(colH(typeNodes), colH(areaNodes), colH(ownerNodes));
  for (const ns of [typeNodes, areaNodes, ownerNodes]) {
    const off = (height - colH(ns)) / 2;
    for (const n of ns) n.y += off + HEAD;
  }

  const { typeW, midW, ownerW } = sizes(width);
  const typeX = typeW;
  const ownerX = width - ownerW - BAR;
  const span = (ownerX - (typeX + BAR) - midW) / 2;
  const midX = typeX + BAR + span;

  const byKey = (ns: Node[]) => new Map(ns.map((n) => [n.key, n]));
  const T = byKey(typeNodes);
  const A = byKey(areaNodes);
  const O = byKey(ownerNodes);

  // Stack link ends inside each node, centred when the node is taller than its links.
  const cursorOut = new Map<Node, number>();
  const cursorIn = new Map<Node, number>();
  const start = (n: Node, m: Map<Node, number>) => m.get(n) ?? n.y + (n.h - n.value * k) / 2;
  const take = (n: Node, m: Map<Node, number>, w: number) => {
    const y = start(n, m);
    m.set(n, y + w);
    return y + w / 2;
  };

  const hop1 = new Map<string, { type: InsightType; area: string; value: number }>();
  const hop2 = new Map<string, { type: InsightType; area: string; owner: string; value: number }>();
  for (const f of flows) {
    const a = hop1.get(`${f.type}|${f.area}`) ?? {
      type: f.type,
      area: f.area,
      value: 0,
    };
    a.value += f.count;
    hop1.set(`${f.type}|${f.area}`, a);
    const b = hop2.get(`${f.area}|${f.ownerId}|${f.type}`) ?? {
      type: f.type,
      area: f.area,
      owner: f.ownerId,
      value: 0,
    };
    b.value += f.count;
    hop2.set(`${f.area}|${f.ownerId}|${f.type}`, b);
  }
  const links: Link[] = [];
  // Out of each type, ordered by area; into each area, ordered by type.
  const l1 = [...hop1.values()];
  const outs1 = new Map<string, number>();
  for (const l of [...l1].sort((p, q) => typeIdx.get(p.type)! - typeIdx.get(q.type)! || areaIdx.get(p.area)! - areaIdx.get(q.area)!)) {
    const w = l.value * k;
    outs1.set(`${l.type}|${l.area}`, take(T.get(l.type)!, cursorOut, w));
  }
  for (const l of [...l1].sort((p, q) => areaIdx.get(p.area)! - areaIdx.get(q.area)! || typeIdx.get(p.type)! - typeIdx.get(q.type)!)) {
    const w = l.value * k;
    links.push({
      id: `1|${l.type}|${l.area}`,
      type: l.type,
      from: T.get(l.type)!,
      to: A.get(l.area)!,
      value: l.value,
      w,
      y0: outs1.get(`${l.type}|${l.area}`)!,
      y1: take(A.get(l.area)!, cursorIn, w),
    });
  }
  // Out of each area, ordered by owner then type; into each owner, ordered by area then type.
  const l2 = [...hop2.values()];
  const outs2 = new Map<string, number>();
  for (const l of [...l2].sort((p, q) => areaIdx.get(p.area)! - areaIdx.get(q.area)! || ownerIdx.get(p.owner)! - ownerIdx.get(q.owner)! || typeIdx.get(p.type)! - typeIdx.get(q.type)!)) {
    outs2.set(`${l.area}|${l.owner}|${l.type}`, take(A.get(l.area)!, cursorOut, l.value * k));
  }
  for (const l of [...l2].sort((p, q) => ownerIdx.get(p.owner)! - ownerIdx.get(q.owner)! || areaIdx.get(p.area)! - areaIdx.get(q.area)! || typeIdx.get(p.type)! - typeIdx.get(q.type)!)) {
    const w = l.value * k;
    links.push({
      id: `2|${l.area}|${l.owner}|${l.type}`,
      type: l.type,
      from: A.get(l.area)!,
      to: O.get(l.owner)!,
      value: l.value,
      w,
      y0: outs2.get(`${l.area}|${l.owner}|${l.type}`)!,
      y1: take(O.get(l.owner)!, cursorIn, w),
    });
  }

  return {
    total,
    typeNodes,
    areaNodes,
    ownerNodes,
    links,
    height: height + HEAD,
    typeX,
    midX,
    midW,
    ownerX,
    typeW,
    ownerW,
  };
}

function linkPath(l: Link, g: { typeX: number; midX: number; midW: number; ownerX: number }): string {
  const x0 = l.from.col === 'type' ? g.typeX + BAR : g.midX + g.midW;
  const x1 = l.to.col === 'area' ? g.midX : g.ownerX;
  const xm = (x0 + x1) / 2;
  return `M${x0},${l.y0} C${xm},${l.y0} ${xm},${l.y1} ${x1},${l.y1}`;
}

function touches(l: Link, f: Focus): boolean {
  if (!f) return false;
  if ('link' in f) return f.link === l.id;
  if (f.col === 'type') return l.type === f.key;
  if (f.col === 'area') return l.from.key === f.key || l.to.key === f.key;
  return l.to.col === 'owner' && l.to.key === f.key;
}

export function summarizeFlows(flows: Flow[], personName: (id: string) => string): string {
  const total = flows.reduce((s, f) => s + f.count, 0);
  const tally = (keyOf: (f: Flow) => string) => {
    const m = new Map<string, number>();
    for (const f of flows) m.set(keyOf(f), (m.get(keyOf(f)) ?? 0) + f.count);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const owners = tally((f) => f.ownerId);
  const areas = tally((f) => f.area);
  const top = owners[0];
  const busiest = areas[0];
  if (!top || !busiest) return 'No insights to route yet.';
  return `${total.toLocaleString()} insights reach ${owners.length} owner${owners.length === 1 ? '' : 's'}. ${personName(top[0])} receives the most (${top[1]}), and ${areaLabel(busiest[0])} is the busiest product area (${busiest[1]}).`;
}

export function FlowChart({ flows, personName }: { flows: Flow[]; personName: (id: string) => string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [focus, setFocus] = useState<Focus>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => (width >= 560 ? layout(flows, width, personName) : null), [flows, width, personName]);
  const typesPresent = INSIGHT_TYPES.filter((t) => flows.some((f) => f.type === t));

  const showTip = (e: ReactMouseEvent, text: string) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text });
  };
  const clear = () => {
    setFocus(null);
    setTip(null);
  };

  const nodeProps = (n: Node) => ({
    onMouseEnter: () => setFocus({ col: n.col, key: n.key }),
    onMouseLeave: clear,
    title: `${n.label}: ${n.value} insight${n.value === 1 ? '' : 's'}`,
  });

  return (
    <div className={styles.flow}>
      <div ref={wrapRef} className={styles.flowCanvas} style={g ? { height: g.height } : undefined} onMouseLeave={clear}>
        {g ? (
          <>
            <svg className={styles.flowSvg} width={width} height={g.height} role="img" aria-label={summarizeFlows(flows, personName)}>
              <g>
                {g.links.map((l) => {
                  const on = touches(l, focus);
                  const label = l.from.col === 'type' ? `${TYPE_LABEL[l.type]} in ${l.to.label}: ${l.value}` : `${TYPE_LABEL[l.type]} from ${l.from.label} to ${l.to.label}: ${l.value}`;
                  return (
                    <path
                      key={l.id}
                      className={styles.flowLink}
                      d={linkPath(l, g)}
                      stroke={TYPE_COLOR[l.type]}
                      strokeWidth={Math.max(1, l.w)}
                      strokeOpacity={focus ? (on ? 0.55 : 0.07) : 0.28}
                      onMouseEnter={(e) => {
                        setFocus({ link: l.id });
                        showTip(e, label);
                      }}
                      onMouseMove={(e) => showTip(e, label)}
                      onMouseLeave={clear}
                    />
                  );
                })}
              </g>
              {g.typeNodes.map((n) => (
                <rect key={`t${n.key}`} className={styles.flowNode} x={g.typeX} y={n.y} width={BAR} height={n.h} rx={2} fill={TYPE_COLOR[n.key as InsightType]} {...nodeProps(n)} />
              ))}
              {g.areaNodes.map((n) => (
                <rect key={`a${n.key}`} className={styles.flowArea} x={g.midX} y={n.y} width={g.midW} height={n.h} rx={4} {...nodeProps(n)} />
              ))}
              {g.ownerNodes.map((n) => (
                <rect key={`o${n.key}`} className={styles.flowOwnerBar} x={g.ownerX} y={n.y} width={BAR} height={n.h} rx={2} {...nodeProps(n)} />
              ))}
            </svg>

            <span className={styles.flowHead} style={{ left: 0, width: g.typeX - 12, textAlign: 'right' }}>
              Insight type
            </span>
            <span className={styles.flowHead} style={{ left: g.midX + 10, width: g.midW - 20 }}>
              Product area
            </span>
            <span className={styles.flowHead} style={{ left: g.ownerX + BAR + 10, width: g.ownerW - 10 }}>
              Owner
            </span>

            {g.typeNodes.map((n) => (
              <span
                key={`tl${n.key}`}
                className={`${styles.flowLabel} ${styles.flowLabelEnd}`}
                style={{
                  top: n.y + n.h / 2 - 10,
                  left: 0,
                  width: g.typeX - 12,
                }}
                {...nodeProps(n)}
              >
                <span className={styles.flowName}>{n.label}</span>
                <span className={styles.flowCount}>{n.value}</span>
              </span>
            ))}
            {g.areaNodes.map((n) => (
              <span
                key={`al${n.key}`}
                className={`${styles.flowLabel} ${styles.flowLabelSplit}`}
                style={{
                  top: n.y + n.h / 2 - 10,
                  left: g.midX + 10,
                  width: g.midW - 20,
                }}
                {...nodeProps(n)}
              >
                <span className={styles.flowName}>{n.label}</span>
                <span className={styles.flowCount}>{n.value}</span>
              </span>
            ))}
            {g.ownerNodes.map((n) => (
              <span
                key={`ol${n.key}`}
                className={styles.flowLabel}
                style={{
                  top: n.y + n.h / 2 - 10,
                  left: g.ownerX + BAR + 10,
                  width: g.ownerW - 10,
                }}
                {...nodeProps(n)}
              >
                <span className={styles.flowName}>{n.label}</span>
                <span className={styles.flowCount}>{n.value}</span>
              </span>
            ))}

            {tip ? (
              <span
                className={`ds-tooltip ${styles.flowTip}`}
                style={{
                  left: Math.min(tip.x + 12, width - 220),
                  top: tip.y + 14,
                }}
              >
                {tip.text}
              </span>
            ) : null}
          </>
        ) : width > 0 ? (
          <FlowList flows={flows} personName={personName} />
        ) : null}
      </div>

      <div className={styles.flowFoot}>
        <div className={styles.flowLegend} aria-label="Insight types">
          {typesPresent.map((t) => (
            <DotLabel key={t} color={TYPE_COLOR[t]}>
              {TYPE_LABEL[t]}
            </DotLabel>
          ))}
        </div>
        <p className={styles.flowSummary}>{summarizeFlows(flows, personName)} Line width shows the number of insights.</p>
      </div>
    </div>
  );
}

/** The same flows as a ranked list of owners: what each owner receives, by type. */
export function FlowList({ flows, personName }: { flows: Flow[]; personName: (id: string) => string }) {
  const byOwner = new Map<string, { total: number; types: Map<InsightType, number> }>();
  for (const f of flows) {
    const o = byOwner.get(f.ownerId) ?? {
      total: 0,
      types: new Map<InsightType, number>(),
    };
    o.total += f.count;
    o.types.set(f.type, (o.types.get(f.type) ?? 0) + f.count);
    byOwner.set(f.ownerId, o);
  }
  const rows = [...byOwner.entries()].sort((a, b) => b[1].total - a[1].total);
  const max = Math.max(1, ...rows.map(([, r]) => r.total));
  return (
    <ul className={styles.ownerList} aria-label="Insights per owner">
      {rows.map(([owner, r]) => {
        const parts = INSIGHT_TYPES.filter((t) => r.types.has(t)).map((t) => ({
          t,
          n: r.types.get(t)!,
        }));
        return (
          <li key={owner} className={styles.ownerRow}>
            <div className={styles.ownerHead}>
              <span className={styles.ownerName}>{personName(owner)}</span>
              <span className={styles.ownerTotal}>{r.total}</span>
            </div>
            <div className={styles.ownerBar} style={{ width: `${(r.total / max) * 100}%` }} aria-hidden="true">
              {parts.map(({ t, n }) => (
                <span key={t} className={styles.ownerSeg} style={{ flexGrow: n, background: TYPE_COLOR[t] }} />
              ))}
            </div>
            <div className={styles.ownerTypes}>{parts.map(({ t, n }) => `${TYPE_LABEL[t]} ${n}`).join(', ')}</div>
          </li>
        );
      })}
    </ul>
  );
}
