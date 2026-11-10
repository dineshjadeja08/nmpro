/**
 * Firebase Client Configuration and Phone Authentication Helper
 */

export interface FirebaseAuthConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
}

export const firebaseConfig: FirebaseAuthConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
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

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load Firebase script: ${src}`));
    document.body.appendChild(script);
  });
}

async function ensureFirebaseLoaded() {
  const win = window as unknown as FirebaseWindow;
  if (!win.firebase || !win.firebase.auth) {
    await loadScript("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
    await loadScript("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js");
  }
  if (!win.firebase) throw new Error("Firebase SDK failed to initialize.");
  if (win.firebase.apps.length === 0) {
    win.firebase.initializeApp(firebaseConfig);
  }
  return win.firebase;
}

let confirmationResultHolder: FirebaseConfirmationResult | null = null;

/**
 * Request Phone Verification Code via Firebase or Dev Mock
 */
export async function sendPhoneVerificationCode(
  phoneNumber: string,
  recaptchaContainerId = "recaptcha-container"
): Promise<{ devMode: boolean; message: string }> {
  if (!isFirebaseConfigured || typeof window === "undefined") {
    // Development fallback mock
    return {
      devMode: true,
      message: "Development mode: Firebase credentials not set. Use code 123456.",
    };
  }

  try {
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
    confirmationResultHolder = confirmationResult;

    return {
      devMode: false,
      message: "Verification code sent via SMS.",
    };
  } catch (error: unknown) {
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
  if (!isFirebaseConfigured || !confirmationResultHolder) {
    // Return dev mock token that Django accepts
    return `dev-token:${phoneNumber}`;
  }

  try {
    const userCredential = await confirmationResultHolder.confirm(code);
    const idToken = await userCredential.user.getIdToken();
    confirmationResultHolder = null;
    return idToken;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Invalid or expired verification code.";
    throw new Error(msg);
  }
}
