type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = {
  requestId?: string;
  orderId?: string;
  jobId?: string;
  userId?: string;
  [key: string]: unknown;
};

class Logger {
  private static _instance: Logger;

  static get(): Logger {
    if (!Logger._instance) Logger._instance = new Logger();
    return Logger._instance;
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const entry = {
      timestamp: this.formatTimestamp(),
      level,
      message,
      ...(context ? { context } : {}),
    };

    const line = JSON.stringify(entry);

    switch (level) {
      case "error":
        console.error(line);
        break;
      case "warn":
        console.warn(line);
        break;
      case "debug":
        console.debug(line);
        break;
      default:
        console.log(line);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }
}

export const logger = Logger.get();
