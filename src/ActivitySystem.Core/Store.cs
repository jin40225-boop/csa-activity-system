using Microsoft.Data.Sqlite;
using static ActivitySystem.Core.Db;

namespace ActivitySystem.Core;

public sealed record UserInfo(long Id, string Username, string Name, string Role, string Title)
{
    public bool IsSupervisor => Role == "supervisor";
    public string Label => string.IsNullOrWhiteSpace(Title) ? (IsSupervisor ? "督導" : "社工") : Title;
}

/// <summary>別人剛改過同一筆：不覆蓋，訊息帶回是誰、何時改的。</summary>
public sealed class ConflictException(string message) : Exception(message);

/// <summary>權限不足或資料不允許的動作：訊息直接給使用者看。</summary>
public sealed class DeniedException(string message) : Exception(message);

/// <summary>
/// 所有讀寫的唯一入口。畫面不直接碰 SQL；每個寫入都在一個 IMMEDIATE 交易裡完成並留下 change_log。
/// 權限尚未定案：所有規則集中在 <see cref="Can"/>，規則值存在 settings（perm:動作＝all／supervisor），
/// 督導可在「設定」頁改，日後定案只改設定不改程式。
/// </summary>
public sealed partial class Store(Db db, UserInfo me)
{
    public Db Db { get; } = db;
    public UserInfo Me { get; } = me;

    public static UserInfo? FindUser(Db db, string username)
    {
        using var conn = db.Open();
        var r = One(conn, null, "SELECT id,username,display_name,role,title,is_active FROM users WHERE username=$u", ("$u", username));
        if (r is null || Convert.ToInt64(r["is_active"]) == 0) return null;
        return new UserInfo((long)r["id"]!, (string)r["username"]!, (string)r["display_name"]!, (string)r["role"]!, (string?)r["title"] ?? "");
    }

    T Write<T>(Func<SqliteConnection, SqliteTransaction, T> body)
    {
        using var conn = Db.Open();
        using var tx = conn.BeginTransaction(System.Data.IsolationLevel.Serializable);
        var result = body(conn, tx);
        tx.Commit();
        return result;
    }

    T Read<T>(Func<SqliteConnection, T> body)
    {
        using var conn = Db.Open();
        return body(conn);
    }

    void Log(SqliteConnection c, SqliteTransaction tx, string table, long? rowId, string action, string summary, object? before = null, object? after = null)
        => Run(c, tx, "INSERT INTO change_log(at,user_name,table_name,row_id,action,summary,before_json,after_json) VALUES($a,$u,$t,$r,$ac,$s,$b,$af)",
            ("$a", Now()), ("$u", Me.Name), ("$t", table), ("$r", rowId), ("$ac", action), ("$s", summary),
            ("$b", before is null ? null : Json(before)), ("$af", after is null ? null : Json(after)));

    /// <summary>畫面每幾秒問一次：數字變了＝有人改過，畫面就重新讀。回傳最新序號與最後一筆是誰做了什麼。</summary>
    public object Pulse() => Read(c =>
    {
        var last = One(c, null, "SELECT seq,at,user_name,summary FROM change_log ORDER BY seq DESC LIMIT 1");
        return new { seq = last is null ? 0L : Convert.ToInt64(last["seq"]), by = last?["user_name"], summary = last?["summary"], at = last?["at"] };
    });

    void Touch(SqliteConnection c, SqliteTransaction tx, string table, long id)
        => Run(c, tx, $"UPDATE {table} SET ver=ver+1, updated_at=$t, updated_by=$u WHERE id=$id", ("$t", Now()), ("$u", Me.Name), ("$id", id));

