import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabaseServer';
import { getSession, createSessionCookie } from '@/lib/auth';

function generateRandomCode(prefix = '', length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix ? `${prefix}-${result}` : result;
}

async function logNotification(familyId, actorName, type, kind, itemName) {
  try {
    await supabaseAdmin.from('notification_events').insert({
      family_id: familyId,
      actor_name: actorName,
      type: type,
      kind: kind || null,
      item_name: itemName,
    });
  } catch (err) {
    console.error('Notification log error:', err);
  }
}

async function getFullHomeData(familyId, member) {
  // Fetch active items
  const { data: items } = await supabaseAdmin
    .from('items')
    .select('*')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // Fetch trash (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: trash } = await supabaseAdmin
    .from('items')
    .select('*')
    .eq('family_id', familyId)
    .not('deleted_at', 'is', null)
    .gte('deleted_at', sevenDaysAgo)
    .order('deleted_at', { ascending: false })
    .limit(50);

  // Fetch recent notification events
  const { data: events } = await supabaseAdmin
    .from('notification_events')
    .select('*')
    .eq('family_id', familyId)
    .order('id', { ascending: false })
    .limit(100);

  // Fetch preferences
  const { data: prefRow } = await supabaseAdmin
    .from('notification_preferences')
    .select('preferences')
    .eq('family_id', familyId)
    .eq('user_name', member.name)
    .maybeSingle();

  const preferences = prefRow?.preferences || {
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

  const { data: family } = await supabaseAdmin
    .from('families')
    .select('*')
    .eq('id', familyId)
    .single();

  return {
    family: {
      id: family.id,
      name: family.name,
      autoStock: family.auto_stock,
    },
    userId: member.id,
    me: member.name,
    isAdmin: member.is_admin,
    items: items || [],
    trash: trash || [],
    events: events || [],
    preferences,
  };
}

export async function GET(request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      family: null,
      sessionEnded: false,
      notice: 'Supabase URL ve Anon Key tanımlanmamış. .env.local dosyasını kontrol edin.',
    });
  }

  const { member, family } = await getSession(request);
  if (!member || !family) {
    return NextResponse.json({ family: null, sessionEnded: false });
  }

  try {
    const homeData = await getFullHomeData(family.id, member);
    return NextResponse.json(homeData);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase bağlantısı henüz yapılandırılmadı. Lütfen .env.local dosyasına bilgilerinizi girin.' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz veri gönderildi.' }, { status: 400 });
  }

  const { action } = body;

  // 1. CREATE NEW FAMILY
  if (action === 'create') {
    const familyName = (body.familyName || 'Bizim Ev').trim();
    const memberName = (body.name || 'Yönetici').trim();

    if (!familyName || !memberName) {
      return NextResponse.json({ error: 'Lütfen ailenizin adını ve kendi adınızı girin.' }, { status: 400 });
    }

    const inviteCode = generateRandomCode('EV', 6);
    const recoveryCode = generateRandomCode('YON', 8);

    const { data: family, error: familyError } = await supabaseAdmin
      .from('families')
      .insert({
        name: familyName,
        invite_code: inviteCode,
        invites_enabled: true,
        recovery_code: recoveryCode,
        auto_stock: false,
      })
      .select()
      .single();

    if (familyError) {
      return NextResponse.json({ error: 'Aile oluşturulamadı: ' + familyError.message }, { status: 500 });
    }

    const token = crypto.randomUUID();
    const { data: member, error: memberError } = await supabaseAdmin
      .from('family_members')
      .insert({
        family_id: family.id,
        name: memberName,
        device_name: 'Ana Cihaz',
        token,
        is_admin: true,
      })
      .select()
      .single();

    if (memberError) {
      return NextResponse.json({ error: 'Üye oluşturulamadı: ' + memberError.message }, { status: 500 });
    }

    // Default starter lists
    await supabaseAdmin.from('custom_lists').insert([
      {
        family_id: family.id,
        name: 'Haftalık Market',
        entries: [
          { name: 'Süt', quantity: '2 litre', category: 'Süt & Kahvaltı' },
          { name: 'Yumurta', quantity: '1 koli', category: 'Süt & Kahvaltı' },
          { name: 'Ekmek', quantity: '2 adet', category: 'Temel Gıda' },
          { name: 'Peynir', quantity: '500 g', category: 'Süt & Kahvaltı' },
          { name: 'Zeytin', quantity: '1 kavanoz', category: 'Süt & Kahvaltı' },
          { name: 'Yoğurt', quantity: '1 kova', category: 'Süt & Kahvaltı' },
        ],
      },
      {
        family_id: family.id,
        name: 'Temizlik İhtiyaçları',
        entries: [
          { name: 'Bulaşık deterjanı', quantity: '1 adet', category: 'Temizlik' },
          { name: 'Çamaşır deterjanı', quantity: '1 adet', category: 'Temizlik' },
          { name: 'Yüzey temizleyici', quantity: '1 adet', category: 'Temizlik' },
          { name: 'Çöp poşeti', quantity: '2 rulo', category: 'Temizlik' },
        ],
      },
    ]);

    await logNotification(family.id, memberName, 'add', 'family', `${familyName} oluşturuldu.`);

    const homeData = await getFullHomeData(family.id, member);
    const response = NextResponse.json({ ...homeData, recoveryCode });
    response.headers.set('Set-Cookie', createSessionCookie(token));
    return response;
  }

  // 2. JOIN EXISTING FAMILY VIA INVITE CODE
  if (action === 'join') {
    const code = (body.code || '').trim().toUpperCase();
    const memberName = (body.name || '').trim();

    if (!code || !memberName) {
      return NextResponse.json({ error: 'Lütfen adınızı ve aile davet kodunu girin.' }, { status: 400 });
    }

    const { data: family, error: familyError } = await supabaseAdmin
      .from('families')
      .select('*')
      .eq('invite_code', code)
      .maybeSingle();

    if (familyError || !family) {
      return NextResponse.json({ error: 'Davet kodu bulunamadı. Lütfen kodu kontrol edin.' }, { status: 404 });
    }

    if (!family.invites_enabled) {
      return NextResponse.json({ error: 'Bu aile için yeni üye davetleri kapatılmış.' }, { status: 403 });
    }

    const token = crypto.randomUUID();
    const { data: member, error: memberError } = await supabaseAdmin
      .from('family_members')
      .insert({
        family_id: family.id,
        name: memberName,
        device_name: 'Mobil / Web Cihaz',
        token,
        is_admin: false,
      })
      .select()
      .single();

    if (memberError) {
      return NextResponse.json({ error: 'Katılma işlemi başarısız: ' + memberError.message }, { status: 500 });
    }

    await logNotification(family.id, memberName, 'add', 'member', `${memberName} aileye katıldı.`);

    const homeData = await getFullHomeData(family.id, member);
    const response = NextResponse.json(homeData);
    response.headers.set('Set-Cookie', createSessionCookie(token));
    return response;
  }

  // 3. ADMIN RECOVERY
  if (action === 'recover') {
    const code = (body.code || '').trim().toUpperCase();
    if (!code) {
      return NextResponse.json({ error: 'Lütfen yönetici kurtarma kodunu girin.' }, { status: 400 });
    }

    const { data: family, error: familyError } = await supabaseAdmin
      .from('families')
      .select('*')
      .eq('recovery_code', code)
      .maybeSingle();

    if (familyError || !family) {
      return NextResponse.json({ error: 'Geçersiz kurtarma kodu.' }, { status: 404 });
    }

    const token = crypto.randomUUID();
    const { data: member, error: memberError } = await supabaseAdmin
      .from('family_members')
      .insert({
        family_id: family.id,
        name: 'Yönetici',
        device_name: 'Kurtarma Cihazı',
        token,
        is_admin: true,
      })
      .select()
      .single();

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    const homeData = await getFullHomeData(family.id, member);
    const response = NextResponse.json(homeData);
    response.headers.set('Set-Cookie', createSessionCookie(token));
    return response;
  }

  // AUTH REQUIRED FOR ALL FOLLOWING ACTIONS
  const { member, family } = await getSession(request);
  if (!member || !family) {
    return NextResponse.json({ error: 'Oturum süresi dolmuş. Lütfen tekrar giriş yapın.' }, { status: 401 });
  }

  // 4. ADD ITEM
  if (action === 'add') {
    const item = body.item || {};
    const itemId = item.id || crypto.randomUUID();

    const { error: insertErr } = await supabaseAdmin.from('items').upsert({
      id: itemId,
      family_id: family.id,
      name: item.name,
      quantity: item.quantity || '1 adet',
      category: item.category || 'Diğer',
      kind: item.kind || 'shop',
      status: item.status || 'var',
      bought: item.bought ? 1 : 0,
      note: item.note || '',
      unit_price_cents: item.unit_price_cents || null,
      count_milli: item.count_milli || 1000,
      deleted_at: null,
    });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    await logNotification(family.id, member.name, 'add', item.kind || 'shop', item.name);
    return NextResponse.json({ success: true, id: itemId });
  }

  // 5. UPDATE ITEM (Bought / Status)
  if (action === 'update') {
    const item = body.item || {};
    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (item.bought !== undefined) {
      updates.bought = item.bought ? 1 : 0;
      if (item.bought) {
        updates.claimed_by = null;
        updates.claimed_name = null;
      }
    }

    if (item.status !== undefined) {
      updates.status = item.status;
    }

    const { error: updateErr } = await supabaseAdmin
      .from('items')
      .update(updates)
      .eq('id', item.id)
      .eq('family_id', family.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    if (item.bought) {
      await logNotification(family.id, member.name, 'bought', item.kind, item.name);
    }

    // Auto-stock check: If marked 'azaldı' or 'bitti' and auto_stock is enabled
    if (family.auto_stock && (item.status === 'azaldı' || item.status === 'bitti')) {
      const { data: existingShop } = await supabaseAdmin
        .from('items')
        .select('id')
        .eq('family_id', family.id)
        .eq('kind', 'shop')
        .eq('bought', 0)
        .is('deleted_at', null)
        .ilike('name', item.name)
        .maybeSingle();

      if (!existingShop) {
        await supabaseAdmin.from('items').insert({
          id: crypto.randomUUID(),
          family_id: family.id,
          name: item.name,
          quantity: item.quantity || '1 adet',
          category: item.category || 'Diğer',
          kind: 'shop',
          status: 'var',
          bought: 0,
        });
        await logNotification(family.id, 'Stok Robotu', 'add', 'shop', `${item.name} (stok azaldığı için)`);
      }
    }

    return NextResponse.json({ success: true });
  }

  // 6. EDIT ITEM
  if (action === 'edit') {
    const item = body.item || {};
    const { error: editErr } = await supabaseAdmin
      .from('items')
      .update({
        name: item.name,
        quantity: item.quantity,
        category: item.category,
        note: item.note,
        unit_price_cents: item.unit_price_cents,
        count_milli: item.count_milli,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('family_id', family.id);

    if (editErr) {
      return NextResponse.json({ error: editErr.message }, { status: 500 });
    }

    await logNotification(family.id, member.name, 'edit', item.kind, item.name);
    return NextResponse.json({ success: true });
  }

  // 7. DELETE ITEM (Soft Delete / Move to Trash)
  if (action === 'delete') {
    const item = body.item || {};
    const { error: delErr } = await supabaseAdmin
      .from('items')
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('family_id', family.id);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    await logNotification(family.id, member.name, 'remove', item.kind, item.name);
    return NextResponse.json({ success: true });
  }

  // 8. RESTORE ITEM FROM TRASH
  if (action === 'restore') {
    const item = body.item || {};
    const { error: restErr } = await supabaseAdmin
      .from('items')
      .update({
        deleted_at: null,
      })
      .eq('id', item.id)
      .eq('family_id', family.id);

    if (restErr) {
      return NextResponse.json({ error: restErr.message }, { status: 500 });
    }

    await logNotification(family.id, member.name, 'add', item.kind, `${item.name} (geri getirildi)`);
    return NextResponse.json({ success: true });
  }

  // 9. CLAIM / UNCLAIM ITEM
  if (action === 'claim') {
    const item = body.item || {};
    await supabaseAdmin
      .from('items')
      .update({
        claimed_by: member.id,
        claimed_name: member.name,
      })
      .eq('id', item.id)
      .eq('family_id', family.id);

    const { data: currentItem } = await supabaseAdmin
      .from('items')
      .select('name')
      .eq('id', item.id)
      .single();

    await logNotification(family.id, member.name, 'claim', 'shop', currentItem?.name || 'Ürün');
    const homeData = await getFullHomeData(family.id, member);
    return NextResponse.json(homeData);
  }

  if (action === 'unclaim') {
    const item = body.item || {};
    await supabaseAdmin
      .from('items')
      .update({
        claimed_by: null,
        claimed_name: null,
      })
      .eq('id', item.id)
      .eq('family_id', family.id);

    const { data: currentItem } = await supabaseAdmin
      .from('items')
      .select('name')
      .eq('id', item.id)
      .single();

    await logNotification(family.id, member.name, 'unclaim', 'shop', currentItem?.name || 'Ürün');
    const homeData = await getFullHomeData(family.id, member);
    return NextResponse.json(homeData);
  }

  return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 });
}
