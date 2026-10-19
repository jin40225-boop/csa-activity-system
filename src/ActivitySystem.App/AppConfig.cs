using System.Reflection;
using System.Text.Json;

namespace ActivitySystem.App;

/// <summary>程式旁的 config.json：資料庫、附件、範本、備份的位置（相對路徑以程式資料夾為準）。讀不到就停，不猜路徑。</summary>
public sealed class AppConfig
{
    public string DataPath { get; init; } = "";
    public string FilesDir { get; init; } = "";
    public string TemplatesDir { get; init; } = "";
    public string BackupDir { get; init; } = "";
    public int KeepDailyBackups { get; init; } = 30;

    public static string ConfigPath => Path.Combine(AppContext.BaseDirectory, "config.json");

    public static AppConfig Load(string? dataOverride = null)
    {
        string? data = dataOverride, files = null, tpl = null, backup = null;
        var keep = 30;
        if (File.Exists(ConfigPath))
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(ConfigPath));
            var r = doc.RootElement;
            string? S(string k) => r.TryGetProperty(k, out var v) ? v.GetString() : null;
            data ??= S("dataPath"); files = S("filesDir"); tpl = S("templatesDir"); backup = S("backupDir");
            if (r.TryGetProperty("keepDailyBackups", out var k) && k.TryGetInt32(out var kv)) keep = kv;
        }
        if (string.IsNullOrWhiteSpace(data)) throw new InvalidOperationException("設定檔沒有寫資料庫位置（dataPath）。");
        string Abs(string p) => Path.GetFullPath(Path.IsPathRooted(p) ? p : Path.Combine(AppContext.BaseDirectory, p));
        var dataAbs = Abs(data);
        var root = Path.GetDirectoryName(dataAbs)!;
        return new AppConfig
        {
            DataPath = dataAbs,
            FilesDir = string.IsNullOrWhiteSpace(files) ? Path.Combine(root, "附件") : Abs(files),
            TemplatesDir = string.IsNullOrWhiteSpace(tpl) ? Path.Combine(Path.GetDirectoryName(root)!, "範本") : Abs(tpl),
            BackupDir = string.IsNullOrWhiteSpace(backup) ? Path.Combine(Path.GetDirectoryName(root)!, "備份") : Abs(backup),
            KeepDailyBackups = keep,
        };
    }
}

public static class BuildInfo
{
    public static string Version => Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.1.0";

    public static string Revision
    {
        get
        {
            var info = Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "";
            var plus = info.IndexOf('+');
            var rev = plus >= 0 && plus < info.Length - 1 ? info[(plus + 1)..] : "dev";
            return rev.Length > 7 ? rev[..7] : rev;
        }
    }

    public static string BuildDate => File.GetLastWriteTime(Assembly.GetExecutingAssembly().Location).ToString("yyyy-MM-dd");
    public static string Display => $"v{Version} · {BuildDate} · {Revision}";
}
