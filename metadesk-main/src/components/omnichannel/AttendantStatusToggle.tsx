import { useAuth } from "@/contexts/AuthContext";
import { useTwilioDeviceContext } from "@/contexts/TwilioDeviceContext";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Circle, Coffee, Phone, LogOut, PhoneCall, PhoneOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const statusConfig = {
  online: { label: "Online", color: "bg-green-500", icon: Circle },
  busy: { label: "Ocupado", color: "bg-red-500", icon: Phone },
  break: { label: "Pausa", color: "bg-yellow-500", icon: Coffee },
  offline: { label: "Offline", color: "bg-gray-400", icon: LogOut },
} as const;

type AttendantStatus = keyof typeof statusConfig;

export function AttendantStatusToggle() {
  const { profile, updateStatus } = useAuth();
  const { deviceStatus, deviceError } = useTwilioDeviceContext();
  const currentStatus = (profile?.status as AttendantStatus) || "offline";
  const config = statusConfig[currentStatus];

  const handleStatusChange = async (newStatus: AttendantStatus) => {
    if (newStatus === currentStatus) return;
    try {
      await updateStatus(newStatus);
      toast.success(`Status alterado para ${statusConfig[newStatus].label}`);
    } catch {
      toast.error("Erro ao alterar status");
    }
  };

  const voiceLabel =
    deviceStatus === "ready"
      ? "Telefone conectado"
      : deviceStatus === "registering"
      ? "Conectando telefone…"
      : "Telefone desconectado";

  const VoiceIcon =
    deviceStatus === "ready"
      ? PhoneCall
      : deviceStatus === "registering"
      ? Loader2
      : PhoneOff;

  return (
    <div className="flex items-center gap-2">
      {/* Voice status indicator */}
      {currentStatus === "online" && voiceLabel && VoiceIcon && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <VoiceIcon
                className={`h-3.5 w-3.5 ${
                  deviceStatus === "ready"
                    ? "text-green-500"
                    : deviceStatus === "registering"
                    ? "animate-spin text-yellow-500"
                    : "text-destructive"
                }`}
              />
              <span className="hidden sm:inline">{voiceLabel}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {deviceStatus === "error" && deviceError
              ? `Erro: ${deviceError}`
              : voiceLabel}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Status dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
            {config.label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(Object.keys(statusConfig) as AttendantStatus[]).map((status) => {
            const s = statusConfig[status];
            return (
              <DropdownMenuItem
                key={status}
                onClick={() => handleStatusChange(status)}
                className="gap-2"
              >
                <span className={`h-2 w-2 rounded-full ${s.color}`} />
                {s.label}
                {status === currentStatus && (
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    Atual
                  </Badge>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
