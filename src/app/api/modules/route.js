import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabaseServer';
import { getSession } from '@/lib/auth';

async function logNotification(familyId, actorName, type, kind, itemName) {
  try {
    await supabaseAdmin.from('notification_events').insert({
      family_id: familyId,
      actor_name: actorName,
      type,
      kind: kind || null,
      item_name: itemName,
    });
  } catch (err) {
    console.error('Notification log error:', err);
  }
}

async function getModulesData(familyId) {
  const [
    { data: favorites },
    { data: lists },
    { data: calendar },
    { data: bills },
    { data: payments },
    { data: documents },
  ] = await Promise.all([
    supabaseAdmin.from('favorites').select('*').eq('family_id', familyId).order('name'),
    supabaseAdmin.from('custom_lists').select('*').eq('family_id', familyId).order('name'),
    supabaseAdmin.from('calendar_events').select('*').eq('family_id', familyId).order('date').order('time'),
    supabaseAdmin.from('bills').select('*').eq('family_id', familyId).order('due_date'),
    supabaseAdmin.from('bill_payments').select('*').eq('family_id', familyId).order('occurrence', { ascending: false }).limit(30),
    supabaseAdmin.from('documents').select('*').eq('family_id', familyId).order('created_at', { ascending: false }),
  ]);

  return {
    favorites: favorites || [],
    lists: lists || [],
    calendar: calendar || [],
    bills: bills || [],
    payments: payments || [],
    documents: documents || [],
    remindersActive: true,
  };
}

const STARTER_LISTS = {
  weekly: {
    name: 'Haftalık market',
    entries: [
      { name: 'Süt', quantity: '2 litre', category: 'Süt & Kahvaltı' },
      { name: 'Yumurta', quantity: '1 koli', category: 'Süt & Kahvaltı' },
      { name: 'Ekmek', quantity: '2 adet', category: 'Temel Gıda' },
      { name: 'Peynir', quantity: '500 g', category: 'Süt & Kahvaltı' },
      { name: 'Zeytin', quantity: '1 kavanoz', category: 'Süt & Kahvaltı' },
      { name: 'Yoğurt', quantity: '1 kova', category: 'Süt & Kahvaltı' },
    ],
  },
  cleaning: {
    name: 'Temizlik ihtiyaçları',
    entries: [
      { name: 'Bulaşık deterjanı', quantity: '1 adet', category: 'Temizlik' },
      { name: 'Çamaşır deterjanı', quantity: '1 adet', category: 'Temizlik' },
      { name: 'Yüzey temizleyici', quantity: '1 adet', category: 'Temizlik' },
      { name: 'Çöp poşeti', quantity: '2 rulo', category: 'Temizlik' },
    ],
  },
  breakfast: {
    name: 'Kahvaltı listesi',
    entries: [
      { name: 'Domates', quantity: '1 kg', category: 'Meyve & Sebze' },
      { name: 'Salatalık', quantity: '1 kg', category: 'Meyve & Sebze' },
      { name: 'Beyaz peynir', quantity: '500 g', category: 'Süt & Kahvaltı' },
      { name: 'Kaşar peyniri', quantity: '400 g', category: 'Süt & Kahvaltı' },
      { name: 'Tereyağı', quantity: '250 g', category: 'Süt & Kahvaltı' },
    ],
  },
};

