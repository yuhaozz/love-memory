/* ============================================================
   银河之约 · 情侣纪念空间
   ------------------------------------------------------------
   首页是面向所有访客的品牌与功能演示页。
   下方 CONFIG 全部为「演示数据」，仅用于展示功能效果，
   与任何真实用户无关；登录后的私密内容由 app.js 驱动。
   ============================================================ */

const CONFIG = {
  // 星图演示：把两个人的星座连成一幅图（示例星座）
  // 可选：Orion / Lyra / Cassiopeia / Leo / Scorpius / Cygnus / UrsaMajor / Taurus
  signA: 'Lyra',
  signB: 'Orion',

  // 纪念日演示：系统自动倒数 / 正数（示例条目）
  anniversaries: [
    { title: '初见', date: new Date(2023, 6, 20, 0, 0, 0), type: 'countup' },
    { title: '确定关系', date: new Date(2023, 7, 14, 20, 0, 0), type: 'countup' },
    { title: '一周年', date: new Date(2024, 7, 14, 0, 0, 0), type: 'countup' },
    { title: '下一个周年', date: new Date(2026, 7, 14, 0, 0, 0), type: 'countdown' },
    { title: 'TA 的生日', date: new Date(2026, 2, 18, 0, 0, 0), type: 'countdown' },
    { title: '第一次旅行', date: new Date(2023, 9, 1, 0, 0, 0), type: 'countup' },
  ],

  // 照片墙演示（高质量示例图，可换成自己的照片）
  photos: [
    { src: 'images/g1.jpg', caption: '初见那天的星空' },
    { src: 'images/g2.jpg', caption: '一起看过的日落' },
    { src: 'images/g3.jpg', caption: '城市的灯火' },
    { src: 'images/g4.jpg', caption: '海边的午后' },
    { src: 'images/g5.jpg', caption: '山间的清晨' },
    { src: 'images/g6.jpg', caption: '冬夜的暖光' },
  ],
};

/* ============================================================
   星座数据（归一化 0–100 坐标）
   ============================================================ */
