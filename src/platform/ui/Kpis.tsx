/** HB MetricStrip, plus the accessible group label its source accepts (`label`) but its .d.ts omits. */
import { MetricStrip as HbMetricStrip, type MetricStripProps } from '../../system/components/blocks/MetricStrip.jsx';

export const MetricStrip = HbMetricStrip as unknown as (p: MetricStripProps & { label?: string }) => JSX.Element;
