import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface LinkComplaintModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueItemId: string;
  conversationId: string;
  onLinked?: (complaintId: string, protocol: string) => void;
}

export function LinkComplaintModal({
  open,
  onOpenChange,
}: LinkComplaintModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular Reclamação</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Funcionalidade em desenvolvimento.
        </p>
      </DialogContent>
    </Dialog>
  );
}
