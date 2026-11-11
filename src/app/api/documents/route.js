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

export async function GET(request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase ayarları eksik.' }, { status: 500 });
  }

  const { member, family } = await getSession(request);
  if (!member || !family) {
    return NextResponse.json({ error: 'Oturum açılmamış.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const docId = searchParams.get('id');
  if (!docId) {
    return NextResponse.json({ error: 'Belge ID belirtilmedi.' }, { status: 400 });
  }

  const { data: doc, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', docId)
    .eq('family_id', family.id)
    .single();

  if (error || !doc || !doc.file_path) {
    return NextResponse.json({ error: 'Belge veya dosya bulunamadı.' }, { status: 404 });
  }

  // Get file from Supabase Storage
  const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
    .from('documents')
    .download(doc.file_path);

  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: 'Dosya indirilemedi: ' + downloadError?.message }, { status: 500 });
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': doc.file_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.file_name || 'belge')}"`,
      'Content-Length': String(doc.file_size || buffer.length),
    },
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

  try {
    const formData = await request.formData();
    const action = formData.get('action') || 'save';
    const docId = formData.get('id') || crypto.randomUUID();

    if (action === 'delete') {
      const { data: existing } = await supabaseAdmin
        .from('documents')
        .select('*')
        .eq('id', docId)
        .eq('family_id', family.id)
        .single();

      if (existing) {
        if (existing.file_path) {
          await supabaseAdmin.storage.from('documents').remove([existing.file_path]);
        }
        await supabaseAdmin.from('documents').delete().eq('id', docId).eq('family_id', family.id);
        await logNotification(family.id, member.name, 'document', 'deleted', existing.title);
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'save') {
      const title = String(formData.get('title') || '').trim();
      const vendor = String(formData.get('vendor') || '').trim();
      const purchaseDate = formData.get('purchase_date') || null;
      const warrantyDate = formData.get('warranty_date') || null;
      const remindDays = Number(formData.get('remind_days') ?? 30);
      const note = String(formData.get('note') || '').trim();
      const file = formData.get('file');

      let filePath = null;
      let fileName = null;
      let fileSize = null;
      let fileType = null;

      // Check if updating existing document to keep existing file if not replaced
      const { data: existing } = await supabaseAdmin
        .from('documents')
        .select('*')
        .eq('id', docId)
        .eq('family_id', family.id)
        .maybeSingle();

      if (existing) {
        filePath = existing.file_path;
        fileName = existing.file_name;
        fileSize = existing.file_size;
        fileType = existing.file_type;
      }

      // If new file uploaded
      if (file && typeof file === 'object' && file.size > 0) {
        const fileBytes = await file.arrayBuffer();
        const buffer = Buffer.from(fileBytes);
        const storagePath = `${family.id}/${docId}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from('documents')
          .upload(storagePath, buffer, {
            contentType: file.type || 'application/octet-stream',
            upsert: true,
          });

        if (uploadError) {
          return NextResponse.json({ error: 'Dosya yüklenemedi: ' + uploadError.message }, { status: 500 });
        }

        filePath = storagePath;
        fileName = file.name;
        fileSize = file.size;
        fileType = file.type;
      }

      const isNew = !existing;
      const { error: saveError } = await supabaseAdmin.from('documents').upsert({
        id: docId,
        family_id: family.id,
        title,
        vendor: vendor || null,
        purchase_date: purchaseDate || null,
        warranty_date: warrantyDate || null,
        remind_days: remindDays,
        note: note || '',
        file_path: filePath,
        file_name: fileName,
        file_size: fileSize,
        file_type: fileType,
      });

      if (saveError) {
        return NextResponse.json({ error: saveError.message }, { status: 500 });
      }

      await logNotification(family.id, member.name, 'document', isNew ? 'created' : 'updated', title);
      return NextResponse.json({ success: true, id: docId });
    }

    return NextResponse.json({ error: 'Bilinmeyen işlem.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
