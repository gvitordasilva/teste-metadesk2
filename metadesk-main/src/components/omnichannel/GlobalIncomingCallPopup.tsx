import { Phone, PhoneOff, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type CallState = "idle" | "ringing" | "active" | "ended";

type CallerInfo = {
  number: string;
  name?: string;
} | null;

interface GlobalIncomingCallPopupProps {
  callState: CallState;
  callerInfo: CallerInfo;
  isMuted: boolean;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
}

export function GlobalIncomingCallPopup({
  callState,
  callerInfo,
  isMuted,
  onAccept,
  onReject,
  onHangup,
  onToggleMute,
}: GlobalIncomingCallPopupProps) {
  if (callState === "idle" || callState === "ended") return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-card border border-border rounded-2xl shadow-2xl p-4 w-72 animate-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
          <Phone className="h-5 w-5 text-green-500 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">
            {callerInfo?.name || callerInfo?.number || "Chamada recebida"}
          </p>
          <p className="text-xs text-muted-foreground">
            {callState === "ringing" ? "Chamada entrante..." : "Em chamada"}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {callState === "ringing" ? (
          <>
            <Button
              onClick={onReject}
              variant="destructive"
              size="sm"
              className="flex-1 gap-1"
            >
              <PhoneOff className="h-4 w-4" />
              Recusar
            </Button>
            <Button
              onClick={onAccept}
              size="sm"
              className="flex-1 gap-1 bg-green-600 hover:bg-green-700"
            >
              <Phone className="h-4 w-4" />
              Aceitar
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={onToggleMute}
              variant="outline"
              size="sm"
              className="flex-1 gap-1"
            >
              {isMuted ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
              {isMuted ? "Ativar" : "Mudo"}
            </Button>
            <Button
              onClick={onHangup}
              variant="destructive"
              size="sm"
              className="flex-1 gap-1"
            >
              <PhoneOff className="h-4 w-4" />
              Desligar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
