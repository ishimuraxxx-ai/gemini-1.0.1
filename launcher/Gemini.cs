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
[assembly: AssemblyVersion("1.0.3.0")]

static class Launcher
{
    const string Url = "https://www.google.com/search?udm=50"; // «Режим ИИ» Google Поиска (Gemini)

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
        string args = string.Format(
            "--user-data-dir=\"{0}\" --load-extension=\"{1}\" --no-first-run --no-default-browser-check --app={2}",
            Path.Combine(dir, "profile"), Path.Combine(dir, "extension"), Url);
        Process.Start(new ProcessStartInfo(edge, args) { UseShellExecute = false, WorkingDirectory = dir });

        // Ярлыки создаются при каждом запуске, если их нет или они ведут не сюда.
        if (portable) EnsureShortcut(dir, exe, dir);
        EnsureShortcut(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), exe, dir);
        if (!portable) EnsureShortcut(Environment.GetFolderPath(Environment.SpecialFolder.Programs), exe, dir);
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

    // Кладёт в папку folder ярлык Gemini.lnk на exe.
    // Ярлык хранит полный путь, поэтому создаётся на месте и обновляется, если exe переехал.
    static void EnsureShortcut(string folder, string exe, string dir)
    {
        try
        {
            string path = Path.Combine(folder, "Gemini.lnk");
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
}
