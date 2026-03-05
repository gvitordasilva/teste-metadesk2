import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, subWeeks } from "date-fns";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { ComplaintStats } from "@/hooks/useComplaints";

interface ChannelMetricsProps {
  stats?: ComplaintStats;
  isLoading?: boolean;
}

const typeColors: Record<string, string> = {
  reclamacao: "#ef4444",
  denuncia: "#f97316",
  sugestao: "#8b5cf6",
  elogio: "#10b981",
};

const typeLabels: Record<string, string> = {
  reclamacao: "Reclamação",
  denuncia: "Denúncia",
  sugestao: "Sugestão",
  elogio: "Elogio",
};

function useTypeComparison() {
  return useQuery({
    queryKey: ["type-comparison-3weeks"],
    queryFn: async () => {
      const now = new Date();
      const currentStart = startOfWeek(now, { weekStartsOn: 1 });
      const threeWeeksAgo = subWeeks(currentStart, 3);

      const { data, error } = await supabase
        .from("complaints")
        .select("type, created_at")
        .gte("created_at", threeWeeksAgo.toISOString())
        .lt("created_at", currentStart.toISOString());

      if (error) throw error;

      const typeCounts: Record<string, number> = {};
      (data || []).forEach((c) => {
        typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
      });

      const result: Record<string, number> = {};
      Object.entries(typeCounts).forEach(([type, count]) => {
        result[type] = Math.round(count / 3);
      });
      return result;
    },
    refetchInterval: 60000,
  });
}

export function ChannelMetrics({ stats, isLoading }: ChannelMetricsProps) {
  const { data: prevAvg } = useTypeComparison();

  const data = stats?.byType.map((item) => ({
    name: item.label,
    value: item.count,
    color: typeColors[item.type] || "#6b7280",
    type: item.type,
  })) || [];

  const hasData = data.length > 0 && data.some((d) => d.value > 0);

  return (
    <Card className="h-full glass-card rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">
          Distribuição por Tipo
          <InfoTooltip text="Proporção de solicitações agrupadas por tipo (Reclamação, Denúncia, Sugestão, Elogio). As setas indicam a variação percentual em relação à média semanal das últimas 3 semanas." />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[260px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Skeleton className="h-40 w-40 rounded-full" />
            </div>
          ) : !hasData ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Sem dados para exibir
            </div>
          ) : (
            <div className="flex h-full gap-4">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [`${value}`, "Quantidade"]}
                      labelFormatter={() => ""}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col justify-center gap-2 min-w-[140px]">
                {data.map((item) => {
                  const prev = prevAvg?.[item.type] ?? 0;
                  const diff = prev > 0 ? Math.round(((item.value - prev) / prev) * 100) : 0;
                  return (
                    <div key={item.type} className="flex items-center gap-2 text-sm">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-foreground font-medium">{item.value}</span>
                      <span className="text-muted-foreground truncate">{item.name}</span>
                      {prev > 0 && (
                        <span
                          className={`text-xs font-medium ml-auto ${
                            diff > 0 ? "text-destructive" : diff < 0 ? "text-green-500" : "text-muted-foreground"
                          }`}
                        >
                          {diff > 0 ? "↑" : diff < 0 ? "↓" : "="}{Math.abs(diff)}%
                        </span>
                      )}
                    </div>
                  );
                })}
                {prevAvg && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    vs média semanal (3 sem.)
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
