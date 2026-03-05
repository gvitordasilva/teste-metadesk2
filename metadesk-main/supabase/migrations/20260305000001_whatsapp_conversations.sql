-- =====================================================
-- Fixes para suporte completo ao Evolution API / WhatsApp
-- =====================================================

-- 1. Tornar session_id nullable em service_messages
--    (mensagens do webhook WhatsApp não têm sessão de atendimento)
ALTER TABLE public.service_messages
  ALTER COLUMN session_id DROP NOT NULL;

-- 2. Atualizar constraint sender_type para incluir 'customer' e 'bot'
ALTER TABLE public.service_messages
  DROP CONSTRAINT IF EXISTS service_messages_sender_type_check;

ALTER TABLE public.service_messages
  ADD CONSTRAINT service_messages_sender_type_check
  CHECK (sender_type IN ('client', 'customer', 'agent', 'bot', 'system'));

-- 3. Adicionar colunas channel e sender_name se não existirem
ALTER TABLE public.service_messages
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'web';

ALTER TABLE public.service_messages
  ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- 4. Adicionar canal 'phone' ao service_queue
ALTER TABLE public.service_queue
  DROP CONSTRAINT IF EXISTS service_queue_channel_check;

ALTER TABLE public.service_queue
  ADD CONSTRAINT service_queue_channel_check
  CHECK (channel IN ('web', 'voice', 'whatsapp', 'email', 'chat', 'phone'));

-- 5. Garantir que service_queue tem whatsapp_conversation_id
ALTER TABLE public.service_queue
  ADD COLUMN IF NOT EXISTS whatsapp_conversation_id UUID
  REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL;

-- 6. Atualizar política INSERT de service_messages para suportar webhook
DROP POLICY IF EXISTS "Allow inserting service messages" ON public.service_messages;
DROP POLICY IF EXISTS "Usuarios podem criar mensagens em suas sessoes" ON public.service_messages;

CREATE POLICY "Allow inserting service messages"
  ON public.service_messages
  FOR INSERT
  WITH CHECK (
    -- Atendentes autenticados inserem em suas sessões ativas
    (
      session_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.service_sessions
        WHERE service_sessions.id = service_messages.session_id
          AND service_sessions.attendant_id = auth.uid()
          AND service_sessions.status = 'active'
      )
    )
    OR
    -- Bot e customer podem inserir (webhook / chatbot)
    (sender_type IN ('bot', 'customer'))
  );

-- 7. Política SELECT mais permissiva para service_messages
DROP POLICY IF EXISTS "Users can view service messages" ON public.service_messages;
DROP POLICY IF EXISTS "Usuarios podem ver mensagens de suas sessoes" ON public.service_messages;

CREATE POLICY "Users can view service messages"
  ON public.service_messages
  FOR SELECT
  USING (
    -- Ver mensagens de sessões próprias
    (
      session_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.service_sessions
        WHERE service_sessions.id = service_messages.session_id
          AND (
            service_sessions.attendant_id = auth.uid()
            OR public.check_admin_access()
          )
      )
    )
    OR
    -- Qualquer usuário autenticado pode ver mensagens (para tela de atendimento)
    auth.role() = 'authenticated'
  );

-- 8. Habilitar realtime para service_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_messages;

-- 9. Garantir permissões anon para o webhook Evolution API
GRANT INSERT ON public.service_messages TO anon;
GRANT SELECT ON public.service_messages TO anon;
GRANT INSERT, UPDATE ON public.whatsapp_conversations TO anon;
GRANT SELECT ON public.whatsapp_conversations TO anon;
GRANT INSERT ON public.service_queue TO anon;
GRANT UPDATE ON public.service_queue TO anon;
