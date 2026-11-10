/**
 * 報名後台 — 主程式（Google Apps Script）
 * ------------------------------------------------------------------
 * 綁在「報名後台」試算表上，跟 notify.gs 放在同一個 Apps Script 專案。
 * 完整部署步驟見 docs/admin.md。
 *
 * 這個檔案負責：
 *   setup()               → 建立「活動設定」「繳費狀態」兩張工作表與標題列（只做一次）
 *   syncRegistrations()   → 把各課程表單回覆同步進「繳費狀態」（一位報名者一列），
 *                           有新報名者時交給 coach.gs 寄信通知該活動的負責教練
 *   onOpen()              → 試算表上方的「協會後台」選單（寄信項目由 notify.gs 加入）
 *   doGet()               → 報名與收費總覽網頁（Overview.html）
 *   getOverview()         → 給總覽網頁用的資料（先同步、再加總）
 *   assertAdmin_()        → 不在「管理員」名單就丟錯（notify.gs 也會呼叫）
 *
 * 各課程的表單回覆試算表一律只讀不寫。
 * 同步時只會「新增報名者」和「更新姓名、Email、帳號後五碼」，
 * 管理員填的已入帳、入帳金額、入帳日期、寄出時間、備註、報名狀態、應繳金額都不會被覆蓋。
 */

/* ══════════════════════════════════════════════════════════════════
   設定區：要調整的都在這裡
   ══════════════════════════════════════════════════════════════════ */

/*
 * 可以打開總覽網頁的管理員，寫在「報名後台」試算表的「管理員」工作表 A 欄（一列一個 Email）。
 * 名單不放在程式碼裡，因為這個 repo 是公開的。改名單不用重新部署。
 * 部署這支程式的帳號本人永遠可以看。
 */

/** 開課前幾天內還有人沒繳費，就在卡片上提醒。 */
var UNPAID_WARN_DAYS = 7;

/* ══════════════════════════════════════════════════════════════════
   以下不需修改
   ══════════════════════════════════════════════════════════════════ */

var SHEET_EVENTS   = '活動設定';
var SHEET_PAYMENTS = '繳費狀態';
var SHEET_ADMINS   = '管理員';

var EVENT_HEADERS = [
  '活動ID', '活動名稱', '活動日期', '費用',
  '回覆試算表ID', '回覆工作表名稱', '梯次欄', '梯次值',
  '姓名欄', 'Email欄', '電話欄', '後五碼欄',
  '名額', 'LINE群組連結', '行前通知寄出時間', '狀態',
  '成團人數', '報名截止', '方案欄', '方案價格', '負責教練Email'
];

var ADMIN_HEADERS = ['Email', '備註'];

var PAYMENT_HEADERS = [
  '活動ID', '報名鍵', '姓名', 'Email', '應繳金額', '已入帳', '帳號後五碼',
  '入帳金額', '入帳日期', '入帳通知寄出時間', '行前通知寄出時間', '備註', '報名狀態'
];

var EVENT_STATUS_OPEN   = '開放';
var EVENT_STATUS_FULL   = '額滿';
var EVENT_STATUS_CLOSED = '結束';

var REG_STATUS_OK       = '正常';
var REG_STATUS_WAITLIST = '備取';
var REG_STATUS_CANCEL   = '取消';

/** 「Email欄」沒填時，依序試這幾個標題（Google 表單自動收集 Email 的欄名）。 */
var EMAIL_FALLBACK_HEADERS = ['電子郵件地址', 'Email Address', 'Email', '電子郵件'];


/* ── 一次性設定 ──────────────────────────────────────────────── */

