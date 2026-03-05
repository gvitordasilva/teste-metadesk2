import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Loader2, ArrowLeft, Headphones, Headset } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { NPSSurvey } from "./NPSSurvey";

const EXT_SUPABASE_URL = "https://udyjlesjcgxhgdiaptjp.supabase.co";
const EXT_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkeWpsZXNqY2d4aGdkaWFwdGpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNzQ1ODIsImV4cCI6MjA4NDg1MDU4Mn0.RrxAI4hEnYKipq68oLTl7l0-2UBr0gmYGVHZwHnOOIs";

interface TriageResult {
  type: string;
  category: string;
  description: string;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_phone: string | null;
  is_anonymous: boolean;
  location: string | null;
  involved_parties: string | null;
}

interface StepTriageChatbotProps {
  onComplete: (result: TriageResult, protocolNumber: string) => void;
  onBack: () => void;
  onTransfer?: (protocolNumber: string) => void;
}

type Message = {
  id: string;
  role: "bot" | "user" | "agent";
  content: string;
  timestamp: Date;
};

const TRIAGE_STEPS = [
  {
    key: "greeting",
    botMessage: "Olá! Sou o assistente virtual do canal de manifestações. Vou te ajudar a registrar sua solicitação de forma rápida. Vamos começar?",
    options: ["Sim, vamos lá!", "Prefiro o formulário escrito"],
    field: null,
  },
  {
    key: "type",
    botMessage: "Qual o tipo da sua manifestação?",
    options: ["Reclamação", "Denúncia", "Sugestão"],
    field: "type",
  },
  {
    key: "category",
    botMessage: "Qual a categoria?",
    options: null,
    field: "category",
  },
  {
    key: "description",
    botMessage: "Por favor, descreva a situação com o máximo de detalhes possível. O que aconteceu, quando e como?",
    options: null,
    field: "description",
  },
  {
    key: "location",
    botMessage: "Onde isso ocorreu? (Pode digitar o local ou pular)",
    options: ["Pular"],
    field: "location",
  },
  {
    key: "involved",
    botMessage: "Há pessoas ou setores envolvidos que gostaria de mencionar? (Pode pular)",
    options: ["Pular"],
    field: "involved_parties",
  },
  {
    key: "anonymous",
    botMessage: "Deseja se identificar? Sua identidade será protegida.",
    options: ["Sim, quero me identificar", "Não, prefiro anonimato"],
    field: "is_anonymous",
  },
  {
    key: "name",
    botMessage: "Qual é o seu nome completo?",
    options: null,
    field: "reporter_name",
  },
  {
    key: "email",
    botMessage: "Qual é o seu e-mail? (Para receber o protocolo de acompanhamento)",
    options: null,
    field: "reporter_email",
  },
  {
    key: "phone",
    botMessage: "Qual é o seu telefone? (Opcional - pode pular)",
    options: ["Pular"],
    field: "reporter_phone",
  },
  {
    key: "confirm",
    botMessage: "Obrigado! Vou registrar sua manifestação agora. Deseja confirmar o envio?",
    options: ["Confirmar envio", "Cancelar"],
    field: null,
  },
];

const CATEGORY_MAP: Record<string, string[]> = {
  Reclamação: ["Atendimento", "Produto/Serviço", "Financeiro", "Logística", "Infraestrutura", "Outro"],
  Denúncia: ["Assédio", "Fraude", "Corrupção", "Irregularidade", "Segurança", "Outro"],
  Sugestão: ["Melhoria de Processo", "Novo Serviço", "Atendimento", "Tecnologia", "Outro"],
};

async function callPublicApi<T>(action: string, params: Record<string, any> = {}): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke("chatbot-public", {
    body: { action, ...params },
  });
  if (error) {
    console.error(`[chatbot-public] ${action} error:`, error);
    return null;
  }
  if (!data.ok) {
    if (data.code) throw { code: data.code, message: data.error };
    console.error(`[chatbot-public] ${action} failed:`, data);
    return null;
  }
  return data.data as T;
}

