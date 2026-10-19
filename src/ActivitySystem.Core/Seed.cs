using Microsoft.Data.Sqlite;
using static ActivitySystem.Core.Db;

namespace ActivitySystem.Core;

/// <summary>
/// 建立新資料庫：三個帳號、書信公版預設值；加 demo＝放入示範用的虛構場次與名冊（原型驗收用，正式上線用空庫）。
/// </summary>
public static class Seed
{
    public static readonly (string Key, string Title, string Subject, string Body)[] DefaultTemplates =
    {
        ("mail.lecturer", "講師邀請信", "【講師邀請】{{日期}} {{地點}} {{方案}}",
         "{{對象}}講師您好：\n\n我們已約好 {{日期長}} {{時間}} 在 {{地點}} 進行{{方案}}（主題：{{主題}}），預計時數與費用如附件，並請您於 {{回覆期限長}} 以前回覆並給予您的簡報。\n\n如果您當天確認可出席並能接受本中心費用，{{確認方式}}\n\n承辦社工 {{承辦}}　{{承辦電話}}"),
        ("mail.venue", "場地確認信", "【場地確認】{{日期}} {{地點}} 宣導場地借用",
         "{{對象}}您好：\n\n延續電話中的討論，本方案預定於 {{日期長}} {{時間}} 借用貴單位場地辦理{{方案}}（約 {{預估人數}} 人），需要投影設備與麥克風。請於 {{回覆期限長}} 以前確認場地可使用，{{確認方式}}\n\n承辦社工 {{承辦}}　{{承辦電話}}"),
        ("mail.partner", "協辦確認信", "【協辦確認】{{日期}} {{方案}}｜{{地點}}",
         "{{對象}}您好：\n\n延續電話中的討論，本方案預定於 {{日期長}} {{時間}} 與貴單位合作辦理{{方案}}，講師為 {{講師}}。請於 {{回覆期限長}} 以前確認協辦與當天聯繫窗口，{{確認方式}}\n\n承辦社工 {{承辦}}　{{承辦電話}}"),
        ("mail.remind", "提醒信", "【提醒】{{原主旨}}",
         "{{對象}}您好：\n\n先前寄出的「{{原主旨}}」尚未收到您的回覆，再麻煩您確認，{{確認方式}}\n\n謝謝！\n承辦社工 {{承辦}}　{{承辦電話}}"),
    };

    /// <summary>names：三個帳號的顯示名稱（督導、社工一、社工二），安裝時由參數帶入；名字不寫死在程式裡。</summary>
    public static void Init(Db db, bool demo, string[]? names = null)
    {
        names = names is { Length: 3 } ? names : new[] { "督導", "社工一", "社工二" };
        db.EnsureSchema();
        using var c = db.Open();
        using var tx = c.BeginTransaction();
        if (Convert.ToInt64(Scalar(c, tx, "SELECT COUNT(*) FROM users") ?? 0L) == 0)
        {
            var now = Now();
            foreach (var (u, n, r, t, e) in new[]
            {
                ("supervisor", names[0], "supervisor", "督導", "supervisor@demo-mail.tw"),
                ("worker1", names[1], "staff", "社工", "worker1@demo-mail.tw"),
                ("worker2", names[2], "staff", "社工", "worker2@demo-mail.tw"),
            })
                Run(c, tx, "INSERT INTO users(username,display_name,role,title,email,phone,created_at,updated_at) VALUES($u,$n,$r,$t,$e,'(037)000-215',$a,$a)",
                    ("$u", u), ("$n", n), ("$r", r), ("$t", t), ("$e", e), ("$a", now));
        }
        foreach (var (k, t, s, b) in DefaultTemplates)
            Run(c, tx, "INSERT OR IGNORE INTO templates(key,title,subject,body,updated_at,updated_by) VALUES($k,$t,$s,$b,$a,'系統')", ("$k", k), ("$t", t), ("$s", s), ("$b", b), ("$a", Now()));
        foreach (var (k, v) in new[]
        {
            ("org_name", "兒少性不當對待防治方案"), ("goal_sessions", "15"), ("goal_people", "1500"), ("goal_rural", "1"),
            ("goal:校園宣導", "10"), ("goal:社區宣導", "3"), ("goal:網路宣導", "2"), ("goal:親職講座", "2"),
            ("rural_towns", "南庄鄉,泰安鄉,獅潭鄉"), ("fee_per_hour", "2000"), ("due_days_before", "3"),
            ("confirm_method", "請直接回覆本信「確定出席」，我們收到後會在系統標記。"), ("sync_seconds", "6"),
        })
            Run(c, tx, "INSERT OR IGNORE INTO settings(key,value) VALUES($k,$v)", ("$k", k), ("$v", v));
        foreach (var (kind, list) in new[]
        {
            ("prog", new[] { "校園宣導", "社區宣導", "網路宣導", "親職講座" }),
            ("audience", new[] { "學生", "家長", "里民", "教職員", "網路觀眾" }),
            ("topic", new[] { "身體界線與求助", "網路交友與數位安全", "兒少保護與通報", "陪孩子談身體自主權" }),
        })
            for (var i = 0; i < list.Length; i++)
                Run(c, tx, "INSERT OR IGNORE INTO registry(kind,name,sort,created_at,created_by) VALUES($k,$n,$s,$t,'系統')", ("$k", kind), ("$n", list[i]), ("$s", i), ("$t", Now()));
        if (demo && Convert.ToInt64(Scalar(c, tx, "SELECT COUNT(*) FROM sessions") ?? 0L) == 0) Demo(c, tx, names[1]);
        // 示範模式：尚未接上的功能（確認連結、報名表與回饋單、AI 辨識）用模擬按鈕與假資料展示；督導可在設定關閉
        if (demo) Run(c, tx, "INSERT INTO settings(key,value) VALUES('demo_mode','1') ON CONFLICT(key) DO UPDATE SET value='1'");
        Run(c, tx, "INSERT INTO change_log(at,user_name,table_name,action,summary) VALUES($a,'系統','settings','init',$s)", ("$a", Now()), ("$s", demo ? "建立資料庫（含示範資料）" : "建立資料庫"));
        tx.Commit();
    }

