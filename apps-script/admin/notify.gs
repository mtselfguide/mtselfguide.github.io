/**
 * 報名後台 — 入帳通知與行前通知寄送（Google Apps Script）
 * ------------------------------------------------------------------
 * 綁在「報名後台」試算表上。只讀寫這三張工作表：
 *   活動設定：一個梯次一列（活動ID、活動名稱、活動日期、費用、行前通知主旨／內文…）
 *   繳費狀態：一位報名者一列（已入帳核取方塊、入帳金額、入帳日期、兩種寄出時間…）
 *   寄信紀錄：每寄一封（或失敗一次）就記一列
 * 各課程的表單回覆試算表一律不碰。
 *
 * 防重複寄送：
 *   「繳費狀態」的「入帳通知寄出時間」「行前通知寄出時間」只要有值就不會再寄。
 *   整個寄送過程持有文件鎖，兩個人同時按也只會有一個在寄。
 *
 * 給主檔（onOpen 所在的檔案）呼叫：
 *   addNotifyMenuItems_(menu)  → 在「協會後台」選單加上寄信項目
 * 給後台網頁（google.script.run）呼叫：
 *   previewNotices({type, activityId})            → 預覽：會寄給誰、誰被略過與原因、範例信件
 *   sendNotices({type, activityId, keys?})        → 寄出；keys 可指定只寄給哪些報名鍵
 *   sendTestNotice({type, activityId})            → 用第一位收件人的資料寄一封範例給自己
 *   type 為 'payment'（入帳通知）或 'pretrip'（行前通知）
 * 完整說明見 docs/admin-notify.md。
 */

/* ══════════════════════════════════════════════════════════════════
   設定區：要調整的都在這裡
   ══════════════════════════════════════════════════════════════════ */

/** 收件人看到的寄件人名稱。 */
var NOTIFY_SENDER_NAME = '台灣自主登山能力推廣協會';

/** 收件人按「回覆」時寄到哪裡；留空 = 回覆給寄件帳號本身。 */
var NOTIFY_REPLY_TO = '';

/**
 * 入帳通知信件範本。可用的欄位：
 *   {姓名} {Email} {活動名稱} {活動日期} {費用} {應繳金額} {入帳金額} {入帳日期}
 */
var PAYMENT_SUBJECT = '【入帳確認】{活動名稱}（{活動日期}）';
var PAYMENT_BODY = [
  '{姓名} 您好：',
  '',
  '感謝您報名「{活動名稱}」，我們已確認收到您的款項：',
  '',
  '  入帳金額：NT${入帳金額}',
  '  入帳日期：{入帳日期}',
  '',
  '您的報名已完成。活動前我們會另外寄送行前通知（集合時間、地點與裝備清單），',
  '請留意信箱，也請將本信箱加入通訊錄，以免通知被歸到垃圾郵件。',
  '',
  '如有任何問題，直接回覆這封信即可。',
  '',
  '台灣自主登山能力推廣協會 敬上'
].join('\n');

/**
 * 行前通知：主旨與內文寫在「活動設定」的「行前通知主旨」「行前通知內文」欄，
 * 每個梯次各自一份。可用的欄位與入帳通知相同。
 * 主旨留空時用這個預設值。
 */
var PRETRIP_DEFAULT_SUBJECT = '【行前通知】{活動名稱}（{活動日期}）';

/** 單次執行最多寄幾封；Apps Script 單次執行上限 6 分鐘，剩下的再按一次即可。 */
var MAX_SEND_PER_RUN = 150;

/** 寄到快逾時就先停，剩下的下次再寄（毫秒）。 */
var SEND_TIME_BUDGET_MS = 4.5 * 60 * 1000;

/* ══════════════════════════════════════════════════════════════════
   以下不需修改
   ══════════════════════════════════════════════════════════════════ */

var NOTIFY_SHEET_EVENTS   = '活動設定';
var NOTIFY_SHEET_PAYMENTS = '繳費狀態';
var NOTIFY_SHEET_LOG      = '寄信紀錄';

var NOTIFY_LOG_HEADERS = ['時間', '活動ID', '報名鍵', '收件人', '類型', '結果', '操作者'];

var NOTIFY_TYPES = {
  payment: { label: '入帳通知', sentCol: '入帳通知寄出時間' },
  pretrip: { label: '行前通知', sentCol: '行前通知寄出時間' }
};

