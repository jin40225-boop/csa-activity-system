using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace ActivitySystem.Core;

/// <summary>
/// 資料庫連線與結構。沿用微旅 v2／物資在 NAS 上驗證過的做法：
/// 1. 每次操作開一條短連線、用完即關（Pooling=False）；
/// 2. 一律 DELETE journal（WAL 在 SMB 多台電腦之間會毀損），busy_timeout 讓同時寫入排隊；
/// 3. 會被多人改的表有 ver 欄，存檔比對版本，別人剛改過就回報衝突，不默默蓋掉；
/// 4. 每個寫入都在交易裡留下 change_log；畫面靠 change_log 的 seq 判斷「有沒有人改過」來同步。
/// </summary>
public sealed class Db
{
    public const int SchemaVersion = 1;
    public string Path { get; }
    public bool AllowCreate { get; }

    public Db(string path, bool allowCreate = true)
    {
        Path = System.IO.Path.GetFullPath(path);
        AllowCreate = allowCreate;
    }

    public SqliteConnection Open()
    {
        var cs = new SqliteConnectionStringBuilder
        {
            DataSource = Path,
            Mode = AllowCreate ? SqliteOpenMode.ReadWriteCreate : SqliteOpenMode.ReadWrite,
            Pooling = false,
            DefaultTimeout = 15,
        }.ToString();
        var conn = new SqliteConnection(cs);
        conn.Open();
        Exec(conn, "PRAGMA busy_timeout=15000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;");
        return conn;
    }

    public static void Exec(SqliteConnection conn, string sql, params (string, object?)[] args) => Run(conn, null, sql, args);

    public static int Run(SqliteConnection conn, SqliteTransaction? tx, string sql, params (string, object?)[] args)
    {
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = sql;
        foreach (var (k, v) in args) cmd.Parameters.AddWithValue(k, v ?? DBNull.Value);
        return cmd.ExecuteNonQuery();
    }

    public static object? Scalar(SqliteConnection conn, SqliteTransaction? tx, string sql, params (string, object?)[] args)
    {
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = sql;
        foreach (var (k, v) in args) cmd.Parameters.AddWithValue(k, v ?? DBNull.Value);
        var r = cmd.ExecuteScalar();
        return r is DBNull ? null : r;
    }

    public static long Insert(SqliteConnection conn, SqliteTransaction? tx, string sql, params (string, object?)[] args)
    {
        Run(conn, tx, sql, args);
        return (long)Scalar(conn, tx, "SELECT last_insert_rowid()")!;
    }

