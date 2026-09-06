namespace Mir2.WebGateway;

public static class AccountRegistration
{
    public static byte[] EncodeBody(string account, string password)
    {
        byte[] primary =
        [
            ..Pascal(account, 10), ..Pascal(password, 10), ..Pascal("Local Player", 20), ..Pascal("", 14),
            ..Pascal("", 14), ..Pascal("local", 20), ..Pascal("personal", 12), ..Pascal("", 40)
        ];
        byte[] secondary =
        [
            ..Pascal("local", 20), ..Pascal("personal", 12), ..Pascal("2000-01-01", 10),
            ..Pascal("", 13), ..Pascal("", 20), ..Pascal("", 20)
        ];
        return [..LegacyCodec.Encode(primary), ..LegacyCodec.Encode(secondary)];
    }

    public static byte[] Pascal(string value, int capacity)
    {
        byte[] bytes = LegacyCodec.Gbk.GetBytes(value);
        if (bytes.Length > capacity) throw new InvalidDataException("Registration field exceeds capacity");
        byte[] result = new byte[capacity + 1];
        result[0] = (byte)bytes.Length;
        bytes.CopyTo(result, 1);
        return result;
    }
}
