// Запускает «Режим ИИ» Google Поиска (Gemini) в отдельном окне Microsoft Edge.
// Расширение (extension\) вшито в Gemini.exe, поэтому для установки достаточно одного файла:
// скачанный exe копирует себя в %LOCALAPPDATA%\Programs\Gemini, распаковывает туда расширение
// и кладёт ярлыки Gemini на рабочий стол и в меню «Пуск».
// Если рядом с exe уже есть папка extension\ (папка из git), всё берётся из неё, как раньше.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

[assembly: AssemblyTitle("Gemini")]
[assembly: AssemblyProduct("Gemini Voice Desktop")]
[assembly: AssemblyVersion("1.0.4.0")]

static class Launcher
{
    const string Url = "https://www.google.com/search?udm=50"; // «Режим ИИ» Google Поиска (Gemini)
    // AppUserModelID, который Edge даёт окну с этим адресом и папкой профиля «profile» (проверено в Edge 154).
    const string AppId = "MSEdge.www.googleom_/search.profile.Default";

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern bool DeleteFile(string path);

    [STAThread]
    static void Main()
    {
        string[] candidates =
        {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) + @"\Microsoft\Edge\Application\msedge.exe",
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) + @"\Microsoft\Edge\Application\msedge.exe",
        };
        string edge = Array.Find(candidates, File.Exists);
        if (edge == null)
        {
            MessageBox.Show("Microsoft Edge не найден. Установите его с microsoft.com/edge.", "Gemini",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        string exe = Assembly.GetExecutingAssembly().Location;
        string dir = Path.GetDirectoryName(exe);
        bool portable = File.Exists(Path.Combine(dir, @"extension\manifest.json"));
        if (!portable)
        {
            dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Gemini");
            exe = Install(exe, dir);
        }

        // Отдельный профиль: окно всегда отдельный процесс Edge, иначе --load-extension
        // игнорируется, когда обычный Edge уже открыт.
        // Ярлыки создаются при каждом запуске, если их нет или они ведут не сюда.
        // Пока страница грузится, Edge показывает на панели задач свой значок. Если у ярлыков тот же
        // AppUserModelID, что у окна, Windows сразу берёт значок из ярлыка, поэтому ID ставится до запуска Edge.
        string[] shortcuts = portable
            ? new[] { Path.Combine(dir, "Gemini.lnk"), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Gemini.lnk") }
            : new[] { Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Gemini.lnk"), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Gemini.lnk") };
        foreach (string lnk in shortcuts)
        {
            EnsureShortcut(lnk, exe, dir);
            SetShortcutAppId(lnk, AppId);
        }

        string args = string.Format(
            "--user-data-dir=\"{0}\" --load-extension=\"{1}\" --no-first-run --no-default-browser-check --app={2}",
            Path.Combine(dir, "profile"), Path.Combine(dir, "extension"), Url);
        Process browser = Process.Start(new ProcessStartInfo(edge, args) { UseShellExecute = false, WorkingDirectory = dir });

        // ID окна задаёт Edge; если в новой версии Edge он другой, берём его с открывшегося окна.
        string appId = WaitForAppId(browser);
        if (appId != null)
            foreach (string lnk in shortcuts) SetShortcutAppId(lnk, appId);
    }

    // Копирует exe в папку dir (если запущен не оттуда) и распаковывает вшитое расширение.
    // Возвращает путь к exe, на который вести ярлыки.
    static string Install(string exe, string dir)
    {
        Directory.CreateDirectory(Path.Combine(dir, "extension"));
        string target = Path.Combine(dir, "Gemini.exe");
        if (!string.Equals(exe, target, StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                File.Copy(exe, target, true);
                // метка «скачано из интернета» уже проверена при этом запуске, копии она не нужна
                DeleteFile(target + ":Zone.Identifier");
            }
            catch
            {
                // установленная копия занята или недоступна: работаем с тем exe, что есть
                if (!File.Exists(target)) target = exe;
            }
        }

        // Расширение перезаписывается при каждом запуске, чтобы после обновления exe оно было новым.
        Assembly asm = Assembly.GetExecutingAssembly();
        foreach (string name in asm.GetManifestResourceNames())
        {
            if (!name.StartsWith("extension/")) continue;
            string path = Path.Combine(dir, name.Replace('/', '\\'));
            using (Stream src = asm.GetManifestResourceStream(name))
            using (FileStream dst = File.Create(path))
                src.CopyTo(dst);
        }
        return target;
    }

    // Кладёт ярлык path на exe.
    // Ярлык хранит полный путь, поэтому создаётся на месте и обновляется, если exe переехал.
    static void EnsureShortcut(string path, string exe, string dir)
    {
        try
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(shellType);
            object lnk = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
            Type t = lnk.GetType();
            string current = (string)t.InvokeMember("TargetPath", BindingFlags.GetProperty, null, lnk, null);
            if (File.Exists(path) && string.Equals(current, exe, StringComparison.OrdinalIgnoreCase)) return;
            t.InvokeMember("TargetPath", BindingFlags.SetProperty, null, lnk, new object[] { exe });
            t.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, lnk, new object[] { dir });
            t.InvokeMember("IconLocation", BindingFlags.SetProperty, null, lnk, new object[] { exe + ",0" });
            t.InvokeMember("Description", BindingFlags.SetProperty, null, lnk, new object[] { "Gemini" });
            t.InvokeMember("Save", BindingFlags.InvokeMethod, null, lnk, null);
        }
        catch
        {
            // ярлык — удобство, без него приложение работает
        }
    }

    // --- AppUserModelID: по нему панель задач связывает окно с ярлыком и берёт значок из ярлыка ---

    static readonly Guid AppUserModelProps = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
    const uint AppUserModelIdPid = 5;

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    struct PropertyKey { public Guid FormatId; public uint PropertyId; }

    [StructLayout(LayoutKind.Explicit)]
    struct PropVariant { [FieldOffset(0)] public ushort VarType; [FieldOffset(8)] public IntPtr Pointer; [FieldOffset(16)] public IntPtr Pointer2; }
    const ushort VT_LPWSTR = 31;

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore
    {
        void GetCount(out uint count);
        void GetAt(uint index, out PropertyKey key);
        void GetValue(ref PropertyKey key, out PropVariant value);
        void SetValue(ref PropertyKey key, ref PropVariant value);
        void Commit();
    }

    [ComImport, Guid("0000010b-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPersistFile
    {
        void GetClassID(out Guid classId);
        [PreserveSig] int IsDirty();
        void Load([MarshalAs(UnmanagedType.LPWStr)] string fileName, uint mode);
        void Save([MarshalAs(UnmanagedType.LPWStr)] string fileName, bool remember);
        void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string fileName);
        void GetCurFile(out IntPtr fileName);
    }

    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    class ShellLink { }

    delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr param);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, out IPropertyStore store);
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropVariant value);

    static string ReadAppId(IPropertyStore store)
    {
        PropertyKey key = new PropertyKey { FormatId = AppUserModelProps, PropertyId = AppUserModelIdPid };
        PropVariant value;
        store.GetValue(ref key, out value);
        string id = value.VarType == VT_LPWSTR ? Marshal.PtrToStringUni(value.Pointer) : null;
        PropVariantClear(ref value);
        return string.IsNullOrEmpty(id) ? null : id;
    }

    // Ждёт (до 20 с) окно запущенного Edge и возвращает его AppUserModelID.
    // Если Edge с этим профилем уже был открыт, новый процесс сразу завершается — тогда null.
    static string WaitForAppId(Process browser)
    {
        if (browser == null) return null;
        uint pid = (uint)browser.Id;
        Guid iid = typeof(IPropertyStore).GUID;
        for (int i = 0; i < 200; i++)
        {
            string found = null;
            EnumWindows((hwnd, _) =>
            {
                uint owner;
                GetWindowThreadProcessId(hwnd, out owner);
                if (owner != pid || !IsWindowVisible(hwnd)) return true;
                IPropertyStore store;
                if (SHGetPropertyStoreForWindow(hwnd, ref iid, out store) != 0) return true;
                try { found = ReadAppId(store); } catch { }
                finally { Marshal.ReleaseComObject(store); }
                return found == null;
            }, IntPtr.Zero);
            if (found != null) return found;
            if (browser.HasExited) return null;
            System.Threading.Thread.Sleep(100);
        }
        return null;
    }

    // Записывает AppUserModelID в ярлык, если там другой.
    static void SetShortcutAppId(string path, string appId)
    {
        if (!File.Exists(path)) return;
        object link = null;
        try
        {
            link = new ShellLink();
            ((IPersistFile)link).Load(path, 2 /* STGM_READWRITE */);
            IPropertyStore store = (IPropertyStore)link;
            if (ReadAppId(store) == appId) return;
            PropertyKey key = new PropertyKey { FormatId = AppUserModelProps, PropertyId = AppUserModelIdPid };
            PropVariant value = new PropVariant { VarType = VT_LPWSTR, Pointer = Marshal.StringToCoTaskMemUni(appId) };
            try { store.SetValue(ref key, ref value); store.Commit(); }
            finally { Marshal.FreeCoTaskMem(value.Pointer); }
            ((IPersistFile)link).Save(path, true);
        }
        catch
        {
            // без ID ярлык работает, просто при запуске мелькнёт значок Edge
        }
        finally
        {
            if (link != null) Marshal.ReleaseComObject(link);
        }
    }
}
