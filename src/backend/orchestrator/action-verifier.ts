import type { DesktopAction, ActionResult } from '../../shared/action-schema';

export type VerificationResult = {
  verified: boolean;
  observation: string;
  confidence: 'high' | 'medium' | 'low';
  retryable: boolean;
};

export type VerificationContext = {
  /** Check if a process is running */
  checkProcessExists: (processName: string) => Promise<boolean>;
  /** Find windows matching a query */
  findWindows: (query: string) => Promise<Array<{ title: string; processName: string }>>;
  /** Get current browser URL */
  getBrowserUrl?: () => Promise<string | null>;
  /** Get current browser title */
  getBrowserTitle?: () => Promise<string | null>;
};

export function extractExpectedDomain(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    return url.hostname;
  } catch (e) {
    return null;
  }
}

export async function verifyAction(
  action: DesktopAction,
  result: ActionResult,
  context: VerificationContext
): Promise<VerificationResult> {
  // Handle failed/cancelled/blocked statuses
  if (['blocked', 'unsupported', 'cancelled', 'needs_confirmation'].includes(result.status)) {
    return {
      verified: false,
      observation: result.summary || `Action ${result.status}`,
      confidence: 'high',
      retryable: false
    };
  }

  if (result.status === 'failed') {
    let retryable = false;
    if (action.action === 'switch_window') retryable = true;
    if (action.action === 'wait_for_condition') retryable = true;
    if (action.action === 'file_operation' && (action.operation === 'read' || action.operation === 'list')) retryable = true;
    if (action.action === 'find_element' || action.action === 'find_window' || action.action === 'find_ui_element' || action.action === 'find_browser_element') retryable = true;

    return {
      verified: false,
      observation: result.summary || 'Action failed',
      confidence: 'high',
      retryable
    };
  }

  // Treat 'completed' or 'success' as successful execution status
  const isSuccess = result.status === 'success' || result.status === 'completed';

  switch (action.action) {
    case 'open_app': {
      const exists = await context.checkProcessExists(action.appName);
      if (exists) {
        return { verified: true, observation: `Process ${action.appName} is running`, confidence: 'high', retryable: false };
      } else {
        return { verified: false, observation: `Process ${action.appName} is not running`, confidence: 'high', retryable: true };
      }
    }

    case 'open_url':
    case 'navigate':
    case 'new_tab': {
      if (!context.getBrowserUrl) {
        return { verified: true, observation: 'Browser URL check not available, assuming success', confidence: 'low', retryable: false };
      }
      const currentUrl = await context.getBrowserUrl();
      if (!currentUrl) {
        return { verified: false, observation: 'Could not get current browser URL', confidence: 'high', retryable: true };
      }

      const expectedUrl = 'url' in action ? action.url : undefined;
      const expectedDomain = expectedUrl ? extractExpectedDomain(expectedUrl) : null;
      
      if (!expectedDomain) {
        return { verified: true, observation: 'No specific URL expected', confidence: 'low', retryable: false };
      }

      if (currentUrl.includes(expectedDomain)) {
        return { verified: true, observation: `Browser URL matches expected domain ${expectedDomain}`, confidence: 'high', retryable: false };
      } else {
        return { verified: false, observation: `Browser URL ${currentUrl} does not match expected domain ${expectedDomain}`, confidence: 'high', retryable: true };
      }
    }

    case 'close_app': {
      const exists = await context.checkProcessExists(action.appName);
      if (!exists) {
        return { verified: true, observation: `Process ${action.appName} is not running`, confidence: 'high', retryable: false };
      } else {
        return { verified: false, observation: `Process ${action.appName} is still running`, confidence: 'high', retryable: true };
      }
    }

    case 'switch_window': {
      const data = result.data as { matchedTitle?: string } | undefined;
      if (isSuccess && data && data.matchedTitle) {
        return { verified: true, observation: `Switched to window: ${data.matchedTitle}`, confidence: 'high', retryable: false };
      }
      return { verified: false, observation: 'Switch window failed or no matched title', confidence: 'high', retryable: true };
    }

    case 'type_text': {
      if (isSuccess) {
        return { verified: true, observation: 'Text typed', confidence: 'medium', retryable: false };
      }
      return { verified: false, observation: 'Type text not successful', confidence: 'high', retryable: false };
    }

    case 'keypress': {
      if (isSuccess) {
        return { verified: true, observation: 'Keys pressed', confidence: 'medium', retryable: false };
      }
      return { verified: false, observation: 'Keypress not successful', confidence: 'high', retryable: false };
    }

    case 'click': {
      if (isSuccess) {
        return { verified: true, observation: 'Click executed', confidence: 'low', retryable: true };
      }
      return { verified: false, observation: 'Click not successful', confidence: 'high', retryable: true };
    }

    case 'find_element':
    case 'find_window': {
      const data = result.data as { matches?: unknown[] } | undefined;
      if (data && Array.isArray(data.matches) && data.matches.length > 0) {
        return { verified: true, observation: `Found ${data.matches.length} matches`, confidence: 'high', retryable: false };
      }
      return { verified: false, observation: 'No matches found', confidence: 'high', retryable: true };
    }

    case 'find_ui_element':
    case 'find_browser_element': {
      if (isSuccess && result.data) {
        return { verified: true, observation: 'Element located successfully', confidence: 'high', retryable: false };
      }
      return { verified: false, observation: 'Element not found', confidence: 'high', retryable: true };
    }

    case 'wait_for_condition': {
      if (isSuccess) {
        return { verified: true, observation: 'Wait condition met', confidence: 'high', retryable: false };
      }
      return { verified: false, observation: 'Wait condition not met', confidence: 'high', retryable: true };
    }

    case 'wait': {
      if (isSuccess) {
        return { verified: true, observation: 'Wait completed', confidence: 'high', retryable: false };
      }
      return { verified: false, observation: 'Wait not completed', confidence: 'high', retryable: false };
    }

    case 'read_screen': {
      if (isSuccess) {
        return { verified: true, observation: 'Screen read successfully', confidence: 'high', retryable: false };
      }
      return { verified: false, observation: 'Screen read failed', confidence: 'high', retryable: false };
    }

    case 'file_operation': {
      if (isSuccess) {
        return { verified: true, observation: 'File operation successful', confidence: 'high', retryable: false };
      }
      return { 
        verified: false, 
        observation: 'File operation not successful', 
        confidence: 'high', 
        retryable: action.operation === 'read' || action.operation === 'list' 
      };
    }

    default:
      return {
        verified: false,
        observation: result.summary || `Unrecognized action`,
        confidence: 'high',
        retryable: false
      };
  }
}
