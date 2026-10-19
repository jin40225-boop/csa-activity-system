using System.Text;

namespace ActivitySystem.Core;

/// <summary>
/// 產生「待寄出」的信件檔（.eml，X-Unsent:1）：用 Outlook 等郵件程式開啟就是一封寫好的新信，
/// 收件人、主旨、內文、附件都在，按「傳送」即可。公務信箱帳號設定在郵件程式裡，系統不保存密碼。
/// 日後若改由系統直接寄信（SMTP），只換這一段。
/// </summary>
public static class Eml
{
    public static string Build(string to, string subject, string body, IEnumerable<string>? attachments = null)
    {
        var sb = new StringBuilder();
        var boundary = "----=_ActivitySystem_" + Guid.NewGuid().ToString("N");
        string B64(string s) => Convert.ToBase64String(Encoding.UTF8.GetBytes(s));
        sb.Append("X-Unsent: 1\r\n");
        sb.Append($"To: {to}\r\n");
        sb.Append($"Subject: =?UTF-8?B?{B64(subject)}?=\r\n");
        sb.Append("MIME-Version: 1.0\r\n");
        sb.Append($"Content-Type: multipart/mixed; boundary=\"{boundary}\"\r\n\r\n");
        sb.Append($"--{boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n");
        sb.Append(Wrap(B64(body.Replace("\r\n", "\n").Replace("\n", "\r\n")))).Append("\r\n");
        foreach (var path in attachments ?? Array.Empty<string>())
        {
            if (!File.Exists(path)) continue;
            var name = Path.GetFileName(path);
            sb.Append($"--{boundary}\r\nContent-Type: application/octet-stream; name=\"=?UTF-8?B?{B64(name)}?=\"\r\n");
            sb.Append($"Content-Disposition: attachment; filename=\"=?UTF-8?B?{B64(name)}?=\"\r\nContent-Transfer-Encoding: base64\r\n\r\n");
            sb.Append(Wrap(Convert.ToBase64String(File.ReadAllBytes(path)))).Append("\r\n");
        }
        sb.Append($"--{boundary}--\r\n");
        return sb.ToString();
    }

    static string Wrap(string b64)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < b64.Length; i += 76) sb.Append(b64, i, Math.Min(76, b64.Length - i)).Append("\r\n");
        return sb.ToString();
    }
}
