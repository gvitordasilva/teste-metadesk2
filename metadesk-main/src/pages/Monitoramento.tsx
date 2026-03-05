
import { useState } from "react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AIInsightCard } from "@/components/monitoring/AIInsightCard";
import { ReportGenerator } from "@/components/monitoring/ReportGenerator";
import { AtendimentosList } from "@/components/monitoring/AtendimentosList";
import { MetricsSLAPanel } from "@/components/monitoring/MetricsSLAPanel";
import { SolicitacoesList } from "@/components/monitoring/SolicitacoesList";
import { AtividadesList } from "@/components/monitoring/AtividadesList";
import { PeriodFilter, PeriodSelection } from "@/components/monitoring/PeriodFilter";
import { KpiDetailModal } from "@/components/monitoring/KpiDetailModal";
import { useMonitoringData } from "@/hooks/useMonitoringData";
import { useAdvancedMetrics } from "@/hooks/useAdvancedMetrics";
import { useSlaSettings } from "@/hooks/useSlaSettings";
import { KpiKey } from "@/hooks/useKpiBreakdown";
import {
  Loader2, Download, TrendingUp, TrendingDown, Minus,
  Timer, Clock, AlertTriangle, Target, ThumbsUp,
} from "lucide-react";
import { formatDistanceToNow, startOfDay, subDays, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { exportToCsv } from "@/lib/exportCsv";
import { cn } from "@/lib/utils";

function ComparisonBadge({ current, previous, suffix = "", invert = false }: { current: number; previous: number; suffix?: string; invert?: boolean }) {
  if (previous === 0) return null;
  const diff = ((current - previous) / previous) * 100;
  const isPositive = invert ? diff < 0 : diff > 0;
  const isNeutral = Math.abs(diff) < 1;

  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-xs font-medium ml-2 px-1.5 py-0.5 rounded",
      isNeutral ? "bg-muted text-muted-foreground" :
        isPositive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
    )}>
      {isNeutral ? <Minus className="h-3 w-3" /> : isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(diff).toFixed(1)}%{suffix}
    </span>
  );
}

function getKpiStatus(value: number, sla: { target: number; warning: number | null; critical: number | null } | undefined, lowerBetter: boolean) {
  if (!sla) return "normal";
  if (lowerBetter) {
    if (sla.critical != null && value >= sla.critical) return "critical";
    if (sla.warning != null && value >= sla.warning) return "warning";
  } else {
    if (sla.critical != null && value <= sla.critical) return "critical";
    if (sla.warning != null && value <= sla.warning) return "warning";
  }
  return "ok";
}

const statusGlow = {
  ok: "shadow-[0_0_12px_hsla(142,70%,50%,0.15)]",
  warning: "shadow-[0_0_12px_hsla(45,90%,50%,0.15)]",
  critical: "shadow-[0_0_12px_hsla(0,70%,50%,0.15)]",
  normal: "",
};

const statusBorder = {
  ok: "border-green-400/30",
  warning: "border-yellow-400/30",
  critical: "border-red-400/30",
  normal: "border-transparent",
};

const statusDot = {
  ok: "bg-green-500",
  warning: "bg-yellow-500",
  critical: "bg-red-500",
  normal: "bg-muted-foreground/30",
};

