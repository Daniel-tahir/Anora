import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

type EnvVar = {
  key: string;
  required: boolean;
  fallback?: string;
};

const REQUIRED_VARS: EnvVar[] = [
  { key: "VITE_SUPABASE_URL", required: true },
  { key: "SUPABASE_SERVICE_ROLE_KEY", required: true },
  { key: "STRIPE_SECRET_KEY", required: true },
  { key: "VITE_STRIPE_PUBLISHABLE_KEY", required: true },
  { key: "RESEND_API_KEY", required: false },
  // Stripe webhook secret is only required if using webhooks
  { key: "STRIPE_WEBHOOK_SECRET", required: false },
  // PayPal is optional
  { key: "PAYPAL_CLIENT_ID", required: false },
  { key: "PAYPAL_SECRET", required: false },
];

function loadDotEnv(): Record<string, string> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const searchPaths = [
    resolve(__dirname, "..", "..", ".env"),
    resolve(__dirname, "..", "..", "..", ".env"),
    resolve(process.cwd(), ".env"),
  ];

  for (const envPath of searchPaths) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      const vars: Record<string, string> = {};
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        vars[key] = val;
      }
      return vars;
    }
  }
  return {};
}

function readAll(): Record<string, string> {
  const dotenv = loadDotEnv();
  const result: Record<string, string> = {};

  const keys = new Set([...Object.keys(process.env), ...Object.keys(dotenv)]);

  for (const key of keys) {
    const val = process.env[key] || dotenv[key] || "";
    if (val) result[key] = val;
  }

  return result;
}

class Environment {
  private static _instance: Environment;
  private _vars: Record<string, string>;
  private _validated = false;

  private constructor(vars: Record<string, string>) {
    this._vars = vars;
  }

  static load(): Environment {
    if (Environment._instance) return Environment._instance;
    Environment._instance = new Environment(readAll());
    return Environment._instance;
  }

  validate(): Environment {
    if (this._validated) return this;
    const missing: string[] = [];
    for (const v of REQUIRED_VARS) {
      if (v.required && !this._vars[v.key]) {
        missing.push(v.key);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}. ` +
          `Check your .env file or environment configuration.`,
      );
    }
    this._validated = true;
    return this;
  }

  get(key: string): string {
    return this._vars[key] || "";
  }

  getOrThrow(key: string): string {
    const val = this._vars[key];
    if (!val) throw new Error(`Environment variable ${key} is not set`);
    return val;
  }

  has(key: string): boolean {
    return !!this._vars[key];
  }

  // Typed accessors
  get supabaseUrl(): string {
    return this.get("VITE_SUPABASE_URL") || this.get("SUPABASE_URL");
  }

  get supabaseServiceKey(): string {
    return this.get("SUPABASE_SERVICE_ROLE_KEY") || this.get("SUPABASE_SERVICE_KEY");
  }

  get stripeSecretKey(): string {
    return this.get("STRIPE_SECRET_KEY");
  }

  get stripePublishableKey(): string {
    return this.get("VITE_STRIPE_PUBLISHABLE_KEY");
  }

  get stripeWebhookSecret(): string {
    return this.get("STRIPE_WEBHOOK_SECRET");
  }

  get resendApiKey(): string {
    return this.get("RESEND_API_KEY");
  }

  get paypalClientId(): string {
    return this.get("PAYPAL_CLIENT_ID");
  }

  get paypalSecret(): string {
    return this.get("PAYPAL_SECRET");
  }

  get fromEmail(): string {
    return this.get("FROM_EMAIL") || "orders@anora-elegance.com";
  }

  get adminEmail(): string {
    return this.get("ADMIN_EMAIL") || this.get("FROM_EMAIL") || "orders@anora-elegance.com";
  }

  get publicAppUrl(): string {
    return this.get("PUBLIC_APP_URL") || this.get("VITE_PUBLIC_APP_URL") || "http://localhost:3000";
  }

  toJSON(): Record<string, string> {
    return { ...this._vars };
  }
}

export const env = Environment.load();
