// ============================================================
// supabaseClient.js - Configuração do Cliente Supabase
// Substitua os valores abaixo pelas suas credenciais Supabase
// Project Settings > API > Project URL & anon public key
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ⚠️ ATENÇÃO: Substitua pelos seus valores reais do projeto Supabase
const SUPABASE_URL = 'https://akfaeqtilrpzafojenrp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZSu4tM6GW-2GHesPmsR-HA_b6fnlow-';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Helper: retorna a sessão atual ou null
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Helper: retorna o usuario autenticado atual ou null
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Helper: URL publica ou assinada de arquivo no Storage
export async function getSignedUrl(path, bucket = 'chat-media', expiresIn = 3600) {
  try {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (data?.publicUrl) return data.publicUrl;
  } catch (e) { /* fallback */ }
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

// Helper: upload de arquivo para o Storage
export async function uploadFile(bucket, path, file, contentType) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType,
      upsert: false,
    });
  if (error) throw error;
  return data.path;
}
