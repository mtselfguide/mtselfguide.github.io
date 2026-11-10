/**
 * 報名後台 — 新報名通知負責教練（Google Apps Script）
 * ------------------------------------------------------------------
 * 跟 Code.gs、notify.gs 放在同一個 Apps Script 專案。
 *
 * Code.gs 的 syncRegistrations()（每小時自動同步、打開總覽頁、按「同步報名資料」都會跑）
 * 每次新增報名者到「繳費狀態」之後，會呼叫這裡的 notifyCoachesOfNewRegistrations_()：
 *   ・同一個活動（梯次）這次新增的報名者合成「一封」信，內容是報名資料摘要表格
 *   ・收件人是「活動設定」的「負責教練Email」欄（可填多個，用逗號、頓號或空白分隔）
 *   ・該欄留空的活動不寄
 *   ・每封都記在「寄信紀錄」，類型為「新報名通知」
 *
 * 「是不是新報名」是用「繳費狀態」有沒有這一列判斷的，所以同一位報名者只會通知一次。
 * 寄信失敗不會重寄（報名者已寫進「繳費狀態」），請看「寄信紀錄」或同步結果的錯誤訊息。
 */

/* ══════════════════════════════════════════════════════════════════
   設定區
   ══════════════════════════════════════════════════════════════════ */

/** 信件主旨。可用 {活動名稱} {活動日期} {新增人數} {目前人數} {名額} */
var COACH_SUBJECT = '【新報名通知】{活動名稱} 新增 {新增人數} 位（目前 {目前人數}／{名額}）';

/** 想要每封都副本給協會信箱就填在這裡，例如 'info@mtselfguide.com'；留空 = 不副本。 */
var COACH_CC = '';

/* ══════════════════════════════════════════════════════════════════
   以下不需修改
   ══════════════════════════════════════════════════════════════════ */

var COACH_LOG_TYPE = '新報名通知';

/**
 * fresh：[{ event, regs:[{key, submittedAt, name, email, phone, plan, last5, due}] }]
 * existingRows：同步前「繳費狀態」的列（readPayments_().rows），用來算目前人數
 * 回傳 { sent, errors:[訊息] }
 */
function notifyCoachesOfNewRegistrations_(fresh, existingRows) {
  var result = { sent: 0, errors: [] };
  var operator = coachOperator_();
  var quota = MailApp.getRemainingDailyQuota();
  var overviewUrl = '';
  try { overviewUrl = ScriptApp.getService().getUrl() || ''; } catch (e) { /* 還沒部署成網頁 */ }

  fresh.forEach(function (item) {
    var ev = item.event;
    if (!ev.coachEmails || !ev.coachEmails.length) return;

    var before = existingRows.filter(function (p) { return p.activityId === ev.id; });
    var activeBefore = before.filter(function (p) { return p.status === REG_STATUS_OK; }).length;
    var mail = buildCoachMail_(ev, item.regs, {
      count: activeBefore + item.regs.length,
      firstSync: before.length === 0,
      overviewUrl: overviewUrl
    });
    var to = ev.coachEmails.join(',');

    if (quota <= 0) {
      result.errors.push(ev.id + '：今日寄信額度已用完，沒有寄出新報名通知');
      coachLog_(ev.id, item.regs, to, '失敗：今日寄信額度已用完', operator);
      return;
    }
    try {
      GmailApp.sendEmail(to, mail.subject, mail.text, {
        name: typeof NOTIFY_SENDER_NAME === 'string' ? NOTIFY_SENDER_NAME : '台灣自主登山能力推廣協會',
        cc: COACH_CC || undefined,
        htmlBody: mail.html
      });
      quota--;
      result.sent++;
      coachLog_(ev.id, item.regs, to, '成功', operator);
    } catch (e) {
      var msg = String(e && e.message || e);
      result.errors.push(ev.id + '：新報名通知寄送失敗（' + msg + '）');
      coachLog_(ev.id, item.regs, to, '失敗：' + msg, operator);
    }
  });
  return result;
}

