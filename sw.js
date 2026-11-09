/* 银河之约 · Service Worker
   只缓存同源静态资源；接口与云端数据一律直连网络。 */
const VERSION = 'lm-20261109aa';
const CORE = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'app.js',
  'vendor/supabase.min.js',
  'manifest.webmanifest',
  'pwa-192.png',
  'pwa-512.png',
  'images/g1.jpg',
  'images/g2.jpg',
  'images/g3.jpg',
  'images/g4.jpg',
  'images/g5.jpg',
  'images/g6.jpg',
  'images/photo1.svg',
  'images/photo2.svg',
  'images/photo3.svg',
  'images/photo4.svg',
  'images/photo5.svg',
  'images/photo6.svg',
  'images/earth-day.jpg',
  'images/earth-clouds.png',
  'images/earth-lights.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：优先网络（保证看到最新版本），离线时回退缓存
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 静态资源：脚本/样式一律网络优先（带 ?v= 版本号更新后立刻生效，离线回退缓存）；
  // 图片等走缓存优先，但按完整 URL 精确匹配，绝不跨版本错拿旧文件。
  const isCode = /\.(?:js|css)$/i.test(url.pathname);
  if (isCode) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