const CONSTELLATIONS = {
  Orion: {
    cn: '猎户座', title: '猎户座 · ORION', raH: 5.6, dec: -5.4,
    stars: [
      { x: 26, y: 16, r: 2.4, n: 'Betelgeuse' }, { x: 74, y: 20, r: 1.9, n: 'Bellatrix' },
      { x: 40, y: 50, r: 1.7 }, { x: 53, y: 52, r: 1.7 }, { x: 66, y: 54, r: 1.7 },
      { x: 32, y: 84, r: 1.7 }, { x: 76, y: 82, r: 2.2, n: 'Rigel' },
      { x: 56, y: 67, r: 1.1 },
    ],
    lines: [[0, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6], [5, 6], [3, 7]],
  },
  Lyra: {
    cn: '天琴座', title: '天琴座 · LYRA', raH: 18.62, dec: 38.8,
    stars: [
      { x: 62, y: 10, r: 2.8, n: 'Vega' }, { x: 36, y: 34, r: 1.3 },
      { x: 48, y: 48, r: 1.3 }, { x: 62, y: 44, r: 1.5 }, { x: 82, y: 38, r: 1.4 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [0, 3]],
  },
  Cassiopeia: {
    cn: '仙后座', title: '仙后座 · CASSIOPEIA', raH: 1.0, dec: 62.5,
    stars: [
      { x: 12, y: 34, r: 1.7 }, { x: 30, y: 22, r: 1.9 }, { x: 50, y: 44, r: 1.8 },
      { x: 70, y: 24, r: 2.0 }, { x: 88, y: 38, r: 1.7 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  Leo: {
    cn: '狮子座', title: '狮子座 · LEO', raH: 10.5, dec: 15.0,
    stars: [
      { x: 16, y: 46, r: 2.1, n: 'Regulus' }, { x: 20, y: 30, r: 1.4 },
      { x: 32, y: 22, r: 1.3 }, { x: 46, y: 24, r: 1.3 }, { x: 56, y: 38, r: 1.4 },
      { x: 46, y: 46, r: 1.2 }, { x: 80, y: 32, r: 1.2 }, { x: 66, y: 60, r: 1.3 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [4, 6], [6, 7], [7, 5]],
  },
  Scorpius: {
    cn: '天蝎座', title: '天蝎座 · SCORPIUS', raH: 16.5, dec: -28.0,
    stars: [
      { x: 14, y: 26, r: 1.2 }, { x: 22, y: 36, r: 1.3 }, { x: 34, y: 48, r: 2.0, n: 'Antares' },
      { x: 46, y: 56, r: 1.3 }, { x: 58, y: 66, r: 1.3 }, { x: 70, y: 78, r: 1.2 },
      { x: 84, y: 72, r: 1.4 }, { x: 56, y: 76, r: 1.1 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [4, 7]],
  },
  Cygnus: {
    cn: '天鹅座', title: '天鹅座 · CYGNUS', raH: 20.5, dec: 42.0,
    stars: [
      { x: 60, y: 8, r: 2.3, n: 'Deneb' }, { x: 58, y: 40, r: 1.6 }, { x: 52, y: 78, r: 1.5 },
      { x: 18, y: 48, r: 1.4 }, { x: 94, y: 32, r: 1.4 },
    ],
    lines: [[0, 1], [1, 2], [3, 1], [1, 4]],
  },
  UrsaMajor: {
    cn: '大熊座', title: '大熊座 · URSA MAJOR', raH: 11.0, dec: 50.0,
    stars: [
      { x: 10, y: 46, r: 1.6 }, { x: 24, y: 36, r: 1.7 }, { x: 38, y: 40, r: 1.5 },
      { x: 48, y: 54, r: 1.8 }, { x: 60, y: 62, r: 1.8 }, { x: 72, y: 52, r: 1.7 },
      { x: 76, y: 38, r: 1.7 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  Taurus: {
    cn: '金牛座', title: '金牛座 · TAURUS', raH: 4.5, dec: 17.0,
    stars: [
      { x: 12, y: 62, r: 1.5 }, { x: 30, y: 52, r: 1.3 }, { x: 48, y: 60, r: 1.4 },
      { x: 60, y: 48, r: 2.1, n: 'Aldebaran' }, { x: 36, y: 78, r: 1.1 },
    ],
    lines: [[0, 1], [1, 2], [1, 4], [2, 3]],
  },
};

/* ============================================================
   工具
   ============================================================ */
const $ = (id) => document.getElementById(id);
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let earthReady = false;

function pad(n, len) { return String(Math.floor(n)).padStart(len, '0'); }

/* ============================================================
   启动
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  $('footerYear').textContent = new Date().getFullYear();

  renderSkyConstellations();
  initStarfield();
  initEarth();          // 同步生成行星贴图
  initLocalClock();
  initStarChart();
  initAnniversaries();
  initGallery();
  initMessages();
  initFeedback();
  initCursorGlow();
  initScrollParallax();
  initNav();
  initScrollReveal();
  initUserStars();

  const DEV = new URLSearchParams(location.search).has('dev');
  if (DEV) {
    $('loader').classList.add('hide');
  } else {
    setTimeout(() => $('loader').classList.add('hide'), 1550);
  }
});

/* ============================================================
   1. 星空背景
   ============================================================ */
function initStarfield() {
  const canvas = $('starfield');
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  let stars = [];
  let scrollY = 0, mx = 0, my = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function build() {
    stars = [];
    // 基础星场：更密
    const count = Math.min(1350, Math.floor((w * h) / 2600));
    for (let i = 0; i < count; i++) {
      const layer = Math.random() < 0.62 ? 0 : (Math.random() < 0.7 ? 1 : 2);
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: layer === 2 ? 0.9 + Math.random() * 1.1 : 0.25 + Math.random() * 0.9,
        layer,
        tw: Math.random() * Math.PI * 2,
        twSpeed: 0.004 + Math.random() * 0.018,
        kind: Math.random(),
      });
    }
    // 银河星带：沿斜向聚集的密集微星
    const ang = -0.44;
    const dirX = Math.cos(ang), dirY = Math.sin(ang);
    const nX = -dirY, nY = dirX;
    const cX = w * 0.58, cY = h * 0.36;
    const len = Math.hypot(w, h) * 0.62;
    const bandCount = Math.min(950, Math.floor((w * h) / 1700));
    for (let i = 0; i < bandCount; i++) {
      const t = (Math.random() * 2 - 1) * len;
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * 105;
      stars.push({
        x: cX + dirX * t + nX * g,
        y: cY + dirY * t + nY * g,
        r: 0.2 + Math.random() * 0.65,
        layer: Math.random() < 0.5 ? 0 : 1,
        tw: Math.random() * Math.PI * 2,
        twSpeed: 0.003 + Math.random() * 0.01,
        kind: 0.55 + Math.random() * 0.45,
        band: true,
      });
    }
  }

  function starColor(kind) {
    if (kind > 0.82) return [255, 214, 170];
    if (kind > 0.68) return [196, 216, 255];
    return [232, 238, 247];
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const par = [0.04, 0.12, 0.26];
    const mpar = [0.0016, 0.0038, 0.0075];

    for (const s of stars) {
      const px = s.x + mx * mpar[s.layer] * 22;
      let py;
      if (s.band) {
        py = s.y - scrollY * par[s.layer];
        if (py < -24 || py > h + 24) continue;
      } else {
        py = ((s.y - scrollY * par[s.layer]) % h + h) % h;
      }
      s.tw += s.twSpeed;
      const a = s.band
        ? 0.22 + Math.sin(s.tw) * 0.18 + 0.14
        : 0.32 + Math.sin(s.tw) * 0.34 + 0.18;
      const rgb = starColor(s.kind);
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, 6.2832);
      ctx.fill();

      // 少数亮星带十字星芒
      if (s.layer === 2 && s.r > 1.55) {
        ctx.globalAlpha = a * 0.22;
        ctx.strokeStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(px - 7, py); ctx.lineTo(px + 7, py);
        ctx.moveTo(px, py - 7); ctx.lineTo(px, py + 7);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });
  window.addEventListener('mousemove', (e) => {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  resize();
  draw();
}

/* ============================================================
   2. 背景星座线稿
   ============================================================ */
function constellationMarkup(key, cx, cy, scale, color, opacity, labels) {
  const def = CONSTELLATIONS[key];
  if (!def) return '';
  const g = (n) => (n * scale).toFixed(1);
  const px = (n) => (cx + (n - 50) * scale).toFixed(1);
  const py = (n) => (cy + (n - 50) * scale).toFixed(1);
  let s = `<g opacity="${opacity}" stroke="${color}" fill="${color}" stroke-linecap="round">`;
  for (const [a, b] of def.lines) {
    const A = def.stars[a], B = def.stars[b];
    s += `<line x1="${px(A.x)}" y1="${py(A.y)}" x2="${px(B.x)}" y2="${py(B.y)}" stroke-width="0.55" opacity="0.55"/>`;
  }
  def.stars.forEach((st, i) => {
    const r = Math.max(0.7, st.r * scale * 0.28);
    s += `<circle cx="${px(st.x)}" cy="${py(st.y)}" r="${(r * 2.2).toFixed(2)}" opacity="0.12" stroke="none"/>`;
    s += `<circle cx="${px(st.x)}" cy="${py(st.y)}" r="${r.toFixed(2)}" stroke="none"/>`;
    if (labels && st.n) {
      s += `<text x="${px(st.x)}" y="${(+py(st.y) - r - 5).toFixed(1)}" font-size="${(g(3.1))}" ` +
        `fill="${color}" fill-opacity="0.42" stroke="none" text-anchor="middle" letter-spacing="0.6">${st.n.toUpperCase()}</text>`;
    }
  });
  if (labels) {
    s += `<text x="${px(50)}" y="${(cy + 61 * scale).toFixed(1)}" font-size="${g(4.1)}" ` +
      `fill="${color}" fill-opacity="0.4" stroke="none" text-anchor="middle" letter-spacing="3">${def.title}</text>`;
  }
  return s + '</g>';
}

function renderSkyConstellations() {
  const svg = $('skyConstellations');
  if (!svg) return;
  let s = '';
  s += constellationMarkup('Cassiopeia', 178, 148, 2.0, '#8fb6ff', 0.12, false);
  s += constellationMarkup('UrsaMajor', 826, 578, 1.7, '#9ab2d8', 0.08, false);
  s += constellationMarkup('Cygnus', 300, 560, 2.1, '#a9c4ff', 0.09, false);
  s += constellationMarkup('Orion', 742, 300, 2.6, '#9fc4ff', 0.08, false);
  svg.innerHTML = s;
}

/* ============================================================
   3. 地球：程序化行星渲染
   ============================================================ */

/* --- 可周期化的 value noise，保证贴图横向无缝 --- */
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 69069;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function noise2(x, y, seed, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(x0, yi, seed), b = hash2(x1, yi, seed);
  const c = hash2(x0, yi + 1, seed), d = hash2(x1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm2(x, y, seed, oct, period) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    sum += noise2(x * f, y * f, seed + i * 37, period * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

function initEarth() {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  const stage = document.createElement('div');
  stage.className = 'earth-stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'earth-canvas';
  canvas.id = 'earthCanvas';
  stage.appendChild(canvas);
  hero.appendChild(stage);

  let SIZE = 900;
  const ctx = canvas.getContext('2d');

  const TW = 1024, TH = 512;
  // 初始相位：让夜侧朝向亚洲，城市灯光更密集可见
  let rotation = 0.902, t = 0, visible = true;

  // ---------- 行星贴图 ----------
  const landCv = document.createElement('canvas');
  landCv.width = TW; landCv.height = TH;
  const landCtx = landCv.getContext('2d');

  const cloudCv = document.createElement('canvas');
  cloudCv.width = TW; cloudCv.height = TH;
  const cloudCtx = cloudCv.getContext('2d');

  const cityCv = document.createElement('canvas');
  cityCv.width = TW; cityCv.height = TH;
  const cityCtx = cityCv.getContext('2d');

  const cityLayer = document.createElement('canvas');
  cityLayer.width = SIZE; cityLayer.height = SIZE;
  const cityLayerCtx = cityLayer.getContext('2d');

  // 按真实 CSS 尺寸 × dpr 调整画布分辨率，避免 Retina 下虚化
  function syncSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = stage.getBoundingClientRect().width || 600;
    const px = Math.max(640, Math.min(1440, Math.round(cssW * dpr)));
    if (canvas.width === px) return;
    SIZE = px;
    canvas.width = px;
    canvas.height = px;
    cityLayer.width = px;
    cityLayer.height = px;
  }

  function buildSurface() {
    const BASE = 6;
    const SEA = 0.545;
    const img = landCtx.createImageData(TW, TH);
    const d = img.data;
    const cityImg = cityCtx.createImageData(TW, TH);
    const cd = cityImg.data;
    const metrosCoast = [];
    const metrosInland = [];

    for (let y = 0; y < TH; y++) {
      const v = y / TH;
      const ny = v * BASE * 0.5 + 1.3;
      const lat = (0.5 - v) * 180;
      const latAbs = Math.abs(lat);
      // 极地冰盖边缘不规则
      const iceEdge = 66 + (noise2(v * 22, 7.7, 91, 22) - 0.5) * 10;

      for (let x = 0; x < TW; x++) {
        const u = x / TW;
        const nx = u * BASE + 0.7;

        // 域扭曲，让海岸线更自然
        const w1 = fbm2(nx, ny, 11, 2, BASE) - 0.5;
        const w2 = fbm2(nx + 4.1, ny + 7.3, 29, 2, BASE) - 0.5;
        let h = fbm2(nx + w1 * 3.4, ny + w2 * 3.4, 7, 5, BASE);

        // 山脉脊线，只在高地上出现
        if (h > SEA) {
          const ridge = 1 - Math.abs(fbm2(nx * 2, ny * 2, 77, 3, BASE * 2) - 0.5) * 2;
          h += ridge * 0.075 * Math.min(1, (h - SEA) / 0.16);
        }

        // 高频海岸锯齿
        h += (noise2(nx * 12, ny * 12, 41, BASE * 12) - 0.5) * 0.026;

        const i = (y * TW + x) * 4;
        let r, g, b;

        if (h > SEA) {
          // ---- 陆地 ----
          const alt = Math.min(1, (h - SEA) / 0.24);
          let base;
          if (latAbs > 71) base = [234, 241, 252];
          else if (latAbs > 60) base = [126, 140, 128];
          else if (latAbs > 46) base = [64, 98, 74];
          else if (latAbs > 30) base = [78, 110, 64];
          else if (latAbs > 17) base = [156, 134, 94];
          else base = [44, 92, 52];

          // 干旱区 / 雨林带
          if (latAbs < 30 && noise2(nx * 3.1, ny * 3.1, 101, BASE * 3) > 0.56) {
            base = [174, 146, 96];
          }

          // 沿海低地偏暖
          if (alt < 0.06) base = [Math.min(255, base[0] + 32), Math.min(255, base[1] + 20), base[2] - 4];

          // 方向性起伏，让大陆有地形感
          const b0 = noise2(nx * 24, ny * 24, 53, BASE * 24);
          const b1 = noise2(nx * 24 + 0.4, ny * 24 + 0.4, 53, BASE * 24);
          const shade = (b1 - b0) * 34 * (0.3 + alt);

          const lift = alt * 24;
          r = base[0] + lift;
          g = base[1] + lift;
          b = base[2] + lift * 0.92;

          // 极地冰盖渐变（边缘不规则）
          if (latAbs > iceEdge) {
            const k = Math.min(1, (latAbs - iceEdge) / 11);
            r = r * (1 - k) + 238 * k;
            g = g * (1 - k) + 244 * k;
            b = b * (1 - k) + 253 * k;
          }

          r *= 1 + shade; g *= 1 + shade; b *= 1 + shade * 0.94;

          // ---- 城市灯光采样 ----
          if (latAbs < 62) {
            const coastalK = h < SEA + 0.05 ? 1 : (h < SEA + 0.1 ? 0.3 : 0.05);
            if (Math.random() < 0.085 * coastalK) {
              const warm = Math.random();
              cd[i] = 255;
              cd[i + 1] = 198 + Math.round(warm * 44);
              cd[i + 2] = 124 + Math.round(warm * 52);
              cd[i + 3] = 70 + Math.round(Math.random() * 150);
            }
            if (Math.random() < 0.0009 * coastalK) metrosCoast.push([x, y]);
            else if (Math.random() < 0.00022) metrosInland.push([x, y]);
          }
        } else {
          // ---- 海洋 ----
          const depth = Math.min(1, (SEA - h) / 0.14);
          const shallow = [26, 82, 128];
          const deep = [3, 13, 40];
          r = shallow[0] + (deep[0] - shallow[0]) * depth;
          g = shallow[1] + (deep[1] - shallow[1]) * depth;
          b = shallow[2] + (deep[2] - shallow[2]) * depth;
          // 近岸浅水提亮
          if (depth < 0.06) {
            const k = 1 - depth / 0.06;
            r += 30 * k; g += 34 * k; b += 30 * k;
          }
          // 洋流纹理
          const swirl = noise2(nx * 6, ny * 6, 67, BASE * 6) - 0.5;
          r += swirl * 7; g += swirl * 9; b += swirl * 11;
        }

        d[i] = Math.max(0, Math.min(255, r));
        d[i + 1] = Math.max(0, Math.min(255, g));
        d[i + 2] = Math.max(0, Math.min(255, b));
        d[i + 3] = 255;
      }
    }

    landCtx.putImageData(img, 0, 0);
    cityCtx.putImageData(cityImg, 0, 0);

    // 都市光晕 + 城市之间的光带
    const allMetros = metrosCoast.concat(metrosInland);
    cityCtx.globalCompositeOperation = 'lighter';

    allMetros.forEach(([x, y]) => {
      const rad = 3 + Math.random() * 9;
      const g2 = cityCtx.createRadialGradient(x, y, 0, x, y, rad);
      g2.addColorStop(0, 'rgba(255, 214, 152, 0.7)');
      g2.addColorStop(0.4, 'rgba(255, 190, 118, 0.3)');
      g2.addColorStop(1, 'rgba(255, 170, 90, 0)');
      cityCtx.fillStyle = g2;
      cityCtx.beginPath();
      cityCtx.arc(x, y, rad, 0, 6.2832);
      cityCtx.fill();
    });

    allMetros.forEach(([x, y], i) => {
      let best = -1, bestD = 1e9;
      for (let j = 0; j < allMetros.length; j++) {
        if (j === i) continue;
        const dx = allMetros[j][0] - x, dy = allMetros[j][1] - y;
        const dd = dx * dx + dy * dy;
        if (dd < bestD) { bestD = dd; best = j; }
      }
      if (best >= 0 && bestD < 8100) {
        const [x2, y2] = allMetros[best];
        cityCtx.strokeStyle = 'rgba(255, 186, 110, 0.18)';
        cityCtx.lineWidth = 0.7;
        cityCtx.beginPath();
        cityCtx.moveTo(x, y);
        cityCtx.lineTo(x2, y2);
        cityCtx.stroke();
      }
    });

    cityCtx.globalCompositeOperation = 'source-over';
  }

  function buildClouds() {
    const BASE = 5;
    const img = cloudCtx.createImageData(TW, TH);
    const d = img.data;
    for (let y = 0; y < TH; y++) {
      const v = y / TH;
      const lat = Math.abs((0.5 - v) * 2);
      // 纬向环流：赤道辐合带多云、副热带少云、中纬风暴带多云
      const band = Math.max(0.35, Math.min(1.4,
        1
        + 0.42 * Math.exp(-Math.pow(lat / 0.1, 2))
        + 0.30 * Math.exp(-Math.pow((lat - 0.68) / 0.15, 2))
        - 0.5 * Math.exp(-Math.pow((lat - 0.33) / 0.12, 2))));

      const ny = v * BASE * 0.5 + 3.7;
      for (let x = 0; x < TW; x++) {
        const nx = x / TW * BASE + 2.1;

        // 纬向拉伸 + 域扭曲，形成涡旋云带
        const w = fbm2(nx + 2.2, ny * 1.9 + 5.4, 61, 3, BASE) - 0.5;
        let n = fbm2(nx + w * 4.6, ny * 1.9 + w * 4.6, 71, 5, BASE);
        n += (fbm2(nx * 2, ny * 3, 83, 4, BASE * 2) - 0.5) * 0.22;
        n *= band;

        let a = (n - 0.46) * 2.9;
        a = Math.max(0, Math.min(1, a));
        a = a * a * (3 - 2 * a);

        const i = (y * TW + x) * 4;
        d[i] = 231; d[i + 1] = 240; d[i + 2] = 252;
        d[i + 3] = Math.round(a * 236);
      }
    }
    cloudCtx.putImageData(img, 0, 0);
  }

  // ---------- 贴图：优先真实地球素材，失败则回退程序化 ----------
  let texDay = null, texLights = null, texCloud = null;
  const texReady = () => texDay && texLights && texCloud;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error(src));
      im.src = src;
    });
  }

  /* 先用程序化地表立刻显示，真实素材到了再无缝替换。
     云层贴图 2.3MB，弱网下要几十秒，不能一直让地球空着。 */
  buildSurface();
  buildClouds();
  earthReady = true;
  stage.classList.add('ready');
  drawPlanet();

  Promise.all([
    loadImage('images/earth-day.jpg'),
    loadImage('images/earth-lights.png'),
    loadImage('images/earth-clouds.png'),
  ]).then(([d, n, c]) => {
    texDay = d; texLights = n; texCloud = c;
    drawPlanet();
  }).catch(() => { /* 素材不可用就继续用程序化贴图 */ });

  // ---------- 渲染 ----------
  const sunX = -0.82, sunY = -0.56;

  function drawPlanet() {
    const cx = SIZE / 2, cy = SIZE / 2;
    const pulse = 1 + Math.sin(t * 0.7) * 0.005;
    const r = SIZE * 0.322 * pulse;
    const lightX = cx + sunX * r, lightY = cy + sunY * r;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // 1. 外层大气散射（向阳侧略亮）
    const ax = cx + sunX * r * 0.25, ay = cy + sunY * r * 0.25;
    const atmo = ctx.createRadialGradient(ax, ay, r * 0.9, ax, ay, r * 1.62);
    atmo.addColorStop(0, 'rgba(96, 156, 255, 0.34)');
    atmo.addColorStop(0.22, 'rgba(62, 118, 236, 0.20)');
    atmo.addColorStop(0.55, 'rgba(40, 82, 190, 0.075)');
    atmo.addColorStop(1, 'rgba(26, 54, 150, 0)');
    ctx.fillStyle = atmo;
    ctx.beginPath(); ctx.arc(ax, ay, r * 1.62, 0, 6.2832); ctx.fill();

    // 球体
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.clip();

    const drawW = r * 3.06, drawH = r * 2.02;
    const offX = cx - drawW / 2 + (rotation * drawW) % drawW;

    // 2. 地表
    const surfaceMap = texReady() ? texDay : landCv;
    ctx.drawImage(surfaceMap, offX, cy - drawH / 2, drawW, drawH);
    ctx.drawImage(surfaceMap, offX - drawW, cy - drawH / 2, drawW, drawH);

    // 3. 海面镜面高光（椭圆，贴近光源方向）
    ctx.save();
    ctx.translate(lightX, lightY);
    ctx.scale(1, 0.5);
    const spec = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.62);
    spec.addColorStop(0, 'rgba(205, 232, 255, 0.22)');
    spec.addColorStop(0.4, 'rgba(130, 185, 250, 0.06)');
    spec.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = spec;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, 6.2832); ctx.fill();
    ctx.restore();

    // 4. 云层（略快于地表）
    ctx.globalAlpha = 0.88;
    const cloudMap = texReady() ? texCloud : cloudCv;
    const cloudOff = cx - drawW / 2 + (rotation * 1.16 * drawW) % drawW;
    ctx.drawImage(cloudMap, cloudOff, cy - drawH / 2, drawW, drawH);
    ctx.drawImage(cloudMap, cloudOff - drawW, cy - drawH / 2, drawW, drawH);
    ctx.globalAlpha = 1;

    // 5. 阳光直射区微暖
    const warm = ctx.createRadialGradient(lightX, lightY, r * 0.04, lightX, lightY, r * 1.18);
    warm.addColorStop(0, 'rgba(255, 246, 226, 0.19)');
    warm.addColorStop(0.45, 'rgba(255, 238, 208, 0.07)');
    warm.addColorStop(1, 'rgba(255, 240, 210, 0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = warm;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';

    // 6. 昼夜交界（以光点为中心的自然弯曲晨昏线）
    const night = ctx.createRadialGradient(lightX, lightY, r * 0.1, lightX, lightY, r * 2.02);
    night.addColorStop(0, 'rgba(0, 0, 0, 0)');
    night.addColorStop(0.32, 'rgba(3, 9, 26, 0.04)');
    night.addColorStop(0.44, 'rgba(2, 7, 20, 0.36)');
    night.addColorStop(0.56, 'rgba(1, 4, 13, 0.8)');
    night.addColorStop(0.7, 'rgba(0, 2, 9, 0.95)');
    night.addColorStop(0.88, 'rgba(0, 1, 7, 0.985)');
    night.addColorStop(1, 'rgba(0, 1, 7, 0.99)');
    ctx.fillStyle = night;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // 7. 晨昏线暖色余晖
    const dusk = ctx.createRadialGradient(lightX, lightY, r * 0.8, lightX, lightY, r * 1.32);
    dusk.addColorStop(0, 'rgba(255, 150, 70, 0)');
    dusk.addColorStop(0.32, 'rgba(255, 148, 76, 0.10)');
    dusk.addColorStop(0.64, 'rgba(232, 108, 54, 0.06)');
    dusk.addColorStop(1, 'rgba(180, 70, 30, 0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = dusk;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';

    // 8. 城市灯光：仅夜侧可见
    cityLayerCtx.clearRect(0, 0, SIZE, SIZE);
    cityLayerCtx.save();
    cityLayerCtx.beginPath(); cityLayerCtx.arc(cx, cy, r, 0, 6.2832); cityLayerCtx.clip();
    const cityMap = texReady() ? texLights : cityCv;
    cityLayerCtx.drawImage(cityMap, offX, cy - drawH / 2, drawW, drawH);
    cityLayerCtx.drawImage(cityMap, offX - drawW, cy - drawH / 2, drawW, drawH);
    cityLayerCtx.globalCompositeOperation = 'destination-in';
    const mask = cityLayerCtx.createRadialGradient(lightX, lightY, r * 0.25, lightX, lightY, r * 1.95);
    mask.addColorStop(0, 'rgba(255, 255, 255, 0)');
    mask.addColorStop(0.36, 'rgba(255, 255, 255, 0)');
    mask.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
    mask.addColorStop(0.62, 'rgba(255, 255, 255, 0.88)');
    mask.addColorStop(0.75, 'rgba(255, 255, 255, 1)');
    mask.addColorStop(1, 'rgba(255, 255, 255, 1)');
    cityLayerCtx.fillStyle = mask;
    cityLayerCtx.fillRect(0, 0, SIZE, SIZE);
    cityLayerCtx.restore();

    // 多次叠加 + 轻微外扩，形成城市灯光的光晕
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;
    ctx.drawImage(cityLayer, 0, 0);
    ctx.drawImage(cityLayer, 0, 0);
    ctx.drawImage(cityLayer, 0, 0);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1.012, 1.012);
    ctx.translate(-cx, -cy);
    ctx.globalAlpha = 0.6;
    ctx.drawImage(cityLayer, 0, 0);
    ctx.scale(1.018, 1.018);
    ctx.globalAlpha = 0.32;
    ctx.drawImage(cityLayer, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 9. 临边大气增亮
    const limb = ctx.createRadialGradient(cx, cy, r * 0.62, cx, cy, r);
    limb.addColorStop(0, 'rgba(86, 156, 255, 0)');
    limb.addColorStop(0.8, 'rgba(96, 168, 255, 0.09)');
    limb.addColorStop(0.96, 'rgba(150, 200, 255, 0.28)');
    limb.addColorStop(1, 'rgba(196, 224, 255, 0.44)');
    ctx.fillStyle = limb;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // 10. 夜侧微弱气辉
    const airglow = ctx.createRadialGradient(cx, cy, r * 0.88, cx, cy, r);
    airglow.addColorStop(0, 'rgba(72, 96, 200, 0)');
    airglow.addColorStop(1, 'rgba(70, 96, 210, 0.1)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = airglow;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();

    // 边缘细光环
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 6.2832);
    ctx.strokeStyle = 'rgba(178, 214, 255, 0.34)';
    ctx.lineWidth = Math.max(0.8, SIZE * 0.0011);
    ctx.stroke();

    // 边缘外侧柔和辉光
    const rim = ctx.createRadialGradient(cx, cy, r, cx, cy, r * 1.13);
    rim.addColorStop(0, 'rgba(154, 204, 255, 0.18)');
    rim.addColorStop(1, 'rgba(120, 170, 255, 0)');
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.13, 0, 6.2832); ctx.fill();
  }

  function loop() {
    t += 0.016;
    if (visible) {
      rotation += 0.00022;
      drawPlanet();
    }
    requestAnimationFrame(loop);
  }

  // 离开视口时暂停绘制
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { visible = e.isIntersecting; });
  }, { threshold: 0 });
  io.observe(stage);

  syncSize();
  drawPlanet();
  if (!REDUCED) loop();

  window.addEventListener('resize', () => {
    syncSize();
    drawPlanet();
  }, { passive: true });
}

/* ============================================================
   4. 本地时钟（首页观测数据）
   ============================================================ */
function initLocalClock() {
  const el = $('localClock');
  if (!el) return;
  const tick = () => {
    const n = new Date();
    el.textContent = `${pad(n.getHours(), 2)}:${pad(n.getMinutes(), 2)}:${pad(n.getSeconds(), 2)}`;
  };
  tick();
  setInterval(tick, 1000);
}

/* ============================================================
   5. 星图
   ============================================================ */
function initStarChart() {
  const svg = $('starChart');
  if (!svg) return;
  const cx = 320, cy = 320, R = 268;

  const A = CONSTELLATIONS[CONFIG.signA] || CONSTELLATIONS.Lyra;
  const B = CONSTELLATIONS[CONFIG.signB] || CONSTELLATIONS.Orion;

  const POS_A = { x: 420, y: 238, scale: 1.86 };
  const POS_B = { x: 226, y: 404, scale: 1.86 };
  const brightest = (def) => def.stars.reduce((m, s) => (s.r > m.r ? s : m), def.stars[0]);
  const starXY = (def, pos) => {
    const st = brightest(def);
    return {
      x: pos.x + (st.x - 50) * pos.scale,
      y: pos.y + (st.y - 50) * pos.scale,
      name: st.n || '',
    };
  };
  const mA = starXY(A, POS_A);
  const mB = starXY(B, POS_B);

  // 角距
  const d2r = Math.PI / 180;
  const cosD = Math.sin(A.dec * d2r) * Math.sin(B.dec * d2r) +
    Math.cos(A.dec * d2r) * Math.cos(B.dec * d2r) * Math.cos((A.raH - B.raH) * 15 * d2r);
  const sep = Math.acos(Math.min(1, Math.max(-1, cosD))) / d2r;
  const sepText = sep.toFixed(1) + '°';

  // 稳定的星点
  let seed = 20230814;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  let s = `
    <defs>
      <radialGradient id="chartBg" cx="50%" cy="42%" r="62%">
        <stop offset="0%" stop-color="#0a1226" stop-opacity="0.94"/>
        <stop offset="55%" stop-color="#050a1a" stop-opacity="0.62"/>
        <stop offset="82%" stop-color="#02040c" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#02040c" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="chartCore" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="chartCoreGold" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#e8c97a" stop-opacity="0.14"/>
        <stop offset="100%" stop-color="#e8c97a" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="milkyBand" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#7c8fd8" stop-opacity="0"/>
        <stop offset="28%" stop-color="#93a5e8" stop-opacity="0.12"/>
        <stop offset="50%" stop-color="#b7c6f5" stop-opacity="0.2"/>
        <stop offset="72%" stop-color="#93a5e8" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="#7c8fd8" stop-opacity="0"/>
      </linearGradient>
      <clipPath id="chartClip"><circle cx="${cx}" cy="${cy}" r="${R - 1}"/></clipPath>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#chartBg)"/>
    <g clip-path="url(#chartClip)">
      <ellipse cx="${cx}" cy="${cy + 18}" rx="${R - 8}" ry="86" fill="url(#milkyBand)"
        transform="rotate(-27 ${cx} ${cy})" opacity="0.6"/>
      <ellipse cx="${cx}" cy="${cy + 24}" rx="${R - 22}" ry="34" fill="url(#milkyBand)"
        transform="rotate(-27 ${cx} ${cy})" opacity="0.4"/>
      <text x="${cx}" y="${(cy - 150).toFixed(1)}" class="chart-milky" text-anchor="middle"
        transform="rotate(-27 ${cx} ${cy})">MILKY WAY</text>
    </g>
  `;

  // 赤纬圈
  [[0.25, '+67°'], [0.5, '+45°'], [0.75, '+22°']].forEach(([k, label]) => {
    s += `<circle cx="${cx}" cy="${cy}" r="${R * k}" fill="none" stroke="#22304a" stroke-width="0.5"/>`;
    s += `<text x="${(cx - R * k + 4).toFixed(1)}" y="${cy - 4}" class="chart-dec">${label}</text>`;
  });

  // 12 条赤经辐射线
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x2 = cx + Math.cos(a) * R, y2 = cy + Math.sin(a) * R;
    s += `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#1c2a44" stroke-width="0.5"/>`;
  }

  // 散布的背景星（按星等分布，带色温差异）
  for (let i = 0; i < 260; i++) {
    const rad = Math.sqrt(rnd()) * (R - 10);
    const ang = rnd() * Math.PI * 2;
    const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
    const mag = Math.pow(rnd(), 2.4);
    const rr = 0.28 + mag * 1.5;
    const o = 0.12 + mag * 0.6;
    const tint = rnd();
    const col = tint > 0.8 ? '#ffd9b0' : (tint > 0.55 ? '#c7d8ff' : '#eef3ff');
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(2)}" fill="${col}" opacity="${o.toFixed(2)}"/>`;
    if (mag > 0.82) {
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rr * 3.4).toFixed(2)}" fill="${col}" opacity="0.1"/>`;
    }
  }

  // 中心十字
  s += `<g stroke="#38bdf8" stroke-width="0.5" opacity="0.35">
    <line x1="${cx - 10}" y1="${cy}" x2="${cx + 10}" y2="${cy}"/>
    <line x1="${cx}" y1="${cy - 10}" x2="${cx}" y2="${cy + 10}"/>
    <circle cx="${cx}" cy="${cy}" r="2" fill="#38bdf8" stroke="none" opacity="0.7"/>
  </g>`;

  // 两个星座
  s += `<circle cx="${POS_A.x}" cy="${POS_A.y}" r="96" fill="url(#chartCore)" opacity="0.55"/>`;
  s += `<circle cx="${POS_B.x}" cy="${POS_B.y}" r="96" fill="url(#chartCoreGold)" opacity="0.55"/>`;
  s += constellationMarkup(CONFIG.signA, POS_A.x, POS_A.y, POS_A.scale, '#7dd3fc', 0.95, false);
  s += constellationMarkup(CONFIG.signB, POS_B.x, POS_B.y, POS_B.scale, '#e8c97a', 0.95, false);

  // 代表星：十字准星 + 星名
  const markStar = (p, color) => {
    let m = `<g stroke="${color}" fill="none" opacity="0.9">
      <circle cx="${p.x}" cy="${p.y}" r="6.2" stroke-width="0.6" opacity="0.4"/>
      <line x1="${p.x - 10}" y1="${p.y}" x2="${p.x - 7}" y2="${p.y}" stroke-width="0.8"/>
      <line x1="${p.x + 7}" y1="${p.y}" x2="${p.x + 10}" y2="${p.y}" stroke-width="0.8"/>
      <line x1="${p.x}" y1="${p.y - 10}" x2="${p.x}" y2="${p.y - 7}" stroke-width="0.8"/>
      <line x1="${p.x}" y1="${p.y + 7}" x2="${p.x}" y2="${p.y + 10}" stroke-width="0.8"/>
    </g>
    <circle cx="${p.x}" cy="${p.y}" r="1.7" fill="${color}"/>
    <circle cx="${p.x}" cy="${p.y}" r="4.4" fill="${color}" opacity="0.16"/>`;
    if (p.name) {
      m += `<text x="${(p.x + 9).toFixed(1)}" y="${(p.y - 8).toFixed(1)}" class="chart-star" fill="${color}">${p.name}</text>`;
    }
    return m;
  };
  s += markStar(mA, '#7dd3fc');
  s += markStar(mB, '#e8c97a');

  const midX = (mA.x + mB.x) / 2, midY = (mA.y + mB.y) / 2;
  s += `<line x1="${mA.x}" y1="${mA.y}" x2="${mB.x}" y2="${mB.y}" class="chart-link" stroke="#fef3c7" stroke-width="0.8" opacity="0.3"/>
        <text x="${midX.toFixed(1)}" y="${(midY - 7).toFixed(1)}" class="chart-sep" text-anchor="middle">Δ ${sepText}</text>`;

  // 标签
  s += `<text x="${POS_A.x}" y="${(POS_A.y - 88).toFixed(1)}" class="chart-label a" text-anchor="middle">${A.title}</text>`;
  s += `<text x="${POS_B.x}" y="${(POS_B.y + 88).toFixed(1)}" class="chart-label b" text-anchor="middle">${B.title}</text>`;

  svg.innerHTML = s;

  // 文案填充
  const f = (raH, dec) => {
    const hh = Math.floor(raH), mm = Math.round((raH - hh) * 60);
    const sign = dec < 0 ? '−' : '+';
    const d = Math.floor(Math.abs(dec)), m = Math.round((Math.abs(dec) - d) * 60);
    return `RA ${pad(hh, 2)}h ${pad(mm, 2)}m · DEC ${sign}${pad(d, 2)}° ${pad(m, 2)}′`;
  };
  $('signA').textContent = A.title;
  $('signB').textContent = B.title;
  $('signACoord').textContent = f(A.raH, A.dec);
  $('signBCoord').textContent = f(B.raH, B.dec);

  // 角距
  $('separation').textContent = sepText;
}

