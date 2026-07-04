// 서비스 워커 — PWA 설치 및 기본 오프라인 지원용
const CACHE = 'handwriting-coach-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/missions.js',
  './js/app-firebase.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Firebase, Google, Cloudflare Worker 등 외부 요청은 항상 네트워크로 (캐시하지 않음)
  if (url.origin !== self.location.origin) return;
  // 같은 출처의 정적 파일만 캐시 우선(cache-first), 없으면 네트워크
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
  );
});