/** 第一次使用時手動執行一次：建立兩張工作表、標題列、核取方塊與下拉選單。 */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var ev = ensureSheet_(ss, SHEET_EVENTS, EVENT_HEADERS);
  var pay = ensureSheet_(ss, SHEET_PAYMENTS, PAYMENT_HEADERS);
  ensureSheet_(ss, SHEET_ADMINS, ADMIN_HEADERS);

  var maxRows = 2000;
  var payCols = headerIndex_(pay);
  pay.getRange(2, payCols['已入帳'] + 1, maxRows, 1).insertCheckboxes();
  pay.getRange(2, payCols['報名狀態'] + 1, maxRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList([REG_STATUS_OK, REG_STATUS_WAITLIST, REG_STATUS_CANCEL], true)
      .setAllowInvalid(false).build());
  pay.getRange(2, payCols['入帳日期'] + 1, maxRows, 1).setNumberFormat('yyyy/mm/dd');
  pay.getRange(2, payCols['帳號後五碼'] + 1, maxRows, 1).setNumberFormat('@');

  var evCols = headerIndex_(ev);
  ev.getRange(2, evCols['狀態'] + 1, 200, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList([EVENT_STATUS_OPEN, EVENT_STATUS_FULL, EVENT_STATUS_CLOSED], true)
      .setAllowInvalid(false).build());

  ss.toast('「活動設定」「繳費狀態」「管理員」已就緒', '設定完成', 5);
}

/** 選用：每小時自動同步一次（不裝也沒關係，打開總覽頁或按選單時都會同步）。 */
function installHourlySync() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncRegistrations') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncRegistrations').timeBased().everyHours(1).create();
}


/* ── 選單 ────────────────────────────────────────────────────── */

function onOpen() {
  var menu = SpreadsheetApp.getUi().createMenu('協會後台')
    .addItem('同步報名資料', 'menuSync')
    .addItem('開啟總覽網頁', 'menuOpenOverview');
  if (typeof addNotifyMenuItems_ === 'function') {
    menu.addSeparator();
    addNotifyMenuItems_(menu);
  }
  menu.addToUi();
}

function menuSync() {
  var ui = SpreadsheetApp.getUi();
  var r = syncRegistrations();
  var lines = ['新增 ' + r.added + ' 位報名者，更新 ' + r.updated + ' 位。'];
  if (r.coachMails) lines.push('已寄 ' + r.coachMails + ' 封新報名通知給負責教練。');
  if (r.errors.length) {
    lines.push('');
    lines.push('有問題的活動：');
    r.errors.forEach(function (e) { lines.push('・' + e); });
  }
  ui.alert('同步完成', lines.join('\n'), ui.ButtonSet.OK);
}

function menuOpenOverview() {
  var url = ScriptApp.getService().getUrl();
  var html = url
    ? '<p style="font:14px sans-serif">總覽網頁：<a href="' + url + '" target="_blank">開啟</a></p>'
    : '<p style="font:14px sans-serif">還沒部署成網頁應用程式，請照 docs/admin.md 第 6 步部署。</p>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(320).setHeight(90), '報名與收費總覽');
}


/* ── 網頁 ────────────────────────────────────────────────────── */

function doGet() {
  if (!isAdmin_()) {
    return HtmlService.createHtmlOutput(
      '<p style="font:15px sans-serif;padding:24px">這個帳號沒有後台權限。請用協會帳號登入，或請管理員把你的 Email 加進「報名後台」試算表的「管理員」工作表。</p>'
    ).setTitle('報名後台');
  }
  return HtmlService.createTemplateFromFile('Overview').evaluate()
    .setTitle('報名與收費總覽')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 總覽資料：先同步，再依「繳費狀態」加總。狀態為「結束」的活動不列出。
 * 回傳 { ok, generatedAt, totals, events:[…], errors:[…] }
 */
function getOverview() {
  return safe_(function () {
    assertAdmin_();
    var sync = syncRegistrations();
    var data = buildOverview_(readEvents_(), readPayments_().rows, new Date());
    data.ok = true;
    data.errors = sync.errors;
    data.generatedAt = new Date().toISOString();
    return data;
  });
}

/** 給 notify.gs 或其他由網頁呼叫的函式使用：不是管理員就丟錯。 */
function assertAdmin_() {
  if (!isAdmin_()) throw err_('沒有後台權限');
}

function isAdmin_() {
  var me = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!me) return false;
  var owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (me === owner) return true;
  return readAdminEmails_().indexOf(me) !== -1;
}


