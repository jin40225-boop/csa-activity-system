using static ActivitySystem.Core.Db;

namespace ActivitySystem.Core;

public sealed partial class Store
{
    /// <summary>
    /// 畫面需要的全部資料一次讀回（一年幾十場、名冊幾百筆，量很小）。
    /// 畫面只依這份快照算狀態與統計，所以三台電腦看到的數字一定一致。
    /// </summary>
    public object Snapshot() => Read(c => new
    {
        seq = Convert.ToInt64(Scalar(c, null, "SELECT COALESCE(MAX(seq),0) FROM change_log") ?? 0L),
        now = Now(),
        me = new { Me.Id, Me.Username, Me.Name, Me.Role, Me.Label, isSupervisor = Me.IsSupervisor },
        users = Query(c, null, "SELECT id,username,display_name AS name,role,title,email,phone,is_active FROM users ORDER BY role DESC,id"),
        contacts = Query(c, null, "SELECT * FROM contacts ORDER BY is_active DESC, type, org, person"),
        sessions = Query(c, null, "SELECT * FROM sessions ORDER BY date, start_time"),
        confirmations = Query(c, null, "SELECT * FROM confirmations"),
        messages = Query(c, null, "SELECT id,session_id,role,dir,at,by_user,subject,body,attachment_id FROM messages ORDER BY at, id"),
        attachments = Query(c, null, "SELECT id,session_id,kind,file_name,rel_path,size,caption,in_report,sort,uploaded_at,uploaded_by FROM attachments WHERE is_deleted=0 ORDER BY session_id, kind, sort, id"),
        templates = Query(c, null, "SELECT * FROM templates ORDER BY key"),
        registry = Query(c, null, "SELECT kind,name FROM registry WHERE is_active=1 ORDER BY kind, sort, name"),
        settings = Query(c, null, "SELECT key,value FROM settings WHERE key NOT LIKE '%secret%'").ToDictionary(r => (string)r["key"]!, r => r["value"]),
        perms = PermRules.Select(p => new { key = p.Key, label = p.Label, rule = RuleOf(c, p.Key, p.Default), can = CanIn(c, p.Key, p.Default) }).ToList(),
    });

    string RuleOf(Microsoft.Data.Sqlite.SqliteConnection c, string key, string def)
        => Scalar(c, null, "SELECT value FROM settings WHERE key=$k", ("$k", "perm:" + key)) as string is { Length: > 0 } v ? v : def;

    bool CanIn(Microsoft.Data.Sqlite.SqliteConnection c, string key, string def)
        => Me.IsSupervisor || (key != "settings.edit" && RuleOf(c, key, def) == "all");

    public Dictionary<string, object?>? Attachment(long id) => Read(c => One(c, null, "SELECT * FROM attachments WHERE id=$id AND is_deleted=0", ("$id", id)));

    /// <summary>單筆的異動歷程（誰、何時、做了什麼）。</summary>
    public object History(string table, long id) => Read(c =>
        Query(c, null, "SELECT seq,at,user_name,action,summary FROM change_log WHERE table_name=$t AND row_id=$id ORDER BY seq DESC LIMIT 200", ("$t", table), ("$id", id)));

    /// <summary>最近的異動（給「誰剛改了什麼」通知用）。</summary>
    public object RecentChanges(long afterSeq) => Read(c =>
        Query(c, null, "SELECT seq,at,user_name,table_name,row_id,action,summary FROM change_log WHERE seq>$s ORDER BY seq DESC LIMIT 30", ("$s", afterSeq)));
}
