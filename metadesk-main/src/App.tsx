
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ActiveSessionProvider } from "@/contexts/ActiveSessionContext";
import { TwilioDeviceProvider } from "@/contexts/TwilioDeviceContext";
import { ProtectedRoute, RoleBasedRedirect } from "@/components/auth/ProtectedRoute";
import { LoginPage } from "@/components/auth/LoginPage";
import Dashboard from "./pages/Dashboard";
import Atendimento from "./pages/Atendimento";
import Solicitacoes from "./pages/Solicitacoes";
import Conteudo from "./pages/Conteudo";
import Campanhas from "./pages/Campanhas";
import Monitoramento from "./pages/Monitoramento";
import Administracao from "./pages/Administracao";
import Integracoes from "./pages/Integracoes";
import Informacoes from "./pages/Informacoes";
import ReclamacoesDenuncias from "./pages/ReclamacoesDenuncias";
import MeuPerfil from "./pages/MeuPerfil";
import PublicChat from "./pages/PublicChat";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ActiveSessionProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <TwilioDeviceProvider>
          <BrowserRouter>
            <Routes>
              {/* Rota pública */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<LoginPage />} />
              
              {/* Rota raiz - redireciona baseado no role */}
              <Route path="/" element={
                <ProtectedRoute>
                  <RoleBasedRedirect />
                </ProtectedRoute>
              } />
              
              {/* Rotas de Admin */}
              <Route path="/dashboard" element={
                <ProtectedRoute requiredRole="admin">
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/campanhas" element={
                <ProtectedRoute requiredRole="admin">
                  <Campanhas />
                </ProtectedRoute>
              } />
              <Route path="/administracao" element={
                <ProtectedRoute requiredRole="admin">
                  <Administracao />
                </ProtectedRoute>
              } />
              <Route path="/integracoes" element={
                <ProtectedRoute requiredRole="admin">
                  <Integracoes />
                </ProtectedRoute>
              } />
              <Route path="/informacoes" element={
                <ProtectedRoute>
                  <Informacoes />
                </ProtectedRoute>
              } />
              
              {/* Rotas compartilhadas */}
              <Route path="/atendimento" element={
                <ProtectedRoute>
                  <Atendimento />
                </ProtectedRoute>
              } />
              <Route path="/solicitacoes" element={
                <ProtectedRoute>
                  <Solicitacoes />
                </ProtectedRoute>
              } />
              <Route path="/conteudo" element={
                <ProtectedRoute>
                  <Conteudo />
                </ProtectedRoute>
              } />
              <Route path="/monitoramento" element={
                <ProtectedRoute>
                  <Monitoramento />
                </ProtectedRoute>
              } />
              
              {/* Página de perfil do usuário */}
              <Route path="/meu-perfil" element={
                <ProtectedRoute>
                  <MeuPerfil />
                </ProtectedRoute>
              } />
              
              {/* Rota pública para reclamações (legacy) */}
              <Route path="/reclamacoes-denuncias" element={<ReclamacoesDenuncias />} />
              
              {/* Rota pública Work - Canal de Denúncias (legacy) */}
              <Route path="/ouvidoria-work8" element={<ReclamacoesDenuncias />} />

              {/* Rota dinâmica de ouvidoria por tenant */}
              <Route path="/ouvidoria/:slug" element={<ReclamacoesDenuncias />} />
              <Route path="/ouvidoria" element={<ReclamacoesDenuncias />} />

              {/* Rota pública para webchat */}
              <Route path="/chat/:flowId" element={<PublicChat />} />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TwilioDeviceProvider>
      </TooltipProvider>
      </ActiveSessionProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
