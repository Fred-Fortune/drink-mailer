/************** 設定 **************/
const APP = {
  TZ: "Asia/Taipei",
  RECIPIENT_SHEET: "Recipients",
  LOG_SHEET: "Logs",
  WEEKLY_LIMIT_ENABLED: false,   // 不想限制改成 false
  WEEKLY_LIMIT_PER_USER: 3
};

// 建議固定寬度（像素）
var TABLE_W = 420;        // 整張表寬
var NAME_W  = 168;        // 姓名欄寬 (約 60%)
var AMT_W   = 252;        // 金額欄寬 (約 40%)

/************** 工具 **************/
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error("找不到工作表：" + name);
  return sh;
}

function fmt(ts) {
  return Utilities.formatDate(new Date(ts), APP.TZ, "yyyy/MM/dd HH:mm");
}

function startEndOfThisWeek() {
  const now = new Date();
  const dow = Number(Utilities.formatDate(now, APP.TZ, "u")); // 1=Mon ... 7=Sun
  const start = new Date(now);
  start.setDate(now.getDate() - (dow - 1));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function getActiveUserEmailSafe() {
  try {
    return Session.getActiveUser().getEmail() || "";
  } catch (e) {
    return "";
  }
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, function (m) {
    return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m];
  });
}

// 判斷像 "NT$485"、"-NT$215" 這種顯示字串是否為負數
function isNegativeDisplay(s) {
  const t = String(s || "")
    .replace(/−/g, "-")      // 將 Unicode 負號換成普通減號
    .replace(/[^\d\.\-]/g, "");   // 去掉貨幣符號、逗號、空白
  if (!t) return false;
  const n = Number(t);
  return isFinite(n) && n < 0;
}

/** 讀取 Summary 分頁（A:姓名, C:剩餘金額），回傳整張清單（保留 NT$ 顯示值） */
function getFullBalanceListFromSummary() {
  const sh = getSheet("Summary");
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  // 只抓到 C 欄（第 3 欄），用 getDisplayValues 保留 NT$ 等格式字樣
  const vals = sh.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
  // 保留表上順序；若要按姓名排序可在這裡 sort
  return vals
    .map(r => ({ name: String(r[0] || "").trim(), bal: String(r[2] || "").trim() }))
    .filter(o => o.name); // 去掉空白姓名列
}

/** 依 Email 取姓名（Recipients：欄名需含 Name、Email） */
function buildNameByEmailIndex() {
  const sh = getSheet(APP.RECIPIENT_SHEET);
  const vals = sh.getDataRange().getValues();
  if (vals.length === 0) return {};
  const header = vals[0];
  const m = {};
  header.forEach((h, i) => (m[String(h).trim()] = i));
  const nameCol = m["Name"];
  const emailCol = m["Email"];
  if (nameCol === undefined || emailCol === undefined) return {};
  const idx = {};
  for (let i = 1; i < vals.length; i++) {
    const em = String(vals[i][emailCol] || "").toLowerCase();
    const name = String(vals[i][nameCol] || "");
    if (em) idx[em] = name;
  }
  return idx;
}

/************** 處理所有 HTTP 請求 **************/
function doGet(e) {
  try {
    const fn = String(e.parameter.fn || "").toLowerCase();
    if (fn === "getrecipients") {
      const deptParam = e.parameter.dept || "";
      const keyword = (e.parameter.keyword || "").toLowerCase();

      const sh = getSheet(APP.RECIPIENT_SHEET);
      const values = sh.getDataRange().getValues();
      if (values.length === 0) return json({ list: [], allDepts: [] });

      const header = values[0];
      const m = {};
      header.forEach((h, i) => (m[String(h).trim()] = i));

      const rows = values.slice(1).filter(r => r[m["Email"]]);
      const allDepts = Array.from(
        new Set(rows.map(r => String(r[m["Dept"]] || "")).filter(Boolean))
      ).sort();

      let list = rows.map(r => ({
        name: String(r[m["Name"]] || ""),
        email: String(r[m["Email"]] || ""),
        active: String(r[m["Active"]] || "").toLowerCase() === "true",
        dept: String(r[m["Dept"]] || ""),
        phone: String(r[m["Phone"]] || ""),   // 今日飲料負責人用：電話
        note: String(r[m["Note"]] || "")
      }));

      if (deptParam && deptParam !== "ALL") {
        list = list.filter(o => o.dept === deptParam);
      }
      if (keyword) {
        const kw = keyword;
        list = list.filter(o =>
          (o.name + o.email + (o.dept || "")).toLowerCase().includes(kw)
        );
      }

      list.sort((a, b) => {
        const deptA = a.dept || "";
        const deptB = b.dept || "";
        const target = "資訊中心";

        // 1. 如果 A 是資訊中心，排在最前面 (return -1)
        if (deptA === target && deptB !== target) return -1;

        // 2. 如果 B 是資訊中心，排在最前面 (return 1)
        if (deptA !== target && deptB === target) return 1;

        // 3. 其他部門依照名稱排序 (如果您希望其他部門照筆畫排)
        return deptA.localeCompare(deptB);
      });

      return json({ list, allDepts });
    }

    return json({ ok: false, message: "Unknown fn" });
  } catch (error) {
    console.error('doGet error:', error);
    return json({ ok: false, message: error.toString() });
  }
}