export async function GET(request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase ayarları eksik.' }, { status: 500 });
  }

  const { member, family } = await getSession(request);
  if (!member || !family) {
    return NextResponse.json({ error: 'Oturum açılmamış.' }, { status: 401 });
  }

  try {
    const data = await getModulesData(family.id);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
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

  // 1. FAVORITE SAVE
  if (action === 'favorite-save') {
    const { id } = body;
    const { data: item } = await supabaseAdmin.from('items').select('*').eq('id', id).single();
    if (item) {
      await supabaseAdmin.from('favorites').insert({
        family_id: family.id,
        name: item.name,
        quantity: item.quantity,
        category: item.category,
        unit_price_cents: item.unit_price_cents,
      });
      await logNotification(family.id, member.name, 'add', 'favorite', item.name);
    }
    const data = await getModulesData(family.id);
    return NextResponse.json(data);
  }

  // 2. FAVORITE REMOVE
  if (action === 'favorite-remove') {
    await supabaseAdmin.from('favorites').delete().eq('id', body.id).eq('family_id', family.id);
    const data = await getModulesData(family.id);
    return NextResponse.json(data);
  }

  // 3. FAVORITE USE (Add to shopping list)
  if (action === 'favorite-use') {
    const { data: fav } = await supabaseAdmin.from('favorites').select('*').eq('id', body.id).single();
    let added = 0;
    if (fav) {
      await supabaseAdmin.from('items').insert({
        id: crypto.randomUUID(),
        family_id: family.id,
        name: fav.name,
        quantity: fav.quantity,
        category: fav.category,
        unit_price_cents: fav.unit_price_cents,
        kind: 'shop',
        status: 'var',
        bought: 0,
      });
      added = 1;
      await logNotification(family.id, member.name, 'add', 'shop', fav.name);
    }
    const data = await getModulesData(family.id);
    return NextResponse.json({ ...data, added });
  }

  // 4. LIST SAVE
  if (action === 'list-save') {
    let entries = body.entries || [];
    if (body.fromCurrent) {
      const { data: activeItems } = await supabaseAdmin
        .from('items')
        .select('name, quantity, category')
        .eq('family_id', family.id)
        .eq('kind', 'shop')
        .eq('bought', 0)
        .is('deleted_at', null);
      if (activeItems) entries = activeItems;
    }

    const listId = body.id || crypto.randomUUID();
    await supabaseAdmin.from('custom_lists').upsert({
      id: listId,
      family_id: family.id,
      name: body.name || 'Yeni Liste',
      entries,
    });

    const data = await getModulesData(family.id);
    return NextResponse.json(data);
  }

  // 5. LIST DELETE
  if (action === 'list-delete') {
    await supabaseAdmin.from('custom_lists').delete().eq('id', body.id).eq('family_id', family.id);
    const data = await getModulesData(family.id);
    return NextResponse.json(data);
  }

  // 6. LIST USE (Add list items to shopping list)
  if (action === 'list-use') {
    let entries = [];
    if (body.starter && STARTER_LISTS[body.starter]) {
      entries = STARTER_LISTS[body.starter].entries;
    } else if (body.id) {
      const { data: l } = await supabaseAdmin.from('custom_lists').select('*').eq('id', body.id).single();
      if (l) entries = l.entries;
    }

    // Check existing unbought items to avoid duplicate additions
    const { data: existing } = await supabaseAdmin
      .from('items')
      .select('name')
      .eq('family_id', family.id)
      .eq('kind', 'shop')
      .eq('bought', 0)
      .is('deleted_at', null);

    const existingSet = new Set((existing || []).map((e) => e.name.toLowerCase()));
    let addedCount = 0;

    for (const ent of entries) {
      if (!existingSet.has(ent.name.toLowerCase())) {
        await supabaseAdmin.from('items').insert({
          id: crypto.randomUUID(),
          family_id: family.id,
          name: ent.name,
          quantity: ent.quantity || '1 adet',
          category: ent.category || 'Diğer',
          kind: 'shop',
          status: 'var',
          bought: 0,
        });
        existingSet.add(ent.name.toLowerCase());
        addedCount++;
      }
    }

    if (addedCount > 0) {
      await logNotification(family.id, member.name, 'add', 'shop', `${addedCount} adet hazır liste ürünü`);
    }

    const data = await getModulesData(family.id);
    return NextResponse.json({ ...data, added: addedCount });
  }

  // 7. CALENDAR EVENT SAVE
  if (action === 'event-save') {
    const eventId = body.id || crypto.randomUUID();
    const isNew = !body.id;

    await supabaseAdmin.from('calendar_events').upsert({
      id: eventId,
      family_id: family.id,
      title: body.title,
      date: body.date,
      time: body.time || '09:00',
      remind_days: Number(body.remind_days ?? 1),
      note: body.note || '',
    });

    await logNotification(family.id, member.name, 'calendar', isNew ? 'created' : 'updated', body.title);
    const data = await getModulesData(family.id);
    return NextResponse.json(data);
  }

  // 8. CALENDAR EVENT DELETE
  if (action === 'event-delete') {
    const { data: ev } = await supabaseAdmin.from('calendar_events').select('title').eq('id', body.id).single();
    await supabaseAdmin.from('calendar_events').delete().eq('id', body.id).eq('family_id', family.id);
    if (ev) {
      await logNotification(family.id, member.name, 'calendar', 'deleted', ev.title);
    }
    const data = await getModulesData(family.id);
    return NextResponse.json(data);
  }

  // 9. BILL SAVE
  if (action === 'bill-save') {
    const billId = body.id || crypto.randomUUID();
    const isNew = !body.id;

    await supabaseAdmin.from('bills').upsert({
      id: billId,
      family_id: family.id,
      title: body.title,
      amount_cents: Number(body.amount_cents || 0),
      due_date: body.due_date,
      recurrence: body.recurrence || 'monthly',
      remind_days: Number(body.remind_days ?? 3),
      note: body.note || '',
      paid: false,
    });

    await logNotification(family.id, member.name, 'bill', isNew ? 'created' : 'updated', body.title);
    const data = await getModulesData(family.id);
    return NextResponse.json(data);
  }

  // 10. BILL DELETE
  if (action === 'bill-delete') {
    const { data: b } = await supabaseAdmin.from('bills').select('title').eq('id', body.id).single();
    await supabaseAdmin.from('bills').delete().eq('id', body.id).eq('family_id', family.id);
    if (b) {
      await logNotification(family.id, member.name, 'bill', 'deleted', b.title);
    }
    const data = await getModulesData(family.id);
    return NextResponse.json(data);
  }

  // 11. BILL PAY
  if (action === 'bill-pay') {
    const { data: bill } = await supabaseAdmin.from('bills').select('*').eq('id', body.id).single();
    if (bill) {
      const occurrence = body.occurrence || bill.due_date;
      await supabaseAdmin.from('bill_payments').insert({
        family_id: family.id,
        bill_id: bill.id,
        title: bill.title,
        amount_cents: bill.amount_cents,
        occurrence,
      });

      if (bill.recurrence === 'monthly') {
        const [y, m, d] = bill.due_date.split('-').map(Number);
        const nextDate = new Date(y, m, d, 12);
        const nextDue = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(
          nextDate.getDate()
        ).padStart(2, '0')}`;
        await supabaseAdmin.from('bills').update({ due_date: nextDue, paid: false }).eq('id', bill.id);
      } else if (bill.recurrence === 'yearly') {
        const [y, m, d] = bill.due_date.split('-').map(Number);
        const nextDue = `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        await supabaseAdmin.from('bills').update({ due_date: nextDue, paid: false }).eq('id', bill.id);
      } else {
        await supabaseAdmin.from('bills').update({ paid: true }).eq('id', bill.id);
      }

      await logNotification(family.id, member.name, 'bill', 'paid', bill.title);
    }
    const data = await getModulesData(family.id);
    return NextResponse.json(data);
  }

  // 12. AUTO STOCK TOGGLE
  if (action === 'auto-stock') {
    const enabled = Boolean(body.enabled);
    await supabaseAdmin.from('families').update({ auto_stock: enabled }).eq('id', family.id);
    const data = await getModulesData(family.id);
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'Geçersiz modül işlemi.' }, { status: 400 });
}