/* ============================================================
   6. 纪念日
   ============================================================ */
function initAnniversaries() {
  const grid = $('annivGrid');
  if (!grid) return;

  function formatDate(d) {
    return `${d.getFullYear()}.${pad(d.getMonth() + 1, 2)}.${pad(d.getDate(), 2)}`;
  }

  function render() {
    const now = new Date();
    grid.innerHTML = '';

    CONFIG.anniversaries.forEach((item, idx) => {
      let d = item.date;
      // 倒计时类的日子（周年、生日）每年都会来：过了就自动顺延到下一次
      if (item.type === 'countdown') {
        while (d <= now) {
          d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate(),
            d.getHours(), d.getMinutes(), d.getSeconds());
        }
      }
      const diff = d - now;
      const absDays = Math.ceil(Math.abs(diff) / 86400000);

      let statusClass = 'passed', statusText = '已过去', countText = absDays.toLocaleString();
      if (item.type === 'countdown') {
        if (diff >= 86400000) { statusClass = 'upcoming'; statusText = '倒计时'; }
        else { statusClass = 'today'; statusText = '就是今天'; countText = '0'; }
      }

      const el = document.createElement('div');
      el.className = 'anniv-card fade-up';
      el.style.transitionDelay = (idx * 0.06) + 's';
      el.innerHTML = `
        <div class="anniv-top">
          <span class="anniv-no">NO.${pad(idx + 1, 2)}</span>
          <span class="anniv-status ${statusClass}">${statusText}</span>
        </div>
        <div class="anniv-title">${item.title}</div>
        <div class="anniv-date">${formatDate(d)}</div>
        <div class="anniv-count-row">
          <span class="anniv-count">${countText}</span>
          <span class="anniv-unit">DAYS</span>
        </div>
        <div class="anniv-rule"></div>
        <div class="anniv-foot">${item.type === 'countdown' ? 'UNTIL' : 'SINCE'} ${formatDate(d)}</div>
      `;
      grid.appendChild(el);
    });

    observeFadeUps();
  }

  render();
  setInterval(render, 60000);
}

