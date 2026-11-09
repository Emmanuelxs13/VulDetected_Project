import { Card, CardContent } from '@vuldetected/ui';

import type { TrafficLightCounts, TrafficLightLevel } from '@/lib/severity/traffic-light';

/**
 * Executive traffic light (HU-08, CA-06 / CA-07 / CA-08).
 *
 * ## WHY THE CARD GROUPS ARE COMPUTED HERE AND NOT STORED
 *
 * The specification asks for three cards — Alta, Media, Baja — while the model
 * stores five severities plus `unclassified`. The grouping is a presentation
 * decision (ADR 0015), so it lives next to the banner instead of in the
 * database: `critical` + `high` are "Alta" (a critical finding is not a
 * different business conversation than a high one), `medium` + `unclassified`
 * are "Media" (unknown risk is never shown as safe), and `low` + `info` are
 * "Baja". The same numbers colour the banner, so the two can never disagree.
 */
export interface TrafficLightSummaryProps {
  level: TrafficLightLevel;
  label: string;
  counts: TrafficLightCounts;
  labels: {
    high: string;
    medium: string;
    low: string;
    bannerHeading: string;
    bannerDetail: string;
  };
}

const BANNER_CLASS: Record<TrafficLightLevel, string> = {
  high: 'border-critical/50 bg-critical-tint',
  medium: 'border-medium/40 bg-medium-tint',
  safe: 'border-low/40 bg-low-tint',
};

const BANNER_TEXT: Record<TrafficLightLevel, string> = {
  high: 'text-critical',
  medium: 'text-medium',
  safe: 'text-low',
};

export function TrafficLightSummary({ level, label, counts, labels }: TrafficLightSummaryProps) {
  const cards = [
    { key: 'high', label: labels.high, value: counts.critical + counts.high, accent: 'text-critical' },
    { key: 'medium', label: labels.medium, value: counts.medium + counts.unclassified, accent: 'text-medium' },
    { key: 'low', label: labels.low, value: counts.low + counts.info, accent: 'text-low' },
  ] as const;

  return (
    <section aria-label={labels.bannerHeading} className="flex flex-col gap-4">
      <div
        className={`flex flex-col gap-1 rounded-md border p-6 ${BANNER_CLASS[level]}`}
        data-traffic-light={level}
      >
        <p className={`text-2xl font-semibold tracking-tight ${BANNER_TEXT[level]}`}>{label}</p>
        <p className="text-sm text-text-muted">{labels.bannerDetail}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.key} data-severity-card={card.key}>
            <CardContent className="flex flex-col gap-1 pt-6">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {card.label}
              </p>
              <p className={`text-3xl font-semibold tabular-nums ${card.accent}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
