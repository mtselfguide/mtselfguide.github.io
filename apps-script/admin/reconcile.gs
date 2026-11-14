/**
 * 報名後台 — 在總覽網頁對帳（Google Apps Script）
 * ------------------------------------------------------------------
 * 跟 Code.gs、notify.gs、coach.gs、insurance.gs 放在同一個 Apps Script 專案。
 *
 * 總覽網頁每張活動卡片的「對帳」按鈕會：
 *   1. getReconcileList({activityId})  → 列出該活動的報名者（不含取消），附帳號後五碼、應繳、目前的入帳資料
 *   2. saveReconcile({activityId, items}) → 管理員填好入帳金額、入帳日期並勾「確認」後，
 *      寫回「繳費狀態」的「入帳金額」「入帳日期」「已入帳」三欄
 *
 * 寫回的就是原本管理員在試算表手動填的那三欄，所以：
 *   ・入帳通知（notify.gs）、保險名冊（insurance.gs）、總覽加總都照舊運作。
 *   ・在試算表直接改也還是可以，兩邊看到的是同一份資料。
 *
 * 防呆：
 *   ・勾「確認」時入帳金額、入帳日期都要填；日期不能晚於今天。
 *   ・網頁送出時會附上「打開表單當下」的值；如果這段時間有人在試算表或另一個視窗改過同一列，
 *     那一列不會被覆蓋，會回報「資料已被改過」，請重新打開再對。
 *   ・取消勾選已寄過入帳通知的人會提醒（仍可存）。
 */

/** 網頁「對帳」→ 讀名單。回傳 { ok, event, rows:[…], today } */
function getReconcileList(req) {
  return safe_(function () {
    assertAdmin_();
    var ev = reconcileEvent_(req && req.activityId);
    var rows = readPayments_().rows
      .filter(function (p) { return p.activityId === ev.id && p.status !== REG_STATUS_CANCEL; })
      .map(reconcilePublicRow_);
    // 未入帳的排前面，方便逐筆對；同一組內維持報名順序
    rows.forEach(function (r, i) { r.order = i; });
    rows.sort(function (a, b) { return (a.paid - b.paid) || (a.order - b.order); });
    return {
      ok: true,
      event: { id: ev.id, name: ev.name, date: displayDate_(ev.date) },
      rows: rows,
      today: reconcileIso_(new Date())
    };
  });
}

/**
 * 網頁按「儲存對帳」。
 * req = { activityId, items:[{ key, paid, amount, date, was:{ paid, amount, date } }] }
 *   amount：數字或空字串；date：'yyyy-MM-dd' 或空字串；was：打開表單當下的值（用來偵測別人改過）。
 * 回傳 { ok, saved, confirmed, unconfirmed, conflicts:[{name, reason}], errors:[{name, reason}], warnings:[…] }
 */
function saveReconcile(req) {
  return safe_(function () {
    assertAdmin_();
    var ev = reconcileEvent_(req && req.activityId);
    var items = (req && req.items) || [];
    if (!items.length) throw err_('沒有要儲存的變更');

    var lock = LockService.getDocumentLock();
    if (!lock.tryLock(30000)) throw err_('別人正在同步或對帳，請稍後再按一次儲存');
    try {
      var pay = readPayments_();
      var c = pay.cols;
      var byKey = {};
      pay.rows.forEach(function (p) { if (p.activityId === ev.id) byKey[p.key] = p; });
      var today = reconcileIso_(new Date());

      var out = { ok: true, saved: 0, confirmed: 0, unconfirmed: 0, conflicts: [], errors: [], warnings: [] };
      items.forEach(function (it) {
        var p = byKey[String(it && it.key || '')];
        if (!p) { out.errors.push({ name: '（找不到）', reason: '這筆報名已不在「繳費狀態」，請重新整理' }); return; }
        var who = p.name || p.email || ('第 ' + p.row + ' 列');
        var cur = reconcilePublicRow_(p);

        var was = it.was || {};
        if (!!was.paid !== cur.paid || reconcileAmountText_(was.amount) !== reconcileAmountText_(cur.amount) || String(was.date || '') !== cur.date) {
          out.conflicts.push({ name: who, reason: '打開表單之後，這一列已被改過（現在：' + reconcileDescribe_(cur) + '）' });
          return;
        }

        var check = reconcileValidate_(it, today);
        if (check.error) { out.errors.push({ name: who, reason: check.error }); return; }

        var row = p.row;
        pay.sheet.getRange(row, c['入帳金額'] + 1).setValue(check.amount === null ? '' : check.amount);
        var dateCell = pay.sheet.getRange(row, c['入帳日期'] + 1);
        if (check.date) dateCell.setValue(check.date).setNumberFormat('yyyy/mm/dd');
        else dateCell.setValue('');
        pay.sheet.getRange(row, c['已入帳'] + 1).setValue(check.paid);

        out.saved++;
        if (check.paid && !cur.paid) out.confirmed++;
        if (!check.paid && cur.paid) {
          out.unconfirmed++;
          if (p.paymentNoticeSent) out.warnings.push(who + '：已取消入帳，但入帳通知之前已經寄出');
        }
        if (check.paid && p.due && check.amount !== p.due) {
          out.warnings.push(who + '：入帳 ' + check.amount + ' 元，應繳 ' + p.due + ' 元');
        }
        if (check.paid && !p.last5) out.warnings.push(who + '：沒有帳號後五碼，入帳通知會略過這位');
      });
      SpreadsheetApp.flush();
      return out;
    } finally {
      lock.releaseLock();
    }
  });
}

