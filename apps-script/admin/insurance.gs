/**
 * 報名後台 — 寄保險名冊給負責教練（Google Apps Script）
 * ------------------------------------------------------------------
 * 跟 Code.gs、notify.gs、coach.gs 放在同一個 Apps Script 專案。
 *
 * 總覽網頁每張活動卡片的「寄保險名冊」按鈕會：
 *   1. previewInsuranceRoster({activityId})  → 整理「已入帳」且報名狀態「正常」的報名者，回傳表格給網頁預覽
 *   2. sendInsuranceRoster({activityId, keys}) → 管理員按確認後，把名冊寄給該活動「負責教練Email」
 *
 * 名冊欄位：姓名、性別、身分證號、出生日期（民國）、電話、地址、聯絡人、聯絡人電話、E-mail
 *   ・姓名、E-mail 用「繳費狀態」的資料；其他從該活動的表單回覆表讀（只讀不寫）。
 *   ・回覆表的欄位會自動依標題找（例如「身分證字號」「出生年月日」「緊急聯絡人電話」）。
 *     找錯或找不到時，在「活動設定」的「保險名冊欄位」填對應，例如：
 *       身分證號=身分證字號；出生日期=生日；聯絡人=緊急聯絡人姓名
 *   ・出生日期一律轉成民國「74/03/02」；表單填西元、民國、19850302、740302 都可以。
 *   ・性別沒填時，依身分證號第 2 碼（1 男、2 女）自動帶入，並在預覽標示。
 *
 * 名冊含身分證號等個資：
 *   ・只寄給「負責教練Email」，不副本協會信箱。
 *   ・信件內文是表格，另附一份 CSV（Excel 打開不會吃掉電話開頭的 0）。
 *   ・「寄信紀錄」只記報名鍵與收件人，不記身分證號。
 */

/* ══════════════════════════════════════════════════════════════════
   設定區
   ══════════════════════════════════════════════════════════════════ */

/** 信件主旨。可用 {活動名稱} {活動日期} {人數} */
var INSURANCE_SUBJECT = '【保險名冊】{活動名稱}（{活動日期}，共 {人數} 人）';

/* ══════════════════════════════════════════════════════════════════
   以下不需修改
   ══════════════════════════════════════════════════════════════════ */

var INSURANCE_LOG_TYPE = '保險名冊';

/** 名冊欄位（順序就是表格欄位順序）。 */
var INSURANCE_FIELDS = ['姓名', '性別', '身分證號', '出生日期', '電話', '地址', '聯絡人', '聯絡人電話', 'E-mail'];

/** 在回覆表找欄位用的規則：exact 先比完全相同，再用 any（含任一）且不含 none 的第一欄。 */
var INSURANCE_GUESS = {
  '性別':     { exact: ['性別', '生理性別'], any: ['性別'], none: [] },
  '身分證號': { exact: ['身分證字號', '身份證字號', '身分證號', '身份證號'], any: ['身分證', '身份證', '證號', '證件號碼', '護照'], none: ['聯絡人'] },
  '出生日期': { exact: ['出生日期', '出生年月日', '生日'], any: ['出生', '生日'], none: ['聯絡人'] },
  '電話':     { exact: ['手機號碼', '聯絡電話', '手機', '電話'], any: ['手機', '電話'], none: ['緊急', '聯絡人', '家長', '關係'] },
  '地址':     { exact: ['地址', '通訊地址', '戶籍地址', '聯絡地址', '住址'], any: ['地址', '住址'], none: ['郵件', 'mail', 'Mail', 'MAIL'] },
  '聯絡人':   { exact: ['緊急聯絡人', '緊急聯絡人姓名', '聯絡人', '聯絡人姓名'], any: ['緊急聯絡人', '聯絡人'], none: ['電話', '手機', '關係', '方式', 'Email', 'mail'] },
  '聯絡人電話': { exact: ['緊急聯絡人電話', '聯絡人電話', '緊急聯絡電話', '緊急聯絡人手機'], any: ['緊急', '聯絡人'], none: ['關係', 'mail', 'Email'], also: ['電話', '手機'] }
};

