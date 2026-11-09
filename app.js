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

  const $ = (id) => document.getElementById(id);
  const LS = {
    users: 'ot_users',
    couples: 'ot_couples',
    session: 'ot_session',
    token: 'ot_couple_token',
    entries: (code) => 'ot_entries_' + code,
    msgs: (code) => 'ot_msgs_' + code,
    chatSeen: (code) => 'ot_chatseen_' + code,
  };
  const MOODS = ['晴朗', '微风', '多云', '小雨', '开心', '想念', '平静', '激动', '疲惫', '治愈'];

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
  function compressImage(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1280;
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
    // ---- 私信：文字 / 图片 / 文件；通话信令也存在这张表里（kind = signal）----
    async fetchMsgs(code) {
      const r = ck(await sb.from('lm_messages').select('*').eq('couple', code)
        .in('kind', ['text', 'image', 'file'])
        .order('ts', { ascending: false }).limit(200));
      return (r || []).map(rowToMsg).reverse();
    },
    async fetchSignals(code) {
      const r = ck(await sb.from('lm_messages').select('*').eq('couple', code)
        .eq('kind', 'signal').order('ts', { ascending: false }).limit(30));
      return (r || []).map(rowToMsg);
    },
    async saveMsg(m, code) {
      ck(await sb.from('lm_messages').insert({
        id: m.id, couple: code, couple_token: store.read(LS.token, ''),
        sender: m.sender, kind: m.kind, text: m.text || '',
        url: m.url || '', name: m.name || '', size: m.size || 0, ts: m.ts,
      }));
      return m.id;
    },
    async saveCouple(c) {
      ck(await sb.from('lm_couples').update({ since: c.since, members: c.members }).eq('code', c.code));
    },
    async destroyCouple(c) {
      ck(await sb.from('lm_couples').delete().eq('code', c.code));
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
      ck(await sb.storage.from('photos').upload(name, blob, { contentType: 'image/jpeg' }));
      const { data } = sb.storage.from('photos').getPublicUrl(name);
      return data.publicUrl;
    },
    async uploadChatFile(dataUrl, origName, contentType) {
      const blob = await (await fetch(dataUrl)).blob();
      const ext = String(origName || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin';
      const path = `chat/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
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
  }
  function closeApp() {
    appEl.hidden = true;
    document.body.classList.remove('app-open');
    stopPolling();
    stopChatPolling();
    if (callState !== 'idle') endCall();
  }
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
    $('appMe').textContent = me.nick;
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
  }
  function renderMain() {
    if (!couple) { renderPairScreen(); return; }
    const main = $('appMain');
    if (curTab === 'today') renderToday(main);
    else if (curTab === 'chat') renderChat(main);
    else if (curTab === 'diary') renderDiary(main);
    else if (curTab === 'photos') renderPhotos(main);
    else if (curTab === 'timeline') renderTimeline(main);
    else renderUs(main);
    main.scrollTop = 0;
  }

  function userMap() { return loadUsers(); }

  function entryCard(e, users) {
    const u = users[e.author];
    const mine = e.author === me.u;
    const photos = (e.photos || []);
    return `
      <article class="entry-card${mine ? ' mine' : ''}">
        <header class="ec-head">
          <span class="ec-avatar">${esc((u ? u.nick : e.author).slice(0, 1))}</span>
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

  /* ---- 今日：两个人今天的记录并排 ---- */
  function renderToday(main) {
    const users = userMap();
    const p = partner();
    const today = todayKey();
    const list = entries().filter((e) => e.date === today);
    const mineE = list.filter((e) => e.author === me.u).sort((a, b) => b.ts - a.ts)[0];
    const partnerE = p ? list.filter((e) => e.author === p.u).sort((a, b) => b.ts - a.ts)[0] : null;

    const col = (user, entry, isMe) => `
      <section class="today-col${isMe ? ' me' : ''}">
        <div class="today-col-head">
          <span class="ec-avatar">${esc((user ? user.nick : '?').slice(0, 1))}</span>
          <span class="today-col-name">${esc(user ? user.nick : '等待TA加入')}</span>
          ${user && user.sign ? `<span class="today-col-sign">${esc(user.sign)}</span>` : ''}
        </div>
        ${entry
          ? entryCard(entry, users)
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
      ${!p ? `<div class="waiting-bar">空间配对码 <b>${couple.code}</b> · 等TA用这个码注册加入，就能一起看记录</div>` : ''}
      <div class="today-grid">
        ${col(me, mineE, true)}
        ${col(p, partnerE, false)}
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

  /* ---- 照片：所有照片汇总 ---- */
  function renderPhotos(main) {
    const users = userMap();
    const list = entries().slice().sort((a, b) => b.ts - a.ts);
    const cells = [];
    for (const e of list) {
      (e.photos || []).forEach((src, i) => {
        const u = users[e.author];
        cells.push(`
          <figure class="photo-cell">
            <img src="${src}" data-act="view" data-id="${e.id}" data-i="${i}" loading="lazy" alt="">
            <figcaption><span>${esc(u ? u.nick : e.author)}</span><span>${e.date.slice(5).replace('-', '.')}</span></figcaption>
          </figure>`);
      });
    }
    main.innerHTML = cells.length
      ? `<div class="photos-grid">${cells.join('')}</div>`
      : emptyState('还没有照片', '写日记时附上照片，这里会汇集成册。');
  }

  /* ---- 足迹：时间线 ---- */
  function renderTimeline(main) {
    const users = userMap();
    const list = entries().slice().sort((a, b) => b.ts - a.ts);
    if (!list.length) {
      main.innerHTML = emptyState('足迹还是空白', '每一次记录都会成为时间线上的一束光。');
      return;
    }
    main.innerHTML = `<div class="tl">${list.map((e) => {
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
      <div class="profile-card">
        <div class="pc-avatar">${esc(u.nick.slice(0, 1))}</div>
        <div class="pc-name">${esc(u.nick)}${isMe ? ' <span class="pc-me">我</span>' : ''}</div>
        <div class="pc-meta">
          <span>${esc(u.sign || '—')}</span>
          ${u.bday ? `<span>生日 ${esc(u.bday.slice(5).replace('-', '.'))}</span>` : ''}
        </div>
      </div>`;

    const noteText = cloudOn()
      ? '数据保存在云端（Supabase），两人各自的设备实时同步。仍建议定期「导出我们的数据」做备份。'
      : '所有数据只保存在这台设备的浏览器里。换电脑或清除浏览器数据前，请先「导出我们的数据」备份。';

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

      <div class="us-actions">
        <button type="button" class="btn-ghost" id="usExport">导出我们的数据</button>
        <button type="button" class="btn-ghost danger" id="usUnpair">解除配对</button>
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
    $('usExport').addEventListener('click', () => {
      const data = {
        exportedAt: new Date().toISOString(),
        couple,
        members: couple.members.map((m) => {
          const { pw, _id, ...rest } = users[m] || { u: m };
          return rest;
        }),
        entries: list,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `our-space-${couple.code}-${todayKey()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
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

  /* ---------------- 私信 ---------------- */
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
      if (m.kind === 'image' && url) {
        body = `<a class="chat-img" href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" loading="lazy" alt=""></a>`;
      } else if (m.kind === 'file' && url) {
        body = `<a class="chat-file" href="${esc(url)}" target="_blank" rel="noopener" download="${esc(m.name || 'file')}">
          <span class="cf-ic">▤</span>
          <span class="cf-name">${esc(m.name || '文件')}</span>
          <span class="cf-size">${fmtSize(m.size)}</span>
        </a>`;
      } else {
        body = `<div class="chat-text">${esc(m.text).replace(/\n/g, '<br>')}</div>`;
      }
      return `
        <div class="chat-row${mine ? ' mine' : ''}">
          <span class="chat-ava">${esc(nick.slice(0, 1))}</span>
          <div class="chat-bubble">${body}<span class="chat-time">${fmtTs(m.ts)}</span></div>
        </div>`;
    }).join('');
  }

  function renderChat(main) {
    const p = partner();
    const list = loadMsgs(couple.code);
    main.innerHTML = `
      <div class="chat-wrap">
        <div class="chat-head">
          <div class="chat-title">私信<span class="chat-sub">${p ? '仅你们两人可见 · ' + esc(p.nick) : '等TA加入后就能私信和通话'}</span></div>
          <div class="chat-calls">
            <button type="button" class="btn-primary chat-call" id="chatCall"${p && cloudOn() ? '' : ' disabled'}>☎ 语音</button>
            <button type="button" class="btn-primary chat-call" id="chatVideoCall"${p && cloudOn() ? '' : ' disabled'}>▷ 视频</button>
          </div>
        </div>
        ${!chatReady ? '<div class="waiting-bar">私信还没有在云端启用：请先在 Supabase 运行 说明.md 里的 lm_messages 建表 SQL。</div>' : ''}
        <div class="chat-list" id="chatList">${chatBubbles(list)}</div>
        <form class="chat-bar" id="chatForm">
          <label class="chat-tool" title="发送图片">▣<input type="file" id="chatImg" accept="image/*" hidden /></label>
          <label class="chat-tool" title="发送文件">▤<input type="file" id="chatFile" hidden /></label>
          <input class="chat-input" id="chatInput" maxlength="500" placeholder="说点什么…" autocomplete="off" />
          <button type="submit" class="chat-send">发送</button>
        </form>
      </div>`;
    const input = $('chatInput');
    input.value = chatDraft;
    input.addEventListener('input', (e) => { chatDraft = e.target.value; });
    $('chatForm').addEventListener('submit', (e) => { e.preventDefault(); sendText(); });
    $('chatImg').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; sendImage(f); });
    $('chatFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; sendFile(f); });
    $('chatCall').addEventListener('click', () => startCall(false));
    $('chatVideoCall').addEventListener('click', () => startCall(true));
    const listEl = $('chatList');
    listEl.scrollTop = listEl.scrollHeight;
    markChatSeen();
    refreshUnread();
  }

  function updateChatList() {
    if (!couple) return;
    const el = $('chatList');
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    el.innerHTML = chatBubbles(loadMsgs(couple.code));
    if (nearBottom) el.scrollTop = el.scrollHeight;
    markChatSeen();
  }

  function chatSendError(e) {
    if (isChatTableMissing(e)) {
      chatReady = false;
      alert('私信还没有在云端启用：请先在 Supabase 运行 说明.md 里的建表 SQL。');
    } else {
      alert('发送失败，请检查网络后重试。');
    }
  }

  async function storeMsg(m) {
    if (cloudOn()) {
      if (!chatReady) throw new Error('lm_messages: does not exist');
      await C.saveMsg(m, couple.code);
    }
    const list = loadMsgs(couple.code);
    list.push(m);
    saveMsgs(couple.code, list);
    updateChatList();
  }

  async function sendText() {
    if (chatBusy || !couple) return;
    const input = $('chatInput');
    const txt = (input ? input.value : chatDraft).trim();
    if (!txt) return;
    if (input) input.value = '';
    chatDraft = '';
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
    if (cloudOn() && file.size > 15 * 1048576) { alert('文件不能超过 15MB。'); return; }
    if (!cloudOn() && file.size > 2 * 1048576) { alert('本地模式下文件需小于 2MB。'); return; }
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

  /* ---------------- 语音通话（WebRTC，信令走 lm_messages） ---------------- */
  const ICE = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
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

  function attachRemote(stream) {
    if (!stream) return;
    remoteStream = stream;
    if (stream.getVideoTracks().length > 0) {
      const v = $('callRemote');
      v.srcObject = stream;
      v.style.display = 'block';
      v.play().catch(() => { /* 需要用户点一下页面才有画面 */ });
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

  function endCall() {
    if (callTimeoutId) { clearTimeout(callTimeoutId); callTimeoutId = null; }
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
    remoteStream = null;
    callIsVideo = false;
    pendingIce = [];
    incomingOffer = null;
    muted = false;
    callState = 'idle';
    callOverlay.hidden = true;
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
        setTimeout(() => { sendSignal({ t: 'hangup' }); endCall(); }, 1500);
      }
    };
  }

  function watchConnectTimeout() {
    if (callTimeoutId) clearTimeout(callTimeoutId);
    callTimeoutId = setTimeout(() => {
      if (callState === 'connecting') {
        $('callStatus').textContent = '连接失败（网络受限）';
        sendSignal({ t: 'hangup' });
        setTimeout(endCall, 1500);
      }
    }, 20000);
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
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal({ t: 'offer', sdp: pc.localDescription.toJSON(), video: !!video });
      setCallState('calling');
      callTimeoutId = setTimeout(() => {
        if (callState === 'calling') { sendSignal({ t: 'hangup' }); endCall(); alert('对方没有接听。'); }
      }, 45000);
    } catch {
      sendSignal({ t: 'hangup' });
      endCall();
      alert('呼叫失败，请重试。');
    }
  }

  function onOffer(d) {
    if (callState !== 'idle') { sendSignal({ t: 'busy' }); return; }
    incomingOffer = { sdp: d.sdp, video: !!d.video };
    callIsVideo = !!d.video;
    setCallState('ringing');
    callTimeoutId = setTimeout(() => {
      if (callState === 'ringing') { sendSignal({ t: 'hangup' }); endCall(); }
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
      else if (d.t === 'hangup') { if (callState !== 'idle') endCall(); }
      else if (d.t === 'busy' && callState === 'calling') {
        $('callStatus').textContent = '对方正在通话中';
        setTimeout(endCall, 1500);
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
  window.addEventListener('beforeunload', () => {
    if (callState !== 'idle') sendSignal({ t: 'hangup' });
  });

  function emptyState(title, sub) {
    return `<div class="empty-state"><span class="es-icon">✦</span><h3>${title}</h3><p>${sub}</p></div>`;
  }

  /* ---------------- 主区域点击代理 ---------------- */
  $('appMain').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'write') { openEditor(null); return; }
    if (act === 'view') {
      const e0 = entries().find((x) => x.id === t.dataset.id);
      if (e0) openViewer(e0.photos[+t.dataset.i]);
      return;
    }
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
    if (!entry) {
      const today = todayKey();
      entry = entries().find((e) => e.date === today && e.author === me.u) || null;
    }
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
    const files = [...e.target.files].slice(0, Math.max(0, 9 - editorPhotos.length));
    for (const f of files) {
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
    const mk = (u, nick, sign) => ({ u, nick, pw: hash('123456'), sign, bday: '', couple: code, createdAt: Date.now() });
    users.demoA = mk('demoA', '小满', '双子座');
    users.demoB = mk('demoB', '阿澈', '天蝎座');
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
    const params = new URLSearchParams(location.search);
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
