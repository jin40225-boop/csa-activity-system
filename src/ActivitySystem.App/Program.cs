using System.Runtime.InteropServices;
using System.Text;
using ActivitySystem.Core;
using Microsoft.Web.WebView2.Core;

namespace ActivitySystem.App;

/// <summary>
/// 啟動參數：
///   --user &lt;帳號&gt;        每人一個啟動捷徑帶入身分（沿用第三次管理系統／微旅的固定身分做法，不用登入）
///   --data &lt;資料庫&gt;      覆寫 config.json 的 dataPath（開發／驗收用）
///   --init &lt;資料夾&gt; [--demo] [--names 督導,社工一,社工二]  在指定資料夾建立「資料、範本、備份」與空白（或示範）資料庫；names＝三個帳號的顯示名稱
///   --selftest [--report 檔]  不開視窗，檢查設定、資料庫、身分、WebView2 後印結果
///   --script &lt;步驟.json&gt;   開發驗收：依序在畫面上執行 JS、截圖、記錄結果後自動結束
/// </summary>
internal static class Program
{
    [DllImport("kernel32.dll")] static extern bool AttachConsole(int pid);

    public static string Arg(string[] args, string name) { var i = Array.IndexOf(args, name); return i >= 0 && i + 1 < args.Length ? args[i + 1] : ""; }