    /// <summary>樂觀鎖：畫面送來的版本跟資料庫不同＝別人剛改過，不存、回報是誰改的。</summary>
    static void CheckVer(SqliteConnection c, SqliteTransaction tx, string table, long id, long? ver)
    {
        if (ver is null) return;
        var cur = One(c, tx, $"SELECT ver,updated_by,updated_at FROM {table} WHERE id=$id", ("$id", id))
                  ?? throw new DeniedException("這筆資料已不存在，請重新整理。");
        if (Convert.ToInt64(cur["ver"]) != ver)
            throw new ConflictException($"這筆剛被 {cur["updated_by"] ?? "其他同仁"} 在 {cur["updated_at"]} 改過。畫面已更新成最新內容，你剛才的修改沒有存入，請再確認一次。");
    }

    // ───────── 權限（集中一處，規則存在 settings） ─────────

    /// <summary>可設定的動作與預設值。all＝所有人；supervisor＝只有督導。</summary>
    public static readonly (string Key, string Label, string Default)[] PermRules =
    {
        ("session.create", "新增場次", "all"),
        ("session.edit", "修改場次資料", "all"),
        ("session.cancel", "取消／恢復場次", "supervisor"),
        ("session.close", "場次結案", "all"),
        ("session.reopen", "結案後重新開啟", "supervisor"),
        ("contact.edit", "修改名冊資料", "all"),
        ("mail.send", "寄確認信／提醒信", "all"),
        ("attend.edit", "登錄出席與回饋", "all"),
        ("file.delete", "刪除附件", "supervisor"),
        ("template.edit", "修改書信公版", "supervisor"),
        ("report.export", "匯出成果報告書", "all"),
        ("settings.edit", "系統設定與權限", "supervisor"),
    };

    public bool Can(string action)
    {
        if (Me.IsSupervisor) return true;
        if (action == "settings.edit") return false; // 權限設定本身永遠只給督導，避免自己放寬自己
        var rule = Setting("perm:" + action);
        if (rule.Length == 0) rule = PermRules.FirstOrDefault(r => r.Key == action).Default ?? "supervisor";
        return rule == "all";
    }

    void Require(string action)
    {
        if (Can(action)) return;
        var label = PermRules.FirstOrDefault(r => r.Key == action).Label ?? action;
        throw new DeniedException($"「{label}」目前設定為只有督導可以操作。需要的話請督導處理，或請督導在「設定」調整權限。");
    }

    public string Setting(string key) => Read(c => Scalar(c, null, "SELECT value FROM settings WHERE key=$k", ("$k", key)) as string ?? "");

    public object SetSetting(string key, string value)
    {
        Require("settings.edit");
        return Write((c, tx) =>
        {
            Run(c, tx, "INSERT INTO settings(key,value) VALUES($k,$v) ON CONFLICT(key) DO UPDATE SET value=$v", ("$k", key), ("$v", value));
            Log(c, tx, "settings", null, "set", $"設定 {key}");
            return new { ok = true };
        });
    }

    // ───────── 下拉＋自填：自填的值記進清單 ─────────

    static void Learn(SqliteConnection c, SqliteTransaction tx, string kind, string? value, string by)
    {
        var v = (value ?? "").Trim();
        if (v.Length == 0) return;
        Run(c, tx, "INSERT INTO registry(kind,name,created_at,created_by) VALUES($k,$n,$t,$u) ON CONFLICT(kind,name) DO UPDATE SET is_active=1",
            ("$k", kind), ("$n", v), ("$t", Now()), ("$u", by));
    }

    static string NextCode(SqliteConnection c, SqliteTransaction tx, int year)
    {
        var prefix = $"A{year}-";
        var max = Scalar(c, tx, "SELECT MAX(CAST(SUBSTR(code,$n) AS INTEGER)) FROM sessions WHERE code LIKE $p", ("$n", prefix.Length + 1), ("$p", prefix + "%"));
        var n = (max is null ? 0 : Convert.ToInt64(max)) + 1;
        return prefix + n.ToString("00");
    }

    public static readonly Dictionary<string, string> RoleLabel = new() { ["venue"] = "場地方", ["partner"] = "協辦單位", ["lecturer"] = "講師" };
}
