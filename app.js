/* ============================================================
   银河之约 · 情侣空间（本地 / 云端 双模式）
   ------------------------------------------------------------
   【本地模式】默认。数据保存在本机浏览器 localStorage，
   同一台设备上两个账号用配对码共享空间。断网可用。

   【云端模式】两人各自手机/电脑实时同步。
   1. 去 supabase.com 用 GitHub 登录并创建项目（免费）；
   2. 按 说明.md 第 5 节运行建表 SQL；
   3. 把 Project URL / anon key 填到下面 CLOUD，enabled 改 true。
   数据存到 Supabase：lm_users / lm_couples / lm_entries 三张表，
   照片存到它的 Storage。两台设备登录即可同步。
   ============================================================ */
(function () {
  'use strict';

  /* ============ ★ 云端配置（联网同步只需改这里） ============ */
  const CLOUD = {
    enabled: true,           // true = 开启云端同步
    supabaseUrl: 'https://yvjlpyfuejgncsnswxae.supabase.co',
    supabaseKey: 'sb_publishable_kYs0WWcvoDJIX-Fozjk2vg_tzwea2hl',
  };
  window.CLOUD = CLOUD;      // 暴露给首页留言板的「给作者的建议」复用同一份配置
  const POLL_MS = 20000;     // 云端模式下，每隔多久拉取一次TA的新记录
  const BUILD = '2026.11.10 · 20261110i';   // 当前前端版本，用于确认是否已更新到最新

  const $ = (id) => document.getElementById(id);
  const LS = {
    users: 'ot_users',
    couples: 'ot_couples',
    session: 'ot_session',
    token: 'ot_couple_token',
    entries: (code) => 'ot_entries_' + code,
    msgs: (code) => 'ot_msgs_' + code,
    chatSeen: (code) => 'ot_chatseen_' + code,
    caps: (code) => 'ot_caps_' + code,
    daily: (code) => 'ot_daily_' + code,
    bucket: (code) => 'ot_bucket_' + code,
    shares: 'ot_shares',
  };
  const MOODS = ['晴朗', '微风', '多云', '小雨', '开心', '想念', '平静', '激动', '疲惫', '治愈'];
  const THEMES = ['deep', 'light', 'warm'];
  const THEME_LABEL = { deep: '深空', light: '极简白', warm: '胶片暖' };
  const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'mp3', 'm4a', 'wav', 'ogg',
    'mp4', 'mov', 'pdf', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'json'];

  /* ---- 主题皮肤：进页面立刻生效，首页与应用共用 ---- */
  function applyTheme(t) {
    const theme = THEMES.includes(t) ? t : 'deep';
    if (theme === 'deep') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('ot_theme', theme); } catch { /* 隐私模式忽略 */ }
  }
  try { applyTheme(localStorage.getItem('ot_theme') || 'deep'); } catch { applyTheme('deep'); }

  /* ---------------- 基础存储（本地模式 + 云端模式的缓存） ---------------- */
  const store = {
    read(k, fb) {
      try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; }
      catch { return fb; }
    },
    write(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  };

  let cacheUsers = null;       // 云端模式下的内存缓存
  let cacheCouples = null;
  let cacheEntries = {};       // code -> [entries]
  let cacheMsgs = {};          // code -> [messages]
  let chatReady = true;        // 云端私信表是否可用
  let syncTimer = null;

  const cloudOn = () => CLOUD.enabled && typeof window.supabase !== 'undefined';

  function loadUsers() { return cloudOn() ? (cacheUsers || {}) : store.read(LS.users, {}); }
  function saveUsers(u) {
    if (cloudOn()) { cacheUsers = u; return; }
    store.write(LS.users, u);
  }
  function loadCouples() { return cloudOn() ? (cacheCouples || {}) : store.read(LS.couples, {}); }
  function saveCouples(c) {
    if (cloudOn()) { cacheCouples = c; return; }
    store.write(LS.couples, c);
  }
  function loadEntries(code) { return cloudOn() ? (cacheEntries[code] || []) : store.read(LS.entries(code), []); }
  function saveEntries(code, list) {
    if (cloudOn()) { cacheEntries[code] = list; return; }
    store.write(LS.entries(code), list);
  }
  function loadMsgs(code) { return cloudOn() ? (cacheMsgs[code] || []) : store.read(LS.msgs(code), []); }
  function saveMsgs(code, list) {
    if (cloudOn()) { cacheMsgs[code] = list; return; }
    store.write(LS.msgs(code), list);
  }

  /* ---------------- 工具 ---------------- */
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'h' + h.toString(36);
  }
  function randCode() {
    const cs = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 6; i++) c += cs[Math.floor(Math.random() * cs.length)];
    return c;
  }
  function genCode() {
    const couples = loadCouples();
    let c = '';
    do { c = randCode(); } while (couples[c]);
    return c;
  }
  function todayKey(d = new Date()) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function fmtTs(ts) {
    const d = new Date(ts);
    const t = todayKey(d);
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (t === todayKey()) return '今天 ' + hm;
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (t === todayKey(y)) return '昨天 ' + hm;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  }
  function compressImageMax(file, max) {
    return new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * s));
        const h = Math.max(1, Math.round(img.height * s));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
      img.src = url;
    });
  }
  function compressImage(file) { return compressImageMax(file, 1280); }
  function newEntryId() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function newMsgId() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function fmtSize(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function safeUrl(u) {
    const s = String(u || '');
    return (s.startsWith('https://') || s.startsWith('http://') || s.startsWith('data:')) ? s : '';
  }
  function fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('read'));
      r.readAsDataURL(file);
    });
  }
  function fileExt(name) {
    return String(name || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
  }
  function extAllowed(name, type) {
    if (String(type || '').startsWith('image/')) return true;
    if (String(type || '').startsWith('audio/')) return true;
    return ALLOWED_EXT.includes(fileExt(name));
  }
  function fmtDuration(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function monthLabel(ym) {
    const [y, m] = ym.split('-');
    return `${y} · ${m} 月`;
  }

  /* ---- 头像：有自定义头像用图片，否则用昵称首字 ---- */
  function avatarHtml(u, cls) {
    const c = cls || 'ec-avatar';
    if (u && u.avatar) return `<span class="${c} av"><img src="${safeUrl(u.avatar)}" alt="" loading="lazy" /></span>`;
    return `<span class="${c}">${esc(((u && u.nick) || '?').slice(0, 1))}</span>`;
  }
  function pickImage(accept, cb) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept || 'image/*';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) cb(f); };
    inp.click();
  }

  /* ---- 纪念日日历 .ics：每一年重复，UID 稳定，导入一次就能长期用 ---- */
  function icsEscape(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }
  function icsDate(d) {
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }
  function icsStamp() {
    const d = new Date();
    return icsDate(d) + 'T' + String(d.getUTCHours()).padStart(2, '0') +
      String(d.getUTCMinutes()).padStart(2, '0') + String(d.getUTCSeconds()).padStart(2, '0') + 'Z';
  }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d;
  }
  function makeICS() {
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Galactic Promise//love-memory//CN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + icsEscape('银河之约 · 我们的纪念日'),
      'X-WR-TIMEZONE:Asia/Shanghai',
      'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    ];
    const ev = (uid, start, end, summary, desc, yearly) => {
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + uid);
      lines.push('DTSTAMP:' + icsStamp());
      lines.push('DTSTART;VALUE=DATE:' + start);
      lines.push('DTEND;VALUE=DATE:' + end);
      if (yearly) lines.push('RRULE:FREQ=YEARLY');
      lines.push('SUMMARY:' + icsEscape(summary));
      lines.push('DESCRIPTION:' + icsEscape(desc));
      lines.push('TRANSP:TRANSPARENT');
      lines.push('END:VEVENT');
    };
    const code = couple.code;
    if (couple.since) {
      const since = couple.since;
      ev(`lm-${code}-anniv@galactic-promise`, icsDate(addDays(since, 0)), icsDate(addDays(since, 1)),
        '在一起纪念日', '从这一天开始，我们的时间合并在了一起。', true);
      [100, 520, 1000, 1314].forEach((n) => {
        const d = addDays(since, n - 1);
        ev(`lm-${code}-day${n}@galactic-promise`, icsDate(d), icsDate(addDays(icsDate(d), 1)),
          `在一起第 ${n} 天`, '一个值得记住的数字。', false);
      });
    }
    const users = loadUsers();
    for (const m of couple.members) {
      const u = users[m];
      if (!u || !u.bday) continue;
      const d = new Date(u.bday + 'T00:00:00');
      if (isNaN(d)) continue;
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (next.getFullYear() < 1900) continue;
      ev(`lm-${code}-bday-${m}@galactic-promise`, icsDate(next), icsDate(addDays(icsDate(next), 1)),
        `${u.nick} 的生日`, '记得准备一点小惊喜。', true);
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  /* ============================================================
     云端数据层（Supabase）
     数据表（建表 SQL 见 说明.md 第 5 节）：
       lm_users   username(pk) pw nick sign bday couple created_at
       lm_couples code(pk) since created members(jsonb)
       lm_entries eid(pk) couple author date mood title text photos(jsonb) ts
     照片存 Storage 公共桶 photos。
     ============================================================ */
  let sb = null;
  let sbToken = null;
  function setToken(t) {
    store.write(LS.token, t || '');
    sbToken = null;   // 强制重建客户端，让新令牌带上
    cloudInit();
  }
  function cloudInit() {
    if (!cloudOn()) return false;
    try {
      const tok = store.read(LS.token, '') || '';
      if (sb && sbToken === tok) return true;
      sbToken = tok;
      sb = window.supabase.createClient(CLOUD.supabaseUrl, CLOUD.supabaseKey, {
        global: { headers: tok ? { 'x-couple-token': tok } : {} },
      });
      return true;
    } catch (e) {
      console.warn('云端初始化失败，退回本地模式', e);
      return false;
    }
  }
  function cloudReady() {
    if (!CLOUD.enabled) return false;
    if (typeof window.supabase === 'undefined') return false;
    return !!(CLOUD.supabaseUrl && CLOUD.supabaseKey);
  }
  function ck(res) {
    if (res.error) throw new Error(res.error.message || 'cloud');
    return res.data;
  }
  function rowToUser(r) {
    return r && {
      u: r.username, pw: r.pw, nick: r.nick,
      sign: r.sign || '', bday: r.bday || '',
      avatar: r.avatar || '', deco: r.deco || {},
      couple: r.couple || null, createdAt: r.created_at || 0,
    };
  }
  function rowToCouple(r) {
    return r && { code: r.code, since: r.since || '', created: r.created || 0, members: r.members || [] };
  }
  function rowToEntry(r) {
    return r && {
      id: r.eid, author: r.author, date: r.date,
      mood: r.mood || '', title: r.title || '', text: r.text || '',
      photos: r.photos || [], ts: r.ts || 0,
    };
  }
  function rowToMsg(r) {
    return r && {
      id: r.id, sender: r.sender, kind: r.kind || 'text',
      text: r.text || '', url: r.url || '',
      name: r.name || '', size: Number(r.size) || 0, ts: Number(r.ts) || 0,
      reply_to: r.reply_to || null,
      reactions: r.reactions || {},
      recalled: !!r.recalled,
      read_ts: Number(r.read_ts) || 0,
    };
  }

  const C = {
    // ---- 注册 / 登录：走云端函数，密码由服务端校验，客户端拿不到别人的密码 ----
    async login(u, plain, weak) {
      const data = ck(await sb.rpc('lm_login', { p_user: u, p_pass: plain, p_weak: weak }));
      if (!data || data.error) return null;
      setToken(data.token);
      return { u: u.trim().toLowerCase(), code: data.code, token: data.token };
    },
    async register(o) {
      const data = ck(await sb.rpc('lm_register', {
        p_user: o.u, p_pass: o.p, p_nick: o.nick,
        p_sign: o.sign, p_bday: o.bday, p_join: o.join || '',
      }));
      if (data && data.error) return data;
      setToken(data.token);
      return { u: o.u.trim().toLowerCase(), code: data.code, token: data.token };
    },
    // ---- 查询：请求头带令牌，库里只会返回你们这一对的数据 ----
    async fetchEntries(code) {
      const r = ck(await sb.from('lm_entries').select('*').eq('couple', code).order('ts', { ascending: false }).limit(1000));
      return (r || []).map(rowToEntry);
    },
    // ---- 私信：文字 / 图片 / 文件 / 语音留言；通话信令也存在这张表里（kind = signal）----
    async fetchMsgs(code) {
      const r = ck(await sb.from('lm_messages').select('*').eq('couple', code)
        .in('kind', ['text', 'image', 'file', 'audio'])
        .order('ts', { ascending: false }).limit(200));
      return (r || []).map(rowToMsg).reverse();
    },
    async fetchSignals(code, limit) {
      const r = ck(await sb.from('lm_messages').select('*').eq('couple', code)
        .eq('kind', 'signal').order('ts', { ascending: false }).limit(limit || 30));
      return (r || []).map(rowToMsg);
    },
    async saveMsg(m, code) {
      ck(await sb.from('lm_messages').upsert({
        id: m.id, couple: code, couple_token: store.read(LS.token, ''),
        sender: m.sender, kind: m.kind, text: m.text || '',
        url: m.url || '', name: m.name || '', size: m.size || 0, ts: m.ts,
        reply_to: m.reply_to || null,
        reactions: m.reactions || {},
        recalled: !!m.recalled,
        ...(m.read_ts ? { read_ts: m.read_ts } : {}),
      }, { onConflict: 'id' }));
      return m.id;
    },
    // ---- 已读回执：把我收到的消息标记为已读（列 read_ts 缺失时静默跳过）----
    async markRead(code, user) {
      try {
        await sb.from('lm_messages')
          .update({ read_ts: Date.now() })
          .eq('couple', code)
          .neq('sender', user)
          .in('kind', ['text', 'image', 'file', 'audio'])
          .is('read_ts', null);
      } catch { /* 还没执行 ALTER 时忽略 */ }
    },
    async saveCouple(c) {
      ck(await sb.from('lm_couples').update({ since: c.since, members: c.members }).eq('code', c.code));
    },
    // ---- 个人资料：昵称 / 头像 / 装饰（背景板·个性签名）。走数据库函数，令牌校验，只改自己的行 ----
    async updateProfile(o) {
      const data = ck(await sb.rpc('lm_update_profile', {
        p_user: o.u, p_nick: o.nick, p_avatar: o.avatar || '', p_deco: o.deco || {},
      }));
      if (data && data.error) throw new Error(data.error);
      return true;
    },
    async destroyCouple(c) {
      ck(await sb.from('lm_couples').delete().eq('code', c.code));
    },
    // ---- 约定：时间胶囊 / 每日一问 / 心愿清单 ----
    async fetchCapsules(code) {
      const r = ck(await sb.from('lm_capsules').select('*').eq('couple', code).order('ts', { ascending: false }).limit(200));
      return r || [];
    },
    async saveCapsule(c) {
      ck(await sb.from('lm_capsules').upsert(c, { onConflict: 'id' }));
      return c.id;
    },
    async deleteCapsule(id) {
      ck(await sb.from('lm_capsules').delete().eq('id', id));
    },
    async fetchDaily(code) {
      const r = ck(await sb.from('lm_daily').select('*').eq('couple', code).order('day', { ascending: false }).limit(120));
      return r || [];
    },
    async saveDaily(d) {
      ck(await sb.from('lm_daily').upsert(d, { onConflict: 'couple,day,author' }));
    },
    async fetchBucket(code) {
      const r = ck(await sb.from('lm_bucket').select('*').eq('couple', code).order('ts', { ascending: true }).limit(500));
      return r || [];
    },
    async saveBucket(b) {
      ck(await sb.from('lm_bucket').upsert(b, { onConflict: 'id' }));
      return b.id;
    },
    async deleteBucket(id) {
      ck(await sb.from('lm_bucket').delete().eq('id', id));
    },
    async insertBucketRows(rows) {
      ck(await sb.from('lm_bucket').insert(rows));
    },
    // ---- 只读分享：服务端签发 8 位码；按码取回，无需登录 ----
    async shareCreate(payload) {
      const data = ck(await sb.rpc('lm_share_create', { p_payload: payload }));
      return data;
    },
    async shareGet(code) {
      const r = await sb.rpc('lm_share_get', { p_code: code });
      if (r.error) return null;
      return r.data || null;
    },
    // ---- 恢复码 / 密码重置 / 注销 ----
    async setRecovery(u, code) {
      const data = ck(await sb.rpc('lm_set_recovery', { p_user: u, p_code: code }));
      return data;
    },
    async recoverReset(u, code, pass) {
      const data = ck(await sb.rpc('lm_recover_reset', { p_user: u, p_code: code, p_pass: pass }));
      return data;
    },
    async deleteAccount(u) {
      const data = ck(await sb.rpc('lm_delete_account', { p_user: u }));
      return data;
    },
    // ---- 空间：创建 / 加入 / 解除（身份由请求头令牌确定）----
    async createSpace(since) {
      const data = ck(await sb.rpc('lm_create_space', { p_since: since }));
      if (data && data.error) return data;
      setToken(data.token);
      return { code: data.code, couple: rowToCouple(data.couple) };
    },
    async joinSpace(code) {
      const data = ck(await sb.rpc('lm_join_space', { p_code: code }));
      if (data && data.error) return data;
      setToken(data.token);
      return data;
    },
    async leaveSpace() {
      const data = ck(await sb.rpc('lm_leave_space', {}));
      setToken(data.token);
      return data;
    },
    async saveEntry(e, code) {
      ck(await sb.from('lm_entries').upsert({
        eid: e.id, couple: code, couple_token: store.read(LS.token, ''),
        author: e.author, date: e.date,
        mood: e.mood || '', title: e.title || '', text: e.text || '',
        photos: e.photos || [], ts: e.ts,
      }, { onConflict: 'eid' }));
      return e.id;
    },
    async deleteEntry(eid) {
      ck(await sb.from('lm_entries').delete().eq('eid', eid));
    },
    async uploadPhoto(dataUrl, name) {
      const blob = await (await fetch(dataUrl)).blob();
      const tok = store.read(LS.token, '') || 'local';
      const path = `${tok}/${name}`;
      ck(await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' }));
      const { data } = sb.storage.from('photos').getPublicUrl(path);
      return data.publicUrl;
    },
    async uploadChatFile(dataUrl, origName, contentType) {
      const blob = await (await fetch(dataUrl)).blob();
      const ext = String(origName || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin';
      const tok = store.read(LS.token, '') || 'local';
      const path = `${tok}/chat/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      ck(await sb.storage.from('photos').upload(path, blob, { contentType: contentType || 'application/octet-stream' }));
      const { data } = sb.storage.from('photos').getPublicUrl(path);
      return data.publicUrl;
    },
    // ---- 组合：把「我 + 空间 + 成员 + 记录」全部拉进缓存 ----
    async pullAll() {
      if (!me) return;
      const myRow = ck(await sb.from('lm_users').select('*').eq('username', me.u).maybeSingle());
      if (!myRow) { // 账号在云端被删了
        localStorage.removeItem(LS.session);
        setToken('');
        location.reload();
        return;
      }
      me = rowToUser(myRow);
      const users = { [me.u]: me };
      couple = null;
      cacheCouples = {};
      if (me.couple) {
        const c = ck(await sb.from('lm_couples').select('*').eq('code', me.couple).maybeSingle());
        couple = rowToCouple(c);
        if (couple) {
          const members = ck(await sb.from('lm_users').select('*').eq('couple', me.couple));
          for (const r of (members || [])) {
            const u = rowToUser(r);
            if (u) users[u.u] = u;
          }
          cacheEntries[couple.code] = await C.fetchEntries(couple.code);
          try {
            cacheMsgs[couple.code] = await C.fetchMsgs(couple.code);
            chatReady = true;
          } catch {
            cacheMsgs[couple.code] = [];
            chatReady = false;
          }
          cacheCouples = { [couple.code]: couple };
        }
      }
      cacheUsers = users;
    },
  };

  function syncState(txt) {
    const el = $('syncState');
    if (!el) return;
    el.hidden = false;
    el.textContent = txt;
    el.classList.toggle('err', txt === '同步失败');
  }
  function startPolling() {
    stopPolling();
    if (!cloudOn()) return;
    syncTimer = setInterval(async () => {
      if (!me || document.hidden) return;
      const editorOpen = !$('editorModal').hidden;
      try {
        const before = JSON.stringify([cacheEntries, cacheCouples]);
        await C.pullAll();
        const after = JSON.stringify([cacheEntries, cacheCouples]);
        if (before !== after) {
          renderTop();
          if (!editorOpen) renderMain();
        }
        syncState('云端已同步');
      } catch {
        syncState('同步失败');
      }
    }, POLL_MS);
  }
  function stopPolling() { if (syncTimer) { clearInterval(syncTimer); syncTimer = null; } }

  /* ---------------- 私信轮询 + 通话信令 ---------------- */
  function startChatPolling() {
    stopChatPolling();
    if (!cloudOn()) return;
    chatTimer = setInterval(pollChat, 3000);
    pollChat();
  }
  function stopChatPolling() { if (chatTimer) { clearInterval(chatTimer); chatTimer = null; } }

  function isChatTableMissing(err) {
    const s = String((err && err.message) || '');
    return s.includes('lm_messages') || s.includes('does not exist') || s.includes('schema cache');
  }

  async function pollChat() {
    if (!me || !couple || document.hidden) return;
    const code = couple.code;
    try {
      cacheMsgs[code] = await C.fetchMsgs(code);
      chatReady = true;
      refreshChatIfVisible();
    } catch (e) {
      if (isChatTableMissing(e)) chatReady = false;
      return;
    }
    try {
      handleSignals(await C.fetchSignals(code));
    } catch { /* 信令失败不影响聊天 */ }
  }

  function refreshChatIfVisible() {
    if (!couple) return;
    if (curTab === 'chat') updateChatList();
    else refreshUnread();
  }

  function refreshUnread() {
    if (!couple || !me) return;
    const list = loadMsgs(couple.code);
    chatUnread = list.filter((m) => m.sender !== me.u && m.ts > chatSeen).length;
    const dot = $('chatDot');
    if (!dot) return;
    dot.hidden = chatUnread <= 0;
    dot.textContent = chatUnread > 9 ? '9+' : String(chatUnread);
  }

  function markChatSeen() {
    if (!couple) return;
    chatSeen = Date.now();
    store.write(LS.chatSeen(couple.code), chatSeen);
    chatUnread = 0;
    const dot = $('chatDot');
    if (dot) dot.hidden = true;
    markPartnerRead();
  }

  /* 打开私信即把TA发来的消息标为已读，让我方气泡显示「已读」*/
  let lastReadPing = 0;
  function markPartnerRead() {
    if (!couple || !me) return;
    const now = Date.now();
    if (now - lastReadPing < 8000) return;
    lastReadPing = now;
    if (cloudOn()) {
      C.markRead(couple.code, me.u).catch(() => { });
      return;
    }
    const list = loadMsgs(couple.code);
    let changed = false;
    list.forEach((m) => {
      if (m.sender !== me.u && !m.read_ts) { m.read_ts = now; changed = true; }
    });
    if (changed) saveMsgs(couple.code, list);
  }

  /* ---------------- 状态 ---------------- */
  let me = null;
  let couple = null;
  let curTab = 'today';
  let editingId = null;
  let editorPhotos = [];
  let moodSel = '晴朗';

  /* ---- 私信 / 通话状态 ---- */
  let chatDraft = '';
  let replyDraft = null;      // {id, kind, text, url, sender, nick} 待发送时带上
  let chatSeen = 0;
  let chatUnread = 0;
  let chatTimer = null;
  let callState = 'idle';        // idle | calling | ringing | connecting | active
  let pc = null;
  let localStream = null;
  let callTimeoutId = null;
  let callClockId = null;
  let callStartAt = 0;
  let incomingOffer = null;
  let pendingIce = [];
  let muted = false;
  let seenSignals = new Set();
  let chatBusy = false;
  let callIsVideo = false;
  let remoteStream = null;
  const rec = { recorder: null, chunks: [], stream: null, startAt: 0, timer: null, auto: null, cancel: false };

  const authModal = $('authModal');
  const appEl = $('app');

  function sessionName() { return store.read(LS.session, null); }
  function sessionUser() {
    const u = sessionName();
    if (!u) return null;
    return loadUsers()[u] || null;
  }
  function partner() {
    if (!couple) return null;
    const users = loadUsers();
    const pu = couple.members.find((m) => m !== me.u);
    return pu ? users[pu] : null;
  }
  function entries() { return couple ? loadEntries(couple.code) : []; }

  /* ---------------- 登录 / 注册 ---------------- */
  function openAuth() {
    authModal.hidden = false;
    document.body.classList.add('modal-open');
    switchAuthTab('login');
  }
  function closeAuth() {
    authModal.hidden = true;
    document.body.classList.remove('modal-open');
  }
  function switchAuthTab(t) {
    document.querySelectorAll('.auth-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    $('loginForm').hidden = t !== 'login';
    $('regForm').hidden = t !== 'register';
  }
  document.querySelectorAll('.auth-tab').forEach((b) =>
    b.addEventListener('click', () => switchAuthTab(b.dataset.tab)));
  $('authClose').addEventListener('click', closeAuth);
  authModal.addEventListener('click', (e) => { if (e.target === authModal) closeAuth(); });

  let pairMode = 'create';
  $('pairToggle').addEventListener('click', (e) => {
    const b = e.target.closest('.pair-opt');
    if (!b) return;
    pairMode = b.dataset.pair;
    document.querySelectorAll('.pair-opt').forEach((x) => x.classList.toggle('active', x === b));
    $('pairCodeWrap').hidden = pairMode !== 'join';
  });

  function cloudGuard(errEl) {
    if (!CLOUD.enabled) return true; // 本地模式直接通过
    if (!cloudReady()) {
      errEl.textContent = '云端还没配置好：请检查 app.js 顶部的 supabaseUrl / supabaseKey，或把 CLOUD.enabled 改回 false 用本地模式';
      return false;
    }
    return true;
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('loginUser').value.trim();
    const p = $('loginPass').value;
    const err = $('loginErr');
    err.textContent = '';
    if (!cloudGuard(err)) return;

    if (cloudOn()) {
      err.textContent = '连接云端…';
      try {
        const r = await C.login(u, p, hash(p));
        if (!r) { err.textContent = '用户名或密码不正确'; return; }
        err.textContent = '';
        store.write(LS.session, r.u);
        closeAuth();
        await enterApp();
      } catch {
        err.textContent = '网络连接失败，请检查网络后重试';
      }
      return;
    }

    const user = loadUsers()[u];
    if (!user || user.pw !== hash(p)) { err.textContent = '用户名或密码不正确'; return; }
    store.write(LS.session, u);
    closeAuth();
    enterApp();
  });

  /* ---- 生日三下拉：直接选年月日，选完自动匹配星座 ---- */
  const SIGN_BOUND = [
    [1, 19, '摩羯座'], [2, 18, '水瓶座'], [3, 20, '双鱼座'], [4, 19, '白羊座'],
    [5, 20, '金牛座'], [6, 21, '双子座'], [7, 22, '巨蟹座'], [8, 22, '狮子座'],
    [9, 22, '处女座'], [10, 23, '天秤座'], [11, 22, '天蝎座'], [12, 21, '射手座'],
    [12, 31, '摩羯座'],
  ];
  function signOf(m, d) {
    for (const [sm, sd, name] of SIGN_BOUND) {
      if (m < sm || (m === sm && d <= sd)) return name;
    }
    return '摩羯座';
  }
  (function initBdayPicker() {
    const ySel = $('regYear'), mSel = $('regMonth'), dSel = $('regDay');
    if (!ySel || !mSel || !dSel) return;
    const nowY = new Date().getFullYear();
    for (let y = nowY; y >= nowY - 90; y--) {
      ySel.insertAdjacentHTML('beforeend', `<option value="${y}">${y} 年</option>`);
    }
    for (let m = 1; m <= 12; m++) {
      mSel.insertAdjacentHTML('beforeend', `<option value="${m}">${m} 月</option>`);
    }
    function refillDays() {
      const y = +ySel.value || 2000, m = +mSel.value || 1;
      const max = new Date(y, m, 0).getDate();
      const keep = +dSel.value || 0;
      dSel.innerHTML = '<option value="">日</option>';
      for (let d = 1; d <= max; d++) {
        dSel.insertAdjacentHTML('beforeend', `<option value="${d}">${d} 日</option>`);
      }
      if (keep && keep <= max) dSel.value = String(keep);
    }
    function autoSign() {
      const m = +mSel.value, d = +dSel.value;
      if (m && d) $('regSign').value = signOf(m, d);
    }
    refillDays();
    ySel.addEventListener('change', refillDays);
    mSel.addEventListener('change', () => { refillDays(); autoSign(); });
    dSel.addEventListener('change', autoSign);
  })();
  function bdayVal() {
    const y = $('regYear').value, m = $('regMonth').value, d = $('regDay').value;
    if (!y || !m || !d) return '';
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  $('regForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('regErr');
    err.textContent = '';
    const u = $('regUser').value.trim();
    const nick = $('regNick').value.trim();
    const p1 = $('regPass').value;
    const p2 = $('regPass2').value;
    if (p1 !== p2) { err.textContent = '两次输入的密码不一致'; return; }
    if (!cloudGuard(err)) return;
    const joinCode = pairMode === 'join' ? ($('regPair').value.trim() || '').toUpperCase() : null;

    if (cloudOn()) {
      err.textContent = '连接云端…';
      try {
        const r = await C.register({
          u, p: p1, nick, sign: $('regSign').value, bday: bdayVal(), join: joinCode,
        });
        if (r && r.error === 'exists') { err.textContent = '用户名已被使用'; return; }
        if (r && r.error === 'no_couple') { err.textContent = '配对码不存在，请和TA确认'; return; }
        if (r && r.error === 'full') { err.textContent = '这个空间已经有两个人啦'; return; }
        if (r && r.error === 'bad_user') { err.textContent = '用户名至少 2 个字符'; return; }
        err.textContent = '';
        store.write(LS.session, r.u);
        closeAuth();
        await enterApp();
      } catch {
        err.textContent = '网络连接失败，请检查网络后重试';
      }
      return;
    }

    const users = loadUsers();
    if (users[u]) { err.textContent = '用户名已被使用'; return; }
    const couples = loadCouples();
    let code = null;
    if (pairMode === 'join') {
      code = joinCode;
      const c = couples[code];
      if (!c) { err.textContent = '配对码不存在，请和TA确认'; return; }
      if (c.members.length >= 2) { err.textContent = '这个空间已经有两个人啦'; return; }
    }
    users[u] = {
      u, nick, pw: hash(p1),
      sign: $('regSign').value, bday: bdayVal(),
      couple: null, createdAt: Date.now(),
    };
    if (pairMode === 'create') {
      code = genCode();
      couples[code] = { code, created: Date.now(), since: todayKey(), members: [u] };
    } else {
      couples[code].members.push(u);
    }
    users[u].couple = code;
    saveUsers(users);
    saveCouples(couples);
    store.write(LS.session, u);
    closeAuth();
    enterApp();
  });

  /* ---------------- 空间入口 ---------------- */
  function openSpace() {
    if (sessionName()) enterApp();
    else openAuth();
  }
  $('ctaEnter').addEventListener('click', openSpace);
  $('navApp').addEventListener('click', openSpace);

  async function enterApp() {
    appEl.hidden = false;
    document.body.classList.add('app-open');

    if (cloudOn()) {
      const u = sessionName();
      if (!u) { closeApp(); openAuth(); return; }
      $('appMain').innerHTML = '<div class="empty-state"><span class="es-icon">✦</span><h3>正在连接云端</h3><p>把你们的星星搬过来…</p></div>';
      try {
        me = { u, couple: null };
        await C.pullAll();
        syncState('云端已同步');
      } catch {
        syncState('同步失败');
        $('appMain').innerHTML = '<div class="empty-state"><span class="es-icon">✦</span><h3>连不上云端</h3><p>检查网络后刷新重试</p></div>';
        return;
      }
    } else {
      me = sessionUser();
      if (!me) { closeApp(); openAuth(); return; }
      couple = me.couple ? loadCouples()[me.couple] : null;
    }

    renderTop();
    chatSeen = couple ? (store.read(LS.chatSeen(couple.code), 0) || 0) : 0;
    seenSignals = new Set();
    if (!couple) renderPairScreen();
    else switchAppTab(curTab);
    startPolling();
    startChatPolling();
    if (couple) showOnboard(false);
  }
  function closeApp() {
    appEl.hidden = true;
    document.body.classList.remove('app-open');
    stopPolling();
    stopChatPolling();
    if (callState !== 'idle') endCall(null, true);
    if (rec.recorder && rec.recorder.state !== 'inactive') stopRecord(true);
  }
  $('btnWrite').addEventListener('click', () => { openEditor(null); });
  $('btnExit').addEventListener('click', closeApp);
  $('btnLogout').addEventListener('click', () => {
    localStorage.removeItem(LS.session);
    me = null; couple = null;
    cacheUsers = null; cacheCouples = null; cacheEntries = {};
    closeApp();
    openAuth();
  });

  function renderTop() {
    const p = partner();
    $('appNames').textContent = p ? `${me.nick} & ${p.nick}` : `${me.nick} 的小宇宙`;
    const since = couple && couple.since ? new Date(couple.since + 'T00:00:00') : null;
    if (since && !isNaN(since)) {
      const days = Math.max(1, Math.floor((Date.now() - since.getTime()) / 86400000) + 1);
      $('appDays').textContent = `在一起 第 ${days} 天`;
    } else {
      $('appDays').textContent = '';
    }
    $('appMe').innerHTML = (me.avatar ? `<img class="top-av" src="${safeUrl(me.avatar)}" alt="" />` : '') + esc(me.nick);
  }

  /* ---------------- 配对（无空间时） ---------------- */
  function renderPairScreen() {
    curTab = 'today';
    $('appMain').innerHTML = `
      <div class="pair-screen">
        <div class="pair-card">
          <h2>创建我们的空间</h2>
          <p>生成一个 6 位配对码，告诉TA。TA注册时选择「加入TA的空间」并输入配对码，你们就在一起了。</p>
          <button class="btn-primary" id="pairCreate">生成配对码</button>
          <div class="pair-code" id="pairCodeShow" hidden></div>
        </div>
        <div class="pair-card">
          <h2>加入TA的空间</h2>
          <p>输入TA告诉你的 6 位配对码。</p>
          <div class="pair-join">
            <input id="pairJoinInput" maxlength="6" placeholder="配对码" />
            <button class="btn-primary" id="pairJoinBtn">加入</button>
          </div>
          <div class="auth-err" id="pairErr"></div>
        </div>
      </div>`;
    $('pairCreate').addEventListener('click', async () => {
      const btn = $('pairCreate');
      btn.disabled = true;
      try {
        let code, c;
        if (cloudOn()) {
          const r = await C.createSpace(todayKey());
          if (r && r.error) throw new Error(r.error);
          code = r.code;
          c = r.couple;
          me.couple = code;
          cacheCouples = { [code]: c };
          cacheUsers[me.u] = me;
        } else {
          const couples = loadCouples();
          code = genCode();
          couples[code] = { code, created: Date.now(), since: todayKey(), members: [me.u] };
          saveCouples(couples);
          const users = loadUsers();
          users[me.u].couple = code;
          saveUsers(users);
          c = couples[code];
        }
        couple = c;
        const show = $('pairCodeShow');
        show.hidden = false;
        show.innerHTML = `配对码 <b>${code}</b> · 等TA加入`;
        renderTop();
        setTimeout(() => switchAppTab('today'), 600);
      } catch {
        $('pairErr').textContent = '网络连接失败，请重试';
      } finally {
        btn.disabled = false;
      }
    });
    $('pairJoinBtn').addEventListener('click', async () => {
      const code = ($('pairJoinInput').value.trim() || '').toUpperCase();
      const err = $('pairErr');
      err.textContent = '';
      try {
        if (cloudOn()) {
          const r = await C.joinSpace(code);
          if (r && r.error === 'no_couple') { err.textContent = '配对码不存在'; return; }
          if (r && r.error === 'full') { err.textContent = '这个空间已经有两个人啦'; return; }
          await C.pullAll();
        } else {
          const couples = loadCouples();
          const c = couples[code];
          if (!c) { err.textContent = '配对码不存在'; return; }
          if (c.members.length >= 2) { err.textContent = '这个空间已经有两个人啦'; return; }
          c.members.push(me.u);
          saveCouples(couples);
          const users = loadUsers();
          users[me.u].couple = code;
          saveUsers(users);
          couple = c;
        }
        renderTop();
        switchAppTab('today');
      } catch {
        err.textContent = '网络连接失败，请重试';
      }
    });
  }

  /* ---------------- 主区域 ---------------- */
  $('appTabs').addEventListener('click', (e) => {
    const b = e.target.closest('.app-tab');
    if (!b) return;
    switchAppTab(b.dataset.tab);
  });
  function switchAppTab(t) {
    curTab = t;
    document.querySelectorAll('.app-tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === t));
    renderMain();
    if (t === 'chat') {
      markChatSeen();
      pollChat();
    }
    if (t === 'promise') refreshPromise(false);
  }
  function renderMain() {
    if (!couple) { renderPairScreen(); return; }
    const main = $('appMain');
    if (curTab === 'today') renderToday(main);
    else if (curTab === 'chat') renderChat(main);
    else if (curTab === 'diary') renderDiary(main);
    else if (curTab === 'photos') renderPhotos(main);
    else if (curTab === 'timeline') renderTimeline(main);
    else if (curTab === 'promise') renderPromise(main);
    else if (curTab === 'home') renderHome(main, me.u, false);
    else renderUs(main);
    main.scrollTop = 0;
    syncChatViewport();
  }

  function userMap() { return loadUsers(); }

  function entryCard(e, users) {
    const u = users[e.author];
    const mine = e.author === me.u;
    const photos = (e.photos || []);
    return `
      <article class="entry-card${mine ? ' mine' : ''}">
        <header class="ec-head">
          ${avatarHtml(u || { nick: e.author })}
          <span class="ec-nick">${esc(u ? u.nick : e.author)}</span>
          ${e.mood ? `<span class="ec-mood">${esc(e.mood)}</span>` : ''}
          <span class="ec-time">${fmtTs(e.ts)}</span>
          ${mine ? `<span class="ec-ops">
            <button type="button" data-act="edit" data-id="${e.id}">编辑</button>
            <button type="button" data-act="del" data-id="${e.id}">删除</button>
          </span>` : ''}
        </header>
        ${e.title ? `<h3 class="ec-title">${esc(e.title)}</h3>` : ''}
        ${e.text ? `<p class="ec-text">${esc(e.text).replace(/\n/g, '<br>')}</p>` : ''}
        ${photos.length ? `<div class="ec-photos n${Math.min(photos.length, 3)}">${
          photos.map((p, i) => `<img src="${p}" data-act="view" data-id="${e.id}" data-i="${i}" loading="lazy" alt="">`).join('')
        }</div>` : ''}
      </article>`;
  }

  /* ---- 今日：两个人今天的记录并排（一天可写多篇） ---- */

  /* 顶部提示：时间胶囊即将解锁 + 纪念日临近，返回 HTML 或空串 */
  function todayBanners() {
    const banners = [];
    const today = new Date(todayKey() + 'T00:00:00').getTime();

    // 1) 时间胶囊：解锁日在 [今天, 今天+3] 之间（含今天解锁）
    try {
      const caps = (promiseState && promiseState.caps) || [];
      const soon = caps.filter((c) => {
        if (!c.unlock_at) return false;
        const t = new Date(c.unlock_at + 'T00:00:00').getTime();
        const diff = Math.round((t - today) / 86400000);
        return diff >= 0 && diff <= 3;
      });
      soon.forEach((c) => {
        const t = new Date(c.unlock_at + 'T00:00:00').getTime();
        const diff = Math.round((t - today) / 86400000);
        const msg = diff === 0
          ? `🔓 今天解锁《${esc(c.title || '无题的信')}》`
          : `⏳ ${diff} 天后解锁《${esc(c.title || '无题的信')}》`;
        banners.push(`<a class="today-banner" data-go="promise">${msg} <span>去约定 →</span></a>`);
      });
    } catch { /* promiseState 未初始化时忽略 */ }

    // 2) 在一起的整数天 / 年份纪念日：下一个在 30 天内
    if (couple && couple.since) {
      try {
        const since = new Date(couple.since + 'T00:00:00');
        const now = new Date();
        const totalDays = Math.floor((now - since) / 86400000);
        const targets = [100, 520, 1000, 1314, 2000, 365 * 2, 365 * 3, 365 * 4, 365 * 5, 365 * 10];
        let nextAnniv = null;
        for (const t of targets) {
          const remain = t - totalDays;
          if (remain > 0 && remain <= 30) { nextAnniv = { t, remain }; break; }
        }
        // 每年同月同日的纪念日
        const yearAnniv = new Date(now.getFullYear(), since.getMonth(), since.getDate());
        if (yearAnniv < now) yearAnniv.setFullYear(yearAnniv.getFullYear() + 1);
        const remY = Math.round((yearAnniv - now) / 86400000);
        if (remY > 0 && remY <= 30 && (!nextAnniv || remY < nextAnniv.remain)) {
          const years = yearAnniv.getFullYear() - since.getFullYear();
          banners.push(`<a class="today-banner" data-go="home">💝 再过 ${remY} 天就是我们的 ${years} 周年 →</a>`);
        }
        if (nextAnniv) {
          banners.push(`<a class="today-banner" data-go="home">✨ 第 ${nextAnniv.t} 天 · 还有 ${nextAnniv.remain} 天 →</a>`);
        }
      } catch { /* 忽略日期异常 */ }
    }

    if (!banners.length) return '';
    return `<div class="today-banners">${banners.join('')}</div>`;
  }

  function renderToday(main) {
    const users = userMap();
    const p = partner();
    const today = todayKey();
    const list = entries().filter((e) => e.date === today);
    const mineList = list.filter((e) => e.author === me.u).sort((a, b) => a.ts - b.ts);
    const partnerList = p ? list.filter((e) => e.author === p.u).sort((a, b) => a.ts - b.ts) : [];

    /* 顶部提示：时间胶囊即将解锁 / 纪念日临近 */
    const bannerHtml = todayBanners();

    const col = (user, dayList, isMe) => `
      <section class="today-col${isMe ? ' me' : ''}">
        <div class="today-col-head">
          ${avatarHtml(user)}
          <span class="today-col-name">${esc(user ? user.nick : '等待TA加入')}</span>
          ${user && user.sign ? `<span class="today-col-sign">${esc(user.sign)}</span>` : ''}
        </div>
        ${dayList.length
          ? dayList.map((e) => entryCard(e, users)).join('') +
            (isMe ? '<button type="button" class="today-more" data-act="write">＋ 再写一篇</button>' : '')
          : `<div class="today-empty">
              <span class="te-icon">✎</span>
              <p>${user ? (isMe ? '今天还没有记录' : 'TA今天还没有记录') : 'TA还没有加入'}</p>
              ${isMe ? '<button type="button" class="btn-primary" data-act="write">写今天的日记</button>' : ''}
            </div>`}
      </section>`;

    main.innerHTML = `
      <div class="today-head">
        <h2>${today.replace(/-/g, ' . ')}</h2>
        <span class="today-sub">TODAY · 两个人的今天</span>
      </div>
      ${bannerHtml}
      ${!p ? `<div class="waiting-bar">空间配对码 <b>${couple.code}</b> · 等TA用这个码注册加入，就能一起看记录</div>` : ''}
      <div class="today-grid">
        ${col(me, mineList, true)}
        ${col(p, partnerList, false)}
      </div>`;
  }

  /* ---- 日记：全部记录，按日期分组 ---- */
  function renderDiary(main) {
    const users = userMap();
    const list = entries().slice().sort((a, b) => (b.date + b.ts).localeCompare(a.date + a.ts));
    if (!list.length) {
      main.innerHTML = emptyState('还没有任何记录', '写下第一篇，从这里开始。');
      return;
    }
    let html = '<div class="diary-list">';
    let lastDate = '';
    for (const e of list) {
      if (e.date !== lastDate) {
        lastDate = e.date;
        const both = new Set(list.filter((x) => x.date === e.date).map((x) => x.author)).size > 1;
        html += `<div class="diary-date">${e.date.replace(/-/g, ' . ')}${both ? '<span class="dd-both">❤ 都记录了</span>' : ''}</div>`;
      }
      html += entryCard(e, users);
    }
    main.innerHTML = html + '</div>';
  }

  /* ---- 共同相册：两个人的共享相册（复用 bucket 存储，kind='album'）---- */
  let albumBusy = false;

  function albumRows() {
    if (!couple) return [];
    return (promiseState.bucket || [])
      .filter((b) => b.kind === 'album' && b.title)
      .sort((a, b) => b.ts - a.ts);
  }

  async function addAlbumPhotos() {
    if (!couple || albumBusy) return;
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = true;
    inp.onchange = async () => {
      const files = Array.prototype.slice.call(inp.files || [], 0, 9);
      if (!files.length) return;
      albumBusy = true;
      syncState('正在上传…');
      /* 本地模式下需要先确认 bucket 已加载，否则会把已有内容覆盖掉 */
      if (!promiseState.loaded && couple) { try { await refreshPromise(); } catch { /* 忽略 */ } }
      let ok = 0;
      for (const f of files) {
        try {
          const dataUrl = await compressImage(f);
          const url = cloudOn()
            ? await C.uploadPhoto(dataUrl, `album-${me.u}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`)
            : dataUrl;
          const row = {
            id: 'al' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            couple: couple.code, couple_token: store.read(LS.token, ''),
            kind: 'album', title: url, done: false, done_at: null,
            author: me.u, ts: Date.now(),
          };
          if (cloudOn()) await C.saveBucket(row);
          promiseState.bucket.push(row);
          if (!cloudOn()) store.write(LS.bucket(couple.code), promiseState.bucket);
          ok++;
        } catch { /* 单张失败不影响其它 */ }
      }
      albumBusy = false;
      syncState(ok ? `相册已更新 · ${ok} 张` : '上传失败');
      if (curTab === 'photo' && couple) renderPhotos($('appMain'));
    };
    inp.click();
  }

  async function delAlbumPhoto(id) {
    if (!couple) return;
    if (!confirm('从共同相册移除这张照片？')) return;
    promiseState.bucket = (promiseState.bucket || []).filter((b) => b.id !== id);
    if (cloudOn()) {
      try { await C.deleteBucket(id); syncState('云端已同步'); } catch { syncState('同步失败'); }
    } else {
      store.write(LS.bucket(couple.code), promiseState.bucket);
    }
    if (curTab === 'photo' && couple) renderPhotos($('appMain'));
  }

  /* ---- 照片：共同相册 + 日记照片按月聚合 ---- */
  function renderPhotos(main) {
    if (!couple) return;
    /* bucket 里存着相册，进页面时若还没加载就补一次 */
    if (promiseState.code !== couple.code || !promiseState.loaded) {
      refreshPromise().then(() => {
        if (curTab === 'photo' && couple) renderPhotos($('appMain'));
      }).catch(() => { });
    }
    const users = userMap();
    const album = albumRows();
    const albumHtml = `
      <section class="album-sec">
        <div class="ph-month-head">
          <span class="pm-label">共同相册</span>
          <span class="pm-count">${album.length} 张</span>
          <button type="button" class="album-add" data-act="albumAdd">＋ 添加照片</button>
        </div>
        ${album.length ? `<div class="photos-grid">${album.map((a) => {
      const u = users[a.author];
      return `
            <figure class="photo-cell album-cell">
              <img src="${safeUrl(a.title)}" data-act="albumView" data-url="${esc(a.title)}" loading="lazy" alt="">
              <button type="button" class="album-del" data-act="albumDel" data-id="${esc(a.id)}" title="从相册移除">✕</button>
              <figcaption><span>${esc(u ? u.nick : a.author)}</span><span>${fmtTs(a.ts).replace('今天 ', '')}</span></figcaption>
            </figure>`;
    }).join('')}</div>`
        : `<div class="album-empty">还没有照片。点「＋ 添加照片」，两个人看到的是同一本相册。</div>`}
      </section>`;

    const list = entries().slice().sort((a, b) => b.ts - a.ts);
    const groups = new Map();   // 'YYYY-MM' -> [cell html]
    for (const e of list) {
      (e.photos || []).forEach((src, i) => {
        const u = users[e.author];
        const k = e.date.slice(0, 7);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(`
          <figure class="photo-cell">
            <img src="${src}" data-act="view" data-id="${e.id}" data-i="${i}" loading="lazy" alt="">
            <figcaption><span>${esc(u ? u.nick : e.author)}</span><span>${e.date.slice(5).replace('-', '.')}</span></figcaption>
          </figure>`);
      });
    }
    const monthsHtml = groups.size ? [...groups.entries()].map(([k, cells]) => `
      <section class="ph-month">
        <div class="ph-month-head">
          <span class="pm-label">${monthLabel(k)}</span>
          <span class="pm-count">日记 · ${cells.length} 张</span>
        </div>
        <div class="photos-grid">${cells.join('')}</div>
      </section>`).join('') : '';

    main.innerHTML = albumHtml + monthsHtml;
  }

  /* ---- 足迹：时间线 ---- */
  function renderTimeline(main) {
    const users = userMap();
    const all = entries().slice();
    const list = all.slice().sort((a, b) => b.ts - a.ts);
    const yearPanel = yearbookAutoPanel(all);
    if (!list.length) {
      main.innerHTML = yearPanel + emptyState('足迹还是空白', '每一次记录都会成为时间线上的一束光。');
      return;
    }
    main.innerHTML = yearPanel + `<div class="tl">${list.map((e) => {
      const u = users[e.author];
      return `
        <div class="tl-item${e.author === me.u ? ' me' : ''}">
          <div class="tl-dot"></div>
          <div class="tl-meta">
            <span class="tl-date">${e.date.replace(/-/g, '.')}</span>
            <span class="tl-nick">${esc(u ? u.nick : e.author)}</span>
            ${e.mood ? `<span class="ec-mood">${esc(e.mood)}</span>` : ''}
          </div>
          <div class="tl-body">
            ${e.title ? `<b>${esc(e.title)}</b>` : ''}
            ${e.text ? `<p>${esc(e.text).replace(/\n/g, '<br>')}</p>` : ''}
            ${(e.photos || []).length ? `<div class="tl-photos">${e.photos.map((p, i) => `<img src="${p}" data-act="view" data-id="${e.id}" data-i="${i}" loading="lazy" alt="">`).join('')}</div>` : ''}
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  /* ---- 自动年鉴面板：足迹页顶部的实时回忆（每次刷新自动更新）---- */
  function yearbookAutoPanel(list) {
    if (!list.length) return '';
    const now = new Date();
    const y = now.getFullYear();
    const yStr = String(y);
    const thisYear = list.filter((e) => (e.date || '').startsWith(yStr + '-'));
    const users = userMap();
    const meEntries = thisYear.filter((e) => e.author === me.u);
    const partnerEntries = partner() ? thisYear.filter((e) => e.author === partner().u) : [];
    const photoCount = thisYear.reduce((n, e) => n + (e.photos || []).length, 0);
    const moodMap = {};
    thisYear.forEach((e) => { if (e.mood) moodMap[e.mood] = (moodMap[e.mood] || 0) + 1; });
    const moodsSorted = Object.entries(moodMap).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const days = new Set(thisYear.map((e) => e.date));
    let streak = 0;
    const d = new Date();
    if (!days.has(todayKey(d))) d.setDate(d.getDate() - 1);
    while (days.has(todayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
    // 共同记录的天数：两人同日都有 entry
    const bothDays = new Set();
    if (partner()) {
      const meDays = new Set(meEntries.map((e) => e.date));
      const pDays = new Set(partnerEntries.map((e) => e.date));
      [...meDays].forEach((x) => { if (pDays.has(x)) bothDays.add(x); });
    }
    const moodBars = moodsSorted.map(([m, n]) => {
      const pct = thisYear.length ? Math.round((n / thisYear.length) * 100) : 0;
      return `<span class="yp-mood"><i style="width:${pct}%"></i>${esc(m)} · ${n}</span>`;
    }).join('') || '<span class="yp-empty">今年还没有心情标记</span>';

    return `
      <div class="yearbook-panel">
        <div class="yp-head">
          <h3>${y} · 我们的实时回忆</h3>
          <span class="yp-sub">YEARBOOK · 自动更新</span>
        </div>
        <div class="yp-grid">
          <div class="yp-cell">
            <span class="yp-num">${thisYear.length}</span>
            <span class="yp-lbl">篇记录</span>
          </div>
          <div class="yp-cell">
            <span class="yp-num">${photoCount}</span>
            <span class="yp-lbl">张照片</span>
          </div>
          <div class="yp-cell">
            <span class="yp-num">${streak}</span>
            <span class="yp-lbl">连续天数</span>
          </div>
          <div class="yp-cell">
            <span class="yp-num">${bothDays.size}</span>
            <span class="yp-lbl">❤ 都记录了</span>
          </div>
          <div class="yp-cell wide">
            <span class="yp-lbl">心情分布（今年）</span>
            <div class="yp-moods">${moodBars}</div>
          </div>
        </div>
      </div>`;
  }

  /* ---- 约定：每日一问 / 时间胶囊 / 心愿清单 ---- */
  const DAILY_QS = [
    '今天有没有哪一刻，你突然很想我？',
    '今天最想和我分享的一件小事是什么？',
    '如果今天可以重来一次，你想改哪一段？',
    '今天你为我（或为我们）做的一件小事是什么？',
    '今天有没有一句话，你憋着没说？',
    '今天你最想被我怎么安慰？',
    '用三个词形容今天，你会说什么？',
    '今天有什么让你觉得「幸好有你」？',
    '今天你偷偷笑了一下，是因为什么？',
    '如果现在能立刻见到我，你想先做什么？',
    '今天有什么小烦恼，说出来会轻一点？',
    '今天你最喜欢自己的哪一点？',
    '今天有没有想起我们第一次见面？',
    '今天你最想吃我做的哪道菜？',
    '如果给今天起一个标题，会是什么？',
    '今天你想对我说的一句悄悄话是什么？',
    '今天有什么让你觉得被爱着？',
    '今天你想和我一起做的第一件事是什么？',
    '今天你最想回到哪个瞬间？',
    '今天有什么值得记下来的小确幸？',
    '今天你有没有为我留了一点时间？',
    '今天你想向我道歉或道谢吗？',
    '今天你最想被我夸奖什么？',
    '今天你希望明天有什么不一样？',
    '今天有什么让你犹豫了很久？',
    '今天你偷偷想了几次我？',
    '今天你最想和我一起听的歌是哪首？',
    '今天如果只能记住一件事，你选哪件？',
    '今天你有没有觉得我们更像「我们」？',
    '今天你想对未来的我们说什么？',
  ];

  const BUCKET_SMALL = [
    '一起看一场日出', '一起看一场日落', '一起走完一条长长的路', '一起做一顿晚饭',
    '一起逛一次菜市场', '一起包一次饺子', '一起烤一次蛋糕', '一起喝一杯奶茶',
    '一起吃一次路边摊', '一起在深夜煮泡面', '一起看一部老电影', '一起追完一部剧',
    '一起听一首歌循环到睡着', '一起在 KTV 唱到嗓子哑', '一起去一次游乐园', '一起坐一次摩天轮',
    '一起坐一次过山车', '一起拍一张合照', '一起拍一组贴纸照', '一起拍一段 Vlog',
    '一起养一盆植物', '一起养一只猫或狗', '一起给植物换一次盆', '一起打扫一次房间',
    '一起换一次床单', '一起装一次家具', '一起搬一次家', '一起逛一次宜家',
    '一起挑一盏台灯', '一起在阳台看星星', '一起认一次星座', '一起数一次流星',
    '一起去一次海边', '一起在沙滩上写字', '一起捡一次贝壳', '一起踩一次浪',
    '一起看一次海上的月亮', '一起去一次山里', '一起爬一次山', '一起在山顶吹一次风',
    '一起露营一次', '一起看一次篝火', '一起数一次帐篷外的星星', '一起淋一次雨',
    '一起撑一把伞走回家', '一起堆一个雪人', '一起打一次雪仗', '一起在冬天分享一条围巾',
    '一起喝一次热红酒', '一起过一个圣诞节', '一起跨一次年', '一起许一个新年愿望',
    '一起过一次生日', '一起准备一次惊喜', '一起写一封手写信', '一起寄一张明信片',
    '一起做一本相册', '一起整理一次旧照片', '一起录一段给未来的话', '一起定一个只属于我们的暗号',
    '一起给对方取一个昵称', '一起穿一次情侣装', '一起戴一次同款戒指', '一起剪一次头发',
    '一起做一次指甲', '一起敷一次面膜', '一起泡一次脚', '一起早睡一次',
    '一起晨跑一次', '一起做一次拉伸', '一起骑一次单车', '一起坐一次公交到终点',
    '一起坐一次夜班火车', '一起赶一次末班地铁', '一起去一次图书馆', '一起看一次展览',
    '一起听一次现场音乐', '一起去一次博物馆', '一起去一次动物园', '一起去一次水族馆',
    '一起去一次植物园', '一起去一次古镇', '一起去一次外地旅行', '一起规划一次未来的旅行',
    '一起存一笔「我们」的钱', '一起记一次账', '一起做一次月度复盘', '一起列一份年度清单',
    '一起完成清单上的第一件事', '一起把一件小事坚持三十天', '一起吵一次架再和好', '一起说一次「对不起」',
    '一起说一次「谢谢你」', '一起说一次「我爱你」', '一起在深夜聊一次天', '一起聊一次小时候',
    '一起聊一次未来', '一起看一次凌晨的城市', '一起做一件从没做过的事', '一起把这份清单走完',
  ];

  const promiseState = { code: '', caps: [], daily: [], bucket: [], loaded: false, err: '', kind: 'small' };

  function promiseEnsureCode() {
    if (!couple) return false;
    if (promiseState.code !== couple.code) {
      promiseState.code = couple.code;
      promiseState.caps = [];
      promiseState.daily = [];
      promiseState.bucket = [];
      promiseState.loaded = false;
      promiseState.err = '';
    }
    return true;
  }
  function promiseLocalSave() {
    if (cloudOn() || !couple) return;
    store.write(LS.caps(couple.code), promiseState.caps);
    store.write(LS.daily(couple.code), promiseState.daily);
    store.write(LS.bucket(couple.code), promiseState.bucket);
  }
  async function refreshPromise() {
    if (!promiseEnsureCode()) return;
    const code = couple.code;
    if (cloudOn()) {
      try {
        const [caps, daily, bucket] = await Promise.all([
          C.fetchCapsules(code), C.fetchDaily(code), C.fetchBucket(code),
        ]);
        if (!couple || couple.code !== code) return;
        promiseState.caps = caps || [];
        promiseState.daily = daily || [];
        promiseState.bucket = bucket || [];
        promiseState.err = '';
      } catch (e) {
        promiseState.err = String((e && e.message) || e || '');
      }
    } else {
      promiseState.caps = store.read(LS.caps(code), []);
      promiseState.daily = store.read(LS.daily(code), []);
      promiseState.bucket = store.read(LS.bucket(code), []);
      promiseState.err = '';
    }
    promiseState.loaded = true;
    if (curTab === 'promise' && couple) renderPromise($('appMain'));
  }
  function promiseFail(e) {
    const s = String((e && e.message) || e || '');
    if (/lm_capsules|lm_daily|lm_bucket|relation|schema cache|could not find|does not exist/i.test(s)) {
      alert('保存失败：云端还没有「约定」数据表。\n请在 Supabase SQL Editor 执行「说明.md · 约定」一节的 SQL 后再试。');
      promiseState.err = s;
      if (curTab === 'promise') renderPromise($('appMain'));
    } else {
      alert('保存失败：' + (s || '网络错误'));
    }
  }
  function qidOf(day) {
    const n = Math.floor(new Date(day + 'T00:00:00').getTime() / 86400000);
    return ((n % DAILY_QS.length) + DAILY_QS.length) % DAILY_QS.length;
  }
  function fmtDay(s) { return String(s || '').replace(/-/g, '.'); }
  function promiseNick(author) {
    const u = userMap()[author];
    return (u && u.nick) || author;
  }

  function renderPromise(main) {
    promiseEnsureCode();
    const p = partner();
    const today = todayKey();
    const qid = qidOf(today);
    const q = DAILY_QS[qid];
    const mine = promiseState.daily.find((d) => d.day === today && d.author === me.u) || null;
    const ta = (p && promiseState.daily.find((d) => d.day === today && d.author === p.u)) || null;
    const both = !!(mine && ta);

    const ansBox = (u, a) => `
      <div class="pr-ans">
        <span class="pr-who">${esc(u ? u.nick : 'TA')}</span>
        <p>${esc(a).replace(/\n/g, '<br>')}</p>
      </div>`;

    const taHtml = ta
      ? (both ? ansBox(p, ta.answer) : '<div class="pr-ans locked"><span class="pr-who">TA</span><p>已经回答了 · 写下你的答案就能看到彼此</p></div>')
      : `<div class="pr-ans locked"><span class="pr-who">TA</span><p>${mine ? '还在等 TA 回答…' : '还没有人回答今天的题'}</p></div>`;

    const mineHtml = `
      <div class="pr-my">
        <span class="pr-who">我${mine ? ' · 已回答' : ''}</span>
        <textarea id="prDailyInput" class="pr-input" rows="3" maxlength="300" placeholder="写下你的答案，只有你们两人能看到…">${mine ? esc(mine.answer) : ''}</textarea>
        <div class="pr-row">
          <span class="pr-count" id="prDailyCount">${mine ? '已保存 · 可以修改' : ''}</span>
          <button type="button" class="btn-primary" id="prDailySave">${mine ? '更新回答' : '回答'}</button>
        </div>
      </div>`;

    const histDays = [...new Set(promiseState.daily.filter((d) => d.day !== today).map((d) => d.day))]
      .sort((a, b) => b.localeCompare(a)).slice(0, 7);
    const histHtml = histDays.map((day) => {
      const items = promiseState.daily.filter((d) => d.day === day);
      const ma = items.find((x) => x.author === me.u);
      const pa = p ? items.find((x) => x.author === p.u) : null;
      if (!ma || !pa) return '';
      return `<div class="pr-hist-item">
        <div class="pr-hist-day">${fmtDay(day)} · ${esc(DAILY_QS[qidOf(day)])}</div>
        ${ansBox(me, ma.answer)}${ansBox(p, pa.answer)}
      </div>`;
    }).join('');

    const capsSorted = promiseState.caps.slice().sort((a, b) => {
      const oa = a.unlock_at <= today, ob = b.unlock_at <= today;
      if (oa !== ob) return oa ? 1 : -1;
      if (!oa) return a.unlock_at.localeCompare(b.unlock_at);
      return (b.ts || 0) - (a.ts || 0);
    });
    const capsHtml = capsSorted.map((c) => {
      const open = c.unlock_at <= today;
      const left = Math.max(0, Math.round(
        (new Date(c.unlock_at + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000));
      return `<article class="pr-cap${open ? ' open' : ' locked'}">
        <div class="pr-cap-head">
          <span class="pr-cap-t">${open ? '🔓' : '🔒'} ${esc(c.title || '无题的信')}</span>
          <span class="pr-cap-meta">${fmtDay(c.unlock_at)} ${open ? '已解锁' : '解锁 · 还有 ' + left + ' 天'}</span>
        </div>
        <p class="pr-cap-body${open ? '' : ' locked'}">${
          open ? esc(c.body).replace(/\n/g, '<br>')
               : '内容会在解锁那天自动出现，现在连写信的人也看不到。'}</p>
        <div class="pr-cap-foot">
          <span>${esc(promiseNick(c.author))} 封存</span>
          ${c.author === me.u ? `<button type="button" class="pr-link danger" data-act="cap-del" data-id="${esc(c.id)}">删除</button>` : ''}
        </div>
      </article>`;
    }).join('');

    const kind = promiseState.kind;
    const list = promiseState.bucket.filter((b) => b.kind === kind);
    const doneN = list.filter((b) => b.done).length;
    const pct = list.length ? Math.round((doneN / list.length) * 100) : 0;
    const listHtml = list.length
      ? `<ul class="pr-list">${list.map((b) => `
          <li class="pr-item${b.done ? ' done' : ''}">
            <button type="button" class="pr-check" data-act="b-toggle" data-id="${esc(b.id)}" aria-label="切换完成">${b.done ? '✓' : ''}</button>
            <span class="pr-item-t">${esc(b.title)}</span>
            <span class="pr-item-by">${esc(promiseNick(b.author))}</span>
            <button type="button" class="pr-x" data-act="b-del" data-id="${esc(b.id)}" aria-label="删除">×</button>
          </li>`).join('')}</ul>`
      : (kind === 'small'
        ? `<div class="pr-empty"><p>还没有载入清单。一次放进 100 件可以一起做的小事。</p><button type="button" class="btn-primary" id="prSeedSmall">载入 100 件小事</button></div>`
        : '<div class="pr-empty"><p>写下第一件想一起做的事。</p></div>');

    const tomorrow = (() => {
      const d = new Date(); d.setDate(d.getDate() + 1); return todayKey(d);
    })();
    const defaultUnlock = (() => {
      const d = new Date(); d.setFullYear(d.getFullYear() + 1); return todayKey(d);
    })();

    main.innerHTML = `
      <div class="pr-page">
        <div class="pr-hero">
          <h2>约定</h2>
          <span>PROMISES · 一起要做的事</span>
        </div>

        <section class="pr-card">
          <div class="pr-head"><span class="pr-k">DAILY QUESTION · 每日一问</span><span class="pr-day">${fmtDay(today)}</span></div>
          <h3 class="pr-q">${esc(q)}</h3>
          ${p ? '' : '<p class="pr-hint">TA 还没加入空间，先把答案留给自己。</p>'}
          <div class="pr-cols">${mineHtml}${taHtml}</div>
          ${histHtml ? `<div class="pr-hist"><div class="pr-hist-t">往前回看</div>${histHtml}</div>` : ''}
        </section>

        <section class="pr-card">
          <div class="pr-head"><span class="pr-k">TIME CAPSULE · 时间胶囊</span><span class="pr-day">${promiseState.caps.length} 封</span></div>
          <div class="pr-cap-list">${capsHtml || '<p class="pr-empty-line">写一封给未来的信，设一个解锁日，到那天一起打开。</p>'}</div>
          <div class="pr-newcap" id="prNewCap" hidden>
            <input id="prCapTitle" class="pr-input-one" maxlength="40" placeholder="标题，例如：给一年后的我们" />
            <input id="prCapDate" type="date" class="pr-input-one" min="${tomorrow}" value="${defaultUnlock}" />
            <textarea id="prCapBody" class="pr-input" rows="4" maxlength="800" placeholder="写下想对未来的你们说的话…"></textarea>
            <div class="pr-row"><button type="button" class="btn-ghost" id="prCapCancel">取消</button><button type="button" class="btn-primary" id="prCapSave">封 存</button></div>
          </div>
          <button type="button" class="pr-add" id="prCapToggle">＋ 写一封时间胶囊</button>
        </section>

        <section class="pr-card">
          <div class="pr-head"><span class="pr-k">BUCKET LIST · 心愿清单</span><span class="pr-day">${doneN} / ${list.length}</span></div>
          <div class="pr-kind">
            <button type="button" class="pr-kind-b${kind === 'small' ? ' on' : ''}" data-kind="small">100 件小事</button>
            <button type="button" class="pr-kind-b${kind === 'wish' ? ' on' : ''}" data-kind="wish">愿望清单</button>
          </div>
          <div class="pr-prog"><i style="width:${pct}%"></i></div>
          ${listHtml}
          <div class="pr-addrow">
            <input id="prWishInput" class="pr-input-one" maxlength="40" placeholder="${kind === 'small' ? '再加一件小事…' : '写下一个愿望…'}" />
            <button type="button" class="btn-primary" id="prWishAdd">添加</button>
          </div>
        </section>

        ${promiseState.err ? '<div class="pr-warn">「约定」数据表还没准备好：请在 Supabase SQL Editor 执行「说明.md · 约定」一节的 SQL，然后刷新页面。</div>' : ''}
      </div>`;

    // ---- 每日一问 ----
    const di = $('prDailyInput');
    if (di) {
      di.addEventListener('input', () => {
        const c = $('prDailyCount');
        if (c) c.textContent = `${di.value.length} / 300`;
      });
      $('prDailySave').addEventListener('click', async () => {
        const a = di.value.trim();
        if (!a) { di.focus(); return; }
        const row = {
          couple: couple.code, couple_token: store.read(LS.token, ''),
          day: today, qid, author: me.u, answer: a, ts: Date.now(),
        };
        const btn = $('prDailySave');
        btn.disabled = true;
        try {
          if (cloudOn()) { await C.saveDaily(row); syncState('云端已同步'); }
          const i = promiseState.daily.findIndex((d) => d.day === today && d.author === me.u);
          if (i >= 0) promiseState.daily[i] = row; else promiseState.daily.push(row);
          promiseLocalSave();
          renderPromise($('appMain'));
        } catch (e) { promiseFail(e); }
        finally { btn.disabled = false; }
      });
    }

    // ---- 时间胶囊 ----
    const newCap = $('prNewCap');
    $('prCapToggle').addEventListener('click', () => { newCap.hidden = !newCap.hidden; });
    $('prCapCancel').addEventListener('click', () => { newCap.hidden = true; });
    $('prCapSave').addEventListener('click', async () => {
      const title = $('prCapTitle').value.trim();
      const body = $('prCapBody').value.trim();
      const unlock = $('prCapDate').value;
      if (!body) { $('prCapBody').focus(); return; }
      if (!unlock || unlock < tomorrow) { alert('解锁日需要是明天或以后。'); return; }
      const row = {
        id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        couple: couple.code, couple_token: store.read(LS.token, ''),
        author: me.u, title, body, unlock_at: unlock, ts: Date.now(),
      };
      const btn = $('prCapSave');
      btn.disabled = true;
      try {
        if (cloudOn()) { await C.saveCapsule(row); syncState('云端已同步'); }
        promiseState.caps.push(row);
        promiseLocalSave();
        renderPromise($('appMain'));
      } catch (e) { promiseFail(e); }
      finally { btn.disabled = false; }
    });
    main.querySelectorAll('[data-act="cap-del"]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('删除这封时间胶囊？')) return;
        try {
          if (cloudOn()) await C.deleteCapsule(b.dataset.id);
          promiseState.caps = promiseState.caps.filter((x) => x.id !== b.dataset.id);
          promiseLocalSave();
          renderPromise($('appMain'));
        } catch (e) { promiseFail(e); }
      });
    });

    // ---- 心愿清单 ----
    main.querySelectorAll('.pr-kind-b').forEach((b) => {
      b.addEventListener('click', () => {
        promiseState.kind = b.dataset.kind;
        renderPromise($('appMain'));
      });
    });
    const seed = $('prSeedSmall');
    if (seed) seed.addEventListener('click', async () => {
      seed.disabled = true;
      const now = Date.now();
      const rows = BUCKET_SMALL.map((title, i) => ({
        id: 'k' + now.toString(36) + i,
        couple: couple.code, couple_token: store.read(LS.token, ''),
        kind: 'small', title, done: false, done_at: null,
        author: me.u, ts: now + i,
      }));
      try {
        if (cloudOn()) { await C.insertBucketRows(rows); syncState('云端已同步'); }
        promiseState.bucket = promiseState.bucket.concat(rows);
        promiseLocalSave();
        renderPromise($('appMain'));
      } catch (e) { promiseFail(e); }
      finally { seed.disabled = false; }
    });
    const wishInput = $('prWishInput');
    const addWish = async () => {
      const t = wishInput.value.trim();
      if (!t) { wishInput.focus(); return; }
      const row = {
        id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        couple: couple.code, couple_token: store.read(LS.token, ''),
        kind: promiseState.kind, title: t, done: false, done_at: null,
        author: me.u, ts: Date.now(),
      };
      try {
        if (cloudOn()) { await C.saveBucket(row); syncState('云端已同步'); }
        promiseState.bucket.push(row);
        promiseLocalSave();
        renderPromise($('appMain'));
      } catch (e) { promiseFail(e); }
    };
    $('prWishAdd').addEventListener('click', addWish);
    wishInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addWish(); } });
    main.querySelectorAll('[data-act="b-toggle"]').forEach((b) => {
      b.addEventListener('click', async () => {
        const row = promiseState.bucket.find((x) => x.id === b.dataset.id);
        if (!row) return;
        const patch = { done: !row.done, done_at: row.done ? null : Date.now() };
        try {
          if (cloudOn()) { await C.saveBucket(Object.assign({}, row, patch)); syncState('云端已同步'); }
          Object.assign(row, patch);
          promiseLocalSave();
          renderPromise($('appMain'));
        } catch (e) { promiseFail(e); }
      });
    });
    main.querySelectorAll('[data-act="b-del"]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('删除这一条？')) return;
        try {
          if (cloudOn()) await C.deleteBucket(b.dataset.id);
          promiseState.bucket = promiseState.bucket.filter((x) => x.id !== b.dataset.id);
          promiseLocalSave();
          renderPromise($('appMain'));
        } catch (e) { promiseFail(e); }
      });
    });
  }

  /* ---- 我们：资料 / 数据 ---- */
  function renderUs(main) {
    const users = userMap();
    const p = partner();
    const list = entries();
    const photoCount = list.reduce((n, e) => n + (e.photos || []).length, 0);
    const days = new Set(list.map((e) => e.date));
    let streak = 0;
    const d = new Date();
    if (!days.has(todayKey(d))) d.setDate(d.getDate() - 1);
    while (days.has(todayKey(d))) { streak++; d.setDate(d.getDate() - 1); }

    const profile = (u, isMe) => `
      <div class="profile-card clickable" data-home="${esc(u.u)}" title="点击进入${isMe ? '我的' : 'TA的'}主页">
        <div class="pc-avatar">${u.avatar ? `<img src="${safeUrl(u.avatar)}" alt="" />` : esc(u.nick.slice(0, 1))}</div>
        <div class="pc-name">${esc(u.nick)}${isMe ? ' <span class="pc-me">我</span>' : ''}</div>
        <div class="pc-meta">
          <span>${esc(u.sign || '—')}</span>
          ${u.bday ? `<span>生日 ${esc(u.bday.slice(5).replace('-', '.'))}</span>` : ''}
        </div>
        <div class="pc-actions">
          ${isMe ? '<button type="button" class="pc-btn" data-act="edit">编辑资料</button>' : ''}
          <button type="button" class="pc-btn" data-act="home">${isMe ? '我的主页' : '查看TA的主页'}</button>
        </div>
      </div>`;

    const noteText = cloudOn()
      ? '数据保存在云端（Supabase），两人各自的设备实时同步。仍建议定期「导出我们的数据」做备份。'
      : '所有数据只保存在这台设备的浏览器里。换电脑或清除浏览器数据前，请先「导出我们的数据」备份。';

    const currentTheme = (() => {
      try { return localStorage.getItem('ot_theme') || 'deep'; } catch { return 'deep'; }
    })();

    main.innerHTML = `
      <div class="us-grid">
        ${profile(me, true)}
        ${p ? profile(p, false) : `<div class="profile-card waiting"><div class="pc-avatar">?</div><div class="pc-name">等待TA加入</div><div class="pc-meta"><span>配对码 ${couple.code}</span></div></div>`}
      </div>

      <div class="us-panel">
        <div class="us-row">
          <span class="us-k">在一起的日子</span>
          <span class="us-v"><input type="date" id="usSince" value="${esc(couple.since || todayKey())}" /></span>
        </div>
        <div class="us-row"><span class="us-k">配对码</span><span class="us-v mono">${couple.code}</span></div>
        <div class="us-row"><span class="us-k">共同记录</span><span class="us-v">${list.length} 篇日记 · ${photoCount} 张照片</span></div>
        <div class="us-row"><span class="us-k">连续记录</span><span class="us-v">${streak} 天</span></div>
        <div class="us-row"><span class="us-k">存储方式</span><span class="us-v">${cloudOn() ? '云端同步' : '本机浏览器'}</span></div>
      </div>

      <div class="us-panel">
        <div class="us-row">
          <span class="us-k">界面皮肤</span>
          <span class="us-v skin-chips" id="skinChips">
            ${THEMES.map((t) => `<button type="button" class="skin-chip${t === currentTheme ? ' on' : ''}" data-skin="${t}">${THEME_LABEL[t]}</button>`).join('')}
          </span>
        </div>
        <div class="us-row"><span class="us-k">说明</span><span class="us-v us-hint">三种皮肤首页与空间同步切换：深空是默认星空，极简白适合白天，胶片暖像一封旧信。</span></div>
      </div>

      <div class="us-panel">
        <div class="us-row">
          <span class="us-k">只读分享</span>
          <span class="us-v"><button type="button" class="us-link" id="usShare">生成分享链接</button></span>
        </div>
        <div class="us-row">
          <span class="us-k">恢复码</span>
          <span class="us-v"><button type="button" class="us-link" id="usRecovery">设置恢复码</button></span>
        </div>
        <div class="us-row">
          <span class="us-k">账号</span>
          <span class="us-v"><button type="button" class="us-link danger" id="usDelete">注销账号</button></span>
        </div>
        <div class="us-row"><span class="us-k">说明</span><span class="us-v us-hint">分享链接是只读快照，不含私信；恢复码用于忘记密码时重置；注销会删除你的数据且不可恢复。</span></div>
        <div class="us-row"><span class="us-k">版本</span><span class="us-v us-hint">${esc(BUILD)}</span></div>
      </div>

      <div class="us-actions">
        <button type="button" class="btn-ghost" id="usYearbook">生成回忆年鉴</button>
        <button type="button" class="btn-ghost" id="usIcs">导出纪念日日历</button>
        <button type="button" class="btn-ghost" id="usExport">导出我们的数据</button>
        <button type="button" class="btn-ghost danger" id="usUnpair">解除配对</button>
      </div>
      <div class="us-actions">
        <button type="button" class="btn-ghost" id="usGuide">再看一次新手引导</button>
      </div>
      <p class="us-note">${noteText}</p>`;

    $('usSince').addEventListener('change', async (e) => {
      const v = e.target.value || todayKey();
      couple.since = v;
      renderTop();
      if (cloudOn()) {
        try { await C.saveCouple(couple); syncState('云端已同步'); } catch { syncState('同步失败'); }
      } else {
        const couples = loadCouples();
        couples[couple.code].since = v;
        saveCouples(couples);
      }
    });
    $('skinChips').addEventListener('click', (e) => {
      const b = e.target.closest('.skin-chip');
      if (!b) return;
      applyTheme(b.dataset.skin);
      document.querySelectorAll('.skin-chip').forEach((x) => x.classList.toggle('on', x === b));
    });
    main.querySelectorAll('.profile-card[data-home]').forEach((card) => {
      card.addEventListener('click', () => {
        const name = card.getAttribute('data-home');
        if (name === me.u) switchAppTab('home');
        else openHomeOverlay(name);
      });
    });
    main.querySelectorAll('.pc-btn').forEach((b) => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const name = b.closest('.profile-card').getAttribute('data-home');
        if (b.dataset.act === 'edit') {
          $('pmNick').value = me.nick;
          $('pmMotto').value = (me.deco && me.deco.motto) || '';
          $('profileModal').hidden = false;
        } else if (name === me.u) switchAppTab('home');
        else openHomeOverlay(name);
      });
    });

    $('usYearbook').addEventListener('click', () => showYearbook(true));
    $('usGuide').addEventListener('click', () => showOnboard(true));
    $('usShare').addEventListener('click', createShare);
    $('usRecovery').addEventListener('click', openRecoveryModal);
    $('usDelete').addEventListener('click', deleteAccountFlow);
    $('usIcs').addEventListener('click', () => {
      const blob = new Blob([makeICS()], { type: 'text/calendar;charset=utf-8' });
      download(blob, `我们的纪念日-${couple.code}.ics`);
    });

    $('usExport').addEventListener('click', () => {
      const safeUser = (m) => {
        const u = users[m] || { u: m };
        const copy = Object.assign({}, u);
        delete copy.pw;
        return copy;
      };
      const data = {
        exportedAt: new Date().toISOString(),
        app: '银河之约',
        couple,
        members: couple.members.map(safeUser),
        entries: list,
        messages: loadMsgs(couple.code),
        photos: list.reduce((arr, e) => arr.concat((e.photos || []).map((src, i) => ({
          entry: e.id, date: e.date, author: e.author, index: i, url: src,
        }))), []),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      download(blob, `our-space-${couple.code}-${todayKey()}.json`);
    });
    $('usUnpair').addEventListener('click', async () => {
      if (!confirm('解除配对后，两人都会退出这个空间（记录仍会保留）。确定吗？')) return;
      if (cloudOn()) {
        try {
          await C.leaveSpace();
          me.couple = null;
          cacheUsers[me.u] = me;
        } catch { syncState('同步失败'); return; }
      } else {
        const couples = loadCouples();
        const c = couples[couple.code];
        c.members = c.members.filter((m) => m !== me.u);
        if (!c.members.length) delete couples[couple.code];
        saveCouples(couples);
        const us = loadUsers();
        us[me.u].couple = null;
        saveUsers(us);
        me = us[me.u];
      }
      couple = null;
      renderTop();
      renderPairScreen();
    });
  }

  /* ---- 只读分享快照 ---- */
  function buildSharePayload() {
    const p = partner();
    const list = entries().slice().sort((a, b) => b.ts - a.ts);
    const photoCount = list.reduce((n, e) => n + (e.photos || []).length, 0);
    const days = new Set(list.map((e) => e.date)).size;
    const since = couple.since ? new Date(couple.since + 'T00:00:00') : null;
    const together = since && !isNaN(since)
      ? Math.max(1, Math.floor((Date.now() - since.getTime()) / 86400000) + 1) : 0;
    const moods = {};
    list.forEach((e) => { if (e.mood) moods[e.mood] = (moods[e.mood] || 0) + 1; });
    const topMood = Object.keys(moods).sort((a, b) => moods[b] - moods[a])[0] || '';
    return {
      v: 1,
      names: [me.nick, p ? p.nick : ''],
      since: couple.since || '',
      days: together,
      stats: { entries: list.length, photos: photoCount, days },
      mood: topMood,
      recent: list.slice(0, 6).map((e) => ({
        date: e.date,
        mood: e.mood || '',
        title: e.title || '',
        text: (e.text || '').slice(0, 90),
        photos: (e.photos || []).filter((u2) => safeUrl(u2)).slice(0, 2),
      })),
      created: Date.now(),
    };
  }

  async function createShare() {
    const payload = buildSharePayload();
    if (!payload.stats.entries) { alert('还没有记录可以分享，先写一篇日记吧。'); return; }
    const btn = $('usShare');
    btn.disabled = true;
    btn.textContent = '生成中…';
    try {
      let code;
      if (cloudOn()) {
        code = await C.shareCreate(payload);
        if (!code || typeof code !== 'string') throw new Error('云端没有返回分享码');
      } else {
        const all = store.read(LS.shares, {});
        code = 'L' + Date.now().toString(36).toUpperCase().slice(-5);
        all[code] = payload;
        const keys = Object.keys(all);
        if (keys.length > 30) keys.sort().slice(0, keys.length - 30).forEach((k) => { delete all[k]; });
        store.write(LS.shares, all);
      }
      $('shareUrl').value = location.href.split('?')[0] + '?share=' + code;
      $('shareModal').hidden = false;
    } catch (e) {
      const s = String((e && e.message) || e || '');
      if (/lm_share_create|schema cache|could not find|function/i.test(s)) {
        alert('生成失败：云端还没有分享快照功能。\n请在 Supabase SQL Editor 执行「说明.md · 约定」一节的 SQL 后再试。');
      } else {
        alert('生成失败：' + (s || '网络错误'));
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '生成分享链接';
    }
  }

  /* ---- 恢复码 / 注销 ---- */
  function genRecoveryCode() {
    const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 10; i++) s += cs[Math.floor(Math.random() * cs.length)];
    return s.slice(0, 5) + '-' + s.slice(5);
  }
  function normCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  function openRecoveryModal() {
    $('rcCode').textContent = genRecoveryCode();
    $('rcHint').textContent = '';
    $('recoveryModal').hidden = false;
  }

  async function deleteAccountFlow() {
    if (!confirm('注销账号会删除你的日记、私信、时间胶囊与清单，且无法恢复。确定继续吗？')) return;
    const typed = prompt('请输入你的用户名「' + me.u + '」以确认注销：');
    if (!typed || typed.trim().toLowerCase() !== me.u) { alert('用户名不匹配，已取消。'); return; }
    try {
      if (cloudOn()) {
        const r = await C.deleteAccount(me.u);
        if (r && r.error) throw new Error(r.error);
        localStorage.removeItem(LS.session);
        setToken('');
      } else {
        const users = loadUsers();
        const couples = loadCouples();
        const code = me.couple;
        if (code && couples[code]) {
          couples[code].members = couples[code].members.filter((m) => m !== me.u);
          if (!couples[code].members.length) delete couples[code];
          saveCouples(couples);
          saveEntries(code, loadEntries(code).filter((e) => e.author !== me.u));
          saveMsgs(code, loadMsgs(code).filter((m) => m.sender !== me.u));
          store.write(LS.caps(code), store.read(LS.caps(code), []).filter((c) => c.author !== me.u));
          store.write(LS.daily(code), store.read(LS.daily(code), []).filter((d) => d.author !== me.u));
          store.write(LS.bucket(code), store.read(LS.bucket(code), []).filter((b) => b.author !== me.u));
        }
        delete users[me.u];
        saveUsers(users);
        localStorage.removeItem(LS.session);
      }
      alert('账号已注销，再见。');
      location.reload();
    } catch (e) {
      const s = String((e && e.message) || e || '');
      if (/lm_delete_account|schema cache|could not find|function/i.test(s)) {
        alert('注销失败：云端还没有注销功能。\n请在 Supabase SQL Editor 执行「说明.md · 约定」一节的 SQL 后再试。');
      } else {
        alert('注销失败：' + (s || '网络错误'));
      }
    }
  }

  /* ---------------- 个人主页（头像 / 昵称 / 个性签名 / 背景板） ---------------- */
  const HP_BGS = [
    { k: 'deep',   n: '深空', css: 'radial-gradient(ellipse 90% 90% at 70% 10%, #14264f 0%, #070d20 55%, #03050e 100%)' },
    { k: 'nebula', n: '星云', css: 'radial-gradient(ellipse 90% 90% at 30% 10%, #452a75 0%, #180d31 55%, #07040f 100%)' },
    { k: 'warm',   n: '胶片', css: 'radial-gradient(ellipse 90% 90% at 70% 10%, #7a5230 0%, #2e1c11 55%, #120906 100%)' },
    { k: 'mist',   n: '雾粉', css: 'radial-gradient(ellipse 90% 90% at 30% 15%, #8a5568 0%, #37222e 55%, #140b11 100%)' },
    { k: 'aurora', n: '极光', css: 'radial-gradient(ellipse 90% 90% at 70% 5%, #176055 0%, #0a2a2e 55%, #04100e 100%)' },
    { k: 'gold',   n: '墨金', css: 'radial-gradient(ellipse 90% 90% at 60% 10%, #7a6423 0%, #2e260d 55%, #100d04 100%)' },
  ];
  function hpBgStyle(u) {
    const bg = (u.deco && u.deco.bg) || null;
    if (bg && bg.t === 'img' && bg.url) {
      const url = safeUrl(bg.url);
      if (url) return `background-image:url("${url}");background-size:cover;background-position:center;`;
    }
    const p = HP_BGS.find((x) => bg && bg.t === 'preset' && x.k === bg.k) || HP_BGS[0];
    return `background:${p.css};`;
  }
  async function saveProfile(patch) {
    const next = Object.assign({}, me, patch);
    if (cloudOn()) {
      await C.updateProfile({ u: me.u, nick: next.nick, avatar: next.avatar || '', deco: next.deco || {} });
      me = next;
      cacheUsers[me.u] = next;
      syncState('云端已同步');
    } else {
      const users = loadUsers();
      users[me.u] = Object.assign({}, users[me.u], patch);
      saveUsers(users);
      me = users[me.u];
    }
    renderTop();
  }
  function profileFailHint(e) {
    const s = String((e && e.message) || e || '');
    if (/lm_update_profile|avatar|deco|schema cache|could not find|function/i.test(s)) {
      alert('保存失败：云端还没有个人资料新字段。\n请在 Supabase SQL Editor 执行「说明.md · 5.6 个人主页」一节的 SQL 后再试。');
    } else {
      alert('保存失败：' + (s || '网络错误'));
    }
  }
  function renderHome(main, username, readonly) {
    const users = userMap();
    const u = users[username] || me;
    const own = !readonly && u.u === me.u;
    const list = entries().filter((e) => e.author === u.u).sort((a, b) => b.ts - a.ts);
    const photoCount = list.reduce((n, e) => n + (e.photos || []).length, 0);
    const dayCount = new Set(list.map((e) => e.date)).size;
    const lastMood = ((list.find((e) => e.mood) || {}).mood) || '—';
    const motto = (u.deco && u.deco.motto) || '';
    const bg = (u.deco && u.deco.bg) || null;
    const curKey = bg ? (bg.t === 'img' ? '__img' : bg.k) : 'deep';
    const recent = list.slice(0, 5);

    main.innerHTML = `
      <div class="hp">
        <div class="hp-bg" style="${hpBgStyle(u)}">
          ${own ? '<button type="button" class="hp-bg-btn" id="hpBgBtn">✦ 装饰背景</button>' : ''}
        </div>
        <div class="hp-id">
          <div class="hp-avatar${own ? ' editable' : ''}" id="hpAvatar"${own ? ' title="点击换头像"' : ''}>${
            u.avatar ? `<img src="${safeUrl(u.avatar)}" alt="" />` : `<span class="hp-letter">${esc(u.nick.slice(0, 1))}</span>`
          }</div>
          <div class="hp-nick">${esc(u.nick)}</div>
          <div class="hp-motto">${motto ? '「' + esc(motto) + '」' : (own ? '写一句个性签名，让TA看到此刻的你' : 'TA还没有留下签名')}</div>
          <div class="hp-meta">${esc(u.sign || '')}${u.bday ? ` · 生日 ${esc(u.bday.slice(5).replace('-', '.'))}` : ''}</div>
          ${own ? '<button type="button" class="btn-ghost hp-edit-btn" id="hpEdit">编辑资料</button>' : ''}
        </div>
        <div class="hp-cards">
          <div class="hp-stat"><b>${list.length}</b><span>篇日记</span></div>
          <div class="hp-stat"><b>${photoCount}</b><span>张照片</span></div>
          <div class="hp-stat"><b>${dayCount}</b><span>天记录</span></div>
          <div class="hp-stat"><b>${esc(lastMood)}</b><span>最近心情</span></div>
        </div>
        ${own ? `
        <div class="hp-panel" id="hpDeco" hidden>
          <div class="hp-panel-t">选择背景板</div>
          <div class="hp-sw-grid">
            ${HP_BGS.map((p) => `<button type="button" class="hp-sw${curKey === p.k ? ' on' : ''}" data-bg="${p.k}" style="background:${p.css}"><span>${p.n}</span></button>`).join('')}
            ${bg && bg.t === 'img' ? `<button type="button" class="hp-sw on" data-bg="__img" style="background-image:url('${safeUrl(bg.url)}');background-size:cover;background-position:center"><span>自定义</span></button>` : ''}
          </div>
          <div class="hp-deco-row">
            <button type="button" class="btn-ghost" id="hpBgUp">上传图片作背景</button>
            ${bg ? '<button type="button" class="btn-ghost" id="hpBgReset">恢复默认背景</button>' : ''}
          </div>
          <p class="hp-hint">背景板保存在云端，TA打开你的主页也能看到。自定义图片建议横向、不超过 5MB。</p>
        </div>` : ''}
        <div class="hp-recent">
          <div class="hp-recent-t">${own ? '我的最近记录' : 'TA的最近记录'}</div>
          ${recent.length ? recent.map((e) => `
            <div class="hp-re-item">
              <span class="hp-re-date">${esc(e.date.slice(5).replace('-', '.'))}</span>
              ${e.mood ? `<span class="hp-re-mood">${esc(e.mood)}</span>` : ''}
              <span class="hp-re-text">${esc(e.title || (e.text || '').slice(0, 30) || '（照片记录）')}</span>
              ${(e.photos || []).length ? `<span class="hp-re-ph">图×${e.photos.length}</span>` : ''}
            </div>`).join('')
          : '<p class="hp-empty">还没有记录，去写第一篇吧。</p>'}
        </div>
      </div>`;

    if (!own) return;

    $('hpEdit').addEventListener('click', () => {
      $('pmNick').value = me.nick;
      $('pmMotto').value = (me.deco && me.deco.motto) || '';
      $('profileModal').hidden = false;
    });
    $('hpBgBtn').addEventListener('click', () => {
      const p = $('hpDeco');
      p.hidden = !p.hidden;
      if (!p.hidden) p.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('hpAvatar').addEventListener('click', () => {
      pickImage('image/*', async (f) => {
        if (!f.type.startsWith('image/')) { alert('请选择图片文件'); return; }
        if (f.size > 20 * 1024 * 1024) { alert('头像图片请小于 20MB'); return; }
        try {
          const dataUrl = await compressImageMax(f, 512);
          const avatar = cloudOn() ? await C.uploadPhoto(dataUrl, `avatar-${me.u}-${Date.now()}.jpg`) : dataUrl;
          await saveProfile({ avatar });
          renderMain();
        } catch (e2) { profileFailHint(e2); }
      });
    });
    $('hpDeco').querySelectorAll('.hp-sw').forEach((b) => {
      b.addEventListener('click', async () => {
        const k = b.getAttribute('data-bg');
        if (k === '__img') return;
        try {
          await saveProfile({ deco: Object.assign({}, me.deco, { bg: { t: 'preset', k } }) });
          renderMain();
        } catch (e2) { profileFailHint(e2); }
      });
    });
    const bgUp = $('hpBgUp');
    if (bgUp) bgUp.addEventListener('click', () => {
      pickImage('image/*', async (f) => {
        if (!f.type.startsWith('image/')) { alert('请选择图片文件'); return; }
        if (f.size > 5 * 1024 * 1024) { alert('背景图片请小于 5MB'); return; }
        try {
          const dataUrl = await compressImageMax(f, 1600);
          const url = cloudOn() ? await C.uploadPhoto(dataUrl, `bg-${me.u}-${Date.now()}.jpg`) : dataUrl;
          await saveProfile({ deco: Object.assign({}, me.deco, { bg: { t: 'img', url } }) });
          renderMain();
        } catch (e2) { profileFailHint(e2); }
      });
    });
    const bgReset = $('hpBgReset');
    if (bgReset) bgReset.addEventListener('click', async () => {
      try {
        await saveProfile({ deco: Object.assign({}, me.deco, { bg: null }) });
        renderMain();
      } catch (e2) { profileFailHint(e2); }
    });
  }
  function openHomeOverlay(username) {
    $('homeOverlay').hidden = false;
    renderHome($('homeBody'), username, true);
  }
  $('homeClose').addEventListener('click', () => { $('homeOverlay').hidden = true; });
  $('pmCancel').addEventListener('click', () => { $('profileModal').hidden = true; });
  $('pmSave').addEventListener('click', async () => {
    const nick = $('pmNick').value.trim().slice(0, 24) || me.nick;
    const motto = $('pmMotto').value.trim().slice(0, 40);
    try {
      await saveProfile({ nick, deco: Object.assign({}, me.deco, { motto }) });
      $('profileModal').hidden = true;
      renderMain();
    } catch (e2) { profileFailHint(e2); }
  });

  /* ---- 恢复码弹层 ---- */
  $('rcCancel').addEventListener('click', () => { $('recoveryModal').hidden = true; });
  $('rcCopy').addEventListener('click', async () => {
    const code = $('rcCode').textContent.trim();
    try { await navigator.clipboard.writeText(code); $('rcCopy').textContent = '已复制'; }
    catch { $('rcHint').textContent = '浏览器不允许自动复制，请手动抄下来。'; }
  });
  $('rcSave').addEventListener('click', async () => {
    const code = $('rcCode').textContent.trim();
    const btn = $('rcSave');
    btn.disabled = true;
    try {
      if (cloudOn()) {
        const r = await C.setRecovery(me.u, code);
        if (r && r.error) throw new Error(r.error);
      } else {
        const users = loadUsers();
        users[me.u].rh = hash(normCode(code));
        saveUsers(users);
        me = users[me.u];
      }
      $('recoveryModal').hidden = true;
      alert('恢复码已保存，请抄在安全的地方：\n' + code);
    } catch (e) {
      const s = String((e && e.message) || e || '');
      if (/lm_set_recovery|recovery_hash|schema cache|could not find|function/i.test(s)) {
        alert('保存失败：云端还没有恢复码功能。\n请在 Supabase SQL Editor 执行「说明.md · 约定」一节的 SQL 后再试。');
      } else {
        alert('保存失败：' + (s || '网络错误'));
      }
    } finally {
      btn.disabled = false;
    }
  });

  /* ---- 分享链接弹层 ---- */
  $('shareClose').addEventListener('click', () => { $('shareModal').hidden = true; });
  $('shareCopy').addEventListener('click', async () => {
    const inp = $('shareUrl');
    inp.select();
    try {
      await navigator.clipboard.writeText(inp.value);
    } catch {
      try { document.execCommand('copy'); } catch { /* 忽略 */ }
    }
    $('shareCopy').textContent = '已复制';
  });

  /* ---- 登录页：忘记密码 / 恢复码重置 ---- */
  $('forgotBtn').addEventListener('click', () => {
    $('rvErr').textContent = '';
    $('rvUser').value = $('loginUser').value.trim();
    $('rvCode').value = '';
    $('rvPass').value = '';
    $('recoverModal').hidden = false;
  });
  $('rvCancel').addEventListener('click', () => { $('recoverModal').hidden = true; });
  $('rvGo').addEventListener('click', async () => {
    const u = $('rvUser').value.trim();
    const code = $('rvCode').value.trim();
    const pass = $('rvPass').value;
    const err = $('rvErr');
    err.textContent = '';
    if (!u || !code) { err.textContent = '请填写用户名和恢复码'; return; }
    if (pass.length < 4) { err.textContent = '新密码至少 4 位'; return; }
    const btn = $('rvGo');
    btn.disabled = true;
    try {
      if (cloudOn()) {
        const r = await C.recoverReset(u, code, pass);
        if (r && r.error === 'bad_code') { err.textContent = '恢复码不正确'; return; }
        if (r && r.error === 'weak') { err.textContent = '新密码太短'; return; }
        if (r && r.error) { err.textContent = '重置失败：' + r.error; return; }
      } else {
        const users = loadUsers();
        const target = users[u] || users[u.toLowerCase()];
        if (!target || !target.rh || target.rh !== hash(normCode(code))) {
          err.textContent = '恢复码不正确'; return;
        }
        target.pw = hash(pass);
        saveUsers(users);
      }
      $('recoverModal').hidden = true;
      closeAuth();
      $('loginUser').value = u;
      $('loginPass').value = pass;
      alert('密码已重置，直接点「登录」即可进入。');
    } catch (e) {
      const s = String((e && e.message) || e || '');
      if (/lm_recover_reset|recovery_hash|schema cache|could not find|function/i.test(s)) {
        err.textContent = '云端还没有恢复码功能，请先执行说明.md 里的 SQL';
      } else {
        err.textContent = '重置失败：' + (s || '网络错误');
      }
    } finally {
      btn.disabled = false;
    }
  });

  /* ---- 只读分享页（?share=CODE，无需登录） ---- */
  async function openSharePage(code) {
    const page = $('sharePage');
    if (!page) return;
    page.hidden = false;
    document.body.classList.add('share-mode');
    $('shareBody').innerHTML = '<div class="sh-loading">正在打开这份回忆…</div>';
    let payload = null;
    if (cloudOn()) {
      try { payload = await C.shareGet(code); } catch { payload = null; }
    }
    if (!payload) {
      const all = store.read(LS.shares, {});
      payload = all[code] || all[String(code).toUpperCase()] || null;
    }
    if (!payload || !payload.names) {
      $('shareBody').innerHTML = `
        <div class="sh-card">
          <div class="sh-miss">
            <p>这份分享已失效或不存在。</p>
            <p class="sh-miss-sub">可能是链接不完整，或这份快照已经被清理。</p>
            <button type="button" class="btn-primary" id="shBack">回到首页</button>
          </div>
        </div>`;
      bindShareBack();
      return;
    }
    const names = (payload.names || []).filter(Boolean).map((x) => esc(x)).join(' & ') || '我们';
    const st = payload.stats || {};
    const rec = Array.isArray(payload.recent) ? payload.recent : [];
    $('shareBody').innerHTML = `
      <div class="sh-card">
        <div class="sh-top"><span>GALACTIC PROMISE</span><span>READ ONLY</span></div>
        <div class="sh-title">银河之约</div>
        <div class="sh-names">${names}</div>
        <div class="sh-days">${payload.days ? '在一起第 ' + Number(payload.days) + ' 天' : '我们的时间线'}</div>
        <div class="sh-stats">
          <div><b>${Number(st.entries) || 0}</b><span>篇记录</span></div>
          <div><b>${Number(st.photos) || 0}</b><span>张照片</span></div>
          <div><b>${Number(st.days) || 0}</b><span>天有记录</span></div>
        </div>
        ${payload.mood ? `<div class="sh-mood">最常的心情 · ${esc(payload.mood)}</div>` : ''}
        <div class="sh-list">
          <div class="sh-list-t">最近的日子</div>
          ${rec.map((r) => {
            const ph = (r.photos || []).map((x) => safeUrl(x)).filter(Boolean).slice(0, 2);
            return `<div class="sh-item">
              <div class="sh-item-head"><span>${esc(fmtDay(r.date))}</span>${r.mood ? `<span class="sh-item-mood">${esc(r.mood)}</span>` : ''}</div>
              ${r.title ? `<div class="sh-item-title">${esc(r.title)}</div>` : ''}
              ${r.text ? `<p class="sh-item-text">${esc(r.text)}</p>` : ''}
              ${ph.length ? `<div class="sh-photos">${ph.map((x) => `<img src="${x}" alt="" loading="lazy" />`).join('')}</div>` : ''}
            </div>`;
          }).join('') || '<p class="sh-miss-sub">还没有可展示的记录。</p>'}
        </div>
        <div class="sh-foot">
          <span>${payload.created ? '分享于 ' + fmtDay(todayKey(new Date(payload.created))) : '只读快照'}</span>
          <span>只读 · 不含私信</span>
        </div>
        <button type="button" class="btn-primary sh-back" id="shBack">回到银河之约</button>
      </div>`;
    bindShareBack();
  }
  function bindShareBack() {
    const b = $('shBack');
    if (!b) return;
    b.addEventListener('click', () => { location.href = location.href.split('?')[0]; });
  }

  /* ---- 回忆年鉴：1080 × 1350 的图片，可保存分享 ---- */
  function yearbookData() {
    const list = entries();
    const year = new Date().getFullYear();
    const mine = list.filter((e) => String(e.date || '').startsWith(String(year)));
    if (!mine.length) return null;
    const photoCount = mine.reduce((n, e) => n + (e.photos || []).length, 0);
    const moodMap = {};
    for (const e of mine) if (e.mood) moodMap[e.mood] = (moodMap[e.mood] || 0) + 1;
    const topMood = Object.keys(moodMap).sort((a, b) => moodMap[b] - moodMap[a])[0] || '—';
    const monthMap = {};
    for (const e of mine) {
      const m = Number(e.date.slice(5, 7));
      if (m) monthMap[m] = (monthMap[m] || 0) + 1;
    }
    const topMonth = Object.keys(monthMap).sort((a, b) => monthMap[b] - monthMap[a])[0] || '';
    const users = loadUsers();
    const authorMap = {};
    for (const e of mine) authorMap[e.author] = (authorMap[e.author] || 0) + 1;
    const topAuthor = Object.keys(authorMap).sort((a, b) => authorMap[b] - authorMap[a])[0] || '';
    const topAuthorNick = (users[topAuthor] && users[topAuthor].nick) || '';
    const since = couple && couple.since ? new Date(couple.since + 'T00:00:00') : null;
    const togetherDays = since && !isNaN(since) ? Math.max(1, Math.floor((Date.now() - since.getTime()) / 86400000) + 1) : 0;
    const recordedDays = new Set(mine.map((e) => e.date)).size;
    return {
      year, mine, photoCount, topMood, topMonth, topAuthorNick,
      topAuthorCount: authorMap[topAuthor] || 0, togetherDays, recordedDays,
    };
  }

  function buildYearbook() {
    const s = yearbookData();
    if (!s) return null;
    const W = 1080, H = 1350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');

    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05070f');
    g.addColorStop(0.45, '#0a1226');
    g.addColorStop(1, '#04060e');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);

    const glow = x.createRadialGradient(W * 0.72, H * 0.16, 0, W * 0.72, H * 0.16, W * 0.62);
    glow.addColorStop(0, 'rgba(56, 130, 220, 0.28)');
    glow.addColorStop(0.55, 'rgba(60, 70, 150, 0.10)');
    glow.addColorStop(1, 'rgba(4, 6, 14, 0)');
    x.fillStyle = glow;
    x.fillRect(0, 0, W, H);

    let seed = 20261109;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 180; i++) {
      const px = rnd() * W, py = rnd() * H, r = 0.7 + rnd() * 1.9;
      x.globalAlpha = 0.06 + rnd() * 0.3;
      x.fillStyle = rnd() > 0.86 ? '#e8c97a' : '#dbeafe';
      x.beginPath(); x.arc(px, py, r, 0, 6.2832); x.fill();
    }
    x.globalAlpha = 1;

    x.strokeStyle = 'rgba(126, 148, 184, 0.22)';
    x.lineWidth = 1.5;
    x.strokeRect(52, 52, W - 104, H - 104);
    x.strokeStyle = 'rgba(232, 201, 122, 0.65)';
    x.lineWidth = 2;
    const tick = (tx, ty, dx, dy) => {
      x.beginPath(); x.moveTo(tx, ty); x.lineTo(tx + dx, ty); x.moveTo(tx, ty); x.lineTo(tx, ty + dy); x.stroke();
    };
    tick(52, 52, 34, 34); tick(W - 52, 52, -34, 34);
    tick(52, H - 52, 34, -34); tick(W - 52, H - 52, -34, -34);

    x.textBaseline = 'alphabetic';
    x.textAlign = 'left';
    x.letterSpacing = '6px';
    x.fillStyle = 'rgba(152, 166, 188, 0.85)';
    x.font = '500 21px "SF Mono", Consolas, monospace';
    x.fillText('GALACTIC PROMISE · MEMORY YEARBOOK', 96, 162);
    x.letterSpacing = '0px';

    x.fillStyle = '#e9eff8';
    x.font = '200 88px "PingFang SC", "Microsoft YaHei", sans-serif';
    x.fillText('回忆年鉴', 94, 300);

    x.fillStyle = '#e8c97a';
    x.font = '300 60px "SF Mono", Consolas, monospace';
    x.fillText(String(s.year), 96, 386);

    x.strokeStyle = 'rgba(232, 201, 122, 0.5)';
    x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(96, 424); x.lineTo(96 + 210, 424); x.stroke();

    x.fillStyle = 'rgba(205, 216, 232, 0.9)';
    x.font = '300 26px "PingFang SC", "Microsoft YaHei", sans-serif';
    x.fillText('这一年，我们把普通的日子，写成了只属于我们的星河。', 96, 478);

    const rows = [
      ['一起走过', (s.togetherDays ? `${s.togetherDays} 天` : '—')],
      ['写下日记', `${s.mine.length} 篇`],
      ['收藏照片', `${s.photoCount} 张`],
      ['记录天数', `${s.recordedDays} 天`],
      ['最常心情', s.topMood],
      ['最活跃的月份', s.topMonth ? `${Number(s.topMonth)} 月` : '—'],
      ['写得最多的人', s.topAuthorNick ? `${s.topAuthorNick} · ${s.topAuthorCount} 篇` : '—'],
    ];
    let y = 570;
    for (const [k, v] of rows) {
      x.textAlign = 'left';
      x.fillStyle = 'rgba(152, 166, 188, 0.9)';
      x.letterSpacing = '2px';
      x.font = '400 23px "SF Mono", Consolas, monospace';
      x.fillText(k, 96, y);
      x.letterSpacing = '0px';
      x.textAlign = 'right';
      x.fillStyle = '#e9eff8';
      x.font = '300 40px "PingFang SC", "Microsoft YaHei", sans-serif';
      x.fillText(v, W - 96, y + 2);
      x.strokeStyle = 'rgba(126, 148, 184, 0.16)';
      x.lineWidth = 1;
      x.beginPath(); x.moveTo(96, y + 34); x.lineTo(W - 96, y + 34); x.stroke();
      y += 86;
    }

    x.textAlign = 'left';
    x.fillStyle = 'rgba(232, 201, 122, 0.92)';
    x.font = '300 34px "PingFang SC", "Microsoft YaHei", sans-serif';
    x.fillText('愿每一次回头，都有一束光。', 96, H - 176);

    x.fillStyle = 'rgba(152, 166, 188, 0.75)';
    x.letterSpacing = '3px';
    x.font = '400 19px "SF Mono", Consolas, monospace';
    x.fillText(`银河之约 · 配对码 ${couple.code}`, 96, H - 106);
    x.textAlign = 'right';
    x.fillText('MADE WITH STARDUST', W - 96, H - 106);
    x.letterSpacing = '0px';

    return c.toDataURL('image/png');
  }

  let ybUrl = '';
  const ybEl = $('yearbook');

  function showYearbook(regen) {
    if (regen || !ybUrl) {
      const url = buildYearbook();
      if (!url) { alert('今年还没有记录。先写下一篇，再来生成回忆年鉴吧。'); return; }
      ybUrl = url;
      $('ybImg').src = url;
      const name = `回忆年鉴-${yearbookData().year}-${couple.code}.png`;
      $('ybDownload').setAttribute('download', name);
      $('ybDownload').setAttribute('href', url);
    }
    ybEl.hidden = false;
  }
  $('ybClose').addEventListener('click', () => { ybEl.hidden = true; });
  ybEl.addEventListener('click', (e) => { if (e.target === ybEl) ybEl.hidden = true; });
  $('ybAgain').addEventListener('click', () => { ybUrl = ''; showYearbook(true); });
  $('ybDownload').addEventListener('click', (e) => { if (!ybUrl) e.preventDefault(); });

  /* ---- 首次进入的三步引导 ---- */
  const ONBOARD_STEPS = [
    {
      title: '记录',
      text: '把普通的一天写进日记：一句心情、一张随手拍，都值得被留下。打开「今日」，就能写下你们的第一篇。',
    },
    {
      title: '相伴',
      text: '想说的话不必等到见面。「私信」里可以发文字、照片、文件，也能录一段语音留言；想念的时候，一通语音或视频，让距离短暂失效。',
    },
    {
      title: '回望',
      text: '照片会按月汇成相册，足迹会连成时间线。去「我们」里生成一张回忆年鉴、导出纪念日日历，让以后有迹可循。',
    },
  ];
  let obIdx = 0;

  function renderOb() {
    const s = ONBOARD_STEPS[obIdx];
    $('obStep').textContent = `STEP 0${obIdx + 1} / 03`;
    $('obTitle').textContent = s.title;
    $('obText').textContent = s.text;
    $('obDots').innerHTML = ONBOARD_STEPS.map((_, i) => `<i class="${i === obIdx ? 'on' : ''}"></i>`).join('');
    $('obNext').textContent = obIdx === ONBOARD_STEPS.length - 1 ? '开始记录 →' : '下一步 →';
  }
  function showOnboard(force) {
    if (!force) {
      try { if (localStorage.getItem('ot_onboarded') === '1') return; } catch { /* 忽略 */ }
    }
    obIdx = 0;
    renderOb();
    $('onboard').hidden = false;
  }
  function finishOnboard() {
    $('onboard').hidden = true;
    try { localStorage.setItem('ot_onboarded', '1'); } catch { /* 忽略 */ }
  }
  $('obSkip').addEventListener('click', finishOnboard);
  $('obNext').addEventListener('click', () => {
    if (obIdx < ONBOARD_STEPS.length - 1) { obIdx++; renderOb(); }
    else finishOnboard();
  });

  /* ---------------- 私信 ---------------- */
  const CHAT_REACTIONS = ['❤️', '😂', '😍', '😊', '😮', '😢', '🙏', '🎉'];

  function chatBubbles(list) {
    if (!list.length) {
      return '<div class="chat-empty">还没有私信。说一句「在吗」，从这里开始。</div>';
    }
    return list.map((m) => {
      const mine = m.sender === me.u;
      const u = loadUsers()[m.sender];
      const nick = (u && u.nick) || m.sender;
      const url = safeUrl(m.url);
      let body = '';
      if (m.recalled) {
        body = `<div class="chat-recalled">— 此消息已被撤回 —</div>`;
      } else if (m.kind === 'image' && url) {
        body = `<a class="chat-img" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" loading="lazy" alt=""></a>`;
      } else if (m.kind === 'audio' && url) {
        body = `<div class="chat-voice">
          <audio class="chat-audio" controls preload="metadata" src="${esc(url)}"></audio>
          <span class="chat-adur">语音留言 · ${fmtDuration(m.text)}</span>
        </div>`;
      } else if (m.kind === 'file' && url) {
        body = `<a class="chat-file" href="${esc(url)}" target="_blank" rel="noopener" download="${esc(m.name || 'file')}">
          <span class="cf-ic">▤</span>
          <span class="cf-name">${esc(m.name || '文件')}</span>
          <span class="cf-size">${fmtSize(m.size)}</span>
        </a>`;
      } else {
        body = `<div class="chat-text">${esc(m.text).replace(/\n/g, '<br>')}</div>`;
      }

      // 引用块
      const quote = (!m.recalled && m.reply_to) ? chatQuoteBlock(m.reply_to) : '';
      // 表情回应
      const reactChips = chatReactionChips(m, mine);

      // 气泡内操作按钮（hover/active 时显示）
      const canRecall = mine && !m.recalled && (Date.now() - m.ts) < 120000;
      const ops = !m.recalled ? `
        <div class="chat-ops" hidden>
          <button type="button" class="chat-op" data-op="react" title="表情回应">☺</button>
          <button type="button" class="chat-op" data-op="quote" title="引用回复">↩</button>
          ${canRecall ? '<button type="button" class="chat-op danger" data-op="recall" title="撤回（2 分钟内）">✕</button>' : ''}
        </div>` : '';

      // 长文字消息：超过 240 字截断 + 展开/收起按钮
      let longTog = '';
      if (m.kind === 'text' && !m.recalled && (m.text || '').length > 240) {
        longTog = `<button type="button" class="chat-long-btn" data-op="long">…展开</button>`;
      }

      return `
        <div class="chat-row${mine ? ' mine' : ''}${m.recalled ? ' recalled' : ''}${longTog ? ' long' : ''}" data-mid="${esc(m.id)}">
          <span class="chat-ava">${esc(nick.slice(0, 1))}</span>
          <div class="chat-bubble">
            ${quote}
            ${body}
            ${longTog}
            <span class="chat-time">${fmtTs(m.ts)}</span>
            ${mine && !m.recalled ? `<span class="chat-read${m.read_ts ? ' on' : ''}">${m.read_ts ? '已读' : '未读'}</span>` : ''}
            ${ops}
            ${reactChips}
          </div>
        </div>`;
    }).join('');
  }

  function chatQuoteBlock(q) {
    if (!q) return '';
    const users = loadUsers();
    const nick = (q.sender && users[q.sender] && users[q.sender].nick) || q.nick || (q.sender || 'TA');
    let preview = '';
    if (q.kind === 'image') preview = '[图片]';
    else if (q.kind === 'file') preview = '[文件]';
    else if (q.kind === 'audio') preview = '[语音]';
    else preview = esc((q.text || '').slice(0, 60));
    return `<div class="chat-quote" data-mid="${esc(q.id || '')}">
      <div class="cq-nick">${esc(nick)}</div>
      <div class="cq-preview">${preview}</div>
    </div>`;
  }

  function chatReactionChips(m, mine) {
    const emojis = Object.keys(m.reactions || {});
    if (!emojis.length) return '';
    return `<div class="chat-reacts">${emojis.map((e) => {
      const who = m.reactions[e] || [];
      const count = who.length;
      const mineReact = who.includes(me.u);
      return `<span class="chat-react${mineReact ? ' mine' : ''}" data-react="${esc(e)}">${esc(e)}${count > 1 ? `<small>${count}</small>` : ''}</span>`;
    }).join('')}</div>`;
  }

  /* ---- 撤回：我方消息 2 分钟内可撤回 ---- */
  function canRecallMsg(m) {
    return !!m && m.sender === me.u && !m.recalled && (Date.now() - m.ts) < 120000;
  }

  async function recallMsg(id) {
    const list = loadMsgs(couple.code);
    const m = list.find((x) => x.id === id);
    if (!m || !canRecallMsg(m)) return;
    m.recalled = true;
    if (cloudOn()) {
      try { await C.saveMsg(m, couple.code); syncState('云端已同步'); } catch { syncState('同步失败'); }
    }
    saveMsgs(couple.code, list);
    updateChatList();
  }

  /* ---- 引用回复 ---- */
  function quoteMsg(id) {
    const list = loadMsgs(couple.code);
    const m = list.find((x) => x.id === id);
    if (!m) return;
    replyDraft = {
      id: m.id, kind: m.kind,
      text: m.text || '', url: m.url || '',
      sender: m.sender, nick: (loadUsers()[m.sender] || {}).nick || m.sender,
    };
    updateReplyBar();
    $('chatInput') && $('chatInput').focus();
  }

  function clearReplyDraft() {
    replyDraft = null;
    updateReplyBar();
  }

  function updateReplyBar() {
    const bar = $('chatReplyBar');
    if (!bar) return;
    if (!replyDraft) { bar.hidden = true; return; }
    const u = loadUsers()[replyDraft.sender];
    const nick = (u && u.nick) || replyDraft.sender;
    let preview = '';
    if (replyDraft.kind === 'image') preview = '[图片]';
    else if (replyDraft.kind === 'file') preview = '[文件]';
    else if (replyDraft.kind === 'audio') preview = '[语音]';
    else preview = (replyDraft.text || '').slice(0, 40);
    bar.hidden = false;
    bar.innerHTML = `<span class="crb-label">↩ 回复 <b>${esc(nick)}</b></span><span class="crb-preview">${esc(preview)}</span><button type="button" class="crb-close" id="chatReplyClose" title="取消">×</button>`;
    $('chatReplyClose') && $('chatReplyClose').addEventListener('click', clearReplyDraft);
  }

  /* ---- 表情回应 ---- */
  async function toggleReaction(id, emoji) {
    const list = loadMsgs(couple.code);
    const m = list.find((x) => x.id === id);
    if (!m || m.recalled) return;
    m.reactions = m.reactions || {};
    const arr = m.reactions[emoji] || [];
    const idx = arr.indexOf(me.u);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(me.u);
    if (!arr.length) delete m.reactions[emoji];
    if (cloudOn()) {
      try { await C.saveMsg(m, couple.code); syncState('云端已同步'); } catch { syncState('同步失败'); }
    }
    saveMsgs(couple.code, list);
    updateChatList();
  }

  /* ---- 操作菜单：点操作按钮弹表情面板 ---- */
  function closeReactionPicker() {
    const p = document.querySelector('.chat-react-pop');
    if (p) p.remove();
  }
  function openReactionPicker(id, anchorEl) {
    closeReactionPicker();
    const pop = document.createElement('div');
    pop.className = 'chat-react-pop';
    pop.innerHTML = CHAT_REACTIONS.map((e) => `<button type="button" class="crp-btn" data-emoji="${e}">${e}</button>`).join('');
    document.body.appendChild(pop);
    // 定位到气泡下方
    const r = anchorEl.getBoundingClientRect();
    pop.style.left = (r.left + window.scrollX) + 'px';
    pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
    pop.addEventListener('click', (ev) => {
      const b = ev.target.closest('.crp-btn');
      if (b) { toggleReaction(id, b.dataset.emoji); closeReactionPicker(); }
    });
    setTimeout(() => {
      const h = (e) => { if (!pop.contains(e.target) && !anchorEl.contains(e.target)) { closeReactionPicker(); document.removeEventListener('click', h); } };
      document.addEventListener('click', h);
    }, 0);
  }

  /* ---- 私信自定义背景（保存在本机 localStorage，按配对隔离） ---- */
  const chatBgKey = (code) => 'ot_chatbg_' + code;
  function saveChatBg(cfg) {
    try { localStorage.setItem(chatBgKey(couple.code), JSON.stringify(cfg)); }
    catch { alert('图片太大，本机存不下，换一张小一点的试试'); }
  }
  function applyChatBg() {
    const wrap = document.querySelector('.chat-wrap');
    if (!wrap || !couple) return;
    const cfg = store.read(chatBgKey(couple.code), null);
    const dim = $('chatBgDim');
    if (cfg && cfg.img) {
      const d = cfg.dim == null ? 55 : cfg.dim;
      wrap.classList.add('has-bg');
      wrap.style.setProperty('--chat-bg', 'url("' + cfg.img + '")');
      wrap.style.setProperty('--chat-dim', String(d / 100));
      if (dim) dim.value = String(d);
    } else {
      wrap.classList.remove('has-bg');
      wrap.style.removeProperty('--chat-bg');
      wrap.style.removeProperty('--chat-dim');
      if (dim) dim.value = '55';
    }
  }

  function renderChat(main) {
    const p = partner();
    const list = loadMsgs(couple.code);
    main.innerHTML = `
      <div class="chat-wrap">
        <div class="chat-head">
          <div class="chat-head-l">
            <button type="button" class="chat-back" id="chatBack" aria-label="返回">←</button>
            <div class="chat-title">私信<span class="chat-sub">${p ? '仅你们两人可见 · ' + esc(p.nick) : '等TA加入后就能私信和通话'}</span></div>
          </div>
          <div class="chat-calls">
            <button type="button" class="btn-primary chat-call ghost" id="chatBgBtn">背景</button>
            <button type="button" class="btn-primary chat-call" id="chatCall"${p && cloudOn() ? '' : ' disabled'}>☎ 语音</button>
            <button type="button" class="btn-primary chat-call" id="chatVideoCall"${p && cloudOn() ? '' : ' disabled'}>▷ 视频</button>
          </div>
        </div>
        <div class="chat-bg-panel" id="chatBgPanel" hidden>
          <label class="cbp-btn">选择背景图<input type="file" id="chatBgFile" accept="image/*" hidden /></label>
          <button type="button" class="cbp-btn" id="chatBgReset">恢复默认</button>
          <label class="cbp-dim">遮罩<input type="range" id="chatBgDim" min="0" max="85" step="5" /></label>
        </div>
        ${!chatReady ? '<div class="waiting-bar">私信还没有在云端启用：请先在 Supabase 运行 说明.md 里的 lm_messages 建表 SQL。</div>' : ''}
        <div class="chat-list" id="chatList">${chatBubbles(list)}</div>
        <div class="rec-hint" id="recHint" hidden><i></i><span>正在录音</span><b id="recTime">0:00</b><em>再点一下结束 · 最长 60 秒</em></div>
        <div class="chat-reply-bar" id="chatReplyBar" hidden></div>
        <form class="chat-bar" id="chatForm">
          <button type="button" class="chat-tool chat-mic" id="chatMic" data-label="语音" title="语音留言：点一下开始录音，再点一下发送" aria-label="语音留言">🎤</button>
          <label class="chat-tool" data-label="图片" title="发送图片" aria-label="发送图片">🖼️<input type="file" id="chatImg" accept="image/*" hidden /></label>
          <label class="chat-tool" data-label="文件" title="发送文件" aria-label="发送文件">📎<input type="file" id="chatFile" hidden /></label>
          <input class="chat-input" id="chatInput" maxlength="500" placeholder="${replyDraft ? '回复 ' + esc(replyDraft.nick || 'TA') : '说点什么…'}" autocomplete="off" />
          <button type="submit" class="chat-send">发送</button>
        </form>
      </div>`;
    const input = $('chatInput');
    /* 草稿持久化：切页 / 关闭浏览器也能找回，按配对码隔离 */
    const draftKey = 'ot_draft_' + couple.code;
    try { chatDraft = localStorage.getItem(draftKey) || ''; } catch { chatDraft = ''; }
    input.value = chatDraft;
    input.addEventListener('input', (e) => {
      chatDraft = e.target.value;
      try { localStorage.setItem(draftKey, chatDraft || ''); } catch { /* 忽略容量超限 */ }
    });
    $('chatForm').addEventListener('submit', (e) => { e.preventDefault(); sendText(); });
    $('chatImg').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; sendImage(f); });
    $('chatFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; sendFile(f); });
    $('chatMic').addEventListener('click', toggleRecord);
    $('chatCall').addEventListener('click', () => startCall(false));
    $('chatVideoCall').addEventListener('click', () => startCall(true));
    $('chatBack').addEventListener('click', () => switchAppTab('today'));
    /* 自定义聊天背景：只存在本机，不占云端存储 */
    applyChatBg();
    $('chatBgBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const pnl = $('chatBgPanel');
      pnl.hidden = !pnl.hidden;
    });
    $('chatBgFile').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const img = await compressImageMax(f, 1600);
        const old = store.read(chatBgKey(couple.code), null) || {};
        saveChatBg({ img, dim: old.dim == null ? 55 : old.dim });
        applyChatBg();
      } catch { alert('这张图片读取失败，换一张试试'); }
    });
    $('chatBgDim').addEventListener('input', (e) => {
      const cfg = store.read(chatBgKey(couple.code), null) || {};
      cfg.dim = Number(e.target.value);
      saveChatBg(cfg);
      applyChatBg();
    });
    $('chatBgReset').addEventListener('click', () => {
      try { localStorage.removeItem(chatBgKey(couple.code)); } catch { /* 忽略 */ }
      applyChatBg();
    });
    const listEl = $('chatList');
    listEl.scrollTop = listEl.scrollHeight;
    /* 手机键盘弹起后可视区域变矮，自动贴底，避免发出的话看不到 */
    const ci = $('chatInput');
    if (ci) {
      ci.addEventListener('focus', () => { setTimeout(chatScrollBottom, 60); setTimeout(chatScrollBottom, 300); });
    }
    setTimeout(chatScrollBottom, 120);
    // 气泡内操作：点击显示 ops，点具体按钮执行
    listEl.addEventListener('click', (e) => {
      const bubble = e.target.closest('.chat-bubble');
      const row = e.target.closest('.chat-row');
      if (!bubble || !row) { closeReactionPicker(); return; }
      const mid = row.dataset.mid;
      const list0 = loadMsgs(couple.code);
      const m = list0.find((x) => x.id === mid);
      if (!m) return;

      // 点表情反应 chip → 反选/加上自己
      const reactChip = e.target.closest('.chat-react');
      if (reactChip) {
        e.stopPropagation();
        toggleReaction(mid, reactChip.dataset.react);
        return;
      }
      // 点已有表情区域外层 → 弹 picker 加新表情
      const reactsArea = e.target.closest('.chat-reacts');
      if (reactsArea && !reactChip) {
        e.stopPropagation();
        openReactionPicker(mid, bubble);
        return;
      }

      // 点操作按钮
      const opBtn = e.target.closest('.chat-op');
      if (opBtn) {
        e.stopPropagation();
        const op = opBtn.dataset.op;
        if (op === 'recall') { if (confirm('撤回这条消息？')) recallMsg(mid); }
        else if (op === 'quote') { quoteMsg(mid); }
        else if (op === 'react') { openReactionPicker(mid, bubble); }
        return;
      }

      // 长消息「展开/收起」
      const longBtn = e.target.closest('.chat-long-btn');
      if (longBtn) {
        e.stopPropagation();
        const row = longBtn.closest('.chat-row');
        row.classList.toggle('expanded');
        longBtn.textContent = row.classList.contains('expanded') ? '收起' : '…展开';
        chatScrollBottom();
        return;
      }

      // 点气泡（除文字/图片本身）→ 显示 ops 栏；再点一下隐藏
      const ops = bubble.querySelector('.chat-ops');
      if (!ops) return;
      const hideOth = document.querySelectorAll('.chat-ops[hidden="false"]');
      hideOth.forEach((o) => { if (o !== ops) o.hidden = true; });
      ops.hidden = !ops.hidden;
    });
    // 点空白隐藏所有 ops 和 picker（全局只绑一次，见 bindChatDocClick）
    updateReplyBar();
    markChatSeen();
    refreshUnread();
    bindChatDocClick();
  }

  /* 全局只绑定一次：点击空白隐藏气泡操作/表情面板，避免 renderChat 多次调用时累积 */
  let chatDocBound = false;
  function bindChatDocClick() {
    if (chatDocBound) return;
    chatDocBound = true;
    document.addEventListener('click', (ev) => {
      if (!ev.target.closest('.chat-bubble')) {
        document.querySelectorAll('.chat-ops').forEach((o) => o.hidden = true);
        closeReactionPicker();
      }
    });
  }

  /* 私信页高度交给 CSS（100% 铺满布局视口），输入栏用 flex 永远贴底。
     安卓浏览器/Chrome 的 visualViewport 会把地址栏、键盘工具条再减一次，
     拿它算高度会算出过小值，所以这里不再使用它（iOS 除外）。 */
  const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function syncChatViewport() {
    const app = $('app');
    if (!app) return;
    app.style.height = '';
    app.style.top = '';
    // iOS 的键盘只缩小可视视口、不改布局视口，需要兜底抬高输入栏
    if (!IS_IOS || !app.querySelector('.chat-wrap')) return;
    const vv = window.visualViewport;
    if (!vv) return;
    app.style.height = Math.round(vv.height) + 'px';
    app.style.top = Math.round(vv.offsetTop) + 'px';
  }

  /* 私信滚动到底：发出消息、键盘弹起、窗口变矮时都要保证看到最新一条 */
  function chatScrollBottom() {
    const el = $('chatList');
    if (el) el.scrollTop = el.scrollHeight;
    const main = $('appMain');
    if (main && main.scrollHeight > main.clientHeight + 4) main.scrollTop = main.scrollHeight;
  }

  function updateChatList() {
    if (!couple) return;
    const el = $('chatList');
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    el.innerHTML = chatBubbles(loadMsgs(couple.code));
    if (nearBottom) chatScrollBottom();
    markChatSeen();
  }

  /* 手机键盘弹出/收起会改变可视高度，变化后重新贴合高度并贴底 */
  let refitTimer = 0;
  function refitChat() {
    if (typeof curTab === 'undefined' || curTab !== 'chat') return;
    syncChatViewport();
    clearTimeout(refitTimer);
    refitTimer = setTimeout(() => { syncChatViewport(); chatScrollBottom(); }, 120);
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', refitChat);
    window.visualViewport.addEventListener('scroll', refitChat);
  }
  window.addEventListener('resize', refitChat);
  window.addEventListener('orientationchange', () => setTimeout(refitChat, 260));

  function chatSendError(e) {
    if (isChatTableMissing(e)) {
      chatReady = false;
      alert('私信还没有在云端启用：请先在 Supabase 运行 说明.md 里的建表 SQL。');
    } else {
      alert('发送失败，请检查网络后重试。');
    }
  }

  async function storeMsg(m) {
    // 把当前待引用消息挂上；send 完成后清空 replyDraft
    if (replyDraft) { m.reply_to = replyDraft; }
    if (cloudOn()) {
      if (!chatReady) throw new Error('lm_messages: does not exist');
      await C.saveMsg(m, couple.code);
    }
    const list = loadMsgs(couple.code);
    list.push(m);
    saveMsgs(couple.code, list);
    updateChatList();
    chatScrollBottom();
    setTimeout(chatScrollBottom, 80);
    clearReplyDraft();
  }

  async function sendText() {
    if (chatBusy || !couple) return;
    const input = $('chatInput');
    const txt = (input ? input.value : chatDraft).trim();
    if (!txt) return;
    if (input) input.value = '';
    chatDraft = '';
    try { localStorage.removeItem('ot_draft_' + couple.code); } catch { /* 忽略 */ }
    chatBusy = true;
    try {
      await storeMsg({ id: newMsgId(), sender: me.u, kind: 'text', text: txt, url: '', name: '', size: 0, ts: Date.now() });
    } catch (e) {
      chatSendError(e);
      if (input) input.value = txt;
      chatDraft = txt;
    } finally {
      chatBusy = false;
    }
  }

  async function sendImage(file) {
    if (!file || chatBusy || !couple) return;
    if (!String(file.type || '').startsWith('image/')) { alert('只能发送图片文件。'); return; }
    if (file.size > 20 * 1048576) { alert('图片不能超过 20MB。'); return; }
    chatBusy = true;
    try {
      const dataUrl = await compressImage(file);
      let url = dataUrl;
      if (cloudOn()) url = await C.uploadPhoto(dataUrl, `chat-${me.u}-${Date.now()}.jpg`);
      await storeMsg({ id: newMsgId(), sender: me.u, kind: 'image', text: '', url, name: file.name, size: file.size, ts: Date.now() });
    } catch (e) {
      chatSendError(e);
    } finally {
      chatBusy = false;
    }
  }

  async function sendFile(file) {
    if (!file || chatBusy || !couple) return;
    if (!extAllowed(file.name, file.type)) {
      alert('暂不支持这种格式。可以发送图片、音频、视频、PDF、压缩包、Office 文档或 txt。');
      return;
    }
    if (cloudOn() && file.size > 15 * 1048576) { alert('文件不能超过 15MB。'); return; }
    if (!cloudOn() && file.size > 2 * 1048576) { alert('本机存储模式下文件需小于 2MB。'); return; }
    chatBusy = true;
    try {
      const dataUrl = await fileToDataUrl(file);
      let url = dataUrl;
      if (cloudOn()) url = await C.uploadChatFile(dataUrl, file.name, file.type || 'application/octet-stream');
      await storeMsg({ id: newMsgId(), sender: me.u, kind: 'file', text: '', url, name: file.name, size: file.size, ts: Date.now() });
    } catch (e) {
      chatSendError(e);
    } finally {
      chatBusy = false;
    }
  }

  /* ---- 异步语音留言：MediaRecorder 录音 → Storage → kind=audio ---- */
  function micBtn() { return $('chatMic'); }

  async function toggleRecord() {
    if (!couple) return;
    if (rec.recorder && rec.recorder.state !== 'inactive') { stopRecord(false); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      alert('这台设备的浏览器不支持录音。可以先发文字或照片。');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('没有拿到麦克风权限。请在浏览器设置里允许录音后再试。');
      return;
    }
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
    try {
      rec.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      alert('录音启动失败，请换一个浏览器试试。');
      return;
    }
    rec.stream = stream;
    rec.chunks = [];
    rec.cancel = false;
    rec.startAt = Date.now();
    rec.recorder.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
    rec.recorder.onstop = () => finishRecord();
    rec.recorder.start();

    const b = micBtn();
    if (b) { b.classList.add('recording'); b.textContent = '⏹'; b.title = '再点一下结束录音并发送'; }
    if ($('recHint')) $('recHint').hidden = false;
    const tick = () => {
      if ($('recTime') && rec.startAt) $('recTime').textContent = fmtDuration((Date.now() - rec.startAt) / 1000);
    };
    rec.timer = setInterval(tick, 500);
    tick();
    rec.auto = setTimeout(() => { if (rec.recorder && rec.recorder.state === 'recording') stopRecord(false); }, 60000);
  }

  function stopRecord(cancel) {
    rec.cancel = !!cancel;
    if (rec.timer) { clearInterval(rec.timer); rec.timer = null; }
    if (rec.auto) { clearTimeout(rec.auto); rec.auto = null; }
    try {
      if (rec.recorder && rec.recorder.state !== 'inactive') rec.recorder.stop();
      else finishRecord();
    } catch { finishRecord(); }
  }

  function releaseMic() {
    if (rec.stream) {
      rec.stream.getTracks().forEach((t) => t.stop());
      rec.stream = null;
    }
  }

  async function finishRecord() {
    releaseMic();
    const sec = rec.startAt ? Math.round((Date.now() - rec.startAt) / 1000) : 0;
    const chunks = rec.chunks.slice();
    const mimeType = (rec.recorder && rec.recorder.mimeType) || 'audio/webm';
    const wasCancel = rec.cancel;
    rec.recorder = null;
    rec.chunks = [];
    rec.startAt = 0;
    const b = micBtn();
    if (b) { b.classList.remove('recording'); b.textContent = '🎤'; b.title = '语音留言：点一下开始录音，再点一下发送'; }
    if ($('recHint')) $('recHint').hidden = true;
    if (wasCancel || !chunks.length || sec < 1 || !couple) return;

    const blob = new Blob(chunks, { type: mimeType });
    const limit = cloudOn() ? 15 * 1048576 : 2 * 1048576;
    if (blob.size > limit) { alert('这段语音太长了，换短一点再试。'); return; }
    chatBusy = true;
    try {
      const dataUrl = await fileToDataUrl(blob);
      let url = dataUrl;
      if (cloudOn()) {
        const ext = mimeType.indexOf('mp4') >= 0 ? 'm4a' : 'webm';
        url = await C.uploadChatFile(dataUrl, `voice-${me.u}-${Date.now()}.${ext}`, mimeType);
      }
      await storeMsg({
        id: newMsgId(), sender: me.u, kind: 'audio', text: String(sec),
        url, name: '语音留言', size: blob.size, ts: Date.now(),
      });
    } catch (e) {
      chatSendError(e);
    } finally {
      chatBusy = false;
    }
  }

  /* ---------------- 语音通话（WebRTC，信令走 lm_messages） ---------------- */
  /* 需要中转（TURN）时，把自己服务器的地址填进来即可，例如：
     [{ urls: 'turn:你的域名:3478', username: 'user', credential: 'pass' }] */
  const TURN_SERVERS = [];
  const ICE = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      ...TURN_SERVERS,
    ],
  };
  const callOverlay = $('callOverlay');

  function setCallState(s) {
    callState = s;
    const p = partner();
    const videoUi = callIsVideo && s !== 'idle';
    callOverlay.hidden = s === 'idle';
    $('callCard').classList.toggle('video', videoUi);
    $('callRemote').style.display = (videoUi && remoteStream) ? 'block' : 'none';
    $('callLocal').style.display = (videoUi && localStream && localStream.getVideoTracks().length > 0) ? 'block' : 'none';
    $('callAccept').hidden = s !== 'ringing';
    $('callMute').hidden = s !== 'active';
    $('callHang').hidden = s === 'idle';
    $('callName').textContent = p ? p.nick : 'TA';
    $('callAvatar').textContent = p ? p.nick.slice(0, 1) : '?';
    $('callTimerText').hidden = s !== 'active';
    $('callMute').textContent = muted ? '取消静音' : '静音';
    const label = {
      calling: callIsVideo ? '正在视频呼叫…' : '正在呼叫…',
      ringing: callIsVideo ? '视频来电' : '来电',
      connecting: '接通中…',
      active: callIsVideo ? '视频通话中' : '通话中',
    }[s];
    if (label) $('callStatus').textContent = label;
  }

  /* 移动端自动播放策略兜底：先静音保证出画面，等用户点一下再恢复声音 */
  let remoteNeedsGesture = false;
  function resumeRemoteSound() {
    if (!remoteNeedsGesture) return;
    const v = $('callRemote');
    if (!v || !v.srcObject) return;
    remoteNeedsGesture = false;
    v.muted = false;
    v.play().catch(() => { });
    if (callState === 'active') $('callStatus').textContent = callIsVideo ? '视频通话中' : '通话中';
  }
  document.addEventListener('click', resumeRemoteSound, true);
  document.addEventListener('touchstart', resumeRemoteSound, { capture: true, passive: true });

  function attachRemote(stream) {
    if (!stream) return;
    remoteStream = stream;
    if (stream.getVideoTracks().length > 0) {
      const v = $('callRemote');
      v.srcObject = stream;
      v.style.display = 'block';
      const p = v.play();
      if (p && p.then) {
        p.catch(() => {
          /* 被自动播放策略拦下：静音重试，画面先出来 */
          v.muted = true;
          remoteNeedsGesture = true;
          v.play().catch(() => { });
          $('callStatus').textContent = '点一下画面恢复声音';
        });
      }
      $('callAudio').srcObject = null;
    } else {
      const a = $('callAudio');
      a.srcObject = stream;
      a.play().catch(() => { /* 需要用户点一下页面才有声音 */ });
    }
  }

  function attachLocal(stream) {
    if (!stream) return;
    if (stream.getVideoTracks().length > 0) {
      const v = $('callLocal');
      v.srcObject = stream;
      v.style.display = 'block';
      v.play().catch(() => { /* 本地预览失败忽略 */ });
    }
  }

  function callClock() {
    const t = Math.max(0, Math.floor((Date.now() - callStartAt) / 1000));
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    $('callTimerText').textContent = mm + ':' + ss;
  }
  function startCallClock() {
    if (callClockId) return;
    callStartAt = Date.now();
    callClock();
    callClockId = setInterval(callClock, 1000);
  }
  function stopCallClock() {
    if (callClockId) { clearInterval(callClockId); callClockId = null; }
    callStartAt = 0;
  }

  function fmtCallDur(sec) {
    if (sec < 60) return sec + ' 秒';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m < 60) return s ? (m + ' 分 ' + s + ' 秒') : (m + ' 分钟');
    return Math.floor(m / 60) + ' 小时' + ((m % 60) ? (' ' + (m % 60) + ' 分') : '');
  }
  let callSummaryTimer = null;
  function showCallSummary(text, icon) {
    let el = $('callSummary');
    if (!el) {
      el = document.createElement('div');
      el.id = 'callSummary';
      el.className = 'call-summary';
      document.body.appendChild(el);
    }
    el.innerHTML = '<span class="cs-icon">' + (icon || '📞') + '</span><span class="cs-txt">' + esc(text) + '</span>';
    el.classList.add('show');
    if (callSummaryTimer) clearTimeout(callSummaryTimer);
    callSummaryTimer = setTimeout(() => el.classList.remove('show'), 4200);
  }

  function endCall(reason, silent) {
    const wasVideo = callIsVideo;
    const durSec = callStartAt ? Math.max(0, Math.floor((Date.now() - callStartAt) / 1000)) : 0;
    const prevState = callState;
    if (callTimeoutId) { clearTimeout(callTimeoutId); callTimeoutId = null; }
    stopFastSignals();
    stopCallClock();
    if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      pc = null;
    }
    const a = $('callAudio');
    a.srcObject = null;
    try { a.pause(); } catch { /* 忽略 */ }
    const rv = $('callRemote');
    rv.srcObject = null;
    rv.style.display = 'none';
    const lv = $('callLocal');
    lv.srcObject = null;
    lv.style.display = 'none';
    $('callCard').classList.remove('video');
    $('callCard').classList.remove('swapped');
    $('callRemote').muted = false;
    remoteNeedsGesture = false;
    remoteStream = null;
    callIsVideo = false;
    pendingIce = [];
    incomingOffer = null;
    muted = false;
    callState = 'idle';
    callOverlay.hidden = true;

    /* 结束提示：接通过的显示时长，没接通的分情况说明 */
    if (!silent) {
      let msg;
      let icon = '📞';
      if (reason) {
        msg = reason;
        icon = '📵';
      } else if (durSec > 0) {
        msg = (wasVideo ? '视频通话结束' : '通话结束') + ' · 时长 ' + fmtCallDur(durSec);
        icon = wasVideo ? '🎬' : '📞';
      } else if (prevState === 'calling') {
        msg = '已取消呼叫';
        icon = '📵';
      } else if (prevState === 'ringing') {
        msg = '已拒绝来电';
        icon = '📵';
      } else if (prevState === 'connecting') {
        msg = '未能接通，请稍后再试';
        icon = '📵';
      } else {
        msg = '通话已结束';
        icon = '📵';
      }
      showCallSummary(msg, icon);
    }
  }

  async function sendSignal(obj) {
    if (!cloudOn() || !couple) return;
    try {
      await C.saveMsg({
        id: newMsgId(), sender: me.u, kind: 'signal',
        text: JSON.stringify(obj), url: '', name: '', size: 0, ts: Date.now(),
      }, couple.code);
    } catch { /* 信令失败由通话超时兜底 */ }
  }

  /* 通话期间的信令必须"秒到"：原来靠 20 秒轮询，握手和 ICE 候选全被拖死，
     表现为一直"接通中"然后报网络不行。这里单独开 700ms 的快速通道。 */
  let fastSigTimer = null;
  function startFastSignals() {
    if (fastSigTimer || !cloudOn()) return;
    fastSigTimer = setInterval(async () => {
      if (!couple || !me) return;
      if (callState === 'idle') { stopFastSignals(); return; }
      if (document.hidden) return;
      try { handleSignals(await C.fetchSignals(couple.code, 200)); } catch { /* 下一轮再试 */ }
    }, 700);
  }
  function stopFastSignals() {
    if (fastSigTimer) { clearInterval(fastSigTimer); fastSigTimer = null; }
  }

  function setupPc() {
    pc = new RTCPeerConnection(ICE);
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    pc.ontrack = (e) => { attachRemote(e.streams[0]); };
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal({ t: 'ice', c: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'connected') {
        if (callTimeoutId) { clearTimeout(callTimeoutId); callTimeoutId = null; }
        setCallState('active');
        startCallClock();
      } else if (pc.connectionState === 'failed') {
        $('callStatus').textContent = '连接失败（网络受限）';
        setTimeout(() => { sendSignal({ t: 'hangup' }); endCall('连接失败：双方网络无法直连，建议连同一个 Wi-Fi 再试'); }, 1200);
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (!pc || callState !== 'connecting') return;
      const s = pc.iceConnectionState;
      if (s === 'checking') $('callStatus').textContent = '正在打通网络…';
      else if (s === 'disconnected') $('callStatus').textContent = '网络不稳定，正在重连…';
    };
  }

  function watchConnectTimeout() {
    if (callTimeoutId) clearTimeout(callTimeoutId);
    callTimeoutId = setTimeout(() => {
      if (callState === 'connecting') {
        $('callStatus').textContent = '连接失败（网络受限）';
        sendSignal({ t: 'hangup' });
        setTimeout(() => endCall('未能接通：双方网络无法直连，建议连同一个 Wi-Fi 再试'), 1500);
      }
    }, 30000);
  }

  async function startCall(video) {
    if (!cloudOn()) return alert('通话需要双方都在云端同步模式。');
    if (!chatReady) return alert('通话还没有在云端启用：请先运行 lm_messages 建表 SQL。');
    if (!partner()) return alert('等TA加入这个空间后，就可以通话了。');
    if (callState !== 'idle') return;
    const constraints = video
      ? {
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      }
      : { audio: { echoCancellation: true, noiseSuppression: true }, video: false };
    try {
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      return alert(video
        ? '无法使用摄像头或麦克风：请允许摄像头和麦克风权限后重试。'
        : '无法使用麦克风：请允许浏览器的麦克风权限后重试。');
    }
    callIsVideo = !!video;
    attachLocal(localStream);
    setupPc();
    startFastSignals();
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal({ t: 'offer', sdp: pc.localDescription.toJSON(), video: !!video });
      setCallState('calling');
      callTimeoutId = setTimeout(() => {
        if (callState === 'calling') { sendSignal({ t: 'hangup' }); endCall('对方未接听'); }
      }, 45000);
    } catch {
      sendSignal({ t: 'hangup' });
      endCall('呼叫失败，请检查麦克风/摄像头权限');
    }
  }

  function onOffer(d) {
    if (callState !== 'idle') { sendSignal({ t: 'busy' }); return; }
    incomingOffer = { sdp: d.sdp, video: !!d.video };
    callIsVideo = !!d.video;
    setCallState('ringing');
    startFastSignals();
    callTimeoutId = setTimeout(() => {
      if (callState === 'ringing') { sendSignal({ t: 'hangup' }); endCall('来电超时未接听'); }
    }, 35000);
  }

  async function acceptCall() {
    if (callState !== 'ringing' || !incomingOffer) return;
    const video = !!incomingOffer.video;
    const constraints = video
      ? {
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      }
      : { audio: { echoCancellation: true, noiseSuppression: true }, video: false };
    try {
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      alert(video ? '无法使用摄像头或麦克风：请允许权限。' : '无法使用麦克风：请允许麦克风权限。');
      sendSignal({ t: 'hangup' });
      endCall();
      return;
    }
    callIsVideo = video;
    attachLocal(localStream);
    if (callTimeoutId) { clearTimeout(callTimeoutId); callTimeoutId = null; }
    setupPc();
    startFastSignals();
    try {
      await pc.setRemoteDescription(incomingOffer.sdp);
      for (const c of pendingIce) { try { await pc.addIceCandidate(c); } catch { /* 跳过 */ } }
      pendingIce = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal({ t: 'answer', sdp: pc.localDescription.toJSON() });
      setCallState('connecting');
      watchConnectTimeout();
    } catch {
      sendSignal({ t: 'hangup' });
      endCall();
      alert('接听失败，请重试。');
    }
  }

  async function onAnswer(d) {
    if (!pc || callState !== 'calling') return;
    try {
      await pc.setRemoteDescription(d.sdp);
      for (const c of pendingIce) { try { await pc.addIceCandidate(c); } catch { /* 跳过 */ } }
      pendingIce = [];
      if (callTimeoutId) { clearTimeout(callTimeoutId); callTimeoutId = null; }
      setCallState('connecting');
      watchConnectTimeout();
    } catch {
      sendSignal({ t: 'hangup' });
      endCall();
    }
  }

  async function onIce(d) {
    if (!pc || !d || !d.c) return;
    if (pc.remoteDescription) { try { await pc.addIceCandidate(d.c); } catch { /* 跳过 */ } }
    else pendingIce.push(d.c);
  }

  function handleSignals(rows) {
    if (!me) return;
    for (const s of rows) {
      if (!s || !s.id || seenSignals.has(s.id)) continue;
      seenSignals.add(s.id);
      if (s.sender === me.u) continue;
      if (Math.abs(Date.now() - s.ts) > 120000) continue;
      let d = null;
      try { d = JSON.parse(s.text || '{}'); } catch { continue; }
      if (!d || !d.t) continue;
      if (d.t === 'offer') onOffer(d);
      else if (d.t === 'answer') onAnswer(d);
      else if (d.t === 'ice') onIce(d);
      else if (d.t === 'hangup') {
        if (callState !== 'idle') {
          if (callState === 'calling') endCall('对方已取消呼叫');
          else if (callState === 'ringing') endCall('对方已挂断');
          else endCall();
        }
      }
      else if (d.t === 'busy' && callState === 'calling') {
        $('callStatus').textContent = '对方正在通话中';
        setTimeout(() => endCall('对方正在通话中'), 1500);
      }
    }
  }

  $('callHang').addEventListener('click', () => {
    if (callState === 'idle') return;
    sendSignal({ t: 'hangup' });
    endCall();
  });
  $('callAccept').addEventListener('click', acceptCall);
  $('callMute').addEventListener('click', () => {
    muted = !muted;
    if (localStream) localStream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    $('callMute').textContent = muted ? '取消静音' : '静音';
  });

  /* 点击视频画面切换大窗 / 小窗 */
  function toggleCallView(e) {
    if (!callIsVideo || callState === 'idle') return;
    if (e) e.stopPropagation();
    $('callCard').classList.toggle('swapped');
  }
  $('callRemote').addEventListener('click', toggleCallView);
  $('callLocal').addEventListener('click', toggleCallView);
  window.addEventListener('beforeunload', () => {
    if (callState !== 'idle') sendSignal({ t: 'hangup' });
  });

  function emptyState(title, sub) {
    return `<div class="empty-state"><span class="es-icon">✦</span><h3>${title}</h3><p>${sub}</p></div>`;
  }

  /* ---------------- 主区域点击代理 ---------------- */
  $('appMain').addEventListener('click', async (e) => {
    /* 今日页顶部 banner：点击跳到对应 tab */
    const go = e.target.closest('[data-go]');
    if (go) { switchAppTab(go.dataset.go); return; }

    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'write') { openEditor(null); return; }
    if (act === 'view') {
      const e0 = entries().find((x) => x.id === t.dataset.id);
      if (e0) openViewer(e0.photos[+t.dataset.i]);
      return;
    }
    if (act === 'albumAdd') { addAlbumPhotos(); return; }
    if (act === 'albumView') { openViewer(t.dataset.url); return; }
    if (act === 'albumDel') { delAlbumPhoto(t.dataset.id); return; }
    if (act === 'edit') {
      const e0 = entries().find((x) => x.id === t.dataset.id);
      if (e0) openEditor(e0);
      return;
    }
    if (act === 'del') {
      if (!confirm('删除这篇记录？')) return;
      const list = entries().filter((x) => x.id !== t.dataset.id);
      saveEntries(couple.code, list);
      renderMain();
      if (cloudOn()) {
        try { await C.deleteEntry(t.dataset.id); syncState('云端已同步'); } catch { syncState('同步失败'); }
      }
    }
  });

  /* ---------------- 照片查看器 ---------------- */
  const viewer = $('viewer');
  function openViewer(src) {
    $('viewerImg').src = src;
    viewer.hidden = false;
  }
  $('viewerClose').addEventListener('click', () => { viewer.hidden = true; });
  viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.hidden = true; });

  /* ---------------- 日记编辑器 ---------------- */
  function openEditor(entry) {
    if (!couple) return;
    // 传入 entry 才是编辑；否则始终新建一篇（同一天可以写多篇）
    editingId = entry ? entry.id : null;
    editorPhotos = entry ? (entry.photos || []).slice() : [];
    moodSel = (entry && entry.mood) || '晴朗';
    $('editorTitle').textContent = entry ? '修改记录' : '记录今天';
    $('editorTitleInput').value = entry ? entry.title || '' : '';
    $('editorText').value = entry ? entry.text || '' : '';
    $('editorDate').textContent = entry ? entry.date.replace(/-/g, ' . ') : todayKey().replace(/-/g, ' . ');
    renderMoods();
    renderThumbs();
    $('editorModal').hidden = false;
  }
  function closeEditor() { $('editorModal').hidden = true; }
  $('editorClose').addEventListener('click', closeEditor);
  $('editorModal').addEventListener('click', (e) => { if (e.target === $('editorModal')) closeEditor(); });

  function renderMoods() {
    $('editorMoods').innerHTML = MOODS.map((m) =>
      `<button type="button" class="mood-chip${m === moodSel ? ' on' : ''}" data-m="${m}">${m}</button>`).join('');
  }
  $('editorMoods').addEventListener('click', (e) => {
    const b = e.target.closest('.mood-chip');
    if (!b) return;
    moodSel = b.dataset.m;
    renderMoods();
  });

  function renderThumbs() {
    $('editorThumbs').innerHTML = editorPhotos.map((p, i) =>
      `<div class="ed-thumb"><img src="${p}" alt=""><button type="button" class="ed-del" data-i="${i}">×</button></div>`).join('');
  }
  $('editorThumbs').addEventListener('click', (e) => {
    const b = e.target.closest('.ed-del');
    if (!b) return;
    editorPhotos.splice(+b.dataset.i, 1);
    renderThumbs();
  });
  $('editorFile').addEventListener('change', async (e) => {
    const picked = [...e.target.files];
    const room = Math.max(0, 9 - editorPhotos.length);
    if (picked.length > room) {
      alert(`一篇日记最多 9 张照片，这次先加入前 ${room} 张。`);
    }
    const files = picked.filter((f) => String(f.type || '').startsWith('image/')).slice(0, room);
    if (picked.length && !files.length) alert('只能添加图片文件。');
    for (const f of files) {
      if (f.size > 20 * 1048576) { alert(`「${f.name}」超过 20MB，已跳过。`); continue; }
      try { editorPhotos.push(await compressImage(f)); } catch { /* 跳过坏图 */ }
    }
    e.target.value = '';
    renderThumbs();
  });

  $('editorSave').addEventListener('click', async () => {
    const title = $('editorTitleInput').value.trim();
    const text = $('editorText').value.trim();
    if (!title && !text && !editorPhotos.length) { $('editorText').focus(); return; }

    const saveBtn = $('editorSave');
    saveBtn.disabled = true;
    saveBtn.textContent = cloudOn() ? '上传中…' : '保存中…';

    try {
      let photos = editorPhotos;
      if (cloudOn()) {
        // 云端模式：把 dataURL 照片上传到文件服务，换成 URL
        photos = [];
        for (let i = 0; i < editorPhotos.length; i++) {
          const p = editorPhotos[i];
          if (p.startsWith('data:')) {
            photos.push(await C.uploadPhoto(p, `photo-${me.u}-${Date.now()}-${i}.jpg`));
          } else {
            photos.push(p);
          }
        }
      }

      const list = entries();
      let saved;
      if (editingId) {
        saved = list.find((x) => x.id === editingId);
        if (saved) {
          saved.title = title; saved.text = text; saved.mood = moodSel;
          saved.photos = photos; saved.edited = Date.now();
        }
      } else {
        saved = {
          id: newEntryId(),
          author: me.u,
          date: todayKey(),
          mood: moodSel,
          title, text, photos,
          ts: Date.now(),
        };
        list.push(saved);
      }
      if (!saved) return;

      if (cloudOn()) {
        await C.saveEntry(saved, couple.code);
        saveEntries(couple.code, list);
        syncState('云端已同步');
      } else {
        try { saveEntries(couple.code, list); }
        catch {
          alert('浏览器存储空间不够了，照片太多。可以在「我们」里导出备份后清理。');
          return;
        }
      }
      closeEditor();
      renderMain();
    } catch {
      alert(cloudOn() ? '上传失败，请检查网络后重试' : '保存失败');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '保 存';
    }
  });

  /* ---------------- 演示数据（?demo=1，仅本地模式） ---------------- */
  function makePhoto(variant) {
    const w = 900, h = 620;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const palettes = [
      { sky: ['#16224a', '#e8845e'], sun: '#ffd9a8', land: '#0a0f22' },
      { sky: ['#0b1e33', '#2e6f77'], sun: '#bfe8e2', land: '#081120' },
      { sky: ['#1d1433', '#7a5a9e'], sun: '#e8c97a', land: '#0d0918' },
    ];
    const p = palettes[variant % 3];
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, p.sky[0]); g.addColorStop(1, p.sky[1]);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      x.globalAlpha = 0.15 + Math.random() * 0.5;
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.arc(Math.random() * w, Math.random() * h * 0.55, 0.6 + Math.random() * 1.4, 0, 6.2832);
      x.fill();
    }
    x.globalAlpha = 1;
    const sx = w * (0.3 + variant * 0.18), sy = h * 0.42;
    const glow = x.createRadialGradient(sx, sy, 0, sx, sy, 190);
    glow.addColorStop(0, p.sun + 'cc'); glow.addColorStop(1, p.sun + '00');
    x.fillStyle = glow; x.fillRect(0, 0, w, h);
    x.fillStyle = p.sun;
    x.beginPath(); x.arc(sx, sy, 34, 0, 6.2832); x.fill();
    x.fillStyle = p.land;
    x.beginPath();
    x.moveTo(0, h);
    for (let i = 0; i <= 12; i++) x.lineTo((w / 12) * i, h * 0.72 + Math.sin(i * 1.7 + variant) * 46);
    x.lineTo(w, h); x.closePath(); x.fill();
    return c.toDataURL('image/jpeg', 0.8);
  }

  function seedDemo() {
    if (loadUsers().demoA) { store.write(LS.session, 'demoA'); enterApp(); return; }
    let p1 = null, p2 = null, p3 = null;
    try { p1 = makePhoto(0); p2 = makePhoto(1); p3 = makePhoto(2); } catch { /* 忽略 */ }
    const users = loadUsers();
    const couples = loadCouples();
    const code = 'LOVE66';
    const mk = (u, nick, sign, motto) => ({ u, nick, pw: hash('123456'), sign, bday: '', couple: code, createdAt: Date.now(), avatar: '', deco: motto ? { motto } : {} });
    users.demoA = mk('demoA', '小满', '双子座', '愿每次抬头，都能看见你');
    users.demoB = mk('demoB', '阿澈', '天蝎座', '星光落在眼里，你落在我心里');
    couples[code] = { code, created: Date.now() - 1180 * 86400000, since: '2023-08-14', members: ['demoA', 'demoB'] };
    const d = (offset) => { const x = new Date(); x.setDate(x.getDate() - offset); return todayKey(x); };
    const T = Date.now();
    const list = [
      { id: 'ed1', author: 'demoB', date: d(0), mood: '想念', title: '加班的夜里', text: '下楼的时候看到月亮很圆，拍下来想给你看。\n明天周末，终于可以睡到自然醒了。', photos: p3 ? [p3] : [], ts: T - 3600000 },
      { id: 'ed2', author: 'demoA', date: d(0), mood: '开心', title: '', text: '今天路过花店，洋桔梗开了。\n买了一束放在窗边，像你喜欢的那样。', photos: [], ts: T - 7200000 },
      { id: 'ed3', author: 'demoA', date: d(1), mood: '微风', title: '江边散步', text: '风很大，风筝差点挂到树上。笑得肚子疼。', photos: p1 ? [p1] : [], ts: T - 90000000 },
      { id: 'ed4', author: 'demoB', date: d(1), mood: '平静', title: '', text: '晚上一起看了半场电影，另一半留着明天看。\n这种「留着」的感觉也很好。', photos: [], ts: T - 93600000 },
      { id: 'ed5', author: 'demoA', date: d(3), mood: '多云', title: '海边', text: '海水比想象中凉。你把外套披在我肩上的时候，风正好停了。', photos: p2 ? [p2] : [], ts: T - 270000000 },
    ];
    saveUsers(users);
    saveCouples(couples);
    saveEntries(code, list);
    store.write(LS.session, 'demoA');
    enterApp();
  }

  /* ---------------- 启动 ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    if (cloudOn()) cloudInit();
    // PWA：注册 Service Worker，支持「添加到主屏幕」
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      const hadSW = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').catch(() => { /* 离线能力不可用时静默 */ });
      // 新版本接管后自动刷新一次，避免旧缓存继续跑旧代码
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadSW && !sessionStorage.getItem('ot_sw_reloaded')) {
          sessionStorage.setItem('ot_sw_reloaded', '1');
          location.reload();
        }
      });
    }
    const params = new URLSearchParams(location.search);
    const shareCode = params.get('share');
    if (shareCode) { openSharePage(shareCode); return; }
    if (params.get('demo') === '1' && !cloudOn()) {
      seedDemo();
      const tab = params.get('tab');
      if (tab && couple) switchAppTab(tab);
      if (params.get('editor') === '1' && couple) openEditor(null);
    } else if (params.get('auth') === '1') {
      setTimeout(openAuth, 100);
    }
  });
})();
