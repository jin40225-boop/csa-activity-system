using System.Text;
using System.Text.Json;
using ActivitySystem.Core;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ActivitySystem.App;

public sealed class MainForm : Form
{
    public const string Host = "activity.local";
    public const string FilesHost = "files.activity.local";
    readonly AppConfig cfg;
    readonly Db db;
    readonly UserInfo me;
    readonly string scriptPath;
    readonly WebView2 web = new() { Dock = DockStyle.Fill };

    public MainForm(AppConfig cfg, Db db, UserInfo me, string scriptPath)
    {
        this.cfg = cfg; this.db = db; this.me = me; this.scriptPath = scriptPath;
        Text = $"活動與教育訓練系統　{me.Name}（{me.Label}）　{BuildInfo.Display}";
        Size = new Size(1440, 920);
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = scriptPath.Length > 0 ? FormWindowState.Normal : FormWindowState.Maximized;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        Controls.Add(web);
        Shown += async (_, _) =>
        {
            try { await InitAsync(); }
            catch (Exception ex)
            {
                Diag("啟動失敗：" + ex);
                MessageBox.Show($"啟動畫面失敗：\n{ex.Message}", "啟動失敗", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        };
        // 切回視窗就請畫面立刻檢查有沒有別人改過
        Activated += (_, _) => _ = web.CoreWebView2?.ExecuteScriptAsync("window.dispatchEvent(new Event('app-focus'))");
    }

    public T Ui<T>(Func<T> f) => InvokeRequired ? (T)Invoke(f) : f();

    public void Diag(string line)
    {
        try { File.AppendAllText(Path.Combine(Program.LocalDir, "diag.log"), $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{me.Username}] {line}\n", Encoding.UTF8); }
        catch (IOException) { }
    }

    static string? ResolveAppDir()
    {
        foreach (var c in new[] { Path.Combine(AppContext.BaseDirectory, "app"), Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "app") })
        {
            var full = Path.GetFullPath(c);
            if (File.Exists(Path.Combine(full, "index.html"))) return full;
        }
        return null;
    }

    async Task InitAsync()
    {
        var appDir = ResolveAppDir() ?? throw new FileNotFoundException("找不到 app\\index.html，安裝可能不完整。");
        // WebView2 使用者資料夾一律放本機：程式在網路磁碟時放旁邊會建不起來、視窗直接消失（共照系統踩過）
        var userData = Path.Combine(Program.LocalDir, "WebView2_" + me.Username); // 每個帳號各自一份：同一台電腦同時開兩個帳號也不會互卡
        Directory.CreateDirectory(userData);
        var env = await CoreWebView2Environment.CreateAsync(null, userData);
        await web.EnsureCoreWebView2Async(env);
        var core = web.CoreWebView2;
        core.SetVirtualHostNameToFolderMapping(Host, appDir, CoreWebView2HostResourceAccessKind.Allow);
        Directory.CreateDirectory(cfg.FilesDir);
        core.SetVirtualHostNameToFolderMapping(FilesHost, cfg.FilesDir, CoreWebView2HostResourceAccessKind.Allow);
        // 畫面不連任何外部網站
        core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += (_, e) =>
        {
            var u = e.Request.Uri;
            if (u.StartsWith($"https://{Host}/", StringComparison.OrdinalIgnoreCase) || u.StartsWith($"https://{FilesHost}/", StringComparison.OrdinalIgnoreCase)) return;
            if (u.StartsWith("data:", StringComparison.OrdinalIgnoreCase) || u.StartsWith("blob:", StringComparison.OrdinalIgnoreCase)) return;
            e.Response = core.Environment.CreateWebResourceResponse(null, 403, "Blocked", "");
        };
        core.AddHostObjectToScript("api", new Bridge(db, me, this, cfg));
        core.WebMessageReceived += (_, e) => Diag("PAGE " + e.TryGetWebMessageAsString());
        await core.AddScriptToExecuteOnDocumentCreatedAsync(
            "window.addEventListener('error',function(e){chrome.webview.postMessage('JS ERROR: '+e.message+' @'+e.lineno)});" +
            "window.addEventListener('unhandledrejection',function(e){chrome.webview.postMessage('JS REJECT: '+(e.reason&&e.reason.message||e.reason))});");
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDevToolsEnabled = scriptPath.Length > 0 || Environment.GetEnvironmentVariable("ACTIVITY_DEVTOOLS") == "1";
        // 右鍵只留剪下／複製／貼上／全選
        core.ContextMenuRequested += (_, e) =>
        {
            var keep = new HashSet<string> { "cut", "copy", "paste", "selectAll" };
            for (var i = e.MenuItems.Count - 1; i >= 0; i--) if (!keep.Contains(e.MenuItems[i].Name)) e.MenuItems.RemoveAt(i);
            while (e.MenuItems.Count > 0 && e.MenuItems[0].Kind == CoreWebView2ContextMenuItemKind.Separator) e.MenuItems.RemoveAt(0);
            while (e.MenuItems.Count > 0 && e.MenuItems[^1].Kind == CoreWebView2ContextMenuItemKind.Separator) e.MenuItems.RemoveAt(e.MenuItems.Count - 1);
            if (e.MenuItems.Count == 0) e.Handled = true;
        };
        if (scriptPath.Length > 0) core.NavigationCompleted += async (_, _) => await RunScriptAsync();
        core.Navigate($"https://{Host}/index.html");
    }

    // ───────── 開發驗收：--script 步驟檔 [{ "asyncjs": "...", "wait": 800, "capture": "名稱.png", "label": "說明" }] ─────────
    async Task RunScriptAsync()
    {
        var core = web.CoreWebView2;
        var outDir = Path.GetDirectoryName(Path.GetFullPath(scriptPath))!;
        var results = new List<object>();
        var exit = 0;
        try
        {
            await Task.Delay(2500);
            using var doc = JsonDocument.Parse(File.ReadAllText(scriptPath));
            var i = 0;
            foreach (var step in doc.RootElement.EnumerateArray())
            {
                i++;
                var label = step.TryGetProperty("label", out var l) ? l.GetString() : $"step{i}";
                string? value = null;
                if (step.TryGetProperty("asyncjs", out var ajs))
                {
                    await core.ExecuteScriptAsync($"window.__r=undefined;(async()=>{{try{{const r=await (async()=>{{{ajs.GetString()}}})();window.__r=JSON.stringify(r===undefined?null:r)}}catch(e){{window.__r=JSON.stringify({{__error:String(e&&e.stack||e)}})}}}})()");
                    for (var t = 0; t < 300; t++)
                    {
                        await Task.Delay(100);
                        var v = await core.ExecuteScriptAsync("window.__r===undefined?null:window.__r");
                        if (v != "null") { value = JsonSerializer.Deserialize<string>(v); break; }
                    }
                }
                if (step.TryGetProperty("wait", out var w)) await Task.Delay(w.GetInt32());
                if (step.TryGetProperty("capture", out var cap))
                {
                    var path = Path.Combine(outDir, cap.GetString()!);
                    await using var fs = File.Create(path);
                    var task = core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, fs);
                    if (await Task.WhenAny(task, Task.Delay(15000)) != task) throw new TimeoutException("截圖逾時：" + path);
                }
                results.Add(new { step = i, label, value });
                if (value is not null && value.Contains("__error")) exit = 3;
            }
        }
        catch (Exception ex) { results.Add(new { error = ex.ToString() }); exit = 2; }
        File.WriteAllText(Path.Combine(outDir, "結果.json"), JsonSerializer.Serialize(results, new JsonSerializerOptions(Db.JsonOpts) { WriteIndented = true }), Encoding.UTF8);
        try { Close(); web.Dispose(); } catch { }
        await Task.Delay(300);
        Environment.Exit(exit);
    }
}