/** 「繳費狀態」上寄信會用到的欄位；少了任何一欄就不寄，以免寫錯格。 */
var NOTIFY_REQUIRED_PAYMENT_COLS = [
  '活動ID', '報名鍵', '姓名', 'Email', '應繳金額', '已入帳', '入帳金額', '入帳日期',
  '入帳通知寄出時間', '行前通知寄出時間'
];
var NOTIFY_REQUIRED_EVENT_COLS = ['活動ID', '活動名稱', '活動日期', '費用', '行前通知主旨', '行前通知內文'];


/* ── 選單 ────────────────────────────────────────────────────── */

/** 由主檔的 onOpen 呼叫：menu 是 SpreadsheetApp.getUi().createMenu('協會後台') 的結果。 */
function addNotifyMenuItems_(menu) {
  return menu
    .addItem('寄出入帳通知…', 'menuSendPaymentNotices')
    .addItem('寄出行前通知…', 'menuSendPretripNotices')
    .addItem('寄一封範例信給自己…', 'menuSendTestNotice');
}

function menuSendPaymentNotices() { notifyMenuSend_('payment'); }
function menuSendPretripNotices() { notifyMenuSend_('pretrip'); }

function menuSendTestNotice() {
  var ui = SpreadsheetApp.getUi();
  var type = notifyAskType_(ui);
  if (!type) return;
  var activityId = notifyAskActivity_(ui, NOTIFY_TYPES[type].label);
  if (!activityId) return;
  var r = sendTestNotice({ type: type, activityId: activityId });
  ui.alert(r.ok ? '範例信已寄到 ' + r.to : '沒有寄出：' + r.error);
}

