using System.IO.Compression;
using System.Security;
using System.Text;
using System.Text.RegularExpressions;

namespace ActivitySystem.Core;

/// <summary>
/// Word 範本填值（同 F-DOC-003 的做法，不需要 Office、不需要第三方套件）：
/// 範本裡寫 {{佔位字}}，填入對應的值；值裡的換行轉成 Word 換行；沒有對應值的佔位字清成空白。
/// 換範本＝換一個 .docx 檔，程式不必改。
/// 佔位字被 Word 拆成好幾段文字（例如打字時改過）也找得到：會把 {{ 與 }} 之間的格式標籤去掉再比對。
/// </summary>
public static partial class DocxTemplate
{
    [GeneratedRegex(@"\{\{(.*?)\}\}", RegexOptions.Singleline)]
    private static partial Regex Placeholder();

    [GeneratedRegex(@"<[^>]+>")]
    private static partial Regex Tag();

    public static IReadOnlyList<string> Keys(string templatePath)
    {
        using var zip = ZipFile.OpenRead(templatePath);
        var keys = new List<string>();
        foreach (var e in zip.Entries.Where(IsText))
        {
            using var r = new StreamReader(e.Open(), Encoding.UTF8);
            foreach (Match m in Placeholder().Matches(r.ReadToEnd()))
            {
                var k = Tag().Replace(m.Groups[1].Value, "").Trim();
                if (!keys.Contains(k)) keys.Add(k);
            }
        }
        return keys;
    }

    static bool IsText(ZipArchiveEntry e) => e.FullName.StartsWith("word/") && e.FullName.EndsWith(".xml");

    public static void Fill(string templatePath, string outPath, IReadOnlyDictionary<string, string> values)
    {
        if (!File.Exists(templatePath)) throw new DeniedException($"找不到範本：{templatePath}");
        var tmp = outPath + ".tmp";
        File.Copy(templatePath, tmp, true);
        try
        {
            using (var zip = ZipFile.Open(tmp, ZipArchiveMode.Update))
            {
                foreach (var e in zip.Entries.Where(IsText).ToList())
                {
                    string xml;
                    using (var r = new StreamReader(e.Open(), Encoding.UTF8)) xml = r.ReadToEnd();
                    var filled = Placeholder().Replace(xml, m =>
                    {
                        var inner = m.Groups[1].Value;
                        var key = Tag().Replace(inner, "").Trim();
                        var v = values.TryGetValue(key, out var val) ? val : "";
                        var text = SecurityElement.Escape(v) ?? "";
                        text = text.Replace("\r\n", "\n").Replace("\n", "</w:t><w:br/><w:t xml:space=\"preserve\">");
                        // 佔位字跨段時，內部的結束／開始標籤成對被拿掉，結構仍然平衡
                        return text;
                    });
                    if (filled == xml) continue;
                    var name = e.FullName;
                    e.Delete();
                    var ne = zip.CreateEntry(name, CompressionLevel.Optimal);
                    using var w = new StreamWriter(ne.Open(), new UTF8Encoding(false));
                    w.Write(filled);
                }
            }
            File.Move(tmp, outPath, true);
        }
        finally { if (File.Exists(tmp)) File.Delete(tmp); }
    }
}
