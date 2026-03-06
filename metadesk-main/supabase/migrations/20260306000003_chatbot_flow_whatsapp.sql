-- =============================================
-- FLUXO COMPLETO DE ATENDIMENTO WHATSAPP
-- Menu interativo com List Messages
-- =============================================

-- Limpa fluxos existentes padrão para evitar duplicidade
DELETE FROM public.chatbot_flows WHERE is_default = true AND channel IN ('whatsapp', 'all');

-- =============================================
-- UUIDs fixos para referenciar entre nós
-- =============================================
DO $$
DECLARE
  -- Flow
  flow_id       uuid := 'aaaaaaaa-0000-0000-0000-000000000001';

  -- Nodes principais
  n_boas_vindas uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  n_menu_main   uuid := 'bbbbbbbb-0000-0000-0000-000000000002';

  -- Financeiro
  n_financeiro  uuid := 'bbbbbbbb-0000-0000-0001-000000000001';
  n_fin_2via    uuid := 'bbbbbbbb-0000-0000-0001-000000000002';
  n_fin_negoc   uuid := 'bbbbbbbb-0000-0000-0001-000000000003';
  n_fin_pgto    uuid := 'bbbbbbbb-0000-0000-0001-000000000004';

  -- Suporte Técnico
  n_suporte     uuid := 'bbbbbbbb-0000-0000-0002-000000000001';
  n_sup_acesso  uuid := 'bbbbbbbb-0000-0000-0002-000000000002';
  n_sup_erro    uuid := 'bbbbbbbb-0000-0000-0002-000000000003';
  n_sup_lent    uuid := 'bbbbbbbb-0000-0000-0002-000000000004';
  n_sup_outro   uuid := 'bbbbbbbb-0000-0000-0002-000000000005';

  -- Pedidos
  n_pedido      uuid := 'bbbbbbbb-0000-0000-0003-000000000001';

  -- Informações
  n_info        uuid := 'bbbbbbbb-0000-0000-0004-000000000001';
  n_info_planos uuid := 'bbbbbbbb-0000-0000-0004-000000000002';
  n_info_preco  uuid := 'bbbbbbbb-0000-0000-0004-000000000003';
  n_info_cont   uuid := 'bbbbbbbb-0000-0000-0004-000000000004';

  -- Minha Conta
  n_conta       uuid := 'bbbbbbbb-0000-0000-0005-000000000001';

  -- Atendente direto
  n_atendente   uuid := 'bbbbbbbb-0000-0000-0099-000000000001';