    public static string LocalDir
    {
        get
        {
            var over = Environment.GetEnvironmentVariable("ACTIVITY_LOCAL_DIR");
            var d = !string.IsNullOrEmpty(over) ? over : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ActivitySystem");
            Directory.CreateDirectory(d);
            return d;
        }
    }

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Contains("--selftest") || args.Contains("--init"))
        {
            AttachConsole(-1);
            try { Console.OutputEncoding = Encoding.UTF8; } catch (IOException) { }
            return args.Contains("--init") ? Init(Arg(args, "--init"), args.Contains("--demo"), Arg(args, "--names").Split(',', '，', '、').Select(x => x.Trim()).Where(x => x.Length > 0).ToArray()) : SelfTest(args);
        }
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Crash("Unhandled", e.ExceptionObject);
        Application.ThreadException += (_, e) => Crash("Thread", e.Exception);
        TaskScheduler.UnobservedTaskException += (_, e) => Crash("Task", e.Exception);
        ApplicationConfiguration.Initialize();

        try { CoreWebView2Environment.GetAvailableBrowserVersionString(); }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show("這台電腦缺少 Microsoft Edge WebView2 Runtime，系統無法顯示畫面。\n請資訊人員安裝「WebView2 Runtime（Evergreen）」後再開啟。", "缺少必要元件", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 2;
        }

        AppConfig cfg;
        Db db;
        try
        {
            cfg = AppConfig.Load(Arg(args, "--data") is { Length: > 0 } d ? d : null);
            DataGuard.EnsureReachable(cfg.DataPath);
            db = new Db(cfg.DataPath, allowCreate: false);
            db.EnsureSchema();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"{ex.Message}\n\n設定檔：{AppConfig.ConfigPath}", "無法開啟活動與教育訓練系統", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }

        var username = Arg(args, "--user");
        var me = username.Length > 0 ? Store.FindUser(db, username) : null;
        if (me is null)
        {
            MessageBox.Show(username.Length == 0
                ? "啟動捷徑沒有帶身分。請用自己名字的「啟動＿活動與教育訓練系統」捷徑開啟。"
                : $"找不到這個身分（{username}），或帳號已停用。請聯絡督導。", "身分不明", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }

        Task.Run(() => { var err = DataGuard.DailyBackup(cfg.DataPath, cfg.BackupDir, cfg.KeepDailyBackups); if (err is not null) Crash("Backup", err); });
        Application.Run(new MainForm(cfg, db, me, Arg(args, "--script")));
        return 0;
    }

    public static void Crash(string kind, object? err)
    {
        try { File.AppendAllText(Path.Combine(LocalDir, "crash.log"), $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {kind}\n{err}\n\n", Encoding.UTF8); }
        catch (IOException) { }
    }

    /// <summary>建立一套全新的資料夾結構：資料\activity.db、資料\附件、範本（複製預設範本）、備份。已有資料庫就不動資料，只補缺的結構與公版。</summary>
    static int Init(string root, bool demo, string[] names)
    {
        if (root.Length == 0) { Console.WriteLine("用法：ActivitySystem.exe --init <資料夾> [--demo]"); return 1; }
        root = Path.GetFullPath(root);
        var dataDir = Path.Combine(root, "資料");
        Directory.CreateDirectory(Path.Combine(dataDir, "附件"));
        Directory.CreateDirectory(Path.Combine(root, "備份"));
        var tplDir = Path.Combine(root, "範本");
        Directory.CreateDirectory(tplDir);
        var src = Path.Combine(AppContext.BaseDirectory, "範本預設");
        if (Directory.Exists(src))
            foreach (var f in Directory.GetFiles(src))
            {
                var dst = Path.Combine(tplDir, Path.GetFileName(f));
                if (!File.Exists(dst)) File.Copy(f, dst);
            }
        var db = new Db(Path.Combine(dataDir, "activity.db"), allowCreate: true);
        Seed.Init(db, demo, names.Length == 3 ? names : null);
        // 已有資料庫時也更新顯示名稱（重新安裝時改名）
        if (names.Length == 3) { using var c = db.Open(); foreach (var (u, n) in new[] { ("supervisor", names[0]), ("worker1", names[1]), ("worker2", names[2]) }) Db.Run(c, null, "UPDATE users SET display_name=$n WHERE username=$u", ("$n", n), ("$u", u)); }
        Console.WriteLine($"已建立：{db.Path}{(demo ? "（含示範資料）" : "")}");
        Console.WriteLine($"範本：{tplDir}");
        return 0;
    }

    static int SelfTest(string[] args)
    {
        var ok = true;
        var report = new List<string>();
        void Line(string k, string v) { var s = $"{k,-10}: {v}"; Console.WriteLine(s); report.Add(s); }
        Line("build", BuildInfo.Display);
        Line("exe", AppContext.BaseDirectory);
        try
        {
            var cfg = AppConfig.Load(Arg(args, "--data") is { Length: > 0 } d ? d : null);
            Line("data", cfg.DataPath);
            Line("files", cfg.FilesDir + (Directory.Exists(cfg.FilesDir) ? "" : "（不存在，FAIL）"));
            ok &= Directory.Exists(cfg.FilesDir);
            Line("templates", cfg.TemplatesDir + (Directory.Exists(cfg.TemplatesDir) ? "" : "（不存在）"));
            DataGuard.EnsureReachable(cfg.DataPath);
            var db = new Db(cfg.DataPath, allowCreate: false);
            db.EnsureSchema();
            using var c = db.Open();
            Line("journal", Db.Scalar(c, null, "PRAGMA journal_mode")?.ToString() ?? "?");
            foreach (var t in new[] { "users", "contacts", "sessions", "confirmations", "messages", "attachments", "templates" })
                Line(t, Db.Scalar(c, null, $"SELECT COUNT(*) FROM {t}")?.ToString() ?? "?");
            var user = Arg(args, "--user");
            if (user.Length > 0)
            {
                var me = Store.FindUser(db, user);
                Line("user", me is null ? "找不到（FAIL）" : $"{me.Name}（{me.Label}）");
                ok &= me is not null;
            }
            var wv = "";
            try { wv = CoreWebView2Environment.GetAvailableBrowserVersionString(); } catch (Exception) { ok = false; wv = "缺少（FAIL）"; }
            Line("webview2", wv);
            var app = Path.Combine(AppContext.BaseDirectory, "app", "index.html");
            Line("app", File.Exists(app) ? "OK" : "缺少 app/index.html（FAIL）");
            ok &= File.Exists(app);
        }
        catch (Exception ex) { Line("ERROR", ex.Message); ok = false; }
        var verdict = ok ? "SELFTEST PASS" : "SELFTEST FAIL";
        Console.WriteLine(verdict);
        report.Add(verdict);
        if (Arg(args, "--report") is { Length: > 0 } rp)
            try { File.WriteAllLines(rp, report, new UTF8Encoding(true)); } catch (IOException) { }
        return ok ? 0 : 1;
    }
}
