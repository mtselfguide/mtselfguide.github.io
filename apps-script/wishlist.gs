/**
 * 課程許願牆 — 後端 API（Google Apps Script）
 * ------------------------------------------------------------------
 * 資料存在同一份 Google 試算表，前端（index.html）用 fetch 讀寫。
 * 完整部署步驟見 docs/wishlist.md。
 *
 * 提供三件事：
 *   GET  ?                            → 回傳目前顯示中的許願清單（含票數）
 *   POST {action:'add',  name, token} → 新增一筆許願（名稱重複則自動改為 +1）
 *   POST {action:'vote', id,   token} → 對既有許願 +1
 *
 * 回傳一律是 JSON：{ ok:true, items:[{id,name,votes}], id, created }
 *                  { ok:false, error:'錯誤代碼' }
 */

/* ══════════════════════════════════════════════════════════════════
   設定區：要調整的都在這裡
   ══════════════════════════════════════════════════════════════════ */

/** 新許願是否直接上牆。false = 先進「待審」，你在試算表改成「顯示」才會出現。 */
var AUTO_APPROVE = true;

/** 有人新增許願時寄通知信到這個信箱；留空字串 = 不寄信。 */
var NOTIFY_EMAIL = '';

/** 課程名稱長度限制（不含空白的字數）。 */
var MIN_NAME_LEN = 2;
var MAX_NAME_LEN = 30;

/** 同一位訪客每天最多能新增幾筆、投幾票。 */
var DAILY_ADD_LIMIT  = 3;
var DAILY_VOTE_LIMIT = 20;

/** 禁用字詞：名稱含有其中任一個就退回。例：['廣告', '代購'] */
var BLOCKED_WORDS = [];

/** 清單快取秒數。前端每 45 秒輪詢一次，這層快取可省下大量指令碼執行時間。 */
var CACHE_SECONDS = 20;

/** 執行 seed() 時要塞進去的初始許願，避免許願牆一開始是空的。 */
var SEED_WISHES = [
  '野外急救 WFA',
  '雪地行進與冰斧確保',
  '繩索上升下降',
  '高山縱走行程規劃',
  'GPX 路線繪製',
  '山域天氣判讀'
];

/* ══════════════════════════════════════════════════════════════════
   以下不需修改
   ══════════════════════════════════════════════════════════════════ */

var SHEET_WISHES = '許願清單';
var SHEET_VOTES  = '投票紀錄';

var STATUS_SHOW    = '顯示';
var STATUS_HIDDEN  = '隱藏';
var STATUS_PENDING = '待審';

var WISH_HEADERS = ['ID', '課程名稱', '比對用名稱', '票數', '狀態', '建立時間', '最後更新'];
var VOTE_HEADERS = ['時間', '許願 ID', '訪客代碼', '動作'];

var CACHE_KEY = 'wishlist_items';


/* ── 一次性設定 ──────────────────────────────────────────────── */

/** 第一次使用時手動執行一次：建立兩張工作表與標題列。 */
function setup() {
  var ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, SHEET_WISHES, WISH_HEADERS);
  ensureSheet_(ss, SHEET_VOTES,  VOTE_HEADERS);
  ss.toast('許願牆工作表已就緒', '設定完成', 5);
}

/** 選用：手動執行一次，把 SEED_WISHES 塞進許願清單（票數從 0 開始）。 */
function seed() {
  setup();
  var sh = sheet_(SHEET_WISHES);
  var existing = {};
  readWishes_().forEach(function (w) { existing[w.key] = true; });

  var now = new Date();
  var rows = [];
  SEED_WISHES.forEach(function (name) {
    var key = normalizeKey_(name);
    if (!key || existing[key]) return;
    existing[key] = true;
    rows.push([newId_(), cleanName_(name), key, 0, STATUS_SHOW, now, now]);
  });

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, WISH_HEADERS.length).setValues(rows);
  }
  dropCache_();
}


/* ── HTTP 入口 ───────────────────────────────────────────────── */

function doGet() {
  return json_(safe_(function () {
    return { ok: true, items: listWishes_() };
  }));
}

function doPost(e) {
  return json_(safe_(function () {
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      throw err_('bad_request');
    }

    var token = String(body.token || '').slice(0, 64);
    if (!token) throw err_('bad_request');

    // 同時有人投票時，避免兩筆各自讀到舊票數、寫回去互相覆蓋
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) throw err_('busy');
    try {
      if (body.action === 'add')  return addWish_(String(body.name || ''), token);
      if (body.action === 'vote') return voteWish_(String(body.id || ''), token);
      throw err_('bad_request');
    } finally {
      lock.releaseLock();
    }
  }));
}


/* ── 動作 ────────────────────────────────────────────────────── */

