-- =========================================================================
-- 0009_ai_conversations.sql — chat sessions (web): continue / new / history
-- =========================================================================

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel public.sys_ai_channel not null default 'web',
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_conv_user on public.ai_conversations(user_id, organization_id, updated_at desc);

alter table public.ai_conversations enable row level security;
drop policy if exists "conv self" on public.ai_conversations;
create policy "conv self" on public.ai_conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- link messages to a conversation
alter table public.ai_messages add column if not exists conversation_id uuid
  references public.ai_conversations(id) on delete cascade;
create index if not exists idx_ai_messages_conv on public.ai_messages(conversation_id, created_at);
