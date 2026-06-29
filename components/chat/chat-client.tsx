"use client";

import * as React from "react";
import {
  HistoryIcon,
  Loader2Icon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass/glass-card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/utils/supabase/client";
import { formatRelativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string; tokens?: number };
type Conversation = { id: string; title: string | null; updated_at: string };

const SUGGESTIONS = [
  { label: "Berapa total saldo saya?", prompt: "Berapa total saldo semua rekening saya sekarang?" },
  { label: "Pengeluaran terbesar bulan ini", prompt: "Apa pengeluaran terbesar saya bulan ini?" },
  { label: "Tagihan jatuh tempo dekat", prompt: "Tagihan apa saja yang jatuh tempo dalam 7 hari?" },
  { label: "Pemasukan vs pengeluaran", prompt: "Berapa pemasukan dan pengeluaran saya bulan ini?" },
];

export function ChatClient({ orgId }: { orgId: string }) {
  const supabase = createClient();
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  async function loadConversations(): Promise<Conversation[]> {
    try {
      const { data } = await supabase
        .from("ai_conversations")
        .select("id,title,updated_at")
        .eq("organization_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(50);
      const list = (data ?? []) as Conversation[];
      setConversations(list);
      return list;
    } catch {
      return [];
    }
  }

  async function loadMessages(convId: string) {
    try {
      const { data } = await supabase
        .from("ai_messages")
        .select("role,content")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true })
        .limit(100);
    const msgs = ((data ?? []) as Array<{ role: string; content: { text?: string } | string }>)
      .filter((r) => r.role === "user" || r.role === "assistant")
      .map((r) => ({
        role: r.role as "user" | "assistant",
        text: typeof r.content === "string" ? r.content : r.content?.text ?? "",
      }));
    setMessages(msgs);
    } catch {
      // silent — table may not exist yet
    }
  }

  // initial load: continue the latest conversation
  React.useEffect(() => {
    void (async () => {
      const list = await loadConversations();
      if (list.length > 0) {
        setConversationId(list[0].id);
        await loadMessages(list[0].id);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  function newChat() {
    setConversationId(null);
    setMessages([]);
    setHistoryOpen(false);
    setTimeout(() => taRef.current?.focus(), 0);
  }

  async function selectConversation(id: string) {
    setHistoryOpen(false);
    setConversationId(id);
    setLoading(true);
    await loadMessages(id);
    setLoading(false);
    setTimeout(() => taRef.current?.focus(), 0);
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || pending) return;
    setMessages((m) => [...m, { role: "user", text: t }]);
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setPending(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: { message: t, conversation_id: conversationId },
      });
      if (error) throw error;
      if (data?.conversation_id) setConversationId(data.conversation_id);
      const usage = data?.usage as
        | { input?: number; output?: number; recorded?: boolean; error?: string }
        | undefined;
      const tokens = Number(usage?.input ?? 0) + Number(usage?.output ?? 0);
      if (usage && !usage.recorded) {
        console.warn("[Sefine AI] usage tidak tercatat:", usage.error);
      }
      setMessages((m) => [
        ...m,
        { role: "assistant", text: (data?.reply as string) ?? "(tidak ada balasan)", tokens },
      ]);
      void loadConversations();
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Gagal menghubungi asisten";
      const friendly = raw.includes("Failed to fetch")
        ? "⚠️ Gagal terhubung ke server AI. Pastikan Edge Function 'ai-chat' sudah di-deploy di Supabase."
        : `⚠️ ${raw}`;
      setMessages((m) => [...m, { role: "assistant", text: friendly }]);
    } finally {
      setPending(false);
      setTimeout(() => taRef.current?.focus(), 0);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const showEmpty = !loading && messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col gap-3">
      {/* header */}
      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-sm">
          <SparklesIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading truncate text-lg leading-tight font-semibold">
            Asisten AI
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {conversationId ? "Lanjut percakapan" : "Percakapan baru"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Riwayat percakapan"
          onClick={() => setHistoryOpen(true)}
        >
          <HistoryIcon className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Percakapan baru"
          onClick={newChat}
        >
          <PlusIcon className="size-5" />
        </Button>
      </div>

      {/* messages */}
      <GlassCard className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : showEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow">
                <SparklesIcon className="size-7" />
              </div>
              <div>
                <p className="text-sm font-medium">Halo! Ada yang bisa saya bantu?</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pilih salah satu atau ketik sendiri:
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => send(s.prompt)}
                    className="glass-subtle rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <Bubble key={i} m={m} />)
          )}

          {pending && (
            <div className="flex items-end gap-2">
              <Avatar role="assistant" />
              <div className="glass-subtle flex items-center gap-1 rounded-2xl rounded-bl-md px-3 py-3">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {/* composer */}
      <form onSubmit={onSubmit} className="glass-strong flex items-end gap-2 rounded-2xl p-2">
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            autosize();
          }}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Tulis pesan… (Enter untuk kirim)"
          className="max-h-[120px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          size="icon"
          className="size-10 shrink-0 rounded-xl"
          disabled={pending || !input.trim()}
          aria-label="Kirim"
        >
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
        </Button>
      </form>

      {/* history sheet */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent
          side="bottom"
          className="glass-strong inset-x-0 mx-auto max-h-[80dvh] max-w-md overflow-y-auto rounded-b-none rounded-t-3xl p-0"
        >
          <SheetHeader className="px-5 pt-5">
            <SheetTitle className="text-lg">Riwayat percakapan</SheetTitle>
          </SheetHeader>
          <div className="space-y-1.5 px-3 pb-8 pt-2">
            <button
              type="button"
              onClick={newChat}
              className="glass flex w-full items-center gap-2 rounded-xl p-3 text-left text-sm font-medium transition active:scale-[0.99]"
            >
              <PlusIcon className="size-4 text-primary" /> Percakapan baru
            </button>
            {conversations.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                Belum ada riwayat.
              </p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl p-3 text-left transition active:scale-[0.99]",
                    c.id === conversationId ? "bg-primary/10 ring-1 ring-primary/30" : "glass",
                  )}
                >
                  <SparklesIcon className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {c.title || "(tanpa judul)"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatRelativeDay(c.updated_at)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  const isUser = m.role === "user";
  return (
    <div className={cn("flex items-end gap-2", isUser && "flex-row-reverse")}>
      <Avatar role={m.role} />
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "glass-subtle rounded-bl-md",
        )}
      >
        {m.text}
        {!isUser && m.tokens !== undefined && m.tokens > 0 && (
          <div className="mt-1 text-[0.65rem] opacity-60">{m.tokens} token</div>
        )}
      </div>
    </div>
  );
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  return role === "assistant" ? (
    <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-white">
      <SparklesIcon className="size-3.5" />
    </div>
  ) : (
    <div className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
      <UserIcon className="size-3.5" />
    </div>
  );
}
