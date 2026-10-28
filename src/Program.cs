using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace DshSnap;

/// <summary>
/// 全屏截屏遮罩：冻结屏幕 + 自己画暗层 + 框选。
/// 不用窗体 Opacity，避免底层文字透上来变成虚影。
/// </summary>
internal sealed class MaskForm : Form
{
    private readonly Bitmap _screen;
    private Rectangle _selection = Rectangle.Empty;
    private Point _start = Point.Empty;
    private bool _selecting;
    private bool _done;
    private readonly int _shownAt = Environment.TickCount;

    private const int DimAlpha = 150;
    private const int GraceMs = 220; // 显示后这段时间内的鼠标抬起一律忽略（防误触）

    public MaskForm(Bitmap screen, Rectangle bounds)
    {
        _screen = screen;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        Bounds = bounds;
        ShowInTaskbar = false;
        TopMost = true;
        Opacity = 1.0;
        BackColor = Color.Black;
        Cursor = Cursors.Cross;

        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
        DoubleBuffered = true;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;

        g.DrawImage(_screen, new Rectangle(Point.Empty, ClientSize));
        using (var dim = new SolidBrush(Color.FromArgb(DimAlpha, 0, 0, 0)))
            g.FillRectangle(dim, ClientRectangle);

        if (_selection.Width <= 0 || _selection.Height <= 0) return;

        // 选区恢复亮度
        g.SetClip(_selection);
        g.DrawImage(_screen, new Rectangle(Point.Empty, ClientSize));
        g.ResetClip();

        using var pen = new Pen(Color.FromArgb(79, 110, 247), 2f);
        g.DrawRectangle(pen, _selection);

        // 尺寸提示
        using var font = new Font("Segoe UI", 9f);
        var label = $"{_selection.Width} × {_selection.Height}";
        var size = g.MeasureString(label, font);
        var box = new RectangleF(_selection.Right - size.Width - 10, _selection.Bottom + 6, size.Width + 12, size.Height + 6);
        if (box.Bottom > ClientSize.Height) box.Y = _selection.Bottom - size.Height - 14;
        if (box.X < 0) box.X = 0;
        using (var bg = new SolidBrush(Color.FromArgb(210, 0, 0, 0)))
            g.FillRectangle(bg, box);
        using (var fg = new SolidBrush(Color.White))
            g.DrawString(label, font, fg, box.X + 6, box.Y + 3);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left || _done) return;
        if (Environment.TickCount - _shownAt < GraceMs) return; // 忽略误触
        _selecting = true;
        _start = e.Location;
        _selection = new Rectangle(_start, Size.Empty);
        Invalidate();
        base.OnMouseDown(e);
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (!_selecting || _done) return;
        var x = Math.Min(_start.X, e.X);
        var y = Math.Min(_start.Y, e.Y);
        _selection = new Rectangle(x, y, Math.Abs(e.X - _start.X), Math.Abs(e.Y - _start.Y));
        Invalidate();
        base.OnMouseMove(e);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        if (!_selecting || _done) { base.OnMouseUp(e); return; }
        _selecting = false;

        // 尺寸太小视为误点：不退出，继续等待真正的框选
        if (_selection.Width < 4 || _selection.Height < 4)
        {
            _selection = Rectangle.Empty;
            Invalidate();
            base.OnMouseUp(e);
            return;
        }

        _done = true;
        Hide();
        try
        {
            using (var crop = _screen.Clone(_selection, _screen.PixelFormat))
                crop.Save(OutPath(), ImageFormat.Png);
            WriteResult(true);
        }
        finally
        {
            Application.Exit();
        }
        base.OnMouseUp(e);
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Escape)
        {
            Cancel();
        }
        base.OnKeyDown(e);
    }

    private void Cancel()
    {
        _done = true;
        try { File.Delete(OutPath()); } catch { }
        WriteResult(false);
        Application.Exit();
    }

    private static string SnapDir()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".dsh", "snap");
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static string OutPath() => Path.Combine(SnapDir(), "snap.png");

    /// <summary>直接写结果文件，不再依赖 HTTP 通知（应用端口会变）。</summary>
    private static void WriteResult(bool ready)
    {
        try
        {
            File.WriteAllText(Path.Combine(SnapDir(), "result.json"), "{\"ready\":" + (ready ? 1 : 0) + "}");
        }
        catch { /* silent */ }
    }
}

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        // 必须在任何窗口/屏幕查询之前声明 DPI 感知，否则 150% 缩放下只截到左上角
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        KillStaleInstances();

        // 等鼠标左键完全松开，避免"点按钮那一下"被当成框选结束
        for (var i = 0; i < 60 && (Control.MouseButtons & MouseButtons.Left) != 0; i++)
            Thread.Sleep(20);

        Thread.Sleep(120); // 让页面把按钮的按下态收掉

        var bounds = SystemInformation.VirtualScreen;
        var screenBmp = new Bitmap(bounds.Width, bounds.Height);
        using (var g = Graphics.FromImage(screenBmp))
            g.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size);

        using var mask = new MaskForm(screenBmp, bounds);
        Application.Run(mask);
    }

    /// <summary>清掉上一次没退干净的遮罩，否则它会一直盖在屏幕上、挡住后续点击。</summary>
    private static void KillStaleInstances()
    {
        try
        {
            foreach (var p in Process.GetProcessesByName("DshSnap"))
            {
                if (p.Id == Environment.ProcessId) continue;
                try { p.Kill(); p.WaitForExit(800); } catch { }
            }
        }
        catch { }
    }
}