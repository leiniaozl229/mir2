using System.Drawing;
using System.Windows.Forms;

internal sealed class LoginTextOverlay : IDisposable
{
    private readonly Thread _thread;
    private readonly ManualResetEventSlim _ready = new(false);
    private LoginTextForm? _form;

    public LoginTextOverlay(int processId, string settingsPath)
    {
        _thread = new Thread(() =>
        {
            try
            {
                Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
                _form = new LoginTextForm(processId, () =>
                {
                    var panel = new HelperControlPanel(processId, settingsPath);
                    panel.Show();
                    _form!.FormClosed += (_, _) =>
                    {
                        panel.Close();
                    };
                    _ready.Set();
                });
                Application.Run(_form);
            }
            catch (Exception error)
            {
                Console.Error.WriteLine($"Login text overlay unavailable: {error.GetType().Name}.");
                _ready.Set();
            }
        }) { IsBackground = true, Name = "Mir login text overlay" };
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();
        _ready.Wait(TimeSpan.FromSeconds(5));
    }

    public void Dispose()
    {
        var form = _form;
        if (form is { IsHandleCreated: true })
        {
            try
            {
                form.BeginInvoke(new Action(form.Close));
            }
            catch (InvalidOperationException)
            {
                // The game and the overlay may close at the same time.
            }
        }
        _thread.Join(TimeSpan.FromSeconds(2));
        _ready.Dispose();
    }
}

internal sealed class LoginTextForm : Form
{
    private readonly int _processId;
    private readonly System.Windows.Forms.Timer _timer;
    private (NativeWindow.Rect bounds, string text)[] _fields = [];
    private bool _initialShown;
    private bool _reportedError;

    public LoginTextForm(int processId, Action ready)
    {
        _processId = processId;
        AutoScaleMode = AutoScaleMode.None;
        BackColor = Color.Fuchsia;
        TransparencyKey = Color.Fuchsia;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        Location = new Point(-10000, -10000);
        Size = new Size(137, 48);
        Font = new Font("Tahoma", 9, FontStyle.Regular, GraphicsUnit.Point);
        DoubleBuffered = true;
        Shown += (_, _) =>
        {
            if (_initialShown) return;
            _initialShown = true;
            Hide();
            ready();
        };
        _timer = new System.Windows.Forms.Timer { Interval = 100 };
        _timer.Tick += (_, _) => RefreshFields();
        _timer.Start();
        FormClosed += (_, _) => _timer.Dispose();
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;
            parameters.ExStyle |= 0x00000020 | 0x00000080 | 0x08000000;
            return parameters;
        }
    }

    private void RefreshFields()
    {
        try
        {
            var main = NativeWindow.FindMainWindow(_processId);
            if (main == IntPtr.Zero || !NativeWindow.IsForeground(main))
            {
                Hide();
                return;
            }

            var fields = NativeWindow.ReadInputFields(main);
            if (fields.Length == 0)
            {
                Hide();
                return;
            }

            var first = fields[0].bounds;
            if (fields.Length == 2)
            {
                var second = fields[1].bounds;
                if (Math.Abs(first.Left - second.Left) > 8 || second.Top - first.Top > 48)
                {
                    Hide();
                    return;
                }
            }
            else
            {
                // Character creation uses one TEdit in the upper half of the
                // 800x600 scene. Do not cover the in-game chat input below it.
                var origin = new NativeWindow.Point();
                if (!NativeWindow.ClientToScreen(main, ref origin) ||
                    !NativeWindow.GetClientRect(main, out var client) ||
                    first.Top - origin.Y < 0 || first.Top - origin.Y > client.Bottom / 2 ||
                    first.Left - origin.X < 0 || first.Right - origin.X > client.Right ||
                    first.Bottom - first.Top > 40)
                {
                    Hide();
                    return;
                }
            }

            var bounds = Rectangle.FromLTRB(fields.Min(field => field.bounds.Left),
                fields.Min(field => field.bounds.Top), fields.Max(field => field.bounds.Right),
                fields.Max(field => field.bounds.Bottom));
            var changed = Bounds != bounds || _fields.Length != fields.Length ||
                !_fields.Zip(fields).All(pair => pair.First.text == pair.Second.text);
            _fields = fields;
            if (Bounds != bounds) Bounds = bounds;
            if (!Visible) Show();
            if (changed) Invalidate();
        }
        catch (Exception error)
        {
            Hide();
            if (_reportedError) return;
            _reportedError = true;
            Console.Error.WriteLine($"Login text overlay refresh failed: {error.GetType().Name}.");
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.Clear(Color.Fuchsia);
        foreach (var field in _fields)
        {
            DrawField(e.Graphics, field.bounds, field.text);
        }
    }

    private void DrawField(Graphics graphics, NativeWindow.Rect field, string value)
    {
        var rectangle = new Rectangle(field.Left - Left, field.Top - Top,
            field.Right - field.Left, field.Bottom - field.Top);
        graphics.FillRectangle(Brushes.Black, rectangle);
        TextRenderer.DrawText(graphics, value, Font, rectangle, Color.White, Color.Black,
            TextFormatFlags.NoPadding | TextFormatFlags.SingleLine | TextFormatFlags.VerticalCenter |
            TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
    }
}