/** 網頁「寄保險名冊」→ 預覽。回傳 { ok, event, to:[], fields, rows:[…], mapping:[…], warnings, skipped, lastSent, quota } */
function previewInsuranceRoster(req) {
  return safe_(function () {
    assertAdmin_();
    var r = insuranceBuild_(req && req.activityId);
    return {
      ok: true,
      event: { id: r.event.id, name: r.event.name, date: displayDate_(r.event.date) },
      to: r.event.coachEmails,
      fields: INSURANCE_FIELDS,
      rows: r.rows.map(insurancePublicRow_),
      mapping: r.mapping,
      warnings: r.warnings,
      skipped: r.skipped,
      unpaid: r.unpaid,
      lastSent: insuranceLastSent_(r.event.id),
      quota: MailApp.getRemainingDailyQuota()
    };
  });
}

/** 網頁按「確定寄出」→ 只寄預覽時看到的那些人（keys），寄給負責教練。回傳 { ok, to, count }。 */
function sendInsuranceRoster(req) {
  return safe_(function () {
    assertAdmin_();
    var keys = (req && req.keys) || [];
    if (!keys.length) throw err_('名冊是空的，沒有寄出');
    var r = insuranceBuild_(req.activityId);
    if (!r.event.coachEmails.length) throw err_('這個活動的「負責教練Email」還沒填，沒有寄出');

    var byKey = {};
    r.rows.forEach(function (x) { byKey[x.key] = x; });
    var gone = keys.filter(function (k) { return !byKey[k]; });
    if (gone.length) throw err_('預覽後有 ' + gone.length + ' 位的入帳或報名狀態變了，請關閉後重新預覽再寄');
    var rows = keys.map(function (k) { return byKey[k]; });

    if (MailApp.getRemainingDailyQuota() < r.event.coachEmails.length) throw err_('今日寄信額度不足，請明天再寄');

    var mail = buildInsuranceMail_(r.event, rows);
    var to = r.event.coachEmails.join(',');
    var operator = coachOperator_();
    try {
      GmailApp.sendEmail(to, mail.subject, mail.text, {
        name: typeof NOTIFY_SENDER_NAME === 'string' ? NOTIFY_SENDER_NAME : '台灣自主登山能力推廣協會',
        htmlBody: mail.html,
        attachments: [mail.csv]
      });
    } catch (e) {
      var msg = String(e && e.message || e);
      insuranceLog_(r.event.id, rows, to, '失敗：' + msg, operator);
      throw err_('寄送失敗：' + msg);
    }
    insuranceLog_(r.event.id, rows, to, '成功', operator);
    return { ok: true, to: r.event.coachEmails, count: rows.length };
  });
}

/* ── 整理名冊 ────────────────────────────────────────────────── */

function insuranceBuild_(activityId) {
  var ev = readEvents_().filter(function (e) { return e.id === activityId; })[0];
  if (!ev) throw err_('找不到活動ID「' + activityId + '」');
  if (!ev.sourceId) throw err_('「活動設定」的「回覆試算表ID」沒填');

  var warnings = [];
  if (!ev.coachEmails.length) warnings.push('「活動設定」的「負責教練Email」還沒填，預覽可以看，但不能寄出。');

  // 已入帳 + 報名狀態正常 才進名冊
  var payments = readPayments_().rows.filter(function (p) { return p.activityId === ev.id; });
  var skipped = [], unpaid = 0;
  var wanted = payments.filter(function (p) {
    if (!p.paid) { if (p.status !== REG_STATUS_CANCEL) unpaid++; return false; }
    if (p.status !== REG_STATUS_OK) { skipped.push({ name: p.name, reason: '已入帳但報名狀態為「' + p.status + '」' }); return false; }
    return true;
  });

  // 讀回覆表（用同步同一套規則算報名鍵）
  var cache = {};
  var regs = readResponses_(ev, cache);
  var head = cache[ev.sourceId + '\u0000' + ev.sourceSheet][0].map(function (h) { return String(h).trim(); });
  var regByKey = {};
  regs.forEach(function (r) { regByKey[r.key] = r; });

  var cols = insuranceColumns_(ev, head);
  var mapping = INSURANCE_FIELDS.map(function (f) {
    if (f === '姓名' || f === 'E-mail') return { field: f, header: '繳費狀態「' + (f === '姓名' ? '姓名' : 'Email') + '」' };
    var i = cols[f];
    return { field: f, header: i === -1 ? '' : head[i] };
  });
  var missing = mapping.filter(function (m) { return !m.header; }).map(function (m) { return m.field; });
  if (missing.length) {
    warnings.push('回覆表找不到「' + missing.join('、') + '」欄' +
      (missing.length === 1 && missing[0] === '性別' ? '，已依身分證號第 2 碼判斷性別' : '') +
      '。若表單其實有這題，請在「活動設定」的「保險名冊欄位」填對應，例如「' + missing[0] + '=表單題目名稱」。');
  }

  var rows = [];
  wanted.forEach(function (p) {
    var reg = regByKey[p.key];
    if (!reg) { skipped.push({ name: p.name, reason: '回覆表找不到這筆報名（可能被刪除或改過 Email）' }); return; }
    var raw = reg.raw;
    var cell = function (f) { return cols[f] === -1 ? '' : insuranceText_(raw[cols[f]]); };

    var id = cell('身分證號').toUpperCase().replace(/\s/g, '');
    var gender = insuranceGender_(cell('性別'));
    var genderGuessed = false;
    if (!gender) { gender = insuranceGenderFromId_(id); genderGuessed = !!gender; }
    var birth = cols['出生日期'] === -1 ? { text: '', ok: false } : insuranceRocDate_(raw[cols['出生日期']]);

    var row = {
      key: p.key,
      submittedAt: reg.submittedAt,
      values: {
        '姓名': p.name || reg.name,
        '性別': gender,
        '身分證號': id,
        '出生日期': birth.text,
        '電話': cell('電話') || reg.phone,
        '地址': cell('地址'),
        '聯絡人': cell('聯絡人'),
        '聯絡人電話': cell('聯絡人電話'),
        'E-mail': p.email || reg.email
      },
      notes: []
    };
    if (genderGuessed) row.notes.push('性別依身分證號判斷');
    if (id && !insuranceIdValid_(id)) row.notes.push('身分證號格式或檢查碼不符');
    if (birth.text && !birth.ok) row.notes.push('出生日期無法轉成民國，保留原文');
    var empty = INSURANCE_FIELDS.filter(function (f) { return !row.values[f]; });
    if (empty.length) row.notes.push('缺：' + empty.join('、'));
    rows.push(row);
  });
  rows.sort(function (a, b) { return a.submittedAt - b.submittedAt; });

  var flagged = rows.filter(function (r) { return r.notes.length; }).length;
  if (flagged) warnings.push('有 ' + flagged + ' 位的資料需要確認，表格最後一欄有說明。');

  return { event: ev, rows: rows, mapping: mapping, warnings: warnings, skipped: skipped, unpaid: unpaid };
}

