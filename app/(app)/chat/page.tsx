import { ChatClient } from "@/components/chat/chat-client";
import { requireActiveOrg } from "@/lib/session";

export default async function ChatPage() {
  const ctx = await requireActiveOrg();
  return <ChatClient orgId={ctx.activeOrgId!} />;
}