    public static List<Dictionary<string, object?>> Query(SqliteConnection conn, SqliteTransaction? tx, string sql, params (string, object?)[] args)
    {
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = sql;
        foreach (var (k, v) in args) cmd.Parameters.AddWithValue(k, v ?? DBNull.Value);
        using var r = cmd.ExecuteReader();
        var list = new List<Dictionary<string, object?>>();
        while (r.Read())
        {
            var row = new Dictionary<string, object?>(r.FieldCount, StringComparer.Ordinal);
            for (var i = 0; i < r.FieldCount; i++) row[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
            list.Add(row);
        }
        return list;
    }

    public static Dictionary<string, object?>? One(SqliteConnection conn, SqliteTransaction? tx, string sql, params (string, object?)[] args)
        => Query(conn, tx, sql, args).FirstOrDefault();

    public static string Now() => DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");

    /// <summary>建立或升級結構。冪等：每次開程式都可以跑；多台同時開也安全（交易內 IF NOT EXISTS）。</summary>
    public void EnsureSchema()
    {
        using var conn = Open();
        using var tx = conn.BeginTransaction();
        Run(conn, tx, Schema);
        // 後來加的欄位：缺哪欄才補哪欄（NAS 上已有的資料庫開新版程式時自動升級，多台同時開也只補一次）
        foreach (var (table, col, type) in AddedColumns)
        {
            var cols = Query(conn, tx, $"SELECT name FROM pragma_table_info('{table}')").Select(r => (string)r["name"]!).ToList();
            if (cols.Count > 0 && !cols.Contains(col)) Run(conn, tx, $"ALTER TABLE {table} ADD COLUMN {col} {type}");
        }
        var v = Scalar(conn, tx, "SELECT value FROM settings WHERE key='schema_version'") as string;
        if (v is null) Run(conn, tx, "INSERT INTO settings(key,value) VALUES('schema_version',$v)", ("$v", SchemaVersion.ToString()));
        tx.Commit();
    }

    public static readonly (string Table, string Column, string Type)[] AddedColumns =
    {
        ("sessions", "signups", "INTEGER NOT NULL DEFAULT 0"),   // 報名人數（目前由示範模式模擬；日後接報名表）
    };

    public const string Schema = """
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('supervisor','staff')), title TEXT DEFAULT '', email TEXT DEFAULT '', phone TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS contacts(
      id INTEGER PRIMARY KEY, type TEXT NOT NULL DEFAULT '學校', org TEXT NOT NULL, person TEXT DEFAULT '', title TEXT DEFAULT '',
      phone TEXT DEFAULT '', email TEXT DEFAULT '', town TEXT DEFAULT '', address TEXT DEFAULT '', notes TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1, ver INTEGER NOT NULL DEFAULT 1, created_at TEXT, created_by TEXT, updated_at TEXT, updated_by TEXT);
    CREATE TABLE IF NOT EXISTS registry(
      id INTEGER PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0,
      created_at TEXT, created_by TEXT, UNIQUE(kind,name));
    CREATE TABLE IF NOT EXISTS sessions(
      id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, year INTEGER NOT NULL, prog TEXT NOT NULL, topic TEXT DEFAULT '',
      audience TEXT DEFAULT '', date TEXT NOT NULL, start_time TEXT DEFAULT '', end_time TEXT DEFAULT '', hours REAL DEFAULT 0,
      venue_id INTEGER REFERENCES contacts(id), partner_id INTEGER REFERENCES contacts(id), lecturer_id INTEGER REFERENCES contacts(id),
      owner_user_id INTEGER REFERENCES users(id), target INTEGER DEFAULT 0,
      male INTEGER, female INTEGER, reach INTEGER, online_fb INTEGER NOT NULL DEFAULT 0, paper_fb INTEGER NOT NULL DEFAULT 0,
      sat1 INTEGER NOT NULL DEFAULT 0, sat2 INTEGER NOT NULL DEFAULT 0, sat3 INTEGER NOT NULL DEFAULT 0, sat4 INTEGER NOT NULL DEFAULT 0, sat5 INTEGER NOT NULL DEFAULT 0,
      pre_rate INTEGER, post_rate INTEGER, quotes TEXT DEFAULT '', notes TEXT DEFAULT '', flags TEXT DEFAULT '', fee_per_hour INTEGER,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
      attended_at TEXT, closed_at TEXT, closed_by TEXT,
      ver INTEGER NOT NULL DEFAULT 1, created_at TEXT, created_by TEXT, updated_at TEXT, updated_by TEXT);
    CREATE INDEX IF NOT EXISTS ix_sessions_date ON sessions(date);
    CREATE TABLE IF NOT EXISTS confirmations(
      id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL CHECK(role IN ('venue','partner','lecturer')),
      called_at TEXT, called_by TEXT, state TEXT NOT NULL DEFAULT 'none' CHECK(state IN ('none','sent','opened','confirmed','declined')),
      sent_at TEXT, sent_by TEXT, due_date TEXT, confirmed_at TEXT, confirmed_via TEXT DEFAULT '', reminded_at TEXT, note TEXT DEFAULT '',
      ver INTEGER NOT NULL DEFAULT 1, updated_at TEXT, updated_by TEXT, UNIQUE(session_id, role));
    CREATE TABLE IF NOT EXISTS messages(
      id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES sessions(id), role TEXT NOT NULL,
      dir TEXT NOT NULL CHECK(dir IN ('out','in','sys')), at TEXT NOT NULL, by_user TEXT, subject TEXT DEFAULT '', body TEXT DEFAULT '',
      attachment_id INTEGER, created_at TEXT);
    CREATE INDEX IF NOT EXISTS ix_messages_session ON messages(session_id);
    CREATE TABLE IF NOT EXISTS attachments(
      id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES sessions(id),
      kind TEXT NOT NULL CHECK(kind IN ('photo','sign','paper','slides','receipt','other')),
      file_name TEXT NOT NULL, rel_path TEXT NOT NULL, size INTEGER DEFAULT 0, caption TEXT DEFAULT '',
      in_report INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0, is_deleted INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT, uploaded_by TEXT);
    CREATE INDEX IF NOT EXISTS ix_attachments_session ON attachments(session_id);
    CREATE TABLE IF NOT EXISTS templates(
      key TEXT PRIMARY KEY, title TEXT NOT NULL, subject TEXT DEFAULT '', body TEXT DEFAULT '',
      ver INTEGER NOT NULL DEFAULT 1, updated_at TEXT, updated_by TEXT);
    CREATE TABLE IF NOT EXISTS change_log(
      seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_name TEXT, table_name TEXT NOT NULL, row_id INTEGER,
      action TEXT NOT NULL, summary TEXT DEFAULT '', before_json TEXT, after_json TEXT);
    """;

    public static string Json(object? o) => JsonSerializer.Serialize(o, JsonOpts);
    public static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web)
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };
}
