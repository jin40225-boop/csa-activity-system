using System.Text.Json;

namespace ActivitySystem.Core;

/// <summary>畫面送來的欄位（JSON 物件）。只有送來的欄位才會被改；沒送的維持原值。</summary>
public sealed class Fields
{
    readonly Dictionary<string, JsonElement> map = new(StringComparer.Ordinal);

    public static Fields Parse(string json)
    {
        var f = new Fields();
        if (string.IsNullOrWhiteSpace(json)) return f;
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Object) return f;
        foreach (var p in doc.RootElement.EnumerateObject()) f.map[p.Name] = p.Value.Clone();
        return f;
    }

    public static Fields Of(params (string Key, object? Value)[] pairs)
    {
        var dict = pairs.ToDictionary(p => p.Key, p => p.Value);
        return Parse(JsonSerializer.Serialize(dict, Db.JsonOpts));
    }

    public bool Has(string k) => map.ContainsKey(k);

    public string Str(string k)
    {
        if (!map.TryGetValue(k, out var v) || v.ValueKind == JsonValueKind.Null) return "";
        return (v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : v.GetRawText()).Trim();
    }

    public long? Long(string k)
    {
        var s = Str(k).Replace(",", "");
        return long.TryParse(s, out var n) ? n : null;
    }

    public double? Dbl(string k) => double.TryParse(Str(k), out var n) ? n : null;
}
