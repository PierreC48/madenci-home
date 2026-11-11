import { supabaseAdmin, isSupabaseConfigured } from './supabaseServer';

const COOKIE_NAME = 'aile_session';
const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

export function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...v] = c.trim().split('=');
      return [key, decodeURIComponent(v.join('='))];
    })
  );
}

export function createSessionCookie(token) {
  const isProd = process.env.NODE_ENV === 'production';
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${NINETY_DAYS_SECONDS}; HttpOnly; SameSite=Lax; ${
    isProd ? 'Secure;' : ''
  }`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax;`;
}

export async function getSession(request) {
  if (!isSupabaseConfigured()) {
    return {
      error: 'Supabase ayarları henüz yapılmadı. Lütfen .env.local dosyasına Supabase URL ve Anon Key ekleyin.',
      unconfigured: true,
    };
  }

  const cookieHeader = request.headers.get('cookie');
  const cookies = parseCookies(cookieHeader);
  const token =
    cookies[COOKIE_NAME] ||
    request.headers.get('x-aile-token') ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (!token) {
    return { session: null, member: null, family: null };
  }

  const { data: member, error: memberError } = await supabaseAdmin
    .from('family_members')
    .select('*')
    .eq('token', token)
    .gt('expires', new Date().toISOString())
    .single();

  if (memberError || !member) {
    return { session: null, member: null, family: null };
  }

  const { data: family, error: familyError } = await supabaseAdmin
    .from('families')
    .select('*')
    .eq('id', member.family_id)
    .single();

  if (familyError || !family) {
    return { session: null, member: null, family: null };
  }

  // Update last seen timestamp in background
  supabaseAdmin
    .from('family_members')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', member.id)
    .then(() => {});

  return { member, family };
}
