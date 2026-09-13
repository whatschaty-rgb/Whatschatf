-- ============================================================
-- WhatsChat - Supabase Schema
-- Execute este script no SQL Editor do seu projeto Supabase
-- ============================================================

-- 0. EXTENSOES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABELA: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  full_name   TEXT        NOT NULL DEFAULT '',
  avatar_url  TEXT,
  status_msg  TEXT        NOT NULL DEFAULT 'Disponivel',
  role        TEXT        NOT NULL DEFAULT 'user',
  is_approved BOOLEAN     NOT NULL DEFAULT TRUE,
  is_online   BOOLEAN     NOT NULL DEFAULT FALSE,
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABELA: system_settings
CREATE TABLE IF NOT EXISTS public.system_settings (
  key         TEXT        PRIMARY KEY,
  value       JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABELA: conversations
CREATE TABLE IF NOT EXISTS public.conversations (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  is_group    BOOLEAN     NOT NULL DEFAULT FALSE,
  name        TEXT,
  avatar_url  TEXT,
  created_by  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABELA: participants
CREATE TABLE IF NOT EXISTS public.participants (
  conversation_id UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

-- 4. TABELA: messages
CREATE TYPE public.media_type_enum AS ENUM ('text', 'image', 'audio');

CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID             NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       UUID             NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  content         TEXT,
  media_url       TEXT,
  media_type      media_type_enum  NOT NULL DEFAULT 'text',
  is_read         BOOLEAN          NOT NULL DEFAULT FALSE,
  is_edited       BOOLEAN          NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_participants_user     ON public.participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_conv     ON public.participants(conversation_id);

-- 5. TRIGGER: criar profile automatico ao signup (novos usuarios entram pendentes de aprovacao)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'user',
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 6. TRIGGER: atualizar updated_at em profiles
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- 7. HELPER FUNCTIONS FOR RLS (avoid recursion)
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id UUID, u_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.participants
    WHERE conversation_id = conv_id AND user_id = u_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_creator(conv_id UUID, u_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = conv_id AND created_by = u_id
  );
$$;

-- 8. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages      ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- conversations
CREATE POLICY "conversations_select"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR
    public.is_conversation_participant(id, auth.uid())
  );

CREATE POLICY "conversations_insert"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "conversations_update"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_conversation_participant(id, auth.uid()))
  WITH CHECK (created_by = auth.uid() OR public.is_conversation_participant(id, auth.uid()));

CREATE POLICY "conversations_delete"
  ON public.conversations FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR
    public.is_conversation_participant(id, auth.uid())
  );

-- participants
CREATE POLICY "participants_select"
  ON public.participants FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    public.is_conversation_participant(conversation_id, auth.uid())
    OR
    public.is_conversation_creator(conversation_id, auth.uid())
  );

CREATE POLICY "participants_insert"
  ON public.participants FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR
    public.is_conversation_creator(conversation_id, auth.uid())
    OR
    public.is_conversation_participant(conversation_id, auth.uid())
  );

CREATE POLICY "participants_delete"
  ON public.participants FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    public.is_conversation_creator(conversation_id, auth.uid())
  );

-- messages
CREATE POLICY "messages_select"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    public.is_conversation_participant(conversation_id, auth.uid())
  );

CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND
    public.is_conversation_participant(conversation_id, auth.uid())
  );

CREATE POLICY "messages_update"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid()
  );

CREATE POLICY "messages_delete"
  ON public.messages FOR DELETE
  TO authenticated
  USING (
    sender_id = auth.uid()
  );

-- 8. STORAGE BUCKET: chat-media
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "storage_authenticated_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "storage_authenticated_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-media');