/* ── 小工具（reconcileValidate_ 之後都不碰試算表，方便測試）────── */

function reconcileEvent_(activityId) {
  var ev = readEvents_().filter(function (e) { return e.id === activityId; })[0];
  if (!ev) throw err_('找不到活動ID「' + activityId + '」');
  return ev;
}

function reconcilePublicRow_(p) {
  return {
    key: p.key,
    name: p.name,
    email: p.email,
    status: p.status,
    due: p.due || 0,
    last5: p.last5,
    paid: !!p.paid,
    amount: p.received ? p.received : '',
    date: reconcileIso_(p.receivedDate),
    noticeSent: !!p.paymentNoticeSent,
    note: p.note || ''
  };
}

/**
 * 檢查一筆輸入。回傳 { paid, amount(數字或 null), date(Date 或 null) } 或 { error }。
 * today 為 'yyyy-MM-dd'。
 */
function reconcileValidate_(it, today) {
  var paid = it.paid === true;
  var amountText = String(it.amount === null || it.amount === undefined ? '' : it.amount)
    .replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xfee0); })
    .replace(/[,，\s]/g, '').replace(/^NT\$?/i, '');
  var amount = null;
  if (amountText) {
    if (!/^\d+(\.\d+)?$/.test(amountText)) return { error: '入帳金額「' + it.amount + '」不是數字' };
    amount = Number(amountText);
    if (amount <= 0) return { error: '入帳金額要大於 0' };
  }
  var dateText = String(it.date || '').trim();
  var date = null;
  if (dateText) {
    var m = dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return { error: '入帳日期「' + dateText + '」格式不對' };
    date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(date) || date.getMonth() !== Number(m[2]) - 1) return { error: '入帳日期「' + dateText + '」不是有效日期' };
    var iso = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    if (today && iso > today) return { error: '入帳日期不能晚於今天' };
  }
  if (paid && amount === null) return { error: '勾選確認前要填入帳金額' };
  if (paid && !date) return { error: '勾選確認前要填入帳日期' };
  return { paid: paid, amount: amount, date: date };
}

/** 日期格或文字 → 'yyyy-MM-dd'（給 <input type="date">）；轉不了回傳 ''。 */
function reconcileIso_(v) {
  var d = null;
  if (v instanceof Date && !isNaN(v)) d = v;
  else if (!isBlank_(v)) d = parseEventDate_(v);
  if (!d) return '';
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function reconcileAmountText_(v) {
  if (v === '' || v === null || v === undefined) return '';
  var n = Number(String(v).replace(/[,，\s]/g, ''));
  return isNaN(n) || n === 0 ? '' : String(n);
}

function reconcileDescribe_(r) {
  return (r.paid ? '已入帳' : '未入帳') +
    (r.amount !== '' ? '，' + r.amount + ' 元' : '') +
    (r.date ? '，' + r.date : '');
}
