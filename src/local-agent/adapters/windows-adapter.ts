import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

export type ScreenCaptureResult = {
  width: number;
  height: number;
  path: string;
  thumbnailBase64?: string;
};

export type WindowInfo = {
  title: string;
  processName: string;
  processId: number;
};

export const ALLOWED_KEYS = new Set([
  'enter',
  'return',
  'esc',
  'escape',
  'tab',
  'space',
  'backspace',
  'delete',
  'up',
  'down',
  'left',
  'right',
  'home',
  'end',
  'pageup',
  'pagedown',
  'ctrl',
  'control',
  'alt',
  'shift',
  'win',
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f11',
  'f12',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
]);

export function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code && code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function captureScreen(outputPath: string): Promise<ScreenCaptureResult> {
  const pathB64 = Buffer.from(outputPath, 'utf8').toString('base64');
  const script = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$targetPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${pathB64}'))
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
Write-Output "$($bounds.Width)x$($bounds.Height)"
`.trim();

  const output = await runPowerShell(script);
  const [widthStr, heightStr] = output.split('x');
  const width = Number(widthStr) || 1920;
  const height = Number(heightStr) || 1080;

  let thumbnailBase64: string | undefined;
  try {
    const data = await readFile(outputPath);
    if (data.length <= 1_500_000) {
      thumbnailBase64 = `data:image/png;base64,${data.toString('base64')}`;
    }
  } catch {
    // Ignore thumbnail read error
  }

  return {
    width,
    height,
    path: outputPath,
    thumbnailBase64
  };
}

export async function switchWindow(target: { appName?: string; title?: string }): Promise<{
  success: boolean;
  matchedTitle?: string;
  ambiguous?: boolean;
  matches?: string[];
  error?: string;
}> {
  const filter = (target.title || target.appName || '').trim();
  if (!filter) {
    return { success: false, error: 'Target appName or title is required.' };
  }

  const filterB64 = Buffer.from(filter, 'utf8').toString('base64');

  const script = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class WinApi {
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  }
"@

$filter = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${filterB64}'))

$procs = Get-Process | Where-Object { 
  $_.MainWindowHandle -ne [IntPtr]::Zero -and 
  ($_.MainWindowTitle -like "*$filter*" -or $_.ProcessName -like "*$filter*")
}

if (-not $procs) {
  Write-Output "RESULT:NOT_FOUND"
} elseif ($procs.Count -gt 1) {
  # Check if exactly one is an exact match
  $exact = $procs | Where-Object { $_.MainWindowTitle -eq $filter -or $_.ProcessName -eq $filter }
  if ($exact -and $exact.Count -eq 1) {
    [WinApi]::ShowWindow($exact[0].MainWindowHandle, 9) | Out-Null
    [WinApi]::SetForegroundWindow($exact[0].MainWindowHandle) | Out-Null
    Write-Output "RESULT:MATCHED:$($exact[0].MainWindowTitle)"
  } else {
    $titles = ($procs | ForEach-Object { "$($_.ProcessName): $($_.MainWindowTitle)" }) -join "||"
    Write-Output "RESULT:AMBIGUOUS:$titles"
  }
} else {
  $targetProc = if ($procs -is [array]) { $procs[0] } else { $procs }
  [WinApi]::ShowWindow($targetProc.MainWindowHandle, 9) | Out-Null
  [WinApi]::SetForegroundWindow($targetProc.MainWindowHandle) | Out-Null
  Write-Output "RESULT:MATCHED:$($targetProc.MainWindowTitle)"
}
`.trim();

  const output = await runPowerShell(script);
  if (output.startsWith('RESULT:MATCHED:')) {
    return {
      success: true,
      matchedTitle: output.slice('RESULT:MATCHED:'.length)
    };
  }

  if (output.startsWith('RESULT:AMBIGUOUS:')) {
    const rawMatches = output.slice('RESULT:AMBIGUOUS:'.length).split('||');
    return {
      success: false,
      ambiguous: true,
      matches: rawMatches,
      error: `Multiple windows matched "${filter}". Be more specific: ${rawMatches.join(', ')}`
    };
  }

  return { success: false, error: `No open window found matching "${filter}".` };
}

export async function typeText(text: string): Promise<void> {
  if (!text) return;
  const textB64 = Buffer.from(text, 'utf8').toString('base64');

  const script = `
Add-Type -AssemblyName System.Windows.Forms
$raw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${textB64}'))

# Escape special SendKeys characters: {} + ^ % ~ ( )
$builder = New-Object System.Text.StringBuilder
foreach ($ch in $raw.ToCharArray()) {
  if ("{}+^%~()[]".IndexOf($ch) -ge 0) {
    $builder.Append("{$ch}") | Out-Null
  } else {
    $builder.Append($ch) | Out-Null
  }
}

[System.Windows.Forms.SendKeys]::SendWait($builder.ToString())
`.trim();

  await runPowerShell(script);
}

