import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EvolutionWebhook {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text: string };
      listResponseMessage?: {
        title?: string;
        listType?: number;
        singleSelectReply?: { selectedRowId: string };
      };
      buttonsResponseMessage?: {
        selectedButtonId?: string;
        selectedDisplayText?: string;
      };
    };
    messageType?: string;
    messageTimestamp?: number;
  };
}

interface ChatbotNode {
  id: string;
  flow_id: string;
  node_type: string;
  name: string;
  content: string | null;
  options: any;
  action_type: string;
  action_config: any;
  next_node_id: string | null;
  is_entry_point: boolean;
}

interface NodeOption {
  id: string;
  node_id: string;
  option_key: string;
  option_text: string;
  next_node_id: string | null;
  option_order: number;
}

interface BotResponse {
  message: string;
  nextNodeId: string | null;
  escalated: boolean;
  listPayload?: ListMessagePayload;
}

interface ListMessagePayload {
  title: string;
  description: string;
  buttonText: string;
  footerText: string;
  sections: Array<{
    title: string;
    rows: Array<{
      title: string;
      description: string;
      rowId: string;
    }>;
  }>;
}

// Database connection pool for chatbot queries (bypass PostgREST)
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!databaseUrl) {
      throw new Error("SUPABASE_DB_URL not configured");
    }
    pool = new Pool(databaseUrl, 3, true);
  }
  return pool;
}

async function dbQuery(sql: string, params: any[] = []) {
  const pool = getPool();
  const connection = await pool.connect();
  try {
    const result = await connection.queryObject(sql, params);
    return result.rows;
  } finally {
    connection.release();
  }
}

async function dbQueryOne(sql: string, params: any[] = []) {
  const rows = await dbQuery(sql, params);
  return rows[0] || null;
}

// Chatbot helper functions using direct Postgres
async function getDefaultFlowForWhatsapp(): Promise<{ id: string } | null> {
  return dbQueryOne(
    `SELECT id FROM chatbot_flows
     WHERE is_default = true
     AND is_active = true
     AND channel IN ('all', 'whatsapp')
     LIMIT 1`
  );
}

async function getEntryNode(flowId: string): Promise<ChatbotNode | null> {
  let node = await dbQueryOne(
    `SELECT * FROM chatbot_nodes
     WHERE flow_id = $1
     AND is_entry_point = true
     AND is_active = true
     LIMIT 1`,
    [flowId]
  );

  // Fallback to first node by order
  if (!node) {
    node = await dbQueryOne(
      `SELECT * FROM chatbot_nodes
       WHERE flow_id = $1
       AND is_active = true
       ORDER BY node_order ASC
       LIMIT 1`,
      [flowId]
    );
  }

  return node as ChatbotNode | null;
}

async function getNode(nodeId: string): Promise<ChatbotNode | null> {
  return dbQueryOne(
    `SELECT * FROM chatbot_nodes WHERE id = $1`,
    [nodeId]
  ) as Promise<ChatbotNode | null>;
}

