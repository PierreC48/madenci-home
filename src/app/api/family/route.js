import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabaseServer';
import { getSession, clearSessionCookie } from '@/lib/auth';

function generateRandomCode(prefix = '', length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix ? `${prefix}-${result}` : result;
}

async function getFamilyDetails(family, member) {
  const { data: devices } = await supabaseAdmin
    .from('family_members')
    .select('id, name, device_name, expires')
    .eq('family_id', family.id)
    .gt('expires', new Date().toISOString())
    .order('created_at', { ascending: false });

  return {
    isAdmin: member.is_admin,
    inviteCode: family.invite_code,
    invitesEnabled: family.invites_enabled,
    currentSessionId: member.id,
    devices: devices || [],
  };
}

export async function GET(request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase ayarları eksik.' }, { status: 500 });
  }

  const { member, family } = await getSession(request);
  if (!member || !family) {
    return NextResponse.json({ error: 'Oturum açılmamış.' }, { status: 401 });
  }

  const details = await getFamilyDetails(family, member);
  return NextResponse.json(details);
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

  // 1. LOGOUT
  if (action === 'logout') {
    await supabaseAdmin.from('family_members').delete().eq('id', member.id);
    const response = NextResponse.json({ success: true });
    response.headers.set('Set-Cookie', clearSessionCookie());
    return response;
  }

  // 2. ROTATE INVITE CODE (Admin only)
  if (action === 'rotate-invite') {
    if (!member.is_admin) {
      return NextResponse.json({ error: 'Bu işlem için yönetici yetkisi gerekiyor.' }, { status: 403 });
    }
    const newCode = generateRandomCode('EV', 6);
    const { data: updatedFamily, error } = await supabaseAdmin
      .from('families')
      .update({ invite_code: newCode, updated_at: new Date().toISOString() })
      .eq('id', family.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const details = await getFamilyDetails(updatedFamily, member);
    return NextResponse.json(details);
  }

  // 3. TOGGLE INVITES
  if (action === 'toggle-invites') {
    if (!member.is_admin) {
      return NextResponse.json({ error: 'Bu işlem için yönetici yetkisi gerekiyor.' }, { status: 403 });
    }
    const enabled = Boolean(body.enabled);
    const { data: updatedFamily, error } = await supabaseAdmin
      .from('families')
      .update({ invites_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('id', family.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const details = await getFamilyDetails(updatedFamily, member);
    return NextResponse.json(details);
  }

  // 4. NEW RECOVERY CODE (Admin only)
  if (action === 'recovery-code') {
    if (!member.is_admin) {
      return NextResponse.json({ error: 'Bu işlem için yönetici yetkisi gerekiyor.' }, { status: 403 });
    }
    const newRecovery = generateRandomCode('YON', 8);
    const { data: updatedFamily, error } = await supabaseAdmin
      .from('families')
      .update({ recovery_code: newRecovery, updated_at: new Date().toISOString() })
      .eq('id', family.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const details = await getFamilyDetails(updatedFamily, member);
    return NextResponse.json({ ...details, recoveryCode: newRecovery });
  }

  // 5. REVOKE DEVICE (Admin only)
  if (action === 'revoke-device') {
    if (!member.is_admin) {
      return NextResponse.json({ error: 'Bu işlem için yönetici yetkisi gerekiyor.' }, { status: 403 });
    }
    const targetId = body.id;
    if (targetId) {
      await supabaseAdmin
        .from('family_members')
        .delete()
        .eq('id', targetId)
        .eq('family_id', family.id);
    }
    const details = await getFamilyDetails(family, member);
    return NextResponse.json(details);
  }

  return NextResponse.json({ error: 'Bilinmeyen işlem.' }, { status: 400 });
}
