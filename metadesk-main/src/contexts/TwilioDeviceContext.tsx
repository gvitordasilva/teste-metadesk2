import React, { createContext, useContext, ReactNode } from "react";

// Stub context — Twilio Voice integration is optional.
// This provides the required interface without actually connecting Twilio.

type CallState = "idle" | "ringing" | "active" | "ended";

type CallerInfo = {
  number: string;
  name?: string;
} | null;

type DeviceStatus = "offline" | "registering" | "ready" | "error";

interface TwilioDeviceContextValue {
  callState: CallState;
  callerInfo: CallerInfo;
  isMuted: boolean;
  isDeviceReady: boolean;
  deviceStatus: DeviceStatus;
  deviceError: string | null;
  acceptCall: () => void;
  rejectCall: () => void;
  hangup: () => void;
  toggleMute: () => void;
}

const TwilioDeviceContext = createContext<TwilioDeviceContextValue>({
  callState: "idle",
  callerInfo: null,
  isMuted: false,
  isDeviceReady: false,
  deviceStatus: "offline",
  deviceError: null,
  acceptCall: () => {},
  rejectCall: () => {},
  hangup: () => {},
  toggleMute: () => {},
});

export function TwilioDeviceProvider({ children }: { children: ReactNode }) {
  // No-op provider — replace with actual Twilio implementation when needed
  const value: TwilioDeviceContextValue = {
    callState: "idle",
    callerInfo: null,
    isMuted: false,
    isDeviceReady: false,
    deviceStatus: "offline",
    deviceError: null,
    acceptCall: () => {},
    rejectCall: () => {},
    hangup: () => {},
    toggleMute: () => {},
  };

  return (
    <TwilioDeviceContext.Provider value={value}>
      {children}
    </TwilioDeviceContext.Provider>
  );
}

export function useTwilioDeviceContext() {
  return useContext(TwilioDeviceContext);
}