/* ============================================================
   7. 照片墙
   ============================================================ */
function initGallery() {
  const grid = $('galleryGrid');
  if (!grid) return;
  const lightbox = $('lightbox');
  const lbImg = $('lbImg');
  const lbCaption = $('lbCaption');
  const lbIndex = $('lbIndex');
  const total = CONFIG.photos.length;

  CONFIG.photos.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'gallery-item fade-up';
    item.style.transitionDelay = (i * 0.05) + 's';
    item.innerHTML = `
      <img src="${p.src}" alt="${p.caption}" loading="lazy" />
      <div class="gallery-overlay">
        <span class="gallery-no">${pad(i + 1, 2)}</span>
        <span class="gallery-caption">${p.caption}</span>
      </div>
    `;
    item.addEventListener('click', () => {
      lbImg.src = p.src;
      lbCaption.textContent = p.caption;
      lbIndex.textContent = `${pad(i + 1, 2)} / ${pad(total, 2)}`;
      lightbox.classList.add('show');
    });
    grid.appendChild(item);
  });

  const close = () => lightbox.classList.remove('show');
  $('lbClose').addEventListener('click', close);
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  observeFadeUps();
}

/* ============================================================
   8. 留言板
   ============================================================ */
function initMessages() {
  const form = $('msgForm');
  if (!form) return;
  const list = $('msgList');
  const nameInput = $('msgName');
  const textInput = $('msgText');
  const countEl = $('msgCount');
  const KEY = 'cosmic_messages_v1';

  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  };
  const save = (m) => localStorage.setItem(KEY, JSON.stringify(m));

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function render() {
    const msgs = load();
    if (!msgs.length) {
      list.innerHTML = '<div class="msg-empty"><span>&gt;</span> no messages logged. channel open.</div>';
      return;
    }
    list.innerHTML = msgs.map(m => `
      <div class="msg-item">
        <div class="msg-head">
          <span class="msg-name">${escapeHtml(m.name)}</span>
          <span class="msg-time">${m.time}</span>
        </div>
        <div class="msg-text">${escapeHtml(m.text)}</div>
      </div>
    `).join('');
    list.scrollTop = list.scrollHeight;
  }

  textInput.addEventListener('input', () => {
    countEl.textContent = textInput.value.length;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim() || '匿名旅人';
    const text = textInput.value.trim();
    if (!text) { textInput.focus(); return; }

    const now = new Date();
    const time = `${now.getFullYear()}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)} ` +
      `${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}`;

    const msgs = load();
    msgs.push({ name, text, time });
    save(msgs);
    render();
    textInput.value = '';
    countEl.textContent = '0';
  });

  render();
}

