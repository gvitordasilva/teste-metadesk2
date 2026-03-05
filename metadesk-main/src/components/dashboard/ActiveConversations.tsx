import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Legend,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { subWeeks } from "date-fns";

function useSessionsByHourWithComparison() {
  return useQuery({
    queryKey: ["sessions-by-hour-comparison"],
    queryFn: async () => {
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const todayDow = today.getDay();

      // Fetch last 3 weeks of data for the same day of week + today
      const threeWeeksAgo = subWeeks(today, 3);

      const { data, error } = await supabase
        .from("service_sessions")
        .select("started_at")
        .gte("started_at", threeWeeksAgo.toISOString());

      if (error) throw error;

      // Separate today vs previous same-weekday sessions
      const todayCounts: Record<number, number> = {};
      const prevCounts: Record<number, number[]> = {};
      for (let h = 0; h < 24; h++) {
        todayCounts[h] = 0;
        prevCounts[h] = [];
      }

      // Group previous weeks by week
      const weekBuckets: Record<string, Record<number, number>> = {};

      (data || []).forEach((s) => {
        const d = new Date(s.started_at);
        const sDate = new Date(d);
        sDate.setHours(0, 0, 0, 0);

        if (sDate.getTime() === today.getTime()) {
          todayCounts[d.getHours()]++;
        } else if (d.getDay() === todayDow) {
          const weekKey = `${sDate.getFullYear()}-${sDate.getMonth()}-${sDate.getDate()}`;
          if (!weekBuckets[weekKey]) {
            weekBuckets[weekKey] = {};
            for (let h = 0; h < 24; h++) weekBuckets[weekKey][h] = 0;
          }
          weekBuckets[weekKey][d.getHours()]++;
        }
      });

      // Calculate average per hour from previous weeks
      const weekKeys = Object.keys(weekBuckets);
      const numWeeks = weekKeys.length || 1;

      return Array.from({ length: 16 }, (_, i) => {
        const h = i + 7;
        const avgPrev = weekKeys.length > 0
          ? parseFloat((weekKeys.reduce((sum, wk) => sum + (weekBuckets[wk][h] || 0), 0) / numWeeks).toFixed(1))
          : 0;
        return {
          hora: `${String(h).padStart(2, "0")}h`,
          ativos: todayCounts[h] || 0,
          media: avgPrev,
        };
      });
    },
    refetchInterval: 60000,
  });
}

export function ActiveConversations() {
  const { data, isLoading } = useSessionsByHourWithComparison();

  const hasData = data && data.some((d) => d.ativos > 0 || d.media > 0);

  return (
    <Card className="h-full glass-card rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">
          Atendimentos por Hora (Hoje)
          <InfoTooltip text="Sessões de atendimento iniciadas hoje, agrupadas por hora. A linha tracejada laranja representa a média do mesmo dia da semana nas últimas 3 semanas, permitindo identificar variações no padrão." />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[260px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : !hasData ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Nenhum atendimento registrado hoje
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hora" axisLine={false} tickLine={false} fontSize={12} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(245, 255, 85, 0.1)" }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                  }}
                  formatter={(value: number, name: string) => [
                    `${value}`,
                    name === "media" ? "Média 3 sem." : "Hoje",
                  ]}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  formatter={(value) =>
                    value === "media" ? "Média 3 semanas" : "Hoje"
                  }
                />
                <Bar
                  dataKey="ativos"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  barSize={24}
                  name="ativos"
                />
                <Line
                  type="monotone"
                  dataKey="media"
                  stroke="#f97316"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  name="media"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