export async function sendKeypress(keys: string[]): Promise<void> {
  if (!keys || keys.length === 0) {
    throw new Error('At least one key is required.');
  }

  const mappedParts: string[] = [];

  for (const rawKey of keys) {
    const k = rawKey.trim().toLowerCase();
    if (!ALLOWED_KEYS.has(k)) {
      throw new Error(`Invalid key: "${rawKey}". Key is not in the allowed list.`);
    }

    switch (k) {
      case 'enter':
      case 'return':
        mappedParts.push('{ENTER}');
        break;
      case 'esc':
      case 'escape':
        mappedParts.push('{ESC}');
        break;
      case 'tab':
        mappedParts.push('{TAB}');
        break;
      case 'backspace':
        mappedParts.push('{BACKSPACE}');
        break;
      case 'delete':
        mappedParts.push('{DELETE}');
        break;
      case 'space':
        mappedParts.push(' ');
        break;
      case 'up':
        mappedParts.push('{UP}');
        break;
      case 'down':
        mappedParts.push('{DOWN}');
        break;
      case 'left':
        mappedParts.push('{LEFT}');
        break;
      case 'right':
        mappedParts.push('{RIGHT}');
        break;
      case 'home':
        mappedParts.push('{HOME}');
        break;
      case 'end':
        mappedParts.push('{END}');
        break;
      case 'pageup':
        mappedParts.push('{PGUP}');
        break;
      case 'pagedown':
        mappedParts.push('{PGDN}');
        break;
      case 'ctrl':
      case 'control':
        mappedParts.push('^');
        break;
      case 'alt':
        mappedParts.push('%');
        break;
      case 'shift':
        mappedParts.push('+');
        break;
      case 'win':
        mappedParts.push('^{ESC}');
        break;
      default:
        if (k.startsWith('f') && k.length >= 2) {
          mappedParts.push(`{${k.toUpperCase()}}`);
        } else {
          mappedParts.push(k);
        }
        break;
    }
  }

  const sequence = mappedParts.join('');
  const seqB64 = Buffer.from(sequence, 'utf8').toString('base64');

  const script = `
Add-Type -AssemblyName System.Windows.Forms
$seq = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${seqB64}'))
[System.Windows.Forms.SendKeys]::SendWait($seq)
`.trim();

  await runPowerShell(script);
}

export async function mouseClick(
  x?: number,
  y?: number,
  button: 'left' | 'right' | 'middle' = 'left'
): Promise<void> {
  if (x !== undefined && (!Number.isInteger(x) || x < 0 || x > 10000)) {
    throw new Error(`Invalid X coordinate: ${x}. Must be an integer between 0 and 10000.`);
  }

  if (y !== undefined && (!Number.isInteger(y) || y < 0 || y > 10000)) {
    throw new Error(`Invalid Y coordinate: ${y}. Must be an integer between 0 and 10000.`);
  }

  const validButtons = ['left', 'right', 'middle'];
  if (!validButtons.includes(button)) {
    throw new Error(`Invalid mouse button: ${button}. Must be one of: ${validButtons.join(', ')}`);
  }

  const downFlag = button === 'right' ? 0x08 : button === 'middle' ? 0x20 : 0x02;
  const upFlag = button === 'right' ? 0x10 : button === 'middle' ? 0x40 : 0x04;

  const script = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class MouseApi {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
  }
"@

${x !== undefined && y !== undefined ? `[MouseApi]::SetCursorPos(${x}, ${y}) | Out-Null` : ''}
Start-Sleep -Milliseconds 30
[MouseApi]::mouse_event(${downFlag}, 0, 0, 0, 0)
Start-Sleep -Milliseconds 30
[MouseApi]::mouse_event(${upFlag}, 0, 0, 0, 0)
`.trim();

  await runPowerShell(script);
}

export async function findWindows(query: string): Promise<WindowInfo[]> {
  const queryB64 = Buffer.from((query || '').trim(), 'utf8').toString('base64');
  const script = `
$q = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${queryB64}')).Trim()
$cleanQ = $q -replace '\\.exe$', ''

Get-Process | Where-Object { 
  ($_.MainWindowTitle -and $_.MainWindowTitle -like "*$cleanQ*") -or 
  ($_.ProcessName -and $_.ProcessName -like "*$cleanQ*")
} | Select-Object -Property MainWindowTitle, ProcessName, Id | ConvertTo-Json -Compress
`.trim();

  const output = await runPowerShell(script);
  if (!output || output === 'null') return [];

  try {
    const parsed = JSON.parse(output);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((item: { MainWindowTitle?: string; ProcessName?: string; Id?: number }) => ({
      title: item.MainWindowTitle || item.ProcessName || '',
      processName: item.ProcessName || '',
      processId: item.Id || 0
    }));
  } catch {
    return [];
  }
}