function notifyMenuSend_(type) {
  var ui = SpreadsheetApp.getUi();
  var label = NOTIFY_TYPES[type].label;
  var activityId = notifyAskActivity_(ui, label);
  if (!activityId) return;

  var p = previewNotices({ type: type, activityId: activityId });
  if (!p.ok) { ui.alert('無法寄送：' + p.error); return; }

  var lines = [];
  lines.push('活動：' + p.activityName + '（' + activityId + '）');
  lines.push('將寄出 ' + p.recipients.length + ' 封' + label + '。');
  if (p.warnings.length) {
    lines.push('');
    lines.push('⚠ 請先確認：');
    p.warnings.slice(0, 10).forEach(function (w) { lines.push('・' + w); });
    if (p.warnings.length > 10) lines.push('…另有 ' + (p.warnings.length - 10) + ' 項');
  }
  if (p.skipped.length) {
    lines.push('');
    lines.push('略過 ' + p.skipped.length + ' 位：');
    p.skipped.slice(0, 10).forEach(function (s) { lines.push('・' + s.name + '：' + s.reason); });
    if (p.skipped.length > 10) lines.push('…另有 ' + (p.skipped.length - 10) + ' 位');
  }
  if (!p.recipients.length) {
    ui.alert(lines.join('\n') + '\n\n目前沒有需要寄出的對象。');
    return;
  }
  lines.push('');
  lines.push('── 範例（' + p.sample.to + '）──');
  lines.push('主旨：' + p.sample.subject);
  lines.push('');
  lines.push(notifyTruncate_(p.sample.body, 600));
  lines.push('');
  lines.push('確定要寄出嗎？');

  if (ui.alert(label, lines.join('\n'), ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  var r = sendNotices({ type: type, activityId: activityId });
  if (!r.ok) { ui.alert('寄送中斷：' + r.error); return; }
  var msg = '已寄出 ' + r.sent + ' 封。';
  if (r.failed.length) msg += '\n失敗 ' + r.failed.length + ' 封（詳見「寄信紀錄」）。';
  if (r.remaining) msg += '\n還有 ' + r.remaining + ' 封未寄（' + r.stopReason + '），請再執行一次。';
  ui.alert(msg);
}

function notifyAskType_(ui) {
  var res = ui.prompt('要寄哪一種範例？', '輸入 1 = 入帳通知，2 = 行前通知', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return null;
  var v = res.getResponseText().trim();
  if (v === '1') return 'payment';
  if (v === '2') return 'pretrip';
  ui.alert('請輸入 1 或 2。');
  return null;
}

function notifyAskActivity_(ui, label) {
  var events = notifyReadEvents_();
  var ids = Object.keys(events);
  if (!ids.length) { ui.alert('「活動設定」還沒有任何活動。'); return null; }

  var list = ids.map(function (id) {
    return id + '　' + events[id].name + (events[id].dateText ? '（' + events[id].dateText + '）' : '');
  }).join('\n');
  var res = ui.prompt(label + '：要寄哪個活動？', '請輸入活動ID：\n\n' + list, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return null;
  var id = res.getResponseText().trim();
  if (!events[id]) { ui.alert('找不到活動ID「' + id + '」。'); return null; }
  return id;
}


/* ── 對外 API（選單與後台網頁共用）───────────────────────────── */

/**
 * 預覽：列出會寄的人、略過的人與原因、需要注意的地方，以及第一封的內容。
 * 不寄信、不改任何資料。
 */
function previewNotices(req) {
  return notifySafe_(function () {
    var ctx = notifyBuildContext_(req);
    var plan = notifyPlanRecipients_(ctx, req && req.keys);
    var sample = plan.recipients.length ? notifyRenderMail_(ctx, plan.recipients[0]) : null;
    return {
      ok: true,
      type: ctx.type,
      activityId: ctx.event.id,
      activityName: ctx.event.name,
      recipients: plan.recipients.map(notifyPublicRow_),
      skipped: plan.skipped,
      warnings: plan.warnings,
      sample: sample,
      quota: MailApp.getRemainingDailyQuota()
    };
  });
}

/**
 * 寄出。每寄成功一封就立刻寫入寄出時間，所以中途失敗或逾時，重按也不會重複寄。
 * req.keys（選填）：只寄給這些報名鍵；不給就寄給全部符合條件的人。
 */
function sendNotices(req) {
  return notifySafe_(function () {
    var lock = LockService.getDocumentLock();
    if (!lock.tryLock(20000)) throw notifyErr_('別人正在寄信，請稍後再試');
    try {
      var started = Date.now();
      var ctx = notifyBuildContext_(req);
      var plan = notifyPlanRecipients_(ctx, req && req.keys);
      var sentCol = ctx.payCols[NOTIFY_TYPES[ctx.type].sentCol];
      var operator = notifyOperator_();
      var quota = MailApp.getRemainingDailyQuota();

      var sent = 0, failed = [], stopReason = '';
      for (var i = 0; i < plan.recipients.length; i++) {
        if (sent >= MAX_SEND_PER_RUN) { stopReason = '單次上限 ' + MAX_SEND_PER_RUN + ' 封'; break; }
        if (Date.now() - started > SEND_TIME_BUDGET_MS) { stopReason = '執行時間快到上限'; break; }
        if (quota <= 0) { stopReason = '今日寄信額度已用完'; break; }

        var rec = plan.recipients[i];
        // 取鎖之後再確認一次這格還是空的，防止與另一次執行重疊
        var cell = ctx.paySheet.getRange(rec.row, sentCol + 1);
        if (!notifyIsBlank_(cell.getValue())) continue;

        var mail = notifyRenderMail_(ctx, rec);
        try {
          GmailApp.sendEmail(mail.to, mail.subject, mail.body, {
            name: NOTIFY_SENDER_NAME,
            replyTo: NOTIFY_REPLY_TO || undefined,
            htmlBody: notifyToHtml_(mail.body)
          });
        } catch (e) {
          failed.push({ key: rec.key, name: rec.name, error: String(e && e.message || e) });
          notifyAppendLog_(ctx, rec, '失敗：' + String(e && e.message || e), operator);
          continue;
        }
        cell.setValue(new Date());
        notifyAppendLog_(ctx, rec, '成功', operator);
        SpreadsheetApp.flush();
        sent++;
        quota--;
      }

      if (ctx.type === 'pretrip' && sent > 0 && ctx.eventCols['行前通知寄出時間'] !== undefined) {
        ctx.eventSheet.getRange(ctx.event.row, ctx.eventCols['行前通知寄出時間'] + 1).setValue(new Date());
      }

      var done = sent + failed.length;
      return {
        ok: true,
        sent: sent,
        failed: failed,
        remaining: Math.max(0, plan.recipients.length - done),
        stopReason: stopReason,
        skipped: plan.skipped
      };
    } finally {
      lock.releaseLock();
    }
  });
}

/** 用第一位收件人的資料，寄一封範例信給目前操作的人（不寫入寄出時間）。 */
function sendTestNotice(req) {
  return notifySafe_(function () {
    var ctx = notifyBuildContext_(req);
    var plan = notifyPlanRecipients_(ctx, null);
    var me = notifyOperator_();
    if (!me) throw notifyErr_('抓不到你的 Email，無法寄範例');

    var rec = plan.recipients[0] || notifySampleRow_(ctx);
    var mail = notifyRenderMail_(ctx, rec);
    GmailApp.sendEmail(me, '［範例］' + mail.subject, mail.body, {
      name: NOTIFY_SENDER_NAME,
      replyTo: NOTIFY_REPLY_TO || undefined,
      htmlBody: notifyToHtml_(mail.body)
    });
    return { ok: true, to: me };
  });
}


/* ── 名單判斷 ────────────────────────────────────────────────── */

function notifyBuildContext_(req) {
  req = req || {};
  var type = String(req.type || '');
  if (!NOTIFY_TYPES[type]) throw notifyErr_('未知的通知類型');
  var activityId = String(req.activityId || '').trim();
  if (!activityId) throw notifyErr_('請指定活動ID');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var eventSheet = notifySheet_(ss, NOTIFY_SHEET_EVENTS);
  var paySheet = notifySheet_(ss, NOTIFY_SHEET_PAYMENTS);

  var eventCols = notifyHeaderIndex_(eventSheet, NOTIFY_REQUIRED_EVENT_COLS);
  var payCols = notifyHeaderIndex_(paySheet, NOTIFY_REQUIRED_PAYMENT_COLS);

  var events = notifyReadEvents_();
  var event = events[activityId];
  if (!event) throw notifyErr_('「活動設定」找不到活動ID「' + activityId + '」');

  if (type === 'pretrip' && !String(event.pretripBody).trim()) {
    throw notifyErr_('「' + event.name + '」的「行前通知內文」還沒填');
  }

  return {
    type: type, ss: ss,
    eventSheet: eventSheet, eventCols: eventCols, event: event,
    paySheet: paySheet, payCols: payCols
  };
}

function notifyPlanRecipients_(ctx, onlyKeys) {
  var c = ctx.payCols;
  var sentColName = NOTIFY_TYPES[ctx.type].sentCol;
  var want = null;
  if (onlyKeys && onlyKeys.length) {
    want = {};
    onlyKeys.forEach(function (k) { want[String(k)] = true; });
  }

  var last = ctx.paySheet.getLastRow();
  var values = last < 2 ? [] : ctx.paySheet.getRange(2, 1, last - 1, ctx.paySheet.getLastColumn()).getValues();

  var recipients = [], skipped = [], warnings = [], seenEmail = {};
  values.forEach(function (r, i) {
    if (String(r[c['活動ID']]).trim() !== ctx.event.id) return;
    var rec = {
      row: i + 2,
      key: String(r[c['報名鍵']]),
      name: String(r[c['姓名']]).trim(),
      email: String(r[c['Email']]).trim(),
      due: r[c['應繳金額']],
      paid: r[c['已入帳']] === true,
      paidAmount: r[c['入帳金額']],
      paidDate: r[c['入帳日期']],
      sentAt: r[c[sentColName]]
    };
    if (want && !want[rec.key]) return;
    var who = rec.name || rec.email || ('第 ' + rec.row + ' 列');

    if (!notifyIsBlank_(rec.sentAt)) return; // 已寄過：安靜略過，不列入
    if (!rec.paid) { skipped.push({ key: rec.key, name: who, reason: '尚未勾選已入帳' }); return; }
    if (!notifyIsEmail_(rec.email)) { skipped.push({ key: rec.key, name: who, reason: 'Email 格式不正確' }); return; }

    if (ctx.type === 'payment') {
      if (notifyIsBlank_(rec.paidAmount)) { skipped.push({ key: rec.key, name: who, reason: '入帳金額未填' }); return; }
      if (notifyIsBlank_(rec.paidDate)) { skipped.push({ key: rec.key, name: who, reason: '入帳日期未填' }); return; }
      var due = notifyToNumber_(rec.due), got = notifyToNumber_(rec.paidAmount);
      if (due !== null && got !== null && due !== got) {
        warnings.push(who + '：入帳 ' + got + ' 元，應繳 ' + due + ' 元');
      }
    }

    var lower = rec.email.toLowerCase();
    if (seenEmail[lower]) warnings.push(who + '：與 ' + seenEmail[lower] + ' 使用同一個 Email，會各收到一封');
    seenEmail[lower] = who;

    recipients.push(rec);
  });

  return { recipients: recipients, skipped: skipped, warnings: warnings };
}

function notifyReadEvents_() {
  var sh = notifySheet_(SpreadsheetApp.getActiveSpreadsheet(), NOTIFY_SHEET_EVENTS);
  var c = notifyHeaderIndex_(sh, NOTIFY_REQUIRED_EVENT_COLS);
  var last = sh.getLastRow();
  var out = {};
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().forEach(function (r, i) {
    var id = String(r[c['活動ID']]).trim();
    if (!id) return;
    out[id] = {
      row: i + 2,
      id: id,
      name: String(r[c['活動名稱']]).trim(),
      date: r[c['活動日期']],
      dateText: notifyFmtDate_(r[c['活動日期']]),
      fee: r[c['費用']],
      pretripSubject: String(r[c['行前通知主旨']] || ''),
      pretripBody: String(r[c['行前通知內文']] || '')
    };
  });
  return out;
}


/* ── 信件內容 ────────────────────────────────────────────────── */

function notifyRenderMail_(ctx, rec) {
  var vars = {
    '姓名': rec.name || '學員',
    'Email': rec.email,
    '活動名稱': ctx.event.name,
    '活動日期': ctx.event.dateText,
    '費用': notifyFmtMoney_(ctx.event.fee),
    '應繳金額': notifyFmtMoney_(rec.due),
    '入帳金額': notifyFmtMoney_(rec.paidAmount),
    '入帳日期': notifyFmtDate_(rec.paidDate)
  };
  var subject, body;
  if (ctx.type === 'payment') {
    subject = PAYMENT_SUBJECT;
    body = PAYMENT_BODY;
  } else {
    subject = ctx.event.pretripSubject.trim() || PRETRIP_DEFAULT_SUBJECT;
    body = ctx.event.pretripBody;
  }
  return { to: rec.email, subject: notifyFill_(subject, vars), body: notifyFill_(body, vars) };
}

function notifyFill_(tpl, vars) {
  return String(tpl).replace(/\{([^{}]+)\}/g, function (m, k) {
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
  });
}

/** 純文字轉 HTML：跳脫特殊字元、保留換行、網址變成連結。 */
function notifyToHtml_(text) {
  var esc = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  esc = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return '<div style="font-family:sans-serif;font-size:15px;line-height:1.7;white-space:pre-wrap">' +
    esc + '</div>';
}

function notifySampleRow_(ctx) {
  return {
    row: 0, key: 'sample', name: '王小明', email: notifyOperator_(),
    due: ctx.event.fee, paidAmount: ctx.event.fee, paidDate: new Date()
  };
}


/* ── 試算表與小工具 ──────────────────────────────────────────── */

function notifySheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw notifyErr_('找不到工作表「' + name + '」，請先執行初始設定');
  return sh;
}

/** 依標題列找欄位位置（0 起算）。required 裡缺任何一欄就停下來，不猜位置。 */
function notifyHeaderIndex_(sh, required) {
  var lastCol = sh.getLastColumn();
  var headers = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var idx = {};
  headers.forEach(function (h, i) {
    var k = String(h).trim();
    if (k && idx[k] === undefined) idx[k] = i;
  });
  var missing = required.filter(function (k) { return idx[k] === undefined; });
  if (missing.length) {
    throw notifyErr_('「' + sh.getName() + '」缺少欄位：' + missing.join('、'));
  }
  return idx;
}

function notifyAppendLog_(ctx, rec, result, operator) {
  var sh = ctx.ss.getSheetByName(NOTIFY_SHEET_LOG);
  if (!sh) {
    sh = ctx.ss.insertSheet(NOTIFY_SHEET_LOG);
    sh.getRange(1, 1, 1, NOTIFY_LOG_HEADERS.length).setValues([NOTIFY_LOG_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  sh.appendRow([new Date(), ctx.event.id, rec.key, rec.email, NOTIFY_TYPES[ctx.type].label, result, operator]);
}

function notifyPublicRow_(rec) {
  return {
    key: rec.key, name: rec.name, email: rec.email,
    due: notifyToNumber_(rec.due), paidAmount: notifyToNumber_(rec.paidAmount), paidDate: notifyFmtDate_(rec.paidDate)
  };
}

function notifyOperator_() {
  try {
    return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}

function notifyIsBlank_(v) {
  return v === '' || v === null || v === undefined;
}

function notifyIsEmail_(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s));
}

function notifyToNumber_(v) {
  if (typeof v === 'number') return v;
  var n = Number(String(v).replace(/[^\d.\-]/g, ''));
  return String(v).trim() === '' || isNaN(n) ? null : n;
}

function notifyFmtMoney_(v) {
  var n = notifyToNumber_(v);
  if (n === null) return String(v || '');
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function notifyFmtDate_(v) {
  if (v instanceof Date && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Taipei', 'yyyy/MM/dd');
  }
  return String(v || '');
}

function notifyTruncate_(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function notifyErr_(msg) {
  var e = new Error(msg);
  e.notify = true;
  return e;
}

function notifySafe_(fn) {
  try {
    return fn();
  } catch (e) {
    return { ok: false, error: e && e.notify ? e.message : '系統錯誤：' + String(e && e.message || e) };
  }
}
