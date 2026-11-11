'use client';

import React, { useState, useEffect, useRef, useId, useLayoutEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Ellipsis,
  FileText,
  FolderArchive,
  Fuel,
  Heart,
  House,
  KeyRound,
  Leaf,
  LoaderCircle,
  LogOut,
  Menu,
  Package,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingBasket,
  Smartphone,
  Star,
  Trash2,
  Undo2,
  UserCheck,
  Users,
  WifiOff,
  Wifi,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Formatters
const formatMoney = (cents) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format((cents || 0) / 100);

const formatNumber = (num, maxDigits = 3) =>
  new Intl.NumberFormat('tr-TR', { maximumFractionDigits: maxDigits }).format(num || 0);

const formatDate = (d) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const formatMonthName = (m) =>
  m ? new Date(m + '-01T12:00:00').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) : '—';

const getTodayString = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date());

const parsePriceToCents = (val) => {
  const num = Number(String(val || '0').replace(',', '.'));
  return Math.round(num * 100);
};

const calculateLineTotalCents = (item) => {
  const unit = item.unit_price_cents || 0;
  const count = item.count_milli || 1000;
  return Math.round((unit * count) / 1000);
};

const CATEGORIES = [
  'Tümü',
  'Meyve & Sebze',
  'Süt & Kahvaltı',
  'Temel Gıda',
  'Temizlik',
  'Kişisel Bakım',
  'Diğer',
];

const CATEGORY_ICONS = {
  'Meyve & Sebze': '🥬',
  'Süt & Kahvaltı': '🥛',
  'Temel Gıda': '🥖',
  Temizlik: '🧴',
  'Kişisel Bakım': '🫧',
  Diğer: '🛍️',
};

const REMINDER_OPTIONS = [
  [-1, 'Hatırlatma yok'],
  [0, 'Aynı gün'],
  [1, '1 gün önce'],
  [3, '3 gün önce'],
  [7, '7 gün önce'],
];

const DOCUMENT_REMINDER_OPTIONS = [
  [-1, 'Hatırlatma yok'],
  [0, 'Bitiş günü'],
  [7, '7 gün önce'],
  [30, '30 gün önce'],
  [60, '60 gün önce'],
];

const NOTIFICATION_LABELS = {
  add: 'Ürün eklendiğinde',
  remove: 'Ürün silindiğinde',
  bought: 'Ürün alındı işaretlendiğinde',
  edit: 'Ürün bilgileri düzenlendiğinde',
  claim: 'Birisi ürünü üstlendiğinde',
  unclaim: 'Birisi ürünü almaktan vazgeçtiğinde',
  calendar: 'Takvim etkinlikleri ve hatırlatmaları',
  bill: 'Fatura / abonelik hareketleri ve hatırlatmaları',
  document: 'Belge değişiklikleri ve garanti hatırlatmaları',
  reminder: 'Zamanı gelen hatırlatmaları gönder',
};

function formatEventMessage(ev) {
  if (ev.type === 'reminder') return ev.item_name;
  if (['calendar', 'bill', 'document'].includes(ev.type)) {
    const noun =
      ev.type === 'calendar' ? 'etkinliğini' : ev.type === 'bill' ? 'fatura / abonelik kaydını' : 'belgesini';
    const verb =
      ev.kind === 'created'
        ? 'ekledi'
        : ev.kind === 'deleted'
        ? 'sildi'
        : ev.kind === 'paid'
        ? 'ödendi olarak işaretledi'
        : 'güncelledi';
    return `${ev.actor_name}, ${ev.item_name} ${noun} ${verb}.`;
  }
  if (ev.type === 'edit') return `${ev.actor_name}, ${ev.item_name} ürününün bilgilerini düzenledi.`;
  if (ev.type === 'claim') return `${ev.actor_name}, ${ev.item_name} ürününü almayı üstlendi.`;
  if (ev.type === 'unclaim') return `${ev.actor_name}, ${ev.item_name} ürününü almaktan vazgeçti.`;

  const dest = ev.kind === 'stock' ? 'ev stoklarına' : 'alışveriş listesine';
  if (ev.type === 'add') return `${ev.actor_name}, ${ev.item_name} ürününü ${dest} ekledi.`;
  if (ev.type === 'remove')
    return `${ev.actor_name}, ${ev.item_name} ürününü ${
      ev.kind === 'stock' ? 'ev stoklarından' : 'alışveriş listesinden'
    } sildi.`;
  return `${ev.actor_name}, ${ev.item_name} ürününü alındı olarak işaretledi.`;
}