/** 組信件內容（不碰試算表，方便測試）。回傳 { subject, text, html }。 */
function buildCoachMail_(ev, regs, info) {
  var date = displayDate_(ev.date);
  var capacity = ev.capacity ? String(ev.capacity) : '不限';
  var subject = COACH_SUBJECT
    .replace(/\{活動名稱\}/g, ev.name || ev.id)
    .replace(/\{活動日期\}/g, date)
    .replace(/\{新增人數\}/g, String(regs.length))
    .replace(/\{目前人數\}/g, String(info.count))
    .replace(/\{名額\}/g, capacity);

  var showPlan = regs.some(function (r) { return r.plan; });
  var heads = ['#', '報名時間', '姓名', '電話', 'Email'];
  if (showPlan) heads.push('方案／梯次');
  heads.push('帳號後五碼', '應繳金額');

  var rows = regs.map(function (r, i) {
    var cells = [String(i + 1), coachFmtTime_(r.submittedAt), r.name, r.phone, r.email];
    if (showPlan) cells.push(r.plan);
    cells.push(r.last5 || '未填', r.due === null || r.due === undefined || r.due === '' ? '' : 'NT$ ' + coachMoney_(r.due));
    return cells;
  });

  var summary = [
    '活動：' + (ev.name || ev.id),
    '日期：' + date,
    '目前報名：' + info.count + ' 人（名額 ' + capacity + (ev.minimum ? '，成團 ' + ev.minimum + ' 人' : '') + '）'
  ];
  if (ev.capacity && info.count > ev.capacity) summary.push('⚠ 已超過名額，請確認是否改為備取');
  if (ev.minimum && info.count >= ev.minimum && info.count - regs.length < ev.minimum) summary.push('🎉 已達成團人數');
  var intro = info.firstSync && regs.length > 1
    ? '這是此活動第一次同步，下表是目前所有報名者：'
    : '有 ' + regs.length + ' 位新報名：';

  // 純文字版（收信軟體不顯示 HTML 時）
  var text = ['教練您好，「' + (ev.name || ev.id) + '」' + intro, '']
    .concat(summary).concat([''])
    .concat(rows.map(function (c) {
      return heads.map(function (h, i) { return h + '：' + (c[i] || '—'); }).slice(1).join('｜');
    }))
    .concat(info.overviewUrl ? ['', '完整名單與繳費狀況：' + info.overviewUrl] : [])
    .concat(['', '（這封信由報名後台自動寄出，報名者若尚未繳費，入帳後會另外收到付款完成通知。）'])
    .join('\n');

  var th = 'style="background:#2f5d50;color:#fff;padding:6px 10px;text-align:left;white-space:nowrap;font-weight:600"';
  var td = 'style="border-bottom:1px solid #ddd;padding:6px 10px;vertical-align:top"';
  var html = '<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#222">' +
    '<p>教練您好，「' + coachEsc_(ev.name || ev.id) + '」' + coachEsc_(intro) + '</p>' +
    '<p style="margin:0 0 12px">' + summary.map(coachEsc_).join('<br>') + '</p>' +
    '<table style="border-collapse:collapse;font-size:14px">' +
    '<tr>' + heads.map(function (h) { return '<th ' + th + '>' + coachEsc_(h) + '</th>'; }).join('') + '</tr>' +
    rows.map(function (c) {
      return '<tr>' + c.map(function (v) { return '<td ' + td + '>' + coachEsc_(v || '—') + '</td>'; }).join('') + '</tr>';
    }).join('') +
    '</table>' +
    (info.overviewUrl ? '<p>完整名單與繳費狀況：<a href="' + coachEsc_(info.overviewUrl) + '">報名與收費總覽</a></p>' : '') +
    '<p style="color:#777;font-size:12px">這封信由報名後台自動寄出，報名者若尚未繳費，入帳後會另外收到付款完成通知。</p>' +
    '</div>';

  return { subject: subject, text: text, html: html };
}

/** 選單用：寄一封範例新報名通知給自己（用假資料，不寫任何工作表）。 */
function menuSendTestCoachMail() {
  var ui = SpreadsheetApp.getUi();
  var events = readEvents_().filter(function (e) { return e.status !== EVENT_STATUS_CLOSED; });
  if (!events.length) { ui.alert('「活動設定」沒有進行中的活動'); return; }
  var me = coachOperator_();
  var ev = events[0];
  var mail = buildCoachMail_(ev, [{
    submittedAt: new Date(), name: '王小明', phone: '0912-345-678', email: 'sample@example.com',
    plan: ev.planCol ? '範例方案' : '', last5: '12345', due: ev.fee
  }], { count: 1, firstSync: false, overviewUrl: ScriptApp.getService().getUrl() || '' });
  GmailApp.sendEmail(me, '［範例］' + mail.subject, mail.text, { htmlBody: mail.html });
  ui.alert('範例信已寄到 ' + me + '（用「' + ev.id + '」的設定）');
}

function coachLog_(activityId, regs, to, result, operator) {
  var ss = SpreadsheetApp.getActive();
  var name = typeof NOTIFY_SHEET_LOG === 'string' ? NOTIFY_SHEET_LOG : '寄信紀錄';
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, 7).setValues([['時間', '活動ID', '報名鍵', '收件人', '類型', '結果', '操作者']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var keys = regs.map(function (r) { return r.key; }).join('\n');
  sh.appendRow([new Date(), activityId, keys, to, COACH_LOG_TYPE + '（' + regs.length + ' 位）', result, operator]);
}

function coachOperator_() {
  try {
    return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '自動同步';
  } catch (e) {
    return '自動同步';
  }
}

function coachFmtTime_(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Taipei', 'MM/dd HH:mm');
}

function coachMoney_(v) {
  return String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function coachEsc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
