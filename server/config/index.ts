export const config = {
  queue: {
    pollIntervalMs: 60_000,
    retryIntervalMs: 30_000,
    batchSize: 10,
    maxRetries: 3,
    retryDelaysSec: [30, 120, 600],
  },

  invoice: {
    bucketName: "invoice-pdfs",
    signedUrlExpirySec: 3600,
    pdf: {
      fontSize: 10,
      headerFontSize: 24,
      tableHeaderBg: "#C9A96E",
      tableHeaderText: "#FFFFFF",
      bodyText: "#1A1A1A",
      mutedText: "#666666",
      borderColor: "#E5E5E5",
    },
  },

  resend: {
    defaultFromName: "ANORA Elegance Atelier",
  },

  stripe: {
    apiVersion: "2025-02-24.acacia" as const,
    idempotencyPrefix: "anora_",
  },
} as const;

export type AppConfig = typeof config;