/** 回傳 { 欄位: 回覆表欄位位置 或 -1 }。順序：活動設定「保險名冊欄位」→ 姓名欄／電話欄設定 → 自動猜。 */
function insuranceColumns_(ev, head) {
  var override = insuranceOverrides_(ev.id);
  var out = {};
  var used = {};
  ['身分證號', '出生日期', '性別', '聯絡人電話', '聯絡人', '電話', '地址'].forEach(function (f) {
    var i = -1;
    if (override[f]) {
      i = head.indexOf(override[f]);
      if (i === -1) throw err_('「保險名冊欄位」寫的「' + override[f] + '」在回覆表找不到（' + f + '）');
    } else if (f === '電話' && ev.phoneCol && head.indexOf(ev.phoneCol) !== -1) {
      i = head.indexOf(ev.phoneCol);
    } else {
      i = insuranceGuess_(head, INSURANCE_GUESS[f], used);
    }
    out[f] = i;
    if (i !== -1) used[i] = true;
  });
  return out;
}

function insuranceGuess_(head, g, used) {
  var i;
  for (var e = 0; e < g.exact.length; e++) {
    i = head.indexOf(g.exact[e]);
    if (i !== -1 && !used[i]) return i;
  }
  var has = function (h, list) { return list.some(function (w) { return h.indexOf(w) !== -1; }); };
  for (i = 0; i < head.length; i++) {
    var h = head[i];
    if (used[i] || !h) continue;
    if (!has(h, g.any) || has(h, g.none)) continue;
    if (g.also && !has(h, g.also)) continue;
    return i;
  }
  return -1;
}

/** 讀「活動設定」的「保險名冊欄位」：「身分證號=身分證字號；出生日期=生日」→ {身分證號:'身分證字號', …} */
function insuranceOverrides_(activityId) {
  var sh = sheet_(SHEET_EVENTS);
  var c = headerIndex_(sh);
  if (c['保險名冊欄位'] === undefined || c['活動ID'] === undefined || sh.getLastRow() < 2) return {};
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var out = {};
  values.forEach(function (r) {
    if (String(r[c['活動ID']]).trim() !== activityId) return;
    String(r[c['保險名冊欄位']] || '').split(/[;；\n]/).forEach(function (part) {
      var m = part.match(/^\s*(.+?)\s*[=＝]\s*(.+?)\s*$/);
      if (!m) return;
      var f = m[1].replace(/^E-?mail$/i, 'E-mail');
      if (f === '身分證字號') f = '身分證號';
      if (f === '緊急聯絡人') f = '聯絡人';
      if (f === '緊急聯絡人電話') f = '聯絡人電話';
      if (f === '生日' || f === '出生年月日') f = '出生日期';
      out[f] = m[2];
    });
  });
  return out;
}

