-- ==============================================================================
-- AILE EVI (MADENCI HOME) - SUPABASE VERİTABANI ŞEMASI
-- ==============================================================================
-- Bu SQL dosyasını Supabase Dashboard > SQL Editor sekmesinde çalıştırarak
-- projenizin tüm veritabanı tablolarını, tetikleyicilerini ve depolama ayarlarını
-- tek seferde kalıcı olarak kurabilirsiniz.
-- ==============================================================================

-- Gerekli eklentileri etkinleştir
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. AİLELER (families)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'Bizim Ev',
    invite_code TEXT UNIQUE NOT NULL,
    invites_enabled BOOLEAN NOT NULL DEFAULT true,
    recovery_code TEXT NOT NULL,
    auto_stock BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 2. AİLE ÜYELERİ & CİHAZ OTURUMLARI (family_members / sessions)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    device_name TEXT NOT NULL DEFAULT 'Web Tarayıcı',
    token TEXT UNIQUE NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    expires TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_members_token ON public.family_members(token);
CREATE INDEX IF NOT EXISTS idx_family_members_family ON public.family_members(family_id);

-- ------------------------------------------------------------------------------
-- 3. ALIŞVERİŞ VE STOK ÜRÜNLERİ (items)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity TEXT NOT NULL DEFAULT '1 adet',
    category TEXT NOT NULL DEFAULT 'Diğer',
    kind TEXT NOT NULL CHECK (kind IN ('shop', 'stock')),
    status TEXT NOT NULL DEFAULT 'var' CHECK (status IN ('var', 'azaldı', 'bitti')),
    bought SMALLINT NOT NULL DEFAULT 0,
    note TEXT,
    unit_price_cents BIGINT,
    count_milli BIGINT NOT NULL DEFAULT 1000,
    claimed_by UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
    claimed_name TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_family_kind ON public.items(family_id, kind);
CREATE INDEX IF NOT EXISTS idx_items_family_deleted ON public.items(family_id, deleted_at);

-- ------------------------------------------------------------------------------
-- 4. SIK ALINANLAR / FAVORİLER (favorites)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity TEXT NOT NULL DEFAULT '1 adet',
    category TEXT NOT NULL DEFAULT 'Diğer',
    unit_price_cents BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_favorites_family ON public.favorites(family_id);

-- ------------------------------------------------------------------------------
-- 5. HAZIR LİSTELER VE ŞABLONLAR (custom_lists)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    entries JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_lists_family ON public.custom_lists(family_id);

-- ------------------------------------------------------------------------------
-- 6. ORTAK AİLE TAKVİMİ (calendar_events)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    date DATE NOT NULL,
    time TEXT NOT NULL DEFAULT '09:00',
    remind_days INT NOT NULL DEFAULT 1,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_family_date ON public.calendar_events(family_id, date);

-- ------------------------------------------------------------------------------
-- 7. FATURALAR VE ABONELİKLER (bills)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount_cents BIGINT NOT NULL DEFAULT 0,
    due_date DATE NOT NULL,
    recurrence TEXT NOT NULL DEFAULT 'monthly' CHECK (recurrence IN ('none', 'monthly', 'yearly')),
    remind_days INT NOT NULL DEFAULT 3,
    note TEXT,
    paid BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bills_family ON public.bills(family_id);

-- ------------------------------------------------------------------------------
-- 8. FATURA ÖDEMELERİ GEÇMİŞİ (bill_payments)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bill_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    amount_cents BIGINT NOT NULL,
    occurrence DATE NOT NULL,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bill_payments_family ON public.bill_payments(family_id);

-- ------------------------------------------------------------------------------
-- 9. BELGELER VE GARANTİLER (documents)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    vendor TEXT,
    purchase_date DATE,
    warranty_date DATE,
    remind_days INT NOT NULL DEFAULT 30,
    note TEXT,
    file_path TEXT,
    file_name TEXT,
    file_size BIGINT,
    file_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_family ON public.documents(family_id);

-- ------------------------------------------------------------------------------
-- 10. ARAÇ YAKIT TAKİBİ (fuel_logs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fuel_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    vehicle TEXT NOT NULL,
    date DATE NOT NULL,
    fuel_type TEXT NOT NULL DEFAULT 'Benzin',
    liters_milli BIGINT NOT NULL,
    amount_cents BIGINT NOT NULL,
    odometer BIGINT,
    note TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fuel_logs_family_date ON public.fuel_logs(family_id, date);

-- ------------------------------------------------------------------------------
-- 11. BİLDİRİM VE HAREKET GEÇMİŞİ (notification_events)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_events (
    id BIGSERIAL PRIMARY KEY,
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    actor_name TEXT NOT NULL,
    type TEXT NOT NULL,
    kind TEXT,
    item_name TEXT NOT NULL,
    created TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_events_family ON public.notification_events(family_id, id DESC);

-- ------------------------------------------------------------------------------
-- 12. BİLDİRİM TERCİHLERİ (notification_preferences)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    preferences JSONB NOT NULL DEFAULT '{"add":1,"remove":1,"bought":1,"edit":1,"claim":1,"unclaim":1,"reminder":1,"calendar":1,"bill":1,"document":1}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(family_id, user_name)
);

-- ------------------------------------------------------------------------------
-- 13. PUSH BİLDİRİM ABONELİKLERİ (push_subscriptions)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.family_members(id) ON DELETE CASCADE,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 14. SUPABASE STORAGE (Belgeler Bucket'ı)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Politikaları (documents bucket için okuma ve yükleme izni)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Public Access for documents bucket' AND tablename = 'objects'
    ) THEN
        CREATE POLICY "Public Access for documents bucket"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'documents');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Allow Uploads to documents bucket' AND tablename = 'objects'
    ) THEN
        CREATE POLICY "Allow Uploads to documents bucket"
        ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'documents');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Allow Deletes in documents bucket' AND tablename = 'objects'
    ) THEN
        CREATE POLICY "Allow Deletes in documents bucket"
        ON storage.objects FOR DELETE
        USING (bucket_id = 'documents');
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 15. SUPABASE REALTIME ETKİNLİĞİ (Tüm aile üyelerinin anlık görmesi için)
-- ------------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bills;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fuel_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
