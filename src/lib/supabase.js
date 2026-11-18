// Cliente único do Supabase. As chaves são públicas por natureza: quem
// protege os dados são as regras (RLS) e as funções do banco.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const hasSupabase = !!(url && key);
export const supabase = hasSupabase ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

// mensagens do banco -> texto para o cliente
const MSG = {
  login_required: 'Entre na sua conta para finalizar.',
  estoque_insuficiente: 'Uma das peças acabou de esgotar.',
  variante_inexistente: 'Essa cor ou tamanho não está mais disponível.',
  produto_indisponivel: 'Uma das peças não está mais à venda.',
  desconto_acima_do_limite: 'Desconto acima do permitido.',
  acesso_negado: 'Você não tem permissão para isso.',
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail pelo link que enviamos.',
  'User already registered': 'Já existe uma conta com esse e-mail.',
  'Password should be at least 6 characters': 'A senha precisa ter pelo menos 6 caracteres.',
};
export function friendly(err) {
  const m = err?.message || String(err || '');
  for (const k in MSG) if (m.includes(k)) return k === 'estoque_insuficiente' ? m.replace('estoque_insuficiente:', 'Estoque insuficiente:') : MSG[k];
  return m || 'Algo deu errado. Tente de novo.';
}
