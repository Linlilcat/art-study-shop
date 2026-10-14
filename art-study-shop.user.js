// ==UserScript==
// @name         艺学小站
// @namespace    art.study.shop
// @version      6.2.0
// @description  让学习更加艺术！！！
// @author       小柳Terra
// @match        *://www.bilibili.com/*
// @match        *://m.bilibili.com/*
// @grant        GM_xmlhttpRequest
// @connect      music.163.com
// @require      https://cdn.jsdelivr.net/npm/jsmediatags@3.9.7/dist/jsmediatags.min.js
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    COIN_PER_MINUTE: 1,
    PRICE_PER_MB: 2,
    FLAC_DIVISOR: 4,
    SUPPORTED_EXT: /\.(mp3|flac)$/i,
    MAX_FILES: 5000,
    CYCLE_SECONDS: 60,
    LAZY_ROOT_MARGIN: '800px 0px',
    PAGE_SIZE: 60,
    COVER_MAX: 150,
    COVER_QUALITY: 0.6,
    DEFAULT_USERNAME: '兰德树明子',
    CAT_TALK_INTERVAL: 15000,
    USERNAME_MAX_LEN: 10,
    CAT_SING_BASE_SEC: 2,
    CAT_SING_MAX_TOTAL: 60,
  };

  // 老板唱歌时长：基础 2 秒 + 可调延长（0~60 秒）＝ 最长 62 秒
  const CAT_SING_BASE = CONFIG.CAT_SING_BASE_SEC;
  const CAT_SING_MAX_TOTAL = CONFIG.CAT_SING_MAX_TOTAL;
  const CAT_SING_EXTRA_MAX = CAT_SING_MAX_TOTAL - CAT_SING_BASE;
  const K_STATE = 'shop_state_v4';
  const K_PURCHASED = 'shop_purchased_v4';
  const K_POS = 'shop_pos_v4';
  const K_FOLDER_NAME = 'shop_folder_name_v4';
  const K_FAVS = 'shop_favs_v4';
  const K_THEME = 'shop_theme_v4';
  const K_THEME_NAMES = 'shop_theme_names_v4';
  const K_ITEMS = 'shop_items_v4';
  const K_USERNAME = 'shop_username_v4';
  const K_PLAYLIST = 'shop_playlist_v4';
  const K_PLAYMODE = 'shop_playmode_v4';
  const K_OVERRIDES = 'shop_overrides_v4';
  const K_LEADER = 'shop_leader_v4';
  const K_TASKS = 'shop_tasks_v4';
  const K_TASKS_DATE = 'shop_tasks_date_v4';
  const K_TASKS_LOCKED = 'shop_tasks_locked_v4';
  const K_COUPONS = 'shop_coupons_v4';
  const K_COUPON_CLAIMED = 'shop_coupon_claimed_v4';
  const K_PRICE_OVERRIDES = 'shop_price_overrides_v4';
  const K_HIDE_START = 'shop_hide_start_v4';
  const K_LYRIC_PASSES = 'shop_lyric_passes_v4';
  const K_UNLOCKED_LYRICS = 'shop_unlocked_lyrics_v4';
  const K_CAT_SING_EXTRA = 'shop_cat_sing_extra_v4';
  const K_CAT_SING_USE = 'shop_cat_sing_use_v4';
  const K_BING_COUNT = 'shop_bing_count_v4';
  const K_CAT_FULL_SONG = 'shop_cat_full_song_v4';
  const K_ART_PALACE = 'shop_art_palace_v4';
  const K_TAGS_SNAPSHOT = 'shop_tags_snapshot_v4';
  const TAB_ID = 'tab_' + Math.random().toString(36).slice(2, 10);
  let isPrimaryTab = false;

  /* ============ IndexedDB ============ */
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('shop_db_v4', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('covers'))
          db.createObjectStore('covers');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    try {
      const db = await openDB();
      return new Promise((res) => {
        const g = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        g.onsuccess = () => res(g.result || null);
        g.onerror = () => res(null);
      });
    } catch (e) {
      return null;
    }
  }
  async function idbSet(key, val) {
    try {
      const db = await openDB();
      return new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) {}
  }
  async function coverCacheGet(key) {
    try {
      const db = await openDB();
      return new Promise((res) => {
        const g = db
          .transaction('covers', 'readonly')
          .objectStore('covers')
          .get(key);
        g.onsuccess = () => res(g.result || null);
        g.onerror = () => res(null);
      });
    } catch (e) {
      return null;
    }
  }
  async function coverCacheSet(key, val) {
    try {
      const db = await openDB();
      return new Promise((res, rej) => {
        const tx = db.transaction('covers', 'readwrite');
        tx.objectStore('covers').put(val, key);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) {}
  }

  /* ============ 状态 ============ */
  function loadState() {
    try {
      const r = localStorage.getItem(K_STATE);
      if (r) return JSON.parse(r);
    } catch (e) {}
    return {
      coins: 0,
      totalEarned: 0,
      progressSeconds: 0,
      todaySeconds: 0,
      todayDate: new Date().toDateString(),
    };
  }
  let S = loadState();

  function saveState() {
    try {
      localStorage.setItem(K_STATE, JSON.stringify(S));
    } catch (e) {}
  }
  (function () {
    const t = new Date().toDateString();
    if (S.todayDate !== t) {
      S.todayDate = t;
      S.todaySeconds = 0;
      saveState();
    }
  })();

  let PURCHASED = {};
  try {
    PURCHASED = JSON.parse(localStorage.getItem(K_PURCHASED)) || {};
  } catch (e) {
    PURCHASED = {};
  }

  function savePurchased() {
    try {
      localStorage.setItem(K_PURCHASED, JSON.stringify(PURCHASED));
    } catch (e) {}
  }

  let FAVS = {};
  try {
    FAVS = JSON.parse(localStorage.getItem(K_FAVS)) || {};
  } catch (e) {
    FAVS = {};
  }

  function saveFavs() {
    try {
      localStorage.setItem(K_FAVS, JSON.stringify(FAVS));
    } catch (e) {}
  }

  let INVENTORY = {
    catnip: {
      owned: false,
      active: false,
    },
    rainbow: {
      owned: false,
      active: false,
    },
    symphony: {
      owned: false,
      active: false,
    },
    magicstar: {
      owned: false,
      active: false,
    },
    hidecoins: {
      owned: false,
      active: false,
    },
    lyricpass: {
      owned: false,
      active: false,
    },
    audioviz: {
      owned: false,
      active: false,
    },
    audiorainbow: {
      owned: false,
      active: false,
    },
    catsing: {
      owned: false,
      active: false,
    },
    bing: {
      owned: false,
      active: false,
    },
    catfullsong: {
      owned: false,
      active: false,
    },
    artpalace: {
      owned: false,
      active: false,
    },
  };
  try {
    const raw = JSON.parse(localStorage.getItem(K_ITEMS));
    if (raw && typeof raw === 'object') {
      [
        'catnip',
        'rainbow',
        'symphony',
        'magicstar',
        'hidecoins',
        'lyricpass',
        'audioviz',
        'audiorainbow',
        'catsing',
        'bing',
        'catfullsong',
        'artpalace',
      ].forEach((id) => {
        if (raw[id])
          INVENTORY[id] = {
            owned: !!raw[id].owned,
            active: !!raw[id].active,
          };
      });
    }
  } catch (e) {}

  function saveInventory() {
    try {
      localStorage.setItem(K_ITEMS, JSON.stringify(INVENTORY));
    } catch (e) {}
  }

  let USERNAME = CONFIG.DEFAULT_USERNAME;
  try {
    const u = localStorage.getItem(K_USERNAME);
    if (u) USERNAME = u;
  } catch (e) {}

  function saveUsername() {
    try {
      localStorage.setItem(K_USERNAME, USERNAME);
    } catch (e) {}
  }

  function getUserDisplay() {
    return USERNAME + '同学';
  }

  function getSearchHint() {
    try {
      const el = document.querySelector('.nav-search-input');
      if (!el) return '';
      // 优先 placeholder，其次 title，B站两个一般一样
      let t = (el.placeholder || el.title || '').trim();
      if (!t) return '';
      if (t.length > 20) return '';
      // 排除掉太普通、没意思的占位文字
      const IGNORE = [
        '搜索',
        '搜一搜',
        '搜索视频',
        '请输入搜索内容',
        '搜索你感兴趣的内容',
      ];
      if (IGNORE.indexOf(t) >= 0) return '';
      return t;
    } catch (e) {
      return '';
    }
  }

  let _biliAvatarCache = '';

  function getBiliAvatar() {
    if (_biliAvatarCache) return _biliAvatarCache;
    try {
      // 精准锁定你自己的头像——用 DedeUserID 去匹配主页链接
      let myUid = '';
      try {
        const m = document.cookie.match(/(?:^|;\s*)DedeUserID=(\d+)/);
        if (m) myUid = m[1];
      } catch (e) {}

      let img = null;

      // ① 优先：在指向你自己主页的链接里找头像 img
      if (myUid) {
        const myLinks = document.querySelectorAll(
          'a[href*="space.bilibili.com/' + myUid + '"]',
        );
        for (const a of myLinks) {
          const im = a.querySelector('img');
          if (im && im.src && im.src.indexOf('bfs/face') >= 0) {
            img = im;
            break;
          }
        }
      }

      // ② 兜底：满页找 bfs/face 图片，排除视频页 UP 主区
      if (!img) {
        const all = document.querySelectorAll('img[src*="bfs/face"]');
        for (const im of all) {
          if (
            im.closest &&
            (im.closest('.up-info') ||
              im.closest('.up-name') ||
              im.closest('.video-info') ||
              im.closest('.up-detail') ||
              im.closest('.bili-video-card__info--owner'))
          )
            continue;
          img = im;
          break;
        }
      }

      if (!img) return '';
      let url = img.src || '';
      if (!url) return '';
      // 去掉 B站图片的后缀参数（@120w_120h_1c 这种），保留干净地址
      url = url.replace(/@.*$/, '');
      _biliAvatarCache = url;
      return url;
    } catch (e) {
      return '';
    }
  }

  function savePlaylist() {
    try {
      localStorage.setItem(K_PLAYLIST, JSON.stringify(PLAYLIST));
    } catch (e) {}
  }
  let PLAYLIST = [];
  try {
    const pl = JSON.parse(localStorage.getItem(K_PLAYLIST));
    if (Array.isArray(pl)) PLAYLIST = pl;
  } catch (e) {}
  let PLAYMODE = 'list';
  try {
    const m = localStorage.getItem(K_PLAYMODE);
    if (m) PLAYMODE = m;
  } catch (e) {}

  function savePlaymode() {
    try {
      localStorage.setItem(K_PLAYMODE, PLAYMODE);
    } catch (e) {}
  }
  let OVERRIDES = {};
  try {
    const o = JSON.parse(localStorage.getItem(K_OVERRIDES));
    if (o && typeof o === 'object') OVERRIDES = o;
  } catch (e) {}

  let LYRIC_PASSES = 0;
  try {
    LYRIC_PASSES =
      parseInt(localStorage.getItem(K_LYRIC_PASSES) || '0', 10) || 0;
  } catch (e) {}

  let CAT_SING_EXTRA = 0;
  try {
    CAT_SING_EXTRA =
      parseInt(localStorage.getItem(K_CAT_SING_EXTRA) || '0', 10) || 0;
  } catch (e) {}
  CAT_SING_EXTRA = Math.max(0, Math.min(CAT_SING_EXTRA_MAX, CAT_SING_EXTRA));

  function saveCatSingExtra() {
    try {
      localStorage.setItem(K_CAT_SING_EXTRA, String(CAT_SING_EXTRA));
    } catch (e) {}
  }

  let CAT_SING_USE = 0;
  try {
    CAT_SING_USE =
      parseInt(localStorage.getItem(K_CAT_SING_USE) || '0', 10) || 0;
  } catch (e) {}
  CAT_SING_USE = Math.max(0, Math.min(CAT_SING_EXTRA, CAT_SING_USE));

  function saveCatSingUse() {
    try {
      localStorage.setItem(K_CAT_SING_USE, String(CAT_SING_USE));
    } catch (e) {}
  }

  let BING_COUNT = 0;
  try {
    BING_COUNT = parseInt(localStorage.getItem(K_BING_COUNT) || '0', 10) || 0;
  } catch (e) {}
  BING_COUNT = Math.max(0, BING_COUNT);

  function saveBingCount() {
    try {
      localStorage.setItem(K_BING_COUNT, String(BING_COUNT));
    } catch (e) {}
  }
  let CAT_FULL_SONG = 0;
  try {
    CAT_FULL_SONG =
      parseInt(localStorage.getItem(K_CAT_FULL_SONG) || '0', 10) || 0;
  } catch (e) {}
  CAT_FULL_SONG = Math.max(0, CAT_FULL_SONG);

  function saveCatFullSong() {
    try {
      localStorage.setItem(K_CAT_FULL_SONG, String(CAT_FULL_SONG));
    } catch (e) {}
  }
  let ART_PALACE_UNLOCKED = {};
  try {
    const p = JSON.parse(localStorage.getItem(K_ART_PALACE));
    if (p && typeof p === 'object') ART_PALACE_UNLOCKED = p;
  } catch (e) {}

  function saveArtPalace() {
    try {
      localStorage.setItem(K_ART_PALACE, JSON.stringify(ART_PALACE_UNLOCKED));
    } catch (e) {}
  }

  let TAGS_SNAPSHOT = {};
  try {
    const t = JSON.parse(localStorage.getItem(K_TAGS_SNAPSHOT));
    if (t && typeof t === 'object') TAGS_SNAPSHOT = t;
  } catch (e) {}
  let _snapSaveTimer = null;

  function scheduleSnapSave() {
    if (_snapSaveTimer) return;
    _snapSaveTimer = setTimeout(() => {
      _snapSaveTimer = null;
      try {
        localStorage.setItem(K_TAGS_SNAPSHOT, JSON.stringify(TAGS_SNAPSHOT));
      } catch (e) {}
    }, 1500);
  }

  let UNLOCKED_LYRICS = {};
  try {
    const u = JSON.parse(localStorage.getItem(K_UNLOCKED_LYRICS));
    if (u && typeof u === 'object') UNLOCKED_LYRICS = u;
  } catch (e) {}

  let TASKS = [];
  try {
    const t = JSON.parse(localStorage.getItem(K_TASKS));
    if (Array.isArray(t)) TASKS = t;
  } catch (e) {}

  function saveTasks() {
    try {
      localStorage.setItem(K_TASKS, JSON.stringify(TASKS));
    } catch (e) {}
  }

  let TASKS_LOCKED = '';
  try {
    TASKS_LOCKED = localStorage.getItem(K_TASKS_LOCKED) || '';
  } catch (e) {}

  let COUPONS = [];
  try {
    const c = JSON.parse(localStorage.getItem(K_COUPONS));
    if (Array.isArray(c)) COUPONS = c;
  } catch (e) {}

  function saveCoupons() {
    try {
      localStorage.setItem(K_COUPONS, JSON.stringify(COUPONS));
    } catch (e) {}
  }

  let COUPON_CLAIMED = '';
  try {
    COUPON_CLAIMED = localStorage.getItem(K_COUPON_CLAIMED) || '';
  } catch (e) {}

  let PRICE_OVERRIDES = {};
  try {
    const p = JSON.parse(localStorage.getItem(K_PRICE_OVERRIDES));
    if (p && typeof p === 'object') PRICE_OVERRIDES = p;
  } catch (e) {}

  function savePriceOverrides() {
    try {
      localStorage.setItem(K_PRICE_OVERRIDES, JSON.stringify(PRICE_OVERRIDES));
    } catch (e) {}
  }

  function checkDailyReset() {
    const today = new Date().toDateString();
    let lastDate = '';
    try {
      lastDate = localStorage.getItem(K_TASKS_DATE) || '';
    } catch (e) {}
    if (lastDate !== today) {
      TASKS.forEach((t) => {
        t.done = false;
        t.coverKey = '';
      });
      TASKS_LOCKED = '';
      COUPON_CLAIMED = '';
      try {
        localStorage.setItem(K_TASKS_DATE, today);
        localStorage.removeItem(K_TASKS_LOCKED);
        localStorage.removeItem(K_COUPON_CLAIMED);
      } catch (e) {}
      saveTasks();
    }
  }
  checkDailyReset(); // 页面加载时先跑一次，保证行为不变

  function saveOverrides() {
    try {
      localStorage.setItem(K_OVERRIDES, JSON.stringify(OVERRIDES));
    } catch (e) {}
  }

  /* ============ 工具 ============ */
  function hashStr(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++)
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function defaultCover(name) {
    const hue = hashStr(name) % 360;
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="hsl(' +
      hue +
      ',60%,80%)"/><text x="100" y="128" font-size="80" text-anchor="middle" fill="white" opacity="0.9">♪</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function defaultFavCover() {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ffd0e5"/><text x="100" y="135" font-size="90" text-anchor="middle" fill="white" opacity="0.9">♡</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function calcPrice(sizeBytes, ext) {
    const mb = sizeBytes / 1024 / 1024;
    const eff = ext === 'flac' ? mb / CONFIG.FLAC_DIVISOR : mb;
    return Math.max(1, Math.floor(eff) * CONFIG.PRICE_PER_MB);
  }

  function fileKey(name, size) {
    return name + '::' + size;
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c],
    );
  }

  function inAnyFav(key) {
    for (const name in FAVS) if (FAVS[name].indexOf(key) >= 0) return true;
    return false;
  }

  function cssEscape(s) {
    return String(s).replace(/["\\]/g, '\\$&');
  }

  function getDisplayPrice(song) {
    if (!song) return 0;
    if (PRICE_OVERRIDES[song.key] !== undefined) {
      return PRICE_OVERRIDES[song.key];
    }
    if (INVENTORY.catnip && INVENTORY.catnip.active && song.price > 0) {
      return song.price * 2;
    }
    return song.price;
  }

  function getRandomArtist(artistStr) {
    if (!artistStr) return '';
    const parts = artistStr
      .split(/[,，、\/&;；]/)
      .map((s) => s.trim())
      .filter((s) => s);
    if (parts.length === 0) return '';
    return parts[Math.floor(Math.random() * parts.length)];
  }

  /* ============ jsmediatags ============ */
  let _jsmediatagsPromise = null;

  function ensureJsmediatags() {
    if (window.jsmediatags) return Promise.resolve(true);
    if (_jsmediatagsPromise) return _jsmediatagsPromise;
    _jsmediatagsPromise = (async () => {
      const urls = [
        'https://cdn.jsdelivr.net/npm/jsmediatags@3.9.7/dist/jsmediatags.min.js',
        'https://unpkg.com/jsmediatags@3.9.7/dist/jsmediatags.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.7/jsmediatags.min.js',
      ];
      for (const url of urls) {
        try {
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = res;
            s.onerror = rej;
            document.head.appendChild(s);
          });
          if (window.jsmediatags) return true;
        } catch (e) {}
      }
      _jsmediatagsPromise = null; // ← 清掉缓存，下次还能重试
      return false;
    })();
    return _jsmediatagsPromise;
  }

  function readTags(file) {
    return new Promise((resolve) => {
      if (!window.jsmediatags) return resolve(null);
      try {
        window.jsmediatags.read(file, {
          onSuccess: (t) => resolve(t.tags || null),
          onError: () => resolve(null),
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function compressCover(pic) {
    return new Promise((resolve) => {
      let blob;
      try {
        const data = pic.data;
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        blob = new Blob([bytes], {
          type: pic.format || 'image/jpeg',
        });
      } catch (e) {
        return resolve(null);
      }
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.width,
            h = img.height;
          if (!w || !h) {
            URL.revokeObjectURL(url);
            return resolve(null);
          }
          if (w > h) {
            h = Math.round((h * CONFIG.COVER_MAX) / w);
            w = CONFIG.COVER_MAX;
          } else {
            w = Math.round((w * CONFIG.COVER_MAX) / h);
            h = CONFIG.COVER_MAX;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(
            (b) => {
              URL.revokeObjectURL(url);
              resolve(b || null);
            },
            'image/jpeg',
            CONFIG.COVER_QUALITY,
          );
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  /* ============ 网易云歌词 ============ */
  let LYRICS = {};
  try {
    const l = JSON.parse(localStorage.getItem('shop_lyrics_v4'));
    if (l && typeof l === 'object') LYRICS = l;
  } catch (e) {}

  function saveLyrics() {
    try {
      localStorage.setItem('shop_lyrics_v4', JSON.stringify(LYRICS));
    } catch (e) {}
  }

  function neteaseSearch(keyword) {
    return new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest !== 'function') return resolve([]);
      GM_xmlhttpRequest({
        timeout: 8000,
        ontimeout: () => resolve([]),
        method: 'GET',
        // 改为公开的搜索接口
        url:
          'https://music.163.com/api/search/get?s=' +
          encodeURIComponent(keyword) +
          '&type=1&offset=0&limit=5',
        headers: {
          // 只保留一个标准的浏览器 User-Agent
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText);
            resolve((data.result && data.result.songs) || []);
          } catch (e) {
            resolve([]);
          }
        },
      });
    });
  }

  function neteaseLyric(id) {
    return new Promise((resolve) => {
      const empty = {
        lrc: '',
        tlyric: '',
      };
      if (typeof GM_xmlhttpRequest !== 'function') return resolve(empty);
      GM_xmlhttpRequest({
        method: 'GET',
        // 歌词接口本身是公开的，参数保持不变即可
        url:
          'https://music.163.com/api/song/lyric?os=pc&id=' +
          id +
          '&lv=-1&kv=-1&tv=-1',
        headers: {
          // 只保留一个标准的浏览器 User-Agent
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText);
            resolve({
              lrc: (data.lrc && data.lrc.lyric) || '',
              tlyric: (data.tlyric && data.tlyric.lyric) || '',
            });
          } catch (e) {
            resolve(empty);
          }
        },
        timeout: 8000,
        ontimeout: () => resolve(empty),
        onerror: () => resolve(empty),
      });
    });
  }

  function parseLRC(lrc, tlyric) {
    if (!lrc) return [];
    const TAG_RE = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;
    const map = {};

    const extractTimes = (line) => {
      const times = [];
      let lastEnd = 0;
      let m;
      TAG_RE.lastIndex = 0;
      while ((m = TAG_RE.exec(line)) !== null) {
        if (m.index !== lastEnd) break;
        lastEnd = m.index + m[0].length;
        const min = parseInt(m[1], 10);
        const sec = parseInt(m[2], 10);
        const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
        times.push(min * 60 + sec + ms / 1000);
      }
      return {
        times,
        rest: line.slice(lastEnd).trim(),
      };
    };

    const META_RE =
      /^(作词|作曲|编曲|混音|母带|制作人|录音|吉他|贝斯|鼓|键盘|和声|配唱|监制|出品|发行|OP|SP|词|曲)\s*[:：]/;

    lrc.split('\n').forEach((line) => {
      const { times, rest } = extractTimes(line);
      if (!times.length || !rest) return;
      if (META_RE.test(rest)) return;
      times.forEach((time) => {
        const key = time.toFixed(2);
        if (!map[key])
          map[key] = {
            time,
            text: rest,
            trans: '',
          };
      });
    });

    if (tlyric) {
      tlyric.split('\n').forEach((line) => {
        const { times, rest } = extractTimes(line);
        if (!times.length || !rest) return;
        times.forEach((time) => {
          const key = time.toFixed(2);
          if (map[key]) map[key].trans = rest;
        });
      });
    }

    const result = Object.values(map);
    result.sort((a, b) => a.time - b.time);
    return result;
  }

  async function ensureLyrics(song) {
    if (!song) return null;
    const cached = LYRICS[song.key];
    // 如果本地有 .lrc，但缓存是之前网易云搜的，就忽略缓存，重新读本地
    const needLocalReload = song.lrcHandle && cached && !cached.local;
    if (cached && !needLocalReload) return cached;
    if (song._lyricLoading) return null;
    song._lyricLoading = true;
    try {
      // ① 优先读本地 .lrc
      if (song.lrcHandle) {
        try {
          const lrcFile = await song.lrcHandle.getFile();
          const text = await lrcFile.text();
          const parsed = parseLRC(text, '');
          if (parsed && parsed.length > 0) {
            LYRICS[song.key] = {
              local: true,
              lrc: text,
              _parsed: parsed,
            };
            saveLyrics();
            song._lyricLoading = false;
            return LYRICS[song.key];
          }
        } catch (e) {}
      }

      // ② 本地没有才走网易云
      const kw = (song.name || '') + ' ' + (song.artist || '');
      const results = await neteaseSearch(kw.trim());
      if (!results.length) {
        LYRICS[song.key] = {
          empty: true,
        };
        saveLyrics();
        return LYRICS[song.key];
      }
      const first = results[0];
      const lyricData = await neteaseLyric(first.id);
      if (!lyricData.lrc) {
        LYRICS[song.key] = {
          empty: true,
        };
      } else {
        LYRICS[song.key] = {
          neteaseId: first.id,
          title: first.name || '',
          artist:
            (first.artists && first.artists[0] && first.artists[0].name) || '',
          lrc: lyricData.lrc,
          tlyric: lyricData.tlyric,
          _parsed: parseLRC(lyricData.lrc, lyricData.tlyric),
        };
      }
      saveLyrics();
    } catch (e) {
      LYRICS[song.key] = {
        empty: true,
      };
      saveLyrics();
    }
    song._lyricLoading = false;
    return LYRICS[song.key];
  }
  function renderLyrics() {
    if (!magicUIEls || !magicUIEls.lyrics) return;
    const song = SONGS[currentIdx];
    if (!song) return;
    const el = magicUIEls.lyrics;

    if (!UNLOCKED_LYRICS[song.key]) {
      if (el._lyricKey !== '__locked__') {
        el._lyricKey = '__locked__';
        el.innerHTML =
          '<div class="magic-lyrics-empty">🔒 点击右侧箭头解锁</div>';
      }
      return;
    }
    const cache = LYRICS[song.key];
    if (!cache || cache.empty || !cache._parsed || !cache._parsed.length) {
      if (el._lyricKey !== '__empty__') {
        el._lyricKey = '__empty__';
        el.innerHTML = '<div class="magic-lyrics-empty">♪ 暂无歌词</div>';
      }
      return;
    }
    const audio = document.getElementById('shop-audio');
    if (!audio) return;
    const t = audio.currentTime || 0;
    const lines = cache._parsed;

    let idx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].time <= t) {
        idx = i;
        break;
      }
    }
    if (idx < 0) idx = 0;

    // 换歌：一次性渲染所有行
    if (el._lyricKey !== song.key) {
      el._lyricKey = song.key;
      el._lastIdx = -1;
      let html = '<div class="magic-lyrics-inner">';
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let inner =
          '<div class="magic-lyrics-text">' + escapeHtml(line.text) + '</div>';
        if (line.trans) {
          inner +=
            '<div class="magic-lyrics-trans">' +
            escapeHtml(line.trans) +
            '</div>';
        }
        html +=
          '<div class="magic-lyrics-line" data-idx="' +
          i +
          '">' +
          inner +
          '</div>';
      }
      html += '</div>';
      el.innerHTML = html;
      el._inner = el.querySelector('.magic-lyrics-inner');
      el._lines = el.querySelectorAll('.magic-lyrics-line');
    }

    if (el._lastIdx === idx) return;
    const prev = el._lines[el._lastIdx];
    if (prev) prev.classList.remove('active');
    el._lastIdx = idx;
    const cur = el._lines[idx];
    if (!cur) return;
    cur.classList.add('active');

    // 让当前行垂直居中：位移 = 容器中心 - 当前行中心
    const containerH = el.clientHeight || 110;
    const targetY = containerH / 2 - (cur.offsetTop + cur.offsetHeight / 2);
    el._inner.style.transform = 'translateY(' + targetY + 'px)';
  }

  /* ============ 道具定义 ============ */
  const ITEMS = [
    {
      id: 'catnip',
      name: '猫薄荷',
      emoji: '🌿',
      price: 30,
      type: 'toggle',
      desc: '开启学魔模式～\n店铺所有价格翻倍喵！',
      tag: '学魔',
    },
    {
      id: 'rainbow',
      name: '缤纷老板',
      emoji: '🌈',
      price: 30,
      type: 'toggle',
      desc: '老板喵变成色素喵～\n会不停换颜色哦！',
      tag: '炫彩',
    },
    {
      id: 'symphony',
      name: '交响乐蛋糕',
      emoji: '🎂',
      price: 30,
      type: 'permanent',
      desc: '解锁播放模式切换～\n单曲/列表/随机/顺序',
      tag: '永久',
    },
    {
      id: 'magicstar',
      name: '魔法乐星',
      emoji: '🌟',
      price: 150,
      type: 'toggle',
      desc: '美化音乐播放栏～\n按钮发光，界面更精致',
      tag: '美化',
    },
    {
      id: 'hidecoins',
      name: '心理良药',
      emoji: '🙈',
      price: 60,
      type: 'toggle',
      desc: '开启后学币值隐藏汪(怎么变狗了喵)\n每30分钟偷偷加5~10币',
      tag: '激励',
    },
    {
      id: 'lyricpass',
      name: '启页券',
      emoji: '🎫',
      price: 3,
      type: 'consumable',
      desc: '一张券解锁一首歌的歌词页\n一次性消耗品，需搭配魔法乐星使用！',
      tag: '消耗',
    },
    {
      id: 'audioviz',
      name: '律动音谱',
      emoji: '📊',
      price: 30,
      type: 'toggle',
      desc: '展开播放器显示音频频谱\n纯音乐也能跳动起来！',
      tag: '可视化',
    },
    {
      id: 'audiorainbow',
      name: '彩虹律动',
      emoji: '🌈',
      price: 20,
      type: 'toggle',
      desc: '让频谱柱子变成彩色\n跟着音乐一起彩虹！\n（需要先开律动音谱）',
      tag: '叠加',
    },
    {
      id: 'catsing',
      name: '老板歌声延长',
      emoji: '🎤',
      price: 10,
      type: 'stackable',
      desc: '每买 1 次永久 +1 秒\n唱歌总时长最多 60 秒\n在「道具」界面滑动调节',
      tag: '叠加',
    },
    {
      id: 'bing',
      name: '饼',
      emoji: '🥞',
      price: 1,
      type: 'consumable',
      desc: '根本没有这种饼！',
      tag: '雷霆',
    },
    {
      id: 'catfullsong',
      name: '老板完整唱一首',
      emoji: '🎶',
      price: 10,
      type: 'consumable',
      desc: '让猫老板完整唱一首歌！\n使用后可以从已购歌曲里选一首\n猫老板会从头唱到尾喵～\n（切页面/关面板会停止，钱不退捏）',
      tag: '演唱会',
    },
    {
      id: 'artpalace',
      name: '艺术殿堂',
      emoji: '🏛️',
      price: 300,
      type: 'permanent',
      desc: '解锁艺术殿堂喵～\n沉浸式入堂沐浴艺术喵\n据说百分之...？的人是奔着这个来的？\n这里是不是该放个广告位招租...？\n内部需 5 学币换取一部艺术品！',
      tag: '殿堂',
    },
  ];

  /* ============ 猫老板台词池 ============ */
  const CAT_LINES = [
    // —— 日常／通用 ——
    {
      face: '(=^･ω･^=)',
      text: '喵～今天也要好好学习哦！',
    },
    {
      face: '(=^‥^=)',
      text: '本喵努力营业中！',
    },
    {
      face: '(=^ω^=)',
      text: '喵喵正在忙～请稍等',
    },
    {
      face: '(=◕‿◕=)',
      text: '今天的喵喵也很努力！',
    },
    {
      face: '(=╹ω╹=)',
      text: '学币！学币！学币！？',
    },
    {
      face: '(=｀ω´=)',
      text: '呼——喵喵打了个哈欠',
    },
    {
      face: '(=Φ x Φ=)',
      text: '喂喂，别忘了学习喵！',
    },
    {
      face: '(=.-ω-.=)',
      text: '喵喵已经困了……zZ',
    },
    {
      face: '(=⊙ω⊙=)',
      text: '咦？客人sama来了？',
    },
    {
      face: '(=ᵔᴥᵔ=)',
      text: '喵喵的猫咪雷达探测到你了～',
    },
    {
      face: '(=￣▽￣=)',
      text: '本喵是这条gai最靓的喵！',
    },
    {
      face: '(=^◕ᴥ◕^=)',
      text: '本猫正在思考赛博前途...？',
    },
    {
      face: '(=^･ｪ･^=)',
      text: '喵喵在试图猜测你的MBTI～',
    },
    {
      face: '(=๑•ω•๑=)',
      text: '今天也是想睡觉的一天喵～',
    },
    {
      face: '(=◕ω◕=)',
      text: '你该不会偷偷在玩手机吧喵...',
    },
    {
      face: '(=^⋅ω⋅^=)',
      text: '不管怎样，喵喵都爱你～',
    },
    {
      face: '(=ↀωↀ=)',
      text: '那当然喵～',
    },
    {
      face: '(=ↀᴥↀ=)',
      text: '有道理喵！',
    },
    {
      face: '(=✧ω✧=)',
      text: '太棒了喵～',
    },
    {
      face: '(=•̀ω•́=)',
      text: '喵喵觉得很赞',
    },
    {
      face: '(=★ω★=)',
      text: '我看神未必有本喵忧郁',
    },
    {
      face: '(=ＵωＵ=)',
      text: '喵呜～',
    },
    {
      face: '(=￣ω￣=)',
      text: '猫咪学习到生病还要硬撑(打一品牌)好冷的笑话喵～',
    },
    {
      face: '(=^‥^=)',
      text: '嗯嗯～喵喵懂了',
    },
    {
      face: '(=◕‿◕=)',
      text: '这句话喵喵爱听～',
    },
    {
      face: '(=^ω^=)',
      text: '说得好喵～',
    },
    {
      face: '(=✧ω✧=)',
      text: '有点厉害喵！',
    },
    {
      face: '(=╹ω╹=)',
      text: '喵喵点头赞同～',
    },
    {
      face: '(=^･ω･^=)',
      text: '有喵在，不孤单喵～',
    },
    {
      face: '(=ↀωↀ=)',
      text: '喵喵今天心情不错！',
    },

    // —— 招呼用户 ——
    {
      face: '(=^･ω･^=)',
      text: '{user}，今天学习了吗？',
    },
    {
      face: '(=^‥^=)',
      text: '诶，{user}，你也来啦～',
    },
    {
      face: '(=◕‿◕=)',
      text: '{user}，看你这么努力，喵喵很欣慰',
    },
    {
      face: '(=^ω^=)',
      text: '{user}，要不要看看这些...雷霆道具？',
    },
    {
      face: '(=^･ｪ･^=)',
      text: '喵呜～{user}，好久不见',
    },
    {
      face: '(=╹ω╹=)',
      text: '{user}，作业写完了吗？',
    },
    {
      face: '(=◕ω◕=)',
      text: '{user}，学币攒了多少了呀？',
    },
    {
      face: '(=^⋅ω⋅^=)',
      text: '{user}，今天要来点艺术疗愈吗喵？',
    },
    {
      face: '(=˘ω˘=)',
      text: '{user}，你要不要休息一下眼睛？',
    },
    {
      face: '(=๑•ω•๑=)',
      text: '{user}，喵喵最喜欢你了～',
    },
    {
      face: '(=^◕ᴥ◕^=)',
      text: '{user}，要不要来点猫薄荷提提神？',
    },
    {
      face: '(=｀ω´=)',
      text: '我说{user}啊，学习也是要劳逸结合的喵',
    },
    {
      face: '(=^ω^=)',
      text: '{user}，收藏夹又满了嘛？',
    },
    {
      face: '(=￣ω￣=)',
      text: '{user}，别忘了偶尔也娱乐一下喵',
    },
    {
      face: '(=★ω★=)',
      text: '{user}，喵喵给你准备了新东西哦',
    },
    {
      face: '(=◕‿◕=)',
      text: '{user}，今天想听什么歌呀？',
    },
    {
      face: '(=^‥^=)',
      text: '{user}，喵喵一直在等你哦',
    },
    {
      face: '(=^･ω･^=)',
      text: '{user}，今晚也要早点睡喵～',
    },

    // —— 提到歌曲 ——
    {
      face: '(=◕ω◕=)',
      text: '诶，{user}，你也有《{song}》啊，品味不错喵～',
    },
    {
      face: '(=★ω★=)',
      text: '{user}，《{song}》这是某个动画的主题曲吗喵?',
    },
    {
      face: '(=⊙ω⊙=)',
      text: '喵～发现你收藏了《{song}》，意外的有品位！',
    },
    {
      face: '(=✧ω✧=)',
      text: '刚发现你有《{song}》，太让我意外了吧！',
    },
    {
      face: '(=^◕ᴥ◕^=)',
      text: '{user}，你居然听《{song}》！',
    },
    {
      face: '(=^ω^=)',
      text: '《{song}》这首歌，喵喵也超喜欢喵～',
    },
    {
      face: '(=^･ｪ･^=)',
      text: '{user}，最近单曲循环《{song}》吗？',
    },
    {
      face: '(=◕‿◕=)',
      text: '你也听《{song}》啊，我们是一类人喵！',
    },
    {
      face: '(=๑•ω•๑=)',
      text: '{user}，《{song}》的旋律真的太美了喵',
    },
    {
      face: '(=˘ω˘=)',
      text: '咦？《{song}》也在你的曲库里呀～',
    },
    {
      face: '(=╹ω╹=)',
      text: '{user}，要不要试试《{song}》？',
    },
    {
      face: '(=.-ω-.=)',
      text: '喵喵突然想听《{song}》了～',
    },
    {
      face: '(=^⋅ω⋅^=)',
      text: '《{song}》前奏一响，喵喵就沦陷了',
    },
    {
      face: '(=￣▽￣=)',
      text: '{user}，《{song}》这歌名好特别喵～',
    },
    {
      face: '(=^‥^=)',
      text: '听到《{song}》，喵喵想起了一些事喵',
    },
    {
      face: '(=◕ω◕=)',
      text: '{user}，《{song}》应该配奶茶听喵～',
    },
    {
      face: '(=｀ω´=)',
      text: '如果下雨天，放《{song}》最合适不过了',
    },
    {
      face: '(=★ω★=)',
      text: '{user}，推荐你单曲循环《{song}》',
    },
    {
      face: '(=⊙ω⊙=)',
      text: '《{song}》！这首喵喵听过！',
    },
    {
      face: '(=✧ω✧=)',
      text: '{user}，《{song}》的风格好独特喵～',
    },
    {
      face: '(=^ω^=)',
      text: '喵喵刚发现你有《{song}》，太厉害了！',
    },
    {
      face: '(=^･ｪ･^=)',
      text: '《{song}》这首，喵喵收藏了好久啦',
    },
    {
      face: '(=๑•ω•๑=)',
      text: '{user}，什么时候一起听《{song}》？',
    },
    {
      face: '(=˘ω˘=)',
      text: '唔，{user}的《{song}》，喵喵也想听听看',
    },

    // —— 提到歌手 ——
    {
      face: '(=✧ω✧=)',
      text: '喵～发现你还听 {artist} 的歌！',
    },
    {
      face: '(=★ω★=)',
      text: '{artist} 的作品真的很有味道喵',
    },
    {
      face: '(=^◕ᴥ◕^=)',
      text: '原来 {user} 也喜欢 {artist} 呀',
    },
    {
      face: '(=◕ω◕=)',
      text: '喵喵也超喜欢 {artist} 呢～',
    },
    {
      face: '(=^ω^=)',
      text: '{artist} 的歌，喵喵百听不厌喵',
    },
    {
      face: '(=⊙ω⊙=)',
      text: '哎呀，你还听 {artist}！眼光不错喵',
    },
    {
      face: '(=๑•ω•๑=)',
      text: '{user}，{artist} 的歌你最喜欢哪首？',
    },
    // —— 反思 / 吐槽 ——
    {
      face: '(=￣ω￣=)',
      text: '分数不是尺子，量不出一个人的全部喵',
    },
    {
      face: '(=ↀωↀ=)',
      text: '有些排名什么的其实啥意义也没有喵，你千万别被糊弄了喵',
    },
    {
      face: '(=⊙ω⊙=)',
      text: '学习是为了看见更大的世界，不是为了踩过别人喵',
    },
    {
      face: '(=◕ω◕=)',
      text: '你不需要用成绩证明自己值得被爱喵',
    },
    {
      face: '(=￣ω￣=)✧',
      text: '你是宝藏你是天使你是~',
    },

    // —— 没音乐 ——
    {
      face: '(=╥ω╥=)',
      text: '同学你再不收录曲子我要吃不起饭啦喵！！！',
    },
  ];

  const CAT_LINES_LONGNAME = [
    {
      face: '(=^‥^=)',
      text: '内个名字很长的同学，你好呀喵～',
    },
    {
      face: '(=⊙ω⊙=)',
      text: '哟，名字好长的那位同学，又来啦？',
    },
    {
      face: '(=;ω;=)',
      text: '那个名字很长的同学……喵喵念不完喵',
    },
    {
      face: '(=╹ω╹=)',
      text: '名字好长的同学，喵喵记住你了',
    },
    {
      face: '(=^◕ᴥ◕^=)',
      text: '那位名字很长的同学，今天也要加油喵',
    },
  ];
  const CAT_LINES_SEARCH_HINT = [
    {
      face: '(=^･ω･^=)',
      text: '{hint}？这是什么喵？',
    },
    {
      face: '(=⊙ω⊙=)',
      text: '喵？{hint}……是什么意思呀',
    },
    {
      face: '(=^･ｪ･^=)',
      text: '{hint}？喵喵好像见过又好像没见过喵',
    },
    {
      face: '(=✧ω✧=)',
      text: '咦，{hint}？听起来好厉害喵～',
    },
    {
      face: '(=￣ω￣=)',
      text: '{hint}……喵喵去搜一下好了',
    },
    {
      face: '(=๑•ω•๑=)',
      text: '喵喵刚刚看到「{hint}」了哦',
    },
    {
      face: '(=◕ω◕=)',
      text: '「{hint}」？喵喵念一遍都觉得新奇',
    },
    {
      face: '(=★ω★=)',
      text: '{hint}……今天搜索栏上的字好奇怪喵',
    },
  ];
  const CAT_LINES_AVATAR = [
    { face: '(=◕ω◕=)', text: '喵喵偷偷看了你的头像……真好喵～' },
    { face: '(=✧ω✧=)', text: '你的头像里藏了什么秘密？喵喵想知道！' },
    { face: '(=^◕ᴥ◕^=)', text: '喵～头像！？喵喵一眼就发现了哦' },
    { face: '(=★ω★=)', text: '这个头像……喵喵给满分喵！' },
    { face: '(=๑•ω•๑=)', text: '喵喵盯着你的头像看了好久，好有感觉喵' },
    { face: '(=￣ω￣=)✧', text: '我把世上最棒的头像找来了喵～' },
    { face: '(=⊙ω⊙=)', text: '咦？你的头像让喵喵想起了一件事……算了不说了喵' },
    { face: '(=｀ω´=)', text: '头像选得好，学习没烦恼喵！' },
    { face: '(=╹ω╹=)', text: '喵喵把你的头像画下来贴在了小站的墙上喵～' },
  ];

  /* ============ 私货台词 ============ */

  // 🎌 节日台词（日期格式：月-日）
  const CAT_LINES_FESTIVAL = {
    '1-1': [
      {
        face: '(=^･ω･^=)',
        text: '元旦快乐喵～新的一年也要好好加油哦',
      },
    ],
    '2-14': [
      {
        face: '(=๑•ω•๑=)',
        text: '情人节快乐喵～今天有没有喜欢的人呀？',
      },
    ],
    '12-25': [
      {
        face: '(=^◕ᴥ◕^=)',
        text: '圣诞快乐喵～有收到礼物吗？',
      },
    ],
    '12-31': [
      {
        face: '(=￣ω￣=)',
        text: '跨年夜喵～今年的愿望实现了吗？',
      },
    ],
  };

  // 🐱
  const CAT_LINES_CHARACTER = [
    {
      match: ['哆啦A梦', '哆啦a梦'],
      line: {
        face: '(=^･ω･^=)',
        text: '{name}同学，你要去找你的大雄君了吗(˶ ¯ ꇴ ¯ ˶)',
      },
    },
    {
      match: ['ドラえもん'],
      line: {
        face: '(=^･ω･^=)',
        text: '{name}同学，你要去找のび太君了吗(˶ ¯ ꇴ ¯ ˶)',
      },
    },
    {
      match: ['野比大雄'],
      line: {
        face: '(=๑•ω•๑=)',
        text: '{name}同学，你要去找你的哆啦A梦~了吗(˶ ¯ ꇴ ¯ ˶)',
      },
    },
    {
      match: ['野比のび太', 'のび太'],
      line: {
        face: '(=๑•ω•๑=)',
        text: '{name}同学，你要去找ドラえもん了吗(˶ ¯ ꇴ ¯ ˶)',
      },
    },
  ];

  // 👁 护眼提醒台词（归到通用池里随机出现）
  const CAT_LINES_EYE_CARE = [
    {
      face: '(=˘ω˘=)',
      text: '记得眨眼喵～眼睛干了要休息一下',
    },
    {
      face: '(=.-ω-.=)',
      text: '喵喵提醒你：该看看窗外啦，20秒就够',
    },
    {
      face: '(=￣ω￣=)',
      text: '屏幕看久了眼睛会累的喵，揉揉眼睛吧',
    },
    {
      face: '(=ↀωↀ=)',
      text: '20-20-20 法则：每20分钟看20米外20秒喵',
    },
    {
      face: '(=^‥^=)',
      text: '别熬夜喵～眼睛也需要睡觉的',
    },
  ];

  const CAT_LINES_NOMUSIC = ['同学你再不收录曲子我要吃不起饭啦喵！！！'];
  /* ============ CSS ============ */
  const CSS = `
@keyframes shop-pop{0%{transform:scale(0.9);opacity:0;}100%{transform:scale(1);opacity:1;}}
@keyframes shop-sparkle{0%,100%{opacity:0.55;transform:scale(1);}50%{opacity:1;transform:scale(1.18);}}
@keyframes shop-float{0%,100%{transform:translateY(0);}50%{transform:translateY(-4px);}}
@keyframes catRainbow{0%{filter:hue-rotate(0deg) saturate(1.6);}100%{filter:hue-rotate(360deg) saturate(1.6);}}
@keyframes neonPop{
  0%{transform:translate(-50%,-50%) scale(0.3);opacity:0;}
  20%{transform:translate(-50%,-50%) scale(1.15);opacity:1;}
  40%{transform:translate(-50%,-50%) scale(1);opacity:1;}
  85%{transform:translate(-50%,-50%) scale(1);opacity:1;}
  100%{transform:translate(-50%,-50%) scale(1.2);opacity:0;}
}

@keyframes magicNeonPulse{
  0%,100%{box-shadow:0 0 8px var(--mp-color1,#ffb8d9),
                     0 0 18px var(--mp-color2,#c8a2ff),
                     0 4px 16px rgba(0,0,0,0.4);}
  50%    {box-shadow:0 0 16px var(--mp-color1,#ffb8d9),
                     0 0 36px var(--mp-color2,#c8a2ff),
                     0 4px 16px rgba(0,0,0,0.4);}
}

@keyframes magicGlow{
  0%,100%{box-shadow:0 0 8px currentColor, 0 0 16px currentColor;}
  50%{box-shadow:0 0 14px currentColor, 0 0 28px currentColor;}
}

/* ===== 默认主题：樱花粉 ===== */
#shop-panel{
  --t-c1:#ffb8d9; --t-c2:#e3a5f5; --t-c3:#c8a2ff;
  --t-main:#ff7eb3;
  --t-bg1:#fff8fc; --t-bg2:#f3ecff; --t-bg3:#e8f6ff;
  --t-border:#ffb8d9; --t-border-light:#ffd0e5;
  --t-soft:#fff0f7;
  --t-glow:rgba(255,150,200,0.45);
  --t-hover:rgba(255,150,200,0.5);
  position:fixed;right:20px;bottom:20px;width:480px;max-height:92vh;
  background:linear-gradient(160deg,var(--t-bg1) 0%,var(--t-bg2) 55%,var(--t-bg3) 100%);
  border:3px solid var(--t-border);border-radius:22px;
  box-shadow:0 12px 42px var(--t-glow),0 0 0 1px rgba(255,255,255,0.9) inset,0 0 30px var(--t-glow);
  font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  font-size:12px;color:#6b4a6b;z-index:2147483647;
  display:flex;flex-direction:column;overflow:hidden;user-select:none;
  animation:shop-pop 0.35s cubic-bezier(0.34,1.56,0.64,1);}
#shop-panel.shop-hidden{display:none !important;}

/* ===== 主题 ===== */
#shop-panel[data-theme="miku"]{--t-c1:#39c5bb;--t-c2:#1dd1a1;--t-c3:#66e0c8;--t-main:#2aaba1;
  --t-bg1:#f0fdfb;--t-bg2:#e0f7f4;--t-bg3:#e0f5f8;--t-border:#39c5bb;--t-border-light:#a8e6df;
  --t-soft:#e0f7f4;--t-glow:rgba(57,197,187,0.4);--t-hover:rgba(57,197,187,0.5);}
#shop-panel[data-theme="bili"]{--t-c1:#fb7299;--t-c2:#ff9bc1;--t-c3:#23ade5;--t-main:#fb7299;
  --t-bg1:#fff5f8;--t-bg2:#f5f9ff;--t-bg3:#e6f4ff;--t-border:#fb7299;--t-border-light:#ffc4d6;
  --t-soft:#ffe8f0;--t-glow:rgba(251,114,153,0.45);--t-hover:rgba(251,114,153,0.5);}
#shop-panel[data-theme="starry"]{--t-c1:#5b8ff9;--t-c2:#a78bfa;--t-c3:#c8a2ff;--t-main:#7c6aff;
  --t-bg1:#f5f7ff;--t-bg2:#ecefff;--t-bg3:#f0eaff;--t-border:#a78bfa;--t-border-light:#d5c8ff;
  --t-soft:#f0ecff;--t-glow:rgba(140,120,255,0.4);--t-hover:rgba(140,120,255,0.5);}
#shop-panel[data-theme="mint"]{--t-c1:#a8e6cf;--t-c2:#7fcd91;--t-c3:#5ab7b0;--t-main:#5ab77a;
  --t-bg1:#f5fdf8;--t-bg2:#e8f8ee;--t-bg3:#e6f6f4;--t-border:#7fcd91;--t-border-light:#c2e8ce;
  --t-soft:#e8f8ee;--t-glow:rgba(127,205,145,0.4);--t-hover:rgba(127,205,145,0.5);}
#shop-panel[data-theme="sunset"]{--t-c1:#ff9966;--t-c2:#ffb84d;--t-c3:#ff7eb3;--t-main:#ff8c42;
  --t-bg1:#fffaf5;--t-bg2:#fff2e6;--t-bg3:#ffe8d9;--t-border:#ffb84d;--t-border-light:#ffd6a8;
  --t-soft:#fff2e6;--t-glow:rgba(255,150,100,0.4);--t-hover:rgba(255,150,100,0.5);}
#shop-panel[data-theme="concept"]{--t-c1:#6bc5ff;--t-c2:#a3dbff;--t-c3:#4a9eff;--t-main:#3d9fff;
  --t-bg1:#f5fbff;--t-bg2:#e8f5ff;--t-bg3:#dcefff;--t-border:#6bc5ff;--t-border-light:#c5e3ff;
  --t-soft:#e8f5ff;--t-glow:rgba(107,197,255,0.42);--t-hover:rgba(107,197,255,0.5);}
#shop-panel[data-theme="doraemon"]{--t-c1:#1296db;--t-c2:#4ab8f0;--t-c3:#FFF68F;--t-main:#0d7bc4;
  --t-bg1:#f0f8ff;--t-bg2:#e0f0ff;--t-bg3:#fff8e0;--t-border:#1296db;--t-border-light:#a8d8f0;
  --t-soft:#e0f0ff;--t-glow:rgba(18,150,219,0.42);--t-hover:rgba(18,150,219,0.5);}
#shop-panel[data-theme="dark"]{--t-c1:#2e2e2e;--t-c2:#222222;--t-c3:#0a0a0a;--t-main:#ffffff;
  --t-bg1:#000;--t-bg2:#0a0a0a;--t-bg3:#000;--t-border:#2e2e2e;--t-border-light:#1e1e1e;
  --t-soft:#141414;--t-glow:rgba(255,255,255,0.18);--t-hover:rgba(255,255,255,0.3);color:#fff;}
#shop-panel[data-theme="pure"]{--t-c1:#e8e8ee;--t-c2:#f2f2f6;--t-c3:#d8d8e0;--t-main:#7a7a90;
  --t-bg1:#fff;--t-bg2:#fafafc;--t-bg3:#f5f5f8;--t-border:#d8d8e0;--t-border-light:#ececf0;
  --t-soft:#f5f5f8;--t-glow:rgba(0,0,0,0.06);--t-hover:rgba(160,160,180,0.3);color:#333344;}

/* ===== 深黑适配 ===== */
#shop-panel[data-theme="dark"] .shop-coin-area{background:rgba(255,255,255,0.03);}
#shop-panel[data-theme="dark"] .song-card,
#shop-panel[data-theme="dark"] .shop-fav-card,
#shop-panel[data-theme="dark"] .shop-item-card,
#shop-panel[data-theme="dark"] .shop-inv-item{background:#0a0a0a;border-color:#1e1e1e;}
#shop-panel[data-theme="dark"] .song-meta,
#shop-panel[data-theme="dark"] .shop-fav-info{background:#0a0a0a;}
#shop-panel[data-theme="dark"] .song-name,
#shop-panel[data-theme="dark"] .shop-fav-name,
#shop-panel[data-theme="dark"] .shop-player-title,
#shop-panel[data-theme="dark"] .shop-fav-title,
#shop-panel[data-theme="dark"] .shop-item-name,
#shop-panel[data-theme="dark"] .shop-inv-name{color:#fff;}
#shop-panel[data-theme="dark"] .song-artist,
#shop-panel[data-theme="dark"] .shop-player-artist,
#shop-panel[data-theme="dark"] .shop-item-desc,
#shop-panel[data-theme="dark"] .shop-inv-status{color:#8a8a8a;}
#shop-panel[data-theme="dark"] .shop-folder-info{color:#8a8a8a;}
#shop-panel[data-theme="dark"] .shop-nav-btn,
#shop-panel[data-theme="dark"] .shop-btn-secondary,
#shop-panel[data-theme="dark"] .shop-back-btn,
#shop-panel[data-theme="dark"] .shop-rename-btn{background:#0a0a0a;color:#d0d0d0;border-color:#2e2e2e;}
#shop-panel[data-theme="dark"] .shop-search-box{background:#0a0a0a;color:#fff;border-color:#2e2e2e;}
#shop-panel[data-theme="dark"] .shop-search-box::placeholder{color:#5a5a5a;}
#shop-panel[data-theme="dark"] .shop-player{background:rgba(0,0,0,0.95);border-top-color:#1e1e1e;}
#shop-panel[data-theme="dark"] .shop-footer{color:#5a5a5a;}
#shop-panel[data-theme="dark"] .shop-today,
#shop-panel[data-theme="dark"] .shop-coin-label,
#shop-panel[data-theme="dark"] .shop-study-status,
#shop-panel[data-theme="dark"] .shop-progress-text{color:#8a8a8a;}
#shop-panel[data-theme="dark"] .shop-fav-new-card{background:linear-gradient(135deg,#0a0a0a,#000);color:#fff;border-color:#2e2e2e;}
#shop-panel[data-theme="dark"] .shop-empty{color:#5a5a5a;}
#shop-panel[data-theme="dark"] .shop-fav-menu,
#shop-panel[data-theme="dark"] .shop-theme-menu,
#shop-panel[data-theme="dark"] .shop-playlist{background:#0a0a0a;border-color:#2e2e2e;}
#shop-panel[data-theme="dark"] .shop-fav-menu-item,
#shop-panel[data-theme="dark"] .shop-theme-item{color:#fff;}
#shop-panel[data-theme="dark"] .song-fav-btn{background:rgba(255,255,255,0.12);color:#fff;}
#shop-panel[data-theme="dark"] .song-fav-btn.active{background:rgba(255,255,255,0.9);color:#000;}
#shop-panel[data-theme="dark"] .shop-fav-act{background:rgba(30,30,30,0.95);color:#fff;}
#shop-panel[data-theme="dark"] .song-lock-price{text-shadow:0 0 10px #fff,0 0 20px #fff,0 2px 4px rgba(0,0,0,0.95);}
#shop-panel[data-theme="dark"] .song-lock-unit{color:#e0e0e0;text-shadow:0 0 6px #fff,0 1px 2px rgba(0,0,0,0.95);}
#shop-panel[data-theme="dark"] .shop-cat-box{background:linear-gradient(135deg,#0a0a0a,#141414);border-color:#2e2e2e;}
#shop-panel[data-theme="dark"] .shop-cat-bubble{background:#0a0a0a;color:#fff;border-color:#2e2e2e;}
#shop-panel[data-theme="dark"] .shop-cat-bubble::after{border-bottom-color:#0a0a0a;}
#shop-panel[data-theme="dark"] .shop-username-input{background:#0a0a0a;color:#fff;border-color:#2e2e2e;}
#shop-panel[data-theme="dark"] .shop-item-action.owned{background:#0a0a0a;color:#ffd166;border-color:#ffd166;}

/* ===== 弹层深色适配（挂在 body 上的） ===== */
.shop-fav-menu[data-parent-theme="dark"],
.shop-theme-menu[data-parent-theme="dark"],
.shop-playlist[data-parent-theme="dark"],
.shop-confirm-mask[data-parent-theme="dark"] .shop-confirm-box,
.shop-toast[data-parent-theme="dark"]{
  background:#0a0a0a;color:#fff;border-color:#2e2e2e;
}
.shop-fav-menu[data-parent-theme="dark"] .shop-fav-menu-title,
.shop-theme-menu[data-parent-theme="dark"] .shop-theme-menu-title,
.shop-playlist[data-parent-theme="dark"] .shop-playlist-title,
.shop-confirm-mask[data-parent-theme="dark"] .shop-confirm-title{
  color:#fff;border-bottom-color:#2e2e2e;
}
.shop-fav-menu[data-parent-theme="dark"] .shop-fav-menu-item,
.shop-theme-menu[data-parent-theme="dark"] .shop-theme-item,
.shop-playlist[data-parent-theme="dark"] .shop-playlist-item,
.shop-confirm-mask[data-parent-theme="dark"] .shop-confirm-content{
  color:#d0d0d0;
}
.shop-fav-menu[data-parent-theme="dark"] .shop-fav-menu-item:hover,
.shop-theme-menu[data-parent-theme="dark"] .shop-theme-item:hover,
.shop-playlist[data-parent-theme="dark"] .shop-playlist-item:hover{
  background:#1a1a1a;color:#fff;
}
.shop-confirm-mask[data-parent-theme="dark"] .shop-confirm-cancel{
  background:#1a1a1a;color:#8a8a8a;
}
.shop-toast[data-parent-theme="dark"]{
  background:linear-gradient(135deg,#3a3a3a,#1a1a1a);
  color:#fff;
}

/* ===== 深色主题按钮文字修复 ===== */
#shop-panel[data-theme="dark"] .shop-item-action:not(.owned):not(.permanent):not(.on),
#shop-panel[data-theme="dark"] .shop-playall-btn,
#shop-panel[data-theme="dark"] .shop-confirm-ok,
#shop-panel[data-theme="dark"] .shop-inv-use,
#shop-panel[data-theme="dark"] .shop-btn-primary,

#shop-panel[data-theme="dark"] .shop-toast{
  color:#000;
  text-shadow:none;
}
.shop-toast[data-parent-theme="dark"]{
  color:#000 !important;
  text-shadow:none !important;
}

/* ===== 头部 ===== */
.shop-header{background:linear-gradient(135deg,var(--t-c1) 0%,var(--t-c2) 50%,var(--t-c3) 100%);
color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;
cursor:move;text-shadow:0 2px 5px rgba(0,0,0,0.28);flex-shrink:0;gap:8px;}
.shop-title{font-size:14px;font-weight:700;flex-shrink:0;}
.shop-title .sub{font-size:8px;font-weight:400;opacity:.85;letter-spacing:2px;display:block;margin-top:1px;}
.shop-header-left{display:flex;align-items:center;gap:4px;flex-shrink:0;}
.shop-about-btn{cursor:pointer;font-size:13px;line-height:1;padding:3px 6px;border-radius:8px;
  transition:all .2s;opacity:.85;text-shadow:none;}
.shop-about-btn:hover{background:rgba(255,255,255,.3);opacity:1;}
.shop-header-right{display:flex;align-items:center;gap:5px;flex-shrink:0;}
.shop-username-wrap{position:relative;flex-shrink:0;}
.shop-username-input{width:100px;padding:4px 8px;border:1.5px solid rgba(255,255,255,0.5);
  border-radius:8px;background:rgba(255,255,255,0.22);color:#fff;font-size:11px;
  font-family:inherit;outline:none;text-shadow:none;letter-spacing:0;
  transition:all .2s;box-sizing:border-box;}
.shop-username-input::placeholder{color:rgba(255,255,255,0.6);}
.shop-username-input:focus{background:rgba(255,255,255,0.35);border-color:rgba(255,255,255,0.9);}
.shop-username-suffix{position:absolute;right:-30px;top:50%;transform:translateY(-50%);
  font-size:10px;color:rgba(255,255,255,0.85);font-weight:600;pointer-events:none;
  text-shadow:0 1px 2px rgba(0,0,0,0.3);white-space:nowrap;}
.shop-theme-btn,.shop-min-btn{cursor:pointer;font-size:15px;line-height:1;padding:4px 6px;
  border-radius:8px;transition:all .2s;text-shadow:none;}
.shop-theme-btn:hover,.shop-min-btn:hover{background:rgba(255,255,255,.3);}

/* ===== 学币区 ===== */
.shop-coin-area{padding:10px 16px 8px;background:rgba(255,255,255,.7);border-bottom:1px dashed var(--t-border-light);flex-shrink:0;}
.shop-coin-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.shop-coin-display{display:flex;align-items:baseline;gap:4px;}
.shop-coin-icon{font-size:18px;animation:shop-sparkle 2s ease-in-out infinite;filter:drop-shadow(0 0 6px var(--t-glow));}
.shop-coin-num{font-size:24px;font-weight:800;color:var(--t-main);text-shadow:0 2px 8px var(--t-glow);font-family:Consolas,monospace;}
.shop-coin-label{font-size:10px;color:#b59ac9;font-weight:600;}
.shop-today{font-size:10px;color:#b59ac9;background:var(--t-soft);padding:2px 8px;border-radius:10px;border:1px solid var(--t-border-light);}
.shop-study-status{display:flex;align-items:center;gap:8px;font-size:11px;color:#9a7fae;}
.shop-study-text{flex-shrink:0;min-width:0;flex:0 0 auto;}
.shop-study-mark{
  padding:3px 10px;border-radius:10px;
  background:var(--t-soft);color:var(--t-main);
  border:1.5px solid var(--t-border-light);
  font-family:inherit;font-size:10px;font-weight:700;
  cursor:pointer;transition:all .2s;flex-shrink:0;
  letter-spacing:.5px;white-space:nowrap;
}
.shop-study-mark:hover{background:var(--t-border-light);}
.shop-study-mark.on{
  background:linear-gradient(90deg,var(--t-c1),var(--t-c3));
  color:#fff;border-color:var(--t-c1);
  box-shadow:0 2px 8px var(--t-glow);
}
.shop-progress-bar{flex:1;height:8px;background:var(--t-soft);border-radius:6px;overflow:hidden;border:1px solid var(--t-border-light);}
.shop-progress-fill{height:100%;width:0%;background:linear-gradient(90deg,var(--t-c1),var(--t-c3));border-radius:6px;transition:width .4s ease;box-shadow:0 0 8px var(--t-glow);}
.shop-progress-text{font-size:10px;color:#b59ac9;font-family:Consolas,monospace;min-width:54px;text-align:right;}

/* ===== 工具栏 ===== */
.shop-toolbar{padding:8px 16px 4px;display:flex;gap:8px;flex-shrink:0;}
.shop-btn{flex:1;padding:7px 10px;border:none;border-radius:12px;font-family:inherit;font-size:11px;
font-weight:600;cursor:pointer;transition:all .2s ease;letter-spacing:.5px;}
.shop-btn:hover{transform:translateY(-1px);}
.shop-btn:active{transform:translateY(0) scale(.97);}
.shop-btn-primary{background:linear-gradient(135deg,var(--t-c1),var(--t-c3));color:#fff;box-shadow:0 3px 10px var(--t-glow);}
.shop-btn-secondary{flex:0 0 auto;background:#fff;color:#b59ac9;border:1.5px solid var(--t-border-light);}
.shop-btn-secondary:hover{background:var(--t-soft);border-color:var(--t-c1);}

.shop-folder-info{padding:0 16px 4px;font-size:10px;color:#b59ac9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;}
.shop-folder-info span{color:var(--t-main);font-weight:600;}

/* ===== 任务页 ===== */
.shop-coin-right{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.shop-task-btn{
  padding:2px 8px;border-radius:10px;
  background:var(--t-soft);color:var(--t-main);
  border:1px solid var(--t-border-light);
  font-family:inherit;font-size:10px;font-weight:600;
  cursor:pointer;transition:all .2s;flex-shrink:0;line-height:1.6;
}
.shop-task-btn:hover{background:var(--t-border-light);}
.shop-task-btn.on{
  background:linear-gradient(90deg,var(--t-c1),var(--t-c3));
  color:#fff;border-color:var(--t-c1);
}
.shop-task-page{grid-column:1/-1;display:flex;flex-direction:column;gap:10px;padding:4px 0;}
.shop-task-add{
  display:flex;gap:8px;align-items:center;
  padding:8px 12px;
  background:linear-gradient(135deg,var(--t-soft),var(--t-bg2));
  border:2px dashed var(--t-border-light);border-radius:12px;
}
.shop-task-input{
  flex:1;padding:6px 10px;
  border:1.5px solid var(--t-border-light);border-radius:8px;
  background:#fff;font-family:inherit;font-size:11px;color:#6b4a6b;
  outline:none;transition:all .2s;box-sizing:border-box;min-width:0;
}
.shop-task-input:focus{border-color:var(--t-c1);}
.shop-task-add-btn{
  padding:6px 12px;border:none;border-radius:8px;
  background:linear-gradient(90deg,var(--t-c1),var(--t-c3));
  color:#fff;font-family:inherit;font-size:11px;font-weight:700;
  cursor:pointer;transition:all .15s;flex-shrink:0;
}
.shop-task-add-btn:hover{transform:translateY(-1px);}
.shop-task-list{display:flex;flex-direction:column;gap:6px;}
.shop-task-item{
  display:flex;align-items:center;gap:10px;
  padding:8px 12px;background:#fff;
  border:2px solid var(--t-border-light);border-radius:12px;
  transition:all .2s;
}
.shop-task-item:hover{border-color:var(--t-c1);}
.shop-task-item.done{border-color:var(--t-c1);background:var(--t-soft);}
.shop-task-check{
  width:20px;height:20px;border-radius:50%;
  border:2px solid var(--t-border-light);
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;flex-shrink:0;transition:all .2s;
  font-size:12px;color:transparent;background:#fff;
}
.shop-task-check:hover{border-color:var(--t-c1);}
.shop-task-item.done .shop-task-check{
  background:var(--t-main);
  border-color:var(--t-main);color:#fff;
}
.shop-task-text{
  flex:1;font-size:11px;color:#6b4a6b;
  word-break:break-word;white-space:normal;
  line-height:1.5;text-align:left;min-width:0;
}
.shop-task-item.done .shop-task-text{color:#b59ac9;text-decoration:line-through;}
.shop-task-cover{
  width:32px;height:32px;border-radius:6px;object-fit:cover;
  flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,0.15);
}
.shop-task-del{
  width:20px;height:20px;border-radius:50%;
  background:rgba(255,77,109,0.1);color:#ff4d6d;
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;font-size:12px;flex-shrink:0;transition:all .15s;
}
.shop-task-del:hover{background:rgba(255,77,109,0.25);}
.shop-task-empty{
  text-align:center;padding:24px 10px;
  color:#c8b0d6;font-size:11px;line-height:1.8;
}
.shop-task-empty .big{font-size:32px;display:block;margin-bottom:6px;}

/* ===== 导航 ===== */
.shop-nav{display:flex;gap:5px;padding:0 14px 8px;flex-shrink:0;}
.shop-nav-btn{flex:1;padding:8px 6px;border-radius:12px;font-size:11px;font-weight:700;
  cursor:pointer;background:#fff;color:#b59ac9;border:1.5px solid var(--t-border-light);
  transition:all .2s;text-align:center;user-select:none;white-space:nowrap;}
.shop-nav-btn:hover{background:var(--t-soft);border-color:var(--t-c1);color:var(--t-main);}
.shop-nav-btn.active{background:linear-gradient(90deg,var(--t-c1),var(--t-c3));color:#fff;
  border-color:var(--t-c1);box-shadow:0 3px 12px var(--t-glow);}

/* ===== 搜索 ===== */
.shop-search-row{padding:0 16px 6px;flex-shrink:0;position:relative;}
.shop-search-box{width:100%;padding:7px 30px 7px 32px;border:1.5px solid var(--t-border-light);border-radius:12px;
font-family:inherit;font-size:11px;color:#6b4a6b;background:#fff;
outline:none;transition:all .2s;box-sizing:border-box;}
.shop-search-box:focus{border-color:var(--t-c1);box-shadow:0 0 0 3px var(--t-glow);}
.shop-search-box::placeholder{color:#d0b8dd;}
.shop-search-icon{position:absolute;left:26px;top:50%;transform:translateY(-50%);
font-size:11px;pointer-events:none;opacity:0.6;}
.shop-search-clear{position:absolute;right:26px;top:50%;transform:translateY(-50%);
font-size:14px;cursor:pointer;color:#d0b8dd;line-height:1;display:none;}
.shop-search-clear:hover{color:var(--t-main);}
.shop-search-clear.show{display:block;}

/* ===== 网格 ===== */
.shop-song-grid{flex:1;overflow-y:auto;padding:4px 12px 12px;
display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;
min-height:160px;align-content:start;grid-auto-rows:max-content;
scrollbar-width:thin;scrollbar-color:var(--t-border-light) transparent;
overscroll-behavior:contain;}
.shop-song-grid::-webkit-scrollbar{width:6px;}
.shop-song-grid::-webkit-scrollbar-thumb{background:var(--t-border-light);border-radius:3px;}
.shop-song-grid::-webkit-scrollbar-thumb:hover{background:var(--t-c1);}

.shop-empty{grid-column:1/-1;text-align:center;padding:32px 10px;color:#c8b0d6;font-size:11px;line-height:1.9;}
.shop-empty .big{font-size:32px;display:block;margin-bottom:6px;animation:shop-float 3s ease-in-out infinite;}

/* ===== 歌曲卡片 ===== */
.song-card{position:relative;background:#fff;border-radius:14px;cursor:pointer;
transition:transform .2s cubic-bezier(0.34,1.56,0.64,1),box-shadow .2s,border-color .2s;
border:2px solid var(--t-border-light);box-shadow:0 2px 8px rgba(255,180,210,.25);
overflow:hidden;min-height:140px;align-self:start;}
.song-card:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 8px 20px var(--t-glow);border-color:var(--t-c1);}
.song-card.owned{border-color:#ffd166;box-shadow:0 2px 10px rgba(255,209,102,.4);}
.song-card.playing{border-color:var(--t-c3);box-shadow:0 0 0 3px var(--t-glow),0 6px 18px var(--t-glow);}

.song-cover{position:relative;width:100%;aspect-ratio:1/1;overflow:hidden;background:#f5e8f5;}
.song-cover img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;}
.song-card:not(.owned) .song-cover::before{content:'';position:absolute;top:0;left:0;right:0;bottom:0;
  background:rgba(215,215,215,0.78);z-index:1;pointer-events:none;transition:background .2s;}
.song-card:not(.owned):hover .song-cover::before{background:var(--t-hover);}

.song-lock{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;
align-items:center;justify-content:center;gap:5px;z-index:2;pointer-events:none;transition:background .2s;}
.song-card:hover .song-lock{background:linear-gradient(180deg,var(--t-hover),var(--t-hover));}
.song-lock-icon{font-size:18px;opacity:0.9;filter:drop-shadow(0 0 4px rgba(0,0,0,0.6));}
.song-lock-price{font-size:22px;font-weight:900;color:#fff;font-family:Consolas,monospace;
  letter-spacing:1px;line-height:1;
  text-shadow:0 0 10px var(--t-main),0 0 20px var(--t-main),0 2px 4px rgba(0,0,0,0.95);}
.song-lock-unit{font-size:9px;color:#ffe0f0;font-weight:700;
  text-shadow:0 0 6px var(--t-main),0 1px 2px rgba(0,0,0,0.95);letter-spacing:2px;}

.song-fav-btn{position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;
background:rgba(255,255,255,0.88);display:flex;align-items:center;justify-content:center;
font-size:14px;cursor:pointer;z-index:4;transition:transform .15s;color:var(--t-c1);
box-shadow:0 2px 6px rgba(0,0,0,0.15);line-height:1;}
.song-fav-btn:hover{transform:scale(1.15);background:#fff;color:var(--t-main);}
.song-fav-btn.active{color:var(--t-main);background:rgba(255,255,255,0.98);}

.song-meta{padding:6px 7px 8px;background:#fff;display:flex;flex-direction:column;gap:2px;}
.song-name{font-size:10px;font-weight:700;color:#6b4a6b;line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.song-artist{font-size:9px;color:#b59ac9;line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.song-artist.loading{color:var(--t-c1);opacity:0.9;
  animation:shop-sparkle 1.2s ease-in-out infinite;}

/* ===== 收藏夹卡片 ===== */
.shop-fav-card{position:relative;background:#fff;border-radius:14px;cursor:pointer;
transition:transform .2s cubic-bezier(0.34,1.56,0.64,1),box-shadow .2s,border-color .2s;
border:2px solid var(--t-border-light);overflow:hidden;min-height:140px;
box-shadow:0 2px 8px rgba(255,180,210,.25);align-self:start;}
.shop-fav-card:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 8px 20px var(--t-glow);border-color:var(--t-c1);}
.shop-fav-cover{position:relative;width:100%;aspect-ratio:1/1;overflow:hidden;
  background:linear-gradient(135deg,var(--t-soft),var(--t-bg2));}
.shop-fav-cover img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;}
.shop-fav-info{padding:7px 8px 9px;background:#fff;box-sizing:border-box;}
.shop-fav-name{font-size:11px;font-weight:700;color:#6b4a6b;line-height:1.3;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
  overflow:hidden;word-break:break-all;}
.shop-fav-count-badge{position:absolute;top:6px;right:6px;color:#fff;font-size:13px;font-weight:900;
  font-family:Consolas,monospace;z-index:6;line-height:1.2;
  text-shadow:-1px -1px 0 rgba(0,0,0,0.85),1px -1px 0 rgba(0,0,0,0.85),-1px 1px 0 rgba(0,0,0,0.85),1px 1px 0 rgba(0,0,0,0.85),0 0 4px rgba(0,0,0,0.6),0 1px 3px rgba(0,0,0,0.5);
  transition:opacity .15s;pointer-events:none;}
.shop-fav-card:hover .shop-fav-count-badge{opacity:0;}
.shop-fav-actions{position:absolute;top:4px;right:4px;display:flex;gap:3px;opacity:0;transition:opacity .2s;z-index:5;}
.shop-fav-card:hover .shop-fav-actions{opacity:1;}
.shop-fav-act{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.94);
  display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;
  box-shadow:0 2px 5px rgba(0,0,0,0.18);transition:transform .15s;color:#6b4a6b;line-height:1;}
.shop-fav-act:hover{transform:scale(1.15);background:#fff;}
.shop-fav-act.del{color:#ff4d6d;}
.shop-fav-act.ren{color:var(--t-main);}

.shop-fav-new-card{display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:linear-gradient(135deg,var(--t-soft),var(--t-bg2));
  border:2px dashed var(--t-c1);border-radius:14px;cursor:pointer;
  color:var(--t-c1);min-height:180px;transition:all .2s;padding:10px;box-sizing:border-box;align-self:start;}
.shop-fav-new-card:hover{background:linear-gradient(135deg,var(--t-border-light),var(--t-bg2));
  border-style:solid;transform:translateY(-3px) scale(1.02);}
.shop-fav-new-icon{font-size:32px;font-weight:300;line-height:1;}
.shop-fav-new-text{font-size:10px;margin-top:6px;font-weight:700;letter-spacing:1px;}

/* ===== 返回条 ===== */
.shop-back-bar{grid-column:1/-1;display:flex;align-items:center;gap:6px;padding:0 0 8px;}
.shop-back-btn{padding:5px 10px;border-radius:10px;background:#fff;color:var(--t-main);
  border:1.5px solid var(--t-border-light);font-size:11px;font-weight:700;cursor:pointer;
  transition:all .15s;display:flex;align-items:center;gap:3px;flex-shrink:0;font-family:inherit;}
.shop-back-btn:hover{background:var(--t-soft);border-color:var(--t-c1);}
.shop-fav-title{font-size:12px;font-weight:700;color:#6b4a6b;flex:1;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.5px;}
.shop-fav-title .cnt{font-size:10px;color:var(--t-main);font-weight:800;margin-left:4px;}
.shop-rename-btn{padding:5px 9px;border-radius:10px;background:#fff;color:var(--t-main);
  border:1.5px solid var(--t-border-light);font-size:10px;font-weight:700;cursor:pointer;
  transition:all .15s;font-family:inherit;flex-shrink:0;}
.shop-rename-btn:hover{background:var(--t-soft);border-color:var(--t-c1);}

.shop-loadmore{grid-column:1/-1;text-align:center;padding:12px;color:#c8b0d6;font-size:10px;letter-spacing:1px;font-weight:600;}

/* ===== 播放器 ===== */
.shop-player{padding:6px 12px 8px;background:rgba(255,255,255,.9);border-top:1px dashed var(--t-border-light);display:none;flex-shrink:0;position:relative;}
.shop-player.active{display:block;}
.shop-viz-space{height:0;transition:height .3s;background:transparent;border-radius:8px;overflow:hidden;}
.shop-player.magic .shop-viz-space{height:28px;margin-bottom:6px;
  background:linear-gradient(90deg,var(--t-soft),var(--t-bg2));}
.shop-player-info{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.shop-player-cover{width:36px;height:36px;border-radius:8px;object-fit:cover;border:2px solid var(--t-border-light);}
.shop-player-text{flex:1;min-width:0;}
.shop-player-title{font-size:11px;font-weight:700;color:#6b4a6b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.shop-player-artist{font-size:9px;color:#b59ac9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.shop-player-controls{display:flex;align-items:center;gap:6px;margin-top:4px;}
.shop-player-controls audio{flex:1;height:28px;outline:none;}
.shop-player-extra{display:flex;gap:4px;flex-shrink:0;}
.shop-player-extra button{padding:4px 8px;border:none;border-radius:8px;font-size:11px;
  cursor:pointer;background:var(--t-soft);color:var(--t-main);font-family:inherit;
  font-weight:700;transition:all .15s;}
.shop-player-extra button:hover{background:var(--t-border-light);}

/* 魔法乐星美化 */
.shop-player.magic .shop-player-extra button{
  background:linear-gradient(135deg,var(--t-c1),var(--t-c3));
  color:#fff;box-shadow:0 0 8px var(--t-glow);
  animation:magicGlow 2s ease-in-out infinite;
}
.shop-player.magic #shop-audio{filter:drop-shadow(0 0 4px var(--t-glow));}
.shop-player.magic .shop-player-cover{
  border-color:var(--t-c1);box-shadow:0 0 10px var(--t-glow);
}

/* 播放模式切换按钮 */
.shop-mode-btn{display:none;}
.shop-player.symphony .shop-mode-btn{display:flex;align-items:center;justify-content:center;
  min-width:32px;}

/* ===== 播放列表弹窗 ===== */
.shop-playlist{position:fixed;background:#fff;border:2px solid var(--t-border-light);
  border-radius:14px;box-shadow:0 8px 24px var(--t-glow);padding:8px;min-width:240px;max-width:320px;
  max-height:400px;overflow-y:auto;z-index:2147483647;font-family:inherit;font-size:11px;
  animation:shop-pop 0.22s cubic-bezier(0.34,1.56,0.64,1);}
.shop-playlist-title{font-size:11px;color:var(--t-main);font-weight:800;padding:4px 8px 8px;
  border-bottom:1px dashed var(--t-border-light);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;}
.shop-playlist-item{display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:8px;
  cursor:pointer;color:#6b4a6b;transition:all .15s;}
.shop-playlist-item:hover{background:var(--t-soft);}
.shop-playlist-item.playing{background:var(--t-soft);color:var(--t-main);font-weight:700;}
.shop-playlist-item .pl-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.shop-playlist-del{font-size:11px;color:#ff4d6d;opacity:0.6;padding:1px 5px;border-radius:6px;}
.shop-playlist-del:hover{opacity:1;background:rgba(255,77,109,0.1);}
.shop-playlist-empty{font-size:10px;color:#d0b8dd;text-align:center;padding:14px;}

/* ===== 自定义确认弹窗 ===== */
.shop-confirm-mask{position:fixed;inset:0;background:rgba(0,0,0,0.5);
  z-index:2147483647;display:flex;align-items:center;justify-content:center;
  animation:shop-pop 0.2s ease-out;}
.shop-confirm-box{background:#fff;border-radius:16px;padding:20px 22px;
  min-width:280px;max-width:380px;box-shadow:0 10px 40px rgba(0,0,0,0.3);
  font-family:inherit;font-size:12px;color:#6b4a6b;}
.shop-confirm-title{font-size:14px;font-weight:800;color:var(--t-main);
  margin-bottom:10px;letter-spacing:.5px;}
.shop-confirm-content{font-size:11px;line-height:1.7;color:#6b4a6b;
  white-space:pre-line;margin-bottom:16px;max-height:50vh;overflow-y:auto;}
.shop-confirm-btns{display:flex;gap:8px;justify-content:flex-end;}
.shop-confirm-btns button{padding:7px 18px;border:none;border-radius:10px;
  font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;
  transition:all .15s;letter-spacing:.5px;}
.shop-confirm-cancel{background:#f0e8f5;color:#b59ac9;}
.shop-confirm-cancel:hover{background:#e0d4e8;}
.shop-about-link{display:inline-block;margin-top:4px;padding:4px 12px;
  background:linear-gradient(135deg,var(--t-c1),var(--t-c3));
  color:#fff !important;text-decoration:none;border-radius:10px;
  font-weight:700;font-size:11px;letter-spacing:.5px;
  box-shadow:0 3px 8px var(--t-glow);transition:all .15s;cursor:pointer;}
.shop-about-link:hover{transform:translateY(-1px);box-shadow:0 5px 14px var(--t-glow);}
.shop-confirm-ok{background:linear-gradient(135deg,var(--t-c1),var(--t-c3));
  color:#fff;box-shadow:0 3px 10px var(--t-glow);}
.shop-confirm-ok:hover{transform:translateY(-1px);}
#shop-panel[data-theme="dark"] .shop-confirm-box{background:#0a0a0a;color:#fff;}
#shop-panel[data-theme="dark"] .shop-confirm-content{color:#d0d0d0;}
#shop-panel[data-theme="dark"] .shop-confirm-cancel{background:#1a1a1a;color:#8a8a8a;}

/* ===== 霓虹提示 ===== */
.shop-neon{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  font-size:26px;font-weight:900;letter-spacing:2px;pointer-events:none;z-index:2147483646;
  text-align:center;padding:12px 24px;border-radius:16px;
  animation:neonPop 1.5s ease-out forwards;white-space:nowrap;}

/* ===== 背包 ===== */
.shop-inv-wrap{grid-column:1/-1;display:flex;flex-direction:column;gap:8px;}
.shop-inv-item{display:flex;align-items:center;gap:10px;padding:10px 14px;
  background:#fff;border:2px solid var(--t-border-light);border-radius:14px;
  transition:all .2s;}
.shop-inv-item:hover{border-color:var(--t-c1);box-shadow:0 4px 12px var(--t-glow);}
.shop-inv-item.active{border-color:var(--t-main);box-shadow:0 0 0 3px var(--t-glow);}
.shop-inv-icon{font-size:32px;line-height:1;flex-shrink:0;}
.shop-inv-name{flex:1;font-size:13px;font-weight:800;color:#6b4a6b;letter-spacing:.5px;}
.shop-inv-right{display:flex;align-items:center;gap:10px;flex-shrink:0;}
.shop-inv-status{font-size:10px;color:#b59ac9;font-weight:600;}
.shop-inv-item.active .shop-inv-status{color:var(--t-main);font-weight:800;}
.shop-inv-switch{width:40px;height:22px;border-radius:12px;background:#e0d4e8;
  position:relative;cursor:pointer;transition:background .2s;flex-shrink:0;}
.shop-inv-switch.on{background:linear-gradient(135deg,var(--t-c1),var(--t-c3));}
.shop-inv-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;
  background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s;}
.shop-inv-switch.on .shop-inv-knob{transform:translateX(18px);}
.shop-inv-use{font-size:11px;font-weight:800;color:#fff;padding:6px 12px;border-radius:10px;
  background:linear-gradient(135deg,var(--t-c1),var(--t-c3));cursor:pointer;letter-spacing:.5px;
  box-shadow:0 3px 8px var(--t-glow);transition:transform .15s;}
.shop-inv-use:hover{transform:translateY(-1px);}
.shop-inv-bing-card{
  display:flex;align-items:center;gap:10px;
  padding:10px 14px;background:#fff;
  border:2px solid var(--t-border-light);border-radius:14px;
  transition:all .2s;
}
.shop-inv-bing-card:hover{border-color:var(--t-c1);box-shadow:0 4px 12px var(--t-glow);}
.shop-inv-bing-icon{font-size:28px;flex-shrink:0;}
.shop-inv-bing-info{flex:1;min-width:0;}
.shop-inv-bing-name{font-size:13px;font-weight:800;color:#6b4a6b;}
.shop-inv-bing-count{font-size:10px;color:#b59ac9;font-weight:600;margin-top:2px;}
.shop-inv-bing-use{
  padding:6px 14px;border:none;border-radius:8px;
  background:linear-gradient(90deg,#ff7eb3,#c8a2ff);
  color:#fff;font-family:inherit;font-size:11px;font-weight:800;
  cursor:pointer;flex-shrink:0;transition:all .15s;
  box-shadow:0 2px 8px rgba(255,126,179,0.4);
}
.shop-inv-bing-use:hover{transform:translateY(-1px) scale(1.05);}
#shop-panel[data-theme="dark"] .shop-inv-bing-card{background:#0a0a0a;border-color:#1e1e1e;}
#shop-panel[data-theme="dark"] .shop-inv-bing-name{color:#fff;}

.shop-bing-word{
  position:fixed;
  z-index:2147483647;
  padding:12px 24px;
  border-radius:20px;
  font-weight:900;
  letter-spacing:2px;
  white-space:nowrap;
  pointer-events:none;
  transform:translate(-50%,-50%);
  box-shadow:0 0 20px rgba(255,255,255,0.85),
             0 0 44px rgba(255,150,200,0.65),
             0 10px 28px rgba(0,0,0,0.35);
  text-shadow:0 2px 10px rgba(0,0,0,0.35);
  font-family:"PingFang SC","Microsoft YaHei",sans-serif;
}

.shop-inv-sing-card{
  display:flex;align-items:center;gap:10px;
  padding:10px 14px;background:#fff;
  border:2px solid var(--t-border-light);border-radius:14px;
  transition:all .2s;
}
.shop-inv-sing-card:hover{border-color:var(--t-c1);box-shadow:0 4px 12px var(--t-glow);}
.shop-inv-sing-icon{font-size:26px;flex-shrink:0;}
.shop-inv-sing-info-wrap{flex:1;min-width:0;}
.shop-inv-sing-name{font-size:12px;font-weight:800;color:#6b4a6b;}
.shop-inv-sing-info{font-size:10px;color:#b59ac9;font-weight:600;margin-top:2px;}
/* ===== 老板唱歌时长滑动条 ===== */
.shop-inv-sing-card.sing-slider-card{flex-direction:column;align-items:stretch;gap:2px;}
.shop-inv-sing-head{display:flex;align-items:center;gap:10px;}
.shop-inv-sing-head .shop-inv-sing-info-wrap{flex:1;min-width:0;}
.shop-inv-sing-slider-row{display:flex;align-items:center;gap:8px;margin-top:8px;}
.shop-inv-sing-slider{width:100%;min-width:0;flex:1;height:20px;margin:0;cursor:pointer;background:transparent;
  -webkit-appearance:none;appearance:none;outline:none;}
.shop-inv-sing-slider:disabled{cursor:default;opacity:.45;}
.shop-inv-sing-slider::-webkit-slider-runnable-track{height:8px;border-radius:6px;
  background:linear-gradient(90deg,var(--t-c1),var(--t-c3));border:none;}
.shop-inv-sing-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;margin-top:-5px;
  border-radius:50%;background:#fff;border:2px solid var(--t-main);
  box-shadow:0 1px 5px rgba(0,0,0,.25);cursor:pointer;}
.shop-inv-sing-slider::-moz-range-track{height:8px;border-radius:6px;
  background:linear-gradient(90deg,var(--t-c1),var(--t-c3));}
.shop-inv-sing-slider::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;
  border:2px solid var(--t-main);box-shadow:0 1px 5px rgba(0,0,0,.25);cursor:pointer;}
.shop-inv-sing-value{flex-shrink:0;min-width:42px;text-align:right;font-size:12px;font-weight:800;
  color:var(--t-main);font-family:Consolas,monospace;}
.shop-inv-sing-tip{font-size:9px;color:#c9b3d8;font-weight:600;margin-top:3px;letter-spacing:.3px;}
.shop-inv-sing-card.sing-locked .shop-inv-sing-slider{cursor:not-allowed;}
.shop-inv-sing-card.sing-locked .shop-inv-sing-value{color:#b59ac9;font-size:10px;min-width:auto;}
.shop-inv-sing-qty{display:flex;align-items:center;gap:4px;flex-shrink:0;}
.shop-inv-sing-btn{
  width:24px;height:24px;border-radius:50%;
  border:none;background:var(--t-soft);color:var(--t-main);
  font-size:14px;font-weight:800;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  transition:all .15s;line-height:1;padding:0;
}
.shop-inv-sing-btn:hover{background:var(--t-border-light);}
.shop-inv-sing-btn:disabled{opacity:0.35;cursor:default;}
.shop-inv-sing-val{
  min-width:28px;text-align:center;
  font-size:12px;font-weight:800;color:var(--t-main);
  font-family:Consolas,monospace;
}
#shop-panel[data-theme="dark"] .shop-inv-sing-card{background:#0a0a0a;border-color:#1e1e1e;}
#shop-panel[data-theme="dark"] .shop-inv-sing-name{color:#fff;}
#shop-panel[data-theme="dark"] .shop-inv-sing-info,
#shop-panel[data-theme="dark"] .shop-inv-sing-tip{color:#8a8a8a;}
#shop-panel[data-theme="dark"] .shop-inv-sing-value{color:#fff;}
#shop-panel[data-theme="dark"] .shop-inv-sing-slider::-webkit-slider-thumb{background:#fff;border-color:#fff;}
#shop-panel[data-theme="dark"] .shop-inv-sing-slider::-moz-range-thumb{background:#fff;border-color:#fff;}

/* ===== 道具铺 ===== */
.shop-item-shop{grid-column:1/-1;display:flex;flex-direction:column;gap:12px;padding:4px 0;}
.shop-cat-box{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 10px 16px;
  background:linear-gradient(135deg,var(--t-soft),var(--t-bg2));
  border-radius:16px;border:2px dashed var(--t-border-light);}
.shop-cat-boss{font-size:40px;line-height:1.3;transition:filter .3s;
  font-family:"Courier New",Consolas,monospace;letter-spacing:2px;font-weight:700;
  color:var(--t-main);text-align:center;padding:6px 0;
  cursor:pointer;user-select:none;
  transition:filter .3s,transform .1s;}
.shop-cat-boss:hover{filter:drop-shadow(0 0 8px var(--t-glow));}
.shop-cat-boss:active{transform:scale(0.94);}
.shop-cat-boss.singing{animation:catSing 0.5s ease-in-out infinite;}
@keyframes catSing{
  0%,100%{transform:scale(1) rotate(-4deg);}
  50%{transform:scale(1.08) rotate(4deg);}
}
.shop-cat-boss.rainbow{animation:catRainbow 3s linear infinite;}
.shop-cat-boss.rainbow.singing{
  animation:catSing 0.5s ease-in-out infinite,
            catRainbow 3s linear infinite;
}
.shop-cat-name{font-size:10px;color:var(--t-main);font-weight:800;letter-spacing:1.5px;}
.shop-cat-bubble{position:relative;background:#fff;border:2px solid var(--t-border-light);
  color:#6b4a6b;padding:10px 16px;border-radius:14px;font-size:11px;font-weight:600;
  max-width:320px;text-align:center;line-height:1.5;margin-top:14px;
  box-shadow:0 2px 8px var(--t-glow);transition:opacity .3s;min-height:32px;}
  .shop-cat-avatar{
  display:block;width:64px;height:64px;border-radius:50%;
  margin:2px auto 8px;object-fit:cover;
  border:3px solid var(--t-border-light);
  box-shadow:0 4px 12px var(--t-glow),0 0 0 2px rgba(255,255,255,0.6) inset;
  animation:shop-pop 0.4s cubic-bezier(0.34,1.56,0.64,1);
}
.shop-cat-avatar-text{
  font-size:11px;line-height:1.5;
}
.shop-cat-bubble::after{content:'';position:absolute;top:-9px;left:50%;transform:translateX(-50%);
  border:8px solid transparent;border-bottom-color:#fff;}

.shop-item-list{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.shop-item-card{position:relative;background:#fff;border:2px solid var(--t-border-light);
  border-radius:14px;padding:16px 12px 12px;display:flex;flex-direction:column;gap:6px;
  transition:transform .2s,box-shadow .2s,border-color .2s;overflow:hidden;align-self:start;}
.shop-item-card:hover{transform:translateY(-2px);box-shadow:0 6px 16px var(--t-glow);border-color:var(--t-c1);}
.shop-item-card.owned{border-color:#ffd166;box-shadow:0 2px 10px rgba(255,209,102,.35);}
.shop-item-card.active{border-color:var(--t-main);box-shadow:0 0 0 3px var(--t-glow);}
.shop-item-tag{position:absolute;top:6px;left:6px;font-size:9px;font-weight:700;
  padding:1px 7px;border-radius:8px;color:#fff;
  background:linear-gradient(135deg,var(--t-c1),var(--t-c3));letter-spacing:.5px;}
.shop-item-emoji{font-size:40px;line-height:1;text-align:center;margin-top:8px;}
.shop-item-name{font-size:12px;font-weight:800;color:#6b4a6b;text-align:center;letter-spacing:.5px;}
.shop-item-desc{font-size:10px;color:#b59ac9;line-height:1.5;text-align:center;
  min-height:32px;white-space:pre-line;}
.shop-item-price{font-size:11px;font-weight:800;color:var(--t-main);font-family:Consolas,monospace;
  text-align:center;margin-top:2px;}
.shop-item-qty-row{
  display:flex;align-items:center;justify-content:center;gap:6px;
  margin-top:2px;
}
.shop-item-qty-label{font-size:10px;color:#b59ac9;font-weight:600;}
.shop-item-qty-input{
  width:52px;padding:3px 6px;
  border:1.5px solid var(--t-border-light);border-radius:8px;
  background:#fff;font-family:inherit;font-size:11px;color:#6b4a6b;
  text-align:center;outline:none;transition:all .2s;
  box-sizing:border-box;
}
.shop-item-qty-input:focus{border-color:var(--t-c1);box-shadow:0 0 0 2px var(--t-glow);}
#shop-panel[data-theme="dark"] .shop-item-qty-input{background:#0a0a0a;color:#fff;border-color:#2e2e2e;}
.shop-item-action{margin-top:6px;padding:8px 10px;border:none;border-radius:10px;font-family:inherit;
  font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;color:#fff;letter-spacing:.5px;
  background:linear-gradient(135deg,var(--t-c1),var(--t-c3));box-shadow:0 3px 8px var(--t-glow);}
.shop-item-action:hover{transform:translateY(-1px);box-shadow:0 5px 14px var(--t-glow);}
.shop-item-action.owned{background:#fff;color:#ffa726;border:1.5px solid #ffd166;box-shadow:none;}
.shop-item-action.on{background:linear-gradient(135deg,#ff6b8a,#ff4d6d);color:#fff;}
.shop-item-action.permanent{background:#ffd166;color:#6b4a6b;}

/* ===== 收藏夹弹出菜单 ===== */
.shop-fav-menu{position:fixed;background:#fff;border:2px solid var(--t-border-light);border-radius:12px;
box-shadow:0 8px 24px var(--t-glow);padding:6px;min-width:150px;max-width:210px;
z-index:2147483647;font-family:inherit;font-size:11px;
animation:shop-pop 0.22s cubic-bezier(0.34,1.56,0.64,1);}
.shop-fav-menu-title{font-size:10px;color:var(--t-main);font-weight:600;padding:4px 8px 6px;letter-spacing:1px;
border-bottom:1px dashed var(--t-border-light);margin-bottom:4px;}
.shop-fav-menu-empty{font-size:10px;color:#d0b8dd;padding:8px 6px;text-align:center;line-height:1.7;}
.shop-fav-menu-item{padding:6px 10px;border-radius:8px;cursor:pointer;color:#6b4a6b;
transition:all .15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.shop-fav-menu-item:hover{background:var(--t-soft);color:var(--t-main);}
.shop-fav-menu-new{margin-top:4px;border-top:1px dashed var(--t-border-light);color:var(--t-c1);font-weight:600;}
.shop-fav-menu-new:hover{background:linear-gradient(135deg,var(--t-soft),var(--t-bg2));color:var(--t-main);}

/* ===== 主题菜单 ===== */
.shop-theme-menu{position:fixed;background:#fff;border:2px solid var(--t-border-light);
border-radius:12px;box-shadow:0 8px 24px var(--t-glow);padding:6px;min-width:190px;
z-index:2147483647;font-family:inherit;font-size:11px;
animation:shop-pop 0.22s cubic-bezier(0.34,1.56,0.64,1);}
.shop-theme-menu-title{font-size:10px;color:var(--t-main);font-weight:700;padding:4px 8px 6px;
letter-spacing:1px;border-bottom:1px dashed var(--t-border-light);margin-bottom:4px;}
.shop-theme-item{padding:6px 10px;border-radius:8px;cursor:pointer;color:#6b4a6b;
display:flex;align-items:center;gap:8px;transition:all .15s;}
.shop-theme-item:hover{background:var(--t-soft);}
.shop-theme-item.active{background:var(--t-soft);font-weight:700;color:var(--t-main);}
.shop-theme-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.shop-theme-rename{font-size:11px;color:#c8a2ff;padding:1px 5px;border-radius:6px;
  opacity:0;transition:opacity .15s;cursor:pointer;flex-shrink:0;line-height:1;}
.shop-theme-item:hover .shop-theme-rename{opacity:1;}
.shop-theme-rename:hover{background:var(--t-soft);color:var(--t-main);}
.shop-theme-dot{width:16px;height:16px;border-radius:50%;flex-shrink:0;
border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.08);}

/* ===== 魔法乐星 - 自绘播放器 ===== */
@property --magicBorderAngle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
@keyframes magicBorderSpin{
  to{--magicBorderAngle:360deg;}
}
.shop-player.magic{position:relative;}
.shop-player.magic::before{
  content:'';
  position:absolute;
  inset:0;
  padding:2px;
  background:conic-gradient(from var(--magicBorderAngle),
    transparent 0deg,
    transparent 300deg,
    var(--mp-color1,#ffb8d9) 330deg,
    var(--mp-color2,#c8a2ff) 355deg,
    transparent 360deg);
  -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;
  mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite:exclude;
  animation:magicBorderSpin 3s linear infinite;
  pointer-events:none;
  z-index:2;
}
.shop-player.magic #shop-audio{display:none !important;}
.magic-player{display:none;flex-direction:column;gap:6px;padding:10px 12px;border-radius:12px;
  color:#fff;margin-bottom:6px;
  position:relative;overflow:hidden;background:#1a1a1a;
  transition:background 0.8s ease;}
.shop-player.magic .magic-player{display:flex;}
.shop-player.magic .shop-player-info,
.shop-player.magic .shop-player-controls,
.shop-player.magic #shop-audio,
.shop-player.magic .shop-viz-space{display:none !important;}
.magic-player::before{content:'';position:absolute;inset:-40px;
  background-image:var(--mp-cover,none);
  background-size:cover;background-position:center;
  filter:blur(12px) brightness(0.85) saturate(1.6);
  z-index:0;transform:scale(1.15);}
.magic-player::after{content:'';position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(0,0,0,0.1) 0%,rgba(0,0,0,0.45) 100%);
  z-index:0;pointer-events:none;}
.magic-player > *{position:relative;z-index:1;}
.magic-player-cover-row{display:flex;align-items:center;gap:8px;}
.magic-player-cover{width:34px;height:34px;border-radius:8px;object-fit:cover;
  box-shadow:0 2px 6px rgba(0,0,0,0.5);background:#fff;flex-shrink:0;}
.magic-player-info{flex:1;min-width:0;}
.magic-player-title{font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  text-shadow:0 1px 3px rgba(0,0,0,0.6);}
.magic-player-artist{font-size:10px;opacity:0.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  text-shadow:0 1px 2px rgba(0,0,0,0.5);}
.magic-progress-wrap{position:relative;height:12px;display:flex;align-items:center;cursor:pointer;}
.magic-progress-bg{width:100%;height:5px;border-radius:3px;background:rgba(255,255,255,0.3);overflow:hidden;}
.magic-progress-fill{height:100%;width:0%;background:#fff;border-radius:3px;transition:width 0.15s linear;
  box-shadow:0 0 8px rgba(255,255,255,0.9);}
.magic-progress-knob{position:absolute;top:50%;transform:translate(-50%,-50%);width:11px;height:11px;
  border-radius:50%;background:#fff;box-shadow:0 0 8px rgba(0,0,0,0.6);
  pointer-events:none;left:0%;transition:left 0.15s linear;}
.magic-times{display:flex;justify-content:space-between;font-size:9px;opacity:0.92;margin-top:-2px;
  text-shadow:0 1px 2px rgba(0,0,0,0.5);}
.magic-controls{display:flex;justify-content:center;align-items:center;gap:10px;margin-top:2px;}
.magic-btn{width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,0.22);
  color:#fff;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:all .15s;backdrop-filter:blur(4px);}
.magic-btn:hover{background:rgba(255,255,255,0.4);transform:scale(1.1);}
.magic-btn.magic-extra{width:26px;height:26px;font-size:12px;background:rgba(255,255,255,0.16);}
.magic-btn.magic-play{width:36px;height:36px;font-size:15px;background:#fff;
  color:#222;box-shadow:0 3px 10px rgba(0,0,0,0.4);}
.magic-btn.magic-play:hover{background:#fff;transform:scale(1.08);}

.magic-lyrics-wrap{
  margin:2px 0 4px;
}
.magic-lyrics{
  height:110px;
  overflow:hidden;
  text-align:center;
  font-size:11px;
  line-height:1.5;
  color:rgba(255,255,255,0.55);
  padding-right:24px;
  position:relative;
  -webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 22%,#000 78%,transparent 100%);
  mask-image:linear-gradient(180deg,transparent 0%,#000 22%,#000 78%,transparent 100%);
  transition:height .3s ease,padding .3s ease;
}
.magic-lyrics-inner{
  will-change:transform;
  transform:translateY(0);
  transition:transform 0.5s cubic-bezier(0.22, 0.9, 0.28, 1);
}
.magic-lyrics-empty{
  padding:36px 0;
  color:rgba(255,255,255,0.7);
}
.magic-lyrics-toggle{
  position:absolute;
  top:10px;
  right:12px;
  width:28px;
  height:28px;
  border-radius:50%;
  background:rgba(255,255,255,0.15);
  color:#fff;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:16px;
  line-height:1;
  cursor:pointer;
  transition:all .2s;
  user-select:none;
  backdrop-filter:blur(4px);
  z-index:2;
}
.magic-lyrics-toggle:hover{background:rgba(255,255,255,0.35);}
.magic-lyrics-toggle.collapsed{transform:rotate(180deg);}
.magic-lyrics-wrap.collapsed .magic-lyrics{height:0;padding:0;}
.magic-lyrics-line{
  padding:5px 0;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  opacity:0.7;
  transition:opacity .35s ease,color .35s ease,text-shadow .35s ease;
}
.magic-lyrics-text{
  display:block;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.magic-lyrics-trans{
  display:block;
  font-size:10px;
  color:rgba(255,255,255,0.45);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  margin-top:1px;
}
.magic-lyrics-line.active{
  color:#fff;
  font-weight:800;
  opacity:1;
  text-shadow:0 0 8px rgba(255,255,255,0.7),0 1px 3px rgba(0,0,0,0.6);
}
.magic-lyrics-line.active .magic-lyrics-trans{
  color:rgba(255,255,255,0.75);
  font-weight:500;
  font-size:10.5px;
}
.magic-lyrics-line.active .magic-lyrics-trans{
  color:rgba(255,255,255,0.75);font-weight:500;font-size:10.5px;
}

.magic-viz-wrap{
  display:none;
  height:36px;
  margin:2px 0 4px;
  padding:0 2px;
  border-radius:8px;
  overflow:hidden;
}
.shop-player.viz-on .magic-viz-wrap{
  display:block;
}
.magic-viz{
  width:100%;
  height:100%;
  display:block;
}

/* 魔法乐星开启时，隐藏原生播放栏 */
.shop-player.magic .shop-player-info,
.shop-player.magic{padding:0;background:transparent;border-top:0;}
.shop-player.magic .magic-player{border-radius:0;margin-bottom:0;}
.shop-player.magic .shop-player-controls,
.shop-player.magic #shop-audio{display:none !important;}

/* 收藏夹播放按钮 */
.shop-playall-btn{padding:5px 12px;border-radius:10px;
  background:linear-gradient(135deg,var(--t-c1),var(--t-c3));color:#fff;border:none;
  font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;flex-shrink:0;
  box-shadow:0 3px 10px var(--t-glow);transition:all .15s;letter-spacing:.5px;}
.shop-playall-btn:hover{transform:translateY(-1px);box-shadow:0 5px 14px var(--t-glow);}

/* ===== 底部 / 球 ===== */
.shop-footer{padding:6px 16px 8px;display:flex;justify-content:space-between;font-size:9px;color:#d0b8dd;letter-spacing:1px;flex-shrink:0;}
#shop-ball{position:fixed;right:20px;bottom:20px;width:58px;height:58px;border-radius:50%;
background:linear-gradient(135deg,#4a9eff,#7ec8ff);border:3px solid #fff;display:none;
align-items:center;justify-content:center;font-size:15px;font-weight:800;
font-family:"Courier New",Consolas,monospace;letter-spacing:0;
color:#fff;cursor:pointer;z-index:2147483647;
box-shadow:0 4px 20px rgba(120,180,255,0.6);animation:shop-float 2.5s ease-in-out infinite;
user-select:none;transition:background 1.2s ease,box-shadow 1.2s ease;
text-shadow:0 1px 3px rgba(0,0,0,0.4);}
#shop-ball:hover{transform:scale(1.1);}
#shop-ball.shop-ball-yellow{background:linear-gradient(135deg,#ffdd00,#fff176);
  box-shadow:0 4px 20px rgba(255,230,50,0.75);}
#shop-ball-tip{position:fixed;background:rgba(255,255,255,0.98);color:#333;
  padding:6px 12px;border-radius:12px;font-size:11px;font-weight:600;
  box-shadow:0 4px 14px rgba(0,0,0,0.18);z-index:2147483647;
  pointer-events:none;white-space:nowrap;opacity:0;
  transform:translate(-50%,4px);
  transition:opacity 0.25s,transform 0.25s;
  font-family:"PingFang SC","Microsoft YaHei",sans-serif;}
#shop-ball-tip.show{opacity:1;transform:translate(-50%,0);}
#shop-ball-tip::after{content:'';position:absolute;bottom:-6px;left:50%;
  transform:translateX(-50%);border:6px solid transparent;
  border-top-color:rgba(255,255,255,0.98);border-bottom-width:0;}

/* ===== 艺术殿堂 ===== */
#shop-panel.art-palace-on{
  --ap-hue:320;
  background:radial-gradient(ellipse at 50% 100%,
    hsl(var(--ap-hue),70%,22%) 0%,
    hsl(var(--ap-hue),65%,12%) 45%,
    hsl(var(--ap-hue),55%,6%) 100%) !important;
  border-color:hsl(var(--ap-hue),75%,55%) !important;
  box-shadow:0 0 40px hsl(var(--ap-hue),80%,55%),
             0 0 100px hsl(var(--ap-hue),80%,40%),
             0 12px 42px rgba(0,0,0,0.5) !important;
  transition:background .8s ease,border-color .8s ease,box-shadow .8s ease;
}
#shop-panel.art-palace-on::after{
  content:'';position:absolute;left:0;right:0;bottom:0;height:240px;
  background:linear-gradient(to top,
    hsla(var(--ap-hue),90%,55%,0.55) 0%,
    hsla(var(--ap-hue),85%,50%,0.25) 40%,
    transparent 100%);
  pointer-events:none;z-index:5;border-radius:0 0 22px 22px;
  animation:artPalacePulse 2.4s ease-in-out infinite;
}
@keyframes artPalacePulse{
  0%,100%{opacity:0.7;transform:translateY(0);}
  50%{opacity:1;transform:translateY(-6px);}
}
#shop-panel.art-palace-on .shop-header,
#shop-panel.art-palace-on .shop-coin-area,
#shop-panel.art-palace-on .shop-toolbar,
#shop-panel.art-palace-on .shop-nav,
#shop-panel.art-palace-on .shop-folder-info,
#shop-panel.art-palace-on .shop-footer{
  background:transparent !important;border-color:hsla(var(--ap-hue),70%,50%,0.3) !important;
}
#shop-panel.art-palace-on .shop-title,
#shop-panel.art-palace-on .shop-coin-num,
#shop-panel.art-palace-on .shop-coin-icon,
#shop-panel.art-palace-on .shop-coin-label,
#shop-panel.art-palace-on .shop-today,
#shop-panel.art-palace-on .shop-folder-info,
#shop-panel.art-palace-on .shop-status,
#shop-panel.art-palace-on #shop-status,
#shop-panel.art-palace-on .shop-footer span{
  color:#fff !important;text-shadow:0 0 8px hsl(var(--ap-hue),80%,60%) !important;
}
#shop-panel.art-palace-on .shop-song-grid{
  background:transparent !important;
}

#shop-panel.art-palace-close-btn{
  display:none;
}
#shop-panel.art-palace-on .art-palace-exit{
  display:flex !important;
}
.art-palace-exit{
  position:absolute;top:10px;right:50px;z-index:20;
  padding:6px 14px;border:2px solid rgba(255,255,255,0.6);border-radius:20px;
  background:rgba(0,0,0,0.4);color:#fff;font-family:inherit;font-size:11px;font-weight:700;
  cursor:pointer;backdrop-filter:blur(6px);transition:all .2s;display:none;
  align-items:center;gap:4px;
}
.art-palace-exit:hover{background:rgba(255,255,255,0.25);border-color:#fff;}

.art-palace-lyric-float{
  position:fixed;white-space:nowrap;pointer-events:none;
  font-weight:900;font-family:"PingFang SC","Microsoft YaHei",sans-serif;
  z-index:2147483646;
  will-change:transform,opacity;
  mix-blend-mode:screen;
}
.art-palace-lyric-float .apl-main{display:block;line-height:1.15;}
.art-palace-lyric-float .apl-trans{
  display:block;font-size:0.55em;opacity:0.75;margin-top:4px;
  font-weight:600;line-height:1.15;
}

.art-palace-picker{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.7);
  display:flex;align-items:center;justify-content:center;
  padding:20px;box-sizing:border-box;overflow:hidden;
  animation:shop-pop 0.2s ease-out;}
.art-palace-picker-box{position:relative;
  background:var(--t-bg1,#fff);
  border:2px solid var(--t-border-light,#ffd0e5);
  border-radius:20px;padding:20px;
  width:90vw;max-width:720px;
  max-height:calc(100vh - 40px);
  display:flex;flex-direction:column;
  box-shadow:0 20px 60px rgba(0,0,0,0.35),0 0 40px var(--t-glow,transparent);
  font-family:inherit;overflow:hidden;color:#6b4a6b;}
.art-palace-picker-title{font-size:16px;font-weight:800;
  color:var(--t-main,#ff7eb3);
  margin-bottom:12px;flex-shrink:0;}
.art-palace-search{width:100%;padding:8px 14px;
  border:1.5px solid var(--t-border-light,#ffd0e5);
  border-radius:12px;font-family:inherit;font-size:12px;outline:none;margin-bottom:12px;
  box-sizing:border-box;color:#6b4a6b;
  background:var(--t-bg1,#fff);
  flex-shrink:0;transition:all .2s;}
.art-palace-search::placeholder{color:#d0b8dd;}
.art-palace-search:focus{
  border-color:var(--t-c1,#ffb8d9);
  box-shadow:0 0 0 3px var(--t-glow,rgba(255,150,200,0.45));}
.art-palace-grid{display:grid;
  grid-template-columns:repeat(auto-fill,minmax(120px,1fr));
  gap:12px;overflow-y:auto;padding:4px;
  flex:1;min-height:0;align-content:start;grid-auto-rows:max-content;
  scrollbar-width:thin;
  scrollbar-color:var(--t-border-light,#ffd0e5) transparent;}
.art-palace-grid::-webkit-scrollbar{width:6px;}
.art-palace-grid::-webkit-scrollbar-thumb{
  background:var(--t-border-light,#ffd0e5);border-radius:3px;}
.art-palace-grid::-webkit-scrollbar-thumb:hover{background:var(--t-c1,#ffb8d9);}
.art-palace-card{background:var(--t-bg1,#fff);
  border:2px solid var(--t-border-light,#ffd0e5);
  border-radius:12px;cursor:pointer;overflow:hidden;
  transition:transform 0.2s, box-shadow 0.2s, border-color 0.2s;
  position:relative;display:block;}
.art-palace-card:hover{transform:translateY(-3px);
  box-shadow:0 8px 20px var(--t-glow,rgba(255,180,210,0.45));
  border-color:var(--t-c1,#ff7eb3);}
.art-palace-card.unlocked{border-color:#ffd166;}
.art-palace-card img{width:100%;aspect-ratio:1 / 1;
  object-fit:cover;display:block;}
.art-palace-card-info{padding:6px 8px;}
.art-palace-card-name{font-size:11px;font-weight:700;color:#6b4a6b;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.art-palace-card-artist{font-size:9px;color:#b59ac9;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
.art-palace-card-status{font-size:10px;font-weight:700;text-align:center;padding:4px;
  margin:4px 6px 6px;border-radius:8px;}
.art-palace-card-status.locked{
  background:var(--t-soft,#fff0f7);
  color:var(--t-main,#ff7eb3);}
.art-palace-card-status.unlocked{background:linear-gradient(90deg,#ffd166,#ffb347);color:#6b4a6b;}
.art-palace-picker-close{position:absolute;top:14px;right:14px;width:32px;height:32px;
  border-radius:50%;
  background:var(--t-soft,rgba(0,0,0,0.05));
  border:none;cursor:pointer;font-size:16px;
  color:var(--t-main,#6b4a6b);
  display:flex;align-items:center;justify-content:center;transition:all .15s;}
.art-palace-picker-close:hover{
  background:var(--t-border-light,rgba(0,0,0,0.1));}
/* ===== 艺术殿堂弹窗 · 每主题殿堂豪华配色 ===== */

/* 樱花粉 · 深玫瑰殿堂 */
.art-palace-picker[data-parent-theme="sakura"]{
  --ap-bg1:#1a0a14; --ap-bg2:#2a0f1a;
  --ap-glow:rgba(255,126,179,0.55);
  --ap-glow-soft:rgba(255,126,179,0.22);
  --ap-title:#ffb8d9;
  --ap-text:#f5d8e8;
  --ap-text-dim:rgba(255,184,217,0.65);
  --ap-border:rgba(255,126,179,0.45);
}
/* 初音绿 · 深墨绿殿堂 */
.art-palace-picker[data-parent-theme="miku"]{
  --ap-bg1:#061a18; --ap-bg2:#0a2622;
  --ap-glow:rgba(57,197,187,0.55);
  --ap-glow-soft:rgba(57,197,187,0.22);
  --ap-title:#66e0c8;
  --ap-text:#c8f0ea;
  --ap-text-dim:rgba(102,224,200,0.65);
  --ap-border:rgba(57,197,187,0.45);
}
/* 哔哩粉蓝 · 粉蓝殿堂 */
.art-palace-picker[data-parent-theme="bili"]{
  --ap-bg1:#1a0a14; --ap-bg2:#0a1424;
  --ap-glow:rgba(251,114,153,0.55);
  --ap-glow-soft:rgba(251,114,153,0.22);
  --ap-title:#ff9bc1;
  --ap-text:#f5d8e0;
  --ap-text-dim:rgba(255,155,193,0.65);
  --ap-border:rgba(251,114,153,0.45);
}
/* 概念蓝 · 深科技蓝殿堂 */
.art-palace-picker[data-parent-theme="concept"]{
  --ap-bg1:#06111f; --ap-bg2:#0a1a30;
  --ap-glow:rgba(107,197,255,0.55);
  --ap-glow-soft:rgba(107,197,255,0.22);
  --ap-title:#8bd0ff;
  --ap-text:#c8dcf5;
  --ap-text-dim:rgba(139,208,255,0.65);
  --ap-border:rgba(107,197,255,0.45);
}
/* 哆啦A梦 · 深蓝黄殿堂 */
.art-palace-picker[data-parent-theme="doraemon"]{
  --ap-bg1:#061a2a; --ap-bg2:#0a2238;
  --ap-glow:rgba(18,150,219,0.6);
  --ap-glow-soft:rgba(255,204,0,0.16);
  --ap-title:#4ab8f0;
  --ap-text:#c8dff5;
  --ap-text-dim:rgba(74,184,240,0.7);
  --ap-border:rgba(18,150,219,0.55);
}
/* 蓝紫星夜 · 深紫殿堂 */
.art-palace-picker[data-parent-theme="starry"]{
  --ap-bg1:#0e0620; --ap-bg2:#1a0f30;
  --ap-glow:rgba(167,139,250,0.55);
  --ap-glow-soft:rgba(167,139,250,0.22);
  --ap-title:#c8a2ff;
  --ap-text:#d8c8f5;
  --ap-text-dim:rgba(200,162,255,0.65);
  --ap-border:rgba(167,139,250,0.45);
}
/* 深黑 · 暗金殿堂 */
.art-palace-picker[data-parent-theme="dark"]{
  --ap-bg1:#1c1508; --ap-bg2:#0d0a04;
  --ap-glow:rgba(212,175,55,0.6);
  --ap-glow-soft:rgba(212,175,55,0.22);
  --ap-title:#ffd97d;
  --ap-text:#f5e6c8;
  --ap-text-dim:rgba(255,217,125,0.7);
  --ap-border:rgba(212,175,55,0.55);
}
/* 纯白 · 白金浅殿 */
.art-palace-picker[data-parent-theme="pure"]{
  --ap-bg1:#fafaf8; --ap-bg2:#f0ede6;
  --ap-glow:rgba(180,160,120,0.4);
  --ap-glow-soft:rgba(212,175,55,0.16);
  --ap-title:#8a7040;
  --ap-text:#333344;
  --ap-text-dim:rgba(138,112,64,0.75);
  --ap-border:rgba(200,180,140,0.65);
}
/* 薄荷绿 · 深林殿堂 */
.art-palace-picker[data-parent-theme="mint"]{
  --ap-bg1:#061a14; --ap-bg2:#0a241c;
  --ap-glow:rgba(127,205,145,0.55);
  --ap-glow-soft:rgba(127,205,145,0.22);
  --ap-title:#a8e6cf;
  --ap-text:#c8e8d5;
  --ap-text-dim:rgba(168,230,207,0.65);
  --ap-border:rgba(127,205,145,0.45);
}
/* 落日橘 · 深棕橘殿堂 */
.art-palace-picker[data-parent-theme="sunset"]{
  --ap-bg1:#1a0e06; --ap-bg2:#2a160a;
  --ap-glow:rgba(255,150,100,0.55);
  --ap-glow-soft:rgba(255,150,100,0.22);
  --ap-title:#ffb84d;
  --ap-text:#f5dcc8;
  --ap-text-dim:rgba(255,184,77,0.7);
  --ap-border:rgba(255,150,100,0.5);
}

/* ===== 通用殿堂结构（所有主题共用） ===== */
.art-palace-picker[data-parent-theme] .art-palace-picker-box{
  background:
    radial-gradient(ellipse at 50% -10%, var(--ap-glow-soft) 0%, transparent 55%),
    radial-gradient(ellipse at 50% 110%, var(--ap-glow-soft) 0%, transparent 55%),
    linear-gradient(160deg, var(--ap-bg1) 0%, var(--ap-bg2) 50%, var(--ap-bg1) 100%);
  border:2px solid var(--ap-border);
  box-shadow:
    0 20px 60px rgba(0,0,0,0.6),
    0 0 40px var(--ap-glow-soft),
    0 0 80px var(--ap-glow-soft),
    inset 0 0 60px rgba(255,255,255,0.03);
  color:var(--ap-text);
}
.art-palace-picker[data-parent-theme] .art-palace-picker-title{
  color:var(--ap-title);
  text-shadow:
    0 0 10px var(--ap-glow),
    0 0 22px var(--ap-glow-soft),
    0 2px 4px rgba(0,0,0,0.8);
  letter-spacing:2px;
}
.art-palace-picker[data-parent-theme] .art-palace-picker-title::after{
  content:'';display:block;height:1px;margin-top:10px;
  background:linear-gradient(90deg, transparent, var(--ap-border) 50%, transparent);
}
.art-palace-picker[data-parent-theme] .art-palace-search{
  background:rgba(0,0,0,0.3);
  color:var(--ap-text);
  border:1.5px solid var(--ap-border);
}
.art-palace-picker[data-parent-theme] .art-palace-search::placeholder{
  color:var(--ap-text-dim);
}
.art-palace-picker[data-parent-theme] .art-palace-search:focus{
  border-color:var(--ap-title);
  box-shadow:0 0 0 3px var(--ap-glow-soft), 0 0 20px var(--ap-glow-soft);
}
.art-palace-picker[data-parent-theme] .art-palace-grid{
  scrollbar-color:var(--ap-border) transparent;
}
.art-palace-picker[data-parent-theme] .art-palace-grid::-webkit-scrollbar-thumb{
  background:var(--ap-border);border-radius:3px;
}
.art-palace-picker[data-parent-theme] .art-palace-grid::-webkit-scrollbar-thumb:hover{
  background:var(--ap-title);
}
.art-palace-picker[data-parent-theme] .art-palace-card{
  background:linear-gradient(160deg, var(--ap-bg1), var(--ap-bg2));
  border:2px solid var(--ap-border);
  box-shadow:0 2px 8px rgba(0,0,0,0.5), inset 0 0 20px rgba(255,255,255,0.02);
}
.art-palace-picker[data-parent-theme] .art-palace-card:hover{
  border-color:var(--ap-title);
  box-shadow:
    0 8px 24px rgba(0,0,0,0.6),
    0 0 20px var(--ap-glow),
    0 0 40px var(--ap-glow-soft);
}
.art-palace-picker[data-parent-theme] .art-palace-card.unlocked{
  border-color:#ffd166;
  box-shadow:0 0 18px rgba(255,209,102,0.5), 0 0 36px rgba(255,209,102,0.22);
}
.art-palace-picker[data-parent-theme] .art-palace-card-name{
  color:var(--ap-text);
}
.art-palace-picker[data-parent-theme] .art-palace-card-artist{
  color:var(--ap-text-dim);
}
.art-palace-picker[data-parent-theme] .art-palace-card-status.locked{
  background:var(--ap-glow-soft);
  color:var(--ap-title);
  border:1px solid var(--ap-border);
}
.art-palace-picker[data-parent-theme] .art-palace-card-status.unlocked{
  background:linear-gradient(90deg,#ffd166,#d4af37);
  color:#1a1408;
  box-shadow:0 0 12px rgba(255,209,102,0.5);
}
.art-palace-picker[data-parent-theme] .art-palace-picker-close{
  background:var(--ap-glow-soft);
  color:var(--ap-title);
  border:1px solid var(--ap-border);
}
.art-palace-picker[data-parent-theme] .art-palace-picker-close:hover{
  background:var(--ap-glow);
  color:#fff;
  box-shadow:0 0 14px var(--ap-glow);
}

/* ===== 纯白主题：浅色特殊化（保持白底，加金饰） ===== */
.art-palace-picker[data-parent-theme="pure"] .art-palace-card{
  background:linear-gradient(160deg, #fff, #fafaf8);
}
.art-palace-picker[data-parent-theme="pure"] .art-palace-search{
  background:rgba(255,255,255,0.9);
  color:#333344;
}
.art-palace-picker[data-parent-theme="pure"] .art-palace-picker-title{
  text-shadow:0 0 8px rgba(212,175,55,0.4), 0 1px 2px rgba(0,0,0,0.1);
}
.art-palace-picker[data-parent-theme="pure"] .art-palace-picker-close:hover{
  color:#333344;
  background:rgba(212,175,55,0.35);
}
body.art-palace-page-on::before{
  content:'';position:fixed;inset:0;
  background:
    radial-gradient(ellipse at 50% 100%, hsla(var(--ap-hue,320),85%,55%,0.42) 0%, transparent 65%),
    radial-gradient(ellipse at 20% 30%, hsla(var(--ap-hue,320),85%,60%,0.22) 0%, transparent 55%),
    radial-gradient(ellipse at 80% 70%, hsla(var(--ap-hue,320),85%,50%,0.22) 0%, transparent 55%),
    linear-gradient(180deg, hsla(var(--ap-hue,320),70%,20%,0.15) 0%, transparent 40%);
  pointer-events:none;
  z-index:2147483645;
  animation:artPalacePagePulse 3s ease-in-out infinite;
}
@keyframes artPalacePagePulse{
  0%,100%{opacity:0.8;}
  50%{opacity:1;}
}
/* ===== 艺术殿堂 · 黑白模式 ===== */
#shop-panel.art-palace-mono {
  --ap-hue: 0;
  background: radial-gradient(ellipse at 50% 100%,
    hsl(0, 0%, 26%) 0%,
    hsl(0, 0%, 13%) 45%,
    hsl(0, 0%, 5%) 100%) !important;
  border-color: hsl(0, 0%, 70%) !important;
  box-shadow: 0 0 40px hsla(0, 0%, 78%, 0.55),
             0 0 100px hsla(0, 0%, 65%, 0.35),
             0 12px 42px rgba(0,0,0,0.55) !important;
}
#shop-panel.art-palace-mono::after {
  background: linear-gradient(to top,
    hsla(0, 0%, 78%, 0.45) 0%,
    hsla(0, 0%, 62%, 0.2) 40%,
    transparent 100%);
}
body.art-palace-page-on.art-palace-page-mono::before {
  background:
    radial-gradient(ellipse at 50% 100%, hsla(0, 0%, 78%, 0.4) 0%, transparent 65%),
    radial-gradient(ellipse at 20% 30%, hsla(0, 0%, 85%, 0.2) 0%, transparent 55%),
    radial-gradient(ellipse at 80% 70%, hsla(0, 0%, 72%, 0.2) 0%, transparent 55%),
    linear-gradient(180deg, hsla(0, 0%, 62%, 0.12) 0%, transparent 40%);
}

/* ===== 艺术殿堂 · 圆形封面泡泡 ===== */
/* ===== 艺术殿堂 · 控制条 ===== */
.palace-controls {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 18px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.35);
  color: #fff;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5),
              0 0 40px hsla(var(--ap-hue, 320), 80%, 60%, 0.4);
  animation: shop-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  min-width: 300px;
  max-width: 90vw;
}
.palace-ctrl-dragbar {
  text-align: center;
  font-size: 10px;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.6);
  padding-bottom: 4px;
  margin-bottom: 4px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.2);
  cursor: grab;
  user-select: none;
  font-family: Consolas, monospace;
}
.palace-ctrl-dragbar:active { cursor: grabbing; }
.palace-controls { cursor: grab; }
.palace-controls:active { cursor: grabbing; }
.palace-controls input,
.palace-controls label,
.palace-controls .palace-speed { cursor: pointer; }
.palace-ctrl-row { display: flex; align-items: center; gap: 10px; }
.palace-ctrl-label { white-space: nowrap; font-size: 12px; letter-spacing: .5px; }
.palace-speed {
  flex: 1;
  min-width: 120px;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: linear-gradient(90deg, #fff8, #fff4);
  border-radius: 4px;
  outline: none;
  cursor: pointer;
}
.palace-speed::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: none;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.9),
              0 0 22px hsla(var(--ap-hue, 320), 90%, 65%, 0.9);
  cursor: pointer;
}
.palace-speed::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: none;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.9);
  cursor: pointer;
}
.palace-ctrl-value {
  min-width: 44px;
  text-align: right;
  font-family: Consolas, monospace;
  font-size: 12px;
  color: #fff;
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.7);
}
.palace-toggles-row {
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 16px;
}
.palace-ctrl-tip {
  font-size: 9.5px;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 400;
  letter-spacing: .3px;
  padding-top: 2px;
  line-height: 1.4;
}
.palace-sync-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 11.5px;
  user-select: none;
  opacity: 0.95;
  letter-spacing: .3px;
}
.palace-sync-toggle:hover { opacity: 1; }
.palace-sync-toggle input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #fff;
}
.art-palace-cover-bubble {
  position: fixed;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  background-color: rgba(30, 30, 30, 0.85);
  pointer-events: none;
  z-index: 2147483646;
  filter: blur(1.8px) saturate(1.05) brightness(1.02);
  box-shadow: 0 0 30px currentColor,
              0 0 70px currentColor,
              inset 0 0 20px rgba(255, 255, 255, 0.12);
  transform: translate(-50%, -50%);
  opacity: 0;
  will-change: transform, opacity;
  mix-blend-mode: screen;
}
/* ===== 艺术殿堂 · 控制条：顶部按钮 ===== */
.palace-ctrl-dragbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.palace-ctrl-drag-hint {
  flex: 1;
  text-align: center;
  padding-left: 48px; /* 让文字大致居中：右边留了 48px 的按钮区 */
}
.palace-ctrl-drag-btns {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.palace-ctrl-icon-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  cursor: pointer;
  transition: all .15s;
  line-height: 1;
  user-select: none;
}
.palace-ctrl-icon-btn:hover { background: rgba(255, 255, 255, 0.38); transform: scale(1.1); }
.palace-ctrl-icon-exit { color: #ff9db1; }
.palace-ctrl-icon-exit:hover { background: rgba(255, 90, 120, 0.55); color: #fff; }

/* ===== 艺术殿堂 · 最小化小球 ===== */
.palace-min-ball {
  position: fixed;
  top: 24px;
  right: 24px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%,
    hsla(var(--ap-hue, 320), 90%, 78%, 0.95) 0%,
    hsla(var(--ap-hue, 320), 85%, 55%, 0.95) 55%,
    hsla(var(--ap-hue, 320), 80%, 38%, 0.95) 100%);
  border: 2px solid rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  line-height: 1;
  cursor: grab;
  z-index: 2147483647;
  box-shadow: 0 0 20px hsla(var(--ap-hue, 320), 90%, 65%, 0.75),
              0 6px 20px rgba(0, 0, 0, 0.4),
              inset 0 0 12px rgba(255, 255, 255, 0.25);
  animation: shop-float 2.5s ease-in-out infinite;
  user-select: none;
  transition: transform .15s ease, box-shadow .2s ease;
  will-change: transform;
}
.palace-min-ball:hover {
  transform: scale(1.08);
  box-shadow: 0 0 32px hsla(var(--ap-hue, 320), 95%, 70%, 0.95),
              0 8px 26px rgba(0, 0, 0, 0.5),
              inset 0 0 15px rgba(255, 255, 255, 0.35);
}
.palace-min-ball:active {
  cursor: grabbing;
  animation: none;
  transform: scale(0.96);
}
/* 让喵条两个滑块共用原来的 .palace-speed 样式，无需新增规则 */
/* 唯一调整：两个滑块上下相邻时给一点点视觉区分 */
#palace-decodensity-val { color: #fff; }
#palace-textdensity-val { color: #fff; }
#palace-rate-val { color: #fff; }
/* ===== 任务页：锁定提示 ===== */
.shop-task-locked-tip {
    padding: 8px 12px;
    background: var(--t-soft);
    border: 1.5px dashed var(--t-border-light);
    border-radius: 10px;
    font-size: 10.5px;
    color: #b59ac9;
    text-align: center;
    letter-spacing: .3px;
    line-height: 1.5;
}

/* ===== 任务页：确认按钮条 ===== */
.shop-task-confirm-bar {
    display: flex;
    justify-content: center;
    padding: 4px 0 2px;
}
.shop-task-confirm-btn {
    padding: 9px 22px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(90deg, var(--t-c1), var(--t-c3));
    color: #fff;
    font-family: inherit;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .8px;
    cursor: pointer;
    box-shadow: 0 3px 12px var(--t-glow);
    transition: all .15s;
}
.shop-task-confirm-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px var(--t-glow);
}
.shop-task-confirm-btn:active {
    transform: translateY(0) scale(.98);
}

/* 深色主题适配 */
#shop-panel[data-theme="dark"] .shop-task-locked-tip {
    background: #0a0a0a;
    border-color: #2e2e2e;
    color: #8a8a8a;
}
#shop-panel[data-theme="dark"] .shop-task-confirm-btn {
    color: #000;
    text-shadow: none;
}
/* ===== 优惠券 ===== */
.shop-coupon-box {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: linear-gradient(135deg, #fff5fa 0%, #f8f0ff 55%, #eef3ff 100%);
  border: 2px solid var(--t-border-light);
  border-radius: 14px;
  box-shadow: 0 2px 10px var(--t-glow);
  box-sizing: border-box;
  overflow: hidden;
  margin-top: 2px;
}
.shop-coupon-box::before {
  content: '';
  position: absolute;
  top: -40px;
  left: -40px;
  width: 110px;
  height: 110px;
  background: radial-gradient(circle, var(--t-glow) 0%, transparent 70%);
  pointer-events: none;
}
.shop-coupon-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--t-c1), var(--t-c3));
  font-size: 22px;
  flex-shrink: 0;
  box-shadow: 0 3px 10px var(--t-glow);
}
.shop-coupon-info {
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}
.shop-coupon-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--t-main);
  margin-bottom: 3px;
  letter-spacing: .3px;
}
.shop-coupon-desc {
  font-size: 10px;
  color: #b59ac9;
  line-height: 1.5;
  font-weight: 600;
}
.shop-coupon-use {
  position: relative;
  z-index: 1;
  padding: 8px 18px;
  border: none;
  border-radius: 20px;
  background: linear-gradient(90deg, var(--t-c1), var(--t-c3));
  color: #fff;
  font-family: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: 0 3px 10px var(--t-glow);
  transition: all .15s;
}
.shop-coupon-use:hover {
  transform: translateY(-1px) scale(1.03);
  box-shadow: 0 5px 14px var(--t-glow);
}
.shop-coupon-use:active {
  transform: translateY(0) scale(.97);
}
#shop-panel[data-theme="dark"] .shop-coupon-box {
  background: linear-gradient(135deg, #100a10 0%, #0a0a14 100%);
  border-color: #2e2e2e;
}
#shop-panel[data-theme="dark"] .shop-coupon-desc {
  color: #8a8a8a;
}
#shop-panel[data-theme="dark"] .shop-coupon-use {
  color: #000;
  text-shadow: none;
}
/* ===== 专注模式 ===== */
body.shop-focus-mode .bili-header,
body.shop-focus-mode .mini-header,
body.shop-focus-mode .nav-search,
body.shop-focus-mode .bili-header__banner,
body.shop-focus-mode .bili-header__channel,
body.shop-focus-mode .recommended-container_floor-aside,
body.shop-focus-mode .feed2,
body.shop-focus-mode .bili-video-card,
body.shop-focus-mode .recommend-list-v1,
body.shop-focus-mode .video-page-special-card-small,
body.shop-focus-mode .video-page-card-small,
body.shop-focus-mode .comment-container,
body.shop-focus-mode .video-toolbar-left,
body.shop-focus-mode .video-toolbar-right,
body.shop-focus-mode .pop-live-small-mode,
body.shop-focus-mode .bili-dyn-list,
body.shop-focus-mode .search-page,
body.shop-focus-mode .space-container,
body.shop-focus-mode .bili-user-profile{
  display:none !important;
}
.shop-focus-row{
  display:none;align-items:center;gap:8px;
  margin-top:8px;padding:6px 10px;
  border-radius:10px;
  background:linear-gradient(135deg,rgba(255,240,247,0.9),rgba(240,240,255,0.9));
  border:1.5px solid var(--t-border-light);
}
.shop-focus-row.on{display:flex;}
.shop-focus-row-icon{font-size:14px;animation:shop-sparkle 1.5s ease-in-out infinite;flex-shrink:0;}
.shop-focus-row-label{font-size:11px;font-weight:800;color:var(--t-main);letter-spacing:.5px;flex-shrink:0;}
.shop-focus-row-time{font-family:Consolas,monospace;font-size:13px;font-weight:800;color:var(--t-main);letter-spacing:1px;margin-left:auto;}
.shop-focus-row-switch{
  padding:4px 10px;border:none;border-radius:8px;
  background:linear-gradient(135deg,var(--t-c1),var(--t-c3));
  color:#fff;font-family:inherit;font-size:10px;font-weight:800;
  cursor:pointer;transition:all .15s;letter-spacing:.5px;
  box-shadow:0 2px 6px var(--t-glow);flex-shrink:0;
}
.shop-focus-row-switch:hover{transform:translateY(-1px);}
#shop-panel[data-theme="dark"] .shop-focus-row{
  background:linear-gradient(135deg,#141414,#0a0a1a);
  border-color:#2e2e2e;
}
.shop-focus-switch-bar{
  position:fixed;top:60px;left:50%;transform:translateX(-50%);
  z-index:2147483647;display:none;flex-direction:column;align-items:center;gap:6px;
  padding:12px 22px;border-radius:16px;
  background:linear-gradient(135deg,#fff5fa,#f0f0ff);
  border:2px solid #ffb84d;
  box-shadow:0 12px 32px rgba(0,0,0,0.2),0 0 24px rgba(255,180,80,0.5);
  font-family:"PingFang SC","Microsoft YaHei",sans-serif;
  font-size:13px;font-weight:700;color:#6b4a6b;
  animation:shop-pop 0.3s cubic-bezier(0.34,1.56,0.64,1);}
.shop-focus-switch-icon{font-size:18px;}
.shop-focus-switch-text{letter-spacing:.5px;}
.shop-focus-switch-time{font-family:Consolas,monospace;font-size:18px;
  color:#ff8c42;padding:0 8px;letter-spacing:2px;
  text-shadow:0 0 8px rgba(255,180,80,0.5);}
.shop-focus-continue-btn{padding:6px 16px;border:none;border-radius:10px;
  background:linear-gradient(135deg,#39c5bb,#5ab7b0);color:#fff;
  font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;
  letter-spacing:1px;box-shadow:0 3px 10px rgba(57,197,187,0.5);transition:all .15s;}
.shop-focus-continue-btn:hover{transform:translateY(-1px);}

.shop-milestone-mask{
  position:fixed;inset:0;z-index:2147483647;
  display:flex;align-items:center;justify-content:center;
  pointer-events:auto;transition:opacity .4s;}
.shop-milestone-box{
  min-width:300px;max-width:400px;padding:32px 28px 24px;
  border-radius:24px;
  background:linear-gradient(160deg,#fff8fc 0%,#f3ecff 55%,#e8f6ff 100%);
  border:3px solid #ffb8d9;
  box-shadow:0 20px 60px rgba(0,0,0,0.3),0 0 60px rgba(255,150,200,0.6);
  text-align:center;
  font-family:"PingFang SC","Microsoft YaHei",sans-serif;
  color:#6b4a6b;
  animation:shop-pop 0.45s cubic-bezier(0.34,1.56,0.64,1);}
.shop-milestone-icon{font-size:56px;line-height:1;margin-bottom:8px;
  animation:shop-sparkle 1.2s ease-in-out infinite;}
.shop-milestone-title{font-size:18px;font-weight:900;color:#ff7eb3;
  letter-spacing:2px;margin-bottom:6px;}
.shop-milestone-sub{font-size:13px;color:#b59ac9;font-weight:700;margin-bottom:12px;}
.shop-milestone-coins{font-size:36px;font-weight:900;color:#ff8c42;
  font-family:Consolas,monospace;
  text-shadow:0 0 16px rgba(255,180,80,0.6);
  margin:8px 0;letter-spacing:1px;}
.shop-milestone-tip{font-size:11px;color:#c8b0d6;margin-top:12px;letter-spacing:.5px;}
`;

  function injectCSS() {
    if (document.getElementById('shop-css')) return;
    const s = document.createElement('style');
    s.id = 'shop-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  /* ============ 主题 ============ */
  const THEMES = [
    {
      id: 'sakura',
      name: '🌸 樱花粉',
      c1: '#ffb8d9',
      c3: '#c8a2ff',
    },
    {
      id: 'miku',
      name: '💚 初音绿',
      c1: '#39c5bb',
      c3: '#66e0c8',
    },
    {
      id: 'bili',
      name: '📺 哔哩粉蓝',
      c1: '#fb7299',
      c3: '#23ade5',
    },
    {
      id: 'concept',
      name: '💠 概念蓝',
      c1: '#6bc5ff',
      c3: '#4a9eff',
    },
    {
      id: 'doraemon',
      name: '🔵🟡喵？',
      c1: '#1296db',
      c3: '#ffcc00',
    },
    {
      id: 'starry',
      name: '💙 蓝紫',
      c1: '#5b8ff9',
      c3: '#c8a2ff',
    },
    {
      id: 'dark',
      name: '🖤 深黑',
      c1: '#ffffff',
      c3: '#707070',
    },
    {
      id: 'pure',
      name: '🤍 纯白',
      c1: '#e8e8ee',
      c3: '#d8d8e0',
    },
    {
      id: 'mint',
      name: '🌿 薄荷绿',
      c1: '#a8e6cf',
      c3: '#5ab7b0',
    },
    {
      id: 'sunset',
      name: '🧡 落日橘',
      c1: '#ff9966',
      c3: '#ff7eb3',
    },
  ];

  function loadThemeNames() {
    try {
      return JSON.parse(localStorage.getItem(K_THEME_NAMES)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveThemeNames(obj) {
    try {
      localStorage.setItem(K_THEME_NAMES, JSON.stringify(obj));
    } catch (e) {}
  }

  function getThemeName(id, defaultName) {
    const names = loadThemeNames();
    return names[id] || defaultName;
  }

  function applyTheme(id) {
    const p = document.getElementById('shop-panel');
    if (!p) return;
    if (!id || id === 'sakura') p.removeAttribute('data-theme');
    else p.dataset.theme = id;
    try {
      localStorage.setItem(K_THEME, id || 'sakura');
    } catch (e) {}
  }

  function openThemeMenu(anchor) {
    document.querySelectorAll('.shop-theme-menu').forEach((m) => m.remove());
    const menu = document.createElement('div');
    menu.className = 'shop-theme-menu';
    let current = 'sakura';
    try {
      current = localStorage.getItem(K_THEME) || 'sakura';
    } catch (e) {}
    let html = '<div class="shop-theme-menu-title">🎨 主题色</div>';
    THEMES.forEach((t) => {
      const displayName = getThemeName(t.id, t.name);
      html +=
        '<div class="shop-theme-item' +
        (t.id === current ? ' active' : '') +
        '" data-theme-id="' +
        t.id +
        '">' +
        '<span class="shop-theme-dot" style="background:linear-gradient(135deg,' +
        t.c1 +
        ',' +
        t.c3 +
        ');"></span>' +
        '<span class="shop-theme-name">' +
        escapeHtml(displayName) +
        '</span>' +
        '<span class="shop-theme-rename" data-rename-id="' +
        t.id +
        '">✎</span>' +
        '</div>';
    });
    menu.innerHTML = html;
    applyThemeVars(menu);
    document.body.appendChild(menu);

    const rect = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth || 200;
    const mh = menu.offsetHeight || 360;
    let left = Math.max(
      8,
      Math.min(window.innerWidth - mw - 8, rect.right - mw),
    );
    let top = rect.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 6);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    menu.querySelectorAll('.shop-theme-item').forEach((item) => {
      item.onclick = (e) => {
        if (e.target.classList.contains('shop-theme-rename')) return;
        applyTheme(item.dataset.themeId);
        menu.remove();
        toast('主题已切换');
      };
    });
    menu.querySelectorAll('.shop-theme-rename').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.renameId;
        const t = THEMES.find((x) => x.id === id);
        if (!t) return;
        const curName = getThemeName(id, t.name);
        const newName = prompt('给这个主题起个新名字：', curName);
        if (!newName || !newName.trim()) return;
        const names = loadThemeNames();
        names[id] = newName.trim();
        saveThemeNames(names);
        menu.remove();
        openThemeMenu(anchor);
      };
    });
    setTimeout(() => {
      const close = (e) => {
        if (!menu.contains(e.target) && e.target !== anchor) {
          menu.remove();
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }

  function applyThemeVars(el) {
    if (!el) return;
    const panelEl = document.getElementById('shop-panel');
    if (!panelEl) return;
    const cs = getComputedStyle(panelEl);
    [
      '--t-c1',
      '--t-c2',
      '--t-c3',
      '--t-main',
      '--t-glow',
      '--t-soft',
      '--t-border-light',
      '--t-border',
      '--t-hover',
    ].forEach((k) => {
      const v = cs.getPropertyValue(k).trim();
      if (v) el.style.setProperty(k, v);
    });
    // 深色主题时同步标记，让下拉菜单/弹层深色适配生效
    const themeAttr = panelEl.getAttribute('data-theme') || 'sakura';
    el.setAttribute('data-parent-theme', themeAttr);
  }

  /* ============ 数据备份 / 恢复 ============ */
  const BACKUP_KEYS = [
    'shop_state_v4',
    'shop_purchased_v4',
    'shop_pos_v4',
    'shop_folder_name_v4',
    'shop_favs_v4',
    'shop_theme_v4',
    'shop_theme_names_v4',
    'shop_items_v4',
    'shop_username_v4',
    'shop_playlist_v4',
    'shop_playmode_v4',
    'shop_overrides_v4',
    'shop_tasks_v4',
    'shop_tasks_date_v4',
    'shop_tasks_locked_v4',
    'shop_coupons_v4',
    'shop_coupon_claimed_v4',
    'shop_price_overrides_v4',
    'shop_hide_start_v4',
    'shop_lyric_passes_v4',
    'shop_unlocked_lyrics_v4',
    'shop_cat_sing_extra_v4',
    'shop_cat_sing_use_v4',
    'shop_bing_count_v4',
    'shop_cat_full_song_v4',
    'shop_art_palace_v4',
    'shop_tags_snapshot_v4',
    'shop_lyrics_v4',
    'shop_ball_pos_v4',
    'shop_palace_sync_v4',
    'shop_palace_bubble_v4',
    'shop_palace_smart_v4',
    'shop_palace_ctrl_min_v4',
    'shop_palace_nolyric_v4',
    'shop_palace_decodensity_v4',
    'shop_palace_textdensity_v4',
    'shop_palace_rate_v4',
    'shop_palace_ctrl_pos_v4',
    'shop_palace_min_ball_pos_v4',
    'shop_lyrics_collapsed_v4',
    'shop_privacy_agreed_v1',
  ];

  function exportData() {
    const data = {};
    BACKUP_KEYS.forEach((k) => {
      try {
        const v = localStorage.getItem(k);
        if (v !== null) data[k] = v;
      } catch (e) {}
    });
    data['__export_time__'] = new Date().toISOString();
    data['__version__'] = '6.2';
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.download = '艺学小站备份-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('备份已下载～');
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data || typeof data !== 'object') {
            toast('文件格式不正确');
            return;
          }
          const keys = Object.keys(data).filter(
            (k) => k.indexOf('shop_') === 0,
          );
          if (keys.length === 0) {
            toast('文件里没有可恢复的数据');
            return;
          }
          showConfirm(
            '导入备份',
            '即将从备份恢复 ' +
              keys.length +
              ' 项数据。\n\n这会覆盖你当前的数据，\n建议先导出一次当前数据。\n\n确定继续吗？',
            () => {
              keys.forEach((k) => {
                try {
                  localStorage.setItem(k, data[k]);
                } catch (e) {}
              });
              toast('导入成功，正在刷新…');
              setTimeout(() => location.reload(), 800);
            },
          );
        } catch (e) {
          toast('读取失败：' + e.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function showAbout() {
    document
      .querySelectorAll('.shop-confirm-mask')
      .forEach((el) => el.remove());
    const mask = document.createElement('div');
    mask.className = 'shop-confirm-mask';
    mask.innerHTML =
      '<div class="shop-confirm-box">' +
      '<div class="shop-confirm-title">♡ 艺学小站 ♡</div>' +
      '<div class="shop-confirm-content">' +
      `📌 版本：v6.2
✍️ 作者：小柳Terra / DeepSeek老师
🍪赞助：餅餅
📖 简介：把本地音乐库变成一个艺术小店，学习艺术相融合喵～

✨ 功能：
· 本地音乐商店，攒学币购曲
· 猫老板陪同、音乐互动
· 收藏夹 / 播放列表 / 歌词滚动
· 10 套主题色随意换

🔐 隐私说明（请务必阅读）
① 本脚本没有作者自建服务器，不会把你的任何数据上传到作者服务器。
② 歌词搜索：播放歌曲时，脚本会把“歌名 + 歌手”发送到网易云音乐 music.163.com 搜索歌词。不会上传你的音频文件本身。
③ B站头像：脚本会读取本站 Cookie 中的 DedeUserID，仅用于在页面内匹配你本人的头像元素，不会上传。
④ 本地音乐文件夹：脚本只读取你主动选择的音乐文件夹，不会修改、删除或上传你的音乐文件。
⑤ 第三方库：脚本会从 CDN 加载 jsmediatags 等第三方库，CDN 可能会获取你的 IP、浏览器 UA 等常规网络信息。
⑥ 若你介意以上任何一条，请不要使用本脚本。

💾 数据管理
· 本地保存内容：用户名、学币、购买记录、收藏夹、播放列表、歌词缓存、封面缓存、文件夹名、设置等。
· 存储位置：浏览器 localStorage / IndexedDB（域名 bilibili.com 下）。
· 丢失场景：清除 B 站站点数据或浏览器缓存后会一并丢失。

⚠️⚠️⚠️ 请务必记得备份 ⚠️⚠️⚠️
· 数据只存在你这台电脑的浏览器里，作者无法帮你找回。
· 换电脑、重装系统、清缓存、换浏览器，数据都会丢。
· 请点下方「📤 导出备份」按钮，把 json 文件存到安全的地方（网盘 / U盘 / 其他文件夹）。
· 需要时用「📥 导入备份」恢复即可。

· 手动清除：浏览器设置里清除 bilibili.com 的站点数据；或删除 localStorage / IndexedDB 中 shop_* 与 shop_db_v4 相关数据。

⚠️ 注意事项
· 需要 Chrome / Edge 桌面浏览器，并安装 Tampermonkey / Violentmonkey。
· 手机浏览器不支持读取本地文件夹，请勿在手机安装使用。
· 歌词来自网易云非官方接口，可能失效或被风控。
· 若歌词搜索失败，可在音乐文件夹里放同名 .lrc 文件，脚本会自动读取。
· 请遵守 B 站、网易云音乐的使用条款及你所在地区的法律法规。

🛠️ v6.0 优化记录
· 网易云歌词请求加了 8 秒超时，网络不好不会卡死
· 本地歌词缓存过大时自动清理，避免撑爆 localStorage
· 标签读取失败时不再反复重试，避免浪费资源
· 深色主题下按钮文字颜色修复，看得更清楚
· 播放列表切换歌曲时加入去重，不会重复添加
· 首次使用会弹一次隐私提醒，你可以随时选择不用

📜 免责声明
· 本脚本与哔哩哔哩官方、网易云音乐官方均无关联。
· 本脚本不提供、不内置、不下载任何音乐文件，仅管理你本地已有的音乐。
· 歌词、封面等版权归原权利人所有，仅供个人学习与欣赏。
· 本脚本仅供个人学习、研究、娱乐使用，使用风险由使用者自行承担。
· 请勿将本脚本用于商业用途或任何侵权用途。

🌸 反馈 / 支持：
<a class="shop-about-link" href="https://search.bilibili.com/all?keyword=你被骗了喵" target="_blank" rel="noopener">→ 前往哔哩哔哩 ←</a>
感谢使用喵～` +
      '</div>' +
      '<div class="shop-confirm-btns" style="flex-wrap:wrap;">' +
      '<button class="shop-about-backup" style="background:#e8f0ff;color:#4a6ac9;padding:7px 14px;border:none;border-radius:10px;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;">📤 导出备份</button>' +
      '<button class="shop-about-restore" style="background:#ffe8f0;color:#c94a6a;padding:7px 14px;border:none;border-radius:10px;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;">📥 导入备份</button>' +
      '<button class="shop-confirm-ok">知道了</button>' +
      '</div>' +
      '</div>';
    applyThemeVars(mask);
    document.body.appendChild(mask);
    mask.querySelector('.shop-about-backup').onclick = () => exportData();
    mask.querySelector('.shop-about-restore').onclick = () => importData();
    mask.querySelector('.shop-confirm-ok').onclick = () => mask.remove();
    mask.onclick = (e) => {
      if (e.target === mask) mask.remove();
    };
  }
  /* ============ 确认弹窗 ============ */
  function showConfirm(title, content, onOk) {
    document
      .querySelectorAll('.shop-confirm-mask')
      .forEach((el) => el.remove());
    const mask = document.createElement('div');
    mask.className = 'shop-confirm-mask';
    mask.innerHTML =
      '<div class="shop-confirm-box">' +
      '<div class="shop-confirm-title">' +
      escapeHtml(title) +
      '</div>' +
      '<div class="shop-confirm-content">' +
      escapeHtml(content) +
      '</div>' +
      '<div class="shop-confirm-btns">' +
      '<button class="shop-confirm-cancel">取消</button>' +
      '<button class="shop-confirm-ok">确定</button>' +
      '</div>' +
      '</div>';
    applyThemeVars(mask);
    document.body.appendChild(mask);
    const cancel = mask.querySelector('.shop-confirm-cancel');
    const ok = mask.querySelector('.shop-confirm-ok');
    cancel.onclick = () => mask.remove();
    ok.onclick = () => {
      mask.remove();
      if (typeof onOk === 'function') onOk();
    };
    mask.onclick = (e) => {
      if (e.target === mask) mask.remove();
    };
  }
  /* ============ Toast & 特效 ============ */
  function toast(msg, ms) {
    const el = document.createElement('div');
    el.className = 'shop-toast';
    el.style.cssText =
      'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);padding:8px 18px;' +
      'background:linear-gradient(135deg,var(--t-c1),var(--t-c3));color:#fff;border-radius:16px;' +
      'font-size:11px;font-weight:600;z-index:2147483647;pointer-events:none;' +
      'box-shadow:0 6px 20px var(--t-glow);opacity:0;transition:opacity .3s;';
    el.textContent = msg;
    applyThemeVars(el);
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
    });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 320);
    }, ms || 1800);
  }

  function spawnHearts() {
    const emojis = ['💖', '✨', '⭐', '🌸', '💫', '🎀', '💝'];
    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        el.style.cssText =
          'position:fixed;left:50%;top:50%;font-size:' +
          (16 + Math.random() * 14) +
          'px;pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);';
        document.body.appendChild(el);
        const angle = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 160;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        el.animate(
          [
            {
              transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)',
              opacity: 1,
            },
            {
              transform:
                'translate(calc(-50% + ' +
                dx +
                'px), calc(-50% + ' +
                dy +
                'px)) scale(1.4) rotate(' +
                Math.random() * 360 +
                'deg)',
              opacity: 0,
            },
          ],
          {
            duration: 1100,
            easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)',
          },
        ).onfinish = () => el.remove();
      }, i * 40);
    }
  }
  // 霓虹提示——UI 正中央弹出，随机颜色
  function neonFlash(text) {
    const panel = document.getElementById('shop-panel');
    if (!panel) return;
    const hue = Math.floor(Math.random() * 360);
    const hue2 = (hue + 40) % 360;
    const color = 'hsl(' + hue + ', 100%, 65%)';
    const color2 = 'hsl(' + hue2 + ', 100%, 65%)';
    const el = document.createElement('div');
    el.className = 'shop-neon';
    el.textContent = text;
    el.style.color = color;
    el.style.textShadow =
      '0 0 10px ' +
      color +
      ', 0 0 20px ' +
      color +
      ', 0 0 40px ' +
      color2 +
      ', 0 0 80px ' +
      color2;
    panel.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 1600);
  }

  /* ============ 音频可视化系统 ============ */
  let vizAudioCtx = null;
  let vizAnalyser = null;
  let vizSource = null;
  let vizDataArray = null;
  let vizRAF = null;
  let vizCanvas = null;
  let vizCanvasCtx = null;

  // 效果层注册表：后续加新效果只需要往这里推一条
  // needItem: 需要哪个道具处于 active 状态
  // drawFn: (ctx, data, w, h, t) => void
  const VIZ_LAYERS = [];

  function registerVizLayer(id, needItem, drawFn) {
    VIZ_LAYERS.push({
      id,
      needItem,
      drawFn,
    });
  }

  function isVizEnabled() {
    return !!(
      INVENTORY.audioviz &&
      INVENTORY.audioviz.owned &&
      INVENTORY.audioviz.active
    );
  }

  function ensureVizAudio() {
    if (vizAudioCtx && vizAnalyser) {
      if (vizAudioCtx.state === 'suspended') {
        vizAudioCtx.resume().catch(() => {});
      }
      return true;
    }
    const audio = document.getElementById('shop-audio');
    if (!audio) return false;
    try {
      if (!vizAudioCtx) {
        vizAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (!vizSource) {
        vizSource = vizAudioCtx.createMediaElementSource(audio);
      }
      if (!vizAnalyser) {
        vizAnalyser = vizAudioCtx.createAnalyser();
        vizAnalyser.fftSize = 128;
        vizAnalyser.smoothingTimeConstant = 0.75;
        vizSource.connect(vizAnalyser);
        vizAnalyser.connect(vizAudioCtx.destination);
      }
      if (!vizDataArray) {
        vizDataArray = new Uint8Array(vizAnalyser.frequencyBinCount);
      }
      if (vizAudioCtx.state === 'suspended') {
        vizAudioCtx.resume().catch(() => {});
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function startVizLoop() {
    if (vizRAF) return;
    if (!isVizEnabled()) return;
    if (!vizCanvas) vizCanvas = document.getElementById('magic-viz');
    if (!vizCanvas) return;
    if (!vizCanvasCtx) vizCanvasCtx = vizCanvas.getContext('2d');
    if (!ensureVizAudio()) return;
    const loop = () => {
      if (!isVizEnabled()) {
        stopVizLoop();
        return;
      }
      drawVizFrame();
      vizRAF = requestAnimationFrame(loop);
    };
    vizRAF = requestAnimationFrame(loop);
  }

  function stopVizLoop() {
    if (vizRAF) {
      cancelAnimationFrame(vizRAF);
      vizRAF = null;
    }
    if (vizCanvasCtx && vizCanvas) {
      vizCanvasCtx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
    }
  }

  function drawVizFrame() {
    if (!vizCanvas || !vizCanvasCtx || !vizAnalyser || !vizDataArray) return;
    const wrap = vizCanvas.parentElement;
    if (!wrap) return;
    const cssW = wrap.clientWidth || 400;
    const cssH = wrap.clientHeight || 36;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.floor(cssW * dpr);
    const targetH = Math.floor(cssH * dpr);
    if (vizCanvas.width !== targetW) vizCanvas.width = targetW;
    if (vizCanvas.height !== targetH) vizCanvas.height = targetH;
    vizCanvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cssW;
    const h = cssH;
    vizAnalyser.getByteFrequencyData(vizDataArray);
    vizCanvasCtx.clearRect(0, 0, w, h);
    const t = performance.now() / 1000;
    VIZ_LAYERS.forEach((layer) => {
      const inv = INVENTORY[layer.needItem];
      if (!inv || !inv.owned || !inv.active) return;
      try {
        layer.drawFn(vizCanvasCtx, vizDataArray, w, h, t);
      } catch (e) {}
    });
  }

  /* —— 效果层 1：基础柱状频谱 —— */
  registerVizLayer('bars', 'audioviz', (ctx, data, w, h) => {
    const vizRoot =
      magicUIEls && magicUIEls.root
        ? magicUIEls.root
        : document.getElementById('shop-panel');
    const cs = vizRoot ? getComputedStyle(vizRoot) : null;
    const c1 = cs
      ? cs.getPropertyValue('--mp-color1').trim() || '#ffb8d9'
      : '#ffb8d9';
    const c3 = cs
      ? cs.getPropertyValue('--mp-color2').trim() || '#c8a2ff'
      : '#c8a2ff';
    const bars = 28;
    const step = w / bars;
    const barW = Math.max(2, step * 0.62);
    const offset = (step - barW) / 2;
    for (let i = 0; i < bars; i++) {
      const v = data[Math.floor((i * data.length) / bars)] / 255;
      const bh = Math.max(2, v * h);
      const x = i * step + offset;
      const y = h - bh;
      const grad = ctx.createLinearGradient(0, h, 0, y);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c3);
      ctx.fillStyle = grad;
      const r = barW / 2;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, h);
      ctx.closePath();
      ctx.fill();
    }
  });

  /* —— 效果层 2：彩虹律动（叠加在柱子上）—— */
  registerVizLayer('rainbow', 'audiorainbow', (ctx, data, w, h, t) => {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const bars = 28;
    const step = w / bars;
    for (let i = 0; i < bars; i++) {
      const v = data[Math.floor((i * data.length) / bars)] / 255;
      if (v < 0.05) continue;
      const hue = (t * 120 + (i * 360) / bars) % 360;
      const x = i * step;
      const bh = Math.max(2, v * h);
      const y = h - bh;
      ctx.fillStyle = 'hsl(' + hue + ', 90%, 60%)';
      ctx.fillRect(x, y, step, bh);
    }
    ctx.restore();
  });

  /* ============ 魔法乐星 - 自绘播放器 ============ */
  let magicUIEls = null;
  let magicColorCache = {};

  function extractCoverColor(imgUrl, callback) {
    if (magicColorCache[imgUrl]) return callback(magicColorCache[imgUrl]);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 40, 40);
        const data = ctx.getImageData(0, 0, 40, 40).data;

        const hueBuckets = {};
        let graySum = 0,
          grayCount = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i],
            g = data[i + 1],
            b = data[i + 2];
          const max = Math.max(r, g, b),
            min = Math.min(r, g, b);
          const l = (max + min) / 2;
          if (l < 30 || l > 225) continue;
          const d = max - min;
          const s = max === 0 ? 0 : d / 255;
          if (s < 0.2) continue;
          let h;
          if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
          else if (max === g) h = ((b - r) / d + 2) * 60;
          else h = ((r - g) / d + 4) * 60;
          const bucket = Math.floor(h / 30);
          if (!hueBuckets[bucket])
            hueBuckets[bucket] = {
              r: 0,
              g: 0,
              b: 0,
              w: 0,
            };
          hueBuckets[bucket].r += r * s;
          hueBuckets[bucket].g += g * s;
          hueBuckets[bucket].b += b * s;
          hueBuckets[bucket].w += s;
        }

        // 顺便统计一遍灰度均值（用于黑白封面判定）
        for (let i = 0; i < data.length; i += 4) {
          graySum += (data[i] + data[i + 1] + data[i + 2]) / 3;
          grayCount++;
        }
        const grayAvg = grayCount ? Math.round(graySum / grayCount) : 128;

        let best = null,
          bestW = 0;
        for (const k in hueBuckets) {
          if (hueBuckets[k].w > bestW) {
            bestW = hueBuckets[k].w;
            best = hueBuckets[k];
          }
        }

        let color;
        let achromatic = false;
        if (best && bestW > 0) {
          color = {
            r: Math.round(best.r / best.w),
            g: Math.round(best.g / best.w),
            b: Math.round(best.b / best.w),
          };
        } else {
          // 挑不出彩色 → 这是黑白封面
          color = {
            r: grayAvg,
            g: grayAvg,
            b: grayAvg,
            achromatic: true,
          };
          achromatic = true;
        }
        const result = achromatic
          ? Object.assign({}, color, {
              achromatic: true,
            })
          : color;
        magicColorCache[imgUrl] = result;
        callback(result);
      } catch (e) {
        callback(null);
      }
    };
    img.onerror = () => callback(null);
    img.src = imgUrl;
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    let h,
      s,
      l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return {
      h: h * 360,
      s: s * 100,
      l: l * 100,
    };
  }

  function applyMagicColor(color) {
    if (!magicUIEls) return;
    const root = magicUIEls.root;
    if (!color) {
      root.style.setProperty('--mp-color1', '#ffb8d9');
      root.style.setProperty('--mp-color2', '#c8a2ff');
      if (root.parentElement) {
        root.parentElement.style.setProperty('--mp-color1', '#ffb8d9');
        root.parentElement.style.setProperty('--mp-color2', '#c8a2ff');
      }
      return;
    }
    const hsl = rgbToHsl(color.r, color.g, color.b);
    // 高饱和、适中的亮度，主色调鲜艳
    const h1 = Math.round(hsl.h);
    const h2 = Math.round((hsl.h + 40) % 360); // 相邻色，做出渐变对比
    const c1 = 'hsl(' + h1 + ', 85%, 62%)'; // 主色：高饱和中亮度
    const c2 = 'hsl(' + h2 + ', 80%, 48%)'; // 辅色：更暗一档
    root.style.setProperty('--mp-color1', c1);
    root.style.setProperty('--mp-color2', c2);
    if (root.parentElement) {
      root.parentElement.style.setProperty('--mp-color1', c1);
      root.parentElement.style.setProperty('--mp-color2', c2);
    }
  }

  function buildMagicPlayer() {
    const player = document.getElementById('shop-player');
    if (!player || document.getElementById('magic-player-ui')) return;
    const wrap = document.createElement('div');
    wrap.className = 'magic-player';
    wrap.id = 'magic-player-ui';
    wrap.innerHTML =
      '<div class="magic-player-cover-row">' +
      '<img class="magic-player-cover" id="magic-cover" src="" />' +
      '<div class="magic-player-info">' +
      '<div class="magic-player-title" id="magic-title">未播放</div>' +
      '<div class="magic-player-artist" id="magic-artist">—</div>' +
      '</div>' +
      '</div>' +
      '<div class="magic-progress-wrap" id="magic-progress-wrap">' +
      '<div class="magic-progress-bg"><div class="magic-progress-fill" id="magic-fill"></div></div>' +
      '<div class="magic-progress-knob" id="magic-knob"></div>' +
      '</div>' +
      '<div class="magic-times">' +
      '<span id="magic-cur">0:00</span>' +
      '<span id="magic-dur">0:00</span>' +
      '</div>' +
      '<div class="magic-lyrics-toggle" id="magic-lyrics-toggle" title="折叠歌词">⌄</div>' +
      '<div class="magic-lyrics-wrap" id="magic-lyrics-wrap">' +
      '<div class="magic-lyrics" id="magic-lyrics"></div>' +
      '</div>' +
      '<div class="magic-viz-wrap" id="magic-viz-wrap">' +
      '<canvas class="magic-viz" id="magic-viz"></canvas>' +
      '</div>' +
      '<div class="magic-controls">' +
      '<button class="magic-btn magic-extra" id="magic-playlist-btn" title="播放列表">📋</button>' +
      '<button class="magic-btn" id="magic-prev">⏮</button>' +
      '<button class="magic-btn magic-play" id="magic-play">▶</button>' +
      '<button class="magic-btn" id="magic-next">⏭</button>' +
      '<button class="magic-btn magic-extra" id="magic-mode-btn" title="播放模式">🔁</button>' +
      '</div>';
    player.insertBefore(wrap, player.firstChild);

    magicUIEls = {
      root: wrap,
      cover: wrap.querySelector('#magic-cover'),
      title: wrap.querySelector('#magic-title'),
      artist: wrap.querySelector('#magic-artist'),
      fill: wrap.querySelector('#magic-fill'),
      knob: wrap.querySelector('#magic-knob'),
      cur: wrap.querySelector('#magic-cur'),
      dur: wrap.querySelector('#magic-dur'),
      play: wrap.querySelector('#magic-play'),
      prev: wrap.querySelector('#magic-prev'),
      next: wrap.querySelector('#magic-next'),
      progressWrap: wrap.querySelector('#magic-progress-wrap'),
      lyrics: wrap.querySelector('#magic-lyrics'),
      lyricsWrap: wrap.querySelector('#magic-lyrics-wrap'),
      lyricsToggle: wrap.querySelector('#magic-lyrics-toggle'),
    };

    const audio = document.getElementById('shop-audio');
    if (!audio) return;

    wrap.querySelector('#magic-playlist-btn').onclick = (e) => {
      e.stopPropagation();
      togglePlaylist();
    };
    wrap.querySelector('#magic-mode-btn').onclick = (e) => {
      e.stopPropagation();
      cyclePlaymode();
    };
    magicUIEls.modeBtn = wrap.querySelector('#magic-mode-btn');
    // 歌词折叠
    const lyricsToggle = magicUIEls.lyricsToggle;
    const lyricsWrap = magicUIEls.lyricsWrap;
    let lyricsCollapsed = false;
    try {
      lyricsCollapsed =
        localStorage.getItem('shop_lyrics_collapsed_v4') === '1';
    } catch (e) {}
    if (lyricsCollapsed) {
      lyricsWrap.classList.add('collapsed');
      lyricsToggle.classList.add('collapsed');
    }
    lyricsToggle.onclick = (e) => {
      e.stopPropagation();
      const isCollapsed = lyricsWrap.classList.contains('collapsed');
      if (isCollapsed) {
        const song = SONGS[currentIdx];
        if (song && !UNLOCKED_LYRICS[song.key]) {
          if (LYRIC_PASSES > 0) {
            showConfirm(
              '🎫 解锁歌词',
              '用一张启页券，\n永久解锁这首歌的歌词页？\n\n当前持有：' +
                LYRIC_PASSES +
                ' 张',
              () => {
                LYRIC_PASSES--;
                try {
                  localStorage.setItem(K_LYRIC_PASSES, String(LYRIC_PASSES));
                } catch (e) {}
                UNLOCKED_LYRICS[song.key] = Date.now();
                try {
                  localStorage.setItem(
                    K_UNLOCKED_LYRICS,
                    JSON.stringify(UNLOCKED_LYRICS),
                  );
                } catch (e) {}
                lyricsWrap.classList.remove('collapsed');
                lyricsToggle.classList.remove('collapsed');
                renderLyrics();
                neonFlash('歌词页已解锁！');
              },
            );
          } else {
            showConfirm(
              '需要启页券',
              '这首歌的页面还没解锁～\n\n需要一张「启页券」（3 学币）\n去道具铺买吗？',
              () => {
                viewMode = 'items';
                currentFav = null;
                updateNavActive();
                updateSearchVisibility();
                renderContent();
              },
            );
          }
          return;
        }
      }
      lyricsWrap.classList.toggle('collapsed');
      lyricsToggle.classList.toggle('collapsed');
      try {
        localStorage.setItem(
          'shop_lyrics_collapsed_v4',
          lyricsWrap.classList.contains('collapsed') ? '1' : '0',
        );
      } catch (e) {}
    };
    magicUIEls.play.onclick = () => {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    };
    magicUIEls.prev.onclick = () => {
      const prev = getPrevSongIdx();
      if (prev >= 0) playSong(prev);
    };
    magicUIEls.next.onclick = () => {
      const next = getNextSongIdx();
      if (next >= 0) playSong(next);
    };
    magicUIEls.progressWrap.onclick = (e) => {
      if (!audio.duration) return;
      const rect = magicUIEls.progressWrap.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      audio.currentTime = Math.max(
        0,
        Math.min(audio.duration * pct, audio.duration),
      );
    };
    audio.addEventListener('timeupdate', updateMagicProgress);
    audio.addEventListener('timeupdate', renderLyrics);
    audio.addEventListener('seeked', () => {
      const song = SONGS[currentIdx];
      if (song && LYRICS[song.key]) LYRICS[song.key]._lastIdx = -1;
      renderLyrics();
    });
    audio.addEventListener('loadedmetadata', updateMagicProgress);
    audio.addEventListener('play', () => {
      if (magicUIEls) magicUIEls.play.textContent = '⏸';
      if (isVizEnabled()) startVizLoop();
    });
    audio.addEventListener('pause', () => {
      stopVizLoop();
    });
    audio.addEventListener('ended', () => {
      stopVizLoop();
    });
    audio.addEventListener('pause', () => {
      if (magicUIEls) magicUIEls.play.textContent = '▶';
    });
    audio.addEventListener('ended', () => {
      if (magicUIEls) magicUIEls.play.textContent = '▶';
    });
  }

  function getPrevSongIdx() {
    if (currentIdx < 0) return -1;
    const currentKey = SONGS[currentIdx].key;
    const listKeys =
      PLAYLIST.length > 0
        ? PLAYLIST
        : SONGS.filter((s) => s.owned).map((s) => s.key);
    const pos = listKeys.indexOf(currentKey);
    if (INVENTORY.symphony.owned && PLAYMODE === 'random') {
      const owned = SONGS.map((s, i) => ({
        s,
        i,
      })).filter((x) => x.s.owned);
      if (owned.length === 0) return -1;
      return owned[Math.floor(Math.random() * owned.length)].i;
    }
    if (pos < 0) {
      for (let i = currentIdx - 1; i >= 0; i--) if (SONGS[i].owned) return i;
      return -1;
    }
    const prevKey = listKeys[(pos - 1 + listKeys.length) % listKeys.length];
    return SONGS.findIndex((s) => s.key === prevKey);
  }

  function fmtSec(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function updateMagicProgress() {
    if (!magicUIEls) return;
    const audio = document.getElementById('shop-audio');
    if (!audio) return;
    const dur = audio.duration || 0;
    const cur = audio.currentTime || 0;
    const pct = dur > 0 ? (cur / dur) * 100 : 0;
    magicUIEls.fill.style.width = pct + '%';
    magicUIEls.knob.style.left = pct + '%';
    magicUIEls.cur.textContent = fmtSec(cur);
    magicUIEls.dur.textContent = fmtSec(dur);
  }

  function updateMagicUI(song) {
    if (!magicUIEls) return;
    magicUIEls.cover.src = song.coverUrl;
    magicUIEls.title.textContent = song.name;
    magicUIEls.artist.textContent = song.artist || '未知艺术家';
    magicUIEls.root.style.setProperty(
      '--mp-cover',
      'url("' + song.coverUrl + '")',
    );
    extractCoverColor(song.coverUrl, applyMagicColor);
    const audio = document.getElementById('shop-audio');
    if (audio) magicUIEls.play.textContent = audio.paused ? '▶' : '⏸';
  }

  function playFavAll(favName) {
    if (!favName || !FAVS[favName]) return;
    const keys = FAVS[favName].filter((k) => {
      const song = SONGS.find((s) => s.key === k);
      return song && song.owned;
    });
    if (keys.length === 0) {
      neonFlash('收藏夹里还没有已购歌曲！');
      return;
    }
    PLAYLIST = keys.slice();
    savePlaylist();
    const firstIdx = SONGS.findIndex((s) => s.key === keys[0]);
    if (firstIdx >= 0) {
      playSong(firstIdx);
      neonFlash('已替换播放列表！');
    }
  }

  /* ============ 小球 ============ */
  const K_BALL_POS = 'shop_ball_pos_v4';
  const BALL_LINES = [
    '喵～',
    '(｡･ω･｡) 在呢',
    '=ω= 要拖动我吗',
    '喵喵！',
    '♪ 听歌吗',
  ];

  function applyBallColor(isBlue) {
    const b = document.getElementById('shop-ball');
    if (!b) return;
    b.classList.toggle('shop-ball-yellow', !isBlue);
  }

  function positionBallTip(b, tip) {
    const r = b.getBoundingClientRect();
    const tw = tip.offsetWidth || 80;
    let left = r.left + r.width / 2;
    if (left - tw / 2 < 8) left = tw / 2 + 8;
    if (left + tw / 2 > window.innerWidth - 8)
      left = window.innerWidth - tw / 2 - 8;
    let top = r.top - 34;
    if (top < 8) top = r.bottom + 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function checkFullscreenAndToggleBall() {
    const ball = document.getElementById('shop-ball');
    const tip = document.getElementById('shop-ball-tip');
    if (!ball) return;

    let isFullscreen = !!(
      document.fullscreenElement || document.webkitFullscreenElement
    );

    // 检测视频是否占满视口（B站网页全屏用这个判断最稳）
    if (!isFullscreen) {
      const videos = document.querySelectorAll('video');
      for (let i = 0; i < videos.length; i++) {
        const r = videos[i].getBoundingClientRect();
        if (
          r.width >= window.innerWidth * 0.95 &&
          r.height >= window.innerHeight * 0.95
        ) {
          isFullscreen = true;
          break;
        }
      }
    }

    // 兜底：B站网页全屏的 class
    if (!isFullscreen) {
      if (
        document.body.classList.contains('bpx-player-fullscreen') ||
        document.body.classList.contains('bilibili-player-fullscreen') ||
        document.documentElement.classList.contains('bpx-player-fullscreen')
      ) {
        isFullscreen = true;
      }
    }

    if (isFullscreen) {
      ball.style.display = 'none';
      if (tip) tip.classList.remove('show');
    } else {
      // 只有面板收起时才显示小球
      const panel = document.getElementById('shop-panel');
      if (panel && panel.classList.contains('shop-hidden')) {
        ball.style.display = 'flex';
      }
    }
  }

  function bindBallDrag(b, tip) {
    let dragging = false,
      moved = false;
    let sx = 0,
      sy = 0,
      sl = 0,
      st = 0;
    let tipTimer = null;

    b.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      sx = e.clientX;
      sy = e.clientY;
      const r = b.getBoundingClientRect();
      sl = r.left;
      st = r.top;
      b.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) moved = true;
      if (!moved) return;
      const nl = Math.max(
        0,
        Math.min(window.innerWidth - b.offsetWidth, sl + dx),
      );
      const nt = Math.max(
        0,
        Math.min(window.innerHeight - b.offsetHeight, st + dy),
      );
      b.style.left = nl + 'px';
      b.style.top = nt + 'px';
      b.style.right = 'auto';
      b.style.bottom = 'auto';
      positionBallTip(b, tip);
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      b.style.cursor = 'pointer';
      if (moved) {
        try {
          const r = b.getBoundingClientRect();
          localStorage.setItem(
            K_BALL_POS,
            JSON.stringify({
              l: r.left,
              t: r.top,
            }),
          );
        } catch (e) {}
      } else {
        const panelEl = document.getElementById('shop-panel');
        if (panelEl) {
          panelEl.classList.remove('shop-hidden');
          b.style.display = 'none';
          tip.classList.remove('show');
        }
      }
    });

    function showTip() {
      if (b.style.display === 'none') return;
      tip.textContent =
        BALL_LINES[Math.floor(Math.random() * BALL_LINES.length)];
      positionBallTip(b, tip);
      requestAnimationFrame(() => tip.classList.add('show'));
      tipTimer = setInterval(() => {
        tip.textContent =
          BALL_LINES[Math.floor(Math.random() * BALL_LINES.length)];
      }, 3000);
    }

    function hideTip() {
      if (tipTimer) {
        clearInterval(tipTimer);
        tipTimer = null;
      }
      tip.classList.remove('show');
    }
    b.addEventListener('mouseenter', showTip);
    b.addEventListener('mouseleave', hideTip);
  }

  /* ============ 数据 ============ */
  let SONGS = [];
  let currentIdx = -1;
  let panel = null,
    ball = null;
  let pos = null;
  let viewMode = 'all';
  let currentFav = null;
  let searchText = '';
  let lazyObserver = null;
  let currentIdxs = [];
  let visibleCount = CONFIG.PAGE_SIZE;
  let scrollBound = false;
  let catTalkTimer = null;
  let lastCatLine = null;
  let lastCatLineIdx = -1;
  let studyMsgActive = false;
  let studyMsgTimer = null;
  let studyActive = false;
  let studyMarked = false;
  let lastSample = null;
  let playlistOpen = false;

  try {
    pos = JSON.parse(localStorage.getItem(K_POS));
  } catch (e) {}

  /* ============ 用户名绑定 ============ */
  function bindUsernameInput() {
    const input = document.getElementById('shop-username-input');
    if (!input) return;
    input.value = USERNAME;
    input.addEventListener('input', () => {
      let v = input.value.slice(0, CONFIG.USERNAME_MAX_LEN);
      if (v !== input.value) input.value = v;
      USERNAME = v || CONFIG.DEFAULT_USERNAME;
      saveUsername();
      // 触发一次老板换台词
      if (viewMode === 'items') {
        const bubble = document.getElementById('shop-cat-bubble');
        if (bubble) {
          bubble.style.opacity = '0';
          setTimeout(() => {
            bubble.textContent = pickCatLine();
            bubble.style.opacity = '1';
          }, 260);
        }
      }
    });
    input.addEventListener('blur', () => {
      if (!input.value.trim()) {
        input.value = CONFIG.DEFAULT_USERNAME;
        USERNAME = CONFIG.DEFAULT_USERNAME;
        saveUsername();
      }
    });
  }

  /* ============ 猫老板台词 ============ */
  function pickRandom(arr) {
    if (!arr || arr.length === 0) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // 检查今天是不是节日
  function pickFestivalLine() {
    try {
      const now = new Date();
      const key = now.getMonth() + 1 + '-' + now.getDate();
      const lines = CAT_LINES_FESTIVAL[key];
      if (lines && lines.length > 0) {
        return lines[Math.floor(Math.random() * lines.length)];
      }
    } catch (e) {}
    return null;
  }

  // 检查用户名是不是某角色
  function pickCharacterLine() {
    try {
      const names = [USERNAME].filter(Boolean);
      for (const entry of CAT_LINES_CHARACTER) {
        for (const keyword of entry.match) {
          for (const n of names) {
            if (n.indexOf(keyword) >= 0) {
              return {
                face: entry.line.face,
                text: entry.line.text.replace(/\{name\}/g, n),
              };
            }
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function pickCatLine() {
    // ① 角色匹配（50% 概率触发）
    const charLine = pickCharacterLine();
    if (charLine && Math.random() < 0.08) {
      return charLine;
    }

    // ② 节日匹配（40% 概率触发）
    const festLine = pickFestivalLine();
    if (festLine && Math.random() < 0.4) {
      return festLine;
    }

    // ③ 护眼提醒（8% 概率触发，独立于其他逻辑）
    if (CAT_LINES_EYE_CARE.length > 0 && Math.random() < 0.05) {
      return CAT_LINES_EYE_CARE[
        Math.floor(Math.random() * CAT_LINES_EYE_CARE.length)
      ];
    }

    // ★ B站搜索框占位文字（只在主页触发，视频页不说）
    const isHome =
      location.pathname === '/' || location.pathname === '/index.html';
    const hint = isHome ? getSearchHint() : '';
    // ★ B站头像 —— 小概率 cue 一下
    const avatar = getBiliAvatar();
    if (avatar && Math.random() < 0.08) {
      const line =
        CAT_LINES_AVATAR[Math.floor(Math.random() * CAT_LINES_AVATAR.length)];
      return { face: line.face, text: line.text, avatar: avatar };
    }
    if (hint && Math.random() < 0.4) {
      const line =
        CAT_LINES_SEARCH_HINT[
          Math.floor(Math.random() * CAT_LINES_SEARCH_HINT.length)
        ];
      return {
        face: line.face,
        text: line.text.replace(/\{hint\}/g, hint),
      };
    }

    // ④ 原有的逻辑从这里开始
    if (SONGS.length === 0 && Math.random() < 0.7) {
      return (
        CAT_LINES.find((l) => l.text.indexOf('吃不起饭') >= 0) || CAT_LINES[0]
      );
    }
    if (USERNAME.length >= CONFIG.USERNAME_MAX_LEN && Math.random() < 0.12) {
      return CAT_LINES_LONGNAME[
        Math.floor(Math.random() * CAT_LINES_LONGNAME.length)
      ];
    }

    // 只有读完 ID3 标签的歌，才能被老板喵拿来聊
    const taggedSongs = SONGS.filter((s) => s._tagsLoaded && s._tagName);
    const taggedArtists = SONGS.filter(
      (s) => s._tagsLoaded && s._tagArtist && s._tagArtist.trim(),
    );

    const r = Math.random();
    if (taggedSongs.length > 0 && r < 0.4) {
      const song = taggedSongs[Math.floor(Math.random() * taggedSongs.length)];
      const pool = CAT_LINES.filter((l) => l.text.indexOf('{song}') >= 0);
      const line = pool[Math.floor(Math.random() * pool.length)];
      return {
        face: line.face,
        text: line.text
          .replace(/\{user\}/g, getUserDisplay())
          .replace(/\{song\}/g, song._tagName),
      };
    }
    if (r < 0.7) {
      const pool = CAT_LINES.filter(
        (l) =>
          l.text.indexOf('{user}') >= 0 &&
          l.text.indexOf('{song}') < 0 &&
          l.text.indexOf('{artist}') < 0,
      );
      const line = pool[Math.floor(Math.random() * pool.length)];
      return {
        face: line.face,
        text: line.text.replace(/\{user\}/g, getUserDisplay()),
      };
    }
    if (taggedArtists.length > 0 && r < 0.75) {
      const song =
        taggedArtists[Math.floor(Math.random() * taggedArtists.length)];
      const artist = getRandomArtist(song._tagArtist);
      if (artist) {
        const pool = CAT_LINES.filter((l) => l.text.indexOf('{artist}') >= 0);
        const line = pool[Math.floor(Math.random() * pool.length)];
        return {
          face: line.face,
          text: line.text
            .replace(/\{user\}/g, getUserDisplay())
            .replace(/\{artist\}/g, artist),
        };
      }
    }
    const genericPool = CAT_LINES.filter((l) => l.text.indexOf('{') < 0);
    return genericPool[Math.floor(Math.random() * genericPool.length)];
  }

  /* ============ 恶搞道具「饼」============ */
  const BING_LINES = [
    {
      text: '感谢餅餅同学的赞助',
      emoji: '🥞',
      c1: '#ff7eb3',
      c2: '#c8a2ff',
    },
    {
      text: '太帅了林大人',
      emoji: '👑',
      c1: '#ffd93b',
      c2: '#ff8c42',
    },
    {
      text: '太帅了餅大人',
      emoji: '🌟',
      c1: '#39c5bb',
      c2: '#5ab7b0',
    },
    {
      text: '林同学宇宙第一萌',
      emoji: '💖',
      c1: '#ff4d6d',
      c2: '#ff9966',
    },
  ];

  function useBing() {
    if (BING_COUNT <= 0) {
      neonFlash('没有饼了喵～去道具铺买吧');
      return;
    }
    BING_COUNT--;
    saveBingCount();
    renderContent();
    bingExplosion();
  }

  function bingExplosion() {
    const positions = [
      {
        x: 22,
        y: 22,
      },
      {
        x: 78,
        y: 22,
      },
      {
        x: 22,
        y: 78,
      },
      {
        x: 78,
        y: 78,
      },
    ];
    BING_LINES.forEach((line, i) => {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'shop-bing-word';
        el.textContent = line.emoji + ' ' + line.text + ' ' + line.emoji;
        const pos = positions[i] || {
          x: 50,
          y: 50,
        };
        el.style.left = pos.x + '%';
        el.style.top = pos.y + '%';
        el.style.background =
          'linear-gradient(135deg, ' + line.c1 + ', ' + line.c2 + ')';
        el.style.color = '#fff';
        el.style.fontSize = 28 + Math.random() * 14 + 'px';
        document.body.appendChild(el);
        const rot = (Math.random() - 0.5) * 30;
        const jx = (Math.random() - 0.5) * 100;
        const jy = (Math.random() - 0.5) * 100;
        el.animate(
          [
            {
              transform:
                'translate(-50%, -50%) scale(0) rotate(' + rot + 'deg)',
              opacity: 0,
            },
            {
              transform:
                'translate(-50%, -50%) scale(1.3) rotate(' +
                (rot + 12) +
                'deg)',
              opacity: 1,
              offset: 0.15,
            },
            {
              transform:
                'translate(-50%, -50%) scale(1) rotate(' + rot + 'deg)',
              opacity: 1,
              offset: 0.3,
            },
            {
              transform:
                'translate(calc(-50% + ' +
                jx +
                'px), calc(-50% + ' +
                jy +
                'px)) scale(1.15) rotate(' +
                (rot - 10) +
                'deg)',
              opacity: 1,
              offset: 0.5,
            },
            {
              transform:
                'translate(calc(-50% + ' +
                -jx +
                'px), calc(-50% + ' +
                -jy +
                'px)) scale(0.95) rotate(' +
                (rot + 14) +
                'deg)',
              opacity: 1,
              offset: 0.7,
            },
            {
              transform:
                'translate(-50%, calc(-50% - 140px)) scale(1.5) rotate(' +
                (rot + 50) +
                'deg)',
              opacity: 0,
            },
          ],
          {
            duration: 2800,
            easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)',
          },
        ).onfinish = () => el.remove();
      }, i * 90);
    });

    // 饼 Emoji 大爆发
    for (let i = 0; i < 40; i++) {
      setTimeout(() => {
        const p = document.createElement('div');
        p.textContent = '🥞';
        // 每个饼的出生点随机分布在屏幕上
        const startX = 5 + Math.random() * 90; // 5% ~ 95%
        const startY = 5 + Math.random() * 90; // 5% ~ 95%
        p.style.cssText =
          'position:fixed;left:' +
          startX +
          'vw;top:' +
          startY +
          'vh;' +
          'font-size:' +
          (24 + Math.random() * 28) +
          'px;pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);' +
          'filter:drop-shadow(0 0 6px rgba(255,180,80,0.85));';
        document.body.appendChild(p);
        // 飞行方向随机
        const angle = Math.random() * Math.PI * 2;
        const dist = 120 + Math.random() * 320;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist - 60;
        const rot = (Math.random() - 0.5) * 900;
        p.animate(
          [
            {
              transform: 'translate(-50%,-50%) scale(0.3) rotate(0deg)',
              opacity: 1,
            },
            {
              transform:
                'translate(calc(-50% + ' +
                dx +
                'px), calc(-50% + ' +
                dy +
                'px)) scale(1.6) rotate(' +
                rot +
                'deg)',
              opacity: 1,
              offset: 0.6,
            },
            {
              transform:
                'translate(calc(-50% + ' +
                dx +
                'px), calc(-50% + ' +
                (dy + 220) +
                'px)) scale(1) rotate(' +
                (rot + 180) +
                'deg)',
              opacity: 0,
            },
          ],
          {
            duration: 1800 + Math.random() * 700,
            easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)',
          },
        ).onfinish = () => p.remove();
      }, i * 25);
    }

    // 粒子爆发
    const particles = ['✨', '⭐', '💫', '🌟', '🎉', '🎊', '💖'];
    for (let i = 0; i < 50; i++) {
      setTimeout(() => {
        const p = document.createElement('div');
        p.textContent = particles[Math.floor(Math.random() * particles.length)];
        p.style.cssText =
          'position:fixed;left:' +
          Math.random() * 100 +
          'vw;top:' +
          Math.random() * 100 +
          'vh;font-size:' +
          (18 + Math.random() * 22) +
          'px;pointer-events:none;z-index:2147483646;';
        document.body.appendChild(p);
        const dx = (Math.random() - 0.5) * 260;
        const dy = (Math.random() - 0.5) * 260;
        p.animate(
          [
            {
              transform: 'translate(0,0) scale(0) rotate(0deg)',
              opacity: 1,
            },
            {
              transform:
                'translate(' +
                dx +
                'px,' +
                dy +
                'px) scale(1.6) rotate(' +
                (Math.random() * 720 - 360) +
                'deg)',
              opacity: 0,
            },
          ],
          {
            duration: 1500 + Math.random() * 500,
            easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)',
          },
        ).onfinish = () => p.remove();
      }, i * 22);
    }
  }

  /* ============ 老板喵唱歌彩蛋 ============ */
  let catSingAudio = null;
  let catSingTimer = null;
  let catSingBusy = false;

  function spawnCatNotes() {
    const notes = ['🎵', '🎶', '♪', '♫', '🎤', '🎼'];
    const faces = [
      '(=^･ω･^=)',
      '(=^ω^=)',
      '(=◕ω◕=)',
      '(=✧ω✧=)',
      '(=★ω★=)',
      '(=^‥^=)',
      '(=๑•ω•๑=)',
      '(=^◕ᴥ◕^=)',
      '(=ↀωↀ=)',
      '喵～',
      '喵呜',
      '喵喵！',
    ];
    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        const boss = document.getElementById('shop-cat-boss');
        if (!boss || !boss.classList.contains('singing')) return;
        const rect = boss.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const el = document.createElement('div');

        const isFace = Math.random() < 0.35;
        const txt = isFace
          ? faces[Math.floor(Math.random() * faces.length)]
          : notes[Math.floor(Math.random() * notes.length)];
        const fs = isFace ? 11 + Math.random() * 7 : 18 + Math.random() * 16;
        const hue = Math.floor(Math.random() * 360);
        const extra = isFace
          ? 'color:hsl(' +
            hue +
            ', 80%, 55%);font-weight:700;font-family:"Courier New",Consolas,monospace;white-space:nowrap;'
          : '';

        el.textContent = txt;
        el.style.cssText =
          'position:fixed;left:' +
          cx +
          'px;top:' +
          cy +
          'px;font-size:' +
          fs +
          'px;pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);' +
          extra;
        document.body.appendChild(el);

        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
        const dist = 60 + Math.random() * 120;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const rot = isFace ? 0 : Math.random() * 180 - 90;
        el.animate(
          [
            {
              transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)',
              opacity: 1,
            },
            {
              transform:
                'translate(calc(-50% + ' +
                dx +
                'px), calc(-50% + ' +
                dy +
                'px)) scale(1.4) rotate(' +
                rot +
                'deg)',
              opacity: 0,
            },
          ],
          {
            duration: 1200 + Math.random() * 400,
            easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)',
          },
        ).onfinish = () => el.remove();
      }, i * 70);
    }
  }

  function stopCatSing() {
    if (catSingTimer) {
      clearTimeout(catSingTimer);
      catSingTimer = null;
    }
    if (catSingAudio) {
      catSingAudio.onended = null;
      try {
        catSingAudio.pause();
      } catch (e) {}
    }
    const b = document.getElementById('shop-cat-boss');
    if (b) b.classList.remove('singing');
    catSingBusy = false;
  }

  function catSing() {
    if (catSingBusy) return;
    stopCatFullSong();
    if (!SONGS || SONGS.length === 0) {
      neonFlash('喵喵没有曲子唱不了…');
      return;
    }
    const withFile = SONGS.filter((s) => s.file);
    if (withFile.length === 0) {
      neonFlash('喵喵没有曲子唱不了…');
      return;
    }
    const song = withFile[Math.floor(Math.random() * withFile.length)];

    catSingBusy = true;
    if (!catSingAudio) {
      catSingAudio = document.createElement('audio');
      catSingAudio.style.display = 'none';
      document.body.appendChild(catSingAudio);
    }
    try {
      if (!song.fileUrl) song.fileUrl = URL.createObjectURL(song.file);
      catSingAudio.src = '';
      catSingAudio.load();
      catSingAudio.src = song.fileUrl;
      catSingAudio.playbackRate = 1.4 + Math.random() * 0.4;
      catSingAudio.preservesPitch = false;
      catSingAudio.mozPreservesPitch = false;
      catSingAudio.webkitPreservesPitch = false;
      catSingAudio.volume = 0.9;
    } catch (e) {
      catSingBusy = false;
      return;
    }

    const onMeta = () => {
      catSingAudio.removeEventListener('loadedmetadata', onMeta);
      const realDur = isFinite(catSingAudio.duration)
        ? catSingAudio.duration
        : 30;
      const startAt = Math.random() * Math.max(0.1, realDur - 4);
      try {
        catSingAudio.currentTime = startAt;
      } catch (e) {}
      catSingAudio.play().catch(() => {});
    };
    catSingAudio.addEventListener('loadedmetadata', onMeta);

    const bossEl = document.getElementById('shop-cat-boss');
    if (bossEl) bossEl.classList.add('singing');
    spawnCatNotes();

    // 唱歌时长 = 基础 2 秒 + 当前滑动的秒数（不能超过已购上限）
    const useSec = Math.min(CAT_SING_USE, CAT_SING_EXTRA);
    const totalSec = CAT_SING_BASE + useSec;
    const totalMs = totalSec * 1000;

    if (catSingTimer) clearTimeout(catSingTimer);
    catSingTimer = setTimeout(stopCatSing, totalMs);

    catSingAudio.onended = () => {
      if (catSingBusy) stopCatSing();
    };
  }

  function startCatTalk() {
    stopCatTalk();
    const bubble = document.getElementById('shop-cat-bubble');
    const boss = document.getElementById('shop-cat-boss');
    if (!bubble) return;

    // 渲染气泡内容（有头像台词时显示头像）
    const renderBubble = (lineObj, el) => {
      if (!el) return;
      if (lineObj.avatar) {
        el.innerHTML =
          '<img class="shop-cat-avatar" src="' +
          lineObj.avatar +
          '" alt="" />' +
          '<div class="shop-cat-avatar-text">' +
          escapeHtml(lineObj.text) +
          '</div>';
      } else {
        el.textContent = lineObj.text;
      }
    };

    if (!lastCatLine) lastCatLine = pickCatLine();
    if (boss) boss.textContent = lastCatLine.face;
    renderBubble(lastCatLine, bubble);

    catTalkTimer = setInterval(() => {
      const el = document.getElementById('shop-cat-bubble');
      const bossEl = document.getElementById('shop-cat-boss');
      if (!el) {
        stopCatTalk();
        return;
      }
      el.style.opacity = '0';
      if (bossEl) bossEl.style.opacity = '0.4';
      setTimeout(() => {
        const el2 = document.getElementById('shop-cat-bubble');
        const bossEl2 = document.getElementById('shop-cat-boss');
        if (el2) {
          lastCatLine = pickCatLine();
          if (bossEl2) {
            bossEl2.textContent = lastCatLine.face;
            bossEl2.style.opacity = '1';
          }
          renderBubble(lastCatLine, el2);
          el2.style.opacity = '1';
        }
      }, 300);
    }, CONFIG.CAT_TALK_INTERVAL);
  }

  function stopCatTalk() {
    if (catTalkTimer) {
      clearInterval(catTalkTimer);
      catTalkTimer = null;
    }
  }

  /* ============ 老板完整唱一首 ============ */
  let catFullSongBusy = false;
  let catFullSongCurrent = null;
  let catFullSongNoteTimer = null;

  function openCatFullSongPicker() {
    if (CAT_FULL_SONG <= 0) {
      neonFlash('没有「老板完整唱一首」了喵～');
      return;
    }
    const owned = SONGS.filter((s) => s.owned);
    if (owned.length === 0) {
      neonFlash('还没有买过歌，先去店铺逛逛吧～');
      return;
    }
    document.querySelectorAll('.shop-fav-menu').forEach((m) => m.remove());
    const menu = document.createElement('div');
    menu.className = 'shop-fav-menu';
    menu.style.minWidth = '220px';
    menu.style.maxWidth = '300px';
    menu.style.maxHeight = '60vh';
    menu.style.overflowY = 'auto';

    let html = '<div class="shop-fav-menu-title">🎶 选一首让老板唱</div>';
    owned.forEach((song, i) => {
      html +=
        '<div class="shop-fav-menu-item" data-idx="' +
        i +
        '">🎵 ' +
        escapeHtml(song.name) +
        '</div>';
    });
    menu.innerHTML = html;
    applyThemeVars(menu);
    document.body.appendChild(menu);

    menu.style.left =
      Math.max(8, window.innerWidth / 2 - menu.offsetWidth / 2) + 'px';
    menu.style.top =
      Math.max(8, window.innerHeight / 2 - menu.offsetHeight / 2) + 'px';

    menu.querySelectorAll('.shop-fav-menu-item[data-idx]').forEach((item) => {
      item.onclick = () => {
        const idx = Number(item.dataset.idx);
        const song = owned[idx];
        menu.remove();
        if (!song) return;
        if (CAT_FULL_SONG <= 0) return;
        CAT_FULL_SONG--;
        saveCatFullSong();
        viewMode = 'items';
        currentFav = null;
        updateNavActive();
        updateSearchVisibility();
        renderContent();
        setTimeout(() => {
          startCatFullSong(song);
        }, 150);
      };
    });

    setTimeout(() => {
      const close = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }

  function startCatFullSong(song) {
    if (!song || !song.file) {
      neonFlash('这首歌没文件，唱不了喵～');
      return;
    }
    stopCatSing();
    stopCatFullSong();
    catFullSongBusy = true;
    catFullSongCurrent = song;

    if (!catSingAudio) {
      catSingAudio = document.createElement('audio');
      catSingAudio.style.display = 'none';
      document.body.appendChild(catSingAudio);
    }
    try {
      if (!song.fileUrl) song.fileUrl = URL.createObjectURL(song.file);
      catSingAudio.src = song.fileUrl;
      catSingAudio.playbackRate = 1.4 + Math.random() * 0.4;
      catSingAudio.preservesPitch = false;
      catSingAudio.mozPreservesPitch = false;
      catSingAudio.webkitPreservesPitch = false;
      catSingAudio.volume = 0.9;
      catSingAudio.currentTime = 0;
    } catch (e) {
      catFullSongBusy = false;
      neonFlash('播放失败喵…');
      return;
    }

    const onMeta = () => {
      catSingAudio.removeEventListener('loadedmetadata', onMeta);
      catSingAudio.play().catch(() => {});
    };
    catSingAudio.addEventListener('loadedmetadata', onMeta);

    const bossEl = document.getElementById('shop-cat-boss');
    if (bossEl) {
      bossEl.classList.add('singing');
      // 保持颜文字不变，只加动画
    }
    const bubble = document.getElementById('shop-cat-bubble');
    if (bubble)
      bubble.textContent = '喵～正在为你演唱《' + (song.name || '') + '》';
    stopCatTalk();
    spawnCatNotes();

    catSingAudio.onended = () => {
      if (!catFullSongBusy) return;
      catFullSongBusy = false;
      catFullSongCurrent = null;
      if (catFullSongNoteTimer) {
        clearInterval(catFullSongNoteTimer);
        catFullSongNoteTimer = null;
      }
      const b = document.getElementById('shop-cat-boss');
      if (b) b.classList.remove('singing');
      const bub = document.getElementById('shop-cat-bubble');
      if (bub) bub.textContent = '喵～唱完啦！谢谢聆听～';
      setTimeout(() => {
        if (viewMode === 'items' && !catSingBusy && !catFullSongBusy)
          startCatTalk();
      }, 500); // 或 2000
    };

    if (catFullSongNoteTimer) clearInterval(catFullSongNoteTimer);
    catFullSongNoteTimer = setInterval(() => {
      if (!catFullSongBusy) {
        clearInterval(catFullSongNoteTimer);
        catFullSongNoteTimer = null;
        return;
      }
      spawnCatNotes();
    }, 800);
  }

  function stopCatFullSong() {
    if (catFullSongNoteTimer) {
      clearInterval(catFullSongNoteTimer);
      catFullSongNoteTimer = null;
    }
    if (!catFullSongBusy) return;
    catFullSongBusy = false;
    catFullSongCurrent = null;
    if (catSingAudio) {
      catSingAudio.onended = null;
      try {
        catSingAudio.pause();
      } catch (e) {}
    }
    const b = document.getElementById('shop-cat-boss');
    if (b) b.classList.remove('singing');
    setTimeout(() => {
      if (viewMode === 'items' && !catSingBusy && !catFullSongBusy)
        startCatTalk();
    }, 500); // 或 2000
  }
  /* ============ 艺术殿堂 ============ */
  let palaceActive = false;
  let palaceTimer = null;
  let palaceHue = 320;
  let palaceAudio = null;
  let palaceMono = false; // ← 新增：当前是否是黑白殿堂
  let palaceCurrentSong = null; // ← 新增：当前殿堂播放的歌
  let palaceSync = false; // 同步模式
  let palaceDecoDensity = 5; // 喵喵密度（装饰）：1~10，5=默认
  let palaceTextDensity = 5; // 文字密度：1~10，5=默认
  let palaceRate = 5; // 喵喵速率：1~10，5=默认
  let palaceSyncLines = []; // 同步模式用的时间轴
  let palaceSyncIdx = 0; // 同步模式已喷到哪一行
  let palaceBubbleOn = true; // 封面泡泡开关
  let palaceSmartMode = false; // 智慧抉择开关
  let palaceControlsMinimized = false; // 控制条是否被最小化
  let palaceNoLyricTitle = true; // 无歌词时飘歌名/歌手开关
  let _palaceSpawnHistory = {}; // 智慧模式：每句上次喷的时间
  let _lastPalaceTime = -1; // 上次 timeupdate 的时间点
  let _palaceSpawnOne = null; // 保存 spawnOne 引用，速率变化时重建定时器用
  let _palaceCurrentLines = []; // 同步模式：当前活跃的歌词行（定时器用它喷）

  // 智慧模式的宽容窗口（秒）：每句歌词在这个时间范围里都会持续出现
  const PALACE_SMART_WINDOW = 1.6;

  // 密度 1~10 → 0.16~10 倍（指数曲线，5=默认1倍）
  function densityFactor(d) {
    return Math.pow(10, (d - 5) / 5);
  }

  try {
    palaceSync = localStorage.getItem('shop_palace_sync_v4') === '1';
    palaceBubbleOn = localStorage.getItem('shop_palace_bubble_v4') !== '0';
    palaceSmartMode = localStorage.getItem('shop_palace_smart_v4') === '1';
    palaceControlsMinimized =
      localStorage.getItem('shop_palace_ctrl_min_v4') === '1';
    palaceNoLyricTitle = localStorage.getItem('shop_palace_nolyric_v4') !== '0';
    // 频量：优先读新 key，读不到就兼容旧 key（把旧的"速度"当频量用一次）
    const sd = parseFloat(
      localStorage.getItem('shop_palace_decodensity_v4') || '5',
    );
    palaceDecoDensity = isFinite(sd) ? Math.max(1, Math.min(10, sd)) : 5;
    const st = parseFloat(
      localStorage.getItem('shop_palace_textdensity_v4') || '5',
    );
    palaceTextDensity = isFinite(st) ? Math.max(1, Math.min(10, st)) : 5;
    const sr = parseFloat(localStorage.getItem('shop_palace_rate_v4') || '5');
    palaceRate = isFinite(sr) ? Math.max(1, Math.min(10, sr)) : 5;
  } catch (e) {}

  function palaceEscHandler(e) {
    if (e.key === 'Escape' && palaceActive) closeArtPalace();
  }

  function openArtPalacePicker() {
    document
      .querySelectorAll('.art-palace-picker')
      .forEach((el) => el.remove());
    const owned = SONGS.filter((s) => s.owned);
    const mask = document.createElement('div');
    mask.className = 'art-palace-picker';
    mask.innerHTML =
      '<div class="art-palace-picker-box">' +
      '<div class="art-palace-picker-title">🏛️ 艺术殿堂</div>' +
      '<input class="art-palace-search" id="art-palace-search" type="text" placeholder="搜索歌名 / 歌手…" />' +
      '<div class="art-palace-grid" id="art-palace-grid"></div>' +
      '<button class="art-palace-picker-close" id="art-palace-picker-close">✕</button>' +
      '</div>';
    applyThemeVars(mask);
    document.body.appendChild(mask);

    const grid = document.getElementById('art-palace-grid');
    const search = document.getElementById('art-palace-search');

    const renderGrid = (filter) => {
      const q = (filter || '').trim().toLowerCase();
      const list = owned.filter((s) => {
        if (!q) return true;
        return (s.name + ' ' + (s.artist || '')).toLowerCase().indexOf(q) >= 0;
      });
      grid.innerHTML = '';
      if (list.length === 0) {
        grid.innerHTML =
          '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#c8b0d6;">没有匹配的歌曲</div>';
        return;
      }
      list.forEach((song) => {
        const unlocked = !!ART_PALACE_UNLOCKED[song.key];
        const card = document.createElement('div');
        card.className = 'art-palace-card' + (unlocked ? ' unlocked' : '');
        card.innerHTML =
          '<img src="' +
          song.coverUrl +
          '" />' +
          '<div class="art-palace-card-info">' +
          '<div class="art-palace-card-name">' +
          escapeHtml(song.name) +
          '</div>' +
          '<div class="art-palace-card-artist">' +
          escapeHtml(song.artist || '未知艺术家') +
          '</div>' +
          '</div>' +
          '<div class="art-palace-card-status ' +
          (unlocked ? 'unlocked' : 'locked') +
          '">' +
          (unlocked ? '✦ 进入殿堂' : '🔒 5 学币解锁') +
          '</div>';
        card.onclick = () => {
          if (unlocked) {
            mask.remove();
            enterArtPalace(song);
          } else {
            showConfirm(
              '🏛️ 解锁殿堂',
              '花费 5 学币永久解锁：\n\n🎵 ' +
                song.name +
                '\n🎤 ' +
                (song.artist || '未知艺术家') +
                '\n\n解锁后可随时进入殿堂～',
              () => {
                if (S.coins < 5) {
                  neonFlash('学币不够！还差 ' + (5 - S.coins) + ' 币');
                  return;
                }
                S.coins -= 5;
                saveState();
                ART_PALACE_UNLOCKED[song.key] = Date.now();
                saveArtPalace();
                updateCoinUI();
                renderGrid(search.value);
                spawnHearts();
                neonFlash('殿堂已解锁！');
              },
            );
          }
        };
        grid.appendChild(card);
      });
    };

    renderGrid('');
    // 1.5 秒后再刷一次，让异步读完的封面显示出来
    setTimeout(() => {
      if (document.body.contains(mask)) renderGrid(search.value);
    }, 1500);
    search.addEventListener('input', () => renderGrid(search.value));
    document.getElementById('art-palace-picker-close').onclick = () =>
      mask.remove();
    mask.onclick = (e) => {
      if (e.target === mask) mask.remove();
    };
  }

  function enterArtPalace(song) {
    if (palaceActive) return;
    palaceActive = true;
    const panel = document.getElementById('shop-panel');
    if (!panel) return;

    // 原调播放
    try {
      if (!song.fileUrl) song.fileUrl = URL.createObjectURL(song.file);
      if (!palaceAudio) {
        palaceAudio = document.createElement('audio');
        palaceAudio.style.display = 'none';
        document.body.appendChild(palaceAudio);
      }
      palaceAudio.pause();
      palaceAudio.src = '';
      palaceAudio.load();
      palaceAudio.src = song.fileUrl;
      palaceAudio.playbackRate = 1.0;
      palaceAudio.preservesPitch = true;
      palaceAudio.mozPreservesPitch = true;
      palaceAudio.webkitPreservesPitch = true;
      palaceAudio.volume = 0.75;
      palaceAudio.play().catch((e) => console.log('播放失败:', e));
    } catch (e) {
      console.log('音频出错:', e);
    }

    // 记录当前歌曲，供封面泡泡和同步使用
    palaceCurrentSong = song;

    // 面板 + 页面色调
    extractCoverColor(song.coverUrl, (color) => {
      if (!palaceActive) return;
      let h = 320;
      let mono = false;
      if (color) {
        if (color.achromatic) {
          mono = true;
          h = 0;
        } else {
          const hsl = rgbToHsl(color.r, color.g, color.b);
          h = Math.round(hsl.h);
        }
      }
      palaceHue = h;
      palaceMono = mono;
      panel.style.setProperty('--ap-hue', h);
      panel.classList.add('art-palace-on');
      panel.classList.toggle('art-palace-mono', mono);
      document.body.style.setProperty('--ap-hue', h);
      document.body.classList.add('art-palace-page-on');
      document.body.classList.toggle('art-palace-page-mono', mono);
    });

    // 抓歌词
    (async () => {
      try {
        const cached = LYRICS[song.key];
        if (!cached || cached.empty) {
          await ensureLyrics(song);
          try {
            const l = JSON.parse(localStorage.getItem('shop_lyrics_v4'));
            if (l && l[song.key]) LYRICS[song.key] = l[song.key];
          } catch (e) {}
        }
      } catch (e) {}
      startPalaceLyrics(song);
    })();

    buildPalaceControls();
    document.addEventListener('keydown', palaceEscHandler);
  }

  function closeArtPalace() {
    palaceActive = false;
    palaceCurrentSong = null;
    palaceMono = false;
    _palaceSpawnOne = null;
    _palaceCurrentLines = [];
    if (palaceTimer) {
      clearInterval(palaceTimer);
      palaceTimer = null;
    }
    if (palaceAudio) {
      if (palaceAudio._syncHandler) {
        palaceAudio.removeEventListener('timeupdate', palaceAudio._syncHandler);
        palaceAudio._syncHandler = null;
      }
      try {
        palaceAudio.pause();
      } catch (e) {}
      palaceAudio.src = '';
    }
    const panel = document.getElementById('shop-panel');
    if (panel) {
      panel.classList.remove('art-palace-on');
      panel.classList.remove('art-palace-mono');
    }
    document.body.classList.remove('art-palace-page-on');
    document.body.classList.remove('art-palace-page-mono');
    document.body.style.removeProperty('--ap-hue');
    document
      .querySelectorAll('.art-palace-lyric-float')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('.art-palace-cover-bubble')
      .forEach((el) => el.remove());
    const ctrl = document.getElementById('palace-controls');
    if (ctrl) ctrl.remove();
    const minBall = document.getElementById('palace-min-ball');
    if (minBall) minBall.remove();
    document.removeEventListener('keydown', palaceEscHandler);
  }

  function startPalaceTimer() {
    if (palaceTimer) clearInterval(palaceTimer);
    const tickMs = Math.max(100, Math.round(5000 / palaceRate));
    palaceTimer = setInterval(() => {
      if (!palaceActive) return;
      const textFactor = densityFactor(palaceTextDensity);
      const decoFactor = densityFactor(palaceDecoDensity);
      if (_palaceSpawnOne) {
        const lyrCount = Math.max(1, Math.round(3 * textFactor));
        for (let i = 0; i < lyrCount; i++) _palaceSpawnOne();
      }
      const decCount = Math.max(1, Math.round(3 * decoFactor));
      for (let i = 0; i < decCount; i++) spawnPalaceDecor();
    }, tickMs);
  }

  function startPalaceLyrics(song) {
    const lyricsData = LYRICS[song.key];
    const originals = [];
    const translateds = [];
    const timed = [];
    const isPlaceholder = (s) => {
      if (!s) return false;
      const t = s.replace(/\s+/g, '');
      return (
        t.indexOf('纯音乐') >= 0 ||
        t.indexOf('请欣赏') >= 0 ||
        t.indexOf('沒有填词') >= 0 ||
        t.indexOf('没有填词') >= 0 ||
        t.indexOf('暂无歌词') >= 0 ||
        t === '此歌曲为没有填词的纯音乐'
      );
    };
    if (lyricsData && lyricsData._parsed && lyricsData._parsed.length) {
      lyricsData._parsed.forEach((l) => {
        if (l.text && !isPlaceholder(l.text)) {
          originals.push(l.text);
          timed.push({
            time: l.time,
            text: l.text,
            trans: l.trans || '',
          });
        }
        if (l.trans && l.trans.trim() && !isPlaceholder(l.trans)) {
          translateds.push(l.trans.trim());
        }
      });
    }

    palaceSyncLines = timed.slice().sort((a, b) => a.time - b.time);
    palaceSyncIdx = 0;
    _palaceSpawnHistory = {};
    _lastPalaceTime = -1;
    _palaceCurrentLines = [];

    // ★ 关键：spawnOne 必须能在同步模式下识别"当前活跃行"
    const spawnOne = () => {
      if (!palaceActive) return;

      // ★ 同步模式：先算当前活跃行
      if (palaceSync && palaceSyncLines.length > 0) {
        const t = (palaceAudio && palaceAudio.currentTime) || 0;
        const firstTime = palaceSyncLines[0].time;
        const lastTime = palaceSyncLines[palaceSyncLines.length - 1].time;

        // 前奏 / 尾奏期间 → 不喷歌词
        if (t < firstTime - 0.3 || t > lastTime + 6) {
          return;
        }

        const WINDOW = palaceSmartMode ? PALACE_SMART_WINDOW : 0.8;
        let active = palaceSyncLines.filter(
          (line) => Math.abs(t - line.time) <= WINDOW,
        );
        if (active.length === 0) {
          // 取 t 之前最近的那一句
          let closest = null;
          let minDiff = Infinity;
          for (const line of palaceSyncLines) {
            const diff = Math.abs(t - line.time);
            if (diff < minDiff) {
              minDiff = diff;
              closest = line;
            }
          }
          if (closest) active = [closest];
        }
        _palaceCurrentLines = active;
      }

      // A1：同步 + 有活跃行 → 只喷当前句
      if (palaceSync && _palaceCurrentLines.length > 0) {
        const line =
          _palaceCurrentLines[
            Math.floor(Math.random() * _palaceCurrentLines.length)
          ];
        spawnPalaceLyric([line.text], false);
        if (line.trans && line.trans.trim() && Math.random() < 0.5) {
          setTimeout(() => {
            if (palaceActive) spawnPalaceLyric([line.trans.trim()], true);
          }, 80);
        }
        return;
      }

      // 同步模式但没活跃行（前奏/尾奏已经在上面的 return 挡住了，一般到不了这）
      if (palaceSync && palaceSyncLines.length > 0) return;

      // A2：非同步 → 全曲随机
      if (originals.length > 0 || translateds.length > 0) {
        const hasTrans = translateds.length > 0;
        const useTrans = hasTrans && Math.random() < 0.45;
        const pool = useTrans ? translateds : originals;
        spawnPalaceLyric(pool, useTrans);
        return;
      }

      // B：整首没歌词
      if (!palaceNoLyricTitle) return;
      const nm = (song.name || '').trim();
      const ar = (song.artist || '').trim();
      const tmp = [];
      if (nm) tmp.push(nm);
      if (ar && ar !== '未知艺术家') tmp.push(ar);
      if (tmp.length === 0) tmp.push('♪');
      spawnPalaceLyric(tmp, false);
    };

    _palaceSpawnOne = spawnOne;

    // ★ 立刻算一次当前活跃行（防止开场前几秒 _palaceCurrentLines 为空 → 走 A2 乱飘）
    const computeActiveLines = () => {
      if (!palaceActive || !palaceSync) return;
      if (palaceSyncLines.length === 0) return;
      const t = palaceAudio.currentTime || 0;

      // 智慧模式：±1.6 秒内的所有行都算活跃
      if (palaceSmartMode) {
        const active = palaceSyncLines.filter(
          (line) => Math.abs(t - line.time) <= PALACE_SMART_WINDOW,
        );
        if (active.length > 0) {
          _palaceCurrentLines = active;
          _lastPalaceTime = t;
          return;
        }
      }

      // 普通模式 / 智慧模式下窗口内为空 → 取"t 之前最近的那一句"
      let idx = -1;
      for (let i = palaceSyncLines.length - 1; i >= 0; i--) {
        if (palaceSyncLines[i].time <= t) {
          idx = i;
          break;
        }
      }
      if (idx < 0) idx = 0; // t 在第一句之前 → 取第一句

      _palaceCurrentLines = [palaceSyncLines[idx]];
      _lastPalaceTime = t;
    };
    computeActiveLines(); // 开场先算一次
    startPalaceTimer();

    // ★ handler 只更新 _palaceCurrentLines，不喷任何东西（喷交给定时器）
    const handler = () => {
      computeActiveLines();
    };

    if (palaceAudio._syncHandler) {
      palaceAudio.removeEventListener('timeupdate', palaceAudio._syncHandler);
    }
    palaceAudio._syncHandler = handler;
    palaceAudio.addEventListener('timeupdate', handler);
  }

  function spawnPalaceLyric(pool, isTrans) {
    if (!pool || !pool.length) return;
    const text = pool[Math.floor(Math.random() * pool.length)];
    const el = document.createElement('div');
    el.className = 'art-palace-lyric-float';

    const x = 3 + Math.random() * 94;
    const y = 5 + Math.random() * 90;
    // 中文翻译：小一号、柔和；原文：大一号、亮
    const size = isTrans ? 14 + Math.random() * 22 : 20 + Math.random() * 34;
    const rot = (Math.random() - 0.5) * (isTrans ? 30 : 50);

    let finalHue;
    if (palaceMono) {
      finalHue = 0;
    } else {
      const hueShift = (Math.random() - 0.5) * (isTrans ? 40 : 70);
      finalHue = (palaceHue + hueShift + 360) % 360;
    }
    const sat = palaceMono ? 0 : isTrans ? 60 : 90;
    const light = isTrans ? 72 + Math.random() * 18 : 60 + Math.random() * 30;
    const opacity = isTrans
      ? 0.5 + Math.random() * 0.4
      : 0.6 + Math.random() * 0.4;

    el.innerHTML = '<div class="apl-main">' + escapeHtml(text) + '</div>';

    el.style.cssText =
      'left:' +
      x +
      '%;top:' +
      y +
      '%;' +
      'font-size:' +
      size +
      'px;opacity:0;' +
      'color:hsl(' +
      finalHue +
      ',' +
      sat +
      '%,' +
      light +
      '%);' +
      'text-shadow:0 0 12px hsl(' +
      finalHue +
      ',' +
      sat +
      '%,60%),0 0 30px hsl(' +
      finalHue +
      ',' +
      sat +
      '%,50%);';
    document.body.appendChild(el);

    el.animate(
      [
        {
          transform: 'translate(-50%,-50%) rotate(' + rot + 'deg) scale(0.2)',
          opacity: 0,
        },
        {
          transform: 'translate(-50%,-50%) rotate(' + rot + 'deg) scale(1.15)',
          opacity: opacity,
          offset: 0.2,
        },
        {
          transform: 'translate(-50%,-50%) rotate(' + rot + 'deg) scale(1)',
          opacity: opacity,
          offset: 0.7,
        },
        {
          transform:
            'translate(-50%,-50%) rotate(' + (rot + 20) + 'deg) scale(0.5)',
          opacity: 0,
        },
      ],
      {
        duration: 3000 + Math.random() * 1800,
        easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)',
      },
    ).onfinish = () => el.remove();
  }

  function spawnPalaceDecor() {
    // 小概率飘一个模糊的圆形专辑封面（受"封面泡泡"开关控制）
    if (
      palaceBubbleOn &&
      palaceCurrentSong &&
      palaceCurrentSong.coverUrl &&
      Math.random() < 0.015
    ) {
      spawnPalaceCoverBubble(palaceCurrentSong.coverUrl);
      return;
    }
    const notes = [
      '🎵',
      '🎶',
      '♪',
      '♫',
      '🎤',
      '🎼',
      '🎧',
      '🎹',
      '🎸',
      '🎺',
      '🎻',
      '🥁',
    ];
    const faces = [
      '(=^･ω･^=)',
      '(=^ω^=)',
      '(=◕ω◕=)',
      '(=✧ω✧=)',
      '(=★ω★=)',
      '(=^‥^=)',
      '(=๑•ω•๑=)',
      '(=^◕ᴥ◕^=)',
      '(=ↀωↀ=)',
      '(=ↀᴥↀ=)',
      '(=￣ω￣=)',
      '(=⊙ω⊙=)',
      '(=ＵωＵ=)',
      '(=•̀ω•́=)',
      '(=｀ω´=)',
      '喵～',
      '喵呜',
      '喵喵！',
      '喵♪',
      '❤',
    ];
    const isFace = Math.random() < 0.45;
    const txt = isFace
      ? faces[Math.floor(Math.random() * faces.length)]
      : notes[Math.floor(Math.random() * notes.length)];

    const el = document.createElement('div');
    el.className = 'art-palace-lyric-float';

    const x = 3 + Math.random() * 94;
    const y = 5 + Math.random() * 90;
    const size = isFace ? 14 + Math.random() * 22 : 20 + Math.random() * 38;
    const rot = (Math.random() - 0.5) * 80;

    let finalHue;
    if (palaceMono) {
      finalHue = 0;
    } else {
      const hueShift = (Math.random() - 0.5) * 100;
      finalHue = (palaceHue + hueShift + 360) % 360;
    }
    const sat = palaceMono ? 0 : 90;
    const light = 62 + Math.random() * 28;
    const opacity = 0.6 + Math.random() * 0.4;

    el.innerHTML = '<div class="apl-main">' + txt + '</div>';

    el.style.cssText =
      'left:' +
      x +
      '%;top:' +
      y +
      '%;' +
      'font-size:' +
      size +
      'px;opacity:0;' +
      'color:hsl(' +
      finalHue +
      ',' +
      sat +
      '%,' +
      light +
      '%);' +
      'text-shadow:0 0 14px hsl(' +
      finalHue +
      ',' +
      sat +
      '%,60%),0 0 32px hsl(' +
      finalHue +
      ',' +
      sat +
      '%,50%);';
    document.body.appendChild(el);

    const dx = (Math.random() - 0.5) * 200;
    const dy = -60 - Math.random() * 120;
    el.animate(
      [
        {
          transform: 'translate(-50%,-50%) rotate(' + rot + 'deg) scale(0.3)',
          opacity: 0,
        },
        {
          transform: 'translate(-50%,-50%) rotate(' + rot + 'deg) scale(1.2)',
          opacity: opacity,
          offset: 0.15,
        },
        {
          transform:
            'translate(calc(-50% + ' +
            dx * 0.4 +
            'px), calc(-50% + ' +
            dy * 0.4 +
            'px)) rotate(' +
            (rot + 15) +
            'deg) scale(1)',
          opacity: opacity,
          offset: 0.6,
        },
        {
          transform:
            'translate(calc(-50% + ' +
            dx +
            'px), calc(-50% + ' +
            dy +
            'px)) rotate(' +
            (rot + 40) +
            'deg) scale(0.6)',
          opacity: 0,
        },
      ],
      {
        duration: 3200 + Math.random() * 1800,
        easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)',
      },
    ).onfinish = () => el.remove();
  }

  function spawnPalaceCoverBubble(coverUrl) {
    const el = document.createElement('div');
    el.className = 'art-palace-cover-bubble';

    const size = 70 + Math.random() * 90;
    const x = 6 + Math.random() * 88;
    const y = 8 + Math.random() * 84;

    const hue = palaceMono ? 0 : palaceHue;
    const sat = palaceMono ? 0 : 80;

    el.style.cssText =
      'left:' +
      x +
      '%;top:' +
      y +
      '%;' +
      'width:' +
      size +
      'px;height:' +
      size +
      'px;' +
      'background-image:url("' +
      coverUrl +
      '");' +
      'color:hsl(' +
      hue +
      ',' +
      sat +
      '%,62%);';
    document.body.appendChild(el);

    const rot = (Math.random() - 0.5) * 40;
    el.animate(
      [
        {
          transform: 'translate(-50%,-50%) scale(0.3) rotate(' + rot + 'deg)',
          opacity: 0,
        },
        {
          transform: 'translate(-50%,-50%) scale(1.12) rotate(' + rot + 'deg)',
          opacity: 0.72,
          offset: 0.25,
        },
        {
          transform: 'translate(-50%,-50%) scale(1) rotate(' + rot + 'deg)',
          opacity: 0.72,
          offset: 0.6,
        },
        {
          transform:
            'translate(-50%,-50%) scale(0.85) rotate(' + (rot + 15) + 'deg)',
          opacity: 0,
        },
      ],
      {
        duration: 3500 + Math.random() * 2000,
        easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)',
      },
    ).onfinish = () => el.remove();
  }

  function buildPalaceControls() {
    const old = document.getElementById('palace-controls');
    if (old) old.remove();
    const oldBall = document.getElementById('palace-min-ball');
    if (oldBall) oldBall.remove();

    if (palaceControlsMinimized) {
      buildPalaceMinBall();
      return;
    }

    const box = document.createElement('div');
    box.id = 'palace-controls';
    box.className = 'palace-controls';

    let savedPos = null;
    try {
      savedPos = JSON.parse(
        localStorage.getItem('shop_palace_ctrl_pos_v4') || 'null',
      );
    } catch (e) {}
    if (
      savedPos &&
      typeof savedPos.l === 'number' &&
      typeof savedPos.t === 'number'
    ) {
      box.style.left = savedPos.l + 'px';
      box.style.top = savedPos.t + 'px';
      box.style.transform = 'none';
    }

    box.innerHTML =
      '<div class="palace-ctrl-dragbar">' +
      '<span class="palace-ctrl-drag-hint">⣿ 拖动我 ⣿</span>' +
      '<span class="palace-ctrl-drag-btns">' +
      '<span class="palace-ctrl-icon-btn" id="palace-min-btn" data-no-drag="1" title="最小化">—</span>' +
      '<span class="palace-ctrl-icon-btn palace-ctrl-icon-exit" id="palace-exit-in-ctrl" data-no-drag="1" title="退出殿堂">✕</span>' +
      '</span>' +
      '</div>' +
      '<div class="palace-ctrl-row">' +
      '<span class="palace-ctrl-label">🐱 喵喵密度</span>' +
      '<input type="range" id="palace-decodensity" class="palace-speed" min="1" max="10" step="1" value="' +
      palaceDecoDensity +
      '">' +
      '<span class="palace-ctrl-value" id="palace-decodensity-val">' +
      palaceDecoDensity +
      '</span>' +
      '</div>' +
      '<div class="palace-ctrl-row">' +
      '<span class="palace-ctrl-label">📝 文字密度</span>' +
      '<input type="range" id="palace-textdensity" class="palace-speed" min="1" max="10" step="1" value="' +
      palaceTextDensity +
      '">' +
      '<span class="palace-ctrl-value" id="palace-textdensity-val">' +
      palaceTextDensity +
      '</span>' +
      '</div>' +
      '<div class="palace-ctrl-row">' +
      '<span class="palace-ctrl-label">🐱 喵喵速率</span>' +
      '<input type="range" id="palace-rate" class="palace-speed" min="1" max="10" step="1" value="' +
      palaceRate +
      '">' +
      '<span class="palace-ctrl-value" id="palace-rate-val">' +
      palaceRate +
      '</span>' +
      '</div>' +
      '<div class="palace-ctrl-row palace-toggles-row">' +
      '<label class="palace-sync-toggle">' +
      '<input type="checkbox" id="palace-sync-check"' +
      (palaceSync ? ' checked' : '') +
      '>' +
      '<span>🎯 歌词同步</span>' +
      '</label>' +
      '<label class="palace-sync-toggle">' +
      '<input type="checkbox" id="palace-bubble-check"' +
      (palaceBubbleOn ? ' checked' : '') +
      '>' +
      '<span>🎨 封面泡泡</span>' +
      '</label>' +
      '<label class="palace-sync-toggle">' +
      '<input type="checkbox" id="palace-nolyric-check"' +
      (palaceNoLyricTitle ? ' checked' : '') +
      '>' +
      '<span>📝 无歌词时采用歌(手)名</span>' +
      '</label>' +
      '</div>' +
      '<div class="palace-ctrl-row">' +
      '<label class="palace-sync-toggle">' +
      '<input type="checkbox" id="palace-smart-check"' +
      (palaceSmartMode ? ' checked' : '') +
      '>' +
      '<span>🧠 智慧抉择（歌词前后 ±1.6 秒都重复出现）</span>' +
      '</label>' +
      '</div>' +
      '<div class="palace-ctrl-tip">密度 = 每下浮现多少 · 速率 = 多久浮现一下（1 最慢、10 最快）</div>';
    document.body.appendChild(box);

    const decoDensityEl = document.getElementById('palace-decodensity');
    const textDensityEl = document.getElementById('palace-textdensity');
    const rateEl = document.getElementById('palace-rate');

    decoDensityEl.oninput = (e) => {
      palaceDecoDensity = parseInt(e.target.value, 10) || 5;
      document.getElementById('palace-decodensity-val').textContent =
        palaceDecoDensity;
      try {
        localStorage.setItem(
          'shop_palace_decodensity_v4',
          String(palaceDecoDensity),
        );
      } catch (e) {}
    };

    textDensityEl.oninput = (e) => {
      palaceTextDensity = parseInt(e.target.value, 10) || 5;
      document.getElementById('palace-textdensity-val').textContent =
        palaceTextDensity;
      try {
        localStorage.setItem(
          'shop_palace_textdensity_v4',
          String(palaceTextDensity),
        );
      } catch (e) {}
    };

    rateEl.oninput = (e) => {
      palaceRate = parseInt(e.target.value, 10) || 5;
      document.getElementById('palace-rate-val').textContent = palaceRate;
      try {
        localStorage.setItem('shop_palace_rate_v4', String(palaceRate));
      } catch (e) {}
      startPalaceTimer();
    };
    const syncEl = document.getElementById('palace-sync-check');
    const bubbleEl = document.getElementById('palace-bubble-check');
    const smartEl = document.getElementById('palace-smart-check');

    // ===== 最小化 / 退出按钮绑定 =====
    const minBtn = document.getElementById('palace-min-btn');
    if (minBtn)
      minBtn.onclick = (e) => {
        e.stopPropagation();
        palaceControlsMinimized = true;
        try {
          localStorage.setItem('shop_palace_ctrl_min_v4', '1');
        } catch (e) {}
        buildPalaceControls();
      };
    const exitBtn = document.getElementById('palace-exit-in-ctrl');
    if (exitBtn)
      exitBtn.onclick = (e) => {
        e.stopPropagation();
        closeArtPalace();
      };

    // ===== 同步切换逻辑 =====

    const onSyncChange = (newVal) => {
      palaceSync = newVal;
      if (palaceSync && palaceAudio) {
        palaceSyncIdx = 0;
        _palaceSpawnHistory = {};
        _lastPalaceTime = -1;
        _palaceCurrentLines = [];
        const t = palaceAudio.currentTime || 0;
        while (
          palaceSyncIdx < palaceSyncLines.length &&
          palaceSyncLines[palaceSyncIdx].time <= t
        ) {
          palaceSyncIdx++;
        }
      }
      try {
        localStorage.setItem('shop_palace_sync_v4', palaceSync ? '1' : '0');
      } catch (e) {}
    };

    syncEl.onchange = (e) => {
      onSyncChange(e.target.checked);
      if (!palaceSync && palaceSmartMode) {
        palaceSmartMode = false;
        smartEl.checked = false;
        try {
          localStorage.setItem('shop_palace_smart_v4', '0');
        } catch (e) {}
      }
      neonFlash(palaceSync ? '🎯 歌词同步：开' : '🎈 歌词同步：关');
    };

    bubbleEl.onchange = (e) => {
      palaceBubbleOn = e.target.checked;
      try {
        localStorage.setItem(
          'shop_palace_bubble_v4',
          palaceBubbleOn ? '1' : '0',
        );
      } catch (e) {}
      neonFlash(palaceBubbleOn ? '🎨 封面泡泡：开' : '🚫 封面泡泡：关');
    };

    smartEl.onchange = (e) => {
      palaceSmartMode = e.target.checked;
      if (palaceSmartMode && !palaceSync) {
        syncEl.checked = true;
        onSyncChange(true);
      }
      try {
        localStorage.setItem(
          'shop_palace_smart_v4',
          palaceSmartMode ? '1' : '0',
        );
      } catch (e) {}
      neonFlash(palaceSmartMode ? '🧠 智慧抉择：开' : '📴 智慧抉择：关');
    };

    const noLyricEl = document.getElementById('palace-nolyric-check');
    noLyricEl.onchange = (e) => {
      palaceNoLyricTitle = e.target.checked;
      try {
        localStorage.setItem(
          'shop_palace_nolyric_v4',
          palaceNoLyricTitle ? '1' : '0',
        );
      } catch (e) {}
      neonFlash(
        palaceNoLyricTitle ? '📝 无歌词时飘歌名：开' : '🚫 无歌词时飘歌名：关',
      );
    };

    // ===== 拖动逻辑 =====
    let dragging = false;
    let firstDrag = true;
    let sx = 0,
      sy = 0,
      sl = 0,
      st = 0;

    const isInteractive = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'LABEL' || tag === 'BUTTON') return true;
      if (el.closest && el.closest('[data-no-drag="1"]')) return true;
      if (el.closest && el.closest('label')) return true;
      return false;
    };

    box.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (isInteractive(e.target)) return;
      const rect = box.getBoundingClientRect();
      if (firstDrag) {
        box.style.left = rect.left + 'px';
        box.style.top = rect.top + 'px';
        box.style.transform = 'none';
        firstDrag = false;
      }
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      sl = rect.left;
      st = rect.top;
      box.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const nl = Math.max(
        0,
        Math.min(window.innerWidth - box.offsetWidth, sl + e.clientX - sx),
      );
      const nt = Math.max(
        0,
        Math.min(window.innerHeight - box.offsetHeight, st + e.clientY - sy),
      );
      box.style.left = nl + 'px';
      box.style.top = nt + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      box.style.cursor = '';
      try {
        const r = box.getBoundingClientRect();
        localStorage.setItem(
          'shop_palace_ctrl_pos_v4',
          JSON.stringify({
            l: r.left,
            t: r.top,
          }),
        );
      } catch (e) {}
    });
  }

  function buildPalaceMinBall() {
    const ball = document.createElement('div');
    ball.id = 'palace-min-ball';
    ball.className = 'palace-min-ball';
    ball.textContent = '🏛️';
    ball.title = '拖动移动 · 单击展开控制条';

    // 恢复上次位置
    let savedPos = null;
    try {
      savedPos = JSON.parse(
        localStorage.getItem('shop_palace_min_ball_pos_v4') || 'null',
      );
    } catch (e) {}
    if (
      savedPos &&
      typeof savedPos.l === 'number' &&
      typeof savedPos.t === 'number'
    ) {
      ball.style.left = savedPos.l + 'px';
      ball.style.top = savedPos.t + 'px';
      ball.style.right = 'auto';
      ball.style.bottom = 'auto';
    }
    document.body.appendChild(ball);

    let dragging = false;
    let moved = false;
    let sx = 0,
      sy = 0,
      sl = 0,
      st = 0;

    ball.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      sx = e.clientX;
      sy = e.clientY;
      const r = ball.getBoundingClientRect();
      sl = r.left;
      st = r.top;
      e.preventDefault();
    });

    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) moved = true;
      if (!moved) return;
      ball.style.left =
        Math.max(0, Math.min(window.innerWidth - ball.offsetWidth, sl + dx)) +
        'px';
      ball.style.top =
        Math.max(0, Math.min(window.innerHeight - ball.offsetHeight, st + dy)) +
        'px';
      ball.style.right = 'auto';
      ball.style.bottom = 'auto';
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        try {
          const r = ball.getBoundingClientRect();
          localStorage.setItem(
            'shop_palace_min_ball_pos_v4',
            JSON.stringify({
              l: r.left,
              t: r.top,
            }),
          );
        } catch (e) {}
      } else {
        // 单击 → 展开控制条
        palaceControlsMinimized = false;
        try {
          localStorage.setItem('shop_palace_ctrl_min_v4', '0');
        } catch (e) {}
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        ball.remove();
        buildPalaceControls();
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /* ============ 构建面板 ============ */
  function buildPanel() {
    if (document.getElementById('shop-panel')) {
      panel = document.getElementById('shop-panel');
      ball = document.getElementById('shop-ball');
      return;
    }
    panel = document.createElement('div');
    panel.id = 'shop-panel';
    panel.innerHTML =
      '<div class="shop-header" id="shop-head">' +
      '<div class="shop-header-left">' +
      '<div class="shop-title">♡ 艺学小站 ♡</div>' +
      '<div class="shop-about-btn" id="shop-about-btn" title="关于">ℹ️</div>' +
      '</div>' +
      '<div class="shop-header-right">' +
      '<div class="shop-username-wrap">' +
      '<input class="shop-username-input" id="shop-username-input" type="text" placeholder="' +
      CONFIG.DEFAULT_USERNAME +
      '" maxlength="' +
      CONFIG.USERNAME_MAX_LEN +
      '" />' +
      '</div>' +
      '<div class="shop-theme-btn" id="shop-theme-btn" title="切换主题">🎨</div>' +
      '<div class="shop-min-btn" id="shop-min">−</div>' +
      '</div>' +
      '</div>' +
      '<div class="shop-coin-area">' +
      '<div class="shop-coin-row">' +
      '<div class="shop-coin-display">' +
      '<span class="shop-coin-icon">💰</span>' +
      '<span class="shop-coin-num" id="shop-coins">0</span>' +
      '<span class="shop-coin-label">学币</span>' +
      '</div>' +
      '<div class="shop-coin-right">' +
      '<button class="shop-task-btn" id="shop-task-btn">📋 任务</button>' +
      '<div class="shop-today" id="shop-today">今日已学 00:00</div>' +
      '</div>' +
      '</div>' +
      '<div class="shop-study-status">' +
      '<button class="shop-study-mark" id="shop-study-mark">📖 标记</button>' +
      '<span class="shop-study-text" id="shop-study-text">未标记</span>' +
      '<div class="shop-progress-bar"><div class="shop-progress-fill" id="shop-progress"></div></div>' +
      '<span class="shop-progress-text" id="shop-progress-text">0/60s</span>' +
      '</div>' +
      '<div class="shop-focus-row" id="shop-focus-row">' +
      '<span class="shop-focus-row-icon">🎯</span>' +
      '<span class="shop-focus-row-label">专注中</span>' +
      '<span class="shop-focus-row-time" id="shop-focus-row-time">00:00</span>' +
      '<button class="shop-focus-row-switch" id="shop-focus-row-switch" type="button">🔀 切换</button>' +
      '</div>' +
      '<div style="font-size:9px;color:#c8b0d6;text-align:center;margin-top:2px;">' +
      '💡 换课时请关掉旧页面，避免重复计时' +
      '</div>' +
      '</div>' +
      '<div class="shop-toolbar">' +
      '<button class="shop-btn shop-btn-primary" id="shop-pick">📂 选择音乐文件夹</button>' +
      '<button class="shop-btn shop-btn-secondary" id="shop-rescan">🔄 重扫</button>' +
      '</div>' +
      '<div class="shop-folder-info" id="shop-folder-info">(´･ω･`) 还没有选择文件夹哦～</div>' +
      '<div class="shop-nav" id="shop-nav">' +
      '<div class="shop-nav-btn active" data-nav="all">🎵 店铺</div>' +
      '<div class="shop-nav-btn" data-nav="favs">♡ 收藏夹</div>' +
      '<div class="shop-nav-btn" data-nav="items">🎁 道具铺</div>' +
      '<div class="shop-nav-btn" data-nav="inventory">🎒 道具</div>' +
      '</div>' +
      '<div class="shop-search-row" id="shop-search-row">' +
      '<span class="shop-search-icon">🔍</span>' +
      '<input class="shop-search-box" id="shop-search" type="text" placeholder="搜索歌名 / 艺术家…" />' +
      '<span class="shop-search-clear" id="shop-search-clear">×</span>' +
      '</div>' +
      '<div class="shop-song-grid" id="shop-grid"></div>' +
      '<div class="shop-player" id="shop-player">' +
      '<div class="shop-viz-space" id="shop-viz-space"></div>' +
      '<div class="shop-player-info">' +
      '<img class="shop-player-cover" id="shop-player-cover" src="" />' +
      '<div class="shop-player-text">' +
      '<div class="shop-player-title" id="shop-player-title">未播放</div>' +
      '<div class="shop-player-artist" id="shop-player-artist">—</div>' +
      '</div>' +
      '</div>' +
      '<div class="shop-player-controls">' +
      '<audio id="shop-audio" controls></audio>' +
      '<div class="shop-player-extra">' +
      '<button id="shop-playlist-btn" title="播放列表">📋</button>' +
      '<button class="shop-mode-btn" id="shop-mode-btn" title="播放模式">🔁</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="shop-footer">' +
      '<span id="shop-status">SYS: READY</span>' +
      '<span>v6.2 ♡</span>' +
      '</div>';
    document.body.appendChild(panel);

    try {
      applyTheme(localStorage.getItem(K_THEME) || 'sakura');
    } catch (e) {}

    ball = document.createElement('div');
    ball.id = 'shop-ball';
    ball.textContent = '=ω=';
    document.body.appendChild(ball);

    const ballTip = document.createElement('div');
    ballTip.id = 'shop-ball-tip';
    document.body.appendChild(ballTip);

    if (pos) {
      panel.style.left = pos.l + 'px';
      panel.style.top = pos.t + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }

    let ballPos = null;
    try {
      ballPos = JSON.parse(localStorage.getItem(K_BALL_POS));
    } catch (e) {}
    if (ballPos) {
      ball.style.left = ballPos.l + 'px';
      ball.style.top = ballPos.t + 'px';
      ball.style.right = 'auto';
      ball.style.bottom = 'auto';
    }

    applyBallColor(true);
    setInterval(() => {
      applyBallColor(Math.random() < 0.5);
    }, 4000);

    bindBallDrag(ball, ballTip);
    const aboutBtn = document.getElementById('shop-about-btn');
    if (aboutBtn)
      aboutBtn.onclick = (e) => {
        e.stopPropagation();
        showAbout();
      };
    document.getElementById('shop-min').onclick = (e) => {
      e.stopPropagation();
      panel.classList.add('shop-hidden');
      ball.style.display = 'flex';
      stopCatFullSong();
    };
    document.getElementById('shop-study-mark').onclick = () => {
      if (focusMode) {
        exitFocusMode(false);
        return;
      }
      enterFocusMode();
    };

    document.getElementById('shop-task-btn').onclick = () => {
      viewMode = viewMode === 'tasks' ? 'all' : 'tasks';
      currentFav = null;
      updateNavActive();
      updateSearchVisibility();
      renderContent();
    };
    document.getElementById('shop-pick').onclick = pickFolder;
    document.getElementById('shop-rescan').onclick = scanAndRender;
    document.getElementById('shop-playlist-btn').onclick = (e) => {
      e.stopPropagation();
      togglePlaylist();
    };
    document.getElementById('shop-mode-btn').onclick = (e) => {
      e.stopPropagation();
      cyclePlaymode();
    };

    const themeBtnEl = document.getElementById('shop-theme-btn');
    if (themeBtnEl)
      themeBtnEl.onclick = (e) => {
        e.stopPropagation();
        openThemeMenu(themeBtnEl);
      };

    bindUsernameInput();

    const searchInput = document.getElementById('shop-search');
    const clearBtn = document.getElementById('shop-search-clear');
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      searchText = searchInput.value;
      clearBtn.classList.toggle('show', !!searchText);
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        renderList(true);
      }, 200);
    });
    clearBtn.onclick = () => {
      searchInput.value = '';
      searchText = '';
      clearBtn.classList.remove('show');
      renderList(true);
      searchInput.focus();
    };

    document.querySelectorAll('.shop-nav-btn').forEach((btn) => {
      btn.onclick = () => {
        viewMode = btn.dataset.nav;
        currentFav = null;
        updateNavActive();
        updateSearchVisibility();
        renderContent();
      };
    });

    dragPanel(panel, ball);
    updateCoinUI();

    const grid = document.getElementById('shop-grid');
    if (grid && !scrollBound) {
      grid.addEventListener('scroll', onGridScroll, {
        passive: true,
      });
      scrollBound = true;
    }

    window.addEventListener('resize', throttledLayoutCovers);

    buildMagicPlayer();
  }

  function onGridScroll() {
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    if (viewMode !== 'all' && viewMode !== 'favDetail') return;
    if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 250) {
      if (visibleCount < currentIdxs.length) {
        visibleCount += CONFIG.PAGE_SIZE;
        appendMoreCards();
      }
    }
  }

  function updateNavActive() {
    document.querySelectorAll('.shop-nav-btn').forEach((btn) => {
      const nav = btn.dataset.nav;
      let active = false;
      if (nav === 'all') active = viewMode === 'all';
      else if (nav === 'favs')
        active = viewMode === 'favs' || viewMode === 'favDetail';
      else if (nav === 'items') active = viewMode === 'items';
      else if (nav === 'inventory') active = viewMode === 'inventory';
      btn.classList.toggle('active', active);
    });
  }

  function updateSearchVisibility() {
    const row = document.getElementById('shop-search-row');
    if (!row) return;
    row.style.display =
      viewMode === 'all' || viewMode === 'favDetail' ? 'block' : 'none';
  }

  function dragPanel(p, b) {
    const head = p.querySelector('#shop-head');
    let dragging = false,
      sx = 0,
      sy = 0,
      sl = 0,
      st = 0;
    head.addEventListener('mousedown', (e) => {
      if (e.target.id === 'shop-min') return;
      if (e.target.id === 'shop-theme-btn') return;
      if (e.target.id === 'shop-about-btn') return;
      if (e.target.id === 'shop-username-input') return;
      if (e.target.tagName === 'INPUT') return;
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      const r = p.getBoundingClientRect();
      sl = r.left;
      st = r.top;
      head.style.cursor = 'grabbing';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      let nl = Math.max(
        0,
        Math.min(window.innerWidth - p.offsetWidth, sl + e.clientX - sx),
      );
      let nt = Math.max(
        0,
        Math.min(window.innerHeight - p.offsetHeight, st + e.clientY - sy),
      );
      p.style.left = nl + 'px';
      p.style.top = nt + 'px';
      p.style.right = 'auto';
      p.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      head.style.cursor = 'move';
      try {
        const r = p.getBoundingClientRect();
        localStorage.setItem(
          K_POS,
          JSON.stringify({
            l: r.left,
            t: r.top,
          }),
        );
      } catch (e) {}
    });
  }

  let layoutPending = false;

  function layoutCovers() {
    if (layoutPending) return;
    layoutPending = true;
    requestAnimationFrame(() => {
      layoutPending = false;
      const grid = document.getElementById('shop-grid');
      if (!grid) return;
      const firstCard = grid.querySelector('.song-card, .shop-fav-card');
      if (!firstCard) return;
      const w = Math.floor(firstCard.getBoundingClientRect().width);
      if (w <= 0) return;
      const h = w + 'px';
      const covers = grid.querySelectorAll('.song-cover, .shop-fav-cover');
      for (let i = 0; i < covers.length; i++) {
        covers[i].style.height = h;
        covers[i].style.minHeight = h;
      }
    });
  }

  function throttledLayoutCovers() {
    layoutCovers();
  }

  /* ============ 文件夹 ============ */
  async function pickFolder() {
    if (!window.showDirectoryPicker) {
      toast('浏览器不支持');
      alert(
        '浏览器不支持 File System Access API。\n请使用最新版 Chrome 或 Edge。',
      );
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({
        mode: 'read',
      });
      await idbSet('musicDir', handle);
      try {
        localStorage.setItem(K_FOLDER_NAME, handle.name);
      } catch (e) {}
      updateFolderInfo(handle.name);
      SONGS = [];
      await scanAndRender();
    } catch (e) {
      if (e && e.name === 'AbortError') toast('已取消选择');
    }
  }

  function updateFolderInfo(name) {
    const el = document.getElementById('shop-folder-info');
    if (!el) return;
    el.innerHTML = name
      ? '音乐库：<span>' + escapeHtml(name) + '</span>'
      : '(´･ω･`) 还没有选择文件夹哦～';
  }

  /* ============ 扫描 ============ */
  async function walk(dirHandle, out, path, lrcMap) {
    path = path || '';
    for await (const entry of dirHandle.values()) {
      if (out.length >= CONFIG.MAX_FILES) return;
      const entryPath = path ? path + '/' + entry.name : entry.name;
      if (entry.kind === 'file') {
        if (CONFIG.SUPPORTED_EXT.test(entry.name)) {
          out.push({
            handle: entry,
            path: entryPath,
          });
        } else if (/\.lrc$/i.test(entry.name)) {
          // 用去掉扩展名的路径作为 key，方便和 mp3/flac 匹配
          const key = entryPath.replace(/\.[^.]+$/, '').toLowerCase();
          lrcMap[key] = entry;
        }
      } else if (entry.kind === 'directory') {
        await walk(entry, out, entryPath, lrcMap);
      }
    }
  }
  async function scanAndRender() {
    const status = document.getElementById('shop-status');
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    const handle = await idbGet('musicDir');
    if (!handle) {
      grid.innerHTML =
        '<div class="shop-empty"><span class="big">📂</span>还没有选择文件夹<br>点上面的按钮吧～</div>';
      return;
    }
    let perm = await handle.queryPermission({
      mode: 'read',
    });
    if (perm !== 'granted') {
      perm = await handle.requestPermission({
        mode: 'read',
      });
      if (perm !== 'granted') {
        grid.innerHTML =
          '<div class="shop-empty"><span class="big">🔒</span>没有读取权限<br>请重新选择文件夹</div>';
        return;
      }
    }
    updateFolderInfo(handle.name);
    if (status) status.textContent = 'SYS: SCANNING…';
    grid.innerHTML =
      '<div class="shop-empty"><span class="big">🔍</span>正在扫描音乐…</div>';

    const files = [];
    const lrcMap = {};
    await walk(handle, files, '', lrcMap);
    if (files.length === 0) {
      grid.innerHTML =
        '<div class="shop-empty"><span class="big">🎵</span>没找到 mp3 / flac 文件<br>检查一下文件夹？</div>';
      if (status) status.textContent = 'SYS: EMPTY';
      return;
    }
    // 释放旧的 Blob URL
    SONGS.forEach((s) => {
      if (s.fileUrl) {
        try {
          URL.revokeObjectURL(s.fileUrl);
        } catch (e) {}
        s.fileUrl = null;
      }
      if (s.coverUrl && s.coverUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(s.coverUrl);
        } catch (e) {}
      }
    });
    SONGS = [];
    // 并行获取所有文件（关键优化）
    const fileObjs = await Promise.all(
      files.map((f) => f.handle.getFile().catch(() => null)),
    );
    for (let i = 0; i < files.length; i++) {
      const fh = files[i].handle;
      const fPath = files[i].path;
      const file = fileObjs[i];
      if (!file) continue;
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const price = calcPrice(file.size, ext);
      const key = fileKey(file.name, file.size);
      const cacheKey = key + '::' + (file.lastModified || 0);
      const snap = TAGS_SNAPSHOT[cacheKey] || {};
      // 看有没有同名 .lrc
      const lrcKey = fPath.replace(/\.[^.]+$/, '').toLowerCase();
      const lrcHandle = lrcMap[lrcKey] || null;
      SONGS.push({
        key,
        file,
        fileHandle: fh,
        lrcHandle: lrcHandle,
        ext,
        sizeMB: file.size / 1024 / 1024,
        price,
        owned: !!PURCHASED[key],
        name: snap.name || file.name.replace(/\.[^.]+$/, ''),
        artist: snap.artist || '',
        _tagName: snap.name || '',
        _tagArtist: snap.artist || '',
        album: snap.album || '',
        coverUrl: defaultCover(file.name),
        fileUrl: null,
        cacheKey: cacheKey,
        _tagsLoaded: false,
        _loading: false,
      });
    }
    if (status)
      status.textContent =
        'SYS: READY · ' +
        SONGS.length +
        ' 首' +
        (isPrimaryTab ? '' : ' [从属]');
    viewMode = 'all';
    currentFav = null;
    updateNavActive();
    updateSearchVisibility();
    renderContent();
    // 后台全量加载所有封面和标签
    SONGS.forEach((song, i) => enqueueLoad(song, i));
  }
  /* ============ 并发队列 ============ */
  let _activeLoads = 0;
  const _loadQueue = [];
  const MAX_CONCURRENT_LOADS = 10;

  function enqueueLoad(song, idx) {
    if (song._tagsLoaded || song._loading || song._queued) return;
    song._queued = true;
    _loadQueue.push({
      song,
      idx,
    });
    _pumpLoadQueue();
  }

  function _pumpLoadQueue() {
    while (_activeLoads < MAX_CONCURRENT_LOADS && _loadQueue.length > 0) {
      const task = _loadQueue.shift();
      const song = task.song;
      const idx = task.idx;
      song._queued = false;
      _activeLoads++;
      loadSongTags(song, idx).finally(() => {
        _activeLoads--;
        _pumpLoadQueue();
      });
    }
  }
  /* ============ 懒加载 ============ */
  async function loadSongTags(song, idx) {
    if (song._tagsLoaded || song._loading) return;
    song._loading = true;
    try {
      // 优先应用手动覆盖
      const ov = OVERRIDES[song.key];

      // 查缓存
      const cacheKey = song.cacheKey;
      if (cacheKey) {
        const cached = await coverCacheGet(cacheKey);
        if (cached) {
          if (cached.name) {
            song.name = cached.name;
            song._tagName = cached.name;
          }
          if (cached.artist) {
            song.artist = cached.artist;
            song._tagArtist = cached.artist;
          }
          if (cached.album) song.album = cached.album;
          if (cached.coverBlob) {
            song.coverUrl = URL.createObjectURL(cached.coverBlob);
          }
          // 手动覆盖优先
          if (ov) {
            if (ov.name) song.name = ov.name;
            song.artist = ov.artist || '';
          }
          song._tagsLoaded = true;
          song._loading = false;
          updateSongCardContent(song, idx);
          return;
        }
      }

      // 读标签
      const ok = await ensureJsmediatags();
      if (!ok) {
        song._tagsLoaded = true;
        song._loading = false;
        return;
      }
      const tags = await readTags(song.file);

      let coverBlob = null;
      let hasTitle = false;
      let hasArtist = false;

      if (tags) {
        if (tags.title) {
          song.name = tags.title;
          song._tagName = tags.title;
          hasTitle = true;
        }
        if (tags.artist) {
          song.artist = tags.artist;
          song._tagArtist = tags.artist;
          hasArtist = true;
        }
        if (tags.album) song.album = tags.album;
        if (tags.picture) {
          coverBlob = await compressCover(tags.picture);
          if (coverBlob) {
            song.coverUrl = URL.createObjectURL(coverBlob);
          }
        }
      }

      // 标签没给的信息，才退回文件名；artist 不再猜测，留空
      if (!hasTitle) song.name = song.file.name.replace(/\.[^.]+$/, '');

      // 手动覆盖最优先
      if (ov) {
        if (ov.name) song.name = ov.name;
        song.artist = ov.artist || '';
      }

      // 写缓存
      if (cacheKey) {
        await coverCacheSet(cacheKey, {
          name: song.name,
          artist: song.artist,
          album: song.album,
          coverBlob: coverBlob,
        });
      }
    } catch (e) {}
    // 保存快照（歌名/歌手/专辑）
    if (song.cacheKey) {
      TAGS_SNAPSHOT[song.cacheKey] = {
        name: song.name,
        artist: song.artist,
        album: song.album,
      };
      scheduleSnapSave();
    }
    song._tagsLoaded = true;
    song._loading = false;
    updateSongCardContent(song, idx);
    // 更新状态栏进度
    const loaded = SONGS.filter((s) => s._tagsLoaded).length;
    const status = document.getElementById('shop-status');
    if (status && loaded < SONGS.length) {
      status.textContent = 'SYS: 读取中 ' + loaded + '/' + SONGS.length;
    } else if (status) {
      status.textContent =
        'SYS: READY · ' +
        SONGS.length +
        ' 首' +
        (isPrimaryTab ? '' : ' [从属]');
    }
  }

  function setupLazy() {
    if (lazyObserver) lazyObserver.disconnect();
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    if (!('IntersectionObserver' in window)) {
      currentIdxs
        .slice(0, visibleCount)
        .forEach((i) => enqueueLoad(SONGS[i], i));
      return;
    }
    lazyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const card = entry.target;
          const idx = Number(card.dataset.idx);
          const song = SONGS[idx];
          if (song) enqueueLoad(song, idx);
          lazyObserver.unobserve(card);
        });
      },
      {
        root: grid,
        rootMargin: CONFIG.LAZY_ROOT_MARGIN,
      },
    );
    grid.querySelectorAll('.song-card').forEach((c) => lazyObserver.observe(c));
  }
  /* ============ 视图 ============ */
  function renderContent() {
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    grid.innerHTML = '';
    stopCatTalk();
    stopCatFullSong();
    closePlaylist();

    if (viewMode === 'all' || viewMode === 'favDetail') {
      renderList(true);
    } else if (viewMode === 'favs') {
      currentIdxs = [];
      visibleCount = CONFIG.PAGE_SIZE;
      renderFavCards(grid);
    } else if (viewMode === 'items') {
      renderItemShop(grid);
    } else if (viewMode === 'inventory') {
      renderInventory(grid);
    } else if (viewMode === 'tasks') {
      renderTasks(grid);
    }
    const taskBtnEl = document.getElementById('shop-task-btn');
    if (taskBtnEl) taskBtnEl.classList.toggle('on', viewMode === 'tasks');
  }

  function computeCurrentIdxs() {
    const q = searchText.trim().toLowerCase();
    const favKeys =
      viewMode === 'favDetail' && currentFav && FAVS[currentFav]
        ? new Set(FAVS[currentFav])
        : null;
    const idxs = [];
    for (let i = 0; i < SONGS.length; i++) {
      const song = SONGS[i];
      if (favKeys && !favKeys.has(song.key)) continue;
      if (q) {
        const hay = (song.name + ' ' + (song.artist || '')).toLowerCase();
        if (hay.indexOf(q) < 0) continue;
      }
      idxs.push(i);
    }
    return idxs;
  }

  function renderList(reset) {
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    if (reset) {
      if (SONGS.length === 0) {
        grid.innerHTML =
          '<div class="shop-empty"><span class="big">🎧</span>还没有音乐，先选择文件夹吧～</div>';
        return;
      }
      if (viewMode === 'favDetail') {
        grid.innerHTML = '';
        grid.appendChild(buildFavDetailBar());
      } else {
        grid.innerHTML = '';
      }
      currentIdxs = computeCurrentIdxs();
      visibleCount = CONFIG.PAGE_SIZE;
    }
    const frag = document.createDocumentFragment();
    const end = Math.min(visibleCount, currentIdxs.length);
    let existing = grid.querySelectorAll('.song-card').length;
    for (let i = existing; i < end; i++) {
      frag.appendChild(buildSongCard(SONGS[currentIdxs[i]], currentIdxs[i]));
    }
    grid.appendChild(frag);
    const oldMore = grid.querySelector('.shop-loadmore');
    if (oldMore) oldMore.remove();
    if (currentIdxs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'shop-empty';
      empty.innerHTML = '<span class="big">🔍</span>没有找到匹配的歌曲';
      grid.appendChild(empty);
    }
    requestAnimationFrame(() => {
      layoutCovers();
      setupLazy();
    });
  }

  function appendMoreCards() {
    renderList(false);
  }

  function buildFavDetailBar() {
    const bar = document.createElement('div');
    bar.className = 'shop-back-bar';
    const backBtn = document.createElement('button');
    backBtn.className = 'shop-back-btn';
    backBtn.innerHTML = '‹ 返回';
    backBtn.onclick = () => {
      viewMode = 'favs';
      currentFav = null;
      updateNavActive();
      updateSearchVisibility();
      renderContent();
    };
    const title = document.createElement('div');
    title.className = 'shop-fav-title';
    const cnt = (FAVS[currentFav] || []).length;
    title.innerHTML =
      '♡ ' + escapeHtml(currentFav) + '<span class="cnt">' + cnt + ' 首</span>';
    const playAllBtn = document.createElement('button');
    playAllBtn.className = 'shop-playall-btn';
    playAllBtn.innerHTML = '▶ 播放';
    playAllBtn.onclick = () => playFavAll(currentFav);
    const renBtn = document.createElement('button');
    renBtn.className = 'shop-rename-btn';
    renBtn.innerHTML = '✎ 重命名';
    renBtn.onclick = () => renameFav(currentFav);
    bar.appendChild(backBtn);
    bar.appendChild(title);
    bar.appendChild(playAllBtn);
    bar.appendChild(renBtn);
    return bar;
  }

  /* ============ 收藏夹 ============ */
  function renderFavCards(grid) {
    const names = Object.keys(FAVS);
    if (names.length === 0) {
      grid.appendChild(buildNewFavCard());
      return;
    }
    const frag = document.createDocumentFragment();
    names.forEach((name) => frag.appendChild(buildFavCard(name)));
    frag.appendChild(buildNewFavCard());
    grid.appendChild(frag);
    names.forEach((name) => loadAndUpdateFavCover(name));
    requestAnimationFrame(() => layoutCovers());
  }

  function buildFavCard(name) {
    const card = document.createElement('div');
    card.className = 'shop-fav-card';
    card.dataset.favName = name;
    const badge = document.createElement('div');
    badge.className = 'shop-fav-count-badge';
    badge.textContent = (FAVS[name] || []).length;
    card.appendChild(badge);
    const cover = document.createElement('div');
    cover.className = 'shop-fav-cover';
    const img = document.createElement('img');
    img.src = defaultFavCover();
    img.loading = 'lazy';
    cover.appendChild(img);
    const actions = document.createElement('div');
    actions.className = 'shop-fav-actions';
    const renBtn = document.createElement('div');
    renBtn.className = 'shop-fav-act ren';
    renBtn.textContent = '✎';
    renBtn.onclick = (e) => {
      e.stopPropagation();
      renameFav(name);
    };
    const delBtn = document.createElement('div');
    delBtn.className = 'shop-fav-act del';
    delBtn.textContent = '×';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteFav(name);
    };
    actions.appendChild(renBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);
    const info = document.createElement('div');
    info.className = 'shop-fav-info';
    const nm = document.createElement('div');
    nm.className = 'shop-fav-name';
    nm.textContent = name;
    info.appendChild(nm);
    card.appendChild(cover);
    card.appendChild(info);
    card.onclick = () => openFavDetail(name);
    return card;
  }

  function buildNewFavCard() {
    const card = document.createElement('div');
    card.className = 'shop-fav-new-card';
    card.innerHTML =
      '<div class="shop-fav-new-icon">+</div><div class="shop-fav-new-text">新建收藏夹</div>';
    card.onclick = () => createFav(null);
    return card;
  }
  async function loadAndUpdateFavCover(name) {
    const keys = FAVS[name];
    if (!keys || !keys.length) return;
    const songIdx = SONGS.findIndex((s) => s.key === keys[0]);
    if (songIdx < 0) return;
    const song = SONGS[songIdx];
    if (!song._tagsLoaded) await loadSongTags(song, songIdx);
    const card = document.querySelector(
      '.shop-fav-card[data-fav-name="' + cssEscape(name) + '"]',
    );
    if (!card) return;
    const img = card.querySelector('.shop-fav-cover img');
    if (img && song.coverUrl) img.src = song.coverUrl;
  }

  function openFavDetail(name) {
    currentFav = name;
    viewMode = 'favDetail';
    updateNavActive();
    updateSearchVisibility();
    renderContent();
  }

  function createFav(pendingKey) {
    const defaultName = '收藏夹' + (Object.keys(FAVS).length + 1);
    const name = prompt('新收藏夹名称：', defaultName);
    if (!name || !name.trim()) return null;
    const n = name.trim();
    if (FAVS[n]) {
      alert('已存在同名收藏夹');
      return null;
    }
    FAVS[n] = [];
    if (pendingKey) FAVS[n].push(pendingKey);
    saveFavs();
    if (pendingKey) updateAllFavBtns();
    if (viewMode === 'favs' || viewMode === 'favDetail') renderContent();
    toast('已创建「' + n + '」');
    return n;
  }

  function renameFav(oldName) {
    if (!FAVS[oldName]) return;
    const newName = prompt('重命名收藏夹：', oldName);
    if (!newName || !newName.trim()) return;
    const n = newName.trim();
    if (n === oldName) return;
    if (FAVS[n]) {
      alert('已存在同名收藏夹');
      return;
    }
    const newFavs = {};
    Object.keys(FAVS).forEach((k) => {
      if (k === oldName) newFavs[n] = FAVS[k];
      else newFavs[k] = FAVS[k];
    });
    FAVS = newFavs;
    if (currentFav === oldName) currentFav = n;
    saveFavs();
    toast('已重命名为「' + n + '」');
    renderContent();
  }

  function deleteFav(name) {
    if (!FAVS[name]) return;
    showConfirm(
      '删除收藏夹',
      '删除「' + name + '」？\n（只删除列表，不会删除音乐或购买记录）',
      () => {
        delete FAVS[name];
        if (currentFav === name) {
          currentFav = null;
          viewMode = 'favs';
        }
        saveFavs();
        updateAllFavBtns();
        renderContent();
      },
    );
  }

  function openFavMenu(songKey, anchorEl) {
    document.querySelectorAll('.shop-fav-menu').forEach((m) => m.remove());
    const menu = document.createElement('div');
    menu.className = 'shop-fav-menu';
    const names = Object.keys(FAVS);
    let html = '<div class="shop-fav-menu-title">♡ 加入收藏夹</div>';
    if (names.length === 0) {
      html +=
        '<div class="shop-fav-menu-empty">还没有收藏夹哦～<br>点下面新建一个吧</div>';
    } else {
      names.forEach((name) => {
        const has = FAVS[name].indexOf(songKey) >= 0;
        html +=
          '<div class="shop-fav-menu-item" data-name="' +
          escapeHtml(name) +
          '">' +
          (has ? '✓ ' : '') +
          '♡ ' +
          escapeHtml(name) +
          '</div>';
      });
    }
    html +=
      '<div class="shop-fav-menu-item shop-fav-menu-new" id="shop-fav-menu-new">+ 新建收藏夹</div>';
    menu.innerHTML = html;
    applyThemeVars(menu);
    document.body.appendChild(menu);
    const rect = anchorEl.getBoundingClientRect();
    const menuW = menu.offsetWidth || 170;
    const menuH = menu.offsetHeight || 160;
    let left = Math.max(
      8,
      Math.min(window.innerWidth - menuW - 8, rect.right - menuW),
    );
    let top = rect.bottom + 6;
    if (top + menuH > window.innerHeight - 8) top = rect.top - menuH - 6;
    top = Math.max(8, top);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.querySelectorAll('.shop-fav-menu-item[data-name]').forEach((item) => {
      item.onclick = () => {
        const name = item.dataset.name;
        const list = FAVS[name] || (FAVS[name] = []);
        const i = list.indexOf(songKey);
        if (i >= 0) {
          list.splice(i, 1);
          toast('已从「' + name + '」移除');
        } else {
          list.push(songKey);
          toast('已加入「' + name + '」');
        }
        saveFavs();
        menu.remove();
        updateAllFavBtns();
        if (viewMode === 'favDetail' || viewMode === 'favs') renderContent();
      };
    });
    document.getElementById('shop-fav-menu-new').onclick = () => {
      menu.remove();
      createFav(songKey);
    };
    setTimeout(() => {
      const close = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }

  /* ============ 歌曲卡片 ============ */
  function buildSongCard(song, idx) {
    const card = document.createElement('div');
    card.className = 'song-card' + (song.owned ? ' owned' : '');
    card.dataset.idx = idx;
    const cover = document.createElement('div');
    cover.className = 'song-cover';
    const img = document.createElement('img');
    img.src = song.coverUrl;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '';
    cover.appendChild(img);
    if (!song.owned) {
      const lock = document.createElement('div');
      lock.className = 'song-lock';
      lock.innerHTML =
        '<div class="song-lock-icon">🔒</div>' +
        '<div class="song-lock-price">' +
        getDisplayPrice(song) +
        '</div>' +
        '<div class="song-lock-unit">学币</div>';
      cover.appendChild(lock);
    }
    const favBtn = document.createElement('div');
    const isFav = inAnyFav(song.key);
    favBtn.className = 'song-fav-btn' + (isFav ? ' active' : '');
    favBtn.textContent = isFav ? '❤' : '♡';
    favBtn.onclick = (e) => {
      e.stopPropagation();
      openFavMenu(song.key, favBtn);
    };
    card.appendChild(favBtn);
    const meta = document.createElement('div');
    meta.className = 'song-meta';
    const nm = document.createElement('div');
    nm.className = 'song-name';
    nm.textContent = song.name;
    nm.title = song.name;
    const ar = document.createElement('div');
    ar.className = 'song-artist';
    if (song.artist) {
      ar.textContent = song.artist;
      ar.title = song.artist;
    } else if (song._tagsLoaded) {
      ar.textContent = '未知艺术家';
      ar.title = '';
    } else {
      ar.textContent = '⏳ 识别中…';
      ar.classList.add('loading');
    }
    meta.appendChild(nm);
    meta.appendChild(ar);
    card.appendChild(cover);
    card.appendChild(meta);
    card.addEventListener('click', () => handleCardClick(idx));
    return card;
  }

  function updateSongCardContent(song, idx) {
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    const card = grid.querySelector('.song-card[data-idx="' + idx + '"]');
    if (!card) return;
    const img = card.querySelector('.song-cover img');
    if (img && song.coverUrl) img.src = song.coverUrl;
    const nm = card.querySelector('.song-name');
    if (nm) {
      nm.textContent = song.name;
      nm.title = song.name;
    }
    const ar = card.querySelector('.song-artist');
    if (ar) {
      ar.textContent = song.artist || '未知艺术家';
      ar.title = song.artist || '';
      ar.classList.remove('loading');
    }
  }

  function updateAllFavBtns() {
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    grid.querySelectorAll('.song-card').forEach((card) => {
      const idx = Number(card.dataset.idx);
      const song = SONGS[idx];
      if (!song) return;
      const btn = card.querySelector('.song-fav-btn');
      if (!btn) return;
      const active = inAnyFav(song.key);
      btn.textContent = active ? '❤' : '♡';
      btn.classList.toggle('active', active);
    });
  }

  /* ============ 购买 / 播放 ============ */
  function handleCardClick(idx) {
    const song = SONGS[idx];
    if (!song) return;
    if (!song.owned) tryPurchase(idx);
    else playSong(idx);
  }

  function tryPurchase(idx) {
    const song = SONGS[idx];
    if (!song) return;
    const price = getDisplayPrice(song);
    if (S.coins < price) {
      neonFlash('学币不够！还差 ' + (price - S.coins) + ' 币');
      return;
    }
    const content =
      '🎵 ' +
      song.name +
      '\n' +
      '🎤 ' +
      (song.artist || '未知艺术家') +
      '\n' +
      '📦 ' +
      song.ext.toUpperCase() +
      ' · ' +
      song.sizeMB.toFixed(1) +
      ' MB\n\n' +
      '💰 花费：' +
      price +
      ' 学币\n' +
      '💳 余额：' +
      S.coins +
      ' → ' +
      (S.coins - price);
    showConfirm('♡ 确认购买 ♡', content, () => {
      S.coins -= price;
      saveState();
      PURCHASED[song.key] = Date.now();
      savePurchased();
      if (PRICE_OVERRIDES[song.key] !== undefined) {
        delete PRICE_OVERRIDES[song.key];
        savePriceOverrides();
      }
      song.owned = true;
      updateCoinUI();
      const grid = document.getElementById('shop-grid');
      const old = grid.querySelector('.song-card[data-idx="' + idx + '"]');
      if (old) {
        const fresh = buildSongCard(song, idx);
        if (currentIdx === idx) fresh.classList.add('playing');
        old.replaceWith(fresh);
      }
      spawnHearts();
      neonFlash('购买成功！');
    });
  }

  function playSong(idx) {
    const song = SONGS[idx];
    if (!song || !song.owned) return;
    currentIdx = idx;
    if (!song.fileUrl) song.fileUrl = URL.createObjectURL(song.file);
    const audio = document.getElementById('shop-audio');
    const player = document.getElementById('shop-player');
    if (!audio || !player) return;
    audio.src = song.fileUrl;
    audio.play().catch(() => {});
    player.classList.add('active');
    document.getElementById('shop-player-cover').src = song.coverUrl;
    document.getElementById('shop-player-title').textContent = song.name;
    document.getElementById('shop-player-artist').textContent =
      song.artist || '未知艺术家';
    // 加入播放列表（如果不在）
    if (PLAYLIST.indexOf(song.key) < 0) {
      PLAYLIST.push(song.key);
      savePlaylist();
    }
    document.querySelectorAll('.song-card').forEach((c) => {
      c.classList.toggle('playing', Number(c.dataset.idx) === idx);
    });
    updatePlayerVisual();
    if (!song._tagsLoaded && !song._loading) {
      loadSongTags(song, idx).then(() => {
        if (currentIdx === idx) updateMagicUI(song);
      });
    } else {
      updateMagicUI(song);
    }
    if (!UNLOCKED_LYRICS[song.key] && magicUIEls && magicUIEls.lyricsWrap) {
      magicUIEls.lyricsWrap.classList.add('collapsed');
      magicUIEls.lyricsToggle.classList.add('collapsed');
    }
    const lyr = LYRICS[song.key];
    const needLocalReload = song.lrcHandle && lyr && !lyr.local;
    if (lyr && lyr._parsed && !needLocalReload) {
      lyr._lastIdx = -1;
      renderLyrics();
    } else {
      if (magicUIEls && magicUIEls.lyrics) {
        magicUIEls.lyrics.innerHTML =
          '<div class="magic-lyrics-line">♪ 搜索歌词中…</div>';
      }
      ensureLyrics(song).then(() => {
        renderLyrics();
      });
    }
  }

  function bindAudioNext() {
    const audio = document.getElementById('shop-audio');
    if (!audio) return;
    audio.addEventListener('ended', () => {
      if (currentIdx < 0) return;
      const next = getNextSongIdx();
      if (next >= 0) playSong(next);
    });
  }

  function getNextSongIdx() {
    if (currentIdx < 0) return -1;
    const currentKey = SONGS[currentIdx].key;
    // 未解锁交响乐蛋糕时，默认顺序播放已购歌曲
    if (!INVENTORY.symphony.owned) {
      for (let i = currentIdx + 1; i < SONGS.length; i++) {
        if (SONGS[i].owned) return i;
      }
      return -1;
    }
    // 已解锁，按 PLAYMODE
    if (PLAYMODE === 'single') {
      return currentIdx;
    }
    if (PLAYMODE === 'random') {
      const owned = SONGS.map((s, i) => ({
        s,
        i,
      })).filter((x) => x.s.owned);
      if (owned.length === 0) return -1;
      const pick = owned[Math.floor(Math.random() * owned.length)];
      return pick.i;
    }
    // list / sequence 一样：从当前列表里找下一首
    const listKeys =
      PLAYLIST.length > 0
        ? PLAYLIST
        : SONGS.filter((s) => s.owned).map((s) => s.key);
    const pos = listKeys.indexOf(currentKey);
    if (pos < 0) {
      // 找不到就从 SONGS 里找
      for (let i = currentIdx + 1; i < SONGS.length; i++) {
        if (SONGS[i].owned) return i;
      }
      return -1;
    }
    if (PLAYMODE === 'list') {
      const nextKey = listKeys[(pos + 1) % listKeys.length];
      return SONGS.findIndex((s) => s.key === nextKey);
    } else {
      // sequence
      if (pos + 1 >= listKeys.length) return -1;
      const nextKey = listKeys[pos + 1];
      return SONGS.findIndex((s) => s.key === nextKey);
    }
  }

  function updatePlayerVisual() {
    const player = document.getElementById('shop-player');
    if (!player) return;
    player.classList.toggle(
      'magic',
      INVENTORY.magicstar.owned && INVENTORY.magicstar.active,
    );
    player.classList.toggle('symphony', INVENTORY.symphony.owned);
    player.classList.toggle('viz-on', isVizEnabled());
    updateModeBtn();
  }

  function updateModeBtn() {
    const map = {
      single: '🔂',
      list: '🔁',
      random: '🔀',
      sequence: '➡️',
    };
    const icon = map[PLAYMODE] || '🔁';
    const btn = document.getElementById('shop-mode-btn');
    if (btn) btn.textContent = icon;
    const mbtn = document.getElementById('magic-mode-btn');
    if (mbtn) {
      mbtn.textContent = icon;
      mbtn.style.display = INVENTORY.symphony.owned ? '' : 'none';
    }
  }

  function cyclePlaymode() {
    if (!INVENTORY.symphony.owned) return;
    const order = ['list', 'single', 'random', 'sequence'];
    const i = order.indexOf(PLAYMODE);
    PLAYMODE = order[(i + 1) % order.length];
    savePlaymode();
    updateModeBtn();
    const names = {
      list: '列表循环',
      single: '单曲循环',
      random: '随机播放',
      sequence: '顺序播放',
    };
    toast('播放模式：' + names[PLAYMODE]);
  }

  /* ============ 播放列表 ============ */
  function togglePlaylist() {
    if (playlistOpen) closePlaylist();
    else openPlaylist();
  }

  function openPlaylist() {
    closePlaylist();
    const anchor = document.getElementById('shop-playlist-btn');
    if (!anchor) return;
    const popup = document.createElement('div');
    popup.className = 'shop-playlist';
    popup.id = 'shop-playlist-popup';

    let html =
      '<div class="shop-playlist-title"><span>📋 播放列表</span><span style="font-size:10px;color:#b59ac9;font-weight:400;">' +
      PLAYLIST.length +
      ' 首</span></div>';
    if (PLAYLIST.length === 0) {
      html +=
        '<div class="shop-playlist-empty">列表是空的<br>播放一首歌就会自动加入</div>';
    } else {
      PLAYLIST.forEach((key, i) => {
        const songIdx = SONGS.findIndex((s) => s.key === key);
        if (songIdx < 0) return;
        const song = SONGS[songIdx];
        const isCur = songIdx === currentIdx;
        html +=
          '<div class="shop-playlist-item' +
          (isCur ? ' playing' : '') +
          '" data-idx="' +
          songIdx +
          '" data-plidx="' +
          i +
          '">' +
          '<span class="pl-name">' +
          (isCur ? '▶ ' : '') +
          escapeHtml(song.name) +
          '</span>' +
          '<span class="shop-playlist-del" data-del="' +
          i +
          '">×</span>' +
          '</div>';
      });
    }
    popup.innerHTML = html;
    applyThemeVars(popup);
    document.body.appendChild(popup);

    const rect = anchor.getBoundingClientRect();
    const pw = popup.offsetWidth || 260;
    const ph = popup.offsetHeight || 300;
    let left = Math.max(
      8,
      Math.min(window.innerWidth - pw - 8, rect.right - pw),
    );
    let top = rect.top - ph - 8;
    if (top < 8) top = rect.bottom + 8;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    popup.querySelectorAll('.shop-playlist-item').forEach((item) => {
      item.onclick = (e) => {
        if (e.target.classList.contains('shop-playlist-del')) return;
        const idx = Number(item.dataset.idx);
        if (idx >= 0 && SONGS[idx] && SONGS[idx].owned) playSong(idx);
      };
    });
    popup.querySelectorAll('.shop-playlist-del').forEach((del) => {
      del.onclick = (e) => {
        e.stopPropagation();
        const i = Number(del.dataset.del);
        PLAYLIST.splice(i, 1);
        savePlaylist();
        openPlaylist();
      };
    });

    playlistOpen = true;
    setTimeout(() => {
      const close = (e) => {
        if (!popup.contains(e.target) && e.target !== anchor) {
          closePlaylist();
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }

  function closePlaylist() {
    const p = document.getElementById('shop-playlist-popup');
    if (p) p.remove();
    playlistOpen = false;
  }

  /* ============ 道具铺 ============ */
  function renderItemShop(grid) {
    const wrap = document.createElement('div');
    wrap.className = 'shop-item-shop';

    const catBox = document.createElement('div');
    catBox.className = 'shop-cat-box';

    if (!lastCatLine) lastCatLine = pickCatLine();
    const boss = document.createElement('div');
    boss.className =
      'shop-cat-boss' + (INVENTORY.rainbow.active ? ' rainbow' : '');
    boss.id = 'shop-cat-boss';
    boss.textContent = lastCatLine.face;
    boss.title = '点我唱歌喵～';
    boss.onclick = catSing;
    catBox.appendChild(boss);

    const nameEl = document.createElement('div');
    nameEl.className = 'shop-cat-name';
    nameEl.textContent = INVENTORY.rainbow.active
      ? '🌈 变色老板喵 🌈'
      : '老板喵';
    catBox.appendChild(nameEl);

    const bubble = document.createElement('div');
    bubble.className = 'shop-cat-bubble';
    bubble.id = 'shop-cat-bubble';
    bubble.textContent = lastCatLine.text;
    catBox.appendChild(bubble);

    wrap.appendChild(catBox);

    const list = document.createElement('div');
    list.className = 'shop-item-list';
    ITEMS.forEach((item) => list.appendChild(buildItemCard(item)));
    wrap.appendChild(list);

    grid.appendChild(wrap);
    startCatTalk();
  }

  function buildItemCard(item) {
    const inv = INVENTORY[item.id];
    const card = document.createElement('div');
    card.className = 'shop-item-card';
    if (inv.owned) card.classList.add('owned');
    if (inv.active) card.classList.add('active');

    const tag = document.createElement('div');
    tag.className = 'shop-item-tag';
    tag.textContent = item.tag;
    card.appendChild(tag);

    const emoji = document.createElement('div');
    emoji.className = 'shop-item-emoji';
    emoji.textContent = item.emoji;
    card.appendChild(emoji);

    const nm = document.createElement('div');
    nm.className = 'shop-item-name';
    nm.textContent = item.name;
    card.appendChild(nm);

    const desc = document.createElement('div');
    desc.className = 'shop-item-desc';
    desc.textContent = item.desc;
    card.appendChild(desc);

    const price = document.createElement('div');
    price.className = 'shop-item-price';
    if (item.type === 'consumable') {
      if (item.id === 'lyricpass') {
        price.textContent = '🎫 持有 ' + LYRIC_PASSES + ' 张';
      } else if (item.id === 'bing') {
        price.textContent = '🥞 持有 ' + BING_COUNT + ' 餅';
      } else if (item.id === 'catfullsong') {
        price.textContent = '🎶 持有 ' + CAT_FULL_SONG + ' 次';
      }
      price.style.color = 'var(--t-main)';
    } else if (item.id === 'catsing') {
      price.textContent =
        '🎤 已购 +' +
        CAT_SING_EXTRA +
        ' 秒 / 上限 +' +
        CAT_SING_EXTRA_MAX +
        ' 秒';
      price.style.color = 'var(--t-main)';
    } else if (inv.owned) {
      if (item.type === 'permanent') price.textContent = '✓ 已解锁';
      else price.textContent = inv.active ? '✨ 使用中' : '✓ 已拥有';
      price.style.color = inv.active ? 'var(--t-main)' : '#ffa726';
    } else {
      price.textContent = item.price + ' 💰';
    }
    card.appendChild(price);

    if (item.id === 'catsing') {
      const remainSec = CAT_SING_EXTRA_MAX - CAT_SING_EXTRA;
      if (remainSec <= 0) {
        const note = document.createElement('div');
        note.className = 'shop-item-qty-label';
        note.style.textAlign = 'center';
        note.style.marginTop = '2px';
        note.textContent = '已达上限 ' + CAT_SING_MAX_TOTAL + ' 秒喵～';
        card.appendChild(note);
        const btnDone = document.createElement('button');
        btnDone.className = 'shop-item-action';
        btnDone.textContent = '✓ 已满级';
        btnDone.classList.add('permanent');
        btnDone.disabled = true;
        btnDone.style.cursor = 'default';
        btnDone.onclick = (e) => e.stopPropagation();
        card.appendChild(btnDone);
        return card;
      }
      const qtyRow = document.createElement('div');
      qtyRow.className = 'shop-item-qty-row';
      const qtyLabel = document.createElement('span');
      qtyLabel.className = 'shop-item-qty-label';
      qtyLabel.textContent = '秒数';
      const qtyInput = document.createElement('input');
      qtyInput.className = 'shop-item-qty-input';
      qtyInput.type = 'number';
      qtyInput.min = 1;
      qtyInput.max = remainSec;
      qtyInput.value = 1;
      qtyInput.addEventListener('click', (ev) => ev.stopPropagation());
      qtyRow.appendChild(qtyLabel);
      qtyRow.appendChild(qtyInput);
      card.appendChild(qtyRow);

      const btn = document.createElement('button');
      btn.className = 'shop-item-action';
      const refreshBtnLabel = () => {
        let q = parseInt(qtyInput.value, 10) || 1;
        q = Math.max(1, Math.min(remainSec, q));
        btn.textContent = '+ ' + q + ' 秒（' + item.price * q + '💰）';
      };
      qtyInput.addEventListener('input', refreshBtnLabel);
      refreshBtnLabel();
      btn.onclick = (e) => {
        e.stopPropagation();
        let q = parseInt(qtyInput.value, 10) || 1;
        q = Math.max(1, Math.min(remainSec, q));
        buyItem(item, q);
      };
      card.appendChild(btn);
      return card;
    }

    if (item.type === 'consumable') {
      const qtyRow = document.createElement('div');
      qtyRow.className = 'shop-item-qty-row';
      const qtyLabel = document.createElement('span');
      qtyLabel.className = 'shop-item-qty-label';
      qtyLabel.textContent = '数量';
      const qtyInput = document.createElement('input');
      qtyInput.className = 'shop-item-qty-input';
      qtyInput.type = 'number';
      qtyInput.min = 1;
      qtyInput.max = 99;
      qtyInput.value = 1;
      qtyInput.addEventListener('click', (ev) => ev.stopPropagation());
      qtyRow.appendChild(qtyLabel);
      qtyRow.appendChild(qtyInput);
      card.appendChild(qtyRow);

      const btn = document.createElement('button');
      btn.className = 'shop-item-action';
      const refreshBtnLabel = () => {
        const q = Math.max(1, Math.min(99, parseInt(qtyInput.value, 10) || 1));
        btn.textContent = '购买 ' + item.price * q + '💰';
      };
      qtyInput.addEventListener('input', refreshBtnLabel);
      refreshBtnLabel();
      btn.onclick = (e) => {
        e.stopPropagation();
        const q = Math.max(1, Math.min(99, parseInt(qtyInput.value, 10) || 1));
        buyItem(item, q);
      };
      card.appendChild(btn);
      return card;
    }

    const btn = document.createElement('button');
    btn.className = 'shop-item-action';
    if (!inv.owned) {
      btn.textContent = '购买';
    } else if (item.type === 'permanent') {
      if (item.id === 'artpalace') {
        btn.textContent = '🏛️ 打开殿堂';
        btn.classList.add('owned');
      } else {
        btn.textContent = '✓ 已解锁';
        btn.classList.add('permanent');
        btn.disabled = true;
        btn.style.cursor = 'default';
      }
    } else if (inv.active) {
      btn.textContent = '关闭';
      btn.classList.add('on');
    } else {
      btn.textContent = '使用';
      btn.classList.add('owned');
    }
    btn.onclick = (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      if (!inv.owned) buyItem(item);
      else if (item.id === 'artpalace') openArtPalacePicker();
      else if (item.type !== 'permanent') toggleItem(item);
    };
    card.appendChild(btn);
    return card;
  }

  function buyItem(item, qty) {
    qty = Math.max(1, Math.min(99, parseInt(qty, 10) || 1));
    const inv = INVENTORY[item.id];
    const isConsumable = item.type === 'consumable';
    const isSingUnlock = item.id === 'catsing';
    if (!isConsumable && item.id !== 'catsing' && inv.owned) return;

    if (isSingUnlock) {
      const remainSec = CAT_SING_EXTRA_MAX - CAT_SING_EXTRA;
      if (remainSec <= 0) {
        neonFlash('已达上限 ' + CAT_SING_MAX_TOTAL + ' 秒喵～');
        return;
      }
      qty = Math.max(1, Math.min(remainSec, qty));
      const total = item.price * qty;
      if (S.coins < total) {
        neonFlash('学币不够喵！还差 ' + (total - S.coins) + ' 币');
        return;
      }
      const content =
        item.emoji +
        ' ' +
        item.name +
        '\n' +
        '本次延长：+' +
        qty +
        ' 秒\n' +
        '累计延长：' +
        CAT_SING_EXTRA +
        ' → ' +
        (CAT_SING_EXTRA + qty) +
        ' 秒\n' +
        '唱歌时长：' +
        (CAT_SING_BASE + CAT_SING_EXTRA) +
        ' → ' +
        (CAT_SING_BASE + CAT_SING_EXTRA + qty) +
        ' 秒\n\n' +
        '💰 花费：' +
        total +
        ' 学币\n' +
        '💳 余额：' +
        S.coins +
        ' → ' +
        (S.coins - total);
      showConfirm('♡ 延长老板歌声 ♡', content, () => {
        S.coins -= total;
        saveState();
        CAT_SING_EXTRA = Math.min(CAT_SING_EXTRA_MAX, CAT_SING_EXTRA + qty);
        saveCatSingExtra();
        CAT_SING_USE = CAT_SING_EXTRA;
        saveCatSingUse();
        inv.owned = true;
        saveInventory();
        updateCoinUI();
        renderContent();
        updatePlayerVisual();
        spawnHearts();
        neonFlash(
          '+' +
            qty +
            ' 秒！现在最长 ' +
            (CAT_SING_BASE + CAT_SING_EXTRA) +
            ' 秒喵～',
        );
      });
      return;
    }
    const total = item.price * qty;
    if (S.coins < total) {
      neonFlash('学币不够喵！还差 ' + (total - S.coins) + ' 币');
      return;
    }
    const content =
      item.emoji +
      ' ' +
      item.name +
      '\n' +
      '📖 ' +
      item.desc.replace(/\n/g, ' ') +
      '\n\n' +
      (isConsumable ? '📦 数量：' + qty + ' 张\n' : '') +
      '💰 花费：' +
      total +
      ' 学币\n' +
      '💳 余额：' +
      S.coins +
      ' → ' +
      (S.coins - total);
    showConfirm('♡ 确认购买道具 ♡', content, () => {
      S.coins -= total;
      saveState();
      if (isConsumable) {
        if (item.id === 'lyricpass') {
          LYRIC_PASSES += qty;
          try {
            localStorage.setItem(K_LYRIC_PASSES, String(LYRIC_PASSES));
          } catch (e) {}
        } else if (item.id === 'bing') {
          BING_COUNT += qty;
          saveBingCount();
        } else if (item.id === 'catfullsong') {
          CAT_FULL_SONG += qty;
          saveCatFullSong();
        }
      } else {
        inv.owned = true;
        if (item.type !== 'permanent') inv.active = true;
        saveInventory();
        if (item.id === 'hidecoins') {
          try {
            localStorage.setItem(K_HIDE_START, String(Date.now()));
          } catch (e) {}
        }
      }
      updateCoinUI();
      renderContent();
      updatePlayerVisual();
      spawnHearts();
      neonFlash(isConsumable ? '已购入 ' + qty + ' 张！' : '购买成功！');
    });
  }

  function toggleItem(item) {
    const inv = INVENTORY[item.id];
    if (!inv.owned || item.type === 'permanent') return;
    inv.active = !inv.active;
    saveInventory();
    updateCoinUI();
    if (item.id === 'hidecoins') {
      if (inv.active) {
        try {
          localStorage.setItem(K_HIDE_START, String(Date.now()));
        } catch (e) {}
      } else {
        try {
          localStorage.removeItem(K_HIDE_START);
        } catch (e) {}
      }
    }
    renderContent();
    updatePlayerVisual();
    // 可视化道具开关时立即生效
    if (item.id === 'audioviz' || item.id === 'audiorainbow') {
      const audio = document.getElementById('shop-audio');
      if (isVizEnabled()) {
        if (audio && !audio.paused) startVizLoop();
      } else {
        stopVizLoop();
      }
    }
    if (inv.active) neonFlash('道具已开启！');
    else neonFlash('道具已关闭');
  }

  /* ============ 背包 ============ */
  function renderTasks(grid) {
    checkDailyReset(); // ← 加这一行
    const wrap = document.createElement('div');
    wrap.className = 'shop-task-page';
    const locked = TASKS_LOCKED === new Date().toDateString();

    // 优惠券展示区
    if (COUPONS.length > 0) {
      const couponBox = document.createElement('div');
      couponBox.className = 'shop-coupon-box';
      const coupon = COUPONS[0];
      couponBox.innerHTML =
        '<div class="shop-coupon-icon">🎟️</div>' +
        '<div class="shop-coupon-info">' +
        '<div class="shop-coupon-title">励志优惠券 × ' +
        COUPONS.length +
        '</div>' +
        '<div class="shop-coupon-desc">下次使用：随机挑一首未购歌，降价 ' +
        coupon.amount +
        ' 学币（最低 1 币）</div>' +
        '</div>';
      const useBtn = document.createElement('button');
      useBtn.className = 'shop-coupon-use';
      useBtn.textContent = '使用';
      useBtn.onclick = () => useCoupon();
      couponBox.appendChild(useBtn);
      wrap.appendChild(couponBox);
    }

    // 添加任务区
    if (!locked) {
      const addRow = document.createElement('div');
      addRow.className = 'shop-task-add';
      const input = document.createElement('input');
      input.className = 'shop-task-input';
      input.type = 'text';
      input.placeholder = '输入今日任务…';
      input.maxLength = 80;
      const addBtn = document.createElement('button');
      addBtn.className = 'shop-task-add-btn';
      addBtn.textContent = '+ 添加';
      const doAdd = () => {
        const text = input.value.trim();
        if (!text) return;
        TASKS.push({
          id:
            'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          text,
          done: false,
          coverKey: '',
        });
        saveTasks();
        renderContent();
      };
      addBtn.onclick = doAdd;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doAdd();
      });
      addRow.appendChild(input);
      addRow.appendChild(addBtn);
      wrap.appendChild(addRow);
    } else {
      const tip = document.createElement('div');
      tip.className = 'shop-task-locked-tip';
      tip.textContent = '🔒 今日任务已锁定，完成后明天才能重置';
      wrap.appendChild(tip);
    }

    // 任务列表
    if (TASKS.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'shop-task-empty';
      empty.innerHTML =
        '<span class="big">📝</span>还没有任务<br>在上面输入框加一个吧～';
      wrap.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'shop-task-list';
      TASKS.forEach((task) => {
        const item = document.createElement('div');
        item.className = 'shop-task-item' + (task.done ? ' done' : '');

        const check = document.createElement('div');
        check.className = 'shop-task-check' + (task.done ? ' locked' : '');
        check.textContent = '✓';
        check.onclick = () => {
          if (task.done) return; // 已完成不能取消
          if (!locked) {
            neonFlash('请先点下方「确认今日任务」！');
            return;
          }
          task.done = true;
          if (!task.coverKey) {
            const owned = SONGS.filter(
              (s) => s.owned && s._tagsLoaded && s.coverUrl,
            );
            if (owned.length) {
              task.coverKey =
                owned[Math.floor(Math.random() * owned.length)].key;
            }
          }
          saveTasks();
          checkAllDoneAndReward();
          renderContent();
        };
        item.appendChild(check);

        const textEl = document.createElement('div');
        textEl.className = 'shop-task-text';
        textEl.textContent = task.text;
        item.appendChild(textEl);

        if (task.done && task.coverKey) {
          const song = SONGS.find((s) => s.key === task.coverKey);
          if (song && song.coverUrl) {
            const img = document.createElement('img');
            img.className = 'shop-task-cover';
            img.src = song.coverUrl;
            img.alt = '';
            item.appendChild(img);
          }
        }

        if (!locked) {
          const del = document.createElement('div');
          del.className = 'shop-task-del';
          del.textContent = '×';
          del.onclick = () => {
            TASKS = TASKS.filter((t) => t.id !== task.id);
            saveTasks();
            renderContent();
          };
          item.appendChild(del);
        }

        list.appendChild(item);
      });
      wrap.appendChild(list);
    }

    // 确认按钮
    if (!locked && TASKS.length > 0) {
      const bar = document.createElement('div');
      bar.className = 'shop-task-confirm-bar';
      const btn = document.createElement('button');
      btn.className = 'shop-task-confirm-btn';
      btn.textContent = '✅ 确认今日任务';
      btn.onclick = () => {
        showConfirm(
          '确认任务',
          '确认后今天的任务列表将锁定，\n不能再添加或删除任务。\n\n确定吗？',
          () => {
            TASKS_LOCKED = new Date().toDateString();
            try {
              localStorage.setItem(K_TASKS_LOCKED, TASKS_LOCKED);
            } catch (e) {}
            renderContent();
          },
        );
      };
      bar.appendChild(btn);
      wrap.appendChild(bar);
    }

    grid.appendChild(wrap);
  }

  function checkAllDoneAndReward() {
    checkDailyReset(); // ← 加这一行
    if (!TASKS.length) return;
    if (!TASKS.every((t) => t.done)) return;
    const today = new Date().toDateString();
    if (COUPON_CLAIMED === today) return; // 今天已领过，不再发

    const amount = Math.floor(Math.random() * 4) + 2; // 2~5
    COUPONS.push({
      id: 'cpn_' + Date.now(),
      amount,
    });
    saveCoupons();
    COUPON_CLAIMED = today;
    try {
      localStorage.setItem(K_COUPON_CLAIMED, COUPON_CLAIMED);
    } catch (e) {}

    neonFlash('今日任务全完成！🎉');
    setTimeout(() => {
      showConfirm(
        '🎉 全部完成',
        '太棒了！今日任务全完成～\n\n获得一张励志优惠券 🎟️\n金额：' +
          amount +
          ' 学币\n\n可在任务页使用，随机给一首未购歌降价。',
        () => {
          renderContent();
        },
      );
    }, 800);
  }

  function useCoupon() {
    if (!COUPONS.length) return;
    const coupon = COUPONS[0];
    const candidates = SONGS.filter((s) => !s.owned);
    if (!candidates.length) {
      neonFlash('所有歌都买过啦，没歌可降价');
      return;
    }
    const song = candidates[Math.floor(Math.random() * candidates.length)];
    const oldPrice = getDisplayPrice(song);
    const newPrice = Math.max(1, oldPrice - coupon.amount);
    if (newPrice >= oldPrice) {
      neonFlash('这首歌已经是最低价了，换个券试试');
      return;
    }
    PRICE_OVERRIDES[song.key] = newPrice;
    savePriceOverrides();
    COUPONS.shift();
    saveCoupons();

    showConfirm(
      '🎟️ 优惠券已使用',
      '抽到啦！\n\n🎵 ' +
        song.name +
        '\n原价 ' +
        oldPrice +
        ' → 现价 ' +
        newPrice +
        ' 学币\n\n去店铺看看吧～',
      () => {
        viewMode = 'all';
        currentFav = null;
        updateNavActive();
        updateSearchVisibility();
        renderContent();
      },
    );
  }

  function renderInventory(grid) {
    const ownedItems = ITEMS.filter(
      (it) =>
        INVENTORY[it.id].owned && it.id !== 'catsing' && it.id !== 'artpalace',
    );
    const palaceOwned = !!(INVENTORY.artpalace && INVENTORY.artpalace.owned);
    const singUnlocked = CAT_SING_EXTRA > 0;
    const wrap = document.createElement('div');
    wrap.className = 'shop-inv-wrap';

    // 老板歌声时长滑动条
    {
      const singCard = document.createElement('div');
      singCard.className =
        'shop-inv-sing-card sing-slider-card' +
        (singUnlocked ? '' : ' sing-locked');

      const head = document.createElement('div');
      head.className = 'shop-inv-sing-head';

      const icon = document.createElement('div');
      icon.className = 'shop-inv-sing-icon';
      icon.textContent = '🎤';
      head.appendChild(icon);

      const infoWrap = document.createElement('div');
      infoWrap.className = 'shop-inv-sing-info-wrap';
      const nm = document.createElement('div');
      nm.className = 'shop-inv-sing-name';
      nm.textContent = '老板唱歌时间';
      const info = document.createElement('div');
      info.className = 'shop-inv-sing-info';
      info.textContent = singUnlocked
        ? '已购 +' + CAT_SING_EXTRA + ' 秒 · 上限 ' + CAT_SING_MAX_TOTAL + ' 秒'
        : '还没买过：去「🎁 道具铺」买「老板歌声延长」，10 币 +1 秒';
      infoWrap.appendChild(nm);
      infoWrap.appendChild(info);
      head.appendChild(infoWrap);
      singCard.appendChild(head);

      const row = document.createElement('div');
      row.className = 'shop-inv-sing-slider-row';

      const maxSec = CAT_SING_BASE + CAT_SING_EXTRA;
      const curSec = CAT_SING_BASE + Math.min(CAT_SING_USE, CAT_SING_EXTRA);

      const slider = document.createElement('input');
      slider.className = 'shop-inv-sing-slider';
      slider.type = 'range';
      slider.min = String(CAT_SING_BASE);
      slider.max = String(maxSec);
      slider.step = '1';
      slider.value = String(curSec);
      slider.disabled = !singUnlocked;
      slider.title = singUnlocked
        ? '在已购范围内拖动'
        : '请先去道具铺买「老板歌声延长」';

      const val = document.createElement('div');
      val.className = 'shop-inv-sing-value';
      val.textContent = singUnlocked ? curSec + '秒' : '未解锁';

      const applySingTime = (v) => {
        v = Math.max(CAT_SING_BASE, Math.min(maxSec, v));
        CAT_SING_USE = v - CAT_SING_BASE;
        saveCatSingUse();
        val.textContent = v + '秒';
        slider.value = String(v);
        if (catSingBusy && catSingAudio) {
          if (catSingTimer) clearTimeout(catSingTimer);
          catSingTimer = setTimeout(stopCatSing, v * 1000);
        }
      };
      slider.addEventListener('input', () => {
        if (!singUnlocked) return;
        applySingTime(parseInt(slider.value, 10) || CAT_SING_BASE);
      });
      slider.addEventListener('change', () => {
        if (!singUnlocked) return;
        neonFlash('老板唱歌时间：' + (CAT_SING_BASE + CAT_SING_USE) + ' 秒');
      });
      slider.addEventListener('click', (ev) => ev.stopPropagation());

      row.appendChild(slider);
      row.appendChild(val);
      singCard.appendChild(row);

      const tip = document.createElement('div');
      tip.className = 'shop-inv-sing-tip';
      tip.textContent = singUnlocked
        ? '已购 +' +
          CAT_SING_EXTRA +
          ' 秒，只能在 2~' +
          maxSec +
          ' 秒之间滑。想更长去道具铺接着买（10 币/秒）。'
        : '去道具铺每次花 10 学币永久 +1 秒，最多 +' +
          CAT_SING_EXTRA_MAX +
          ' 秒。';
      singCard.appendChild(tip);

      wrap.appendChild(singCard);
    }
    // 恶搞道具「饼」
    if (BING_COUNT > 0) {
      const bingCard = document.createElement('div');
      bingCard.className = 'shop-inv-bing-card';

      const icon = document.createElement('div');
      icon.className = 'shop-inv-bing-icon';
      icon.textContent = '🥞';
      bingCard.appendChild(icon);

      const infoWrap = document.createElement('div');
      infoWrap.className = 'shop-inv-bing-info';
      const nm = document.createElement('div');
      nm.className = 'shop-inv-bing-name';
      nm.textContent = '饼';
      const info = document.createElement('div');
      info.className = 'shop-inv-bing-count';
      info.textContent = '持有 ' + BING_COUNT + ' 餅 · 点使用炸屏';
      infoWrap.appendChild(nm);
      infoWrap.appendChild(info);
      bingCard.appendChild(infoWrap);

      const useBtn = document.createElement('button');
      useBtn.className = 'shop-inv-bing-use';
      useBtn.textContent = '使用';
      useBtn.onclick = (e) => {
        e.stopPropagation();
        useBing();
      };
      bingCard.appendChild(useBtn);

      wrap.appendChild(bingCard);
    }
    // 老板完整唱一首
    if (CAT_FULL_SONG > 0) {
      const fullCard = document.createElement('div');
      fullCard.className = 'shop-inv-bing-card';

      const icon = document.createElement('div');
      icon.className = 'shop-inv-bing-icon';
      icon.textContent = '🎶';
      fullCard.appendChild(icon);

      const infoWrap = document.createElement('div');
      infoWrap.className = 'shop-inv-bing-info';
      const nm = document.createElement('div');
      nm.className = 'shop-inv-bing-name';
      nm.textContent = '老板完整唱一首';
      const info = document.createElement('div');
      info.className = 'shop-inv-bing-count';
      info.textContent = '持有 ' + CAT_FULL_SONG + ' 次 · 点使用选歌';
      infoWrap.appendChild(nm);
      infoWrap.appendChild(info);
      fullCard.appendChild(infoWrap);

      const useBtn = document.createElement('button');
      useBtn.className = 'shop-inv-bing-use';
      useBtn.textContent = '使用';
      useBtn.onclick = (e) => {
        e.stopPropagation();
        openCatFullSongPicker();
      };
      fullCard.appendChild(useBtn);

      wrap.appendChild(fullCard);
    }
    // 艺术殿堂入口
    if (palaceOwned) {
      const palaceCard = document.createElement('div');
      palaceCard.className = 'shop-inv-bing-card';

      const icon = document.createElement('div');
      icon.className = 'shop-inv-bing-icon';
      icon.textContent = '🏛️';
      palaceCard.appendChild(icon);

      const infoWrap = document.createElement('div');
      infoWrap.className = 'shop-inv-bing-info';
      const nm = document.createElement('div');
      nm.className = 'shop-inv-bing-name';
      nm.textContent = '艺术殿堂';
      const info = document.createElement('div');
      info.className = 'shop-inv-bing-count';
      const unlockedCount = Object.keys(ART_PALACE_UNLOCKED).length;
      info.textContent = '已解锁 ' + unlockedCount + ' 首 · 点击进入';
      infoWrap.appendChild(nm);
      infoWrap.appendChild(info);
      palaceCard.appendChild(infoWrap);

      const useBtn = document.createElement('button');
      useBtn.className = 'shop-inv-bing-use';
      useBtn.textContent = '进入';
      useBtn.onclick = (e) => {
        e.stopPropagation();
        openArtPalacePicker();
      };
      palaceCard.appendChild(useBtn);

      wrap.appendChild(palaceCard);
    }

    if (
      ownedItems.length === 0 &&
      !singUnlocked &&
      BING_COUNT === 0 &&
      CAT_FULL_SONG === 0 &&
      !palaceOwned
    ) {
      const empty = document.createElement('div');
      empty.className = 'shop-empty';
      empty.style.gridColumn = '1/-1';
      empty.innerHTML =
        '<span class="big">🎒</span>背包空空如也～<br>去「🎁 道具铺」逛逛吧';
      grid.appendChild(empty);
      return;
    }

    ownedItems.forEach((item) => {
      const inv = INVENTORY[item.id];
      const row = document.createElement('div');
      row.className = 'shop-inv-item' + (inv.active ? ' active' : '');

      const icon = document.createElement('div');
      icon.className = 'shop-inv-icon';
      icon.textContent = item.emoji;
      row.appendChild(icon);

      const nm = document.createElement('div');
      nm.className = 'shop-inv-name';
      nm.textContent = item.name;
      row.appendChild(nm);

      const right = document.createElement('div');
      right.className = 'shop-inv-right';

      if (item.type === 'permanent') {
        const status = document.createElement('span');
        status.className = 'shop-inv-status';
        status.textContent = '✓ 已解锁';
        right.appendChild(status);
      } else {
        const status = document.createElement('span');
        status.className = 'shop-inv-status';
        status.textContent = inv.active ? '● 使用中' : '○ 已关闭';
        right.appendChild(status);

        const sw = document.createElement('div');
        sw.className = 'shop-inv-switch' + (inv.active ? ' on' : '');
        const knob = document.createElement('div');
        knob.className = 'shop-inv-knob';
        sw.appendChild(knob);
        sw.onclick = (e) => {
          e.stopPropagation();
          toggleItem(item);
        };
        right.appendChild(sw);
      }
      row.appendChild(right);
      wrap.appendChild(row);
    });
    grid.appendChild(wrap);
  }

  /* ============ 学币 UI ============ */
  function showStudyEarned(coins) {
    const stx = document.getElementById('shop-study-text');
    if (!stx) return;
    studyMsgActive = true;
    stx.textContent = '学到啦 +' + coins + ' 学币';
    stx.style.color = 'var(--t-main)';
    stx.style.fontWeight = '700';
    if (studyMsgTimer) clearTimeout(studyMsgTimer);
    studyMsgTimer = setTimeout(() => {
      studyMsgActive = false;
      stx.style.color = '';
      stx.style.fontWeight = '';
      updateCoinUI();
    }, 3000);
  }
  function updateStudyMarkUI() {
    const btn = document.getElementById('shop-study-mark');
    if (!btn) return;
    if (focusMode) {
      btn.textContent = '🚪 退出专注';
      btn.classList.add('on');
      btn.title = '点击退出专注模式';
    } else if (studyMarked) {
      btn.textContent = '📖 已标记';
      btn.classList.add('on');
      btn.title = '点击进入专注模式';
    } else {
      btn.textContent = '📖 标记';
      btn.classList.remove('on');
      btn.title = '点击标记为学习中';
    }
  }

  function updateCoinUI() {
    const c = document.getElementById('shop-coins');
    if (c) {
      const hide = !!(INVENTORY.hidecoins && INVENTORY.hidecoins.active);
      c.textContent = hide ? '???' : String(S.coins);
      c.title = hide ? '心理良药开启中' : '学币：' + S.coins;
    }
    const t = document.getElementById('shop-today');
    if (t) {
      const m = Math.floor(S.todaySeconds / 60);
      const s = Math.floor(S.todaySeconds % 60);
      t.textContent = '今日已学 ' + pad(m) + ':' + pad(s);
    }
    const fill = document.getElementById('shop-progress');
    const txt = document.getElementById('shop-progress-text');
    const stx = document.getElementById('shop-study-text');
    const p = Math.min(S.progressSeconds, CONFIG.CYCLE_SECONDS);
    if (fill) fill.style.width = (p / CONFIG.CYCLE_SECONDS) * 100 + '%';
    if (txt) txt.textContent = Math.floor(p) + '/' + CONFIG.CYCLE_SECONDS + 's';
    if (stx && !studyMsgActive) {
      if (!studyMarked) stx.textContent = '未标记';
      else if (studyActive) stx.textContent = '(๑•̀ㅂ•́)و✧ 学习中…';
      else stx.textContent = '(｡･ω･｡) 等待播放…';
    }
  }

  /* ============ 专注模式 ============ */
  const K_FOCUS_STATE = 'shop_focus_state_v5';

  let focusMode = false;
  let focusRoundSeconds = 0;
  let focusMilestonesHit = {};
  let focusRoundStartUrl = '';
  let focusSwitching = false;
  let focusSwitchDeadline = 0;
  let focusSwitchTimer = null;
  let _focusNavBound = false;
  let focusStartCoins = 0;
  let focusStartTime = 0;
  let focusSessionCoins = 0;

  function saveFocusState() {
    try {
      localStorage.setItem(
        K_FOCUS_STATE,
        JSON.stringify({
          active: focusMode,
          roundSeconds: focusRoundSeconds,
          milestonesHit: focusMilestonesHit,
          startUrl: focusRoundStartUrl,
          switching: focusSwitching,
          switchDeadline: focusSwitchDeadline,
          startCoins: focusStartCoins,
          startTime: focusStartTime,
          savedAt: Date.now(),
        }),
      );
    } catch (e) {}
  }
  function loadFocusState() {
    try {
      const raw = localStorage.getItem(K_FOCUS_STATE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearFocusState() {
    try {
      localStorage.removeItem(K_FOCUS_STATE);
    } catch (e) {}
  }

  function isVideoPageUrl(url) {
    if (!url) return false;
    try {
      const u = new URL(url, location.origin);
      if (u.hostname !== 'www.bilibili.com' && u.hostname !== 'm.bilibili.com')
        return false;
      return (
        /^\/video\/BV/i.test(u.pathname) ||
        /^\/bangumi\/play\//i.test(u.pathname)
      );
    } catch (e) {
      return false;
    }
  }

  function isSameVideoPage(url, refUrl) {
    if (!url || !refUrl) return false;
    try {
      const a = new URL(url, location.origin);
      const b = new URL(refUrl, location.origin);
      if (a.hostname !== b.hostname) return false;
      // 归一化末尾斜杠
      const pa = a.pathname.replace(/\/+$/, '');
      const pb = b.pathname.replace(/\/+$/, '');
      return pa === pb;
    } catch (e) {
      return false;
    }
  }

    /* —— 跨 tab 检测已废弃 —— */
  function formatFocusDuration(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return h + ' 小时 ' + m + ' 分';
    if (m > 0) return m + ' 分 ' + s + ' 秒';
    return s + ' 秒';
  }

    /* —— 导航检测已废弃（太容易 bug）—— */
  function installFocusNavBlocker() {}
  function uninstallFocusNavBlocker() {}

  /* —— 专注状态条 —— */
  function showFocusStatusBar() {
    const row = document.getElementById('shop-focus-row');
    if (!row) return;
    row.classList.add('on');
    const swBtn = document.getElementById('shop-focus-row-switch');
    if (swBtn) {
      swBtn.onclick = (e) => {
        e.stopPropagation();
        startFocusSwitch();
      };
    }
    updateFocusStatusBar();
  }

  function hideFocusStatusBar() {
    const row = document.getElementById('shop-focus-row');
    if (row) row.classList.remove('on');
  }

  /* —— 专注切换横幅（补丁）—— */
  function showFocusSwitchBar() {
    hideFocusSwitchBar();
    const bar = document.createElement('div');
    bar.className = 'shop-focus-switch-bar';
    bar.id = 'shop-focus-switch-bar';
    bar.style.display = 'flex';
    bar.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;">' +
      '<span class="shop-focus-switch-icon">🔀</span>' +
      '<span class="shop-focus-switch-text">切换到下一个学习视频</span>' +
      '<span class="shop-focus-switch-time" id="shop-focus-switch-time">03:00</span>' +
      '<button class="shop-focus-continue-btn" id="shop-focus-continue-btn">已切换，继续专注</button>' +
      '</div>' +
      '<div style="font-size:10px;color:#b59ac9;text-align:center;margin-top:6px;">' +
      '⚠️ 如果进入新标签页,别忘了关掉旧页面，否则两边会重复计时喵～' +
      '</div>';
    document.body.appendChild(bar);
    const btn = document.getElementById('shop-focus-continue-btn');
    if (btn) btn.onclick = () => continueFocusAfterSwitch();
    updateFocusSwitchBar(3 * 60 * 1000);
  }

  function updateFocusSwitchBar(remainingMs) {
    const el = document.getElementById('shop-focus-switch-time');
    if (!el) return;
    const sec = Math.max(0, Math.ceil(remainingMs / 1000));
    el.textContent = pad(Math.floor(sec / 60)) + ':' + pad(sec % 60);
  }

  function hideFocusSwitchBar() {
    const bar = document.getElementById('shop-focus-switch-bar');
    if (bar) bar.remove();
  }

  function updateFocusStatusBar() {
    const t = document.getElementById('shop-focus-row-time');
    if (!t) return;
    const sec = focusRoundSeconds;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    t.textContent = (h > 0 ? pad(h) + ':' : '') + pad(m) + ':' + pad(s);
  }

  function startFocusSwitch() {
    if (!focusMode || focusSwitching) return;
    focusSwitching = true;
    focusSwitchDeadline = Date.now() + 3 * 60 * 1000;
    // ★ 新增：切换期间恢复页面，方便你挑下一个视频
    document.body.classList.remove('shop-focus-mode');
    saveFocusState();
    showFocusSwitchBar();
    if (focusSwitchTimer) clearInterval(focusSwitchTimer);
    focusSwitchTimer = setInterval(() => {
      const remaining = Math.max(0, focusSwitchDeadline - Date.now());
      updateFocusSwitchBar(remaining);
      if (remaining <= 0) exitFocusMode(true);
    }, 500);
    toast('🔀 3 分钟内切换到下一个学习视频');
  }

  function continueFocusAfterSwitch() {
    if (!focusMode || !focusSwitching) return;
    if (!isVideoPageUrl(location.href)) {
      toast('请先打开要学习的视频');
      return;
    }
    focusSwitching = false;
    focusRoundStartUrl = location.href;
    if (focusSwitchTimer) {
      clearInterval(focusSwitchTimer);
      focusSwitchTimer = null;
    }
    hideFocusSwitchBar();
    // ★ 新增：继续专注，重新屏蔽页面
    document.body.classList.add('shop-focus-mode');
    saveFocusState();
    neonFlash('🎯 继续专注中');
  }

  /* —— 进入 / 退出 —— */
  function enterFocusMode() {
    if (focusMode) return;
    if (!isVideoPageUrl(location.href)) {
      neonFlash('请在视频页开启专注喵～');
      return;
    }
    focusMode = true;
    studyMarked = true;
    focusRoundSeconds = 0;
    focusMilestonesHit = {};
    focusRoundStartUrl = location.href;
    focusSwitching = false;
    focusSwitchDeadline = 0;
    focusStartCoins = S.coins;
    focusStartTime = Date.now();
    focusSessionCoins = 0;
    document.body.classList.add('shop-focus-mode');
    updateStudyMarkUI();
    updateCoinUI();
    showFocusStatusBar();
    saveFocusState();
    neonFlash('🎯 专注模式已开启');
  }

  function exitFocusMode(timeout) {
    if (!focusMode) return;
    focusMode = false;
    studyMarked = false;
    focusSwitching = false;
    focusSwitchDeadline = 0;
    if (focusSwitchTimer) {
      clearInterval(focusSwitchTimer);
      focusSwitchTimer = null;
    }
    document.body.classList.remove('shop-focus-mode');
    hideFocusStatusBar();
    hideFocusSwitchBar();
    updateStudyMarkUI();
    updateCoinUI();
    clearFocusState();

    const gainedCoins = focusSessionCoins;
    const seconds = focusRoundSeconds;
    focusRoundSeconds = 0;
    focusStartCoins = S.coins;
    focusStartTime = 0;
    focusSessionCoins = 0;

    showFocusSummary(seconds, gainedCoins, timeout);
    showFocusEndTip(seconds, gainedCoins);
  }

  /* —— 退出专注：成果弹窗 —— */
  function showFocusSummary(seconds, gainedCoins, timeout) {
    if (seconds < 5) return;

    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let timeStr;
    if (h > 0) timeStr = h + ' 小时 ' + m + ' 分 ' + s + ' 秒';
    else if (m > 0) timeStr = m + ' 分 ' + s + ' 秒';
    else timeStr = s + ' 秒';

    let title, icon, tip;
    if (timeout) {
      title = '切换超时';
      icon = '⏰';
      tip = '这次专注到此结束，下次记得及时点「继续专注」喵～';
    } else if (seconds < 60) {
      title = '专注结束';
      icon = '🌱';
      tip = '时间虽短，也是进步。下次再多坚持一会儿喵～';
    } else if (seconds < 600) {
      title = '专注结束';
      icon = '✨';
      tip = '状态不错！继续保持这种节奏喵～';
    } else if (seconds < 1800) {
      title = '专注结束';
      icon = '💪';
      tip = '坚持了十几分钟，很了不起喵！';
    } else if (seconds < 3600) {
      title = '专注结束';
      icon = '🔥';
      tip = '快一个小时了，注意休息一下眼睛喵～';
    } else {
      title = '专注结束';
      icon = '🏆';
      tip = '厉害！这么长时间的专注，喵喵佩服喵～';
    }

    // 里程碑相关文案
    let coinLine;
    if (gainedCoins > 0) {
      coinLine =
        '<div class="shop-milestone-coins">+' +
        gainedCoins +
        ' 学币</div>' +
        '<div class="shop-milestone-sub" style="margin-top:-6px;font-size:10px;">来自专注里程碑奖励</div>';
    } else {
      const remainMin = Math.max(
        0,
        Math.ceil((30 * 60 - seconds) / 60),
      );
      coinLine =
        '<div class="shop-milestone-sub" style="font-size:11px;color:#b59ac9;line-height:1.6;margin-top:4px;">' +
        '本次未达里程碑<br>' +
        '<span style="color:#ff8c42;font-weight:700;">再专注 ' +
        remainMin +
        ' 分钟</span> 可得 +10 学币喵～' +
        '</div>';
    }

    const mask = document.createElement('div');
    mask.className = 'shop-milestone-mask';
    mask.innerHTML =
      '<div class="shop-milestone-box">' +
      '<div class="shop-milestone-icon">' + icon + '</div>' +
      '<div class="shop-milestone-title">' + title + '</div>' +
      '<div class="shop-milestone-sub">本次专注时长</div>' +
      '<div class="shop-milestone-coins" style="font-size:24px;">' +
      timeStr +
      '</div>' +
      coinLine +
      '<div class="shop-milestone-tip">' + tip + '</div>' +
      '</div>';

    document.body.appendChild(mask);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      mask.style.opacity = '0';
      setTimeout(() => mask.remove(), 420);
    };
    mask.onclick = dismiss;
    setTimeout(dismiss, 8000);
  }

  /* —— 退出专注后：底部短暂显示成果 —— */
  function showFocusEndTip(seconds, gainedCoins) {
    const stx = document.getElementById('shop-study-text');
    if (!stx) return;
    if (seconds < 5) return;

    seconds = Math.floor(seconds);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    let timeStr;
    if (m > 0) timeStr = m + ' 分 ' + s + ' 秒';
    else timeStr = s + ' 秒';

    studyMsgActive = true;
    if (gainedCoins > 0) {
      stx.textContent = '🎯 本次专注 ' + timeStr + ' · +' + gainedCoins + ' 币';
    } else {
      stx.textContent = '🎯 本次专注 ' + timeStr;
    }
    stx.style.color = 'var(--t-main)';
    stx.style.fontWeight = '700';

    if (studyMsgTimer) clearTimeout(studyMsgTimer);
    studyMsgTimer = setTimeout(() => {
      studyMsgActive = false;
      stx.style.color = '';
      stx.style.fontWeight = '';
      updateCoinUI();
    }, 4000);
  }

  /* —— 里程碑 —— */
  function checkFocusMilestones() {
    if (!focusMode) return;
    const HALF_HOUR = 1800;
    const hit = Math.floor(focusRoundSeconds / HALF_HOUR);

    // ★ 关键：先读 localStorage，看别的页面有没有抢先加过
    let latestHit = focusMilestonesHit.halfhour || 0;
    let latestCoins = S.coins;
    try {
      const raw = localStorage.getItem(K_FOCUS_STATE);
      if (raw) {
        const st = JSON.parse(raw);
        if (st.milestonesHit && st.milestonesHit.halfhour) {
          latestHit = Math.max(latestHit, st.milestonesHit.halfhour);
        }
      }
      const rawState = localStorage.getItem(K_STATE);
      if (rawState) {
        const stState = JSON.parse(rawState);
        if (typeof stState.coins === 'number') {
          latestCoins = stState.coins;
        }
      }
    } catch (e) {}

    // 用最新的值，避免自己内存里的旧数据
    focusMilestonesHit.halfhour = latestHit;
    S.coins = latestCoins;

    if (hit > latestHit) {
      const times = hit - latestHit;
      const coins = times * 10;
      focusMilestonesHit.halfhour = hit;

      // ★ 先写"已领过"标记，再写 coins，避免另一个页面同时读
      saveFocusState();

      S.coins += coins;
      S.totalEarned += coins;
      focusSessionCoins += coins;
      saveState();
      updateCoinUI();

      let label;
      const totalHours = hit * 0.5;
      if (totalHours < 1) {
        label = totalHours * 60 + ' 分钟';
      } else if (totalHours === Math.floor(totalHours)) {
        label = totalHours + ' 小时';
      } else {
        label = Math.floor(totalHours) + ' 小时 30 分钟';
      }
      showMilestonePopup(label, coins);
    }
  }
  function spawnMilestoneConfetti() {
    const emojis = ['🎉', '🎊', '✨', '⭐', '💫', '🌟', '💖', '🎈', '🎁', '🏆'];
    for (let i = 0; i < 30; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        el.style.cssText =
          'position:fixed;left:50%;top:50%;font-size:' +
          (20 + Math.random() * 24) +
          'px;pointer-events:none;' +
          'z-index:2147483647;transform:translate(-50%,-50%);';
        document.body.appendChild(el);
        const angle = Math.random() * Math.PI * 2;
        const dist = 120 + Math.random() * 220;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        el.animate(
          [
            {
              transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)',
              opacity: 1,
            },
            {
              transform:
                'translate(calc(-50% + ' +
                dx +
                'px),calc(-50% + ' +
                dy +
                'px)) scale(1.4) rotate(' +
                (Math.random() * 720 - 360) +
                'deg)',
              opacity: 0,
            },
          ],
          {
            duration: 1600 + Math.random() * 800,
            easing: 'cubic-bezier(0.2,0.8,0.4,1)',
          },
        ).onfinish = () => el.remove();
      }, i * 35);
    }
  }

  function showMilestonePopup(label, coins) {
    spawnMilestoneConfetti();
    const mask = document.createElement('div');
    mask.className = 'shop-milestone-mask';
    mask.innerHTML =
      '<div class="shop-milestone-box">' +
      '<div class="shop-milestone-icon">🎉</div>' +
      '<div class="shop-milestone-title">专注里程碑</div>' +
      '<div class="shop-milestone-sub">累计专注 ' +
      label +
      '</div>' +
      '<div class="shop-milestone-coins">+' +
      coins +
      ' 学币</div>' +
      '<div class="shop-milestone-tip">继续加油喵～</div>' +
      '</div>';
    document.body.appendChild(mask);
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      mask.style.opacity = '0';
      setTimeout(() => mask.remove(), 420);
    };
    mask.onclick = dismiss;
    setTimeout(dismiss, 6000);
  }

  /* —— 页面加载不再自动恢复专注（避免刷新卡死）—— */
  function restoreFocusMode() {
    const st = loadFocusState();
    if (!st) return;

    // 只有在「3 分钟切换窗口期」内，才允许继承
    if (st.switching && st.switchDeadline > Date.now()) {
      focusMode = true;
      studyMarked = true;
      focusRoundSeconds = st.roundSeconds || 0;
      focusMilestonesHit = st.milestonesHit || {};
      focusRoundStartUrl = st.startUrl || '';
      focusStartCoins = st.startCoins || S.coins;
      // ★ 关键：继承同一个起点时间戳，不管几个页面算出来都一样
      focusStartTime = st.startTime || (Date.now() - focusRoundSeconds * 1000);

      if (isVideoPageUrl(location.href)) {
        focusSwitching = false;
        focusSwitchDeadline = 0;
        document.body.classList.add('shop-focus-mode');
        updateStudyMarkUI();
        updateCoinUI();
        showFocusStatusBar();
        saveFocusState();
        setTimeout(() => neonFlash('🎯 已继承专注计时'), 900);
        return;
      } else {
        focusSwitching = true;
        focusSwitchDeadline = st.switchDeadline;
        updateStudyMarkUI();
        updateCoinUI();
        showFocusSwitchBar();
        if (focusSwitchTimer) clearInterval(focusSwitchTimer);
        focusSwitchTimer = setInterval(() => {
          const remaining = Math.max(0, focusSwitchDeadline - Date.now());
          updateFocusSwitchBar(remaining);
          if (remaining <= 0) exitFocusMode(true);
        }, 500);
        return;
      }
    }

    clearFocusState();
  }
  /* ============ 网课计时 ============ */
  function startStudyWatcher() {
    const isBiliVideo =
      /^https?:\/\/(www\.|m\.)?bilibili\.com\/(video|bangumi\/play)\//.test(
        location.href,
      );

    setInterval(() => {
      const now = Date.now();
      const video = document.querySelector('video');
      const videoPlaying = !!(
        video &&
        !video.paused &&
        !video.ended &&
        video.readyState >= 2
      );

      /* —— 专注进度：每秒 +1，不管视频是否播放 —— */
      if (focusMode && focusStartTime > 0) {
        focusRoundSeconds = Math.floor((Date.now() - focusStartTime) / 1000);
        checkFocusMilestones();
        saveFocusState();
        updateFocusStatusBar();
      }

      /* —— 60s 学币进度：只在视频播放时累积，专注/非专注都走同一套 —— */
      if (!isBiliVideo) {
        lastSample = null;
        studyActive = false;
        updateCoinUI();
        return;
      }
      if (!studyMarked) {
        lastSample = null;
        studyActive = false;
        updateCoinUI();
        return;
      }
      if (!isPrimaryTab) {
        lastSample = null;
        studyActive = false;
        updateCoinUI();
        return;
      }
      if (!videoPlaying) {
        lastSample = null;
        studyActive = false;
        updateCoinUI();
        return;
      }
      studyActive = true;
      if (lastSample) {
        const wallDelta = (now - lastSample.wallTime) / 1000;
        const videoDelta = video.currentTime - lastSample.videoTime;
        const maxAllowed = wallDelta * 3 + 1.5;
        if (
          wallDelta > 0.3 &&
          wallDelta < 4 &&
          videoDelta > 0 &&
          videoDelta <= maxAllowed
        ) {
          const gained = Math.min(wallDelta, videoDelta);
          S.progressSeconds += gained;
          S.todaySeconds += gained;
          if (S.progressSeconds >= CONFIG.CYCLE_SECONDS) {
            const earned = Math.floor(S.progressSeconds / CONFIG.CYCLE_SECONDS);
            S.progressSeconds -= earned * CONFIG.CYCLE_SECONDS;
            const coins = earned * CONFIG.COIN_PER_MINUTE;
            S.coins += coins;
            S.totalEarned += coins;
            showStudyEarned(coins);
          }
          saveState();
        }
      }
      lastSample = {
        videoTime: video.currentTime,
        wallTime: now,
      };
      updateCoinUI();
    }, 1000);
  }

  function startHideCoinsTimer() {
    setInterval(() => {
      if (!INVENTORY.hidecoins || !INVENTORY.hidecoins.active) return;
      let start = 0;
      try {
        start = parseInt(localStorage.getItem(K_HIDE_START) || '0', 10);
      } catch (e) {}
      if (!start) {
        try {
          localStorage.setItem(K_HIDE_START, String(Date.now()));
        } catch (e) {}
        return;
      }
      const CYCLE = 30 * 60 * 1000;
      if (Date.now() - start >= CYCLE) {
        const bonus = Math.floor(Math.random() * 6) + 5;
        S.coins += bonus;
        S.totalEarned += bonus;
        saveState();
        try {
          localStorage.setItem(K_HIDE_START, String(Date.now()));
        } catch (e) {}
        updateCoinUI();
        const stx = document.getElementById('shop-study-text');
        if (stx) {
          studyMsgActive = true;
          stx.textContent = '🎁 隐匿奖励 +' + bonus + ' 币';
          stx.style.color = 'var(--t-main)';
          stx.style.fontWeight = '700';
          if (studyMsgTimer) clearTimeout(studyMsgTimer);
          studyMsgTimer = setTimeout(() => {
            studyMsgActive = false;
            stx.style.color = '';
            stx.style.fontWeight = '';
            updateCoinUI();
          }, 3000);
        }
      }
    }, 60 * 1000);
  }

  function restoreFolderName() {
    try {
      const name = localStorage.getItem(K_FOLDER_NAME);
      if (name) updateFolderInfo(name);
    } catch (e) {}
  }

  /* ============ 初始化 ============ */
  async function init() {
    // 浏览器兼容性检测
    if (!window.showDirectoryPicker) {
      setTimeout(() => {
        const grid = document.getElementById('shop-grid');
        if (grid) {
          grid.innerHTML =
            '<div class="shop-empty">' +
            '<span class="big">🚫</span>' +
            '你的浏览器不支持读取本地文件夹<br>' +
            '请使用 <b>Chrome</b> 或 <b>Edge</b> 浏览器<br>' +
            '（Firefox / Safari / 手机暂不支持）' +
            '</div>';
        }
        const pickBtn = document.getElementById('shop-pick');
        if (pickBtn) {
          pickBtn.disabled = true;
          pickBtn.style.opacity = '0.4';
          pickBtn.style.cursor = 'not-allowed';
          pickBtn.textContent = '🚫 浏览器不支持';
        }
      }, 100);
    }
    injectCSS();
    buildPanel();
    bindAudioNext();
    restoreFolderName();
    startLeaderHeartbeat();
    startStudyWatcher();
    startHideCoinsTimer();
    updateSearchVisibility();
    updatePlayerVisual();
    updateStudyMarkUI();
    restoreFocusMode();
    setInterval(checkFullscreenAndToggleBall, 500);
    document.addEventListener('fullscreenchange', checkFullscreenAndToggleBall);
    document.addEventListener(
      'webkitfullscreenchange',
      checkFullscreenAndToggleBall,
    );

    const handle = await idbGet('musicDir');
    if (handle) {
      try {
        const perm = await handle.queryPermission({
          mode: 'read',
        });
        if (perm === 'granted') {
          scanAndRender();
        } else {
          const grid = document.getElementById('shop-grid');
          if (grid)
            grid.innerHTML =
              '<div class="shop-empty"><span class="big">🔑</span>已记住文件夹，点"重扫"重新授权</div>';
        }
      } catch (e) {}
    } else {
      const grid = document.getElementById('shop-grid');
      if (grid)
        grid.innerHTML =
          '<div class="shop-empty"><span class="big">🎧</span>点上面的按钮选择你的音乐文件夹吧～</div>';
    }

    // 隐私提醒：只弹一次
    if (!localStorage.getItem('shop_privacy_agreed_v1')) {
      setTimeout(() => {
        showConfirm(
          '隐私提醒',
          '本脚本会把“歌名 + 歌手”发送到网易云音乐搜索歌词，\n不会上传你的音乐文件。\n\n是否继续使用？',
          () => {
            localStorage.setItem('shop_privacy_agreed_v1', '1');
          },
        );
      }, 600);
    }
  }

  function startLeaderHeartbeat() {
    const tick = () => {
      const now = Date.now();
      const v = document.querySelector('video');
      const playing = v && !v.paused && !v.ended && v.readyState >= 2;

      let leader = null;
      try {
        leader = JSON.parse(localStorage.getItem(K_LEADER) || 'null');
      } catch (e) {}

      if (playing) {
        if (leader && leader.id !== TAB_ID && now - leader.ts < 3000) {
          isPrimaryTab = false;
        } else {
          try {
            localStorage.setItem(
              K_LEADER,
              JSON.stringify({
                id: TAB_ID,
                ts: now,
              }),
            );
          } catch (e) {}
          isPrimaryTab = true;
        }
      } else {
        if (leader && leader.id === TAB_ID) {
          try {
            localStorage.removeItem(K_LEADER);
          } catch (e) {}
        }
        isPrimaryTab = false;
      }
    };
    tick();
    setInterval(tick, 1000);
  }

  function waitBody() {
    if (document.body) {
      init();
      return;
    }
    const t = setInterval(() => {
      if (document.body) {
        clearInterval(t);
        init();
      }
    }, 100);
  }
  waitBody();
})();