// -----------------------------------------------------------------------------
// 1. NOTIFICATIONS COMPONENT
// -----------------------------------------------------------------------------
function NotificationsCenter({ data }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [preferences, setPreferences] = useState({
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
  });
  const [lastReadId, setLastReadId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [liveMsg, setLiveMsg] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [canPush, setCanPush] = useState(false);
  const [isIosPwa, setIsIosPwa] = useState(false);
  const [vapidKey, setVapidKey] = useState('');
  const liveTimerRef = useRef(null);
  const lastEventIdRef = useRef(null);

  const familyId = data?.family?.id;

  async function apiNotifications(payload) {
    const res = await fetch(
      '/api/notifications',
      payload
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        : undefined
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'İşlem tamamlanamadı.');
    return json;
  }

  useEffect(() => {
    if (!familyId) return;
    const readKey = `aile-notifications-read:${familyId}:${data?.me}`;
    try {
      setLastReadId(Number(localStorage.getItem(readKey) || 0));
    } catch {}

    const support = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setCanPush(support);

    const isIos =
      (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
      !window.matchMedia('(display-mode: standalone)').matches;
    setIsIosPwa(isIos);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => reg.pushManager?.getSubscription())
        .then((sub) => {
          setPushEnabled(Boolean(sub && Notification.permission === 'granted'));
        })
        .catch(() => {});
    }

    if (new URLSearchParams(location.search).get('notifications') === '1') {
      setOpen(true);
    }
  }, [familyId]);

  useEffect(() => {
    if (!familyId || !data?.events) return;
    setEvents(data.events);
    if (data.preferences) setPreferences(data.preferences);

    const highestId = data.events[0]?.id || 0;
    if (lastEventIdRef.current !== null && highestId > lastEventIdRef.current) {
      const newEvs = data.events.filter((e) => e.id > lastEventIdRef.current && e.actor_name !== data.me);
      if (newEvs.length) {
        setLiveMsg(newEvs.length === 1 ? formatEventMessage(newEvs[0]) : `${newEvs.length} yeni aile bildirimi var.`);
        if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
        liveTimerRef.current = setTimeout(() => setLiveMsg(''), 6000);
      }
    }
    lastEventIdRef.current = highestId;
  }, [data]);

  useEffect(() => {
    if (!open || !familyId) return;
    setErrorMsg('');
    apiNotifications()
      .then((res) => {
        setEvents(res.events || []);
        if (res.preferences) setPreferences(res.preferences);
        setVapidKey(res.publicKey || '');
      })
      .catch((err) => setErrorMsg(err.message));
  }, [open, familyId]);

  const unreadCount = events.filter((e) => e.id > lastReadId).length;

  function markAllRead() {
    const highest = events[0]?.id || 0;
    setLastReadId(highest);
    try {
      localStorage.setItem(`aile-notifications-read:${familyId}:${data?.me}`, String(highest));
    } catch {}
  }

  async function togglePreference(key) {
    setLoading(true);
    setErrorMsg('');
    try {
      const updated = { ...preferences, [key]: preferences[key] ? 0 : 1 };
      const res = await apiNotifications({ action: 'preferences', preferences: updated });
      setPreferences(res.preferences);
      setInfoMsg('Bildirim tercihleri kaydedildi.');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className="notification-bell"
        aria-label={`Bildirimler${unreadCount ? `, ${unreadCount} okunmamış` : ''}`}
        title="Bildirimler"
        onClick={() => setOpen(true)}
      >
        <Bell size={20} />
        {unreadCount > 0 && <span>{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {liveMsg && (
        <div className="notification-live" role="status" onClick={() => setOpen(true)}>
          <Bell size={18} />
          <span>{liveMsg}</span>
        </div>
      )}

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <section
            className="dialog notification-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close icon-btn" aria-label="Bildirimleri kapat" onClick={() => setOpen(false)}>
              <X size={20} />
            </button>
            <span className="eyebrow">EVİMİZDEN HABERLER</span>
            <h2 id="notification-title">Bildirimler</h2>

            {familyId ? (
              <>
                <div className="phone-notifications">
                  <div className="phone-heading">
                    <Smartphone size={20} />
                    <strong>Telefon bildirimleri</strong>
                    <span className={pushEnabled ? 'push-status enabled' : 'push-status'}>
                      {pushEnabled ? 'Bu cihazda açık' : 'Bu cihazda kapalı'}
                    </span>
                  </div>
                  <p>Alışveriş, takvim, fatura ve belge değişiklikleri ile zamanı gelen hatırlatmalardan anında haber alın.</p>
                  {isIosPwa && (
                    <p className="install-hint">
                      iPhone: Önce Safari’de Paylaş → Ana Ekrana Ekle. Sonra ana ekrandaki simgeden açın.
                    </p>
                  )}
                </div>

                <h3>Hangi bildirimleri alayım?</h3>
                <div className="notification-preferences">
                  {Object.keys(NOTIFICATION_LABELS).map((key) => (
                    <label key={key} className="notification-preference">
                      <span>{NOTIFICATION_LABELS[key]}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(preferences[key])}
                        disabled={loading}
                        onChange={() => togglePreference(key)}
                      />
                    </label>
                  ))}
                </div>

                {errorMsg && (
                  <div className="notice notification-error" role="alert">
                    {errorMsg}
                  </div>
                )}
                {infoMsg && (
                  <div className="notice notification-info" role="status">
                    {infoMsg}
                  </div>
                )}

                <div className="activity-heading">
                  <h3>Son hareketler</h3>
                  <button className="text-btn" onClick={markAllRead}>
                    <CheckCheck size={16} /> Okundu işaretle
                  </button>
                </div>
                <p className="subtle">Son 100 işlem gösterilir. Ortak listeniz Supabase ile anlık senkronizedir.</p>

                <div className="notification-events">
                  {events.length ? (
                    events.map((ev) => (
                      <div key={ev.id} className={`notification-event ${ev.id > lastReadId ? 'unread' : ''}`}>
                        <span className={`event-icon ${ev.type}`}>
                          {ev.type === 'add' ? (
                            <Plus size={17} />
                          ) : ev.type === 'remove' ? (
                            <Trash2 size={16} />
                          ) : (
                            <Check size={17} />
                          )}
                        </span>
                        <div>
                          <p>{formatEventMessage(ev)}</p>
                          <time dateTime={ev.created}>
                            {new Date(ev.created).toLocaleString('tr-TR', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </div>
                        {ev.id > lastReadId && <span className="unread-dot" aria-label="Okunmamış" />}
                      </div>
                    ))
                  ) : (
                    <div className="module-empty">
                      <Bell size={27} />
                      <p>Henüz bildirim yok.</p>
                      <small>Alışveriş, takvim, fatura ve belge hareketleri burada görünecek.</small>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p>Bildirimler için önce aile grubunuzu oluşturun veya bir aileye katılın.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}

// -----------------------------------------------------------------------------
// 2. FAMILY DIALOG COMPONENT
// -----------------------------------------------------------------------------
function FamilySettingsDialog({ data, onClose, onChanged, onLogout }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [newRecovery, setNewRecovery] = useState('');

  async function apiFamily(payload) {
    const res = await fetch(
      '/api/family',
      payload
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        : undefined
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'İşlem tamamlanamadı.');
    return json;
  }

  useEffect(() => {
    if (data?.family) {
      apiFamily()
        .then(setDetails)
        .catch((err) => setErrorMsg(err.message));
    }
  }, [data?.family?.id]);

  async function handleAction(action, payload = {}) {
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      const res = await apiFamily({ action, ...payload });
      if (action === 'logout') {
        onLogout();
        return;
      }
      setDetails(res);
      if (res.recoveryCode) setNewRecovery(res.recoveryCode);
      setInfoMsg(
        action === 'revoke-device'
          ? 'Cihazın erişimi kapatıldı.'
          : action === 'rotate-invite'
          ? 'Yeni davet kodu hazır. Eski kod artık geçersiz.'
          : 'Ayarlar kaydedildi.'
      );
      onChanged();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      setInfoMsg('Kod panoya kopyalandı.');
    } catch {
      setInfoMsg('Kodu seçerek kopyalayabilirsiniz.');
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <section
        className="dialog family-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="family-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close icon-btn" aria-label="Aile ayarlarını kapat" onClick={onClose}>
          <X size={20} />
        </button>
        <span className="eyebrow">AYNI EV, ORTAK LİSTE</span>
        <h2 id="family-title">{data?.family?.name || 'Ailemiz'}</h2>

        {data?.family ? (
          <>
            <div className="session-note">
              <ShieldCheck size={20} />
              <p>Bu tarayıcıdaki oturumunuz 90 gün boyunca kalıcı olarak Supabase üzerinde saklanır.</p>
            </div>

            {details?.isAdmin ? (
              <section className="family-section">
                <h3>
                  Aile davet kodu <span className="role-tag">Yönetici</span>
                </h3>
                <p>Bu kodu alan kişi adını yazarak aileye katılabilir. Yalnızca aile üyelerinizle paylaşın.</p>
                <div className="invite">
                  <span>{details.inviteCode}</span>
                  <button className="icon-btn" aria-label="Davet kodunu kopyala" onClick={() => copyText(details.inviteCode)}>
                    <Copy size={18} />
                  </button>
                </div>
                <div className="family-actions">
                  <button className="secondary" disabled={loading} onClick={() => handleAction('rotate-invite')}>
                    <RefreshCw size={14} /> Kodu yenile
                  </button>
                  <button
                    className="secondary"
                    disabled={loading}
                    onClick={() => handleAction('toggle-invites', { enabled: !details.invitesEnabled })}
                  >
                    {details.invitesEnabled ? 'Davetleri kapat' : 'Davetleri aç'}
                  </button>
                </div>
                <p className="subtle">
                  Davetler {details.invitesEnabled ? 'açık' : 'kapalı'}. Kodu yenilemek mevcut cihazların oturumunu kapatmaz.
                </p>
              </section>
            ) : (
              <p className="subtle">Yeni aile üyeleri için davet kodunu aile yöneticinizden isteyebilirsiniz.</p>
            )}

            {details?.isAdmin && (
              <section className="family-section">
                <h3>
                  <KeyRound size={16} /> Yönetici kurtarma kodu
                </h3>
                <p>Telefonunuzu değiştirir veya verilerinizi kaybederseniz bu özel kodla yönetici olarak geri dönebilirsiniz.</p>
                <button className="secondary" disabled={loading} onClick={() => handleAction('recovery-code')}>
                  Yeni kurtarma kodu oluştur
                </button>
                {newRecovery && (
                  <div className="recovery-box">
                    <strong>Bu kod yalnızca şimdi gösterilir. Güvenli bir yere kaydedin.</strong>
                    <div className="invite">
                      <span>{newRecovery}</span>
                      <button className="icon-btn" aria-label="Kurtarma kodunu kopyala" onClick={() => copyText(newRecovery)}>
                        <Copy size={17} />
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="family-section">
              <h3>
                <Smartphone size={16} /> {details?.isAdmin ? 'Aile cihazları' : 'Cihazlarım'}
              </h3>
              {!details && !errorMsg ? (
                <p>Yükleniyor…</p>
              ) : (
                details?.devices?.map((d) => (
                  <div key={d.id} className="device-row">
                    <div>
                      <strong>{d.name}</strong>
                      <small>{d.device_name}</small>
                      <small>Geçerli: {new Date(d.expires).toLocaleDateString('tr-TR')}</small>
                    </div>
                    {d.id === details.currentSessionId ? (
                      <span className="role-tag">Bu cihaz</span>
                    ) : (
                      details.isAdmin && (
                        <button
                          className="secondary danger"
                          disabled={loading}
                          onClick={() => handleAction('revoke-device', { id: d.id })}
                        >
                          Erişimi kapat
                        </button>
                      )
                    )}
                  </div>
                ))
              )}
            </section>

            {errorMsg && (
              <div className="notice" role="alert">
                {errorMsg}
              </div>
            )}
            {infoMsg && (
              <div className="notice notification-info" role="status">
                {infoMsg}
              </div>
            )}

            <button className="secondary logout-button" disabled={loading} onClick={() => handleAction('logout')}>
              <LogOut size={16} /> Bu cihazdan çıkış yap
            </button>
          </>
        ) : (
          <p>Başlamak için aile kodunuzla giriş yapın veya yeni aile oluşturun.</p>
        )}
      </section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 3. HOUSEHOLD MODULES (Favorites, Calendar, Bills, Documents)
// -----------------------------------------------------------------------------
function HouseholdModules({ tab, familyData, onChanged }) {
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalType, setModalType] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [fromCurrentList, setFromCurrentList] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(getTodayString().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState('');

  async function fetchModules() {
    try {
      const res = await fetch('/api/modules');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Modül verileri alınamadı.');
      setData(json);
      setErrorMsg('');
    } catch (err) {
      setErrorMsg(err.message);
    }
  }

  useEffect(() => {
    fetchModules();
  }, [tab, familyData.family.id]);

  async function apiCall(action, payload = {}) {
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      const res = await fetch('/api/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'İşlem başarısız.');
      setData(json);
      setInfoMsg(
        json.added !== undefined
          ? json.added > 0
            ? `${json.added} ürün alışveriş listesine eklendi.`
            : 'Bu ürünler zaten alışveriş listesinde.'
          : 'İşlem kaydedildi.'
      );
      onChanged();
      return true;
    } catch (err) {
      setErrorMsg(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    let success = false;

    if (modalType === 'template') {
      const entriesText = String(formData.get('entries') || '');
      const entries = entriesText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [n, q] = l.split('|').map((s) => s.trim());
          return { name: n, quantity: q || '1 adet', category: 'Diğer' };
        });

      success = await apiCall('list-save', {
        id: editingItem?.id,
        name: formData.get('name'),
        fromCurrent: fromCurrentList,
        entries,
      });
    }

    if (modalType === 'calendar') {
      success = await apiCall('event-save', {
        id: editingItem?.id,
        title: formData.get('title'),
        date: formData.get('date'),
        time: formData.get('time'),
        remind_days: Number(formData.get('remind_days')),
        note: formData.get('note'),
      });
    }

    if (modalType === 'bill') {
      success = await apiCall('bill-save', {
        id: editingItem?.id,
        title: formData.get('title'),
        amount_cents: parsePriceToCents(formData.get('amount')),
        due_date: formData.get('due_date'),
        recurrence: formData.get('recurrence'),
        remind_days: Number(formData.get('remind_days')),
        note: formData.get('note'),
      });
    }

    if (modalType === 'document') {
      setLoading(true);
      setErrorMsg('');
      try {
        formData.set('action', 'save');
        if (editingItem?.id) formData.set('id', editingItem.id);
        const res = await fetch('/api/documents', { method: 'POST', body: formData });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Belge kaydedilemedi.');
        await fetchModules();
        setInfoMsg('Belge arşive kaydedildi.');
        onChanged();
        success = true;
      } catch (err) {
        setErrorMsg(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (success) {
      setModalType('');
      setEditingItem(null);
    }
  }

  async function deleteDocument(id) {
    setLoading(true);
    setErrorMsg('');
    try {
      const fd = new FormData();
      fd.set('action', 'delete');
      fd.set('id', id);
      const res = await fetch('/api/documents', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Belge silinemedi.');
      await fetchModules();
      setInfoMsg('Belge arşivden kaldırıldı.');
      onChanged();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  function changeMonth(delta) {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1, 12);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setSelectedDay('');
  }

  const [cy, cm] = currentMonth.split('-').map(Number);
  const startDayOfWeek = (new Date(cy, cm - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(cy, cm, 0).getDate();
  const calendarEvents = (data?.calendar || []).filter((e) =>
    selectedDay ? e.date === selectedDay : e.date.startsWith(currentMonth)
  );

  return (
    <div className="household-module">
      {errorMsg && !modalType && (
        <div className="notice" role="alert">
          {errorMsg}
        </div>
      )}
      {infoMsg && (
        <div className="notice notification-info" role="status">
          {infoMsg}
        </div>
      )}

      {data ? (
        <>
          {/* 1. SIK ALINANLAR & HAZIR LİSTELER */}
          {tab === 'lists' && (
            <>
              <div className="module-heading">
                <div>
                  <h2>Sık alınanlar</h2>
                  <p>Alışveriş ve stok listesindeki yıldız simgesiyle favorilerinizi oluşturun.</p>
                </div>
                <Star size={24} />
              </div>
              <div className="favorite-grid">
                {data.favorites.map((fav) => (
                  <article key={fav.id} className="favorite-card">
                    <button
                      className="icon-btn corner"
                      aria-label="Kaldır"
                      onClick={() => apiCall('favorite-remove', { id: fav.id })}
                    >
                      <X size={15} />
                    </button>
                    <Star size={17} />
                    <h3>{fav.name}</h3>
                    <p>{fav.quantity}</p>
                    {fav.unit_price_cents !== null && <small>Birim fiyat: {formatMoney(fav.unit_price_cents)}</small>}
                    <button className="secondary" disabled={loading} onClick={() => apiCall('favorite-use', { id: fav.id })}>
                      <Plus size={15} /> Listeye ekle
                    </button>
                  </article>
                ))}
                {!data.favorites.length && (
                  <div className="module-empty">
                    <Star size={27} />
                    <p>Henüz sık alınan ürün yok.</p>
                    <small>Alışveriş veya stok listesindeki yıldız simgesine dokunarak ekleyin.</small>
                  </div>
                )}
              </div>

              <div className="module-heading">
                <div>
                  <h2>Hazır listeler</h2>
                  <p>İhtiyacınızı seçin. Zaten alınacaklar listesinde olanlar tekrar eklenmez.</p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setEditingItem(null);
                    setFromCurrentList(false);
                    setModalType('template');
                  }}
                >
                  <Plus size={16} /> Liste oluştur
                </button>
              </div>

              <div className="template-grid">
                {[
                  ['weekly', 'Haftalık market', '6 temel ihtiyaç'],
                  ['cleaning', 'Temizlik ihtiyaçları', '4 temel ihtiyaç'],
                  ['breakfast', 'Kahvaltı listesi', '5 temel ihtiyaç'],
                ].map(([key, title, subtitle]) => (
                  <article key={key} className="template-card starter">
                    <ShoppingBasket size={24} />
                    <h3>{title}</h3>
                    <p>{subtitle}</p>
                    <button className="secondary" disabled={loading} onClick={() => apiCall('list-use', { starter: key })}>
                      Ürünleri ekle
                    </button>
                  </article>
                ))}

                {data.lists.map((lst) => (
                  <article key={lst.id} className="template-card">
                    <div className="card-actions">
                      <button
                        className="icon-btn"
                        aria-label="Düzenle"
                        onClick={() => {
                          setEditingItem(lst);
                          setModalType('template');
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-btn delete"
                        aria-label="Sil"
                        onClick={() => apiCall('list-delete', { id: lst.id })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <Copy size={23} />
                    <h3>{lst.name}</h3>
                    <p>
                      {lst.entries?.length || 0} ürün · {lst.entries?.slice(0, 3).map((e) => e.name).join(', ')}
                    </p>
                    <button className="secondary" disabled={loading} onClick={() => apiCall('list-use', { id: lst.id })}>
                      Ürünleri ekle
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}

          {/* 2. AİLE TAKVİMİ */}
          {tab === 'calendar' && (
            <>
              <div className="module-heading">
                <div>
                  <h2>Ortak aile takvimi</h2>
                  <p>Randevular, okul etkinlikleri ve özel günler ailece tek yerde.</p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setEditingItem(null);
                    setModalType('calendar');
                  }}
                >
                  <Plus size={16} /> Etkinlik ekle
                </button>
              </div>

              <div className="calendar-panel">
                <div className="calendar-month">
                  <button className="icon-btn" aria-label="Önceki ay" onClick={() => changeMonth(-1)}>
                    <ChevronLeft size={19} />
                  </button>
                  <h3>{new Date(cy, cm - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</h3>
                  <button className="icon-btn" aria-label="Sonraki ay" onClick={() => changeMonth(1)}>
                    <ChevronRight size={19} />
                  </button>
                </div>
                <div className="calendar-grid">
                  {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((w) => (
                    <strong key={w} className="weekday">
                      {w}
                    </strong>
                  ))}
                  {Array.from({ length: startDayOfWeek }, (_, i) => (
                    <span key={'blank' + i} className="blank-day" />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const dayStr = `${currentMonth}-${String(i + 1).padStart(2, '0')}`;
                    const dayEvents = (data.calendar || []).filter((e) => e.date === dayStr);
                    const isToday = dayStr === getTodayString();
                    const isSelected = dayStr === selectedDay;
                    return (
                      <button
                        key={dayStr}
                        className={`calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedDay(dayStr === selectedDay ? '' : dayStr)}
                      >
                        <span>{i + 1}</span>
                        {dayEvents.length > 0 && <small>{dayEvents.length} etkinlik</small>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="module-heading compact">
                <h3>{selectedDay ? formatDate(selectedDay) : 'Bu ayın etkinlikleri'}</h3>
                {selectedDay && (
                  <button className="text-btn" onClick={() => setSelectedDay('')}>
                    Ayın tamamını göster
                  </button>
                )}
              </div>

              <div className="record-list">
                {calendarEvents.map((ev) => (
                  <article key={ev.id} className="record-row">
                    <span className="record-icon">
                      <CalendarDays size={21} />
                    </span>
                    <div className="record-text">
                      <h3>{ev.title}</h3>
                      <p>
                        {formatDate(ev.date)} · {ev.time}
                      </p>
                      {ev.note && <small>{ev.note}</small>}
                    </div>
                    <button
                      className="icon-btn"
                      aria-label="Düzenle"
                      onClick={() => {
                        setEditingItem(ev);
                        setModalType('calendar');
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-btn delete"
                      aria-label="Sil"
                      onClick={() => apiCall('event-delete', { id: ev.id })}
                    >
                      <Trash2 size={16} />
                    </button>
                  </article>
                ))}
                {!calendarEvents.length && (
                  <div className="module-empty">
                    <CalendarDays size={27} />
                    <p>Bu tarih aralığında etkinlik yok.</p>
                    <button
                      className="text-btn"
                      onClick={() => {
                        setEditingItem(null);
                        setModalType('calendar');
                      }}
                    >
                      İlk etkinliği ekle
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* 3. FATURALAR VE ABONELİKLER */}
          {tab === 'bills' && (
            <>
              <div className="module-heading">
                <div>
                  <h2>Faturalar ve abonelikler</h2>
                  <p>Ödeme tarihlerini takip edin; aylık ve yıllık faturalar otomatik sonraki döneme geçsin.</p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setEditingItem(null);
                    setModalType('bill');
                  }}
                >
                  <Plus size={16} /> Kayıt ekle
                </button>
              </div>

              <div className="finance-summary">
                <div>
                  <small>Bekleyen toplam</small>
                  <strong>{formatMoney(data.bills.filter((b) => !b.paid).reduce((s, b) => s + b.amount_cents, 0))}</strong>
                </div>
                <div>
                  <small>Geciken faturalar</small>
                  <strong>{data.bills.filter((b) => !b.paid && b.due_date < getTodayString()).length}</strong>
                </div>
                <div>
                  <small>Tekrarlayan abonelikler</small>
                  <strong>{data.bills.filter((b) => b.recurrence !== 'none').length}</strong>
                </div>
              </div>

              <div className="bill-grid">
                {data.bills.map((b) => {
                  const isOverdue = !b.paid && b.due_date < getTodayString();
                  return (
                    <article key={b.id} className={`bill-card ${isOverdue ? 'overdue' : ''}`}>
                      <div className="card-actions">
                        <button
                          className="icon-btn"
                          aria-label="Düzenle"
                          onClick={() => {
                            setEditingItem(b);
                            setModalType('bill');
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn delete"
                          aria-label="Sil"
                          onClick={() => apiCall('bill-delete', { id: b.id })}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <Receipt size={23} />
                      <span className="bill-badge">
                        {b.paid
                          ? 'Ödendi'
                          : b.recurrence === 'monthly'
                          ? 'Aylık'
                          : b.recurrence === 'yearly'
                          ? 'Yıllık'
                          : 'Tek seferlik'}
                      </span>
                      <h3>{b.title}</h3>
                      <strong className="bill-amount">{formatMoney(b.amount_cents)}</strong>
                      <p>Son ödeme: {formatDate(b.due_date)}</p>
                      {b.note && <small>{b.note}</small>}
                      {!b.paid && (
                        <button
                          className="secondary"
                          disabled={loading}
                          onClick={() => apiCall('bill-pay', { id: b.id, occurrence: b.due_date })}
                        >
                          <Check size={15} /> Ödendi işaretle
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>

              {data.payments.length > 0 && (
                <>
                  <div className="module-heading compact">
                    <h3>Son ödemeler</h3>
                  </div>
                  <div className="record-list">
                    {data.payments.map((p) => (
                      <div key={p.id} className="record-row">
                        <Check size={18} />
                        <div className="record-text">
                          <h3>{p.title}</h3>
                          <p>{formatDate(p.occurrence)} dönemi</p>
                        </div>
                        <strong>{formatMoney(p.amount_cents)}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* 4. BELGELER VE GARANTİLER */}
          {tab === 'archive' && (
            <>
              <div className="module-heading">
                <div>
                  <h2>Belgeler ve garantiler</h2>
                  <p>Fatura, garanti belgesi ve sözleşmelerinizi Supabase Storage üzerinde güvenle saklayın.</p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setEditingItem(null);
                    setModalType('document');
                  }}
                >
                  <Plus size={16} /> Belge ekle
                </button>
              </div>

              <div className="document-grid">
                {data.documents.map((doc) => {
                  const isEnded = doc.warranty_date && doc.warranty_date < getTodayString();
                  return (
                    <article key={doc.id} className="document-card">
                      <div className="card-actions">
                        <button
                          className="icon-btn"
                          aria-label="Düzenle"
                          onClick={() => {
                            setEditingItem(doc);
                            setModalType('document');
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn delete"
                          aria-label="Kaldır"
                          onClick={() => deleteDocument(doc.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <FileText size={29} />
                      <h3>{doc.title}</h3>
                      <p>{doc.vendor || 'Satıcı bilgisi yok'}</p>
                      <dl>
                        <div>
                          <dt>Alış tarihi</dt>
                          <dd>{formatDate(doc.purchase_date)}</dd>
                        </div>
                        <div>
                          <dt>Garanti bitişi</dt>
                          <dd>{formatDate(doc.warranty_date)}</dd>
                        </div>
                      </dl>
                      {doc.warranty_date && (
                        <span className={`warranty-tag ${isEnded ? 'ended' : ''}`}>
                          {isEnded ? 'Garanti süresi doldu' : 'Garanti takip ediliyor'}
                        </span>
                      )}
                      {doc.note && <small>{doc.note}</small>}
                      {doc.file_path ? (
                        <a className="secondary" href={`/api/documents?id=${encodeURIComponent(doc.id)}`} download>
                          <Download size={15} /> Dosyayı indir <span>{Math.ceil((doc.file_size || 0) / 1024)} KB</span>
                        </a>
                      ) : (
                        <span className="subtle">Dosya eklenmedi</span>
                      )}
                    </article>
                  );
                })}
                {!data.documents.length && (
                  <div className="module-empty">
                    <FolderArchive size={32} />
                    <p>Arşiviniz ilk belgeye hazır.</p>
                    <small>PDF, JPG, PNG veya WebP · Dosya başına en fazla 10 MB (Supabase Storage)</small>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="empty">Aile kayıtları yükleniyor…</div>
      )}

      {/* FORM MODAL FOR MODULES */}
      {modalType && (
        <div className="overlay" onClick={() => setModalType('')}>
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mod-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close icon-btn" aria-label="Kapat" onClick={() => setModalType('')}>
              <X size={20} />
            </button>
            <span className="eyebrow">EVİNİZİN ORTAK KAYITLARI</span>
            <h2 id="mod-title">
              {editingItem
                ? 'Kaydı düzenle'
                : modalType === 'template'
                ? 'Hazır liste oluştur'
                : modalType === 'calendar'
                ? 'Etkinlik ekle'
                : modalType === 'bill'
                ? 'Fatura veya abonelik ekle'
                : 'Belge ve garanti ekle'}
            </h2>

            {errorMsg && (
              <div className="notice" role="alert">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleFormSubmit}>
              {modalType === 'template' && (
                <>
                  <label>
                    Liste adı
                    <input
                      name="name"
                      required
                      maxLength={80}
                      defaultValue={editingItem?.name || ''}
                      placeholder="Örn. Aylık market listesi"
                    />
                  </label>
                  {!editingItem && (
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={fromCurrentList}
                        onChange={(e) => setFromCurrentList(e.target.checked)}
                      />
                      Mevcut alınacaklar listesini kaydet
                    </label>
                  )}
                  {!fromCurrentList && (
                    <label>
                      Ürünler
                      <textarea
                        name="entries"
                        rows={7}
                        required
                        defaultValue={editingItem?.entries?.map((e) => `${e.name} | ${e.quantity}`).join('\n') || ''}
                        placeholder={'Her satıra bir ürün:\nSüt | 2 litre\nYumurta | 1 koli'}
                      />
                    </label>
                  )}
                </>
              )}

              {modalType !== 'template' && (
                <>
                  <label>
                    {modalType === 'document'
                      ? 'Belge / ürün adı'
                      : modalType === 'bill'
                      ? 'Fatura veya abonelik adı'
                      : 'Etkinlik adı'}
                    <input
                      name="title"
                      required
                      maxLength={120}
                      defaultValue={editingItem?.title || ''}
                      placeholder={
                        modalType === 'document'
                          ? 'Örn. Çamaşır makinesi garantisi'
                          : modalType === 'bill'
                          ? 'Örn. Elektrik faturası'
                          : 'Örn. Okul toplantısı'
                      }
                    />
                  </label>

                  {modalType === 'calendar' && (
                    <div className="form-row">
                      <label>
                        Tarih
                        <input
                          type="date"
                          name="date"
                          required
                          defaultValue={editingItem?.date || selectedDay || getTodayString()}
                        />
                      </label>
                      <label>
                        Saat
                        <input type="time" name="time" required defaultValue={editingItem?.time || '09:00'} />
                      </label>
                    </div>
                  )}

                  {modalType === 'bill' && (
                    <>
                      <div className="form-row">
                        <label>
                          Tutar (₺)
                          <input
                            name="amount"
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            defaultValue={editingItem ? (editingItem.amount_cents || 0) / 100 : ''}
                          />
                        </label>
                        <label>
                          Son ödeme tarihi
                          <input
                            name="due_date"
                            type="date"
                            required
                            defaultValue={editingItem?.due_date || getTodayString()}
                          />
                        </label>
                      </div>
                      <label>
                        Tekrar
                        <select name="recurrence" defaultValue={editingItem?.recurrence || 'monthly'}>
                          <option value="none">Tek seferlik fatura</option>
                          <option value="monthly">Her ay / aylık abonelik</option>
                          <option value="yearly">Her yıl / yıllık abonelik</option>
                        </select>
                      </label>
                    </>
                  )}

                  {modalType === 'document' && (
                    <>
                      <label>
                        Satıcı / servis
                        <input name="vendor" maxLength={100} defaultValue={editingItem?.vendor || ''} placeholder="İsteğe bağlı" />
                      </label>
                      <div className="form-row">
                        <label>
                          Alış tarihi
                          <input type="date" name="purchase_date" defaultValue={editingItem?.purchase_date || ''} />
                        </label>
                        <label>
                          Garanti bitişi
                          <input type="date" name="warranty_date" defaultValue={editingItem?.warranty_date || ''} />
                        </label>
                      </div>
                      <label>
                        Dosya (Supabase Storage)
                        <input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
                      </label>
                    </>
                  )}

                  <label>
                    Hatırlatma
                    <select
                      name="remind_days"
                      defaultValue={editingItem?.remind_days ?? (modalType === 'document' ? 30 : modalType === 'bill' ? 3 : 1)}
                    >
                      {(modalType === 'document' ? DOCUMENT_REMINDER_OPTIONS : REMINDER_OPTIONS).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Not <span>(isteğe bağlı)</span>
                    <textarea name="note" rows={3} defaultValue={editingItem?.note || ''} />
                  </label>
                </>
              )}

              <button className="primary" type="submit" disabled={loading}>
                {loading ? 'Kaydediliyor…' : editingItem ? 'Değişiklikleri kaydet' : 'Kaydet'}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// 4. FUEL MODULE (Vehicle Fuel Logs)
// -----------------------------------------------------------------------------
function FuelModule({ familyId }) {
  const [month, setMonth] = useState(getTodayString().slice(0, 7));
  const [vehicle, setVehicle] = useState('');
  const [data, setData] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [lastDeletedId, setLastDeletedId] = useState('');

  async function fetchFuel() {
    try {
      const q = new URLSearchParams({ month, vehicle });
      const res = await fetch(`/api/fuel?${q}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Yakıt kayıtları alınamadı.');
      setData(json);
      setErrorMsg('');
    } catch (err) {
      setErrorMsg(err.message);
    }
  }

  useEffect(() => {
    fetchFuel();
  }, [familyId, month, vehicle]);

  async function apiFuel(action, payload = {}) {
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      const q = new URLSearchParams({ month, vehicle });
      const res = await fetch(`/api/fuel?${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'İşlem tamamlanamadı.');
      setData(json);
      return true;
    } catch (err) {
      setErrorMsg(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const num = (k) => Number(String(fd.get(k) || '0').replace(',', '.'));

    const success = await apiFuel('save', {
      id: editingItem?.id,
      vehicle: fd.get('vehicle'),
      date: fd.get('date'),
      fuel_type: fd.get('fuel_type'),
      liters_milli: Math.round(num('liters') * 1000),
      amount_cents: Math.round(num('amount') * 100),
      odometer: fd.get('odometer') === '' ? null : num('odometer'),
      note: fd.get('note'),
    });

    if (success) {
      setShowModal(false);
      setInfoMsg('Yakıt kaydı kaydedildi.');
    }
  }

  function changeMonth(delta) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1, 12);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <section className="fuel-module">
      <div className="module-heading">
        <div>
          <h2>Araç yakıt takibi</h2>
          <p>Her dolumu kaydet, aylık tüketimini ve harcamanı Supabase üzerinde kalıcı olarak gör.</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditingItem(null);
            setShowModal(true);
          }}
        >
          <Plus size={17} /> Yakıt ekle
        </button>
      </div>

      <div className="fuel-filters">
        <div className="fuel-month">
          <button className="icon-btn" aria-label="Önceki ay" onClick={() => changeMonth(-1)}>
            <ChevronLeft size={19} />
          </button>
          <label>
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </label>
          <button className="icon-btn" aria-label="Sonraki ay" onClick={() => changeMonth(1)}>
            <ChevronRight size={19} />
          </button>
        </div>

        <label>
          Araç
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
            <option value="">Tüm araçlar</option>
            {(data?.vehicles || []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      {errorMsg && !showModal && (
        <div className="notice" role="alert">
          {errorMsg}
        </div>
      )}
      {infoMsg && (
        <div className="notice notification-info" role="status">
          {infoMsg}
          {lastDeletedId && (
            <button
              className="text-btn"
              onClick={async () => {
                if (await apiFuel('restore', { id: lastDeletedId })) {
                  setLastDeletedId('');
                  setInfoMsg('Yakıt kaydı geri getirildi.');
                }
              }}
            >
              <Undo2 size={15} /> Geri al
            </button>
          )}
        </div>
      )}

      {data ? (
        <>
          <div className="finance-summary fuel-summary">
            <div>
              <small>{formatMonthName(month)} · Alınan yakıt</small>
              <strong>
                {formatNumber((data.totals.liters_milli || 0) / 1000)} <em>L</em>
              </strong>
            </div>
            <div>
              <small>Toplam harcama</small>
              <strong>{formatMoney(data.totals.amount_cents)}</strong>
            </div>
            <div>
              <small>Ortalama litre fiyatı</small>
              <strong>
                {data.totals.liters_milli
                  ? formatMoney(Math.round((data.totals.amount_cents * 1000) / data.totals.liters_milli))
                  : '—'}
              </strong>
            </div>
          </div>

          <div className="module-heading compact">
            <h3>Dolum kayıtları</h3>
            <span className="subtle">{data.totals.count} kayıt</span>
          </div>

          <div className="record-list fuel-records">
            {data.entries.map((ent) => (
              <article key={ent.id} className="record-row">
                <span className="record-icon">
                  <Fuel size={20} />
                </span>
                <div className="record-text">
                  <h3>
                    {ent.vehicle} <span className="fuel-type">{ent.fuel_type}</span>
                  </h3>
                  <p>
                    {formatDate(ent.date)} · {formatNumber((ent.liters_milli || 0) / 1000)} L
                    {ent.odometer !== null && ` · ${formatNumber(ent.odometer, 0)} km`}
                  </p>
                  {ent.note && <small>{ent.note}</small>}
                </div>
                <strong>{formatMoney(ent.amount_cents)}</strong>
                <div className="fuel-row-actions">
                  <button
                    className="icon-btn"
                    aria-label="Düzenle"
                    onClick={() => {
                      setEditingItem(ent);
                      setShowModal(true);
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-btn delete"
                    aria-label="Sil"
                    onClick={async () => {
                      if (await apiFuel('delete', { id: ent.id })) {
                        setLastDeletedId(ent.id);
                        setInfoMsg('Yakıt kaydı silindi.');
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
            {!data.entries.length && (
              <div className="module-empty">
                <Fuel size={30} />
                <p>Bu ay için yakıt kaydı yok.</p>
                <small>İlk dolumu ekleyerek başlayın.</small>
              </div>
            )}
          </div>

          {data.monthly?.length > 0 && (
            <>
              <div className="module-heading compact">
                <h3>Aylık özet</h3>
                <span className="subtle">Son 6 kayıtlı ay</span>
              </div>
              <div className="fuel-history">
                {data.monthly.map((m) => (
                  <div key={m.month}>
                    <strong>{formatMonthName(m.month)}</strong>
                    <span>{formatNumber((m.liters_milli || 0) / 1000)} L</span>
                    <span>{formatMoney(m.amount_cents)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="empty">Yakıt kayıtları yükleniyor…</div>
      )}

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <section className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="close icon-btn" aria-label="Kapat" onClick={() => setShowModal(false)}>
              <X size={20} />
            </button>
            <span className="eyebrow">ARACINIZIN AYLIK KAYITLARI</span>
            <h2>{editingItem ? 'Yakıt kaydını düzenle' : 'Yakıt ekle'}</h2>

            <form onSubmit={handleSubmit}>
              <label>
                Araç adı / plaka
                <input
                  name="vehicle"
                  list="fuel-vehicles"
                  required
                  maxLength={60}
                  defaultValue={editingItem?.vehicle || vehicle || data?.vehicles?.[0] || ''}
                  placeholder="Örn. 34 ABC 123 veya Aile Arabası"
                />
              </label>
              <datalist id="fuel-vehicles">
                {(data?.vehicles || []).map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>

              <div className="form-row">
                <label>
                  Tarih
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={editingItem?.date || (month === getTodayString().slice(0, 7) ? getTodayString() : `${month}-01`)}
                  />
                </label>
                <label>
                  Yakıt türü
                  <select name="fuel_type" defaultValue={editingItem?.fuel_type || 'Benzin'}>
                    <option>Benzin</option>
                    <option>Motorin</option>
                    <option>LPG</option>
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label>
                  Alınan yakıt (Litre)
                  <input
                    name="liters"
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                    defaultValue={editingItem ? (editingItem.liters_milli || 0) / 1000 : ''}
                    placeholder="Örn. 35,5"
                  />
                </label>
                <label>
                  Toplam tutar (₺)
                  <input
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    defaultValue={editingItem ? (editingItem.amount_cents || 0) / 100 : ''}
                    placeholder="Örn. 1450"
                  />
                </label>
              </div>

              <label>
                Kilometre <span>(isteğe bağlı)</span>
                <input name="odometer" type="number" step="1" defaultValue={editingItem?.odometer ?? ''} />
              </label>

              <label>
                Not <span>(isteğe bağlı)</span>
                <textarea name="note" rows={2} defaultValue={editingItem?.note || ''} />
              </label>

              <button type="submit" className="primary" disabled={loading}>
                {loading ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// 5. MAIN HOME APP COMPONENT
// -----------------------------------------------------------------------------
export default function HomeApp() {
  const [homeData, setHomeData] = useState(null);
  const [items, setItems] = useState([]);
  const [currentTab, setCurrentTab] = useState('shop');
  const [categoryFilter, setCategoryFilter] = useState('Tümü');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedItemForActions, setSelectedItemForActions] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  const [authTab, setAuthTab] = useState('join');
  const [authLoading, setAuthLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [undoItem, setUndoItem] = useState(null);
  const [errorBanner, setErrorBanner] = useState('');
  const [recoveryCodeModal, setRecoveryCodeModal] = useState('');
  const [isOnline, setIsOnline] = useState(true);

  const actionQueueRef = useRef([]);
  const isSyncingRef = useRef(false);
  const toastTimerRef = useRef(null);

  function triggerToast(msg, undoObj = null) {
    setToastMsg(msg);
    setUndoItem(undoObj);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMsg('');
      setUndoItem(null);
    }, undoObj ? 10000 : 4000);
  }

  // Fetch full home data from Supabase-backed API
  async function refreshHome() {
    if (isSyncingRef.current || !navigator.onLine) return;
    isSyncingRef.current = true;
    try {
      // 1. Process any pending offline action queue
      while (actionQueueRef.current.length > 0) {
        const actionPayload = actionQueueRef.current[0];
        const res = await fetch('/api/home', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(actionPayload),
        });
        if (!res.ok) {
          if (res.status === 401) {
            handleLogoutClean();
            return;
          }
        }
        actionQueueRef.current.shift();
        localStorage.setItem('aile-actions', JSON.stringify(actionQueueRef.current));
      }

      // 2. Fetch fresh state
      const res = await fetch('/api/home');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      if (!json.family) {
        setHomeData(null);
        setItems([]);
      } else {
        setHomeData(json);
        setItems(json.items || []);
        localStorage.setItem('aile-cache', JSON.stringify(json));
      }
    } catch (err) {
      if (err.message !== 'Failed to fetch') {
        setErrorBanner(err.message);
      }
    } finally {
      isSyncingRef.current = false;
    }
  }

  function handleLogoutClean() {
    actionQueueRef.current = [];
    localStorage.removeItem('aile-actions');
    localStorage.removeItem('aile-cache');
    setHomeData(null);
    setItems([]);
    setShowFamilyModal(false);
    setShowAddModal(false);
    setShowTrashModal(false);
    triggerToast('Bu cihazdan çıkış yapıldı.');
  }

  // Initial load & Supabase Realtime Setup
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('aile-cache') || 'null');
      if (cached && cached.family) {
        setHomeData(cached);
        setItems(cached.items || []);
      }
      actionQueueRef.current = JSON.parse(localStorage.getItem('aile-actions') || '[]');
    } catch {}

    setIsOnline(navigator.onLine);
    refreshHome();

    // Supabase Realtime listener for live sync across all family phones/tablets!
    let channel = null;
    if (supabase) {
      channel = supabase
        .channel('madenci-home-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
          refreshHome();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_events' }, () => {
          refreshHome();
        })
        .subscribe();
    }

    const interval = setInterval(refreshHome, 8000);
    const onOnline = () => {
      setIsOnline(true);
      refreshHome();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Local optimistic update + queue sync
  function queueAction(actionType, itemObj) {
    const queueItem = {
      action: actionType,
      item: itemObj,
      op: crypto.randomUUID(),
    };
    actionQueueRef.current.push(queueItem);
    localStorage.setItem('aile-actions', JSON.stringify(actionQueueRef.current));

    // Optimistically update local state
    if (actionType === 'add') {
      setItems((prev) => [itemObj, ...prev.filter((i) => i.id !== itemObj.id)]);
    } else if (actionType === 'delete') {
      setItems((prev) => prev.filter((i) => i.id !== itemObj.id));
      setHomeData((prev) =>
        prev
          ? {
              ...prev,
              trash: [{ ...itemObj, deleted_at: new Date().toISOString() }, ...(prev.trash || [])],
            }
          : prev
      );
    } else if (actionType === 'restore') {
      setItems((prev) => [{ ...itemObj, deleted_at: null }, ...prev]);
      setHomeData((prev) =>
        prev
          ? {
              ...prev,
              trash: (prev.trash || []).filter((i) => i.id !== itemObj.id),
            }
          : prev
      );
    } else if (actionType === 'edit') {
      setItems((prev) => prev.map((i) => (i.id === itemObj.id ? { ...i, ...itemObj } : i)));
    } else if (actionType === 'update') {
      setItems((prev) => prev.map((i) => (i.id === itemObj.id ? { ...i, ...itemObj } : i)));
    }

    refreshHome();
  }

  // Auth submit
  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthLoading(true);
    setErrorBanner('');
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/home', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: authTab, ...Object.fromEntries(fd) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Giriş yapılamadı.');

      setHomeData(json);
      setItems(json.items || []);
      if (json.recoveryCode) setRecoveryCodeModal(json.recoveryCode);
      localStorage.setItem('aile-cache', JSON.stringify(json));
      triggerToast('Aile evine hoş geldiniz!');
    } catch (err) {
      setErrorBanner(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  // Add/Edit Item Form Submit
  function handleItemFormSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const priceVal = String(fd.get('price') || '').trim();
    const countVal = Number(String(fd.get('count') || '1').replace(',', '.'));

    const itemData = {
      name: String(fd.get('name')).trim(),
      quantity: String(fd.get('quantity') || '1 adet'),
      category: String(fd.get('category')),
      note: String(fd.get('note') || ''),
      unit_price_cents: priceVal === '' ? null : parsePriceToCents(priceVal),
      count_milli: Math.round(countVal * 1000),
    };

    if (editingItem) {
      queueAction('edit', { ...editingItem, ...itemData });
      triggerToast('Ürün güncellendi.');
    } else {
      const newItem = {
        id: crypto.randomUUID(),
        ...itemData,
        kind: currentTab === 'stock' ? 'stock' : 'shop',
        status: 'var',
        bought: 0,
      };
      queueAction('add', newItem);
      triggerToast(currentTab === 'stock' ? 'Ev stoklarına eklendi.' : 'Alışveriş listesine eklendi.');
    }

    setShowAddModal(false);
    setEditingItem(null);
  }

  // Claim item
  async function handleClaim(item, unclaim = false) {
    try {
      const res = await fetch('/api/home', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: unclaim ? 'unclaim' : 'claim',
          item: { id: item.id },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setHomeData(json);
      setItems(json.items || []);
      triggerToast(unclaim ? 'Ürünü üstlenmekten vazgeçtiniz.' : 'Bu ürünü siz alıyorsunuz.');
    } catch (err) {
      setErrorBanner(err.message);
    }
  }

  const shopItems = items.filter((i) => i.kind === 'shop');
  const stockItems = items.filter((i) => i.kind === 'stock');
  const pendingShopCount = shopItems.filter((i) => !i.bought).length;

  const filteredItems = items.filter((i) => {
    if (i.kind !== currentTab) return false;
    if (categoryFilter !== 'Tümü' && i.category !== categoryFilter) return false;
    if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (currentTab === 'shop') {
      if (statusFilter === 'todo' && i.bought) return false;
      if (statusFilter === 'done' && !i.bought) return false;
    } else if (currentTab === 'stock') {
      if (statusFilter === 'low' && i.status === 'var') return false;
    }
    return true;
  });

  const TAB_NAMES = {
    shop: 'Alışveriş listesi',
    stock: 'Evde ne var?',
    lists: 'Sık alınanlar ve listeler',
    calendar: 'Aile takvimi',
    bills: 'Fatura ve abonelikler',
    archive: 'Belgeler ve garantiler',
    fuel: 'Araç yakıt takibi',
  };

  return (
    <div className={`app ${currentTab === 'shop' ? 'compact-shopping' : ''}`}>
      {/* 1. NAVIGATION DRAWER */}
      {showDrawer && (
        <div className="overlay" onClick={() => setShowDrawer(false)}>
          <aside
            style={{ width: 'min(320px, 88vw)', position: 'fixed', inset: '0 auto 0 0', zIndex: 60 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-heading">
              <button
                className="brand brand-button"
                onClick={() => {
                  setCurrentTab('shop');
                  setShowDrawer(false);
                }}
              >
                <span className="brand-icon">
                  <House size={24} />
                </span>
                <span>
                  Aile Evi<small>BİRLİKTE DAHA KOLAY</small>
                </span>
              </button>
              <button className="icon-btn drawer-close" aria-label="Menüyü kapat" onClick={() => setShowDrawer(false)}>
                <X size={22} />
              </button>
            </div>

            <nav aria-label="Aile bölümleri">
              <div className="side-label">EVİNİZİN KÜÇÜK YARDIMCISI</div>
              <button
                className={`nav ${currentTab === 'shop' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentTab('shop');
                  setShowDrawer(false);
                }}
              >
                <ShoppingBasket size={21} /> Alışveriş listesi <span>{pendingShopCount}</span>
              </button>
              <button
                className={`nav ${currentTab === 'stock' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentTab('stock');
                  setShowDrawer(false);
                }}
              >
                <Package size={21} /> Evde ne var? <span>{stockItems.length}</span>
              </button>
              <button
                className={`nav ${currentTab === 'lists' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentTab('lists');
                  setShowDrawer(false);
                }}
              >
                <Star size={21} /> Hazır listeler
              </button>
              <button
                className={`nav ${currentTab === 'calendar' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentTab('calendar');
                  setShowDrawer(false);
                }}
              >
                <CalendarDays size={21} /> Takvim
              </button>
              <button
                className={`nav ${currentTab === 'bills' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentTab('bills');
                  setShowDrawer(false);
                }}
              >
                <Receipt size={21} /> Faturalar
              </button>
              <button
                className={`nav ${currentTab === 'archive' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentTab('archive');
                  setShowDrawer(false);
                }}
              >
                <FolderArchive size={21} /> Belgeler
              </button>
              <button
                className={`nav ${currentTab === 'fuel' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentTab('fuel');
                  setShowDrawer(false);
                }}
              >
                <Fuel size={21} /> Araç yakıt
              </button>
              <button
                className="nav"
                onClick={() => {
                  setShowDrawer(false);
                  setShowFamilyModal(true);
                }}
              >
                <Users size={21} /> Ailem <ChevronRight size={16} />
              </button>
            </nav>

            <div className="side-note">
              <div className="plant">
                <Leaf size={32} />
              </div>
              <h3>
                Küçük bir liste,
                <br />
                büyük bir kolaylık.
              </h3>
              <p>
                Eksikleri birlikte hatırlayın,
                <br />
                evinize zaman ayırın.
              </p>
            </div>

            <div className="side-bottom">
              <Heart size={15} /> Supabase ile kalıcı ve güvende.
            </div>
          </aside>
        </div>
      )}

      {/* 2. BODY CONTENT */}
      <div className="body">
        <header>
          <div className="header-location">
            <button className="menu-toggle" aria-label="Menüyü aç" onClick={() => setShowDrawer(true)}>
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              <span className="crumb">Evimiz</span>
              <ChevronRight size={13} />
              <span>{TAB_NAMES[currentTab]}</span>
            </span>
          </div>

          <div className="header-actions">
            <NotificationsCenter data={homeData} />
            <button className="family-pill" onClick={() => setShowFamilyModal(true)}>
              <span className="avatar">{(homeData?.me || 'A')[0]}</span>
              {homeData?.family?.name || 'Bizim Ev'}
              <ChevronRight size={14} />
            </button>
          </div>
        </header>

        <main>
          {currentTab !== 'shop' && (
            <button className="app-back" onClick={() => setCurrentTab('shop')}>
              <ArrowLeft size={17} /> Alışveriş listesine dön
            </button>
          )}

          <div className="eyebrow">EVİN İHTİYAÇLARI, TEK BİR YERDE</div>
          <div className="title-row">
            <div>
              <h1>
                {currentTab === 'shop'
                  ? 'Unutmadan, birlikte.'
                  : currentTab === 'stock'
                  ? 'Evde ne var, ne eksik?'
                  : TAB_NAMES[currentTab]}
              </h1>
              <p>
                {currentTab === 'shop'
                  ? 'Aklınıza geleni ekleyin. Alınanları işaretleyin. Gerisini birlikte halledin.'
                  : currentTab === 'stock'
                  ? 'Dolapları tekrar tekrar kontrol etmeden evinizdeki ihtiyaçları takip edin.'
                  : 'Ailenizin ortak kayıtları, Supabase üzerinde güvenle saklanır.'}
              </p>
            </div>

            {(currentTab === 'shop' || currentTab === 'stock') && (
              <button
                className="primary"
                disabled={!homeData?.family}
                onClick={() => {
                  setEditingItem(null);
                  setShowAddModal(true);
                }}
              >
                <Plus size={19} /> Ürün ekle
              </button>
            )}
          </div>

          {/* STATS OVERVIEW */}
          {(currentTab === 'shop' || currentTab === 'stock') && (
            <div className="stats">
              <div>
                <span className="stat-icon mint">
                  <ShoppingBasket />
                </span>
                <span>
                  <strong>{pendingShopCount}</strong>
                  <small>Alınacak ürün</small>
                </span>
              </div>
              <div>
                <span className="stat-icon peach">
                  <Check />
                </span>
                <span>
                  <strong>{shopItems.length - pendingShopCount}</strong>
                  <small>Sepete eklendi</small>
                </span>
              </div>
              <div>
                <span className="stat-icon yellow">
                  <Package />
                </span>
                <span>
                  <strong>{stockItems.filter((i) => i.status !== 'var').length}</strong>
                  <small>Evde azalan / biten</small>
                </span>
              </div>
            </div>
          )}

          {/* SHOPPING PRICE SUMMARY */}
          {homeData?.family && currentTab === 'shop' && (
            <div className="price-summary">
              <div>
                <small>Alışveriş toplamı</small>
                <strong>{formatMoney(shopItems.reduce((s, i) => s + calculateLineTotalCents(i), 0))}</strong>
              </div>
              <div>
                <small>Alınacaklar</small>
                <strong>
                  {formatMoney(shopItems.filter((i) => !i.bought).reduce((s, i) => s + calculateLineTotalCents(i), 0))}
                </strong>
              </div>
              <div>
                <small>Alınanlar</small>
                <strong>
                  {formatMoney(shopItems.filter((i) => i.bought).reduce((s, i) => s + calculateLineTotalCents(i), 0))}
                </strong>
              </div>
              <p>
                {shopItems.filter((i) => i.unit_price_cents == null).length} üründe fiyat yok. Toplamlar yalnızca fiyatı
                girilen ürünleri içerir.
              </p>
            </div>
          )}

          {/* STOCK AUTOMATION BANNER */}
          {homeData?.family && currentTab === 'stock' && (
            <div className="stock-automation">
              <div>
                <strong>Stoktan otomatik alışveriş listesi</strong>
                <p>Azaldı veya bitti işaretlenen ürün, alınacaklar listesinde yoksa otomatik eklenir.</p>
              </div>
              {homeData.isAdmin ? (
                <label className="stock-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(homeData.family.autoStock)}
                    onChange={async (e) => {
                      const enabled = e.target.checked;
                      await fetch('/api/modules', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'auto-stock', enabled }),
                      });
                      refreshHome();
                    }}
                  />
                  {homeData.family.autoStock ? 'Açık' : 'Kapalı'}
                </label>
              ) : (
                <span>{homeData.family.autoStock ? 'Açık' : 'Kapalı'}</span>
              )}
            </div>
          )}

          {errorBanner && (
            <div className="notice" role="alert">
              {errorBanner}
            </div>
          )}

          {/* MAIN VIEW CONTENT */}
          {homeData?.family ? (
            currentTab === 'fuel' ? (
              <FuelModule familyId={homeData.family.id} />
            ) : currentTab === 'shop' || currentTab === 'stock' ? (
              <section className="list-panel">
                <div className="panel-head">
                  <div>
                    <h2>{currentTab === 'shop' ? 'Alışveriş listemiz' : 'Ev stoklarımız'}</h2>
                    <span>
                      {currentTab === 'shop'
                        ? `${pendingShopCount} ürün alınmayı bekliyor`
                        : `${stockItems.length} ürün takip ediliyor`}
                    </span>
                  </div>

                  <div className="panel-tools">
                    <button className="trash-button" onClick={() => setShowTrashModal(true)}>
                      <Trash2 size={15} /> Silinenler
                      {homeData?.trash?.length ? ` (${homeData.trash.length})` : ''}
                    </button>
                    <div className="search">
                      <Search size={18} />
                      <input
                        aria-label="Ürün ara"
                        placeholder="Listede ara…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* CATEGORIES BAR */}
                <div className="categories">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      className={categoryFilter === cat ? 'chosen' : ''}
                      onClick={() => setCategoryFilter(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* LIST TOOLBAR */}
                <div className="list-toolbar">
                  <div className="filters">
                    {(currentTab === 'shop'
                      ? [
                          ['all', 'Hepsi'],
                          ['todo', 'Alınacaklar'],
                          ['done', 'Alınanlar'],
                        ]
                      : [
                          ['all', 'Hepsi'],
                          ['low', 'Azalan & biten'],
                        ]
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        className={statusFilter === val ? 'chosen' : ''}
                        onClick={() => setStatusFilter(val)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <span className="sync">
                    {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                    {actionQueueRef.current.length > 0
                      ? `${actionQueueRef.current.length} değişiklik senkronize ediliyor`
                      : isOnline
                      ? 'Supabase ile canlı senkronize'
                      : 'Çevrimdışı'}
                  </span>
                </div>

                {/* ITEMS LIST */}
                <div className="items">
                  {filteredItems.map((item) => (
                    <div key={item.id} className={`item ${item.bought ? 'done' : ''}`}>
                      {currentTab === 'shop' ? (
                        <button
                          className="checkbox"
                          aria-label={`${item.name} alındı olarak işaretle`}
                          onClick={() => queueAction('update', { ...item, bought: item.bought ? 0 : 1 })}
                        >
                          {Boolean(item.bought) && <Check size={17} />}
                        </button>
                      ) : (
                        <span className="food-icon">{CATEGORY_ICONS[item.category] || '🛍️'}</span>
                      )}

                      <div className="item-text">
                        <strong>{item.name}</strong>
                        <small>
                          {item.quantity}
                          {currentTab !== 'shop' && item.note && ` · ${item.note}`}
                        </small>
                        {currentTab !== 'shop' && item.unit_price_cents != null && (
                          <small className="item-price">
                            {(item.count_milli || 1000) / 1000} × {formatMoney(item.unit_price_cents)} ={' '}
                            <strong>{formatMoney(calculateLineTotalCents(item))}</strong>
                          </small>
                        )}
                        {currentTab === 'shop' && item.claimed_by && !item.bought && (
                          <span className="compact-claim">
                            {item.claimed_by === homeData.userId ? 'Siz alıyorsunuz' : `${item.claimed_name || 'Aile üyesi'} alıyor`}
                          </span>
                        )}
                      </div>

                      <span className="category-tag">{item.category}</span>

                      {currentTab === 'stock' && (
                        <>
                          <select
                            className={`status ${item.status}`}
                            value={item.status}
                            onChange={(e) => queueAction('update', { ...item, status: e.target.value })}
                          >
                            <option value="var">Var</option>
                            <option value="azaldı">Azaldı</option>
                            <option value="bitti">Bitti</option>
                          </select>
                          {item.status !== 'var' && (
                            <button
                              className="icon-btn"
                              title="Alışveriş listesine ekle"
                              onClick={() => {
                                queueAction('add', {
                                  id: crypto.randomUUID(),
                                  name: item.name,
                                  quantity: item.quantity,
                                  category: item.category,
                                  kind: 'shop',
                                  status: 'var',
                                  bought: 0,
                                });
                                triggerToast('Alışveriş listesine eklendi.');
                              }}
                            >
                              <Plus size={18} />
                            </button>
                          )}
                          <button
                            className="icon-btn"
                            title="Sık alınanlara kaydet"
                            onClick={async () => {
                              await fetch('/api/modules', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'favorite-save', id: item.id }),
                              });
                              triggerToast('Sık alınanlara kaydedildi.');
                            }}
                          >
                            <Star size={16} />
                          </button>
                          <button
                            className="icon-btn"
                            title="Düzenle"
                            onClick={() => {
                              setEditingItem(item);
                              setShowAddModal(true);
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-btn delete"
                            title="Sil"
                            onClick={() => {
                              queueAction('delete', item);
                              triggerToast('Ürün silindi.', item);
                            }}
                          >
                            <Trash2 size={17} />
                          </button>
                        </>
                      )}

                      {currentTab === 'shop' && (
                        <>
                          {item.unit_price_cents != null && (
                            <span className="compact-line-total">{formatMoney(calculateLineTotalCents(item))}</span>
                          )}
                          <button
                            className="icon-btn item-menu-toggle"
                            aria-label={`${item.name} işlemleri`}
                            onClick={() => setSelectedItemForActions(item)}
                          >
                            <Ellipsis size={21} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}

                  {!filteredItems.length && (
                    <div className="empty">
                      <span>🧺</span>
                      <h3>
                        {searchQuery || categoryFilter !== 'Tümü' || statusFilter !== 'all'
                          ? 'Burada ürün bulunamadı.'
                          : currentTab === 'shop'
                          ? 'Listemiz yeni bir başlangıca hazır.'
                          : 'Dolapta neler var?'}
                      </h3>
                      <p>
                        {searchQuery || categoryFilter !== 'Tümü' || statusFilter !== 'all'
                          ? 'Aramayı veya kategori filtrelerini değiştirebilirsiniz.'
                          : 'İlk ürününüzü ekleyerek başlayın.'}
                      </p>
                      <button
                        className="text-btn"
                        onClick={() => {
                          setEditingItem(null);
                          setShowAddModal(true);
                        }}
                      >
                        <Plus size={17} /> Ürün ekle
                      </button>
                    </div>
                  )}
                </div>

                <button
                  className="add-line"
                  onClick={() => {
                    setEditingItem(null);
                    setShowAddModal(true);
                  }}
                >
                  <Plus size={18} /> Aklınıza başka bir şey mi geldi? Ekleyin.
                </button>
              </section>
            ) : (
              <HouseholdModules tab={currentTab} familyData={homeData} onChanged={refreshHome} />
            )
          ) : (
            /* ONBOARDING VIEW (When no active family session) */
            <section className="onboard">
              <span className="intro-icon">
                <House size={32} />
              </span>
              <div>
                <span className="eyebrow">AİLE EVİ'NE HOŞ GELDİNİZ</span>
                <h2>Ailenize bir kodla katılın.</h2>
                <p>Adınızı ve aile kodunuzu yazın. Supabase veritabanında kalıcı olarak saklansın.</p>

                <div className="seg">
                  <button className={authTab === 'join' ? 'selected' : ''} onClick={() => setAuthTab('join')}>
                    Kodla katıl
                  </button>
                  <button className={authTab === 'create' ? 'selected' : ''} onClick={() => setAuthTab('create')}>
                    Yeni aile
                  </button>
                  <button className={authTab === 'recover' ? 'selected' : ''} onClick={() => setAuthTab('recover')}>
                    Yönetici girişi
                  </button>
                </div>

                <form onSubmit={handleAuthSubmit}>
                  {authTab !== 'recover' && (
                    <label>
                      Adınız
                      <input
                        name="name"
                        required
                        maxLength={50}
                        placeholder="Size nasıl hitap edelim?"
                        autoComplete="given-name"
                      />
                    </label>
                  )}
                  <label>
                    {authTab === 'create'
                      ? 'Ailenizin adı'
                      : authTab === 'recover'
                      ? 'Yönetici kurtarma kodu'
                      : 'Aile davet kodu'}
                    <input
                      name={authTab === 'create' ? 'familyName' : 'code'}
                      required
                      maxLength={authTab === 'create' ? 60 : 100}
                      placeholder={
                        authTab === 'create'
                          ? 'Örn. Madenci Evi'
                          : authTab === 'recover'
                          ? 'YON- ile başlayan özel kodunuz'
                          : 'Size gönderilen kodu yapıştırın'
                      }
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <button className="primary" disabled={authLoading}>
                    {authLoading ? (
                      <LoaderCircle size={18} className="spinning" />
                    ) : authTab === 'create' ? (
                      'Evimizi oluşturalım'
                    ) : authTab === 'recover' ? (
                      'Yönetici olarak giriş yap'
                    ) : (
                      'Aileye katıl'
                    )}
                    <ArrowRight size={18} />
                  </button>
                </form>

                <p className="subtle">
                  Gereksiz şifrelerle uğraşmayın. Kodla katıldığınızda cihazınız 90 gün boyunca güvenle açık kalır.
                </p>
              </div>
            </section>
          )}

          <div className="tip">
            <span>✦</span>
            <p>
              <strong>Birlikte daha kolay.</strong> Evin ihtiyaçları, takvim, faturalar ve araç yakıt takibi ailece aynı yerde.
            </p>
          </div>

          <footer>
            <span>
              Aile Evi <span>·</span> Evin küçük yardımcısı
            </span>
            <button
              onClick={() => {
                refreshHome();
                triggerToast('Liste güncellendi.');
              }}
            >
              <RefreshCw size={13} /> Listeyi yenile
            </button>
          </footer>
        </main>
      </div>

      {/* TOAST NOTIFICATION */}
      {toastMsg && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toastMsg}</span>
          {undoItem && (
            <button
              className="undo-button"
              onClick={() => {
                queueAction('restore', undoItem);
                triggerToast('Ürün geri getirildi.');
              }}
            >
              <Undo2 size={16} /> Geri al
            </button>
          )}
        </div>
      )}

      {/* ADD / EDIT ITEM MODAL */}
      {showAddModal && (
        <div className="overlay" onClick={() => setShowAddModal(false)}>
          <section className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="close icon-btn" aria-label="Kapat" onClick={() => setShowAddModal(false)}>
              <X size={20} />
            </button>
            <span className="eyebrow">{currentTab === 'shop' ? 'ALIŞVERİŞ LİSTEMİZ' : 'EV STOKLARIMIZ'}</span>
            <h2>{editingItem ? 'Ürünü düzenleyin.' : 'Yeni bir ürün ekleyin.'}</h2>

            <form onSubmit={handleItemFormSubmit}>
              <label>
                Ürün adı
                <input
                  name="name"
                  defaultValue={editingItem?.name || ''}
                  autoFocus
                  required
                  maxLength={100}
                  placeholder="Örn. Süt"
                />
              </label>

              <div className="form-row">
                <label>
                  Miktar
                  <input
                    name="quantity"
                    defaultValue={editingItem?.quantity || ''}
                    maxLength={60}
                    placeholder="Örn. 2 litre"
                  />
                </label>
                <label>
                  Kategori
                  <select name="category" defaultValue={editingItem?.category || CATEGORIES[1]}>
                    {CATEGORIES.slice(1).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label>
                  Birim fiyat (₺)
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={editingItem?.unit_price_cents != null ? editingItem.unit_price_cents / 100 : ''}
                    placeholder="İsteğe bağlı"
                  />
                </label>
                <label>
                  Fiyat hesabı miktarı
                  <input
                    name="count"
                    type="number"
                    min="0.001"
                    step="0.001"
                    defaultValue={(editingItem?.count_milli || 1000) / 1000}
                  />
                </label>
              </div>

              <label>
                Not <span>(isteğe bağlı)</span>
                <input
                  name="note"
                  defaultValue={editingItem?.note || ''}
                  maxLength={300}
                  placeholder="Örn. Laktozsuz olanından"
                />
              </label>

              <button className="primary" type="submit">
                {editingItem ? <Check size={18} /> : <Plus size={18} />}
                {editingItem ? 'Değişiklikleri kaydet' : 'Listeye ekle'}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* ITEM ACTIONS MODAL (Claim, Favorite, Edit, Delete) */}
      {selectedItemForActions && (
        <div className="overlay" onClick={() => setSelectedItemForActions(null)}>
          <section className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="close icon-btn" aria-label="Kapat" onClick={() => setSelectedItemForActions(null)}>
              <X size={20} />
            </button>
            <span className="eyebrow">ÜRÜN İŞLEMLERİ</span>
            <h2>{selectedItemForActions.name}</h2>
            <p>
              {selectedItemForActions.quantity}
              {selectedItemForActions.note && ` · ${selectedItemForActions.note}`}
            </p>
            {selectedItemForActions.unit_price_cents != null && (
              <p>
                {(selectedItemForActions.count_milli || 1000) / 1000} ×{' '}
                {formatMoney(selectedItemForActions.unit_price_cents)} ={' '}
                {formatMoney(calculateLineTotalCents(selectedItemForActions))}
              </p>
            )}

            <div style={{ display: 'grid', gap: '10px', marginTop: '20px' }}>
              {!selectedItemForActions.bought &&
                (!selectedItemForActions.claimed_by || selectedItemForActions.claimed_by === homeData?.userId) && (
                  <button
                    className="secondary"
                    onClick={() => {
                      handleClaim(selectedItemForActions, selectedItemForActions.claimed_by === homeData?.userId);
                      setSelectedItemForActions(null);
                    }}
                  >
                    <UserCheck size={18} />
                    {selectedItemForActions.claimed_by ? 'Üstlenmekten vazgeç' : 'Ben alıyorum'}
                  </button>
                )}
              {selectedItemForActions.claimed_by && selectedItemForActions.claimed_by !== homeData?.userId && (
                <p>{selectedItemForActions.claimed_name} alıyor.</p>
              )}
              <button
                className="secondary"
                onClick={async () => {
                  await fetch('/api/modules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'favorite-save', id: selectedItemForActions.id }),
                  });
                  setSelectedItemForActions(null);
                  triggerToast('Sık alınanlara kaydedildi.');
                }}
              >
                <Star size={18} /> Sık alınanlara kaydet
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setEditingItem(selectedItemForActions);
                  setSelectedItemForActions(null);
                  setShowAddModal(true);
                }}
              >
                <Pencil size={18} /> Ürünü düzenle
              </button>
              <button
                className="secondary danger"
                onClick={() => {
                  queueAction('delete', selectedItemForActions);
                  triggerToast('Ürün silindi.', selectedItemForActions);
                  setSelectedItemForActions(null);
                }}
              >
                <Trash2 size={18} /> Ürünü sil
              </button>
            </div>
          </section>
        </div>
      )}

      {/* TRASH MODAL */}
      {showTrashModal && (
        <div className="overlay" onClick={() => setShowTrashModal(false)}>
          <section className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="close icon-btn" aria-label="Kapat" onClick={() => setShowTrashModal(false)}>
              <X size={20} />
            </button>
            <span className="eyebrow">YANLIŞLIKLA SİLİNENLER İÇİN</span>
            <h2>Silinenler</h2>
            <p className="subtle">Son 7 günde silinen ürünler. Geri getirilen ürün kendi listesine döner.</p>

            {(homeData?.trash || []).length > 0 ? (
              <div style={{ marginTop: '20px' }}>
                {homeData.trash.map((tr) => (
                  <div
                    key={tr.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 0',
                      borderBottom: '1px solid #e9edde',
                    }}
                  >
                    <div>
                      <strong>{tr.name}</strong>
                      <small style={{ display: 'block', color: '#96a089' }}>
                        {tr.quantity} · {tr.kind === 'shop' ? 'Alışveriş listesi' : 'Ev stokları'}
                      </small>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => {
                        queueAction('restore', tr);
                        triggerToast('Ürün geri getirildi.');
                      }}
                    >
                      <Undo2 size={15} /> Geri getir
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                <Undo2 size={30} />
                <h3>Geri getirilecek ürün yok.</h3>
                <p>Yeni sildiğiniz ürünler burada görünecek.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* FAMILY SETTINGS MODAL */}
      {showFamilyModal && (
        <FamilySettingsDialog
          data={homeData}
          onClose={() => setShowFamilyModal(false)}
          onChanged={refreshHome}
          onLogout={handleLogoutClean}
        />
      )}

      {/* RECOVERY CODE MODAL (Show once on family creation) */}
      {recoveryCodeModal && (
        <div className="overlay">
          <section className="dialog" role="dialog" aria-modal="true">
            <span className="eyebrow">YÖNETİCİ ERİŞİMİNİZİ KORUYUN</span>
            <h2>Kurtarma kodunuzu kaydedin.</h2>
            <p>
              Bu kod yalnızca şimdi gösterilir. Oturumunuz silinirse aynı aileye yönetici olarak dönebilmeniz için güvenli
              bir yerde saklayın.
            </p>
            <div className="invite">
              <span>{recoveryCodeModal}</span>
              <button
                className="icon-btn"
                aria-label="Kopyala"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(recoveryCodeModal);
                    triggerToast('Kurtarma kodu kopyalandı.');
                  } catch {}
                }}
              >
                <Copy size={18} />
              </button>
            </div>
            <p className="subtle">Aile üyelerine davet kodunu gönderin. Bu yönetici kodunu kimseyle paylaşmayın.</p>
            <button className="primary" style={{ marginTop: '20px' }} onClick={() => setRecoveryCodeModal('')}>
              Kodu kaydettim, devam et
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
