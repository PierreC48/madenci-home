# Aile Evi (Madenci Home) - Supabase Sürümü 🏡

Bu proje, daha önce geçici ortamda barındırılan **Aile Evi** uygulamasının **Supabase** üzerinde çalışan, verilerini kalıcı ve güvenli PostgreSQL veritabanında saklayan, **Supabase Storage** ve **Supabase Realtime** ile güçlendirilmiş tam sürümüdür.

---

## 🚀 Öne Çıkan Özellikler

1. **Ortak Alışveriş Listesi (Shopping List)**
   - Canlı senkronizasyon (Supabase Realtime)
   - Kategori filtreleme, sepete ekleme, toplam harcama hesaplamaları
   - Ürün üstlenme ("Ben alıyorum") ile mükerrer alışverişi önleme
   - 7 günlük çöp kutusu ve silineni geri getirme

2. **Ev Stokları (Evde Ne Var?)**
   - Kiler ve dolap takibi (Var, Azaldı, Bitti)
   - Azalan veya biten ürünleri otomatik alışveriş listesine aktarma (Otomasyon)

3. **Hazır Listeler & Sık Alınanlar**
   - Favori ürünler ve hızlı listeye ekleme
   - Hazır şablonlar (Haftalık Market, Temizlik, Kahvaltı vb.)
   - Özel liste oluşturma (mevcut sepeti şablon kaydetme)

4. **Ortak Aile Takvimi**
   - Randevular, okul günleri, özel günler
   - Türkiye saatine göre gün bazlı hatırlatma planlaması

5. **Faturalar ve Abonelikler**
   - Elektrik, su, internet, kira, abonelikler
   - Vade takibi ve gecikme uyarıları
   - Tekrarlayan faturalar (Aylık/Yıllık) ödendiğinde otomatik sonraki döneme geçiş

6. **Belgeler ve Garantiler (Supabase Storage)**
   - Fatura ve garanti belgelerini PDF, JPG, PNG formatında saklama (10 MB'a kadar)
   - Garanti bitiş tarihi takibi ve geri sayım

7. **Araç Yakıt Takibi**
   - Dolum kayıtları (litre, tutar, kilometre, yakıt türü)
   - Aylık toplam tüketim, harcama ve ortalama litre fiyatı analizi
   - Çoklu araç desteği

8. **Aile Yönetimi ve Güvenlik**
   - Şifresiz, zahmetsiz **Aile Davet Kodu** ile katılım
   - 90 günlük kalıcı cihaz oturumu
   - Yönetici kurtarma kodu ve cihaz yönetimi (erişim kapatma)

---

## 🛠️ Kurulum Adımları (Supabase Kalıcı Kurulumu)

### Adım 1: Supabase Projesi Oluşturma
1. [supabase.com](https://supabase.com) adresine gidin ve ücretsiz bir hesap açın veya giriş yapın.
2. **New Project** butonuna tıklayın:
   - **Name:** `madenci-home` (veya istediğiniz bir isim)
   - **Database Password:** Güçlü bir şifre belirleyin.
   - **Region:** Size en yakın bölgeyi (örn. `Frankfurt (eu-central-1)`) seçin.
3. Projenin hazırlanması 1-2 dakika sürecektir.

### Adım 2: Veritabanı Şemasını Çalıştırma
1. Supabase Dashboard'da sol menüden **SQL Editor** sekmesine girin.
2. `supabase/schema.sql` dosyasının içeriğini kopyalayıp SQL Editor'e yapıştırın.
3. Sağ alttaki **Run** (veya Ctrl+Enter) butonuna tıklayın.
   - Tüm tablolar (`families`, `family_members`, `items`, `bills`, `documents`, `fuel_logs` vb.)
   - Supabase Storage `documents` bucket'ı
   - Supabase Realtime yayınları tek tıkla otomatik kurulacaktır!

### Adım 3: API Anahtarlarını Alma ve `.env.local` Dosyasına Ekleme
1. Supabase Dashboard'da sol alttaki **Project Settings (Çark simgesi)** > **API** sekmesine gidin.
2. Şu bilgileri kopyalayın:
   - **Project URL**
   - **Project API Keys -> anon (public)**
   - **Project API Keys -> service_role (secret)**
3. Proje dizinindeki `.env.local` dosyasını açıp değerleri yapıştırın:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://proje-id-niz.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...anon-key
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...service-role-key
   ```

---

## 💻 Yerel Olarak Çalıştırma

Terminalde proje klasörüne gidin:
```bash
cd madenci-home
npm run dev
```
Tarayıcınızda `http://localhost:3000` adresini açarak uygulamayı test edebilirsiniz.

---

## ☁️ 7/24 İnternette Yayına Alma (Örn: Vercel - Ücretsiz)

Uygulamanın telefonlardan, tabletlerden ailenizle her zaman kesintisiz kullanılabilmesi için Vercel'e 2 dakikada yükleyebilirsiniz:
1. Projeyi bir GitHub reponuza yükleyin.
2. [vercel.com](https://vercel.com) üzerinde **Add New Project** diyerek reponuzu seçin.
3. **Environment Variables** bölümüne `.env.local` içindeki 3 anahtarı ekleyin:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. **Deploy** butonuna basın. Birkaç saniye içinde `https://madenci-home.vercel.app` gibi kalıcı bir adreste uygulamanız 7/24 yayında olacaktır!
