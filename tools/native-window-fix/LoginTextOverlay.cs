using System.Drawing;
using System.Windows.Forms;

internal sealed class LoginTextOverlay : IDisposable
{
    private readonly Thread _thread;
    private readonly ManualResetEventSlim _ready = new(false);
    private LoginTextForm? _form;

    public LoginTextOverlay(int processId)
    {
        _thread = new Thread(() =>
        {
            try
            {
                Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
                _form = new LoginTextForm(processId, _ready.Set);
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
    private NativeWindow.Rect _first;
    private NativeWindow.Rect _second;
    private string _account = string.Empty;
    private string _passwordMask = string.Empty;
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

            var fields = NativeWindow.ReadLoginFields(main);
            if (fields.Length != 2)
            {
                Hide();
                return;
            }

            var first = fields[0].bounds;
            var second = fields[1].bounds;
            if (Math.Abs(first.Left - second.Left) > 8 || second.Top - first.Top > 48)
            {
                Hide();
                return;
            }

            var bounds = Rectangle.FromLTRB(Math.Min(first.Left, second.Left), first.Top,
                Math.Max(first.Right, second.Right), second.Bottom);
            var changed = Bounds != bounds || _account != fields[0].text ||
                _passwordMask != fields[1].text;
            _first = first;
            _second = second;
            _account = fields[0].text;
            _passwordMask = fields[1].text;
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
        DrawField(e.Graphics, _first, _account);
        DrawField(e.Graphics, _second, _passwordMask);
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
