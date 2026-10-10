/** Google Identity Services, loaded only when someone opens the sign-in dialog (guests never contact Google). */

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const LOAD_TIMEOUT_MS = 10_000;

interface CredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize(options: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    nonce: string;
    ux_mode?: 'popup' | 'redirect';
    itp_support?: boolean;
    use_fedcm_for_button?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard';
      theme?: 'outline' | 'filled_black';
      size?: 'large';
      text?: 'continue_with';
      shape?: 'rectangular' | 'pill';
      width?: number;
      logo_alignment?: 'left';
    },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let loading: Promise<GoogleAccountsId> | null = null;

function loadScript(): Promise<GoogleAccountsId> {
  loading ??= new Promise<GoogleAccountsId>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google.accounts.id);
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    const timer = window.setTimeout(() => reject(new Error('Google sign-in timed out')), LOAD_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.google?.accounts?.id) resolve(window.google.accounts.id);
      else reject(new Error('Google sign-in did not initialize'));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Google sign-in failed to load'));
    };
    document.head.append(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

function randomNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Renders Google's button. ID-token flow: Google gets the SHA-256 of a fresh nonce and puts it
 * in the token; Supabase gets the raw nonce and checks they match. No redirect through
 * the *.supabase.co URL, so the consent screen shows lietner.app.
 */
export async function renderGoogleButton(container: HTMLElement, clientId: string, onCredential: (idToken: string, rawNonce: string) => void): Promise<void> {
  const id = await loadScript();
  const rawNonce = randomNonce();
  id.initialize({
    client_id: clientId,
    nonce: await sha256Hex(rawNonce),
    ux_mode: 'popup',
    itp_support: true,
    use_fedcm_for_button: true,
    callback: ({ credential }) => onCredential(credential, rawNonce),
  });
  id.renderButton(container, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    width: Math.min(container.clientWidth || 320, 400),
  });
}
