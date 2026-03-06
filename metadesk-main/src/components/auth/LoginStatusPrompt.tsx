import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LoginStatusPromptProps {
  open: boolean;
  onChoice: (goOnline: boolean) => void;
}

export function LoginStatusPrompt({ open, onChoice }: LoginStatusPromptProps) {
  return (
    <Dialog open={open} onOpenChange={() => onChoice(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Definir Status</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Deseja ficar online para atendimentos?</p>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="outline" onClick={() => onChoice(false)}>
            Ficar Offline
          </Button>
          <Button onClick={() => onChoice(true)}>
            Ficar Online
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