/** 「管理員」工作表 A 欄的 Email（小寫）。工作表不存在就只有部署帳號本人能看。 */
function readAdminEmails_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ADMINS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim().toLowerCase(); })
    .filter(function (e) { return e.indexOf('@') !== -1; });
}


/* ── 同步：表單回覆 → 繳費狀態 ───────────────────────────────── */

/**
 * 把「活動設定」裡每個未結束活動的表單回覆同步到「繳費狀態」。
 * 回傳 { added, updated, errors:[訊息] }。
 */
function syncRegistrations() {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) return { added: 0, updated: 0, errors: ['別人正在同步，請稍後再試'] };
  try {
    var events = readEvents_().filter(function (e) { return e.status !== EVENT_STATUS_CLOSED && e.sourceId; });
    var pay = readPayments_();
    var c = pay.cols;
    var byKey = {};
    pay.rows.forEach(function (p) { byKey[p.activityId + '\u0000' + p.key] = p; });

    var added = [], updated = 0, errors = [];
    var cache = {};
    var fresh = []; // [{ event, regs:[這次新增的報名] }]，給 coach.gs 通知教練

    events.forEach(function (ev) {
      var regs;
      try {
        regs = readResponses_(ev, cache);
      } catch (e) {
        errors.push(ev.id + '：' + (e && e.message || e));
        return;
      }
      var freshRegs = [];
      regs.forEach(function (r) {
        var hit = byKey[ev.id + '\u0000' + r.key];
        if (!hit) {
          var row = new Array(pay.width);
          for (var i = 0; i < row.length; i++) row[i] = '';
          row[c['活動ID']]   = ev.id;
          row[c['報名鍵']]   = r.key;
          row[c['姓名']]     = r.name;
          row[c['Email']]    = r.email;
          row[c['應繳金額']] = r.due === null ? '' : r.due;
          row[c['已入帳']]   = false;
          row[c['帳號後五碼']] = r.last5;
          row[c['報名狀態']] = REG_STATUS_OK;
          added.push(row);
          freshRegs.push(r);
          byKey[ev.id + '\u0000' + r.key] = { activityId: ev.id, key: r.key };
          return;
        }
        if (!hit.row) return; // 這次同步剛新增的
        var changed = false;
        if (r.name && r.name !== hit.name) { pay.sheet.getRange(hit.row, c['姓名'] + 1).setValue(r.name); changed = true; }
        if (r.last5 && r.last5 !== hit.last5) { pay.sheet.getRange(hit.row, c['帳號後五碼'] + 1).setValue(r.last5); changed = true; }
        if (changed) updated++;
      });
      if (freshRegs.length) fresh.push({ event: ev, regs: freshRegs });
    });

    if (added.length) {
      var start = Math.max(pay.sheet.getLastRow(), 1) + 1;
      pay.sheet.getRange(start, 1, added.length, pay.width).setValues(added);
      pay.sheet.getRange(start, c['已入帳'] + 1, added.length, 1).insertCheckboxes();
    }
    SpreadsheetApp.flush();

    var coachMails = 0;
    if (fresh.length && typeof notifyCoachesOfNewRegistrations_ === 'function') {
      var cr = notifyCoachesOfNewRegistrations_(fresh, pay.rows);
      coachMails = cr.sent;
      cr.errors.forEach(function (e) { errors.push(e); });
    }
    return { added: added.length, updated: updated, errors: errors, coachMails: coachMails };
  } finally {
    lock.releaseLock();
  }
}

