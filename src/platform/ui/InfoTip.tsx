/**
 * A small "i" next to a label: its plain-English definition shows on hover or keyboard focus,
 * in the design system's tooltip (portalled, so it never clips inside a table or a card).
 */
import type { ReactNode } from 'react';
import { Tooltip } from '../../ds';
import { IconInfo } from '../../ds/icons';

/** Info button with a definition. `label` names what is being defined (for screen readers). */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip label={children}>
      <button type="button" className="ao-info" aria-label={`About ${label.toLowerCase()}`} onClick={(e) => e.stopPropagation()}>
        <IconInfo size={14} />
      </button>
    </Tooltip>
  );
}