/* ── 欄位轉換（不碰試算表，方便測試）───────────────────────── */

function insuranceText_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Taipei', 'yyyy/MM/dd');
  return String(v === null || v === undefined ? '' : v).trim();
}

function insuranceGender_(v) {
  var s = String(v || '').trim();
  if (!s) return '';
  if (/^(男|男性|男生|m|male)$/i.test(s)) return '男';
  if (/^(女|女性|女生|f|female)$/i.test(s)) return '女';
  return s;
}

/** 身分證第 2 碼：1 男、2 女；新式居留證 8 男、9 女。 */
function insuranceGenderFromId_(id) {
  var m = String(id || '').match(/^[A-Z]([1289])\d{8}$/);
  if (!m) return '';
  return m[1] === '1' || m[1] === '8' ? '男' : '女';
}

/** 國民身分證／新式居留證檢查碼。舊式居留證（兩個英文字母）只檢查格式。 */
function insuranceIdValid_(id) {
  if (/^[A-Z][A-D]\d{8}$/.test(id)) return true;
  if (!/^[A-Z][1289]\d{8}$/.test(id)) return false;
  var codes = 'ABCDEFGHJKLMNPQRSTUVXYWZIO';
  var n = codes.indexOf(id.charAt(0)) + 10;
  var sum = Math.floor(n / 10) + (n % 10) * 9;
  for (var i = 1; i < 9; i++) sum += Number(id.charAt(i)) * (9 - i);
  sum += Number(id.charAt(9));
  return sum % 10 === 0;
}

/**
 * 出生日期 → 民國「74/03/02」。回傳 { text, ok }，轉不了就 ok:false 並保留原文。
 * 接受：日期格、1985/3/2、1985-03-02、1985年3月2日、19850302、民國74年3月2日、74/3/2、0740302、740302。
 */
