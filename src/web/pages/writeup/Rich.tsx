/**
 * Inline text from src/shared/writeup: **bold** and [label](href). Site routes go through the
 * router, anchors and URLs are plain links, and outside links open in a new tab.
 */
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { parseInline } from '../../../shared/writeup/types';

export function Rich({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((p, i) => {
        if (p.kind === 'bold') return <b key={i}>{p.text}</b>;
        if (p.kind === 'text') return <Fragment key={i}>{p.text}</Fragment>;
        if (p.href.startsWith('/'))
          return (
            <Link key={i} className="n-link" to={p.href}>
              {p.text}
            </Link>
          );
        const external = /^https?:/.test(p.href);
        return (
          <a key={i} className="n-link" href={p.href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
            {p.text}
          </a>
        );
      })}
    </>
  );
}

export const BASE = import.meta.env.BASE_URL;
export const ZIP_HREF = `${BASE}switchboard-docs.zip`;
