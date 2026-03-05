import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type AgentMetric = {
  name: string;
  email: string;
  status: string;
  avatarUrl: string | null;
  userId: string;
  sessionCount: number;
  completedCount: number;
  avgDurationMin: number;
  resolutionRate: number;
};

function useAgentMetrics() {
  return useQuery({
    queryKey: ["agent-performance"],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from("attendant_profiles")
        .select("user_id, full_name, email, status, avatar_url");

      if (pErr) throw pErr;
      if (!profiles?.length) return [];

      const { data: sessions, error: sErr } = await supabase
        .from("service_sessions")
        .select("attendant_id, status, duration_seconds");

      if (sErr) throw sErr;

      const sessionList = sessions || [];

      return profiles.map((p): AgentMetric => {
        const mySessions = sessionList.filter((s) => s.attendant_id === p.user_id);
        const completed = mySessions.filter((s) => s.status === "completed");
        const totalDuration = completed.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
        const avgDur = completed.length > 0 ? totalDuration / completed.length / 60 : 0;
        const resRate = mySessions.length > 0 ? (completed.length / mySessions.length) * 100 : 0;

        return {
          name: p.full_name,
          email: p.email,
          status: p.status || "offline",
          avatarUrl: p.avatar_url,
          userId: p.user_id,
          sessionCount: mySessions.length,
          completedCount: completed.length,
          avgDurationMin: parseFloat(avgDur.toFixed(1)),
          resolutionRate: parseFloat(resRate.toFixed(0)),
        };
      }).sort((a, b) => b.sessionCount - a.sessionCount);
    },
    refetchInterval: 60000,
  });
}

function formatDuration(minutes: number): string {
  if (minutes === 0) return "—";
  const mins = Math.floor(minutes);
  const secs = Math.round((minutes - mins) * 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function AgentPerformance({ onAgentClick }: { onAgentClick?: (agentId: string) => void }) {
  const { data: agents, isLoading } = useAgentMetrics();

  return (
    <Card className="h-full overflow-hidden glass-card rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">
          Desempenho da Equipe
          <InfoTooltip text="Métricas individuais de cada atendente. Atend. = total de sessões de atendimento. Resolução = percentual de sessões finalizadas com sucesso. TMA (Tempo Médio de Atendimento) = duração média das sessões concluídas." />
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !agents?.length ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Nenhum atendente cadastrado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium p-4 text-sm">Agente</th>
                  <th className="text-center font-medium p-4 text-sm">
                    Atend.
                    <InfoTooltip text="Total de sessões de atendimento atribuídas a este agente (ativas + finalizadas)." />
                  </th>
                  <th className="text-center font-medium p-4 text-sm whitespace-nowrap">
                    Resolução
                    <InfoTooltip text="Percentual de sessões finalizadas com status 'completed' sobre o total de sessões do agente." />
                  </th>
                  <th className="text-center font-medium p-4 text-sm">
                    TMA
                    <InfoTooltip text="Tempo Médio de Atendimento — média da duração (em minutos) das sessões concluídas pelo agente." />
                  </th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.email} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => onAgentClick?.(agent.userId)}>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-shrink-0">
                          {agent.avatarUrl ? (
                            <img
                              src={agent.avatarUrl}
                              alt={agent.name}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                              {agent.name.charAt(0)}
                            </div>
                          )}
                          <span
                            className={`status-dot absolute bottom-0 right-0 shadow-sm status-${agent.status}`}
                          />
                        </div>
                        <span className="font-medium">{agent.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">{agent.sessionCount}</td>
                    <td className="p-4">
                      <div className="flex flex-col items-center gap-1">
                        <Progress value={agent.resolutionRate} className="h-2 w-16" />
                        <span className="text-xs">{agent.resolutionRate}%</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <Badge variant="outline">{formatDuration(agent.avgDurationMin)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
