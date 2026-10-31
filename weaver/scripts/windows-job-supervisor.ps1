param()

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class LightWeaverJobRunner
{
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint CREATE_NO_WINDOW = 0x08000000;
    private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const int JobObjectBasicAccountingInformation = 1;
    private const int JobObjectExtendedLimitInformation = 9;
    private const uint STARTF_USESTDHANDLES = 0x00000100;
    private const uint HANDLE_FLAG_INHERIT = 0x00000001;
    private const uint WAIT_OBJECT_0 = 0;
    private const uint WAIT_FAILED = 0xFFFFFFFF;
    private const uint STD_OUTPUT_HANDLE = unchecked((uint)-11);
    private const uint STD_ERROR_HANDLE = unchecked((uint)-12);
    private const uint GENERIC_READ = 0x80000000;
    private const uint GENERIC_WRITE = 0x40000000;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint OPEN_EXISTING = 3;

    private static ManualResetEvent stop = new ManualResetEvent(false);

    [StructLayout(LayoutKind.Sequential)]
    private struct STARTUPINFO
    {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public ushort wShowWindow;
        public ushort cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SECURITY_ATTRIBUTES
    {
        public int nLength;
        public IntPtr lpSecurityDescriptor;
        public bool bInheritHandle;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION
    {
        public long TotalUserTime;
        public long TotalKernelTime;
        public long ThisPeriodTotalUserTime;
        public long ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount;
        public uint TotalProcesses;
        public uint ActiveProcesses;
        public uint TotalTerminatedProcesses;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        IntPtr information,
        uint informationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(
        IntPtr job,
        int informationClass,
        IntPtr information,
        uint informationLength,
        IntPtr returnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateJobObject(IntPtr job, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CreateProcessW(
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref STARTUPINFO startupInfo,
        out PROCESS_INFORMATION processInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForMultipleObjects(
        uint count,
        IntPtr[] handles,
        bool waitAll,
        uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetStdHandle(uint standardHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetHandleInformation(
        IntPtr handle,
        uint mask,
        uint flags);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateFileW(
        string fileName,
        uint desiredAccess,
        uint shareMode,
        ref SECURITY_ATTRIBUTES securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    private static Exception LastError(string operation)
    {
        return new Win32Exception(Marshal.GetLastWin32Error(), operation);
    }

    private static string QuoteArgument(string value)
    {
        if (value.Length > 0 && value.IndexOfAny(new char[] { ' ', '\t', '\n', '\v', '"' }) < 0)
            return value;
        StringBuilder result = new StringBuilder();
        result.Append('"');
        int backslashes = 0;
        foreach (char valueCharacter in value)
        {
            if (valueCharacter == '\\')
            {
                backslashes++;
                continue;
            }
            if (valueCharacter == '"')
            {
                result.Append('\\', backslashes * 2 + 1);
                result.Append('"');
                backslashes = 0;
                continue;
            }
            result.Append('\\', backslashes);
            backslashes = 0;
            result.Append(valueCharacter);
        }
        result.Append('\\', backslashes * 2);
        result.Append('"');
        return result.ToString();
    }

    private static string BuildCommandLine(string executable, string[] arguments)
    {
        StringBuilder commandLine = new StringBuilder(QuoteArgument(executable));
        foreach (string argument in arguments)
        {
            commandLine.Append(' ');
            commandLine.Append(QuoteArgument(argument));
        }
        return commandLine.ToString();
    }

    private static void WaitUntilJobIsEmpty(IntPtr job)
    {
        DateTime deadline = DateTime.UtcNow.AddSeconds(5);
        int size = Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION));
        IntPtr information = Marshal.AllocHGlobal(size);
        try
        {
            while (DateTime.UtcNow < deadline)
            {
                if (!QueryInformationJobObject(
                    job,
                    JobObjectBasicAccountingInformation,
                    information,
                    (uint)size,
                    IntPtr.Zero))
                    throw LastError("QueryInformationJobObject");
                JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting =
                    (JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)Marshal.PtrToStructure(
                        information,
                        typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION));
                if (accounting.ActiveProcesses == 0) return;
                Thread.Sleep(25);
            }
            throw new TimeoutException("Windows Job Object did not become empty");
        }
        finally
        {
            Marshal.FreeHGlobal(information);
        }
    }

    public static int Run(string executable, string[] arguments)
    {
        stop.Reset();
        Thread reader = new Thread(() =>
        {
            string line;
            while ((line = Console.In.ReadLine()) != null)
            {
                if (line.Trim().Equals("stop", StringComparison.OrdinalIgnoreCase))
                {
                    stop.Set();
                    return;
                }
            }
            stop.Set();
        });
        reader.IsBackground = true;
        reader.Start();

        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw LastError("CreateJobObject");
        PROCESS_INFORMATION process = new PROCESS_INFORMATION();
        IntPtr nul = IntPtr.Zero;
        bool processCreated = false;
        try
        {
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits =
                new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            limits.BasicLimitInformation.LimitFlags =
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            int limitsSize = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            IntPtr limitsPointer = Marshal.AllocHGlobal(limitsSize);
            try
            {
                Marshal.StructureToPtr(limits, limitsPointer, false);
                if (!SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    limitsPointer,
                    (uint)limitsSize))
                    throw LastError("SetInformationJobObject");
            }
            finally
            {
                Marshal.FreeHGlobal(limitsPointer);
            }

            SECURITY_ATTRIBUTES attributes = new SECURITY_ATTRIBUTES();
            attributes.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
            attributes.bInheritHandle = true;
            nul = CreateFileW(
                "NUL",
                GENERIC_READ | GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                ref attributes,
                OPEN_EXISTING,
                0,
                IntPtr.Zero);
            if (nul == IntPtr.Zero) throw LastError("CreateFileW(NUL)");

            IntPtr stdout = GetStdHandle(STD_OUTPUT_HANDLE);
            IntPtr stderr = GetStdHandle(STD_ERROR_HANDLE);
            if (stdout == IntPtr.Zero || stdout == new IntPtr(-1) ||
                stderr == IntPtr.Zero || stderr == new IntPtr(-1))
                throw new Win32Exception("监督进程缺少标准输出句柄");
            if (!SetHandleInformation(stdout, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT))
                throw LastError("SetHandleInformation(stdout)");
            if (!SetHandleInformation(stderr, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT))
                throw LastError("SetHandleInformation(stderr)");

            STARTUPINFO startup = new STARTUPINFO();
            startup.cb = Marshal.SizeOf(typeof(STARTUPINFO));
            startup.dwFlags = STARTF_USESTDHANDLES;
            startup.hStdInput = nul;
            startup.hStdOutput = stdout;
            startup.hStdError = stderr;
            StringBuilder commandLine = new StringBuilder(BuildCommandLine(executable, arguments));
            if (!CreateProcessW(
                null,
                commandLine,
                IntPtr.Zero,
                IntPtr.Zero,
                true,
                CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
                IntPtr.Zero,
                null,
                ref startup,
                out process))
                throw LastError("CreateProcessW");
            processCreated = true;

            if (!AssignProcessToJobObject(job, process.hProcess))
                throw LastError("AssignProcessToJobObject");
            Console.Out.WriteLine("LIGHTWEAVER_JOB_STARTED");
            Console.Out.Flush();
            if (ResumeThread(process.hThread) == unchecked((uint)-1))
                throw LastError("ResumeThread");

            IntPtr[] waitHandles = new IntPtr[]
            {
                process.hProcess,
                stop.SafeWaitHandle.DangerousGetHandle()
            };
            uint wait = WaitForMultipleObjects(2, waitHandles, false, 0xFFFFFFFF);
            if (wait == WAIT_FAILED) throw LastError("WaitForMultipleObjects");
            if (wait != WAIT_OBJECT_0 && wait != WAIT_OBJECT_0 + 1)
                throw new Win32Exception("WaitForMultipleObjects returned an unexpected state");
            uint exitCode;
            if (!GetExitCodeProcess(process.hProcess, out exitCode))
                throw LastError("GetExitCodeProcess");

            if (!TerminateJobObject(job, 1))
                throw LastError("TerminateJobObject");
            WaitUntilJobIsEmpty(job);
            return unchecked((int)exitCode);
        }
        finally
        {
            if (processCreated) TerminateProcess(process.hProcess, 1);
            TerminateJobObject(job, 1);
            if (process.hThread != IntPtr.Zero) CloseHandle(process.hThread);
            if (process.hProcess != IntPtr.Zero) CloseHandle(process.hProcess);
            if (nul != IntPtr.Zero) CloseHandle(nul);
            CloseHandle(job);
        }
    }
}
'@

$line = [Console]::In.ReadLine()
if ([string]::IsNullOrWhiteSpace($line)) {
    [Console]::Error.WriteLine("Windows job supervisor received no start request")
    exit 127
}

try {
    $request = $line | ConvertFrom-Json
    if (
        $null -eq $request -or
        [string]::IsNullOrWhiteSpace([string]$request.command) -or
        $null -eq $request.args
    ) {
        throw "Windows job supervisor received an invalid start request"
    }
    $arguments = [string[]]@($request.args)
    $code = [LightWeaverJobRunner]::Run([string]$request.command, $arguments)
    exit $code
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 127
}
