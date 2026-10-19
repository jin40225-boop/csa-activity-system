using Microsoft.Data.Sqlite;
using static ActivitySystem.Core.Db;

namespace ActivitySystem.Core;

public sealed partial class Store
{
    static readonly string[] RoleKeys = { "venue", "partner", "lecturer" };

    static string RocToIso(string v)
    {
        // 接受 115/12/09、115.12.9、2026-12-09 等寫法；轉成 ISO 存（R-03：格式自動轉）
        var m = System.Text.RegularExpressions.Regex.Match(v.Trim(), @"^(\d{2,4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})");
        if (!m.Success) throw new DeniedException($"看不懂這個日期：「{v}」。請寫成 115/12/09。");
        var y = int.Parse(m.Groups[1].Value);
        if (y < 1911) y += 1911;
        try { return new DateTime(y, int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value)).ToString("yyyy-MM-dd"); }
        catch { throw new DeniedException($"日期不存在：「{v}」。"); }
    }

    long? ContactRef(SqliteConnection c, SqliteTransaction tx, Fields f, string key)
    {
        if (!f.Has(key)) return null;
        var id = f.Long(key);
        if (id is null) return null;
        if (Scalar(c, tx, "SELECT 1 FROM contacts WHERE id=$id", ("$id", id)) is null) throw new DeniedException("選到的名冊資料已不存在，請重新選擇。");
        return id;
    }

    // ───────── 場次 ─────────

    public object SaveSession(long? id, long? ver, Fields f)
    {
        Require(id is null ? "session.create" : "session.edit");
        return Write((c, tx) =>
        {
            if (id is null)
            {
                var date = RocToIso(f.Str("date"));
                var year = DateTime.Parse(date).Year - 1911;
                var prog = f.Str("prog");
                if (prog.Length == 0) throw new DeniedException("請選擇方案（例如校園宣導）。");
                var code = NextCode(c, tx, year);
                var nid = Insert(c, tx, """
                    INSERT INTO sessions(code,year,prog,topic,audience,date,start_time,end_time,hours,venue_id,partner_id,lecturer_id,owner_user_id,target,fee_per_hour,notes,created_at,created_by,updated_at,updated_by)
                    VALUES($code,$y,$prog,$topic,$aud,$date,$st,$et,$h,$v,$p,$l,$o,$t,$fee,$n,$at,$by,$at,$by)
                    """,
                    ("$code", code), ("$y", year), ("$prog", prog), ("$topic", f.Str("topic")), ("$aud", f.Str("audience")), ("$date", date),
                    ("$st", f.Str("start_time")), ("$et", f.Str("end_time")), ("$h", f.Dbl("hours") ?? 0), ("$v", ContactRef(c, tx, f, "venue_id")),
                    ("$p", ContactRef(c, tx, f, "partner_id")), ("$l", ContactRef(c, tx, f, "lecturer_id")), ("$o", f.Long("owner_user_id") ?? Me.Id),
                    ("$t", f.Long("target") ?? 0), ("$fee", f.Long("fee_per_hour")), ("$n", f.Str("notes")), ("$at", Now()), ("$by", Me.Name));
                foreach (var r in RoleKeys)
                    Run(c, tx, "INSERT INTO confirmations(session_id,role,updated_at,updated_by) VALUES($s,$r,$t,$u)", ("$s", nid), ("$r", r), ("$t", Now()), ("$u", Me.Name));
                Learn(c, tx, "prog", prog, Me.Name); Learn(c, tx, "topic", f.Str("topic"), Me.Name); Learn(c, tx, "audience", f.Str("audience"), Me.Name);
                Log(c, tx, "sessions", nid, "create", $"新增場次 {code} {f.Str("topic")}");
                return (object)new { id = nid, code };
            }
            CheckVer(c, tx, "sessions", id.Value, ver);
            var before = One(c, tx, "SELECT * FROM sessions WHERE id=$id", ("$id", id)) ?? throw new DeniedException("找不到這個場次，請重新整理。");
            var sets = new List<string>();
            var args = new List<(string, object?)> { ("$id", id) };
            void Set(string col, object? val) { sets.Add($"{col}=${col}"); args.Add(("$" + col, val)); }
            if (f.Has("date")) Set("date", RocToIso(f.Str("date")));
            foreach (var col in new[] { "prog", "topic", "audience", "start_time", "end_time", "notes", "flags", "quotes" }) if (f.Has(col)) Set(col, f.Str(col));
            if (f.Has("hours")) Set("hours", f.Dbl("hours") ?? 0);
            foreach (var col in new[] { "target", "fee_per_hour", "owner_user_id" }) if (f.Has(col)) Set(col, f.Long(col));
            foreach (var col in new[] { "venue_id", "partner_id", "lecturer_id" }) if (f.Has(col)) Set(col, ContactRef(c, tx, f, col));
            if (sets.Count == 0) return new { id };
            Run(c, tx, $"UPDATE sessions SET {string.Join(",", sets)} WHERE id=$id", args.ToArray());
            Touch(c, tx, "sessions", id.Value);
            Learn(c, tx, "prog", f.Str("prog"), Me.Name); Learn(c, tx, "topic", f.Str("topic"), Me.Name); Learn(c, tx, "audience", f.Str("audience"), Me.Name);
            Log(c, tx, "sessions", id, "update", $"修改場次 {before["code"]}", before);
            return new { id };
        });
    }

    public object SetSessionStatus(long id, string status)
    {
        Require("session.cancel");
        if (status is not ("active" or "cancelled")) throw new DeniedException("不認得的狀態。");
        return Write((c, tx) =>
        {
            Run(c, tx, "UPDATE sessions SET status=$s WHERE id=$id", ("$s", status), ("$id", id));
            Touch(c, tx, "sessions", id);
            Log(c, tx, "sessions", id, status == "cancelled" ? "cancel" : "restore", status == "cancelled" ? "取消場次" : "恢復場次");
            return new { ok = true };
        });
    }

    /// <summary>出席與回饋：人數、回饋份數、滿意度分布、前後測。送什麼存什麼。</summary>
    public object SaveAttendance(long id, long? ver, Fields f)
    {
        Require("attend.edit");
        return Write((c, tx) =>
        {
            CheckVer(c, tx, "sessions", id, ver);
            var s = One(c, tx, "SELECT code,closed_at,attended_at FROM sessions WHERE id=$id", ("$id", id)) ?? throw new DeniedException("找不到這個場次。");
            if (s["closed_at"] is not null) throw new DeniedException("這一場已結案，要修改請先由督導重新開啟。");
            var sets = new List<string>();
            var args = new List<(string, object?)> { ("$id", id) };
            foreach (var col in new[] { "male", "female", "reach", "signups", "online_fb", "paper_fb", "sat1", "sat2", "sat3", "sat4", "sat5", "pre_rate", "post_rate" })
                if (f.Has(col)) { sets.Add($"{col}=${col}"); args.Add(("$" + col, f.Long(col) is long n && n < 0 ? throw new DeniedException("數字不能是負的。") : f.Long(col))); }
            if (f.Has("quotes")) { sets.Add("quotes=$quotes"); args.Add(("$quotes", f.Str("quotes"))); }
            if (sets.Count == 0) return (object)new { id };
            Run(c, tx, $"UPDATE sessions SET {string.Join(",", sets)} WHERE id=$id", args.ToArray());
            // 有出席人數就視為已辦理（時間軸第 3 格）
            Run(c, tx, "UPDATE sessions SET attended_at=COALESCE(attended_at,$t) WHERE id=$id AND (COALESCE(male,0)+COALESCE(female,0)+COALESCE(reach,0))>0", ("$t", Now()), ("$id", id));
            Touch(c, tx, "sessions", id);
            Log(c, tx, "sessions", id, "attendance", $"登錄出席與回饋 {s["code"]}");
            return new { id };
        });
    }

    public object CloseSession(long id, bool reopen)
    {
        Require(reopen ? "session.reopen" : "session.close");
        return Write((c, tx) =>
        {
            var s = One(c, tx, "SELECT code,male,female,reach,online_fb,paper_fb FROM sessions WHERE id=$id", ("$id", id)) ?? throw new DeniedException("找不到這個場次。");
            if (!reopen)
            {
                var missing = MissingEvidence(c, tx, id, s);
                if (missing.Count > 0) throw new DeniedException("還不能結案，缺：" + string.Join("、", missing) + "。");
                Run(c, tx, "UPDATE sessions SET closed_at=$t, closed_by=$u WHERE id=$id", ("$t", Now()), ("$u", Me.Name), ("$id", id));
            }
            else Run(c, tx, "UPDATE sessions SET closed_at=NULL, closed_by=NULL WHERE id=$id", ("$id", id));
            Touch(c, tx, "sessions", id);
            Log(c, tx, "sessions", id, reopen ? "reopen" : "close", reopen ? $"重新開啟 {s["code"]}" : $"場次結案 {s["code"]}");
            return new { ok = true };
        });
    }

    static List<string> MissingEvidence(SqliteConnection c, SqliteTransaction tx, long id, Dictionary<string, object?> s)
    {
        long N(string k) => s[k] is null ? 0 : Convert.ToInt64(s[k]);
        long Files(string kind) => Convert.ToInt64(Scalar(c, tx, "SELECT COUNT(*) FROM attachments WHERE session_id=$s AND kind=$k AND is_deleted=0", ("$s", id), ("$k", kind)) ?? 0L);
        var miss = new List<string>();
        if (N("male") + N("female") + N("reach") == 0) miss.Add("出席人次");
        if (N("online_fb") + N("paper_fb") == 0 && N("reach") == 0) miss.Add("回饋單");
        if (Files("photo") == 0) miss.Add("活動照片");
        if (Files("sign") == 0 && N("reach") == 0) miss.Add("簽到表");
        return miss;
    }

    // ───────── 名冊 ─────────

    public object SaveContact(long? id, long? ver, Fields f)
    {
        Require("contact.edit");
        var org = f.Str("org");
        if (id is null && org.Length == 0) throw new DeniedException("請填寫單位名稱或講師姓名。");
        var email = f.Str("email");
        if (email.Length > 0 && !System.Text.RegularExpressions.Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
            throw new DeniedException($"Email 格式看起來不對：「{email}」。");
        return Write((c, tx) =>
        {
            if (id is null)
            {
                var nid = Insert(c, tx, """
                    INSERT INTO contacts(type,org,person,title,phone,email,town,address,notes,created_at,created_by,updated_at,updated_by)
                    VALUES($ty,$o,$p,$ti,$ph,$e,$tw,$ad,$n,$at,$by,$at,$by)
                    """, ("$ty", f.Str("type") is { Length: > 0 } t ? t : "學校"), ("$o", org), ("$p", f.Str("person")), ("$ti", f.Str("title")),
                    ("$ph", f.Str("phone")), ("$e", email), ("$tw", f.Str("town")), ("$ad", f.Str("address")), ("$n", f.Str("notes")), ("$at", Now()), ("$by", Me.Name));
                Log(c, tx, "contacts", nid, "create", $"名冊新增：{org} {f.Str("person")}");
                return (object)new { id = nid };
            }
            CheckVer(c, tx, "contacts", id.Value, ver);
            var before = One(c, tx, "SELECT * FROM contacts WHERE id=$id", ("$id", id));
            var sets = new List<string>();
            var args = new List<(string, object?)> { ("$id", id) };
            foreach (var col in new[] { "type", "org", "person", "title", "phone", "email", "town", "address", "notes" })
                if (f.Has(col)) { sets.Add($"{col}=${col}"); args.Add(("$" + col, f.Str(col))); }
            if (f.Has("is_active")) { sets.Add("is_active=$is_active"); args.Add(("$is_active", f.Long("is_active") ?? 1)); }
            if (sets.Count > 0)
            {
                Run(c, tx, $"UPDATE contacts SET {string.Join(",", sets)} WHERE id=$id", args.ToArray());
                Touch(c, tx, "contacts", id.Value);
                Log(c, tx, "contacts", id, "update", $"名冊修改：{before?["org"]}", before);
            }
            return new { id };
        });
    }

    // ───────── 三方確認與信件 ─────────

    Dictionary<string, object?> Conf(SqliteConnection c, SqliteTransaction tx, long sessionId, string role)
    {
        if (!RoleKeys.Contains(role)) throw new DeniedException("不認得的對象。");
        var r = One(c, tx, "SELECT * FROM confirmations WHERE session_id=$s AND role=$r", ("$s", sessionId), ("$r", role));
        if (r is not null) return r;
        Run(c, tx, "INSERT INTO confirmations(session_id,role,updated_at,updated_by) VALUES($s,$r,$t,$u)", ("$s", sessionId), ("$r", role), ("$t", Now()), ("$u", Me.Name));
        return One(c, tx, "SELECT * FROM confirmations WHERE session_id=$s AND role=$r", ("$s", sessionId), ("$r", role))!;
    }

    void Msg(SqliteConnection c, SqliteTransaction tx, long sessionId, string role, string dir, string subject, string body, long? attachmentId = null, string? at = null)
        => Run(c, tx, "INSERT INTO messages(session_id,role,dir,at,by_user,subject,body,attachment_id,created_at) VALUES($s,$r,$d,$at,$u,$su,$b,$a,$c)",
            ("$s", sessionId), ("$r", role), ("$d", dir), ("$at", at ?? Now()), ("$u", Me.Name), ("$su", subject), ("$b", body), ("$a", attachmentId), ("$c", Now()));

    public object RecordCall(long sessionId, string role, string note)
    {
        Require("mail.send");
        return Write((c, tx) =>
        {
            var cf = Conf(c, tx, sessionId, role);
            Run(c, tx, "UPDATE confirmations SET called_at=$t, called_by=$u, ver=ver+1, updated_at=$t, updated_by=$u WHERE id=$id", ("$t", Now()), ("$u", Me.Name), ("$id", cf["id"]));
            Msg(c, tx, sessionId, role, "sys", "", $"📞 {Me.Name} 已電話聯繫{RoleLabel[role]}" + (note.Length > 0 ? $"：{note}" : ""));
            Log(c, tx, "confirmations", (long)cf["id"]!, "call", $"電話聯繫{RoleLabel[role]}");
            return new { ok = true };
        });
    }

    /// <summary>寄出確認信（或提醒信）：記錄信件內容、寄出時間與回覆期限；狀態變「已寄出」。實際寄送由畫面交給郵件程式。</summary>
    public object SendLetter(long sessionId, string role, string subject, string body, string due, bool remind)
    {
        Require("mail.send");
        if (subject.Trim().Length == 0 || body.Trim().Length == 0) throw new DeniedException("信件主旨或內容是空的。");
        var dueIso = due.Trim().Length > 0 ? RocToIso(due) : null;
        return Write((c, tx) =>
        {
            var cf = Conf(c, tx, sessionId, role);
            if (remind)
                Run(c, tx, "UPDATE confirmations SET reminded_at=$t, ver=ver+1, updated_at=$t, updated_by=$u WHERE id=$id", ("$t", Now()), ("$u", Me.Name), ("$id", cf["id"]));
            else
                Run(c, tx, """
                    UPDATE confirmations SET state=CASE WHEN state='confirmed' THEN state ELSE 'sent' END, sent_at=$t, sent_by=$u, due_date=COALESCE($d,due_date),
                    reminded_at=NULL, ver=ver+1, updated_at=$t, updated_by=$u WHERE id=$id
                    """, ("$t", Now()), ("$u", Me.Name), ("$d", dueIso), ("$id", cf["id"]));
            Msg(c, tx, sessionId, role, "out", subject, body);
            Log(c, tx, "confirmations", (long)cf["id"]!, remind ? "remind" : "send", (remind ? "寄提醒信給" : "寄確認信給") + RoleLabel[role]);
            return new { ok = true };
        });
    }

    /// <summary>記錄對方的回覆：已確認（via＝回信／電話／確認連結／當面）、婉拒、或一般回信內容。</summary>
    public object RecordReply(long sessionId, string role, string state, string via, string body)
    {
        Require("mail.send");
        if (state is not ("confirmed" or "declined" or "opened" or "")) throw new DeniedException("不認得的回覆狀態。");
        return Write((c, tx) =>
        {
            var cf = Conf(c, tx, sessionId, role);
            if (state.Length > 0)
                Run(c, tx, "UPDATE confirmations SET state=$s, confirmed_at=CASE WHEN $s='confirmed' THEN $t ELSE confirmed_at END, confirmed_via=$v, ver=ver+1, updated_at=$t, updated_by=$u WHERE id=$id",
                    ("$s", state), ("$t", Now()), ("$v", via), ("$u", Me.Name), ("$id", cf["id"]));
            if (body.Trim().Length > 0) Msg(c, tx, sessionId, role, "in", "", body.Trim());
            if (state is "confirmed" or "declined")
                Msg(c, tx, sessionId, role, "sys", "", (state == "confirmed" ? "✅ " : "⛔ ") + RoleLabel[role] + (state == "confirmed" ? "已確認" : "婉拒／需改期") + (via.Length > 0 ? $"（{via}）" : ""));
            Log(c, tx, "confirmations", (long)cf["id"]!, "reply", $"{RoleLabel[role]}{(state == "confirmed" ? "已確認" : state == "declined" ? "婉拒" : "回信")}");
            // 三方都確認且尚無確認時間 → 記錄（時間軸第 2 格由畫面依 confirmations 推算，不另存）
            return new { ok = true };
        });
    }

    public object ResetConfirmation(long sessionId, string role)
    {
        Require("mail.send");
        return Write((c, tx) =>
        {
            var cf = Conf(c, tx, sessionId, role);
            Run(c, tx, "UPDATE confirmations SET state='none', sent_at=NULL, due_date=NULL, confirmed_at=NULL, confirmed_via='', reminded_at=NULL, ver=ver+1, updated_at=$t, updated_by=$u WHERE id=$id",
                ("$t", Now()), ("$u", Me.Name), ("$id", cf["id"]));
            Msg(c, tx, sessionId, role, "sys", "", $"↺ {Me.Name} 把{RoleLabel[role]}的確認狀態重設（例如換了講師或場地）");
            Log(c, tx, "confirmations", (long)cf["id"]!, "reset", $"重設{RoleLabel[role]}確認狀態");
            return new { ok = true };
        });
    }

    // ───────── 附件（檔案本身由宿主複製到資料夾；這裡記錄） ─────────

    public object AddAttachment(long sessionId, string kind, string fileName, string relPath, long size)
    {
        Require("attend.edit");
        return Write((c, tx) =>
        {
            var sort = Convert.ToInt64(Scalar(c, tx, "SELECT COALESCE(MAX(sort),0)+1 FROM attachments WHERE session_id=$s AND kind=$k", ("$s", sessionId), ("$k", kind)) ?? 1L);
            var id = Insert(c, tx, "INSERT INTO attachments(session_id,kind,file_name,rel_path,size,sort,uploaded_at,uploaded_by) VALUES($s,$k,$f,$p,$z,$o,$t,$u)",
                ("$s", sessionId), ("$k", kind), ("$f", fileName), ("$p", relPath), ("$z", size), ("$o", sort), ("$t", Now()), ("$u", Me.Name));
            Log(c, tx, "attachments", id, "upload", $"上傳{KindLabel(kind)}：{fileName}");
            return new { id };
        });
    }

    public object UpdateAttachment(long id, Fields f)
    {
        var del = f.Long("is_deleted") == 1;
        Require(del ? "file.delete" : "attend.edit");
        return Write((c, tx) =>
        {
            var a = One(c, tx, "SELECT * FROM attachments WHERE id=$id", ("$id", id)) ?? throw new DeniedException("找不到這個檔案。");
            if (f.Has("caption")) Run(c, tx, "UPDATE attachments SET caption=$v WHERE id=$id", ("$v", f.Str("caption")), ("$id", id));
            if (f.Has("in_report")) Run(c, tx, "UPDATE attachments SET in_report=$v WHERE id=$id", ("$v", f.Long("in_report") ?? 1), ("$id", id));
            if (f.Has("sort")) Run(c, tx, "UPDATE attachments SET sort=$v WHERE id=$id", ("$v", f.Long("sort") ?? 0), ("$id", id));
            if (del) Run(c, tx, "UPDATE attachments SET is_deleted=1 WHERE id=$id", ("$id", id));
            Log(c, tx, "attachments", id, del ? "delete" : "update", (del ? "刪除" : "修改") + $"{KindLabel((string)a["kind"]!)}：{a["file_name"]}");
            return new { ok = true };
        });
    }

    public static string KindLabel(string kind) => kind switch
    {
        "photo" => "活動照片", "sign" => "簽到表", "paper" => "紙本回饋單", "slides" => "講師簡報", "receipt" => "講師領據", _ => "附件",
    };

    // ───────── 書信公版、使用者 ─────────

    public object SaveTemplate(string key, long? ver, Fields f)
    {
        Require("template.edit");
        return Write((c, tx) =>
        {
            var cur = One(c, tx, "SELECT ver,updated_by,updated_at FROM templates WHERE key=$k", ("$k", key)) ?? throw new DeniedException("找不到這個公版。");
            if (ver is not null && Convert.ToInt64(cur["ver"]) != ver)
                throw new ConflictException($"這份公版剛被 {cur["updated_by"]} 在 {cur["updated_at"]} 改過，你的修改沒有存入。");
            Run(c, tx, "UPDATE templates SET subject=$s, body=$b, ver=ver+1, updated_at=$t, updated_by=$u WHERE key=$k",
                ("$s", f.Str("subject")), ("$b", f.Str("body")), ("$t", Now()), ("$u", Me.Name), ("$k", key));
            Log(c, tx, "templates", null, "update", $"修改書信公版：{key}");
            return new { ok = true };
        });
    }

    public object SaveUser(long id, Fields f)
    {
        Require("settings.edit");
        return Write((c, tx) =>
        {
            var role = f.Str("role");
            if (role.Length > 0 && role is not ("supervisor" or "staff")) throw new DeniedException("不認得的身分。");
            if (role == "staff" && id == Me.Id) throw new DeniedException("不能把自己改成非督導（避免沒有人能改設定）。");
            foreach (var col in new[] { "display_name", "title", "email", "phone", "role" })
                if (f.Has(col) && (col != "role" || role.Length > 0)) Run(c, tx, $"UPDATE users SET {col}=$v, updated_at=$t WHERE id=$id", ("$v", f.Str(col)), ("$t", Now()), ("$id", id));
            Log(c, tx, "users", id, "update", "修改帳號資料");
            return new { ok = true };
        });
    }
}
