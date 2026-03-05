import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { ChannelMetrics } from "@/components/dashboard/ChannelMetrics";
import { ActiveConversations } from "@/components/dashboard/ActiveConversations";
import { AgentPerformance } from "@/components/dashboard/AgentPerformance";
import { DashboardDetailModal, type DetailType } from "@/components/dashboard/DashboardDetailModal";
import { useComplaintStats } from "@/hooks/useComplaints";
import { useDashboardComparison } from "@/hooks/useDashboardComparison";
import {
  MessageSquare,
  ClipboardCheck,
  Clock,
  AlertTriangle,
} from "lucide-react";

type AgentDetailType = { type: "agent"; agentId: string };

export default function Dashboard() {
  const { data: stats, isLoading } = useComplaintStats();
  const { data: comparison } = useDashboardComparison();
  const [detailType, setDetailType] = useState<DetailType>(null);
  const [agentDetail, setAgentDetail] = useState<AgentDetailType | null>(null);

  const openDetail = (type: DetailType) => setDetailType(type);

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
        <p className="text-muted-foreground">
          Visão geral dos indicadores de atendimento
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div onClick={() => openDetail("total")} className="cursor-pointer">
          <StatCard
            title="Total de Solicitações"
            value={stats?.total ?? 0}
            icon={<MessageSquare className="h-5 w-5 text-metadesk-yellow" />}
            isLoading={isLoading}
            description="Quantidade total de solicitações registradas na plataforma"
            trend={comparison?.trends.total}
          />
        </div>
        <div onClick={() => openDetail("resolved")} className="cursor-pointer">
          <StatCard
            title="Resolvidas"
            value={stats?.resolved ?? 0}
            icon={<ClipboardCheck className="h-5 w-5 text-metadesk-green" />}
            isLoading={isLoading}
            description="Solicitações finalizadas com resolução"
            trend={comparison?.trends.resolved}
          />
        </div>
        <div onClick={() => openDetail("inProgress")} className="cursor-pointer">
          <StatCard
            title="Em Andamento"
            value={stats?.inProgress ?? 0}
            icon={<Clock className="h-5 w-5 text-metadesk-purple" />}
            isLoading={isLoading}
            description="Solicitações que estão sendo tratadas por um responsável"
            trend={comparison?.trends.inProgress}
          />
        </div>
        <div onClick={() => openDetail("pending")} className="cursor-pointer">
          <StatCard
            title="Pendentes"
            value={stats?.pending ?? 0}
            icon={<AlertTriangle className="h-5 w-5 text-metadesk-blue" />}
            isLoading={isLoading}
            description="Solicitações aguardando análise ou atribuição"
            trend={comparison?.trends.pending}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div onClick={() => openDetail("distribution")} className="cursor-pointer">
          <ChannelMetrics stats={stats} isLoading={isLoading} />
        </div>
        <div onClick={() => openDetail("hourly")} className="cursor-pointer">
          <ActiveConversations />
        </div>
      </div>

      <div className="mb-6">
        <AgentPerformance onAgentClick={(agentId) => setAgentDetail({ type: "agent", agentId })} />
      </div>

      <DashboardDetailModal
        open={!!detailType}
        onOpenChange={(open) => { if (!open) setDetailType(null); }}
        type={detailType}
      />

      <DashboardDetailModal
        open={!!agentDetail}
        onOpenChange={(open) => { if (!open) setAgentDetail(null); }}
        type="agents"
        agentId={agentDetail?.agentId}
      />
    </MainLayout>
  );
}
