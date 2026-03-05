
import React from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { LoginStatusPrompt } from "@/components/auth/LoginStatusPrompt";
import { GlobalIncomingCallPopup } from "@/components/omnichannel/GlobalIncomingCallPopup";
import { useAuth } from "@/contexts/AuthContext";
import { useTwilioDeviceContext } from "@/contexts/TwilioDeviceContext";

type MainLayoutProps = {
  children: React.ReactNode;
};

export function MainLayout({ children }: MainLayoutProps) {
  const { showStatusPrompt, updateStatus, dismissStatusPrompt, profile } = useAuth();
  const {
    callState,
    callerInfo,
    isMuted,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
  } = useTwilioDeviceContext();

  const handleStatusChoice = async (goOnline: boolean) => {
    if (goOnline) {
      await updateStatus("online");
    }
    dismissStatusPrompt();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      {profile && (
        <LoginStatusPrompt open={showStatusPrompt} onChoice={handleStatusChoice} />
      )}
      <GlobalIncomingCallPopup
        callState={callState}
        callerInfo={callerInfo}
        isMuted={isMuted}
        onAccept={acceptCall}
        onReject={rejectCall}
        onHangup={hangup}
        onToggleMute={toggleMute}
      />
    </div>
  );
}