/* ============================================================
   8.5 给作者的建议（直达云端 lm_feedback 表）
   ============================================================ */
function initFeedback() {
  const form = $('fbForm');
  if (!form) return;
  const status = $('fbStatus');
  let sending = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const name = $('fbName').value.trim();
    const text = $('fbText').value.trim();
    if (!text) { $('fbText').focus(); return; }

    sending = true;
    status.className = 'fb-status';
    status.textContent = 'SENDING…';

    try {
      const cfg = window.CLOUD;
      if (!cfg || !cfg.enabled || !window.supabase) {
        throw new Error('cloud unavailable');
      }
      const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
      const { error } = await sb.from('lm_feedback').insert({
        name: name || '匿名访客',
        text: text,
        ts: Date.now(),
      });
      if (error) throw error;

      status.classList.add('ok');
      status.textContent = '已收到，感谢你的建议';
      form.reset();
    } catch (err) {
      status.classList.add('err');
      status.textContent = '发送失败，请稍后再试';
    }
    sending = false;
  });
}

/* ============================================================
   9. 鼠标光晕
   ============================================================ */
function initCursorGlow() {
  const glow = $('cursorGlow');
  if (!glow || REDUCED) return;
  let tx = window.innerWidth / 2, ty = window.innerHeight / 2;
  let cx = tx, cy = ty;
  window.addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; }, { passive: true });
  (function loop() {
    cx += (tx - cx) * 0.07;
    cy += (ty - cy) * 0.07;
    glow.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  })();
}