/** 讀一個活動（梯次）的表單回覆，回傳 [{key, submittedAt, name, email, phone, plan, last5, due}]。 */
function readResponses_(ev, cache) {
  var ckey = ev.sourceId + '\u0000' + ev.sourceSheet;
  var table = cache[ckey];
  if (!table) {
    var ss = SpreadsheetApp.openById(ev.sourceId);
    var sh = ev.sourceSheet ? ss.getSheetByName(ev.sourceSheet) : ss.getSheets()[0];
    if (!sh) throw err_('回覆試算表裡找不到工作表「' + ev.sourceSheet + '」');
    table = sh.getDataRange().getValues();
    cache[ckey] = table;
  }
  if (table.length < 2) return [];

  var head = table[0].map(function (h) { return String(h).trim(); });
  var col = function (name, label, required) {
    if (!name) {
      if (required) throw err_('「活動設定」的「' + label + '」沒填');
      return -1;
    }
    var i = head.indexOf(String(name).trim());
    if (i === -1) throw err_('回覆表沒有「' + name + '」這一欄（' + label + '）');
    return i;
  };

  var nameCol  = col(ev.nameCol, '姓名欄', true);
  var emailCol = ev.emailCol ? col(ev.emailCol, 'Email欄') : findFirst_(head, EMAIL_FALLBACK_HEADERS);
  if (emailCol === -1) throw err_('找不到 Email 欄，請在「活動設定」填「Email欄」');
  var last5Col = col(ev.last5Col, '後五碼欄');
  var batchCol = col(ev.batchCol, '梯次欄');
  var planCol  = col(ev.planCol, '方案欄');
  // 電話只用在教練通知信，找不到不擋同步
  var phoneCol = ev.phoneCol ? head.indexOf(ev.phoneCol) : -1;
  var batchVal = String(ev.batchVal || '').trim();

  var out = [];
  for (var r = 1; r < table.length; r++) {
    var row = table[r];
    var ts = row[0];
    if (!(ts instanceof Date)) continue; // 空白列或不是表單產生的列
    if (batchCol !== -1 && batchVal && String(row[batchCol]).indexOf(batchVal) === -1) continue;

    var email = String(row[emailCol] || '').trim();
    var due = ev.fee;
    if (planCol !== -1 && ev.planPrices.length) {
      // 答案和方案名稱完全相同優先；否則取「方案價格」裡寫在最前面、且答案有包含的那個。
      // 例：「過夜=2350；單日課=1600」→「單日課＋過夜體驗」算 2350，「單日課」算 1600。
      var ans = String(row[planCol] || '').trim();
      var hit = null;
      for (var p = 0; p < ev.planPrices.length; p++) {
        var plan = ev.planPrices[p];
        if (ans === plan.label) { hit = plan; break; }
        if (!hit && ans.indexOf(plan.label) !== -1) hit = plan;
      }
      if (hit) due = hit.amount;
    }
    out.push({
      key: ts.toISOString() + '|' + email.toLowerCase(),
      submittedAt: ts,
      name: String(row[nameCol] || '').trim(),
      email: email,
      phone: phoneCol === -1 ? '' : String(row[phoneCol] || '').trim(),
      plan: planCol === -1 ? '' : String(row[planCol] || '').trim(),
      last5: last5Col === -1 ? '' : normalizeLast5_(row[last5Col]),
      due: due
    });
  }
  return out;
}


/* ── 總覽加總（不碰試算表，方便測試）───────────────────────── */

