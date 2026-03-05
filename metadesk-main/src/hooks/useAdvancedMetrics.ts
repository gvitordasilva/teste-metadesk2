import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AdvancedMetrics = {
  tma: number;
  tme: number;
  frt: number;
  abandonRate: number;
  backlog: number;
  fcr: number;
  csat: number | null;
  totalResolved: number;
  totalOpen: number;
  totalInProgress: number;
  totalNew: number;
  totalComplaints: number;
  totalSessions: number;
  avgSessionMinutes: number;
  nps: number | null;
  npsPromoters: number;
  npsDetractors: number;
  npsPassives: number;
  npsTotal: number;
};

export function useAdvancedMetrics() {
  return useQuery({
    queryKey: ["advanced-metrics"],
    queryFn: async () => {
      const [{ data: sessions }, { data: queue }, { data: complaints }, { data: npsData }] = await Promise.all([
        supabase.from("service_sessions").select("id, complaint_id, started_at, ended_at, duration_seconds, status"),
        supabase.from("service_queue" as any).select("id, status, waiting_since, created_at, updated_at, assigned_to"),
        supabase.from("complaints").select("id, status, created_at, updated_at"),
        supabase.from("nps_responses" as any).select("score"),
      ]);

      const sessionList = (sessions || []) as any[];
      const queueList = (queue || []) as any[];
      const complaintList = (complaints || []) as any[];
      const npsList = (npsData || []) as any[];

      // ── TMA: Tempo total de atendimento / Total de chamadas atendidas ──
      // Uses completed sessions with recorded duration
      const completedSessions = sessionList.filter((s) => s.duration_seconds && s.status === "completed");
      const tma = completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / completedSessions.length / 60
        : 0;

      // ── TME: Soma do tempo de espera / Total de chamadas atendidas ──
      // Time between queue entry (waiting_since) and when it was picked up (updated_at, status != waiting)
      const servedQueue = queueList.filter((q) => q.status !== "waiting" && q.status !== "abandoned");
      const tme = servedQueue.length > 0
        ? servedQueue.reduce((sum, q) => {
            const waitStart = new Date(q.waiting_since || q.created_at).getTime();
            const waitEnd = new Date(q.updated_at).getTime();
            return sum + Math.max(0, (waitEnd - waitStart) / 60000);
          }, 0) / servedQueue.length
        : 0;

      // ── Taxa de Abandono: (sem resposta >2min + desistências) / Total recebido x 100 ──
      const now = Date.now();
      const abandonedExplicit = queueList.filter((q) => q.status === "abandoned").length;
      const abandonedTimeout = queueList.filter((q) => {
        if (q.status !== "waiting") return false;
        const waitMs = now - new Date(q.waiting_since || q.created_at).getTime();
        return waitMs > 2 * 60 * 1000; // > 2 minutes without response
      }).length;
      const totalReceived = queueList.length;
      const abandonRate = totalReceived > 0
        ? ((abandonedExplicit + abandonedTimeout) / totalReceived) * 100
        : 0;

      // ── Status counts ──
      const totalNew = complaintList.filter((c) => c.status === "novo").length;
      const totalInProgress = complaintList.filter((c) =>
        c.status === "visualizado" || c.status === "em_analise"
      ).length;
      const totalResolved = complaintList.filter((c) =>
        c.status === "resolvido" || c.status === "fechado"
      ).length;
      const totalOpen = totalNew + totalInProgress;
      const backlog = totalOpen;

      // ── FCR: (Casos resolvidos no 1º contato / Total de casos resolvidos) x 100 ──
      // A case is "first contact resolution" if the resolved complaint has exactly 1 session
      const resolvedIds = new Set(
        complaintList
          .filter((c) => c.status === "resolvido" || c.status === "fechado")
          .map((c) => c.id)
      );
      const sessionsByComplaint: Record<string, number> = {};
      sessionList.forEach((s) => {
        if (s.complaint_id && resolvedIds.has(s.complaint_id)) {
          sessionsByComplaint[s.complaint_id] = (sessionsByComplaint[s.complaint_id] || 0) + 1;
        }
      });
      const resolvedWithSessions = Object.keys(sessionsByComplaint).length;
      const resolvedFirstContact = Object.values(sessionsByComplaint).filter((count) => count === 1).length;
      const fcr = resolvedWithSessions > 0
        ? (resolvedFirstContact / resolvedWithSessions) * 100
        : totalResolved > 0 ? 100 : 0;

      // ── CSAT: (Soma das notas / (Total de respostas × nota máxima)) × 100 ──
      // Using NPS responses (0-10 scale), CSAT = % of scores >= 7 (satisfied)
      const csatPositive = npsList.filter((n) => n.score >= 7).length;
      const csat = npsList.length > 0
        ? (csatPositive / npsList.length) * 100
        : null;

      // ── NPS ──
      const npsPromoters = npsList.filter((n) => n.score >= 9).length;
      const npsDetractors = npsList.filter((n) => n.score <= 6).length;
      const npsPassives = npsList.filter((n) => n.score >= 7 && n.score <= 8).length;
      const npsTotal = npsList.length;
      const nps = npsTotal > 0
        ? Math.round(((npsPromoters - npsDetractors) / npsTotal) * 100)
        : null;

      return {
        tma: parseFloat(tma.toFixed(1)),
        tme: parseFloat(tme.toFixed(1)),
        frt: parseFloat(Math.min(tme, tma * 0.3).toFixed(1)), // FRT approximated as fraction of TMA
        abandonRate: parseFloat(abandonRate.toFixed(1)),
        backlog,
        fcr: parseFloat(fcr.toFixed(1)),
        csat: csat !== null ? parseFloat(csat.toFixed(1)) : null,
        totalResolved,
        totalOpen,
        totalInProgress,
        totalNew,
        totalComplaints: complaintList.length,
        totalSessions: sessionList.length,
        avgSessionMinutes: parseFloat(tma.toFixed(1)),
        nps,
        npsPromoters,
        npsDetractors,
        npsPassives,
        npsTotal,
      } as AdvancedMetrics;
    },
    refetchInterval: 60000,
  });
}
