export type KpiKey = string;

export function useKpiBreakdown(_kpiKey: KpiKey | null) {
  return { data: null, isLoading: false };
}