BEGIN

  -- =============================================
  -- FLOW
  -- =============================================
  INSERT INTO public.chatbot_flows (id, name, description, channel, is_active, is_default)
  VALUES (
    flow_id,
    'Atendimento WhatsApp',
    'Fluxo principal de atendimento via WhatsApp com menu interativo (List Messages)',
    'whatsapp',
    true,
    true
  );

  -- =============================================
  -- NÓS
  -- =============================================

  -- 1. Boas-vindas (entry point — message)
  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_boas_vindas, flow_id, 'message', 'Boas-vindas',
    'Olá! 👋 Seja bem-vindo(a) ao *MetaDesk*.' || chr(10) ||
    'Estamos aqui para te ajudar com o que precisar. 😊',
    '{}', 'none', n_menu_main, 1, true, true
  );

  -- 2. Menu Principal (menu — List Message)
  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_menu_main, flow_id, 'menu', 'Menu Principal',
    'Como posso te ajudar hoje?',
    jsonb_build_object(
      'buttonText',   'Ver opções',
      'subtitle',     'Toque em *Ver opções* ou digite o nome do serviço',
      'sectionTitle', 'Serviços disponíveis',
      'footer',       'MetaDesk Atendimento',
      'descriptions', jsonb_build_object(
        'financeiro',   'Cobranças, faturas, negociações e pagamentos',
        'suporte',      'Erros, problemas de acesso e dúvidas técnicas',
        'pedido',       'Acompanhar, cancelar ou alterar seu pedido',
        'informacoes',  'Planos, preços e canais de contato',
        'conta',        'Senha, dados pessoais e configurações',
        'atendente',    'Falar diretamente com um atendente humano'
      )
    ),
    'none', null, 2, false, true
  );

  -- =============================================
  -- SUB-MENU: FINANCEIRO
  -- =============================================

  -- 3. Menu Financeiro
  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_financeiro, flow_id, 'menu', 'Menu Financeiro',
    'Entendido! 💳 Qual é a sua necessidade financeira?',
    jsonb_build_object(
      'buttonText',   'Ver opções',
      'sectionTitle', 'Financeiro',
      'footer',       'MetaDesk Atendimento',
      'descriptions', jsonb_build_object(
        '2via',     'Emitir segunda via de cobrança ou boleto',
        'negociar', 'Renegociar débitos em aberto',
        'confirmar','Informar pagamento já realizado',
        'voltar',   'Retornar ao menu principal'
      )
    ),
    'none', null, 10, false, true
  );

  -- 4. Ação: Emitir 2ª Via
  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_fin_2via, flow_id, 'action', 'Emitir 2ª Via',
    'Entendido! 🧾 Vou te conectar com nossa equipe financeira para emitir a 2ª via.' || chr(10) ||
    'Um momento, por favor... ⏳',
    '{}', 'escalate', null, 11, false, true
  );

  -- 5. Ação: Negociar Dívida
  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_fin_negoc, flow_id, 'action', 'Negociar Dívida',
    'Certo! 🤝 Vou encaminhar você para nosso especialista em negociação.' || chr(10) ||
    'Aguarde um instante... ⏳',
    '{}', 'escalate', null, 12, false, true
  );

  -- 6. Ação: Confirmar Pagamento
  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_fin_pgto, flow_id, 'action', 'Confirmar Pagamento',
    'Perfeito! ✅ Nossa equipe vai verificar e confirmar seu pagamento.' || chr(10) ||
    'Um momento... ⏳',
    '{}', 'escalate', null, 13, false, true
  );

  -- =============================================
  -- SUB-MENU: SUPORTE TÉCNICO
  -- =============================================

  -- 7. Menu Suporte
  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_suporte, flow_id, 'menu', 'Menu Suporte Técnico',
    'Que problema você está enfrentando? 🛠️',
    jsonb_build_object(
      'buttonText',   'Ver opções',
      'sectionTitle', 'Suporte Técnico',
      'footer',       'MetaDesk Atendimento',
      'descriptions', jsonb_build_object(
        'acesso',        'Não consigo fazer login ou acessar o sistema',
        'erro',          'O sistema está apresentando erro ou falha',
        'lentidao',      'O sistema está lento ou instável',
        'outro_suporte', 'Outro problema técnico não listado',
        'voltar',        'Retornar ao menu principal'
      )
    ),
    'none', null, 20, false, true
  );

  -- 8-11. Ações de Suporte
  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES
  (
    n_sup_acesso, flow_id, 'action', 'Suporte - Acesso',
    '🔐 Vou te conectar com nosso suporte técnico agora.' || chr(10) ||
    'Um atendente vai te ajudar com o problema de acesso. Aguarde... ⏳',
    '{}', 'escalate', null, 21, false, true
  ),
  (
    n_sup_erro, flow_id, 'action', 'Suporte - Erro',
    '❌ Nossa equipe técnica vai analisar o erro relatado.' || chr(10) ||
    'Aguarde enquanto te conectamos com um especialista... ⏳',
    '{}', 'escalate', null, 22, false, true
  ),
  (
    n_sup_lent, flow_id, 'action', 'Suporte - Lentidão',
    '🐢 Entendido! Vou verificar com nossa equipe o problema de lentidão.' || chr(10) ||
    'Aguarde... ⏳',
    '{}', 'escalate', null, 23, false, true
  ),
  (
    n_sup_outro, flow_id, 'action', 'Suporte - Outro',
    '🔧 Nossa equipe técnica está pronta para te ajudar.' || chr(10) ||
    'Um atendente estará com você em breve. Aguarde... ⏳',
    '{}', 'escalate', null, 24, false, true
  );

  -- =============================================
  -- PEDIDOS
  -- =============================================

  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_pedido, flow_id, 'action', 'Meu Pedido',
    '📦 Vou verificar as informações do seu pedido com nossa equipe.' || chr(10) ||
    'Um momento, por favor... ⏳',
    '{}', 'escalate', null, 30, false, true
  );

  -- =============================================
  -- SUB-MENU: INFORMAÇÕES
  -- =============================================

  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_info, flow_id, 'menu', 'Menu Informações',
    'Que tipo de informação você precisa? 📋',
    jsonb_build_object(
      'buttonText',   'Ver opções',
      'sectionTitle', 'Informações',
      'footer',       'MetaDesk Atendimento',
      'descriptions', jsonb_build_object(
        'planos',   'Conheça nossos planos e funcionalidades',
        'preco',    'Tabela de preços e condições especiais',
        'contato',  'Telefone, e-mail e redes sociais',
        'voltar',   'Retornar ao menu principal'
      )
    ),
    'none', null, 40, false, true
  );

  -- Info: Planos
  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_info_planos, flow_id, 'message', 'Info - Planos',
    '📋 *Nossos Planos:*' || chr(10) || chr(10) ||
    '• *Básico* – Ideal para pequenas equipes' || chr(10) ||
    '• *Profissional* – Para equipes em crescimento' || chr(10) ||
    '• *Enterprise* – Solução completa para grandes empresas' || chr(10) || chr(10) ||
    'Para contratar ou saber mais detalhes, posso te conectar com um consultor! 😊',
    '{}', 'none', n_atendente, 41, false, true
  );

  -- Info: Preços
  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_info_preco, flow_id, 'message', 'Info - Preços',
    '💰 *Tabela de Preços:*' || chr(10) || chr(10) ||
    'Nossos valores são personalizados de acordo com o porte e necessidades da sua empresa.' || chr(10) || chr(10) ||
    'Para receber uma *proposta personalizada*, vou te conectar com um de nossos consultores! 😊',
    '{}', 'none', n_atendente, 42, false, true
  );

  -- Info: Contato
  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_info_cont, flow_id, 'message', 'Info - Contato',
    '📞 *Nossos Canais de Atendimento:*' || chr(10) || chr(10) ||
    '• WhatsApp: Este canal 😊' || chr(10) ||
    '• Horário: Segunda a Sexta, das 8h às 18h' || chr(10) || chr(10) ||
    'Posso te ajudar com mais alguma coisa?',
    '{}', 'none', n_menu_main, 43, false, true
  );

  -- =============================================
  -- MINHA CONTA
  -- =============================================

  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_conta, flow_id, 'action', 'Minha Conta',
    '👤 Vou te conectar com nossa equipe para te ajudar com sua conta.' || chr(10) ||
    'Um momento... ⏳',
    '{}', 'escalate', null, 50, false, true
  );

  -- =============================================
  -- FALAR COM ATENDENTE (escalate direto)
  -- =============================================

  INSERT INTO public.chatbot_nodes
    (id, flow_id, node_type, name, content, options, action_type, next_node_id, node_order, is_entry_point, is_active)
  VALUES (
    n_atendente, flow_id, 'action', 'Falar com Atendente',
    '💬 Claro! Aguarde um momento enquanto te conectamos com um de nossos atendentes.' || chr(10) ||
    'Em breve alguém estará aqui para te ajudar! 😊',
    '{}', 'escalate', null, 99, false, true
  );

  -- =============================================
  -- OPÇÕES DO MENU PRINCIPAL
  -- =============================================

  INSERT INTO public.chatbot_node_options
    (node_id, option_key, option_text, next_node_id, option_order)
  VALUES
    (n_menu_main, 'financeiro',  '💳 Financeiro',            n_financeiro, 1),
    (n_menu_main, 'suporte',     '🛠️ Suporte Técnico',       n_suporte,    2),
    (n_menu_main, 'pedido',      '📦 Meu Pedido',             n_pedido,     3),
    (n_menu_main, 'informacoes', '📋 Informações',            n_info,       4),
    (n_menu_main, 'conta',       '👤 Minha Conta',            n_conta,      5),
    (n_menu_main, 'atendente',   '💬 Falar com Atendente',   n_atendente,  6);

  -- =============================================
  -- OPÇÕES DO MENU FINANCEIRO
  -- =============================================

  INSERT INTO public.chatbot_node_options
    (node_id, option_key, option_text, next_node_id, option_order)
  VALUES
    (n_financeiro, '2via',     '🧾 2ª Via de Boleto',     n_fin_2via,  1),
    (n_financeiro, 'negociar', '🤝 Negociar Dívida',      n_fin_negoc, 2),
    (n_financeiro, 'confirmar','✅ Confirmar Pagamento',   n_fin_pgto,  3),
    (n_financeiro, 'voltar',   '↩️ Voltar ao Menu',        n_menu_main, 4);

  -- =============================================
  -- OPÇÕES DO MENU SUPORTE
  -- =============================================

  INSERT INTO public.chatbot_node_options
    (node_id, option_key, option_text, next_node_id, option_order)
  VALUES
    (n_suporte, 'acesso',        '🔐 Problema de Acesso', n_sup_acesso, 1),
    (n_suporte, 'erro',          '❌ Erro no Sistema',     n_sup_erro,   2),
    (n_suporte, 'lentidao',      '🐢 Sistema Lento',       n_sup_lent,   3),
    (n_suporte, 'outro_suporte', '❓ Outro Problema',       n_sup_outro,  4),
    (n_suporte, 'voltar',        '↩️ Voltar ao Menu',       n_menu_main,  5);

  -- =============================================
  -- OPÇÕES DO MENU INFORMAÇÕES
  -- =============================================

  INSERT INTO public.chatbot_node_options
    (node_id, option_key, option_text, next_node_id, option_order)
  VALUES
    (n_info, 'planos',  '📋 Planos Disponíveis',  n_info_planos, 1),
    (n_info, 'preco',   '💰 Preços e Valores',     n_info_preco,  2),
    (n_info, 'contato', '📞 Canais de Contato',    n_info_cont,   3),
    (n_info, 'voltar',  '↩️ Voltar ao Menu',        n_menu_main,   4);

END $$;
