import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sendWelcomeEmail(email: string, fullName: string, password: string, role: string) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("RESEND_API_KEY not configured, skipping email");
    return;
  }

  const roleName = role === "admin" ? "Administrador" : "Atendente";

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #1a1a1a; font-size: 24px;">Bem-vindo à Metadesk!</h1>
      </div>
      <p style="color: #333; font-size: 16px;">Olá <strong>${fullName}</strong>,</p>
      <p style="color: #555; font-size: 14px;">Sua conta foi criada com sucesso na plataforma Metadesk. Abaixo estão suas credenciais de acesso:</p>
      <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 8px 0; font-size: 14px;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 8px 0; font-size: 14px;"><strong>Senha:</strong> ${password}</p>
        <p style="margin: 8px 0; font-size: 14px;"><strong>Perfil:</strong> ${roleName}</p>
      </div>
      <p style="color: #555; font-size: 14px;">Recomendamos que altere sua senha no primeiro acesso.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://metadesk.lovable.app/login" 
           style="background: #f59e0b; color: #000; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
          Acessar Metadesk
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="color: #999; font-size: 12px; text-align: center;">Este é um e-mail automático da plataforma Metadesk.</p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Metadesk <noreply@metadesk.lovable.app>",
        to: [email],
        subject: "Bem-vindo à Metadesk - Suas credenciais de acesso",
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend email error:", err);
    } else {
      console.log("Welcome email sent to", email);
    }
  } catch (err) {
    console.error("Error sending welcome email:", err);
  }
}

async function sendWelcomeSMS(phone: string, fullName: string, email: string, password: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

  if (!accountSid || !authToken || !fromNumber) {
    console.error("Twilio credentials not configured, skipping SMS");
    return;
  }

  let toNumber = phone.replace(/\D/g, "");
  if (!toNumber.startsWith("+")) {
    if (!toNumber.startsWith("55")) {
      toNumber = "55" + toNumber;
    }
    toNumber = "+" + toNumber;
  }

  const message = `Olá ${fullName}! Sua conta Metadesk foi criada. Email: ${email} | Senha: ${password}. Acesse: metadesk.lovable.app/login. Recomendamos trocar a senha no primeiro acesso.`;

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
        },
        body: new URLSearchParams({
          To: toNumber,
          From: fromNumber,
          Body: message,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Twilio SMS error:", err);
    } else {
      console.log("Welcome SMS sent to", toNumber);
    }
  } catch (err) {
    console.error("Error sending welcome SMS:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      data: { user: caller },
      error: authError,
    } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get caller's role AND tenant_id
    const { data: callerRoleData } = await supabaseAdmin
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!callerRoleData) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerTenantId = callerRoleData.tenant_id; // null = super admin (no tenant restriction)

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { email, password, full_name, role, phone, tenant_id } = body;

      if (!email || !password || !full_name || !role) {
        return new Response(
          JSON.stringify({ error: "Campos obrigatórios: email, password, full_name, role" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Tenant-scoped admin can only create users for their own tenant
      const effectiveTenantId = callerTenantId || tenant_id || null;

      // If caller has a tenant, force it — don't allow overriding
      if (callerTenantId && tenant_id && tenant_id !== callerTenantId) {
        return new Response(
          JSON.stringify({ error: "Você só pode criar usuários para o seu tenant" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create auth user
      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name },
        });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = newUser.user.id;

      // Assign role with tenant_id
      const roleInsert: any = { user_id: userId, role };
      if (effectiveTenantId) {
        roleInsert.tenant_id = effectiveTenantId;
      }
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert(roleInsert);

      if (roleError) {
        console.error("Error assigning role:", roleError);
      }

      // Create attendant profile with tenant_id
      const profileInsert: any = {
        user_id: userId,
        full_name,
        email,
        phone: phone || null,
        status: "offline",
      };
      if (effectiveTenantId) {
        profileInsert.tenant_id = effectiveTenantId;
      }
      const { error: profileError } = await supabaseAdmin
        .from("attendant_profiles")
        .insert(profileInsert);

      if (profileError) {
        console.error("Error creating profile:", profileError);
      }

      // Send notifications
      const notifications: Promise<void>[] = [];
      notifications.push(sendWelcomeEmail(email, full_name, password, role));
      if (phone) {
        notifications.push(sendWelcomeSMS(phone, full_name, email, password));
      }
      await Promise.allSettled(notifications);

      return new Response(
        JSON.stringify({ ok: true, user_id: userId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "list") {
      // Build query scoped by tenant
      let rolesQuery = supabaseAdmin
        .from("user_roles")
        .select("user_id, role, tenant_id, created_at");

      // If caller has a tenant_id, only list users from that tenant
      if (callerTenantId) {
        rolesQuery = rolesQuery.eq("tenant_id", callerTenantId);
      }

      const { data: roles } = await rolesQuery;

      const userIds = (roles || []).map((r: any) => r.user_id);

      // Only fetch profiles for the filtered user IDs
      let profiles: any[] = [];
      if (userIds.length > 0) {
        const { data } = await supabaseAdmin
          .from("attendant_profiles")
          .select("user_id, full_name, email, status, avatar_url, phone")
          .in("user_id", userIds);
        profiles = data || [];
      }

      const {
        data: { users: authUsers },
      } = await supabaseAdmin.auth.admin.listUsers();

      const userMap = new Map<string, any>();

      for (const r of roles || []) {
        userMap.set(r.user_id, {
          ...userMap.get(r.user_id),
          role: r.role,
          user_id: r.user_id,
        });
      }

      for (const p of profiles) {
        const existing = userMap.get(p.user_id) || { user_id: p.user_id };
        userMap.set(p.user_id, { ...existing, ...p });
      }

      // Only enrich with auth data for users already in the map
      for (const u of authUsers || []) {
        const existing = userMap.get(u.id);
        if (existing) {
          userMap.set(u.id, {
            ...existing,
            email: existing.email || u.email,
            full_name:
              existing.full_name || u.user_metadata?.full_name || u.email,
            last_sign_in_at: u.last_sign_in_at,
          });
        }
      }

      return new Response(
        JSON.stringify({ ok: true, users: Array.from(userMap.values()) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-create-user error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
