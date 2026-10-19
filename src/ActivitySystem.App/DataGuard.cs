using Microsoft.Data.Sqlite;

namespace ActivitySystem.App;

/// <summary>開程式前的檢查：資料夾連得到（連不到就擋，不在別處生空白資料庫）；每天第一次開時備份一份。</summary>
public static class DataGuard
{
    public static void EnsureReachable(string dataPath)
    {
        var dir = Path.GetDirectoryName(dataPath)!;
        if (!Directory.Exists(dir)) throw new IOException($"連不到資料夾：\n{dir}\n\n請確認網路磁碟（NAS）連線正常。");
        if (!File.Exists(dataPath)) throw new IOException($"找不到資料庫：\n{dataPath}\n\n系統不會自動建立空白資料庫，請聯絡管理者。");
    }

    /// <summary>每天一份（VACUUM INTO：有人同時在寫也是一致的快照）；留最近 keep 天＋每月 1 號。回傳 null＝沒事，否則回傳原因。</summary>
    public static string? DailyBackup(string dataPath, string backupDir, int keep)
    {
        try
        {
            Directory.CreateDirectory(backupDir);
            var today = Path.Combine(backupDir, $"activity_{DateTime.Today:yyyyMMdd}.db");
            if (File.Exists(today)) return null;
            var tmp = Path.Combine(backupDir, $"activity_{DateTime.Today:yyyyMMdd}.{Environment.MachineName}.{Environment.ProcessId}.tmp");
            try
            {
            using (var c = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = dataPath, Mode = SqliteOpenMode.ReadOnly, Pooling = false, DefaultTimeout = 15 }.ToString()))
            {
                c.Open();
                using var cmd = c.CreateCommand();
                cmd.CommandText = "PRAGMA busy_timeout=15000; VACUUM INTO $p";
                cmd.Parameters.AddWithValue("$p", tmp);
                cmd.ExecuteNonQuery();
            }
            if (File.Exists(today)) return null; // 別台剛好先做好（NAS 上三台同時開會搶）
            try { File.Move(tmp, today); }
            catch (Exception) when (File.Exists(today)) { return null; }
            }
            finally
            {
                // NAS 實測：搶輸的那台在網路磁碟上會拿到「存取被拒」而不是 IOException，暫存檔會留下來——一律自己清掉
                try { if (File.Exists(tmp)) File.Delete(tmp); } catch (Exception) { }
            }
            foreach (var f in Directory.GetFiles(backupDir, "activity_????????.db").OrderByDescending(f => f).Skip(keep))
                if (!Path.GetFileNameWithoutExtension(f).EndsWith("01")) File.Delete(f);
            return null;
        }
        catch (Exception ex) { return ex.Message; }
    }
}
