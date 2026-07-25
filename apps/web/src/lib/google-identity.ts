const GOOGLE_CLIENT_ID = import.meta.env['VITE_GOOGLE_CLIENT_ID'];

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GMAIL_SCOPE = 'openid email https://www.googleapis.com/auth/gmail.readonly';

interface CodeClientCallbackResponse {
  code?: string;
  error?: string;
}

interface CodeClientErrorResponse {
  type: string;
}

interface CodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode: 'popup';
  callback: (response: CodeClientCallbackResponse) => void;
  error_callback?: (error: CodeClientErrorResponse) => void;
}

interface CodeClient {
  requestCode(): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient(config: CodeClientConfig): CodeClient;
        };
      };
    };
  }
}

let gisScriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'));
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

export async function requestGmailAuthCode(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID)');
  }

  await loadGisScript();

  return new Promise<string>((resolve, reject) => {
    window
      .google!.accounts.oauth2.initCodeClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GMAIL_SCOPE,
        ux_mode: 'popup',
        callback: (response) => {
          if (response.code) {
            resolve(response.code);
          } else {
            reject(new Error(response.error ?? 'Google did not return an authorization code'));
          }
        },
        error_callback: (error) => reject(new Error(`Google sign-in failed: ${error.type}`)),
      })
      .requestCode();
  });
}