function buildOverview_(events, payments, now) {
  var today = startOfDay_(now);
  var byEvent = {};
  payments.forEach(function (p) { (byEvent[p.activityId] = byEvent[p.activityId] || []).push(p); });

  var list = events
    .filter(function (e) { return e.status !== EVENT_STATUS_CLOSED; })
    .map(function (e) {
      var rows = byEvent[e.id] || [];
      var active = rows.filter(function (p) { return p.status === REG_STATUS_OK; });
      var waitlist = rows.filter(function (p) { return p.status === REG_STATUS_WAITLIST; });
      var cancelled = rows.filter(function (p) { return p.status === REG_STATUS_CANCEL; });

      var due = 0, received = 0, paidCount = 0;
      active.forEach(function (p) {
        due += p.due || 0;
        if (p.paid) { paidCount++; received += p.received || 0; }
      });

      var start = parseEventDate_(e.date);
      var daysLeft = start ? Math.round((startOfDay_(start) - today) / 864e5) : null;
      var deadline = parseEventDate_(e.deadline);

      var flags = [];
      if (e.capacity && active.length >= e.capacity) flags.push('full');
      if (e.minimum && active.length < e.minimum) flags.push('below_minimum');
      if (daysLeft !== null && daysLeft >= 0 && daysLeft <= UNPAID_WARN_DAYS && paidCount < active.length) flags.push('unpaid_soon');

      return {
        id: e.id,
        name: e.name,
        date: displayDate_(e.date),
        sortTime: start ? start.getTime() : Number.MAX_SAFE_INTEGER,
        daysLeft: daysLeft,
        deadline: deadline ? displayDate_(deadline) : displayDate_(e.deadline),
        status: e.status || EVENT_STATUS_OPEN,
        fee: e.fee,
        capacity: e.capacity,
        minimum: e.minimum,
        count: active.length,
        waitlist: waitlist.length,
        cancelled: cancelled.length,
        paidCount: paidCount,
        due: due,
        received: received,
        outstanding: Math.max(0, due - received),
        flags: flags,
        roster: rows.map(function (p) {
          return {
            name: p.name, email: p.email, status: p.status,
            due: p.due, paid: p.paid, received: p.received,
            receivedDate: displayDate_(p.receivedDate), last5: p.last5,
            paymentNoticeSent: !!p.paymentNoticeSent, pretripSent: !!p.pretripSent,
            note: p.note
          };
        })
      };
    })
    .sort(function (a, b) { return (a.sortTime - b.sortTime) || String(a.id).localeCompare(String(b.id)); });

  var totals = { events: list.length, count: 0, due: 0, received: 0, outstanding: 0 };
  list.forEach(function (e) {
    totals.count += e.count; totals.due += e.due;
    totals.received += e.received; totals.outstanding += e.outstanding;
  });
  return { totals: totals, events: list };
}


/* ── 試算表存取 ──────────────────────────────────────────────── */

function readEvents_() {
  var sh = sheet_(SHEET_EVENTS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var c = headerIndex_(sh);
  require_(c, ['活動ID', '活動名稱', '活動日期', '費用', '回覆試算表ID', '姓名欄', '名額', '狀態'], SHEET_EVENTS);
  var v = function (r, name) { return c[name] === undefined ? '' : r[c[name]]; };

  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().map(function (r, i) {
    return {
      row: i + 2,
      id: String(v(r, '活動ID')).trim(),
      name: String(v(r, '活動名稱')).trim(),
      date: v(r, '活動日期'),
      fee: toNumber_(v(r, '費用')),
      sourceId: spreadsheetId_(v(r, '回覆試算表ID')),
      sourceSheet: String(v(r, '回覆工作表名稱')).trim(),
      batchCol: String(v(r, '梯次欄')).trim(),
      batchVal: String(v(r, '梯次值')).trim(),
      nameCol: String(v(r, '姓名欄')).trim(),
      emailCol: String(v(r, 'Email欄')).trim(),
      phoneCol: String(v(r, '電話欄')).trim(),
      last5Col: String(v(r, '後五碼欄')).trim(),
      capacity: toNumber_(v(r, '名額')),
      minimum: toNumber_(v(r, '成團人數')),
      deadline: v(r, '報名截止'),
      status: String(v(r, '狀態')).trim() || EVENT_STATUS_OPEN,
      planCol: String(v(r, '方案欄')).trim(),
      planPrices: parsePlanPrices_(v(r, '方案價格')),
      coachEmails: String(v(r, '負責教練Email')).split(/[\s,，;；、]+/)
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.indexOf('@') !== -1; })
    };
  }).filter(function (e) { return e.id; });
}

