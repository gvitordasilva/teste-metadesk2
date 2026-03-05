import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const { complaint_id, description, type, category, channel, reporter_name, is_anonymous, attachments } = await req.json();

    if (!description) throw new Error("Description is required");

    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    const imageUrls: string[] = [];
    const documentUrls: string[] = [];

    if (hasAttachments) {
      for (const url of attachments) {
        const lower = (url as string).toLowerCase();
        if (imageExtensions.some(ext => lower.includes(ext))) {
          imageUrls.push(url);
        } else {
          documentUrls.push(url);
        }
      }
    }

    const attachmentContext = hasAttachments
      ? `\n\nIMPORTANTE: ${imageUrls.length} imagem(ns) e ${documentUrls.length} documento(s) foram anexados. Analise as imagens fornecidas em detalhe. Descreva o que você vê nas imagens e como isso se relaciona com a solicitação. Se houver evidências visuais de problemas, danos, irregularidades ou situações relevantes, inclua uma análise detalhada no campo "attachment_analysis".`
      : "";

    const documentNote = documentUrls.length > 0
      ? `\n- Documentos anexados (PDFs): ${documentUrls.map(u => u.split('/').pop()).join(', ')} - considere que podem conter evidências adicionais.`
      : "";

    const systemPrompt = `Você é um analista de triagem de atendimento com capacidade de analisar imagens e documentos. Analise a solicitação e seus anexos, retornando APENAS um JSON válido (sem markdown, sem code blocks) com esta estrutura:
{
  "sentiment": "positivo" | "neutro" | "preocupado" | "frustrado" | "irritado",
  "urgency": "baixa" | "media" | "alta" | "critica",
  "scenario_summary": "Resumo de 2-3 frases do cenário/situação incluindo o que foi observado nos anexos",
  "suggested_category": "categoria sugerida se diferente da atual",
  "risk_factors": ["lista de fatores de risco identificados, incluindo os observados em imagens/documentos"],
  "recommended_action": "ação recomendada em 1-2 frases",
  "attachment_analysis": "Descrição detalhada do que foi identificado nos anexos (imagens e documentos). Se não houver anexos, use null."
}${attachmentContext}`;

    const userTextContent = `Analise esta solicitação:
- Tipo: ${type || "não informado"}
- Categoria: ${category || "não informada"}
- Canal: ${channel || "web"}
- Identificado: ${is_anonymous ? "Anônimo" : (reporter_name || "Sim")}
- Descrição: ${description}${documentNote}`;

    // Build message content - use multimodal format if images are present
    let userMessage: any;
    if (imageUrls.length > 0) {
      const contentParts: any[] = [{ type: "text", text: userTextContent }];
      for (const imgUrl of imageUrls) {
        contentParts.push({
          type: "image_url",
          image_url: { url: imgUrl, detail: "high" },
        });
      }
      userMessage = { role: "user", content: contentParts };
    } else {
      userMessage = { role: "user", content: userTextContent };
    }

    // Use gpt-4o for vision capability when images are present, gpt-4o-mini otherwise
    const model = imageUrls.length > 0 ? "gpt-4o" : "gpt-4o-mini";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          userMessage,
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("OpenAI API error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "";
    
    let triage;
    try {
      const jsonMatch = rawContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      triage = JSON.parse(jsonMatch);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
      triage = {
        sentiment: "neutro",
        urgency: "media",
        scenario_summary: rawContent.slice(0, 200),
        risk_factors: [],
        recommended_action: "Análise manual necessária",
        attachment_analysis: null,
      };
    }

    // Save triage to complaint if complaint_id provided
    if (complaint_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from("complaints")
        .update({ 
          ai_triage: triage,
          last_sentiment: triage.sentiment,
        })
        .eq("id", complaint_id);
    }

    return new Response(JSON.stringify({ triage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("complaint-ai-triage error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