/* ============================================================
   10. 视差
   ============================================================ */
function initScrollParallax() {
  const nebula = $('nebula');
  const galaxy = $('galaxyArm');
  const sky = $('skyConstellations');
  const earthStage = document.querySelector('.earth-stage');
  let ticking = false;

  function apply() {
    const y = window.scrollY;
    if (nebula) nebula.style.transform = `translateY(${y * 0.12}px)`;
    if (galaxy) galaxy.style.marginTop = (y * 0.08) + 'px';
    if (sky) sky.style.transform = `translateY(${y * 0.06}px)`;
    if (earthStage) earthStage.style.setProperty('--earth-par', `${y * 0.16}px`);
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(apply); }
  }, { passive: true });
  apply();
}

/* ============================================================
   11. 导航
   ============================================================ */
function initNav() {
  const links = document.querySelectorAll('.nav-link');
  const ids = ['home', 'coordinates', 'anniversary', 'gallery', 'message'];
  const sections = ids.map(id => $(id)).filter(Boolean);

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      if (!link.dataset.target) return; // 由 app.js 处理的入口
      e.preventDefault();
      const target = $(link.dataset.target);
      if (target) target.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
    });
  });

  function onScroll() {
    const y = window.scrollY + window.innerHeight * 0.42;
    let cur = 'home';
    for (const sec of sections) if (sec.offsetTop <= y) cur = sec.id;
    links.forEach(l => l.classList.toggle('active', l.dataset.target === cur));
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ============================================================
   12. 入场动画
   ============================================================ */
let fadeObserver;
function observeFadeUps() {
  if (!fadeObserver) {
    fadeObserver = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          fadeObserver.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  }
  document.querySelectorAll('.fade-up:not(.in)').forEach(el => fadeObserver.observe(el));
}

function initScrollReveal() {
  document.querySelectorAll('.section-head, .coord-row, .terminal, .chart-wrap').forEach(el => {
    el.classList.add('fade-up');
  });
  observeFadeUps();
}

/* ============================================================
   13. 点击星空 · 连成你们的星座
   ------------------------------------------------------------
   在页面空白处点击落下一颗星，自动与上一颗连线，
   像一起认领一片星域。星星会停留片刻（约 9 秒），
   再用 6 秒渐渐消散，不在画面里长留。
   ============================================================ */
function initUserStars() {
  const canvas = $('userStars');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const MAX = 160;
  const HOLD = 9000;   // 完全可见时长（ms）
  const FADE = 6000;   // 渐渐消散时长（ms）
  const LIFE = HOLD + FADE;
  let w = 0, h = 0, dpr = 1;
  let pts = [];
  let ripples = [];
  let shownLen = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // 生命周期：先停留，再平滑消散
  function fadeOf(p, t) {
    const age = t - p.t;
    if (age <= HOLD) return 1;
    if (age >= LIFE) return 0;
    const k = (age - HOLD) / FADE;
    return 1 - k * k * (3 - 2 * k);
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const t = performance.now();

    // 消散完毕的星从头部移除（点击按时间顺序，过期的一定是前缀）
    while (pts.length && t - pts[0].t > LIFE) pts.shift();
    if (pts.length !== shownLen) { shownLen = pts.length; updateBar(); }

    // 连线：温柔的蓝白渐隐线，随端点一起消散
    if (pts.length > 1) {
      ctx.lineWidth = 0.7;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const k = Math.min(fadeOf(a, t), fadeOf(b, t));
        if (k <= 0) continue;
        const ax = a.x * w, ay = a.y * h, bx = b.x * w, by = b.y * h;
        const g = ctx.createLinearGradient(ax, ay, bx, by);
        g.addColorStop(0, `rgba(158,197,255,${(0.04 * k).toFixed(3)})`);
        g.addColorStop(0.5, `rgba(158,197,255,${(0.32 * k).toFixed(3)})`);
        g.addColorStop(1, `rgba(158,197,255,${(0.04 * k).toFixed(3)})`);
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }

    // 星点：光晕 + 白核，最新一颗缓慢脉动，整体随时间渐隐
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const k = fadeOf(p, t);
      if (k <= 0) continue;
      const x = p.x * w, y = p.y * h;
      const last = i === pts.length - 1;
      const pulse = last && !REDUCED ? 1 + Math.sin(t / 320) * 0.32 : 1;
      const r = (last ? 2.3 : 1.6) * pulse;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
      glow.addColorStop(0, `rgba(190,220,255,${(0.45 * k).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(190,220,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, r * 6, 0, 6.2832); ctx.fill();
      ctx.fillStyle = `rgba(232,240,255,${(0.95 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }

    // 点击涟漪
    ripples = ripples.filter(rp => t - rp.t0 < 700);
    for (const rp of ripples) {
      const k = (t - rp.t0) / 700;
      ctx.strokeStyle = `rgba(158,197,255,${(0.5 * (1 - k)).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, 6 + k * 34, 0, 6.2832); ctx.stroke();
    }

    requestAnimationFrame(draw);
  }

  // 空白处点击 → 落星
  const IGNORE = 'a,button,input,textarea,select,label,nav,.bottom-nav,.hud-panel,' +
    '.gallery-item,.lightbox,.loader,.auth-modal,.editor-modal,#app,.modal-box,' +
    '.msg-form,.anniv-card,.chart-wrap,.scroll-hint,.msg-item,.hero-cta,.sky-hint';
  document.addEventListener('click', (e) => {
    if (e.target.closest(IGNORE)) return;
    if (!w || !h) return;
    pts.push({ x: e.clientX / w, y: e.clientY / h, t: performance.now() });
    if (pts.length > MAX) pts.shift();
    ripples.push({ x: e.clientX, y: e.clientY, t0: performance.now() });
    updateBar();
  });

  // 左下角提示 + 清除
  const bar = document.createElement('div');
  bar.className = 'sky-hint';
  bar.innerHTML = '<span class="sky-hint-txt">点击星空 · 连成你们的星座</span>' +
    '<button type="button" class="sky-hint-clear">清除</button>';
  document.body.appendChild(bar);
  const updateBar = () => bar.classList.toggle('has', pts.length > 0);
  bar.querySelector('.sky-hint-clear').addEventListener('click', (e) => {
    e.stopPropagation();
    pts = [];
    shownLen = 0;
    updateBar();
  });
  updateBar();

  window.addEventListener('resize', resize);
  resize();
  draw();
}