export function StepTriageChatbot({ onComplete, onBack, onTransfer }: StepTriageChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [collectedData, setCollectedData] = useState<Partial<TriageResult>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  // Live chat state
  const [isLiveChat, setIsLiveChat] = useState(false);
  const [isServiceEnded, setIsServiceEnded] = useState(false);
  const [queueItemId, setQueueItemId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPollTimestampRef = useRef<string>(new Date().toISOString());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  const addBotMessage = useCallback((content: string) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "bot", content, timestamp: new Date() },
      ]);
      setIsTyping(false);
    }, 600);
  }, []);

  // Initialize with greeting (guard against StrictMode double-mount)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    addBotMessage(TRIAGE_STEPS[0].botMessage);
  }, [addBotMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Poll for agent messages during live chat
  const pollMessages = useCallback(async (qId: string) => {
    try {
      const result = await callPublicApi<{
        messages: Array<{ id: string; content: string; sender_type: string; created_at: string }>;
        queueStatus: string | null;
      }>("getNewMessages", {
        queueId: qId,
        afterTimestamp: lastPollTimestampRef.current,
      });

      if (!result) return;

      if (result.messages && result.messages.length > 0) {
        result.messages.forEach((msg) => {
          const role: Message["role"] = msg.sender_type === "agent" ? "agent" : "bot";
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [
              ...prev,
              {
                id: msg.id,
                content: msg.content,
                role,
                timestamp: new Date(msg.created_at),
              },
            ];
          });
        });
        const latest = result.messages[result.messages.length - 1];
        lastPollTimestampRef.current = latest.created_at;
      }

      // Check if the service was ended by the attendant
      if (result.queueStatus === "completed") {
        setIsServiceEnded(true);
        setIsLiveChat(false);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch (err) {
      console.error("Poll error:", err);
    }
  }, []);

  // Start/stop polling when in live chat
  useEffect(() => {
    if (isLiveChat && queueItemId) {
      pollMessages(queueItemId);
      pollingRef.current = setInterval(() => pollMessages(queueItemId), 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isLiveChat, queueItemId, pollMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  const getCurrentStep = () => TRIAGE_STEPS[currentStepIndex];

  const getOptionsForStep = (step: typeof TRIAGE_STEPS[0]) => {
    if (step.key === "category") {
      const type = collectedData.type || "Reclamação";
      return CATEGORY_MAP[type] || CATEGORY_MAP["Reclamação"];
    }
    return step.options;
  };

  const interpretWithAI = async (answer: string, step: typeof TRIAGE_STEPS[0]) => {
    try {
      const conversationHistory = messages.map((m) => ({ role: m.role, content: m.content }));
      const response = await fetch(`${EXT_SUPABASE_URL}/functions/v1/chatbot-interpret`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${EXT_ANON_KEY}`,
          "apikey": EXT_ANON_KEY,
        },
        body: JSON.stringify({
          userMessage: answer,
          currentStep: step.key,
          conversationHistory,
          collectedSoFar: collectedData,
        }),
      });
      if (!response.ok) {
        console.error("AI interpret HTTP error:", response.status);
        return null;
      }
      const data = await response.json();
      return data?.extracted || null;
    } catch (e) {
      console.error("AI interpret exception:", e);
      return null;
    }
  };

  const processAnswer = async (answer: string) => {
    // Add user message
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: answer, timestamp: new Date() },
    ]);

    const step = getCurrentStep();

    // Handle greeting step
    if (step.key === "greeting") {
      if (answer.toLowerCase().includes("formulário") || answer.toLowerCase().includes("formulario")) {
        onBack();
        return;
      }

      // For free-text during greeting, try AI interpretation to extract data upfront
      setIsTyping(true);
      const extracted = await interpretWithAI(answer, step);
      setIsTyping(false);

      const newData = { ...collectedData };
      if (extracted) {
        if (extracted.go_back) { onBack(); return; }
        if (extracted.wants_transfer) { await transferToHuman(); return; }
        if (extracted.type) newData.type = extracted.type;
        if (extracted.category) newData.category = extracted.category;
        if (extracted.description) newData.description = extracted.description;
        if (extracted.location) newData.location = extracted.location;
        if (extracted.involved_parties) newData.involved_parties = extracted.involved_parties;
        if (extracted.reporter_name) newData.reporter_name = extracted.reporter_name;
        if (extracted.reporter_email) newData.reporter_email = extracted.reporter_email;
        if (extracted.reporter_phone) newData.reporter_phone = extracted.reporter_phone;
        if (extracted.is_anonymous !== undefined) newData.is_anonymous = extracted.is_anonymous;
        if (extracted.wants_to_identify) newData.is_anonymous = false;
      }
      setCollectedData(newData);

      // Find the next unanswered step (skip steps with already extracted data)
      let nextIndex = 1; // skip greeting
      while (nextIndex < TRIAGE_STEPS.length) {
        const nextStep = TRIAGE_STEPS[nextIndex];
        if (nextStep.key === "confirm") break;
        if (nextStep.key === "type" && newData.type) { nextIndex++; continue; }
        if (nextStep.key === "category" && newData.category) { nextIndex++; continue; }
        if (nextStep.key === "description" && newData.description) { nextIndex++; continue; }
        if (nextStep.key === "location" && newData.location) { nextIndex++; continue; }
        if (nextStep.key === "involved" && newData.involved_parties) { nextIndex++; continue; }
        if (nextStep.key === "anonymous" && newData.is_anonymous !== undefined) {
          if (newData.is_anonymous) { nextIndex = TRIAGE_STEPS.findIndex(s => s.key === "confirm"); break; }
          nextIndex++; continue;
        }
        if (nextStep.key === "name" && newData.reporter_name) { nextIndex++; continue; }
        if (nextStep.key === "email" && newData.reporter_email) { nextIndex++; continue; }
        if (nextStep.key === "phone" && newData.reporter_phone) { nextIndex++; continue; }
        break;
      }

      setCurrentStepIndex(nextIndex);
      if (nextIndex < TRIAGE_STEPS.length) {
        const nextStep = TRIAGE_STEPS[nextIndex];
        if (nextStep.key === "confirm") {
          const typeLabel = newData.type || "N/A";
          const catLabel = newData.category || "N/A";
          const summary = (newData.description || "").substring(0, 80);
          const confirmMsg = `Resumo da sua manifestação:\n\n📋 Tipo: ${typeLabel}\n📂 Categoria: ${catLabel}\n📝 Descrição: ${summary}${summary.length >= 80 ? "..." : ""}\n👤 ${newData.is_anonymous ? "Anônimo" : newData.reporter_name || ""}\n\nDeseja confirmar o envio?`;
          addBotMessage(confirmMsg);
        } else if (nextIndex > 1 && Object.keys(newData).length > 0) {
          // Acknowledge extracted data before asking next question
          addBotMessage(`Entendi! ${nextStep.botMessage}`);
        } else {
          addBotMessage(nextStep.botMessage);
        }
      }
      return;
    }

    if (step.key === "confirm") {
      if (answer === "Cancelar" || answer.toLowerCase().includes("cancel")) {
        addBotMessage("Tudo bem, sua manifestação não foi enviada. Você pode recomeçar quando quiser.");
        return;
      }
      await submitComplaint();
      return;
    }

    // Use AI to interpret the message and extract all possible fields
    setIsTyping(true);
    const extracted = await interpretWithAI(answer, step);
    setIsTyping(false);

    const newData = { ...collectedData };

    if (extracted) {
      if (extracted.go_back) {
        onBack();
        return;
      }

      if (extracted.wants_transfer) {
        await transferToHuman();
        return;
      }

      if (extracted.type) newData.type = extracted.type;
      if (extracted.category) newData.category = extracted.category;
      if (extracted.description) newData.description = extracted.description;
      if (extracted.location) newData.location = extracted.location;
      if (extracted.involved_parties && !extracted.skip_field) newData.involved_parties = extracted.involved_parties;
      if (extracted.reporter_name) newData.reporter_name = extracted.reporter_name;
      if (extracted.reporter_email) newData.reporter_email = extracted.reporter_email;
      if (extracted.reporter_phone) newData.reporter_phone = extracted.reporter_phone;

      if (extracted.is_anonymous === true) {
        newData.is_anonymous = true;
      } else if (extracted.is_anonymous === false || extracted.wants_to_identify === true) {
        newData.is_anonymous = false;
      }

      if (step.field && !extracted.skip_field) {
        if (step.key === "anonymous") {
          if (extracted.is_anonymous === undefined && extracted.wants_to_identify === undefined) {
            newData.is_anonymous = answer.toLowerCase().includes("anonimato") || answer.toLowerCase().includes("anônim");
          }
        } else if (step.key === "type" && !extracted.type) {
          (newData as any)[step.field] = answer;
        } else if (step.key === "category" && !extracted.category) {
          (newData as any)[step.field] = answer;
        } else if (!extracted[step.field as keyof typeof extracted] && step.field !== "is_anonymous") {
          (newData as any)[step.field] = answer;
        }
      }
    } else {
      if (step.field) {
        if (step.key === "anonymous") {
          newData.is_anonymous = answer.toLowerCase().includes("anonimato") || answer.toLowerCase().includes("anônim");
        } else if (answer !== "Pular") {
          (newData as any)[step.field] = answer;
        }
      }
    }

    setCollectedData(newData);

    // Find next unanswered step
    let nextIndex = currentStepIndex + 1;

    if (step.key === "anonymous" && newData.is_anonymous) {
      nextIndex = TRIAGE_STEPS.findIndex((s) => s.key === "confirm");
    } else {
      while (nextIndex < TRIAGE_STEPS.length) {
        const nextStep = TRIAGE_STEPS[nextIndex];
        if (nextStep.key === "confirm") break;

        if (nextStep.key === "anonymous" && newData.is_anonymous !== undefined) {
          if (newData.is_anonymous) {
            nextIndex = TRIAGE_STEPS.findIndex((s) => s.key === "confirm");
            break;
          }
          nextIndex++;
          continue;
        }

        if (nextStep.key === "location" && newData.location) { nextIndex++; continue; }
        if (nextStep.key === "involved" && newData.involved_parties) { nextIndex++; continue; }
        if (nextStep.key === "name" && newData.reporter_name) { nextIndex++; continue; }
        if (nextStep.key === "email" && newData.reporter_email) { nextIndex++; continue; }
        if (nextStep.key === "phone" && newData.reporter_phone) { nextIndex++; continue; }

        break;
      }
    }

    if (nextIndex < TRIAGE_STEPS.length) {
      setCurrentStepIndex(nextIndex);
      const nextStep = TRIAGE_STEPS[nextIndex];

      if (nextStep.key === "confirm") {
        const typeLabel = newData.type || "N/A";
        const catLabel = newData.category || "N/A";
        const summary = (newData.description || "").substring(0, 80);
        const confirmMsg = `Resumo da sua manifestação:\n\n📋 Tipo: ${typeLabel}\n📂 Categoria: ${catLabel}\n📝 Descrição: ${summary}${summary.length >= 80 ? "..." : ""}\n👤 ${newData.is_anonymous ? "Anônimo" : newData.reporter_name || ""}\n\nDeseja confirmar o envio?`;
        addBotMessage(confirmMsg);
      } else {
        addBotMessage(nextStep.botMessage);
      }
    }
  };

  const mapTypeToSlug = (type: string): string => {
    const map: Record<string, string> = {
      "Reclamação": "reclamacao",
      "Denúncia": "denuncia",
      "Sugestão": "sugestao",
    };
    return map[type] || type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ç]/g, "c");
  };

  const submitComplaint = async () => {
    setIsSubmitting(true);
    try {
      const { data: protocolData, error: protocolError } = await supabase.rpc("generate_complaint_protocol");
      if (protocolError) throw new Error("Erro ao gerar protocolo: " + protocolError.message);
      const protocol = protocolData as string;

      const typeSlug = mapTypeToSlug(collectedData.type || "Reclamação");

      const { data: complaintData, error: insertError } = await supabase
        .from("complaints")
        .insert({
          protocol_number: protocol,
          is_anonymous: collectedData.is_anonymous || false,
          reporter_name: collectedData.is_anonymous ? null : collectedData.reporter_name || null,
          reporter_email: collectedData.is_anonymous ? null : collectedData.reporter_email || null,
          reporter_phone: collectedData.is_anonymous ? null : collectedData.reporter_phone || null,
          type: typeSlug,
          category: collectedData.category || "Outro",
          description: collectedData.description || "",
          location: collectedData.location || null,
          involved_parties: collectedData.involved_parties || null,
          channel: "chatbot",
        })
        .select()
        .single();

      if (insertError) throw new Error("Erro ao registrar: " + insertError.message);

      await supabase.from("service_queue" as any).insert({
        channel: "chatbot",
        status: "waiting",
        priority: 3,
        customer_name: collectedData.is_anonymous ? "Anônimo" : collectedData.reporter_name || "Anônimo",
        customer_email: collectedData.is_anonymous ? null : collectedData.reporter_email || null,
        customer_phone: collectedData.is_anonymous ? null : collectedData.reporter_phone || null,
        subject: `${collectedData.type}: ${collectedData.category}`,
        last_message: (collectedData.description || "").substring(0, 100),
        complaint_id: complaintData?.id,
        waiting_since: new Date().toISOString(),
      });

      if (complaintData?.id) {
        supabase.functions.invoke("complaint-ai-triage", {
          body: {
            complaint_id: complaintData.id,
            description: collectedData.description,
            type: collectedData.type,
            category: collectedData.category,
            channel: "chatbot",
            reporter_name: collectedData.is_anonymous ? null : collectedData.reporter_name,
            is_anonymous: collectedData.is_anonymous,
            attachments: [],
          },
        }).catch(console.error);
      }

      addBotMessage(
        `✅ Sua manifestação foi registrada com sucesso!\n\n📋 Protocolo: **${protocol}**\n\nGuarde esse número para acompanhamento. ${
          !collectedData.is_anonymous && collectedData.reporter_email
            ? "Você também receberá uma confirmação por e-mail."
            : ""
        }\n\nSua solicitação já está na fila de atendimento e será analisada em breve.`
      );

      if (!collectedData.is_anonymous && collectedData.reporter_email) {
        fetch(`${EXT_SUPABASE_URL}/functions/v1/send-complaint-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${EXT_ANON_KEY}`,
            "apikey": EXT_ANON_KEY,
          },
          body: JSON.stringify({
            protocolNumber: protocol,
            email: collectedData.reporter_email,
            name: collectedData.reporter_name,
            type: collectedData.type,
            category: collectedData.category,
            description: collectedData.description,
            internalSource: "chatbot",
          }),
        }).catch(console.error);
      }

      onComplete(collectedData as TriageResult, protocol);
    } catch (error) {
      console.error("Submit error:", error);
      addBotMessage("❌ Ocorreu um erro ao registrar sua manifestação. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const transferToHuman = async () => {
    setIsSubmitting(true);
    try {
      // Check online attendants first
      const onlineCheck = await callPublicApi<{ count: number }>("checkOnlineAttendants", {});

      if (!onlineCheck || onlineCheck.count === 0) {
        addBotMessage(
          "No momento não há atendentes disponíveis. Sua solicitação será registrada e um atendente entrará em contato assim que possível."
        );
        return;
      }

      // Generate protocol
      const { data: protocolData, error: protocolError } = await supabase.rpc("generate_complaint_protocol");
      if (protocolError) throw new Error("Erro ao gerar protocolo: " + protocolError.message);
      const protocol = protocolData as string;

      const typeSlug = mapTypeToSlug(collectedData.type || "Reclamação");

      // Insert complaint
      const { data: complaintData, error: insertError } = await supabase
        .from("complaints")
        .insert({
          protocol_number: protocol,
          is_anonymous: collectedData.is_anonymous || false,
          reporter_name: collectedData.is_anonymous ? null : collectedData.reporter_name || null,
          reporter_email: collectedData.is_anonymous ? null : collectedData.reporter_email || null,
          reporter_phone: collectedData.is_anonymous ? null : collectedData.reporter_phone || null,
          type: typeSlug,
          category: collectedData.category || "Outro",
          description: collectedData.description || "Transferência solicitada pelo cliente durante o chat.",
          location: collectedData.location || null,
          involved_parties: collectedData.involved_parties || null,
          channel: "chatbot",
          status: "novo",
        })
        .select()
        .maybeSingle();

      if (insertError) throw new Error("Erro ao registrar: " + insertError.message);

      // Use chatbot-public createQueueEntry to handle round-robin and session creation
      const chatHistory = messages.map((m) => ({
        content: m.content,
        sender: m.role === "user" ? "user" : "bot",
        timestamp: m.timestamp.toISOString(),
      }));

      const result = await callPublicApi<{ queueId: string; assignedTo: string }>("createQueueEntry", {
        chatHistory,
        subject: `Transferência: ${collectedData.type || "Atendimento"} - ${collectedData.category || "Geral"}`,
        customerName: collectedData.is_anonymous ? "Anônimo" : collectedData.reporter_name || "Cliente",
        customerEmail: collectedData.is_anonymous ? null : collectedData.reporter_email || null,
        customerPhone: collectedData.is_anonymous ? null : collectedData.reporter_phone || null,
      });

      if (result?.queueId) {
        // Link the queue entry to the complaint
        await supabase.functions.invoke("chatbot-public", {
          body: {
            action: "linkQueueToComplaint",
            queueId: result.queueId,
            complaintId: complaintData?.id,
          },
        }).catch(console.error);

        setQueueItemId(result.queueId);
        lastPollTimestampRef.current = new Date().toISOString();
        setIsLiveChat(true);

        addBotMessage(
          `🔄 Transferindo para atendimento humano...\n\n📋 Protocolo: **${protocol}**\n\n${
            result.assignedTo
              ? `Você foi conectado ao atendente ${result.assignedTo}. Aguarde a resposta.`
              : "Um atendente irá assumir sua conversa em breve."
          }`
        );

        onTransfer?.(protocol);
      } else {
        addBotMessage(
          "No momento não há atendentes disponíveis. Sua solicitação foi registrada e será atendida em breve."
        );
      }
    } catch (error: any) {
      if (error?.code === "NO_ATTENDANTS_ONLINE") {
        addBotMessage(
          "No momento não há atendentes disponíveis. Sua solicitação será registrada e um atendente entrará em contato assim que possível."
        );
      } else {
        console.error("Transfer error:", error);
        addBotMessage("❌ Ocorreu um erro ao transferir. Tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Send message to agent during live chat
  const sendLiveChatMessage = async (text: string) => {
    if (!queueItemId || !text.trim()) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text, timestamp: new Date() },
    ]);

    try {
      await callPublicApi("sendCustomerMessage", {
        queueId: queueItemId,
        content: text,
      });
    } catch (err) {
      console.error("Error sending live message:", err);
      addBotMessage("Erro ao enviar mensagem. Tente novamente.");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isSubmitting || isTyping) return;

    if (isLiveChat) {
      sendLiveChatMessage(inputValue.trim());
      setInputValue("");
      inputRef.current?.focus();
      return;
    }

    processAnswer(inputValue.trim());
    setInputValue("");
    inputRef.current?.focus();
  };

  const handleOptionClick = (option: string) => {
    if (isSubmitting || isTyping) return;
    processAnswer(option);
  };

  const step = getCurrentStep();
  const currentOptions = step ? getOptionsForStep(step) : null;
  const showInput = !currentOptions || currentOptions.length === 0;
  const isFinished = messages.some((m) => m.content.includes("Protocolo:") && m.content.includes("registrada com sucesso"));
  const isTransferred = isLiveChat || messages.some((m) => m.content.includes("Transferindo para atendimento"));

  // Determine header status
  const headerTitle = isLiveChat
    ? "Atendente"
    : "Max - Assistente de Triagem";
  const headerStatus = isSubmitting
    ? "Processando..."
    : isServiceEnded
    ? "Atendimento encerrado"
    : isLiveChat
    ? "Conectado com atendente"
    : isFinished
    ? "Concluído"
    : "Online";

  return (
    <div className="flex flex-col h-[70vh] max-h-[600px] -mx-6 -my-6 md:-mx-8 md:-my-8">
      {/* Header */}
      <div className={cn(
        "flex items-center gap-3 p-4 border-b text-white rounded-t-lg",
        isLiveChat
          ? "bg-gradient-to-r from-primary to-primary/80"
          : "bg-gradient-to-r from-emerald-600 to-teal-600"
      )}>
        {!isLiveChat && (
          <button onClick={onBack} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
          {isLiveChat ? (
            <Headset className="w-6 h-6" />
          ) : (
            <img src="/images/max-avatar.png" alt="Max" className="w-10 h-10 rounded-full object-cover" />
          )}
        </div>
        <div>
          <h2 className="font-semibold text-sm">{headerTitle}</h2>
          <p className="text-xs opacity-80">{headerStatus}</p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4 bg-slate-50">
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex gap-2", message.role === "user" ? "justify-end" : "justify-start")}
            >
              {message.role !== "user" && (
                message.role === "agent" ? (
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Headset className="w-4 h-4 text-primary" />
                  </div>
                ) : (
                  <img src="/images/max-avatar.png" alt="Max" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-1" />
                )
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                  message.role === "user"
                    ? "bg-emerald-600 text-white rounded-br-md"
                    : message.role === "agent"
                    ? "bg-primary/10 border border-primary/20 rounded-bl-md shadow-sm"
                    : "bg-white border border-slate-200 rounded-bl-md shadow-sm"
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                <span className="text-[10px] opacity-50 mt-1 block">
                  {message.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {message.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="w-4 h-4 text-slate-600" />
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-2 justify-start">
              <img src="/images/max-avatar.png" alt="Max" className="w-7 h-7 rounded-full object-cover" />
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {/* Waiting for attendant indicator (transferred but not yet in live chat) */}
          {isTransferred && !isLiveChat && !isServiceEnded && (
            <div className="flex gap-2 justify-start">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Headset className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Aguardando resposta do atendente...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* NPS Survey - ONLY after attendant ends the service */}
      {isServiceEnded && (
        <div className="border-t bg-white p-3 rounded-b-lg">
          <NPSSurvey
            channel="chatbot"
            respondentName={collectedData.reporter_name}
            respondentEmail={collectedData.reporter_email}
          />
        </div>
      )}

      {/* Live chat input */}
      {isLiveChat && !isServiceEnded && (
        <div className="border-t bg-white p-3 rounded-b-lg">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Digite sua mensagem para o atendente..."
              className="flex-1 text-sm"
            />
            <Button
              type="submit"
              size="icon"
              className="bg-primary hover:bg-primary/90"
              disabled={!inputValue.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      )}

      {/* Bot triage options / Input */}
      {!isFinished && !isTransferred && !isLiveChat && !isServiceEnded && (
        <div className="border-t bg-white p-3 rounded-b-lg">
          {currentOptions && currentOptions.length > 0 && !isTyping && (
            <div className="flex flex-wrap gap-2 mb-2">
              {currentOptions.map((option) => (
                <Button
                  key={option}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-400"
                  onClick={() => handleOptionClick(option)}
                  disabled={isSubmitting}
                >
                  {option}
                </Button>
              ))}
              {currentStepIndex > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 border-blue-200 hover:bg-blue-50 hover:border-blue-400 text-blue-700"
                  onClick={() => transferToHuman()}
                  disabled={isSubmitting}
                >
                  <Headphones className="w-3 h-3 mr-1" />
                  Falar com atendente
                </Button>
              )}
            </div>
          )}
          {(showInput || (currentOptions && currentOptions.length > 0)) && (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Digite sua resposta..."
                disabled={isSubmitting || isTyping}
                className="flex-1 text-sm"
              />
              <Button
                type="submit"
                size="icon"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={isSubmitting || isTyping || !inputValue.trim()}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}