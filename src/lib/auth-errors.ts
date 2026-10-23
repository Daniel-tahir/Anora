const NETWORK_PATTERNS = [
  /network/i,
  /fetch/i,
  /connection/i,
  /tim(e|ed?)\s*out/i,
  /econnrefused/i,
  /enotfound/i,
  /ehostunreach/i,
  /dns/i,
];

function isNetworkError(msg: string): boolean {
  return NETWORK_PATTERNS.some((re) => re.test(msg));
}

function isRateLimit(msg: string): boolean {
  return /rate\s*limit|too\s*many|429/i.test(msg);
}

export function mapSignInError(error: { message: string }): string {
  const msg = error.message;
  if (msg.includes("Invalid login credentials")) return "Incorrect email or password.";
  if (msg.includes("Email not confirmed")) return "Please verify your email before signing in.";
  if (isRateLimit(msg)) return "Too many login attempts. Please wait a few minutes and try again.";
  if (isNetworkError(msg)) return "Unable to connect. Please try again.";
  return "Unable to sign in right now.";
}

export function mapSignUpError(error: { message: string }): string {
  const msg = error.message;
  if (msg.includes("already registered")) return "An account with this email already exists.";
  if (/password/i.test(msg) && /(at least|minimum|weak|short)/i.test(msg))
    return "Choose a stronger password (minimum 8 characters).";
  if (msg.includes("invalid") && (msg.includes("email") || msg.includes("Email")))
    return "Please enter a valid email.";
  if (isRateLimit(msg)) return "Too many attempts. Please wait a few minutes and try again.";
  if (isNetworkError(msg)) return "Unable to connect. Please try again.";
  return "Unable to create your account right now.";
}

export function mapForgotPasswordError(error: { message: string }): string {
  const msg = error.message;
  if (isRateLimit(msg))
    return "Too many reset requests. Please wait a few minutes before trying again.";
  if (msg.includes("invalid") && (msg.includes("email") || msg.includes("Email")))
    return "Please enter a valid email address.";
  if (isNetworkError(msg))
    return "We couldn't connect to the server. Please check your internet connection.";
  return "Something went wrong. Please try again.";
}

export function mapResetPasswordError(error: { message: string }): string {
  const msg = error.message;
  if (msg.includes("expired")) return "This password reset link has expired. Please request a new password reset email.";
  if (/invalid/i.test(msg)) return "This password reset link is invalid. Please request a new one.";
  if (isNetworkError(msg)) return "Unable to verify your reset link. Please check your internet connection.";
  return "Something went wrong while verifying your reset link.";
}