function doPost(e) {
  try {
    let body = {};
    try {
      body = JSON.parse(e.postData.contents || "{}");
    } catch (err) {
      return json({ ok: false, message: "Bad JSON" });
    }

    const fn = String(body.fn || "").toLowerCase();
    if (fn !== "sendmail") return json({ ok: false, message: "Unknown fn" });

    const p = body.payload || {};
    const user = getActiveUserEmailSafe();

    // 今日飲料負責人（信件只顯示姓名；電話只寫進 Logs，不外洩）
    const managerName  = String(p.managerName  || "");
    const managerPhone = String(p.managerPhone || "");

    // 信任前端：不做欄位驗證
    const link = String(p.link || "");
    const emails = Array.isArray(p.emails)
      ? Array.from(new Set(p.emails.map(String))).filter(Boolean)
      : [];

    // 每週上限（如不需要改 APP.WEEKLY_LIMIT_ENABLED=false）
    if (APP.WEEKLY_LIMIT_ENABLED && user) {
      const sh = getSheet(APP.LOG_SHEET);
      const vals = sh.getDataRange().getValues();
      const { start, end } = startEndOfThisWeek();
      let cnt = 0;
      for (let i = 1; i < vals.length; i++) {
        const row = vals[i];
        const t = new Date(row[0]);
        const sender = row[1];
        const status = row[7];
        if (String(sender).toLowerCase() !== user.toLowerCase()) continue;
        if (String(status) !== "Success") continue;
        if (t >= start && t < end) cnt++;
      }
      if (cnt >= APP.WEEKLY_LIMIT_PER_USER) {
        return json({ ok: false, message: "你本週已達上限 " + APP.WEEKLY_LIMIT_PER_USER + " 次" });
      }
    }

    // ===== 組信：群發一封 + 附上「Summary 全部姓名/剩餘金額一覽表」 =====
    const subject =
      "【飲料開團】" + p.vendor +
      " - 截止 " + Utilities.formatDate(new Date(p.deadline), APP.TZ, "MM/dd HH:mm");

    // 取得 Summary 全表資料
    const allBalances = getFullBalanceListFromSummary();

    // （可選）若想以 Recipients 的勾選順序/姓名排序，可在此排序；目前沿用 Summary 出現順序
    //allBalances.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

    // 基本文案（今日飲料負責人只顯示姓名，不顯示電話）
    let htmlBody =
      '<div style="font-family:Segoe UI, Noto Sans TC; line-height:1.6;">' +
      "<h2>飲料開團通知：" + esc(p.vendor) + "</h2>" +
      '<p><b>訂購連結：</b> <a href="' + esc(link) + '">' + esc(link) + "</a></p>" +
      "<p><b>訂購截止：</b> " + fmt(p.deadline) + "</p>" +
      (managerName ? "<p><b>今日飲料負責人：</b> " + esc(managerName) + "</p>" : "") +
      (p.note ? "<p><b>備註：</b> " + esc(p.note) + "</p>" : "") +
      "</div>";

    // 一覽表（Summary A/C，全部）
      // ===== 讓表格更好讀：窄版、右對齊、等寬數字、斑馬紋、負數標紅 =====
          // 更貼近的版面：容器縮窄、右欄靠右、直立分隔線、斑馬紋、欠款整列淡紅底
            const tableHead =
        '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="'+TABLE_W+'" style="width:'+TABLE_W+'px;max-width:'+TABLE_W+'px;margin:8px 0;">' +
        '<tr><td>' +
          '<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="'+TABLE_W+'" style="width:'+TABLE_W+'px;border-collapse:collapse;table-layout:fixed;font-family:Segoe UI, Noto Sans TC, Arial, sans-serif;font-size:14px;line-height:1.4;">' +
            '<thead><tr>' +
              '<th align="left"  width="'+NAME_W+'" style="width:'+NAME_W+'px;border-bottom:1px solid #ddd;padding:4px 8px;">姓名</th>' +
              '<th align="right" width="'+AMT_W +'" style="width:'+AMT_W +'px;border-bottom:1px solid #ddd;padding:4px 8px;border-left:1px solid #eee;">剩餘金額</th>' +
            '</tr></thead><tbody>';

      const tableRows = allBalances.map((r, i) => {
        const neg   = isNegativeDisplay(r.bal);
        const zebra = (i % 2 === 1) ? '#f5f7fa' : '#ffffff';
        const rowBg = neg ? '#fff5f5' : zebra;
        const amtHtml =
          '<span style="' + (neg ? 'color:#d32f2f;font-weight:600;' : '') + '">' + esc(r.bal) + '</span>';

        return '<tr>' +
          '<td width="'+NAME_W+'" style="width:'+NAME_W+'px;padding:4px 8px;border-bottom:1px solid #f0f0f0;background:'+rowBg+';">' +
            esc(r.name) +
          '</td>' +
          '<td width="'+AMT_W +'" style="width:'+AMT_W +'px;padding:4px 8px;border-bottom:1px solid #f0f0f0;background:'+rowBg+';text-align:right;border-left:1px solid #eee;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;">' +
            amtHtml +
          '</td>' +
        '</tr>';
      }).join('');

      const tableTail = '</tbody></table></td></tr></table>';


    htmlBody +=
  '<div style="margin-top:12px;">' +
    '<p><b>全體剩餘金額一覽：</b></p>' +
    tableHead + tableRows + tableTail +
  '</div>' +
  // 清除對齊/浮動：用 100% 寬度的表格最相容
  '<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="height:1px;line-height:1px;font-size:1px;"></td></tr></table>' +
  '<div style="margin-top:12px;">' +
    '<hr style="border:none;border-top:1px solid #ccc;margin:12px 0;" />' +
    '<p style="font-size:12px;color:#888;font-family:Segoe UI, Noto Sans TC;">此信由系統自動寄出，請勿回覆。</p>' +
  '</div>';




    // 群發（建議 BCC）
    const toField = user || emails[0]; // 取不到 user 就用第一位當 To
    const options = { htmlBody: htmlBody };
    if (p.bccMode) options.bcc = emails.join(","); else options.to = emails.join(",");

    GmailApp.sendEmail(toField, subject, "", options);

    // 紀錄（第 10、11 欄＝今日飲料負責人 / 電話，取代原本的 IP）
    const shLog = getSheet(APP.LOG_SHEET);
    shLog.appendRow([
      new Date(),
      user,
      subject,
      p.vendor,
      link,
      emails.length,
      emails.join(";"),
      "Success",
      "bulk-all-summary",
      managerName,   // 今日飲料負責人
      managerPhone   // 負責人電話
    ]);

    return json({ ok: true, message: "寄送成功！信內含 Summary 全體一覽表，共 " + emails.length + " 位" });
  } catch (error) {
    console.error('doPost error:', error);
    return json({ ok: false, message: error.toString() });
  }
}

/*
前端搭配提醒：
1) 避免 CORS：fetch 不要設 "Content-Type: application/json"
   await fetch(APPS_SCRIPT_BASE, { method: "POST", body: JSON.stringify({ fn:"sendmail", payload }) });

2) 「今日飲料負責人」需求：Recipients 表要有一欄標題叫 Phone；
   前端只會把有填電話的人放進下拉，選好後送出 managerName / managerPhone。
   信件內文只顯示姓名，電話只寫進 Logs。

3) 改完記得「重新部署」：部署 → 管理部署作業 → 編輯 → 版本選「新版本」→ 部署，
   否則前端打到的還是舊版。
*/