    static void Demo(SqliteConnection c, SqliteTransaction tx, string closer)
    {
        var now = Now();
        var ids = new Dictionary<string, long>();
        void Org(string key, string type, string org, string town, (string person, string title, string phone, string email) a, (string person, string title, string phone, string email)? v = null)
        {
            ids[key + "a"] = Insert(c, tx, "INSERT INTO contacts(type,org,person,title,phone,email,town,created_at,created_by,updated_at,updated_by) VALUES($ty,$o,$p,$t,$ph,$e,$tw,$a,'系統',$a,'系統')",
                ("$ty", type), ("$o", org), ("$p", a.person), ("$t", a.title), ("$ph", a.phone), ("$e", a.email), ("$tw", town), ("$a", now));
            ids[key + "v"] = v is null ? ids[key + "a"] : Insert(c, tx, "INSERT INTO contacts(type,org,person,title,phone,email,town,created_at,created_by,updated_at,updated_by) VALUES('場地',$o,$p,$t,$ph,$e,$tw,$a,'系統',$a,'系統')",
                ("$o", org), ("$p", v.Value.person), ("$t", v.Value.title), ("$ph", v.Value.phone), ("$e", v.Value.email), ("$tw", town), ("$a", now));
        }
        Org("c1", "學校", "頭份市晴川國小", "頭份市", ("吳主任", "輔導主任", "(037)000-611", "fudao@qingchuan.demo-mlc.edu.tw"), ("林組長", "總務處事務組長", "(037)000-612", "general@qingchuan.demo-mlc.edu.tw"));
        Org("c2", "學校", "苗栗市文華國小", "苗栗市", ("劉組長", "輔導組長", "(037)000-342", "counsel@wenhua.demo-mlc.edu.tw"), ("高主任", "總務主任", "(037)000-343", "general@wenhua.demo-mlc.edu.tw"));
        Org("c3", "學校", "竹南鎮濱海國中", "竹南鎮", ("鄭主任", "輔導主任", "(037)000-478", "guide@binhai.demo-mlc.edu.tw"), ("彭組長", "設備組長", "(037)000-479", "general@binhai.demo-mlc.edu.tw"));
        Org("c4", "社區單位", "頭份市新苗社區發展協會", "頭份市", ("彭總幹事", "總幹事", "(037)000-590", "xinmiao@demo-community.tw"));
        Org("c5", "學校", "後龍鎮海風國中", "後龍鎮", ("蘇主任", "學務主任", "(037)000-723", "stu@haifeng.demo-mlc.edu.tw"), ("謝組長", "總務處事務組長", "(037)000-724", "general@haifeng.demo-mlc.edu.tw"));
        Org("c6", "學校", "公館鄉麥穗國中", "公館鄉", ("江主任", "輔導主任", "(037)000-265", "fudao@maisui.demo-mlc.edu.tw"), ("徐主任", "總務主任", "(037)000-266", "general@maisui.demo-mlc.edu.tw"));
        Org("c7", "學校", "通霄鎮白沙國中", "通霄鎮", ("葉組長", "輔導組長", "(037)000-819", "counsel@baisha.demo-mlc.edu.tw"), ("曾組長", "總務處事務組長", "(037)000-820", "general@baisha.demo-mlc.edu.tw"));
        Org("c8", "學校", "苑裡鎮藺草國小", "苑裡鎮", ("許組長", "學務組長", "(037)000-157", "stu@lincao.demo-mlc.edu.tw"), ("郭主任", "總務主任", "(037)000-158", "general@lincao.demo-mlc.edu.tw"));
        Org("c9", "社區單位", "三義鄉木雕社區發展協會", "三義鄉", ("邱理事長", "理事長", "(037)000-904", "mudiao@demo-community.tw"));
        Org("c10", "學校", "卓蘭鎮果香國小", "卓蘭鎮", ("詹主任", "輔導主任", "(04)000-2581", "fudao@guoxiang.demo-mlc.edu.tw"), ("羅組長", "總務處事務組長", "(04)000-2582", "general@guoxiang.demo-mlc.edu.tw"));
        Org("c11", "學校", "南庄鄉雲谷國小", "南庄鄉", ("陳主任", "教導主任", "(037)000-836", "edu@yungu.demo-mlc.edu.tw"), ("黃幹事", "總務幹事", "(037)000-837", "general@yungu.demo-mlc.edu.tw"));
        Org("c12", "網路平台", "方案粉絲專頁直播", "線上", ("承辦自管", "", "", ""));
        long L(string name, string title, string phone, string email) => Insert(c, tx, "INSERT INTO contacts(type,org,person,title,phone,email,created_at,created_by,updated_at,updated_by) VALUES('講師',$o,$o,$t,$p,$e,$a,'系統',$a,'系統')",
            ("$o", name), ("$t", title), ("$p", phone), ("$e", email), ("$a", now));
        var l1 = L("張靜宜", "講師・性別平等教育", "(037)000-118", "jingyi@demo-mail.tw");
        var l2 = L("黃志明", "講師・數位安全", "(037)000-264", "zhiming@demo-mail.tw");
        var l3 = L("李佩珊", "諮商心理師・親職", "(037)000-381", "peishan@demo-mail.tw");

        long S(string code, string prog, string topic, string aud, string date, string st, string et, double h, string c0, long lect, int target, long owner,
            int? m = null, int? f = null, int? reach = null, int on = 0, int pa = 0, int[]? sat = null, int? pre = null, int? post = null, bool closed = false, string flags = "")
        {
            sat ??= new int[5];
            var id = Insert(c, tx, """
                INSERT INTO sessions(code,year,prog,topic,audience,date,start_time,end_time,hours,venue_id,partner_id,lecturer_id,owner_user_id,target,
                  male,female,reach,online_fb,paper_fb,sat1,sat2,sat3,sat4,sat5,pre_rate,post_rate,flags,attended_at,closed_at,closed_by,created_at,created_by,updated_at,updated_by)
                VALUES($code,115,$prog,$topic,$aud,$date,$st,$et,$h,$v,$p,$l,$o,$t,$m,$f,$r,$on,$pa,$s1,$s2,$s3,$s4,$s5,$pre,$post,$fl,$att,$cl,$clb,$a,'系統',$a,'系統')
                """,
                ("$code", code), ("$prog", prog), ("$topic", topic), ("$aud", aud), ("$date", date), ("$st", st), ("$et", et), ("$h", h),
                ("$v", ids[c0 + "v"]), ("$p", ids[c0 + "a"]), ("$l", lect), ("$o", owner), ("$t", target), ("$m", m), ("$f", f), ("$r", reach),
                ("$on", on), ("$pa", pa), ("$s1", sat[0]), ("$s2", sat[1]), ("$s3", sat[2]), ("$s4", sat[3]), ("$s5", sat[4]), ("$pre", pre), ("$post", post), ("$fl", flags),
                ("$att", m is not null || reach is not null ? date + " 16:00:00" : null), ("$cl", closed ? date + " 17:00:00" : null), ("$clb", closed ? closer : null), ("$a", now));
            foreach (var role in new[] { "venue", "partner", "lecturer" })
            {
                var done = m is not null || reach is not null;
                Run(c, tx, "INSERT INTO confirmations(session_id,role,state,sent_at,confirmed_at,confirmed_via,updated_at,updated_by) VALUES($s,$r,$st,$sa,$ca,$via,$a,'系統')",
                    ("$s", id), ("$r", role), ("$st", done ? "confirmed" : "none"), ("$sa", done ? date + " 09:00:00" : null), ("$ca", done ? date + " 09:00:00" : null), ("$via", done ? "回信" : ""), ("$a", now));
            }
            if (closed)
            {
                for (var i = 1; i <= 3; i++)
                    Run(c, tx, "INSERT INTO attachments(session_id,kind,file_name,rel_path,size,sort,uploaded_at,uploaded_by) VALUES($s,'photo',$f,'',0,$o,$a,'系統')",
                        ("$s", id), ("$f", $"示範照片_{i}.jpg（舊資料，無檔案）"), ("$o", i), ("$a", now));
                Run(c, tx, "INSERT INTO attachments(session_id,kind,file_name,rel_path,size,uploaded_at,uploaded_by) VALUES($s,'sign','簽到表（舊資料，無檔案）','',0,$a,'系統')", ("$s", id), ("$a", now));
            }
            return id;
        }
        long w1 = 2, w2 = 3;
        S("A115-01", "校園宣導", "身體界線與求助", "學生", "2026-03-17", "09:10", "10:40", 1.5, "c1", l1, 240, w1, 126, 120, null, 80, 148, new[] { 0, 2, 14, 62, 150 }, 61, 87, true);
        S("A115-02", "校園宣導", "身體界線與求助", "學生", "2026-03-20", "13:30", "15:00", 1.5, "c2", l1, 260, w1, 130, 133, null, 96, 145, new[] { 1, 3, 18, 70, 149 }, 58, 86, true);
        S("A115-03", "校園宣導", "網路交友與數位安全", "學生", "2026-03-25", "10:10", "11:40", 1.5, "c3", l2, 100, w2, 54, 56, null, 104, 0, new[] { 0, 2, 9, 35, 58 }, 55, 84, true);
        S("A115-04", "社區宣導", "兒少保護與通報", "里民", "2026-04-02", "19:00", "20:30", 1.5, "c4", l3, 45, w2, 21, 27, null, 0, 41, new[] { 0, 0, 4, 15, 22 }, null, null, true);
        S("A115-05", "校園宣導", "網路交友與數位安全", "學生", "2026-04-16", "13:30", "15:00", 1.5, "c5", l2, 90, w1, 48, 44, null, 85, 0, new[] { 0, 1, 8, 30, 46 }, 60, 85, false);
        S("A115-06", "網路宣導", "認識性剝削與求助管道", "網路觀眾", "2026-04-20", "20:00", "20:40", 0.7, "c12", l2, 300, w2, null, null, 315, 0, 0, null, null, null, true, "人次算法待定");
        S("A115-07", "親職講座", "陪孩子談身體自主權", "家長", "2026-04-26", "09:00", "12:00", 3, "c6", l3, 40, w1, 9, 29, null, 0, 35, new[] { 0, 0, 2, 10, 23 }, null, null, true);
        S("A115-08", "校園宣導", "身體界線與求助", "學生", "2026-09-09", "10:10", "11:40", 1.5, "c10", l1, 140, w2, 71, 69, null, 60, 73, new[] { 0, 1, 10, 41, 81 }, 57, 88, true);
        S("A115-09", "社區宣導", "兒少保護與通報", "里民", "2026-10-07", "19:00", "20:30", 1.5, "c9", l3, 60, w1, 28, 34, null, 0, 55, new[] { 0, 0, 5, 19, 31 }, null, null, true);
        S("A115-10", "校園宣導", "身體界線與求助", "學生", "2026-11-13", "13:30", "15:00", 1.5, "c7", l1, 250, w1, pre: 58);
        S("A115-11", "校園宣導", "身體界線與求助", "學生", "2026-11-23", "09:10", "10:40", 1.5, "c1", l1, 240, w1);
        S("A115-12", "校園宣導", "網路交友與數位安全", "學生", "2026-11-26", "10:10", "11:40", 1.5, "c8", l2, 180, w2);
        S("A115-13", "親職講座", "陪孩子談身體自主權", "家長", "2026-12-05", "09:00", "12:00", 3, "c10", l3, 40, w2);
    }
}
