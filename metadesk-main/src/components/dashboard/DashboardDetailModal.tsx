import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type DetailType = string | null;

interface DashboardDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type?: DetailType;
  agentId?: string;
}

export function DashboardDetailModal({
  open,
  onOpenChange,
  type,
}: DashboardDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Detalhes</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {type ? `Visualizando: ${type}` : "Nenhum detalhe disponível."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
