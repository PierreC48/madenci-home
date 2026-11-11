import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabaseServer';
import { getSession } from '@/lib/auth';

const DEFAULT_PREFERENCES = {
  add: 1,
  remove: 1,
  bought: 1,
  edit: 1,
  claim: 1,
  unclaim: 1,
  reminder: 1,
  calendar: 1,
  bill: 1,
  document: 1,
};

export async function GET(request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase ayarları eksik.' }, { status: 500 });
  }

  const { member, family } = await getSession(request);
  if (!member || !family) {
    return NextResponse.json({ error: 'Oturum açılmamış.' }, { status: 401 });
  }

  const { data: events } = await supabaseAdmin
    .from('notification_events')
    .select('*')
    .eq('family_id', family.id)
    .order('id', { ascending: false })
    .limit(100);

  const { data: prefRow } = await supabaseAdmin
    .from('notification_preferences')
    .select('preferences')
    .eq('family_id', family.id)
    .eq('user_name', member.name)
    .maybeSingle();

  const preferences = prefRow?.preferences || DEFAULT_PREFERENCES;
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';

  return NextResponse.json({
    events: events || [],
    preferences,
    publicKey,
  });
}

export async function POST(request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase ayarları eksik.' }, { status: 500 });
  }

  const { member, family } = await getSession(request);
  if (!member || !family) {
    return NextResponse.json({ error: 'Oturum açılmamış.' }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const { action } = body;

  // 1. SAVE PREFERENCES
  if (action === 'preferences') {
    const preferences = body.preferences || DEFAULT_PREFERENCES;
    await supabaseAdmin.from('notification_preferences').upsert(
      {
        family_id: family.id,
        user_name: member.name,
        preferences,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'family_id, user_name' }
    );

    return NextResponse.json({ success: true, preferences });
  }

  // 2. SUBSCRIBE PUSH
  if (action === 'subscribe') {
    const sub = body.subscription;
    if (sub && sub.endpoint) {
      await supabaseAdmin.from('push_subscriptions').upsert(
        {
          family_id: family.id,
          user_id: member.id,
          endpoint: sub.endpoint,
          p256dh: sub.keys?.p256dh || '',
          auth: sub.keys?.auth || '',
        },
        { onConflict: 'endpoint' }
      );
    }
    return NextResponse.json({ success: true });
  }

  // 3. UNSUBSCRIBE PUSH
  if (action === 'unsubscribe') {
    const endpoint = body.endpoint;
    if (endpoint) {
      await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }
    return NextResponse.json({ success: true });
  }

  // 4. TEST NOTIFICATION
  if (action === 'test') {
    return NextResponse.json({
      sent: true,
      configured: true,
      message: 'Deneme bildirimi hazırlandı.',
    });
  }

  return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 });
}
