import { download, get, put } from './api';

// Utility readings on the RM Utility API. The server applies the display
// rules (Boiler Energy × 40, LPG kg, units, grouping, combined LPG), the
// staff record window (`canEdit`) and who may see "recorded by".

export interface TimeSlot {
  id: number;
  label: string;
  time: string;
}

export interface MetricView {
  id: number;
  name: string;
  groupName: string;
  sortOrder: number;
  kind: 'index' | 'status';
  unit: string;
  /** Unit to show next to display values ("" for none). */
  displayUnit: string;
  displayFactor: number;
  showInAnalytics: boolean;
}

export interface ReadingView {
  id: number;
  /** Raw meter number (what's typed and stored). */
  value: number;
  /** Converted for display (e.g. × 40). */
  displayValue: number;
  date: string;
  timeSlotId: number;
  recordedBy: string | null;
  updatedAt: string;
}

export interface Sheet {
  date: string;
  timeSlotId: number;
  recorded: number;
  total: number;
  groups: { group: string; entries: { metric: MetricView; reading: ReadingView | null; canEdit: boolean }[] }[];
}

export interface DifferenceRow {
  metricId: number | null;
  name: string;
  start: number | null;
  end: number | null;
  delta: number | null;
  displayStart: number | null;
  displayEnd: number | null;
  displayDelta: number | null;
  unit: string;
  combined: boolean;
}

export interface Difference {
  from: { date: string; timeSlot: TimeSlot };
  to: { date: string; timeSlot: TimeSlot };
  groups: { group: string; rows: DifferenceRow[] }[];
}

export interface Trend {
  metric: MetricView;
  chart: { mode: 'difference' | 'value'; points: { date: string; timeSlotId: number; timeLabel: string; value: number }[] };
  readings: (ReadingView & { timeLabel: string })[];
  canEdit: boolean;
}

export type Period = 'day' | 'night' | 'full';

/** Local-calendar YYYY-MM-DD (toISOString would shift to UTC). */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}

export const isMorning = (s: TimeSlot) => s.time < '12:00';

export const fetchTimeSlots = () => get<TimeSlot[]>('/utilities/time-slots');

export const fetchSheet = (date: string, timeSlotId: number) => get<Sheet>('/readings/sheet', { date, timeSlotId });

/** Record or correct a reading (raw meter number). */
export const saveReading = (metricId: number, date: string, timeSlotId: number, value: number) =>
  put<ReadingView>('/readings', { metricId, date, timeSlotId, value });

export const fetchDifference = (date: string, period: Period) => get<Difference>('/readings/difference', { date, period });

/** Metrics offered in Analytics (no Occupants), grouped and ordered. */
export async function fetchAnalyticsMetrics(): Promise<MetricView[]> {
  const groups = await get<{ group: string; metrics: MetricView[] }[]>('/utilities/metrics', { analytics: true });
  return groups.flatMap((g) => g.metrics);
}

export const fetchTrend = (metricId: number, from: string, to: string, timeSlotId?: number | null) =>
  get<Trend>('/readings/trend', { metricId, from, to, timeSlotId: timeSlotId ?? undefined });

/** Excel export of every metric for a date range, built by the server. */
export const downloadReadingsExport = (from: string, to: string) =>
  download('/readings/export.xlsx', { from, to }, `RM_Utility_Report_${from}_${to}.xlsx`);

export const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
