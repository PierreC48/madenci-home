import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabaseServer';
import { getSession } from '@/lib/auth';

async function getFuelData(familyId, month, vehicle) {
  // 1. Get distinct vehicles
  const { data: allLogs } = await supabaseAdmin
    .from('fuel_logs')
    .select('vehicle, date, liters_milli, amount_cents, deleted_at')
    .eq('family_id', familyId)
    .is('deleted_at', null);

  const vehicleSet = new Set();
  (allLogs || []).forEach((l) => {
    if (l.vehicle) vehicleSet.add(l.vehicle);
  });
  const vehicles = Array.from(vehicleSet).sort();

  // 2. Query entries for selected month & vehicle
  let query = supabaseAdmin
    .from('fuel_logs')
    .select('*')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .gte('date', `${month}-01`)
    .lte('date', `${month}-31`)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);

  if (vehicle) {
    query = query.eq('vehicle', vehicle);
  }

  const { data: entries } = await query;
  const list = entries || [];

  const totals = {
    liters_milli: list.reduce((sum, e) => sum + Number(e.liters_milli || 0), 0),
    amount_cents: list.reduce((sum, e) => sum + Number(e.amount_cents || 0), 0),
    count: list.length,
  };

  // 3. Last 6 active months summary
  const monthMap = {};
  (allLogs || []).forEach((l) => {
    if (!vehicle || l.vehicle === vehicle) {
      const m = l.date.slice(0, 7);
      if (!monthMap[m]) {
        monthMap[m] = { month: m, liters_milli: 0, amount_cents: 0 };
      }
      monthMap[m].liters_milli += Number(l.liters_milli || 0);
      monthMap[m].amount_cents += Number(l.amount_cents || 0);
    }
  });

  const monthly = Object.values(monthMap)
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 6);

  return {
    entries: list,
    totals,
    monthly,
    vehicles,
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

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = searchParams.get('month') || currentMonth;
  const vehicle = searchParams.get('vehicle') || '';

  try {
    const data = await getFuelData(family.id, month, vehicle);
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

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = searchParams.get('month') || currentMonth;
  const vehicleParam = searchParams.get('vehicle') || '';

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const { action } = body;

  if (action === 'save') {
    const id = body.id || crypto.randomUUID();
    const { error: saveErr } = await supabaseAdmin.from('fuel_logs').upsert({
      id,
      family_id: family.id,
      vehicle: body.vehicle,
      date: body.date,
      fuel_type: body.fuel_type || 'Benzin',
      liters_milli: Number(body.liters_milli || 0),
      amount_cents: Number(body.amount_cents || 0),
      odometer: body.odometer !== null && body.odometer !== undefined ? Number(body.odometer) : null,
      note: body.note || '',
      deleted_at: null,
    });

    if (saveErr) {
      return NextResponse.json({ error: saveErr.message }, { status: 500 });
    }

    const data = await getFuelData(family.id, month, vehicleParam);
    return NextResponse.json(data);
  }

  if (action === 'delete') {
    await supabaseAdmin
      .from('fuel_logs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', body.id)
      .eq('family_id', family.id);

    const data = await getFuelData(family.id, month, vehicleParam);
    return NextResponse.json(data);
  }

  if (action === 'restore') {
    await supabaseAdmin
      .from('fuel_logs')
      .update({ deleted_at: null })
      .eq('id', body.id)
      .eq('family_id', family.id);

    const data = await getFuelData(family.id, month, vehicleParam);
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 });
}
