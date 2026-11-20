/**
 * Firebase Client Configuration and Phone Authentication Helper
 */

export interface FirebaseAuthConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  appId?: string;
}

export const firebaseConfig: FirebaseAuthConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId
);

interface FirebaseConfirmationResult {
  confirm: (code: string) => Promise<{ user: { getIdToken: () => Promise<string> } }>;
}

type FirebaseWindow = Window & {
  firebase?: {
    apps: unknown[];
    initializeApp: (config: FirebaseAuthConfig) => unknown;
    auth: {
      (): {
        signInWithPhoneNumber: (phone: string, verifier: unknown) => Promise<FirebaseConfirmationResult>;
      };
      RecaptchaVerifier: new (container: string, options: Record<string, unknown>, auth?: unknown) => {
        clear?: () => void;
      };
    };
  };
};

let recaptchaVerifierHolder: { clear?: () => void } | null = null;
let confirmationResultHolder: { phoneNumber: string; result: FirebaseConfirmationResult } | null = null;
const scriptLoads = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const pending = scriptLoads.get(src);
  if (pending) return pending;
  const load = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load Firebase script: ${src}`));
    document.body.appendChild(script);
  }).catch((error) => {
    scriptLoads.delete(src);
    document.querySelector(`script[src="${src}"]`)?.remove();
    throw error;
  });
  scriptLoads.set(src, load);
  return load;
}

async function ensureFirebaseLoaded() {
  const win = window as unknown as FirebaseWindow;
  if (!win.firebase) {
    await loadScript("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
  }
  if (!win.firebase?.auth) {
    await loadScript("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js");
  }
  if (!win.firebase?.auth) throw new Error("Firebase SDK failed to initialize.");
  if (win.firebase.apps.length === 0) {
    win.firebase.initializeApp(firebaseConfig);
  }
  return win.firebase;
}

/**
 * Request a Firebase phone verification code. Local development can use the test code.
 */
export async function sendPhoneVerificationCode(
  phoneNumber: string,
  recaptchaContainerId = "recaptcha-container"
): Promise<{ devMode: boolean; message: string }> {
  if (!isFirebaseConfigured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Phone sign-in is not configured yet.");
    }
    return {
      devMode: true,
      message: "Development mode: Firebase credentials not set. Use code 123456.",
    };
  }
  if (typeof window === "undefined") throw new Error("Phone sign-in requires a browser.");

  try {
    confirmationResultHolder = null;
    const firebase = await ensureFirebaseLoaded();
    const auth = firebase.auth();
    if (recaptchaVerifierHolder?.clear) {
      try {
        recaptchaVerifierHolder.clear();
      } catch {
        // Ignore cleanup failures from stale reCAPTCHA widgets
      }
      recaptchaVerifierHolder = null;
    }
    const container = document.getElementById(recaptchaContainerId);
    if (container) {
      container.innerHTML = "";
    }
    const verifier = new firebase.auth.RecaptchaVerifier(
      recaptchaContainerId,
      {
        size: "invisible",
      },
      auth
    );
    recaptchaVerifierHolder = verifier;

    const confirmationResult = await auth.signInWithPhoneNumber(phoneNumber, verifier);
    confirmationResultHolder = { phoneNumber, result: confirmationResult };

    return {
      devMode: false,
      message: "Verification code sent via SMS.",
    };
  } catch (error: unknown) {
    try {
      recaptchaVerifierHolder?.clear?.();
    } catch {
      // Preserve the SMS error if a stale reCAPTCHA widget cannot be cleared.
    }
    recaptchaVerifierHolder = null;
    const msg = error instanceof Error ? error.message : "Failed to send verification SMS via Firebase.";
    throw new Error(msg);
  }
}

/**
 * Confirm Phone Verification Code and retrieve Firebase ID Token
 */
export async function confirmPhoneVerificationCode(
  phoneNumber: string,
  code: string
): Promise<string> {
  if (!isFirebaseConfigured) {
    if (process.env.NODE_ENV === "production") throw new Error("Phone sign-in is not configured yet.");
    if (code !== "123456") throw new Error("Incorrect development verification code.");
    return `dev-token:${phoneNumber}`;
  }
  if (!confirmationResultHolder || confirmationResultHolder.phoneNumber !== phoneNumber) {
    throw new Error("Request a new verification code for this number.");
  }

  try {
    const userCredential = await confirmationResultHolder.result.confirm(code);
    const idToken = await userCredential.user.getIdToken();
    confirmationResultHolder = null;
    return idToken;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Invalid or expired verification code.";
    throw new Error(msg);
  }
}
