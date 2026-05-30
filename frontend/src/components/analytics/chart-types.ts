export type SeriesPoint = {
  ts: number;
  label: string;
  success: number;
  error: number;
};
export type ByTypePoint = { type: string; success: number; error: number };
export type PiePoint = { name: string; value: number };
export type ChartLabels = { success: string; error: string };

export const CHART_COLORS = [
  "hsl(221 83% 53%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(280 67% 55%)",
];

export const CHART_TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 6,
};