function insuranceRocDate_(v) {
  var y, m, d;
  if (v instanceof Date && !isNaN(v)) {
    var parts = Utilities.formatDate(v, Session.getScriptTimeZone() || 'Asia/Taipei', 'yyyy-M-d').split('-');
    y = Number(parts[0]) - 1911; m = Number(parts[1]); d = Number(parts[2]);
  } else {
    var raw = String(v === null || v === undefined ? '' : v).trim();
    if (!raw) return { text: '', ok: false };
    var s = raw.replace(/[０-９／－．]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
      .replace(/^(民國|民|中華民國)\s*/, '').replace(/日\s*$/, '').trim();
    var hit = s.match(/^(\d{1,4})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})$/);
    if (hit) {
      y = Number(hit[1]); m = Number(hit[2]); d = Number(hit[3]);
    } else if (/^\d{8}$/.test(s)) {
      y = Number(s.slice(0, 4)); m = Number(s.slice(4, 6)); d = Number(s.slice(6));
    } else if (/^\d{6,7}$/.test(s)) {
      y = Number(s.slice(0, s.length - 4)); m = Number(s.slice(-4, -2)); d = Number(s.slice(-2));
    } else {
      return { text: raw, ok: false };
    }
    if (y > 1911) y -= 1911;
    else if (y >= 1000) return { text: raw, ok: false };
  }
  if (!(y >= 1 && y <= 200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return { text: String(v), ok: false };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return { text: y + '/' + pad(m) + '/' + pad(d), ok: true };
}

/* ── 信件 ────────────────────────────────────────────────────── */

/** 組信件（不碰試算表）。回傳 { subject, text, html, csv(Blob) }。 */
function buildInsuranceMail_(ev, rows) {
  var date = displayDate_(ev.date);
  var title = ev.name || ev.id;
  var subject = INSURANCE_SUBJECT
    .replace(/\{活動名稱\}/g, title)
    .replace(/\{活動日期\}/g, date)
    .replace(/\{人數\}/g, String(rows.length));
  var heads = ['#'].concat(INSURANCE_FIELDS.map(function (f) { return f === '出生日期' ? '出生日期(民國)' : f; }));
  var cells = rows.map(function (r, i) {
    return [String(i + 1)].concat(INSURANCE_FIELDS.map(function (f) { return r.values[f] || ''; }));
  });

  var intro = '教練您好，以下是「' + title + '」（' + date + '）已完成繳費的 ' + rows.length + ' 位學員保險名冊，同一份資料也附在 CSV 檔，可直接用 Excel 開啟。';
  var foot = '名冊含身分證號等個人資料，僅供辦理保險使用，請勿轉寄給無關人員。';

  var text = [intro, '']
    .concat(cells.map(function (c) {
      return c.slice(1).map(function (v, i) { return heads[i + 1] + '：' + (v || '—'); }).join('｜');
    }))
    .concat(['', foot]).join('\n');

  var th = 'style="background:#2f5d50;color:#fff;padding:6px 10px;text-align:left;white-space:nowrap;font-weight:600"';
  var td = 'style="border-bottom:1px solid #ddd;padding:6px 10px;vertical-align:top;white-space:nowrap"';
  var html = '<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#222">' +
    '<p>' + coachEsc_(intro) + '</p>' +
    '<table style="border-collapse:collapse;font-size:13px">' +
    '<tr>' + heads.map(function (h) { return '<th ' + th + '>' + coachEsc_(h) + '</th>'; }).join('') + '</tr>' +
    cells.map(function (c) {
      return '<tr>' + c.map(function (v) { return '<td ' + td + '>' + coachEsc_(v || '—') + '</td>'; }).join('') + '</tr>';
    }).join('') +
    '</table>' +
    '<p style="color:#777;font-size:12px">' + coachEsc_(foot) + '</p>' +
    '</div>';

  // CSV：UTF-8 BOM 讓 Excel 認得中文；電話、身分證、日期用 ="…" 包起來，避免開頭的 0 被吃掉或被轉成日期
  var asText = { '身分證號': 1, '出生日期': 1, '電話': 1, '聯絡人電話': 1 };
  var q = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
  var csvLines = [heads.map(q).join(',')].concat(rows.map(function (r, i) {
    return [q(i + 1)].concat(INSURANCE_FIELDS.map(function (f) {
      var v = r.values[f] || '';
      return asText[f] && v ? '="' + String(v).replace(/"/g, '""') + '"' : q(v);
    })).join(',');
  }));
  var fileName = '保險名冊_' + (ev.id || 'event') + '.csv';
  var csv = Utilities.newBlob('﻿' + csvLines.join('\r\n'), 'text/csv', fileName);

  return { subject: subject, text: text, html: html, csv: csv };
}

function insurancePublicRow_(r) {
  return { key: r.key, values: INSURANCE_FIELDS.map(function (f) { return r.values[f] || ''; }), notes: r.notes };
}

/* ── 寄信紀錄 ────────────────────────────────────────────────── */

function insuranceLog_(activityId, rows, to, result, operator) {
  var ss = SpreadsheetApp.getActive();
  var name = typeof NOTIFY_SHEET_LOG === 'string' ? NOTIFY_SHEET_LOG : '寄信紀錄';
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, 7).setValues([['時間', '活動ID', '報名鍵', '收件人', '類型', '結果', '操作者']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var keys = rows.map(function (r) { return r.key; }).join('\n');
  sh.appendRow([new Date(), activityId, keys, to, INSURANCE_LOG_TYPE + '（' + rows.length + ' 位）', result, operator]);
}

/** 每個活動最後一次成功寄出保險名冊的時間與人數：{ 活動ID: { at:'11/12 14:30', count:8 } } */
function insuranceLastSentAll_() {
  var name = typeof NOTIFY_SHEET_LOG === 'string' ? NOTIFY_SHEET_LOG : '寄信紀錄';
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  var c = headerIndex_(sh);
  if (c['時間'] === undefined || c['活動ID'] === undefined || c['類型'] === undefined || c['結果'] === undefined) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(function (r) {
    var type = String(r[c['類型']]);
    if (type.indexOf(INSURANCE_LOG_TYPE) !== 0 || String(r[c['結果']]) !== '成功') return;
    var t = r[c['時間']];
    if (!(t instanceof Date)) return;
    var id = String(r[c['活動ID']]).trim();
    var m = type.match(/（(\d+)\s*位）/);
    if (!out[id] || t > out[id].time) out[id] = { time: t, count: m ? Number(m[1]) : 0 };
  });
  Object.keys(out).forEach(function (id) {
    out[id] = { at: displayDateTime_(out[id].time), count: out[id].count };
  });
  return out;
}

function insuranceLastSent_(activityId) {
  return insuranceLastSentAll_()[activityId] || null;
}
