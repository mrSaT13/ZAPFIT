import React, { useEffect, useState, useRef } from 'react';
import { Users, UserPlus, Heart, Activity, CloudOff, MessageSquare, Send } from 'lucide-react';
import SecureImage from './SecureImage';
import RideModal from './RideModal';
import { toast } from 'react-toastify';
import { withAlpha } from '../theme';

const api = () => (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;

export default function Followers({ theme, accentColor, onNavigate }) {
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [feed, setFeed] = useState([]);
  const [myFeed, setMyFeed] = useState([]);
  const [feedSource, setFeedSource] = useState(null); // 'friends' | 'server' | 'local'
  const [feedError, setFeedError] = useState(null);
  const [mineError, setMineError] = useState(null);
  const [mineOffline, setMineOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('mine');
  const [selected, setSelected] = useState(null);
  // Кэш профилей авторов (как в мобилке _profileCache): userId -> {name, photo}
  const profileCache = useRef({});
  const authorMapRef = useRef({});
  const [commentCounts, setCommentCounts] = useState({});
  const [openComments, setOpenComments] = useState(null);
  const [commentsById, setCommentsById] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [sending, setSending] = useState(null);

  // Догрузка профилей авторов батчами по 5 (мобильный _fetchProfilesBatch)
  const enrichAuthors = async (items) => {
    const a = api();
    if (!a?.zapfitGetUserById) return;
    // Подписки уже в кэше — их не дергаем
    Object.entries(authorMapRef.current).forEach(([id, p]) => {
      if (!profileCache.current[id] && (p.name || p.photo)) profileCache.current[id] = p;
    });
    const ids = [...new Set(
      items.filter((i) => !i._localKm && i.user_id != null).map((i) => i.user_id),
    )].filter((id) => !profileCache.current[id]);
    for (let b = 0; b < ids.length; b += 5) {
      const batch = ids.slice(b, b + 5);
      const res = await Promise.all(
        batch.map((id) => a.zapfitGetUserById(id).then((r) => ({ id, r })).catch(() => ({ id, r: null }))),
      );
      let changed = false;
      res.forEach(({ id, r }) => {
        if (r?.success && r.user) {
          profileCache.current[id] = {
            name: r.user.name || r.user.username || '',
            photo: r.user.photo_path || r.user.photo_url || null,
          };
          changed = true;
        }
      });
      if (changed) {
        setFeed((prev) => prev.map((it) => {
          const p = profileCache.current[it.user_id];
          if (!p || it._localKm) return it;
          return {
            ...it,
            userName: it.userName ?? it.username ?? it.user_name ?? p.name ?? null,
            userPhotoUrl: it.userPhotoUrl ?? it.user_photo_url ?? it.user_photo ?? p.photo ?? null,
          };
        }));
      }
    }
  };

  const loadCommentCounts = async (items) => {
    const a = api();
    if (!a?.zapfitGetActivityCommentCounts) return;
    const ids = items
      .filter((i) => !i._localKm && (i.id ?? i.server_id) != null)
      .map((i) => i.id ?? i.server_id)
      .slice(0, 100);
    if (!ids.length) return;
    try {
      const r = await a.zapfitGetActivityCommentCounts(ids);
      if (r?.success) setCommentCounts(r.counts || {});
    } catch (_) {}
  };

  const toggleComments = async (key, serverId) => {
    if (openComments === key) {
      setOpenComments(null);
      return;
    }
    setOpenComments(key);
    if (!commentsById[key] && serverId != null) {
      try {
        const r = await api()?.zapfitGetActivityComments(serverId);
        if (r?.success) setCommentsById((c) => ({ ...c, [key]: r.comments || [] }));
      } catch (_) {}
    }
  };

  const sendComment = async (key, serverId) => {
    const text = (commentDrafts[key] || '').trim();
    if (!text || sending) return;
    setSending(key);
    try {
      const r = await api()?.zapfitCreateActivityComment(serverId, text);
      if (r?.success && r.comment) {
        setCommentsById((c) => ({ ...c, [key]: [...(c[key] || []), r.comment] }));
        setCommentCounts((cc) => ({ ...cc, [String(serverId)]: (cc[String(serverId)] || 0) + 1 }));
        setCommentDrafts((d) => ({ ...d, [key]: '' }));
      }
    } catch (_) {} finally {
      setSending(null);
    }
  };

  // Маппинг аватара как в мобилке (ActivityRecord.fromServerJson):
  // user_photo_url → user_photo → user.photo_path / user.photo_url
  const avatarOf = (a) =>
    a.userPhotoUrl ??
    a.user_photo_url ??
    a.user_photo ??
    a.user?.photo_path ??
    a.user?.photo_url ??
    a.photo_path ??
    null;
  const authorOf = (a) =>
    a.userName ?? a.username ?? a.user_name ?? a.user?.name ?? a.user?.username ?? null;

  // Нормализация серверной записи под RideModal (км, секунды, как локальные строки)
  const toRideModal = (a) => {
    const distM = a.distance ?? a.distance_meters ?? a.total_distance ?? 0;
    const distKm = a._localKm
      ? Number(distM)
      : Number(distM) > 500
        ? Number(distM) / 1000
        : Number(distM);
    return {
      id: a.id ?? a.server_id ?? a.activity_id ?? null,
      server_id: a.server_id ?? a.id ?? null,
      title: a.name || a.title || 'Активность',
      date: a.start_time || a.started_at || a.date || new Date().toISOString(),
      start_time: a.start_time || a.started_at || a.date || null,
      distance: distKm,
      duration: a.duration ?? a.durationSeconds ?? a.total_timer_time ?? 0,
      elevation_gain: a.elevation_gain ?? a.elevation ?? a.ascent ?? 0,
      avg_hr: a.avg_hr ?? a.average_hr ?? null,
      max_hr: a.max_hr ?? a.max_heart_rate ?? null,
      avg_speed: a.average_speed ?? a.avg_speed ?? 0,
      calories: a.calories ?? null,
      tss: a.tss ?? a.training_stress_score ?? a.hr_tss ?? 0,
      activity_type: a.activity_type ?? 1,
      type: a.type || 'RIDE',
      map_thumbnail_path: a.map_thumbnail_path || a.thumbnail_path || null,
      gear_id: a.gear_id || null,
      points: '[]',
      photos: null,
      comments: a.description || a.notes || '',
    };
  };

  const load = async () => {
    setLoading(true);
    setFeedError(null);
    setMineError(null);
    setMineOffline(false);
    try {
      const api = window.electronAPI;
      // Карта авторов из списка подписок (имена/фото уже догружены бэкендом)
      const authorMap = authorMapRef.current = {};
      if (api?.zapfitGetFollowers) {
        try {
          const r = await api.zapfitGetFollowers();
          if (r?.success) {
            const arr = Array.isArray(r.followers) ? r.followers : (r.followers?.records || r.followers || []);
            setFollowers(arr || []);
          }
        } catch (_) {}
      }
      if (api?.zapfitGetFollowing) {
        try {
          const r2 = await api.zapfitGetFollowing();
          if (r2?.success) {
            const arr2 = Array.isArray(r2.following) ? r2.following : (r2.following?.records || r2.following || []);
            setFollowing(arr2 || []);
            (arr2 || []).forEach((u) => {
              const uid = u.following_id ?? u._targetId ?? u.id;
              if (uid != null) {
                authorMap[uid] = {
                  name: u.username || u.name || '',
                  photo: u.photo_path || u.photo_url || null,
                };
              }
            });
          }
        } catch (_) {}
      }
      // Свой профиль — подпись своих активностей (как в мобилке)
      let self = null;
      try {
        const pr = await api?.zapfitGetProfile?.();
        if (pr?.success && pr.profile) {
          self = {
            id: pr.profile.id ?? null,
            name: pr.profile.name || pr.profile.username || '',
            photo: pr.profile.photo_path || pr.profile.photo_url || null,
          };
        }
      } catch (_) {}
      if (!self) {
        try {
          const u = await api?.getUser?.();
          if (u) self = { id: u.id ?? null, name: u.name || '', photo: u.photo_path || null };
        } catch (_) {}
      }
      const applyAuthorMap = (items) => items.map((it) => {
        if (it._localKm) return it;
        const p = authorMap[it.user_id];
        if (!p) return it;
        return {
          ...it,
          userName: it.userName ?? it.username ?? it.user_name ?? p.name ?? null,
          userPhotoUrl: it.userPhotoUrl ?? it.user_photo_url ?? it.user_photo ?? p.photo ?? null,
        };
      });
      const applySelf = (items) => items.map((it) => {
        if (!self) return it;
        if (it.user_id != null && self.id != null && it.user_id !== self.id) return it;
        if (it._localKm && it.user_id != null && self.id != null && it.user_id !== self.id) return it;
        return {
          ...it,
          userName: it.userName ?? it.username ?? it.user_name ?? self.name ?? null,
          userPhotoUrl: it.userPhotoUrl ?? it.user_photo_url ?? it.user_photo ?? self.photo ?? null,
        };
      });
      const prettyErr = (raw) => (/401|unauthorized|expired|не авторизован/i.test(String(raw))
        ? 'Сессия истекла (401). Войдите заново: Настройки → ZAPFIT.'
        : raw);
      // --- Моя лента: сервер + локальная база (мобильный _myFeedMerged) ---
      let mine = [];
      const mineErrs = [];
      try {
        const a = await api?.zapfitGetActivities?.({ page: 1, perPage: 30 });
        const arr = a?.activities?.records || a?.activities || [];
        if (a?.success && Array.isArray(arr)) {
          mine = arr;
        } else if (a && !a.success && a.error) {
          mineErrs.push(a.error);
        }
      } catch (e) {
        mineErrs.push(e?.message || String(e));
      }
      try {
        const local = await api?.getActivities?.();
        if (Array.isArray(local) && local.length) {
          const have = new Set(mine.map((m) => m.id ?? m.server_id ?? m.activity_id).filter((v) => v != null));
          local.slice(0, 50).forEach((r) => {
            const sid = r.server_id ?? null;
            if (sid != null && mine.some((m) => (m.id ?? m.server_id) === sid)) return;
            if (r.id != null && have.has(r.id)) return;
            mine.push({ ...r, _localKm: true });
          });
          if (mineErrs.length) setMineOffline(true);
        }
      } catch (_) {}
      mine.sort((x, y) => new Date(y.start_time || y.started_at || y.date || 0) - new Date(x.start_time || x.started_at || x.date || 0));
      mine = applySelf(applyAuthorMap(mine));
      setMyFeed(mine);
      if (!mine.length && mineErrs.length) setMineError(prettyErr(mineErrs[0]));
      // --- Лента друзей ---
      let items = [];
      const errs = [];
      try {
        const f = await api?.zapfitGetFriendsFeed?.({ page: 1, perPage: 30 });
        if (f?.success && Array.isArray(f.feed)) {
          items = f.feed;
          setFeedSource('friends');
        } else if (f && !f.success && f.error) {
          errs.push(f.error);
        }
      } catch (e) {
        errs.push(e?.message || String(e));
      }
      items = applySelf(applyAuthorMap(items));
      setFeed(items);
      if (!items.length && errs.length) setFeedError(prettyErr(errs[0]));
      const all = [...mine, ...items];
      if (all.length) {
        enrichAuthors(all);
        loadCommentCounts(all);
      }
    } catch(e){ console.error(e); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); },[]);

  // Карточка активности (общая для «Мои» и «Друзья»)
  const renderCard = (a) => {
    const title = a.name || a.title || 'Активность';
    const d = a.start_time || a.started_at || a.date;
    const distM = a.distance ?? a.distance_meters ?? a.total_distance ?? 0;
    // Локальная база хранит км, сервер — метры
    const distKm = a._localKm ? Number(distM).toFixed(2) : (distM > 500 ? (Number(distM) / 1000).toFixed(2) : Number(distM).toFixed(2));
    const dur = a.duration ?? a.durationSeconds ?? a.total_timer_time ?? 0;
    const hrs = Math.floor(dur / 3600), mins = String(Math.floor((dur % 3600) / 60)).padStart(2, '0'), secs = String(dur % 60).padStart(2, '0');
    const timeStr = `${hrs}:${mins}:${secs}`;
    const hr = a.avg_hr ?? a.average_hr ?? a.avgHeartRate ?? null;
    const thumb = a.map_thumbnail_path || a.thumbnail_path || a.thumbnailUrl || a.thumbnail_url;
    const userName = authorOf(a);
    const userPhoto = avatarOf(a);
    const kind = (a.type || a.activity_type || '').toString().toLowerCase();
    const iconColor = kind.includes('run') ? '#ef4444' : kind.includes('bike') || kind.includes('ride') ? '#3b82f6' : '#10b981';
    const cardKey = a.id ?? a.server_id ?? `local-${a.user_id}-${d}`;
    const commentSid = a._localKm ? (a.server_id ?? null) : (a.id ?? a.server_id ?? null);
    const commentCount = commentSid != null ? (commentCounts[String(commentSid)] || 0) : 0;
    return (
      <div
        key={cardKey}
        className="zap-card overflow-hidden cursor-pointer transition-transform hover:scale-[1.01]"
        onClick={() => setSelected(toRideModal(a))}
        title="Открыть детали"
      >
        <div className="p-4 flex gap-3 items-center">
          <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ border: `2px solid ${withAlpha(accentColor, 0.5)}`, backgroundColor: withAlpha(accentColor, 0.1) }}>
            {userPhoto ? <SecureImage src={userPhoto} className="w-full h-full object-cover" /> : <span className="font-bold text-sm" style={{ color: accentColor }}>{(userName || title || '?')[0].toUpperCase()}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate text-sm">{userName || title}</div>
            <div className={`text-xs ${muted} truncate`}>{userName ? `${title} • ` : ''}{d ? new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''}</div>
          </div>
          <span className="p-2 rounded-xl shrink-0" style={{ backgroundColor: withAlpha(iconColor, 0.14) }}>
            <Activity size={18} style={{ color: iconColor }} />
          </span>
        </div>
        {thumb ? <SecureImage src={thumb} className="w-full h-[180px] object-cover" /> : null}
        <div className="px-4 py-3 flex gap-6">
          <div><span className="font-bold">{distKm}</span> <span className={`text-[11px] ${muted}`}>км</span></div>
          <div><span className="font-bold">{timeStr}</span> <span className={`text-[11px] ${muted}`}>время</span></div>
          {hr ? <div><span className="font-bold">{hr}</span> <span className={`text-[11px] ${muted}`}>пульс</span></div> : null}
        </div>
        {commentSid != null && (
          <div className="px-4 pb-3" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => toggleComments(cardKey, commentSid)}
              className="flex items-center gap-1.5 text-xs font-semibold hover:opacity-80"
              style={{ color: accentColor }}
            >
              <MessageSquare size={14} />
              {commentCount > 0 ? `Комментарии (${commentCount})` : 'Комментировать'}
            </button>
            {openComments === cardKey && (
              <div className="mt-2 space-y-2">
                {(commentsById[cardKey] || []).map((cm) => (
                  <div key={cm.id} className="text-xs rounded-xl px-2.5 py-1.5 bg-white/5">
                    <span className="font-bold">
                      {profileCache.current[cm.user_id]?.name || `User ${cm.user_id}`}
                    </span>
                    <span className="opacity-90"> {cm.content}</span>
                    <div className={`text-[10px] ${muted} mt-0.5`}>
                      {cm.created_at ? new Date(cm.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  </div>
                ))}
                {(commentsById[cardKey] || []).length === 0 && (
                  <div className={`text-[11px] ${muted}`}>Пока пусто — станьте первым</div>
                )}
                <div className="flex gap-1.5">
                  <input
                    value={commentDrafts[cardKey] || ''}
                    onChange={(e) => setCommentDrafts((dr) => ({ ...dr, [cardKey]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendComment(cardKey, commentSid); }}
                    placeholder="Написать комментарий..."
                    maxLength={2000}
                    className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-xl border text-xs outline-none ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                  <button
                    onClick={() => sendComment(cardKey, commentSid)}
                    disabled={sending === cardKey || !(commentDrafts[cardKey] || '').trim()}
                    className="p-2 rounded-xl disabled:opacity-40"
                    style={{ backgroundColor: withAlpha(accentColor, 0.16), color: accentColor }}
                    title="Отправить"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Список ленты с ошибкой и пустым состоянием
  const renderFeedList = (items, err, emptyText, offlineBadge) => (
    <>
      {offlineBadge && items.length > 0 && (
        <div className="zap-card px-4 py-2.5 text-xs flex items-center gap-2" style={{ opacity: 0.85 }}>
          <CloudOff size={14} />
          <span className={muted}>Нет связи с сервером — показаны локальные копии</span>
        </div>
      )}
      {err && items.length === 0 && (
        <div className="zap-card p-4 text-sm" style={{ borderColor: withAlpha('#f59e0b', 0.4), backgroundColor: withAlpha('#f59e0b', 0.08) }}>
          <div className="font-bold mb-1">Не удалось загрузить ленту</div>
          <div className={`text-xs ${muted} mb-3 break-words`}>{err}</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={load}
              className="px-4 py-2 rounded-2xl text-xs font-bold"
              style={{ backgroundColor: withAlpha(accentColor, 0.16), color: accentColor }}
            >
              Повторить
            </button>
            {onNavigate && (
              <button
                onClick={() => onNavigate('settings')}
                className="px-4 py-2 rounded-2xl text-xs font-semibold hover:bg-white/10"
              >
                Проверить подключение
              </button>
            )}
          </div>
        </div>
      )}
      {items.length === 0 && !err
        ? <div className="zap-card p-12 text-center text-sm" style={{ opacity: 0.6 }}>{emptyText}</div>
        : <div className="space-y-3">{items.map((a) => renderCard(a))}</div>}
    </>
  );

  const cardBg = theme==='dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm';
  const muted = theme==='dark' ? 'text-gray-400' : 'text-slate-500';

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl shrink-0" style={{backgroundColor: withAlpha(accentColor, 0.16)}}><Users size={22} style={{color:accentColor}}/></div>
        <div className="flex-1 min-w-0">
          <h1 className={`text-2xl sm:text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent ${theme === 'dark' ? 'from-white to-gray-400' : 'from-slate-900 to-slate-500'}`}>Лента</h1>
          <p className={`text-sm ${muted}`}>Активности друзей и подписки</p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 rounded-2xl text-sm font-semibold shrink-0 transition-colors"
          style={{ backgroundColor: withAlpha(accentColor, 0.12), color: accentColor }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = withAlpha(accentColor, 0.2); }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = withAlpha(accentColor, 0.12); }}
        >
          Обновить
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[
          { id: 'mine', label: `Мои (${myFeed.length})` },
          { id: 'feed', label: 'Друзья' },
          { id: 'followers', label: `Подписчики (${followers.length})` },
          { id: 'following', label: `Подписки (${following.length})` },
        ].map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-all ${active ? 'shadow-sm' : ''}`}
              style={active ? { backgroundColor: withAlpha(accentColor, 0.16), color: accentColor } : {}}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = withAlpha(accentColor, 0.07); }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {loading ? <div className={`p-8 text-center ${muted}`}>Загрузка...</div> :
        tab==='followers' ? (
          followers.length===0 ? <div className="zap-card p-12 text-center text-sm" style={{color:'inherit', opacity:0.6}}>Нет подписчиков. Найдите друзей через поиск.</div> :
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {followers.map(u=>{
              const name = u.username || u.name || u.display_name || `User ${u._targetId||u.following_id||u.follower_id||u.id}`;
              const avatar = u.photo_path || u.avatar_path || u.photo_url;
              const key = u.follower_id || u.following_id || u.id;
              return (
                <div key={key} className="zap-card p-4 flex gap-3 items-center">
                  <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ border: `2px solid ${withAlpha(accentColor, 0.5)}`, backgroundColor: withAlpha(accentColor, 0.1) }}>
                    {avatar ? <SecureImage src={avatar} className="w-full h-full object-cover" /> : <span className="text-lg font-bold" style={{color:accentColor}}>{String(name)[0]}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate text-sm">{name}</div>
                    <div className={`text-xs ${muted}`}>{u.is_accepted ? 'подписчик' : 'ожидает'}</div>
                  </div>
                  <Heart size={16} className="text-red-500 shrink-0" />
                </div>
              );
            })}
          </div>
        ) : tab==='following' ? (
          following.length===0 ? <div className="zap-card p-12 text-center text-sm" style={{opacity:0.6}}>Нет подписок. Подпишитесь на атлетов.</div> :
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {following.map(u=>{
              const name = u.username || u.name || u.display_name || `User ${u._targetId||u.following_id||u.follower_id||u.id}`;
              const avatar = u.photo_path || u.avatar_path || u.photo_url;
              const key = u.following_id || u.follower_id || u.id;
              return (
                <div key={key} className="zap-card p-4 flex gap-3 items-center">
                  <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ border: `2px solid ${withAlpha(accentColor, 0.5)}`, backgroundColor: withAlpha(accentColor, 0.1) }}>
                    {avatar ? <SecureImage src={avatar} className="w-full h-full object-cover" /> : <span className="text-lg font-bold" style={{color:accentColor}}>{String(name)[0]}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate text-sm">{name}</div>
                    <div className={`text-xs ${muted}`}>{u.is_accepted ? 'подписка ✓' : 'ожидает'}</div>
                  </div>
                  <Heart size={16} className="text-red-500 shrink-0" />
                </div>
              );
            })}
          </div>
        ) : tab === 'mine' ? (
          renderFeedList(myFeed, mineError, 'Ваших тренировок пока нет. Запишите первую из Активностей.', mineOffline)
        ) : (
          renderFeedList(feed, feedError, 'Лента пуста. Подпишитесь на атлетов.', feedSource === 'local')
        )}
      {selected && (
        <RideModal ride={selected} onClose={() => setSelected(null)} theme={theme} />
      )}
    </div>
  );
}