function readPayments_() {
  var sh = sheet_(SHEET_PAYMENTS);
  var c = headerIndex_(sh);
  require_(c, PAYMENT_HEADERS, SHEET_PAYMENTS);
  var width = sh.getLastColumn();
  var last = sh.getLastRow();
  var rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, width).getValues().map(function (r, i) {
    return {
      row: i + 2,
      activityId: String(r[c['活動ID']]).trim(),
      key: String(r[c['報名鍵']]).trim(),
      name: String(r[c['姓名']]).trim(),
      email: String(r[c['Email']]).trim(),
      due: toNumber_(r[c['應繳金額']]),
      paid: r[c['已入帳']] === true,
      last5: normalizeLast5_(r[c['帳號後五碼']]),
      received: toNumber_(r[c['入帳金額']]),
      receivedDate: r[c['入帳日期']],
      paymentNoticeSent: !isBlank_(r[c['入帳通知寄出時間']]),
      pretripSent: !isBlank_(r[c['行前通知寄出時間']]),
      note: String(r[c['備註']]),
      status: String(r[c['報名狀態']]).trim() || REG_STATUS_OK
    };
  }).filter(function (p) { return p.activityId && p.key; });
  return { sheet: sh, cols: c, width: width, rows: rows };
}

function sheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw err_('找不到工作表「' + name + '」，請先執行 setup()');
  return sh;
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  // 已有標題列：只補上缺少的欄位，加在最右邊，不動既有欄位
  var have = headerIndex_(sh);
  var missing = headers.filter(function (h) { return have[h] === undefined; });
  if (missing.length) {
    sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  }
  return sh;
}

function headerIndex_(sh) {
  var width = sh.getLastColumn();
  var map = {};
  if (!width) return map;
  sh.getRange(1, 1, 1, width).getValues()[0].forEach(function (h, i) {
    var k = String(h).trim();
    if (k && map[k] === undefined) map[k] = i;
  });
  return map;
}

function require_(cols, names, sheetName) {
  var missing = names.filter(function (n) { return cols[n] === undefined; });
  if (missing.length) throw err_('「' + sheetName + '」缺少欄位：' + missing.join('、') + '（執行 setup() 可自動補上）');
}


/* ── 小工具 ──────────────────────────────────────────────────── */

/** 接受試算表 ID 或整段網址。 */
function spreadsheetId_(v) {
  var s = String(v || '').trim();
  var m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : s;
}

/** 「單日=1600；含過夜=2350」→ [{label:'單日', amount:1600}, …]。分隔符號可用 ； ; 、 或換行。 */
function parsePlanPrices_(v) {
  return String(v || '').split(/[;；、\n]/).map(function (part) {
    var m = part.match(/^\s*(.+?)\s*[=＝:：]\s*([\d,，]+)\s*$/);
    return m ? { label: m[1], amount: Number(m[2].replace(/[,，]/g, '')) } : null;
  }).filter(function (x) { return x; });
}

function normalizeLast5_(v) {
  var digits = String(v === null || v === undefined ? '' : v)
    .replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xfee0); })
    .replace(/\D/g, '');
  if (!digits) return '';
  return digits.length >= 5 ? digits.slice(-5) : ('00000' + digits).slice(-5);
}

function findFirst_(head, names) {
  for (var i = 0; i < names.length; i++) {
    var idx = head.indexOf(names[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  var s = String(v === null || v === undefined ? '' : v).replace(/[^\d.\-]/g, '');
  return s ? Number(s) || 0 : 0;
}

function isBlank_(v) {
  return v === '' || v === null || v === undefined;
}

/** 活動日期可以是日期格，也可以是「2026/12/25–28」「12/25」這類文字；取第一個日期。 */
function parseEventDate_(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  var s = String(v || '');
  var m = s.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

function displayDate_(v) {
  if (v instanceof Date && !isNaN(v)) {
    return v.getFullYear() + '/' + (v.getMonth() + 1) + '/' + v.getDate();
  }
  return String(v || '');
}

function startOfDay_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function err_(msg) {
  var e = new Error(msg);
  e.isUserError = true;
  return e;
}

function safe_(fn) {
  try {
    return fn();
  } catch (e) {
    return { ok: false, error: e && e.isUserError ? e.message : '伺服器錯誤：' + (e && e.message || e) };
  }
}