async function getNodeOptions(nodeId: string): Promise<NodeOption[]> {
  return dbQuery(
    `SELECT * FROM chatbot_node_options
     WHERE node_id = $1
     ORDER BY option_order ASC`,
    [nodeId]
  ) as Promise<NodeOption[]>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload: EvolutionWebhook = await req.json();
    console.log("Webhook received:", JSON.stringify(payload, null, 2));

    // Only process incoming messages
    if (payload.event !== "messages.upsert" || payload.data?.key?.fromMe) {
      return new Response(JSON.stringify({ status: "ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract phone number from remoteJid (format: 5511999999999@s.whatsapp.net)
    const remoteJid = payload.data.key.remoteJid;
    const phoneNumber = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
    const customerName = payload.data.pushName || "Cliente";

    // Extract message content — supports text, list response and button response
    const msg = payload.data.message;
    const listRowId = msg?.listResponseMessage?.singleSelectReply?.selectedRowId;
    const buttonId = msg?.buttonsResponseMessage?.selectedButtonId;
    const messageContent =
      listRowId ||
      buttonId ||
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      "";

    // Human-readable label for saving to DB (list/button clicks show the title)
    const messageLabel =
      msg?.listResponseMessage?.title ||
      msg?.buttonsResponseMessage?.selectedDisplayText ||
      messageContent;

    console.log(`Message from ${phoneNumber} (${customerName}): ${messageContent}`);

    // Find or create conversation (using Supabase JS for non-chatbot tables)
    let { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("phone_number", phoneNumber)
      .single();

    if (!conversation) {
      const { data: newConversation, error: createError } = await supabase
        .from("whatsapp_conversations")
        .insert({
          phone_number: phoneNumber,
          customer_name: customerName,
          session_active: true,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating conversation:", createError);
        throw createError;
      }
      conversation = newConversation;
    } else {
      // Update existing conversation
      await supabase
        .from("whatsapp_conversations")
        .update({
          customer_name: customerName,
          last_message_at: new Date().toISOString(),
          session_active: true,
        })
        .eq("id", conversation.id);
    }

    // Save incoming message
    await supabase.from("service_messages").insert({
      conversation_id: conversation.id,
      channel: "whatsapp",
      sender_type: "customer",
      sender_name: customerName,
      content: messageLabel,
      metadata: { whatsapp_message_id: payload.data.key.id },
    });

    // Process chatbot logic (using direct Postgres)
    const response = await processChatbotResponse(conversation, messageContent);

    // Send response via Evolution API
    if (response.listPayload) {
      await sendWhatsAppListMessage(phoneNumber, response.listPayload);
    } else if (response.message) {
      await sendWhatsAppMessage(phoneNumber, response.message);
    }

    // Save bot response
    if (response.message) {
      await supabase.from("service_messages").insert({
        conversation_id: conversation.id,
        channel: "whatsapp",
        sender_type: "bot",
        sender_name: "MetaDesk Bot",
        content: response.message,
      });
    }

    // Update conversation state
    await supabase
      .from("whatsapp_conversations")
      .update({
        current_node_id: response.nextNodeId,
        escalated_at: response.escalated ? new Date().toISOString() : null,
      })
      .eq("id", conversation.id);

    // Update or create service queue entry
    const { data: existingQueue } = await supabase
      .from("service_queue")
      .select("id, unread_count")
      .eq("whatsapp_conversation_id", conversation.id)
      .neq("status", "completed")
      .maybeSingle();

    if (existingQueue) {
      // Update existing queue entry with latest message
      await supabase
        .from("service_queue")
        .update({
          last_message: messageLabel,
          unread_count: (existingQueue.unread_count || 0) + 1,
          customer_name: customerName,
        })
        .eq("id", existingQueue.id);
    } else if (response.escalated) {
      // Only create a new queue entry when the chatbot escalates
      await supabase.from("service_queue").insert({
        channel: "whatsapp",
        status: "waiting",
        customer_name: customerName,
        customer_phone: phoneNumber,
        subject: "Atendimento WhatsApp",
        last_message: messageLabel,
        unread_count: 1,
        whatsapp_conversation_id: conversation.id,
        waiting_since: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ status: "processed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processChatbotResponse(
  conversation: any,
  userMessage: string
): Promise<BotResponse> {
  const currentNodeId = conversation.current_node_id;

  // If no current node, get the entry point of the default flow
  if (!currentNodeId) {
    const defaultFlow = await getDefaultFlowForWhatsapp();

    if (!defaultFlow) {
      return {
        message: "Olá! Bem-vindo ao atendimento. Um momento, vou transferir você para um atendente.",
        nextNodeId: null,
        escalated: true,
      };
    }

    const entryNode = await getEntryNode(defaultFlow.id);

    if (!entryNode) {
      return {
        message: "Olá! Bem-vindo ao atendimento. Um momento, vou transferir você para um atendente.",
        nextNodeId: null,
        escalated: true,
      };
    }

    return buildNodeResponse(entryNode);
  }

  // Get current node
  const currentNode = await getNode(currentNodeId);

  if (!currentNode) {
    return {
      message: "Desculpe, ocorreu um erro. Transferindo para um atendente.",
      nextNodeId: null,
      escalated: true,
    };
  }

  // Process based on node type
  if (currentNode.node_type === "menu") {
    // Find selected option — matches by key (rowId from list) or text
    const options = await getNodeOptions(currentNode.id);

    const userChoice = userMessage.trim().toLowerCase();
    const selectedOption = options?.find(
      (opt: NodeOption) =>
        opt.option_key.toLowerCase() === userChoice ||
        opt.option_text.toLowerCase().includes(userChoice)
    );

    if (!selectedOption) {
      // Invalid option — resend the list message
      const invalidResponse = await buildNodeResponse(currentNode);
      return {
        ...invalidResponse,
        message: `Opção não reconhecida. Por favor, selecione uma das opções abaixo. 👇\n\n${invalidResponse.message}`,
        nextNodeId: currentNodeId,
      };
    }

    if (!selectedOption.next_node_id) {
      return {
        message: "Transferindo para um atendente. Aguarde um momento.",
        nextNodeId: null,
        escalated: true,
      };
    }

    // Get next node
    const nextNode = await getNode(selectedOption.next_node_id);

    if (!nextNode) {
      return {
        message: "Transferindo para um atendente. Aguarde um momento.",
        nextNodeId: null,
        escalated: true,
      };
    }

    return buildNodeResponse(nextNode);
  }

  // For message nodes, move to next
  if (currentNode.node_type === "message" && currentNode.next_node_id) {
    const nextNode = await getNode(currentNode.next_node_id);

    if (nextNode) {
      return buildNodeResponse(nextNode);
    }
  }

  // For action nodes
  if (currentNode.node_type === "action") {
    if (currentNode.action_type === "escalate") {
      return {
        message: currentNode.content || "Transferindo para um atendente. Aguarde um momento.",
        nextNodeId: null,
        escalated: true,
      };
    }

    if (currentNode.action_type === "end") {
      return {
        message: currentNode.content || "Obrigado pelo contato. Até logo!",
        nextNodeId: null,
        escalated: false,
      };
    }
  }

  // Default: escalate
  return {
    message: "Transferindo para um atendente. Aguarde um momento.",
    nextNodeId: null,
    escalated: true,
  };
}

async function buildNodeResponse(node: ChatbotNode): Promise<BotResponse> {
  // Action node
  if (node.node_type === "action") {
    if (node.action_type === "escalate") {
      return {
        message: node.content || "Transferindo para um atendente. Aguarde um momento.",
        nextNodeId: null,
        escalated: true,
      };
    }

    if (node.action_type === "end") {
      return {
        message: node.content || "Obrigado pelo contato. Até logo!",
        nextNodeId: null,
        escalated: false,
      };
    }
  }

  // Menu node — build a WhatsApp List Message
  if (node.node_type === "menu") {
    const options = await getNodeOptions(node.id);
    const nodeOptions = node.options || {};

    // Descriptions map: { "key": "description text" }
    const descriptions: Record<string, string> = nodeOptions.descriptions || {};

    const rows = (options || []).map((opt: NodeOption) => ({
      rowId: opt.option_key,
      title: opt.option_text,
      description: descriptions[opt.option_key] || "",
    }));

    const listPayload: ListMessagePayload = {
      title: node.content || "Como posso te ajudar?",
      description: nodeOptions.subtitle || "",
      buttonText: nodeOptions.buttonText || "Ver opções",
      footerText: nodeOptions.footer || "MetaDesk Atendimento",
      sections: [
        {
          title: nodeOptions.sectionTitle || "Opções",
          rows,
        },
      ],
    };

    // Text fallback (saved to DB and used if list fails)
    const textFallback =
      (node.content || "") +
      "\n\n" +
      (options || []).map((opt: NodeOption) => `• ${opt.option_text}`).join("\n");

    return {
      message: textFallback,
      nextNodeId: node.id,
      escalated: false,
      listPayload,
    };
  }

  // Message node
  return {
    message: node.content || "",
    nextNodeId: node.id,
    escalated: false,
  };
}

async function sendWhatsAppMessage(phoneNumber: string, text: string): Promise<void> {
  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
  const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME");

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
    console.error("Evolution API not configured");
    return;
  }

  try {
    const response = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: phoneNumber,
          text: text,
          delay: 1000,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to send WhatsApp message:", error);
    } else {
      console.log(`Text message sent to ${phoneNumber}`);
    }
  } catch (error) {
    console.error("Error sending WhatsApp message:", error);
  }
}

async function sendWhatsAppListMessage(
  phoneNumber: string,
  payload: ListMessagePayload
): Promise<void> {
  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
  const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME");

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
    console.error("Evolution API not configured");
    return;
  }

  try {
    const response = await fetch(
      `${EVOLUTION_API_URL}/message/sendList/${EVOLUTION_INSTANCE_NAME}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: phoneNumber,
          title: payload.title,
          description: payload.description,
          buttonText: payload.buttonText,
          footerText: payload.footerText,
          sections: payload.sections,
          delay: 1000,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to send WhatsApp list message:", error);
      // Fallback: do nothing (caller already has text fallback saved to DB)
    } else {
      console.log(`List message sent to ${phoneNumber}`);
    }
  } catch (error) {
    console.error("Error sending WhatsApp list message:", error);
  }
}
