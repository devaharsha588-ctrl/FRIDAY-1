import { runPowerShell } from './windows-adapter';

export type UiElementInfo = {
  name: string;
  role: string;
  automationId: string;
  isEnabled: boolean;
  isFocused: boolean;
  bounds: { x: number; y: number; width: number; height: number } | null;
  value: string | null;
};

export type WindowState = {
  title: string;
  processName: string;
  processId: number;
  bounds: { x: number; y: number; width: number; height: number };
  isMinimized: boolean;
  isFocused: boolean;
};

const PSH_INIT = `
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
`;

export async function getWindowState(processName: string): Promise<WindowState | null> {
  const script = `
${PSH_INIT}
$processes = Get-Process -Name "${processName}" -ErrorAction SilentlyContinue
if ($processes -and $processes.Count -gt 0) {
    $proc = $processes[0]
    if (-not $proc.MainWindowHandle -or $proc.MainWindowHandle -eq [IntPtr]::Zero) {
        Write-Output "null"
        exit
    }
    
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $proc.Id)
    $window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
    
    if ($window) {
        $rect = $window.Current.BoundingRectangle
        $bounds = @{ x = $rect.X; y = $rect.Y; width = $rect.Width; height = $rect.Height }
        
        $wp = $window.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern) -as [System.Windows.Automation.WindowPattern]
        $isMinimized = $false
        if ($wp) {
            $isMinimized = ($wp.Current.WindowVisualState -eq [System.Windows.Automation.WindowVisualState]::Minimized)
        }
        
        $result = @{
            title = $window.Current.Name
            processName = $proc.ProcessName
            processId = $proc.Id
            bounds = $bounds
            isMinimized = $isMinimized
            isFocused = $window.Current.HasKeyboardFocus
        }
        $result | ConvertTo-Json -Depth 3 -Compress
    } else {
        Write-Output "null"
    }
} else {
    Write-Output "null"
}
`;

  try {
    const stdout = await runPowerShell(script);
    const parsed = JSON.parse(stdout.trim());
    if (parsed) {
      return parsed as WindowState;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export async function findUiElement(windowTitle: string, query: { name?: string; role?: string; automationId?: string }): Promise<UiElementInfo | null> {
  const script = `
${PSH_INIT}
$windowCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "${windowTitle}")
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $windowCond)

if ($window) {
    $conditions = New-Object System.Collections.Generic.List[System.Windows.Automation.Condition]
    
    ${query.name ? `$conditions.Add((New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "${query.name}")))` : ''}
    ${query.automationId ? `$conditions.Add((New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, "${query.automationId}")))` : ''}
    
    ${query.role ? `
    $controlTypeField = [System.Windows.Automation.ControlType].GetField("${query.role}")
    if ($controlTypeField) {
        $controlType = $controlTypeField.GetValue($null)
        $conditions.Add((New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $controlType)))
    }
    ` : ''}
    
    if ($conditions.Count -eq 0) {
        Write-Output "null"
        exit
    }
    
    $cond = $null
    if ($conditions.Count -eq 1) {
        $cond = $conditions[0]
    } else {
        $cond = New-Object System.Windows.Automation.AndCondition($conditions.ToArray())
    }
    
    $element = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    
    if ($element) {
        $rect = $element.Current.BoundingRectangle
        $bounds = $null
        if ($rect -and -not $rect.IsEmpty) {
            $bounds = @{ x = $rect.X; y = $rect.Y; width = $rect.Width; height = $rect.Height }
        }
        
        $val = $null
        try {
            $vp = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern) -as [System.Windows.Automation.ValuePattern]
            if ($vp) { $val = $vp.Current.Value }
        } catch {}
        
        $roleStr = ""
        try {
            $roleStr = $element.Current.ControlType.ProgrammaticName.Replace("ControlType.", "")
        } catch {}

        $result = @{
            name = $element.Current.Name
            role = $roleStr
            automationId = $element.Current.AutomationId
            isEnabled = $element.Current.IsEnabled
            isFocused = $element.Current.HasKeyboardFocus
            bounds = $bounds
            value = $val
        }
        $result | ConvertTo-Json -Depth 3 -Compress
    } else {
        Write-Output "null"
    }
} else {
    Write-Output "null"
}
`;

  try {
    const stdout = await runPowerShell(script);
    const parsed = JSON.parse(stdout.trim());
    if (parsed) {
      return parsed as UiElementInfo;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export async function getUiElementState(windowTitle: string, elementName: string): Promise<UiElementInfo | null> {
  return findUiElement(windowTitle, { name: elementName });
}

export async function listUiElements(windowTitle: string, maxDepth: number = 2): Promise<UiElementInfo[]> {
  const script = `
${PSH_INIT}
$windowCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "${windowTitle}")
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $windowCond)

if ($window) {
    $results = New-Object System.Collections.Generic.List[object]
    
    function Process-Element($node, $depth) {
        if ($depth -gt ${maxDepth}) { return }
        if ($results.Count -ge 50) { return }
        
        $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
        $child = $walker.GetFirstChild($node)
        
        while ($child -ne $null -and $results.Count -lt 50) {
            $rect = $child.Current.BoundingRectangle
            $bounds = $null
            if ($rect -and -not $rect.IsEmpty) {
                $bounds = @{ x = $rect.X; y = $rect.Y; width = $rect.Width; height = $rect.Height }
            }
            
            $val = $null
            try {
                $vp = $child.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern) -as [System.Windows.Automation.ValuePattern]
                if ($vp) { $val = $vp.Current.Value }
            } catch {}
            
            $roleStr = ""
            try {
                $roleStr = $child.Current.ControlType.ProgrammaticName.Replace("ControlType.", "")
            } catch {}

            $info = @{
                name = $child.Current.Name
                role = $roleStr
                automationId = $child.Current.AutomationId
                isEnabled = $child.Current.IsEnabled
                isFocused = $child.Current.HasKeyboardFocus
                bounds = $bounds
                value = $val
            }
            $results.Add($info)
            
            Process-Element $child ($depth + 1)
            $child = $walker.GetNextSibling($child)
        }
    }
    
    Process-Element $window 1
    $results | ConvertTo-Json -Depth 3 -Compress
} else {
    Write-Output "[]"
}
`;

  try {
    const stdout = await runPowerShell(script);
    const parsed = JSON.parse(stdout.trim());
    if (Array.isArray(parsed)) {
      return parsed as UiElementInfo[];
    }
    return [];
  } catch (e) {
    return [];
  }
}

export async function clickUiElement(windowTitle: string, query: { name?: string; role?: string; automationId?: string }): Promise<{ success: boolean; error?: string }> {
  const script = `
${PSH_INIT}
Add-Type -AssemblyName System.Windows.Forms

$windowCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "${windowTitle}")
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $windowCond)

if ($window) {
    $conditions = New-Object System.Collections.Generic.List[System.Windows.Automation.Condition]
    
    ${query.name ? `$conditions.Add((New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "${query.name}")))` : ''}
    ${query.automationId ? `$conditions.Add((New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, "${query.automationId}")))` : ''}
    
    ${query.role ? `
    $controlTypeField = [System.Windows.Automation.ControlType].GetField("${query.role}")
    if ($controlTypeField) {
        $controlType = $controlTypeField.GetValue($null)
        $conditions.Add((New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $controlType)))
    }
    ` : ''}
    
    if ($conditions.Count -eq 0) {
        Write-Output '{"success":false,"error":"Empty query"}'
        exit
    }
    
    $cond = $null
    if ($conditions.Count -eq 1) {
        $cond = $conditions[0]
    } else {
        $cond = New-Object System.Windows.Automation.AndCondition($conditions.ToArray())
    }
    
    $element = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    
    if ($element) {
        try {
            $ip = $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern) -as [System.Windows.Automation.InvokePattern]
            if ($ip) {
                $ip.Invoke()
                Write-Output '{"success":true}'
                exit
            }
        } catch {}
        
        try {
            $element.SetFocus()
            $rect = $element.Current.BoundingRectangle
            if ($rect -and -not $rect.IsEmpty) {
                $x = [int]($rect.X + ($rect.Width / 2))
                $y = [int]($rect.Y + ($rect.Height / 2))
                [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
                
                Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);' -Name Mouse -Namespace Win32 -PassThru | Out-Null
                [Win32.Mouse]::mouse_event(0x02 -bor 0x04, 0, 0, 0, 0)
                Write-Output '{"success":true}'
            } else {
                Write-Output '{"success":false,"error":"No bounds"}'
            }
        } catch {
            Write-Output '{"success":false,"error":"Failed to invoke or focus"}'
        }
    } else {
        Write-Output '{"success":false,"error":"Element not found"}'
    }
} else {
    Write-Output '{"success":false,"error":"Window not found"}'
}
`;

  try {
    const stdout = await runPowerShell(script);
    const parsed = JSON.parse(stdout.trim());
    return parsed;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function waitForWindow(processName: string, timeoutMs: number = 5000): Promise<WindowState | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getWindowState(processName);
    if (state) {
      return state;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return null;
}

export async function checkProcessExists(processName: string): Promise<boolean> {
  const clean = processName.trim().replace(/\.exe$/i, '');
  const script = `
$q = "${clean}"
$matched = Get-Process | Where-Object { 
  $_.ProcessName -like "*$q*" -or 
  ($_.MainWindowTitle -and $_.MainWindowTitle -like "*$q*") 
}
if ($matched) { "1" } else { "0" }
`.trim();
  try {
    const stdout = await runPowerShell(script);
    return stdout.trim() === '1';
  } catch (e) {
    return false;
  }
}
