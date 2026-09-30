using System.Drawing;
using System.Windows.Forms;

internal sealed class HelperControlPanel : Form
{
    private readonly int _processId;
    private readonly string _settingsPath;
    private readonly System.Windows.Forms.Timer _timer;
    private readonly Label _status;
    private readonly CheckBox _pickup;
    private readonly CheckBox _groundNames;
    private readonly CheckBox _monsterNames;
    private readonly CheckBox _monsterHealth;

    public bool GroundNamesEnabled => _groundNames.Checked;
    public bool MonsterNamesEnabled => _monsterNames.Checked;
    public bool MonsterHealthEnabled => _monsterHealth.Checked;

    public HelperControlPanel(int processId, string settingsPath)
    {
        _processId = processId;
        _settingsPath = settingsPath;
        Text = "传奇辅助设置";
        Font = new Font("Microsoft YaHei UI", 9);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        ControlBox = false;
        ShowInTaskbar = true;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        ClientSize = new Size(232, 200);
        BackColor = Color.FromArgb(35, 32, 27);
        ForeColor = Color.FromArgb(235, 218, 176);

        _pickup = new CheckBox
        {
            Text = "自动拾取脚下物品",
            AutoSize = true,
            Location = new Point(14, 16),
            Checked = ReadSetting("AutoPickup", false)
        };
        _status = new Label
        {
            Text = _pickup.Checked ? "已开启；走到掉落物格子时拾取" : "已关闭自动拾取",
            AutoSize = false,
            Location = new Point(14, 43),
            Size = new Size(205, 34),
            ForeColor = Color.LightGreen
        };
        _groundNames = new CheckBox
        {
            Text = "显示地面掉落物名称",
            AutoSize = true,
            Location = new Point(14, 79),
            Checked = ReadSetting("ShowGroundItemNames", true)
        };
        var scope = new Label
        {
            Text = "名称直接绘在游戏画面，不挡点击。",
            AutoSize = false,
            Location = new Point(14, 106),
            Size = new Size(205, 20)
        };
        _monsterNames = new CheckBox
        {
            Text = "显示怪物名称",
            AutoSize = true,
            Location = new Point(14, 135),
            Checked = ReadSetting("ShowMonsterNames", true)
        };
        _monsterHealth = new CheckBox
        {
            Text = "显示怪物血条（受击后）",
            AutoSize = true,
            Location = new Point(14, 162),
            Checked = ReadSetting("ShowMonsterHealth", true)
        };
        _pickup.CheckedChanged += OnPickupChanged;
        _groundNames.CheckedChanged += OnGroundNamesChanged;
        _monsterNames.CheckedChanged += OnGroundNamesChanged;
        _monsterHealth.CheckedChanged += OnGroundNamesChanged;
        Controls.AddRange([_pickup, _status, _groundNames, scope, _monsterNames, _monsterHealth]);
        _timer = new System.Windows.Forms.Timer { Interval = 300 };
        _timer.Tick += (_, _) => PlaceBesideGame();
        _timer.Start();
        FormClosed += (_, _) => _timer.Dispose();
    }

    protected override bool ShowWithoutActivation => true;

    private void OnPickupChanged(object? sender, EventArgs args)
    {
        try
        {
            WriteSettings();
            _status.Text = _pickup.Checked ? "已开启；走到掉落物格子时拾取" : "已关闭自动拾取";
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            _pickup.CheckedChanged -= OnPickupChanged;
            _pickup.Checked = !_pickup.Checked;
            _pickup.CheckedChanged += OnPickupChanged;
            _status.Text = $"保存失败：{error.Message}";
        }
    }

    private void OnGroundNamesChanged(object? sender, EventArgs args)
    {
        try
        {
            WriteSettings();
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            if (sender is CheckBox checkbox)
            {
                checkbox.CheckedChanged -= OnGroundNamesChanged;
                checkbox.Checked = !checkbox.Checked;
                checkbox.CheckedChanged += OnGroundNamesChanged;
            }
            _status.Text = $"保存失败：{error.Message}";
        }
    }

    private bool ReadSetting(string key, bool defaultValue)
    {
        try
        {
            foreach (var line in File.ReadLines(_settingsPath))
            {
                var parts = line.Split('=', 2);
                if (parts.Length == 2 && parts[0].Trim().Equals(key, StringComparison.OrdinalIgnoreCase))
                    return parts[1].Trim() == "1";
            }
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
        return defaultValue;
    }

    private void WriteSettings()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_settingsPath)!);
        var temporary = _settingsPath + ".tmp";
        File.WriteAllText(temporary,
            $"AutoPickup={(_pickup.Checked ? 1 : 0)}\n" +
            $"ShowGroundItemNames={(_groundNames.Checked ? 1 : 0)}\n" +
            $"ShowMonsterNames={(_monsterNames.Checked ? 1 : 0)}\n" +
            $"ShowMonsterHealth={(_monsterHealth.Checked ? 1 : 0)}\n");
        File.Move(temporary, _settingsPath, true);
    }

    private void PlaceBesideGame()
    {
        var main = NativeWindow.FindMainWindow(_processId);
        if (main == IntPtr.Zero || (!NativeWindow.IsForeground(main) && !NativeWindow.IsForeground(Handle)))
        {
            if (Visible) Hide();
            return;
        }
        if (!NativeWindow.GetWindowRect(main, out var game)) return;
        var area = Screen.FromHandle(main).WorkingArea;
        var left = game.Right + 8;
        if (left + Width > area.Right) left = game.Left - Width - 8;
        if (left < area.Left) left = Math.Max(area.Left, game.Right - Width);
        var top = Math.Clamp(game.Top, area.Top, Math.Max(area.Top, area.Bottom - Height));
        if (Location != new Point(left, top)) Location = new Point(left, top);
        if (!Visible) Show();
    }
}