export default function Monitoramento() {
  const [period, setPeriod] = useState<PeriodSelection>({
    from: startOfDay(subDays(new Date(), 29)),
    to: endOfDay(new Date()),
    label: "Últimos 30 dias",
  });
  const [comparisonPeriod, setComparisonPeriod] = useState<PeriodSelection | null>(null);
  const [selectedKpi, setSelectedKpi] = useState<KpiKey | null>(null);
  const { data, isLoading } = useMonitoringData(period, comparisonPeriod);
  const { data: advMetrics } = useAdvancedMetrics();
  const { data: slaSettings } = useSlaSettings();

  const dailyData = data?.dailyData || [];
  const channelData = data?.channelData || [];
  const satisfacaoData = data?.satisfacaoData || [];

  const reportMetrics = { dailyData, channelData, satisfacaoData, period: period.label };

  const updatedLabel = data?.lastUpdated
    ? `Atualizado ${formatDistanceToNow(data.lastUpdated, { addSuffix: true, locale: ptBR })}`
    : "Carregando...";

  const handleExportDashboard = () => {
    exportToCsv(
      "dashboard-metricas",
      ["Dia", "Atendimentos", "Solicitações", "TMA (min)"],
      dailyData.map((d: any) => [d.name, d.atendimentos, d.solicitacoes, d.tma])
    );
  };

  const getSla = (key: string) => {
    const s = slaSettings?.find((sl) => sl.metric_key === key);
    return s ? { target: s.target_value, warning: s.warning_threshold, critical: s.critical_threshold } : undefined;
  };

  // 5 KPI cards in order
  const kpiCards = [
    {
      key: "tme",
      order: 1,
      focus: "Disponibilidade",
      label: "TME",
      fullLabel: "Tempo Médio de Espera",
      value: advMetrics?.tme ?? 0,
      unit: "min",
      lowerBetter: true,
      icon: Timer,
      color: "text-blue-500",
      description: "Soma do tempo de espera na fila / Total de chamadas atendidas. Mede quanto tempo o cliente aguarda antes de ser atendido.",
    },
    {
      key: "tma",
      order: 2,
      focus: "Eficiência",
      label: "TMA",
      fullLabel: "Tempo Médio de Atendimento",
      value: advMetrics?.tma ?? 0,
      unit: "min",
      lowerBetter: true,
      icon: Clock,
      color: "text-purple-500",
      description: "Tempo total de atendimento (início ao fim) / Total de chamadas atendidas. Mede a duração média de cada sessão de atendimento.",
    },
    {
      key: "abandono",
      order: 3,
      focus: "Disponibilidade",
      label: "Abandono",
      fullLabel: "Taxa de Abandono",
      value: advMetrics?.abandonRate ?? 0,
      unit: "%",
      lowerBetter: true,
      icon: AlertTriangle,
      color: "text-orange-500",
      description: "(Clientes sem resposta por >2 min + desistências / Total recebido) × 100. Mede a taxa de clientes que não foram atendidos.",
    },
    {
      key: "fcr",
      order: 4,
      focus: "Resolutividade",
      label: "FCR",
      fullLabel: "First Contact Resolution",
      value: advMetrics?.fcr ?? 0,
      unit: "%",
      lowerBetter: false,
      icon: Target,
      color: "text-green-500",
      description: "(Casos resolvidos no 1º contato / Total de casos resolvidos) × 100. Mede a eficácia de resolução sem reaberturas ou múltiplos atendimentos.",
    },
    {
      key: "csat",
      order: 5,
      focus: "Satisfação",
      label: "CSAT",
      fullLabel: "Customer Satisfaction",
      value: advMetrics?.csat ?? 0,
      unit: "%",
      lowerBetter: false,
      icon: ThumbsUp,
      color: "text-emerald-500",
      description: "Percentual de notas positivas (≥7 em escala 0-10) sobre o total de respostas de satisfação coletadas.",
    },
  ];

  return (
    <MainLayout>
      <div className="mb-6">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-1">Monitoramento</h1>
            <p className="text-muted-foreground">
              Indicadores de performance e qualidade — {data?.total || 0} solicitações no período
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ReportGenerator metrics={reportMetrics} />
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExportDashboard}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
            <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
              {updatedLabel}
            </Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="dashboard" className="mb-6">
            {/* Tabs bar ABOVE filters */}
            <TabsList className="mb-4">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="atendimentos">Atendimentos</TabsTrigger>
              <TabsTrigger value="solicitacoes">Solicitações</TabsTrigger>
              <TabsTrigger value="satisfacao">Satisfação</TabsTrigger>
              <TabsTrigger value="atividades">Atividades</TabsTrigger>
            </TabsList>

            {/* Period filter bar - glass */}
            <div className="mb-6 p-4 rounded-2xl glass-filter">
              <PeriodFilter
                period={period}
                comparisonPeriod={comparisonPeriod}
                onPeriodChange={setPeriod}
                onComparisonChange={setComparisonPeriod}
              />
            </div>

            {/* ── 5 KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              {kpiCards.map((kpi) => {
                const sla = getSla(kpi.key);
                const status = getKpiStatus(kpi.value, sla, kpi.lowerBetter);
                const Icon = kpi.icon;
                const isNull = kpi.key === "csat" && advMetrics?.csat === null;

                return (
                  <div
                    key={kpi.key}
                    onClick={() => setSelectedKpi(kpi.key as KpiKey)}
                    className={cn(
                      "relative overflow-hidden rounded-2xl glass-kpi p-4 border cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]",
                      statusBorder[status],
                      statusGlow[status]
                    )}
                  >
                    {/* Status dot */}
                    <div className={cn("absolute top-3.5 right-3.5 w-2 h-2 rounded-full ring-2 ring-white/50", statusDot[status])} />

                    {/* Focus badge */}
                    <span className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/60">
                      {kpi.focus}
                    </span>

                    <div className="flex items-center gap-2 mt-1.5 mb-3">
                      <div className={cn("p-1.5 rounded-lg bg-gradient-to-br from-white/80 to-white/40 shadow-sm")}>
                        <Icon className={cn("h-4 w-4", kpi.color)} />
                      </div>
                      <span className="text-sm font-semibold tracking-tight">{kpi.label}</span>
                      <InfoTooltip text={kpi.description} />
                    </div>

                    <div className="text-3xl font-bold tabular-nums tracking-tight">
                      {isNull ? "—" : kpi.value}
                      {!isNull && <span className="text-xs font-normal text-muted-foreground/70 ml-1">{kpi.unit}</span>}
                    </div>

                    {sla && (
                      <p className="text-[10px] text-muted-foreground/60 mt-2 flex items-center gap-1">
                        <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/30" />
                        Meta: {sla.target}{kpi.unit}
                      </p>
                    )}

                    <p className="text-[10px] text-muted-foreground/50 mt-0.5 truncate">
                      {kpi.fullLabel}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* ── Dashboard Tab ── */}
            <TabsContent value="dashboard" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Volume chart with service type breakdown */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="p-5 pb-2">
                    <h3 className="text-base font-semibold tracking-tight flex items-center gap-2">
                      Volume de Atendimentos
                      <InfoTooltip text="Gráfico diário com breakdown por tipo de atendimento: Autônomo (IA/chatbot sem humano), Híbrido (solicitação encaminhada sem conversa em tempo real) e Humano (conversa ao vivo com atendente)." />
                    </h3>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{period.label}</p>
                    {/* Service type summary */}
                    <div className="flex items-center gap-4 mt-2">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#7ae4ff" }} />
                        Autônomo: {data?.summary?.totalAutonomo ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#f5ff55" }} />
                        Híbrido: {data?.summary?.totalHibrido ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#4deb92" }} />
                        Humano: {data?.summary?.totalHumano ?? 0}
                      </span>
                    </div>
                  </div>
                  <div className="px-5 pb-2">
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dailyData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={11} />
                          <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                          <Legend />
                          <Bar dataKey="autonomo" stackId="atendimento" fill="#7ae4ff" name="Autônomo" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="hibrido" stackId="atendimento" fill="#f5ff55" name="Híbrido" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="humano" stackId="atendimento" fill="#4deb92" name="Humano" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <AIInsightCard
                      indicatorName="Volume de Atendimentos"
                      metrics={{
                        totalAtendimentos: dailyData.reduce((s, d) => s + d.atendimentos, 0),
                        totalSolicitacoes: dailyData.reduce((s, d) => s + d.solicitacoes, 0),
                        totalAutonomo: data?.summary?.totalAutonomo ?? 0,
                        totalHibrido: data?.summary?.totalHibrido ?? 0,
                        totalHumano: data?.summary?.totalHumano ?? 0,
                        mediaAtendimentosDia: dailyData.length ? Math.round(dailyData.reduce((s, d) => s + d.atendimentos, 0) / dailyData.length) : 0,
                        picoAtendimentos: dailyData.length ? Math.max(...dailyData.map(d => d.atendimentos)) : 0,
                        dados: dailyData.map(d => ({ dia: d.name, autonomo: d.autonomo, hibrido: d.hibrido, humano: d.humano })),
                      }}
                      className="mt-4"
                    />
                  </div>
                </div>

                {/* Service type distribution pie chart */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="p-5 pb-2">
                    <h3 className="text-base font-semibold tracking-tight flex items-center gap-2">
                      Tipos de Atendimento
                      <InfoTooltip text="Distribuição por tipo de atendimento: Autônomo (resolvido por IA), Híbrido (encaminhado sem conversa ao vivo) e Humano (atendente em tempo real)." />
                    </h3>
                  </div>
                  <div className="px-5 pb-4">
                    <div className="h-[280px]">
                      {(data?.serviceTypeData || []).length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={data?.serviceTypeData || []} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                              {(data?.serviceTypeData || []).map((entry, index) => (
                                <Cell key={`cell-svc-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => [`${value}%`, "Volume"]} labelFormatter={() => ""} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
                      )}
                    </div>
                    <AIInsightCard
                      indicatorName="Tipos de Atendimento"
                      metrics={{
                        distribuicao: (data?.serviceTypeData || []).map(d => ({ tipo: d.name, percentual: d.value, quantidade: d.count })),
                      }}
                      className="mt-4"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Channels chart */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="p-5 pb-2">
                    <h3 className="text-base font-semibold tracking-tight flex items-center gap-2">
                      Canais de Atendimento
                      <InfoTooltip text="Distribuição percentual por canal de origem. Calculado dividindo a quantidade de cada canal pelo total." />
                    </h3>
                  </div>
                  <div className="px-5 pb-4">
                    <div className="h-[280px]">
                      {channelData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={channelData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                              {channelData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => [`${value}%`, "Volume"]} labelFormatter={() => ""} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
                      )}
                    </div>
                    <AIInsightCard
                      indicatorName="Canais de Atendimento"
                      metrics={{
                        distribuicao: channelData.map(c => ({ canal: c.name, percentual: c.value })),
                        canalPrincipal: channelData[0]?.name || "N/A",
                        percentualPrincipal: channelData[0]?.value || 0,
                      }}
                      className="mt-4"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="p-5 pb-2">
                    <h3 className="text-base font-semibold tracking-tight flex items-center gap-2">
                      TMA por Dia (min)
                      <InfoTooltip text="Tempo Médio de Atendimento diário. Média da duração das sessões concluídas vinculadas a solicitações resolvidas naquele dia." />
                    </h3>
                  </div>
                  <div className="px-5 pb-4">
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dailyData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={11} />
                          <YAxis axisLine={false} tickLine={false} label={{ value: "Minutos", angle: -90, position: "insideLeft", style: { textAnchor: "middle" } }} />
                          <Tooltip cursor={{ fill: "rgba(245,255,85,0.1)" }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                          <Legend />
                          <Bar dataKey="tma" fill="#a18aff" name="TMA (min)" radius={[4, 4, 0, 0]} barSize={32} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <AIInsightCard
                      indicatorName="Tempo Médio de Atendimento"
                      metrics={{
                        tmaGeral: dailyData.length ? (dailyData.reduce((s, d) => s + d.tma, 0) / (dailyData.filter(d => d.tma > 0).length || 1)).toFixed(1) : "0",
                        tmaMenor: dailyData.filter(d => d.tma > 0).length ? Math.min(...dailyData.filter(d => d.tma > 0).map(d => d.tma)) : 0,
                        tmaMaior: dailyData.length ? Math.max(...dailyData.map(d => d.tma)) : 0,
                        dados: dailyData.map(d => ({ dia: d.name, tma: d.tma })),
                      }}
                      className="mt-4"
                    />
                  </div>
                </div>

                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="p-5 pb-2">
                    <h3 className="text-base font-semibold tracking-tight flex items-center gap-2">
                      Distribuição por Status
                      <InfoTooltip text="Proporção percentual por status atual: Novo, Visualizado, Em Análise, Resolvido e Fechado." />
                    </h3>
                  </div>
                  <div className="px-5 pb-4">
                    <div className="h-[280px]">
                      {satisfacaoData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={satisfacaoData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                              {satisfacaoData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => [`${value}%`, ""]} labelFormatter={(label) => label} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
                      )}
                    </div>
                    <AIInsightCard
                      indicatorName="Distribuição por Status"
                      metrics={{ distribuicao: satisfacaoData.map(s => ({ status: s.name, percentual: s.value })) }}
                      className="mt-4"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Other tabs ── */}
            <TabsContent value="atendimentos" className="mt-6">
              <AtendimentosList />
            </TabsContent>

            <TabsContent value="solicitacoes" className="mt-6">
              <SolicitacoesList />
            </TabsContent>

            <TabsContent value="satisfacao" className="mt-6">
              <div className="space-y-6">
                <MetricsSLAPanel />
                <Card>
                  <CardHeader>
                    <CardTitle>Métricas de Satisfação e Qualidade</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm mb-4">
                      Os indicadores CSAT, NPS e CES são calculados automaticamente com base nas pesquisas de satisfação coletadas.
                      O FCR é calculado pela proporção de casos resolvidos com apenas 1 sessão de atendimento.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className={advMetrics?.nps != null ? "" : "border-dashed"}>
                        <CardContent className="p-4 text-center">
                          <p className="text-xs text-muted-foreground mb-1">NPS <InfoTooltip text="Net Promoter Score: (Promotores − Detratores) / Total × 100. Promotores: nota ≥9, Detratores: nota ≤6." /></p>
                          <p className={`text-2xl font-bold ${advMetrics?.nps != null ? (advMetrics.nps >= 50 ? "text-green-600" : advMetrics.nps >= 0 ? "text-yellow-600" : "text-red-600") : "text-muted-foreground/50"}`}>
                            {advMetrics?.nps != null ? advMetrics.nps : "—"}
                          </p>
                          {advMetrics?.npsTotal ? (
                            <p className="text-[10px] text-muted-foreground">
                              {advMetrics.npsTotal} respostas • {advMetrics.npsPromoters} promotores • {advMetrics.npsDetractors} detratores
                            </p>
                          ) : (
                            <p className="text-[10px] text-muted-foreground">Aguardando respostas</p>
                          )}
                        </CardContent>
                      </Card>
                      <Card className={advMetrics?.csat != null ? "" : "border-dashed"}>
                        <CardContent className="p-4 text-center">
                          <p className="text-xs text-muted-foreground mb-1">CSAT <InfoTooltip text="Customer Satisfaction: % de respostas com nota ≥7 (escala 0-10) sobre o total de respostas." /></p>
                          <p className={`text-2xl font-bold ${advMetrics?.csat != null ? "text-emerald-600" : "text-muted-foreground/50"}`}>
                            {advMetrics?.csat != null ? `${advMetrics.csat}%` : "—"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {advMetrics?.csat != null ? `Baseado em ${advMetrics.npsTotal} respostas` : "Aguardando respostas"}
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="border-dashed">
                        <CardContent className="p-4 text-center">
                          <p className="text-xs text-muted-foreground mb-1">CES</p>
                          <p className="text-2xl font-bold text-muted-foreground/50">—</p>
                          <p className="text-[10px] text-muted-foreground">Em breve</p>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="atividades" className="mt-6">
              <AtividadesList />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* KPI Detail Modal */}
      {(() => {
        const kpi = kpiCards.find((k) => k.key === selectedKpi);
        return (
          <KpiDetailModal
            open={!!selectedKpi}
            onOpenChange={(open) => !open && setSelectedKpi(null)}
            kpiKey={selectedKpi}
            kpiLabel={kpi?.fullLabel || ""}
            kpiUnit={kpi?.unit || ""}
            kpiValue={kpi?.value || 0}
            lowerBetter={kpi?.lowerBetter || false}
            description={kpi?.description || ""}
          />
        );
      })()}
    </MainLayout>
  );
}
