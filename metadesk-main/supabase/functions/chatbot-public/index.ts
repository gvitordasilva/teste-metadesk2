import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RequestBody {
  action: string;
  [key: string]: any;
}

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

async function query(sql: string, params: any[] = []) {
  const pool = getPool();
  const connection = await pool.connect();
  try {
    const result = await connection.queryObject(sql, params);
    return result.rows;
  } finally {
    connection.release();
  }
}

async function queryOne(sql: string, params: any[] = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { action } = body;

    let result: any;

    switch (action) {
      case "getFlow":
        result = await queryOne(
          `SELECT * FROM chatbot_flows 
           WHERE id = $1 
           AND is_active = true 
           AND channel IN ('all', 'webchat')`,
          [body.flowId]
        );
        break;

      case "getEntryNode":
        result = await queryOne(
          `SELECT * FROM chatbot_nodes 
           WHERE flow_id = $1 
           AND is_active = true 
           AND is_entry_point = true
           LIMIT 1`,
          [body.flowId]
        );

        if (!result) {
          result = await queryOne(
            `SELECT * FROM chatbot_nodes 
             WHERE flow_id = $1 
             AND is_active = true 
             ORDER BY node_order ASC
             LIMIT 1`,
            [body.flowId]
          );
        }
        break;

      case "getNode":
        result = await queryOne(
          `SELECT * FROM chatbot_nodes 
           WHERE id = $1 
           AND is_active = true`,
          [body.nodeId]
        );
        break;

      case "getNodeOptions":
        result = await query(
          `SELECT * FROM chatbot_node_options 
           WHERE node_id = $1 
           ORDER BY option_order ASC`,
          [body.nodeId]
        );
        break;

      // ── Check online attendants ──────────────────────────
      case "checkOnlineAttendants": {
        const onlineRows = await query(
          `SELECT user_id, full_name FROM attendant_profiles WHERE status = 'online'`
        );
        result = { count: (onlineRows || []).length };
        break;
      }

      // ── Live chat actions (post-escalation) ──────────────────────────

      case "createQueueEntry": {
        const { customerName, customerEmail, customerPhone, subject, chatHistory, flowId: qFlowId } = body;

        // Check for online attendants first
        const onlineAttendants = await query(
          `SELECT user_id, full_name, last_assigned_at FROM attendant_profiles 
           WHERE status = 'online' 
           ORDER BY last_assigned_at ASC NULLS FIRST`
        );

        if (!onlineAttendants || onlineAttendants.length === 0) {
          return new Response(
            JSON.stringify({ ok: false, error: "Nenhum atendente online no momento.", code: "NO_ATTENDANTS_ONLINE" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Pick the attendant with oldest last_assigned_at (round-robin)
        const nextAttendant = onlineAttendants[0] as any;

        // Create queue entry already assigned to the attendant
        const queueEntry = await queryOne(
          `INSERT INTO service_queue (channel, status, priority, customer_name, customer_email, customer_phone, subject, last_message, waiting_since, assigned_to)
           VALUES ('web', 'in_progress', 3, $1, $2, $3, $4, $5, now(), $6)
           RETURNING id`,
          [
            customerName || null,
            customerEmail || null,
            customerPhone || null,
            subject || 'Atendimento via chat',
            chatHistory?.[chatHistory.length - 1]?.content || null,
            nextAttendant.user_id,
          ]
        );

        if (!queueEntry) {
          return new Response(
            JSON.stringify({ ok: false, error: "Failed to create queue entry" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const queueId = (queueEntry as any).id;

        // Update last_assigned_at for round-robin tracking
        await query(
          `UPDATE attendant_profiles SET last_assigned_at = now() WHERE user_id = $1`,
          [nextAttendant.user_id]
        );

        // Create a service_session linked to this queue entry
        const sessionEntry = await queryOne(
          `INSERT INTO service_sessions (conversation_id, status, started_at, attendant_id)
           VALUES ($1, 'active', now(), $2)
           RETURNING id`,
          [queueId, nextAttendant.user_id]
        );

        const sessionId = sessionEntry ? (sessionEntry as any).id : null;

        // Save chat history as service_messages
        if (sessionId && chatHistory && Array.isArray(chatHistory)) {
          for (const msg of chatHistory) {
            await query(
              `INSERT INTO service_messages (session_id, sender_type, content, created_at)
               VALUES ($1, $2, $3, $4)`,
              [sessionId, msg.sender === "user" ? "client" : "system", msg.content, msg.timestamp || new Date().toISOString()]
            );
          }
        }

        result = { queueId, assignedTo: nextAttendant.full_name };
        break;
      }

      case "sendCustomerMessage": {
        const { queueId, content } = body;

        if (!queueId || !content) {
          return new Response(
            JSON.stringify({ ok: false, error: "queueId and content required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const session = await queryOne(
          `SELECT id FROM service_sessions WHERE conversation_id = $1 AND status = 'active' LIMIT 1`,
          [queueId]
        );

        const sessionId = session ? (session as any).id : queueId;

        await query(
          `INSERT INTO service_messages (session_id, sender_type, content)
           VALUES ($1, 'client', $2)`,
          [sessionId, content]
        );

        await query(
          `UPDATE service_queue SET last_message = $1, updated_at = now() WHERE id = $2`,
          [content, queueId]
        );

        result = { sent: true };
        break;
      }

      case "getNewMessages": {
        const { queueId, afterTimestamp } = body;

        if (!queueId) {
          return new Response(
            JSON.stringify({ ok: false, error: "queueId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const liveSession = await queryOne(
          `SELECT id FROM service_sessions WHERE conversation_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
          [queueId]
        );

        const sId = liveSession ? (liveSession as any).id : queueId;

        const msgs = await query(
          `SELECT id, content, sender_type, created_at FROM service_messages 
           WHERE session_id = $1 
           AND sender_type IN ('agent', 'system')
           AND created_at > $2
           ORDER BY created_at ASC`,
          [sId, afterTimestamp || '1970-01-01T00:00:00Z']
        );

        const queueStatus = await queryOne(
          `SELECT status FROM service_queue WHERE id = $1`,
          [queueId]
        );

        result = { 
          messages: msgs || [], 
          queueStatus: queueStatus ? (queueStatus as any).status : null 
        };
        break;
      }

      case "linkQueueToComplaint": {
        const { queueId, complaintId } = body;
        if (queueId && complaintId) {
          await query(
            `UPDATE service_queue SET complaint_id = $1 WHERE id = $2`,
            [complaintId, queueId]
          );
          // Also link the service session
          await query(
            `UPDATE service_sessions SET complaint_id = $1 WHERE conversation_id = $2 AND status = 'active'`,
            [complaintId, queueId]
          );
        }
        result = { linked: true };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ ok: false, error: `Unknown action: ${action}`, code: "UNKNOWN_ACTION" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ ok: true, data: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Chatbot public error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message, code: "SERVER_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
