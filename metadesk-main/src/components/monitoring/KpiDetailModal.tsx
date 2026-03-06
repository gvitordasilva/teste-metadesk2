import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type KpiKey } from "@/hooks/useKpiBreakdown";

interface KpiDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpiKey: KpiKey | null;
  kpiLabel: string;
  kpiUnit: string;
  kpiValue: number;
  lowerBetter: boolean;
  description: string;
}

export function KpiDetailModal({
  open,
  onOpenChange,
  kpiLabel,
  kpiValue,
  kpiUnit,
  description,
}: KpiDetailModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kpiLabel}</DialogTitle>
        </DialogHeader>
        <p className="text-2xl font-bold">{kpiValue} {kpiUnit}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </DialogContent>
    </Dialog>
  );
}