function addWish_(rawName, token) {
  var name = cleanName_(rawName);
  var len  = charCount_(name);
  if (len < MIN_NAME_LEN) throw err_('too_short');
  if (len > MAX_NAME_LEN) throw err_('too_long');
  if (/(https?:\/\/|www\.)/i.test(name)) throw err_('blocked');
  for (var i = 0; i < BLOCKED_WORDS.length; i++) {
    if (BLOCKED_WORDS[i] && name.indexOf(BLOCKED_WORDS[i]) !== -1) throw err_('blocked');
  }

  var key = normalizeKey_(name);
  if (!key) throw err_('too_short');

  // 已經有人許過同一門課 → 不新增，直接幫他 +1
  var wishes = readWishes_();
  for (var j = 0; j < wishes.length; j++) {
    if (wishes[j].key !== key) continue;
    if (wishes[j].status === STATUS_HIDDEN) throw err_('blocked');
    return voteWish_(wishes[j].id, token);
  }

  var history = voteHistory_(token);
  if (countToday_(history, 'add') >= DAILY_ADD_LIMIT) throw err_('rate_limited');

  var id     = newId_();
  var now    = new Date();
  var status = AUTO_APPROVE ? STATUS_SHOW : STATUS_PENDING;

  sheet_(SHEET_WISHES).appendRow([id, name, key, 1, status, now, now]);
  logAction_(id, token, 'add');
  dropCache_();
  notify_(name, status);

  return { ok: true, items: listWishes_(), id: id, created: true, pending: status === STATUS_PENDING };
}

function voteWish_(id, token) {
  var wishes = readWishes_();
  var wish = null;
  for (var i = 0; i < wishes.length; i++) {
    if (wishes[i].id === id) { wish = wishes[i]; break; }
  }
  if (!wish || wish.status !== STATUS_SHOW) throw err_('not_found');

  var history = voteHistory_(token);
  for (var j = 0; j < history.length; j++) {
    if (String(history[j][1]) === id) throw err_('duplicate_vote');
  }
  if (countToday_(history, 'vote') >= DAILY_VOTE_LIMIT) throw err_('rate_limited');

  var sh = sheet_(SHEET_WISHES);
  sh.getRange(wish.row, 4).setValue(wish.votes + 1);
  sh.getRange(wish.row, 7).setValue(new Date());
  logAction_(id, token, 'vote');
  dropCache_();

  return { ok: true, items: listWishes_(), id: id, created: false };
}

function listWishes_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);

  var items = readWishes_()
    .filter(function (w) { return w.status === STATUS_SHOW; })
    .sort(function (a, b) { return (b.votes - a.votes) || (a.created - b.created); })
    .map(function (w) { return { id: w.id, name: w.name, votes: w.votes }; });

  cache.put(CACHE_KEY, JSON.stringify(items), CACHE_SECONDS);
  return items;
}


/* ── 試算表存取 ──────────────────────────────────────────────── */

function readWishes_() {
  var sh = sheet_(SHEET_WISHES);
  var last = sh.getLastRow();
  if (last < 2) return [];

  return sh.getRange(2, 1, last - 1, WISH_HEADERS.length).getValues().map(function (r, i) {
    return {
      row:     i + 2,
      id:      String(r[0]),
      name:    String(r[1]),
      key:     String(r[2]) || normalizeKey_(r[1]),
      votes:   Number(r[3]) || 0,
      status:  String(r[4] || STATUS_SHOW).trim(),
      created: r[5] instanceof Date ? r[5].getTime() : 0
    };
  }).filter(function (w) { return w.id && w.name; });
}

function voteHistory_(token) {
  var sh = sheet_(SHEET_VOTES);
  var last = sh.getLastRow();
  if (last < 2) return [];

  return sh.getRange(2, 1, last - 1, VOTE_HEADERS.length).getValues().filter(function (r) {
    return String(r[2]) === token;
  });
}

function countToday_(history, action) {
  var today = dayStamp_(new Date());
  var n = 0;
  history.forEach(function (r) {
    if (String(r[3]) !== action) return;
    if (r[0] instanceof Date && dayStamp_(r[0]) === today) n++;
  });
  return n;
}

function logAction_(id, token, action) {
  sheet_(SHEET_VOTES).appendRow([new Date(), id, token, action]);
}

function sheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw err_('not_setup');
  return sh;
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function dropCache_() {
  CacheService.getScriptCache().remove(CACHE_KEY);
}


/* ── 小工具 ──────────────────────────────────────────────────── */

/** 顯示用名稱：移除控制字元、把連續空白併成一個、去掉頭尾空白。 */
function cleanName_(s) {
  return String(s)
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\s　]+/g, ' ')
    .trim();
}

/**
 * 比對用名稱：全形轉半形、轉小寫，只留下英數與中日文字。
 * 「攀岩課」「攀岩 課」「攀岩（課）」會得到同一個 key，避免同一門課被拆成好幾筆。
 * ※ index.html 不做重複判斷，一律以這裡為準。
 */
function normalizeKey_(s) {
  return String(s)
    .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
    .toLowerCase()
    .replace(/[^0-9a-z぀-ヿ一-鿿]/g, '');
}

function charCount_(s) {
  return String(s).replace(/[\s　]/g, '').length;
}

function newId_() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

function dayStamp_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function notify_(name, status) {
  if (!NOTIFY_EMAIL) return;
  try {
    MailApp.sendEmail(
      NOTIFY_EMAIL,
      '[課程許願牆] 新許願：' + name,
      '有人許願了一門新課程：\n\n' + name + '\n\n目前狀態：' + status +
      (status === STATUS_PENDING ? '\n（需要你在試算表把狀態改成「顯示」才會出現在網站上）' : '') +
      '\n\n試算表：' + SpreadsheetApp.getActive().getUrl()
    );
  } catch (e) {
    // 寄信失敗（超過每日配額等）不影響許願本身
  }
}

function err_(code) {
  var e = new Error(code);
  e.code = code;
  return e;
}

function safe_(fn) {
  try {
    return fn();
  } catch (e) {
    return { ok: false, error: e && e.code ? e.code : 'server_error' };
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
