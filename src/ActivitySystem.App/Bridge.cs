using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using ActivitySystem.Core;

namespace ActivitySystem.App;

/// <summary>
/// 畫面呼叫的唯一入口：chrome.webview.hostObjects.api.Call(方法, JSON) → JSON 信封 {ok,result,error,conflict}。
/// 失敗一律帶原因回畫面（靜默失敗＝使用者以為沒這功能）。資料庫操作在背景執行緒做，畫面不卡。
/// 需要 Windows 對話框（選檔、存檔、開郵件）的動作在這裡處理，檔案本身存在 NAS 的附件資料夾。
/// </summary>
[ClassInterface(ClassInterfaceType.AutoDual)]
[ComVisible(true)]
public sealed class Bridge(Db db, UserInfo me, MainForm form, AppConfig cfg)
{
    static readonly JsonSerializerOptions Opts = Db.JsonOpts;
    Store S => new(db, me);

    public async Task<string> Call(string method, string argsJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(argsJson) ? "{}" : argsJson);
            var a = doc.RootElement.Clone();
            var result = method switch
            {
                "pickFiles" => await PickFiles(a),
                "saveDocx" => await SaveDocx(a),
                "receipt" => await Receipt(a),
                "mailDraft" => await MailDraft(a),
                "copyText" => form.Ui(() => { Clipboard.SetText(Str(a, "text")); return (object?)new { ok = true }; }),
                _ => await Task.Run(() => Dispatch(method, a)),
            };
            return JsonSerializer.Serialize(new { ok = true, result }, Opts);
        }
        catch (ConflictException ex) { return JsonSerializer.Serialize(new { ok = false, conflict = true, error = ex.Message }, Opts); }
        catch (DeniedException ex) { return JsonSerializer.Serialize(new { ok = false, error = ex.Message }, Opts); }
        catch (Exception ex)
        {
            form.Diag($"{method} 失敗：{ex}");
            var msg = ex is Microsoft.Data.Sqlite.SqliteException { SqliteErrorCode: 5 or 6 }
                ? "資料庫正被其他同仁寫入中，請稍候再按一次。"
                : ex is IOException or UnauthorizedAccessException ? $"檔案或網路磁碟無法存取：{ex.Message}" : ex.Message;
            return JsonSerializer.Serialize(new { ok = false, error = msg }, Opts);
        }
    }

    static string Str(JsonElement a, string k) => a.TryGetProperty(k, out var v) && v.ValueKind != JsonValueKind.Null ? (v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : v.GetRawText()) : "";
    static long Id(JsonElement a, string k) => long.Parse(Str(a, k));
    static long? IdN(JsonElement a, string k) => long.TryParse(Str(a, k), out var v) ? v : null;
    static bool Bool(JsonElement a, string k) => a.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.True;
    static Fields F(JsonElement a) => a.TryGetProperty("fields", out var f) ? Fields.Parse(f.GetRawText()) : new Fields();

    object? Dispatch(string m, JsonElement a)
    {
        var s = S;
        return m switch
        {
            "boot" => new { data = s.Snapshot(), app = new { version = BuildInfo.Display, dataPath = cfg.DataPath, templatesDir = cfg.TemplatesDir, templateFiles = TemplateFiles() } },
            "snapshot" => s.Snapshot(),
            "pulse" => s.Pulse(),
            "recent" => s.RecentChanges(IdN(a, "after") ?? 0),
            "history" => s.History(Str(a, "table"), Id(a, "id")),
            "saveSession" => s.SaveSession(IdN(a, "id"), IdN(a, "ver"), F(a)),
            "setSessionStatus" => s.SetSessionStatus(Id(a, "id"), Str(a, "status")),
            "saveAttendance" => s.SaveAttendance(Id(a, "id"), IdN(a, "ver"), F(a)),
            "closeSession" => s.CloseSession(Id(a, "id"), Bool(a, "reopen")),
            "saveContact" => s.SaveContact(IdN(a, "id"), IdN(a, "ver"), F(a)),
            "recordCall" => s.RecordCall(Id(a, "sessionId"), Str(a, "role"), Str(a, "note")),
            "sendLetter" => s.SendLetter(Id(a, "sessionId"), Str(a, "role"), Str(a, "subject"), Str(a, "body"), Str(a, "due"), Bool(a, "remind")),
            "recordReply" => s.RecordReply(Id(a, "sessionId"), Str(a, "role"), Str(a, "state"), Str(a, "via"), Str(a, "body")),
            "resetConfirmation" => s.ResetConfirmation(Id(a, "sessionId"), Str(a, "role")),
            "updateAttachment" => s.UpdateAttachment(Id(a, "id"), F(a)),
            "openAttachment" => OpenAttachment(Id(a, "id")),
            "openSessionFolder" => OpenFolder(SessionFolder(Str(a, "code"))),
            "openTemplatesFolder" => OpenFolder(cfg.TemplatesDir),
            "saveTemplate" => s.SaveTemplate(Str(a, "key"), IdN(a, "ver"), F(a)),
            "setSetting" => s.SetSetting(Str(a, "key"), Str(a, "value")),
            "saveUser" => s.SaveUser(Id(a, "id"), F(a)),
            _ => throw new DeniedException($"不認得的動作：{m}"),
        };
    }

    // ───────── 檔案 ─────────

    string SessionFolder(string code)
    {
        foreach (var ch in Path.GetInvalidFileNameChars()) code = code.Replace(ch, '_');
        return Path.Combine(cfg.FilesDir, code);
    }

    object TemplateFiles()
    {
        try { return Directory.Exists(cfg.TemplatesDir) ? Directory.GetFiles(cfg.TemplatesDir, "*.docx").Select(Path.GetFileName).ToArray() : Array.Empty<string>(); }
        catch (IOException) { return Array.Empty<string>(); }
    }

    static readonly Dictionary<string, string> KindFilter = new()
    {
        ["photo"] = "照片|*.jpg;*.jpeg;*.png;*.heic;*.gif;*.bmp|所有檔案|*.*",
        ["sign"] = "掃描檔或照片|*.pdf;*.jpg;*.jpeg;*.png|所有檔案|*.*",
        ["paper"] = "掃描檔或照片|*.pdf;*.jpg;*.jpeg;*.png|所有檔案|*.*",
        ["slides"] = "簡報|*.pptx;*.ppt;*.pdf|所有檔案|*.*",
        ["receipt"] = "領據|*.pdf;*.docx;*.jpg;*.png|所有檔案|*.*",
        ["other"] = "所有檔案|*.*",
    };

    /// <summary>開 Windows 選檔視窗（可多選）→ 複製到 NAS 附件資料夾\場次編號\ → 登記到資料庫。原檔不動。</summary>
    async Task<object?> PickFiles(JsonElement a)
    {
        var sessionId = Id(a, "sessionId");
        var code = Str(a, "code");
        var kind = Str(a, "kind");
        if (!KindFilter.ContainsKey(kind)) throw new DeniedException("不認得的檔案類別。");
        if (!S.Can("attend.edit")) throw new DeniedException("你目前沒有上傳成果資料的權限。");
        // 自動驗收用：ACTIVITY_PICK＝以 | 分隔的檔案清單，不跳視窗
        var auto = Environment.GetEnvironmentVariable("ACTIVITY_PICK");
        var files = !string.IsNullOrEmpty(auto) ? auto.Split('|', StringSplitOptions.RemoveEmptyEntries) : form.Ui(() =>
        {
            using var dlg = new OpenFileDialog { Multiselect = true, Filter = KindFilter[kind], Title = "選擇要上傳的" + Store.KindLabel(kind), InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) + "\\Downloads" };
            return dlg.ShowDialog(form) == DialogResult.OK ? dlg.FileNames : Array.Empty<string>();
        });
        if (files.Length == 0) return new { cancelled = true };
        var dir = Path.Combine(SessionFolder(code), Store.KindLabel(kind));
        var added = new List<object>();
        await Task.Run(() =>
        {
            Directory.CreateDirectory(dir);
            foreach (var f in files)
            {
                var name = Path.GetFileName(f);
                var dest = Path.Combine(dir, name);
                for (var n = 2; File.Exists(dest); n++) dest = Path.Combine(dir, $"{Path.GetFileNameWithoutExtension(name)}({n}){Path.GetExtension(name)}");
                File.Copy(f, dest);
                var rel = Path.GetRelativePath(cfg.FilesDir, dest).Replace('\\', '/');
                added.Add(S.AddAttachment(sessionId, kind, Path.GetFileName(dest), rel, new FileInfo(dest).Length));
            }
        });
        return new { count = added.Count, folder = dir };
    }

    object OpenAttachment(long id)
    {
        var row = S.Attachment(id) ?? throw new DeniedException("找不到這個檔案紀錄。");
        var rel = (string?)row["rel_path"] ?? "";
        if (rel.Length == 0) throw new DeniedException("這筆是舊資料，只有紀錄沒有檔案。");
        var path = Path.Combine(cfg.FilesDir, rel.Replace('/', '\\'));
        if (!File.Exists(path)) throw new DeniedException($"檔案不見了：{path}");
        Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        return new { ok = true };
    }

    static object OpenFolder(string dir)
    {
        Directory.CreateDirectory(dir);
        Process.Start(new ProcessStartInfo("explorer.exe", $"\"{dir}\"") { UseShellExecute = true });
        return new { ok = true, dir };
    }

    string? AskSavePath(string name, string filter)
    {
        foreach (var ch in Path.GetInvalidFileNameChars()) name = name.Replace(ch, '_');
        var auto = Environment.GetEnvironmentVariable("ACTIVITY_EXPORT_DIR");
        if (!string.IsNullOrEmpty(auto)) { Directory.CreateDirectory(auto); return Path.Combine(auto, name); }
        return form.Ui(() =>
        {
            using var dlg = new SaveFileDialog { FileName = name, Filter = filter, InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments) };
            return dlg.ShowDialog(form) == DialogResult.OK ? dlg.FileName : null;
        });
    }

    void Reveal(string path)
    {
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ACTIVITY_EXPORT_DIR"))) return;
        form.Ui(() => { try { Process.Start("explorer.exe", $"/select,\"{path}\""); } catch { } return 0; });
    }

    /// <summary>畫面組好的 Word 檔（成果報告書）存到使用者選的位置。</summary>
    async Task<object?> SaveDocx(JsonElement a)
    {
        if (!S.Can("report.export")) throw new DeniedException("你目前沒有匯出成果報告書的權限。");
        var bytes = Convert.FromBase64String(Str(a, "base64"));
        var path = AskSavePath(Str(a, "name"), "Word 文件|*.docx");
        if (path is null) return new { cancelled = true };
        await File.WriteAllBytesAsync(path, bytes);
        Reveal(path);
        return new { path };
    }

    /// <summary>講師領據：用「範本\講師領據.docx」填值。範本換掉，產出就跟著換。</summary>
    async Task<object?> Receipt(JsonElement a)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        if (a.TryGetProperty("values", out var v) && v.ValueKind == JsonValueKind.Object)
            foreach (var p in v.EnumerateObject()) values[p.Name] = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() ?? "" : p.Value.GetRawText();
        var tplName = Str(a, "template") is { Length: > 0 } t ? t : "講師領據.docx";
        var tpl = Path.Combine(cfg.TemplatesDir, tplName);
        if (!File.Exists(tpl)) throw new DeniedException($"找不到領據範本：{tpl}\n請把範本放到「範本」資料夾（檔名 {tplName}）。");
        var path = AskSavePath(Str(a, "name"), "Word 文件|*.docx");
        if (path is null) return new { cancelled = true };
        await Task.Run(() => DocxTemplate.Fill(tpl, path, values));
        var missing = DocxTemplate.Keys(tpl).Where(k => !values.ContainsKey(k)).ToArray();
        Reveal(path);
        return new { path, missing };
    }

    /// <summary>產生待寄出的信（.eml）並用電腦預設的郵件程式（例如 Outlook）開啟，按「傳送」即寄出。</summary>
    async Task<object?> MailDraft(JsonElement a)
    {
        var to = Str(a, "to");
        if (to.Length == 0) throw new DeniedException("收件人沒有 Email，請先在名冊補上。");
        var attach = new List<string>();
        if (a.TryGetProperty("attachmentPaths", out var ap) && ap.ValueKind == JsonValueKind.Array)
            foreach (var p in ap.EnumerateArray()) { var rel = p.GetString() ?? ""; if (rel.Length > 0) attach.Add(Path.Combine(cfg.FilesDir, rel.Replace('/', '\\'))); }
        var eml = Eml.Build(to, Str(a, "subject"), Str(a, "body"), attach);
        var dir = Path.Combine(Program.LocalDir, "待寄信件");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"{DateTime.Now:yyyyMMdd-HHmmss}_{Guid.NewGuid().ToString("N")[..4]}.eml");
        await File.WriteAllTextAsync(path, eml, new UTF8Encoding(false));
        if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ACTIVITY_EXPORT_DIR")))
            form.Ui(() => { Process.Start(new ProcessStartInfo(path) { UseShellExecute = true }); return 0; });
        return new { path };
    }
}
