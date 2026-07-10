export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, cause?: unknown) {
    super(message, "VALIDATION_ERROR", 400, cause);
  }
}

export class InfrastructureError extends ApplicationError {
  constructor(message: string, code = "INFRASTRUCTURE_ERROR", cause?: unknown) {
    super(message, code, 500, cause);
  }
}

export class QueueError extends ApplicationError {
  constructor(message: string, cause?: unknown) {
    super(message, "QUEUE_ERROR", 500, cause);
  }
}

export class EmailError extends ApplicationError {
  constructor(message: string, cause?: unknown) {
    super(message, "EMAIL_ERROR", 500, cause);
  }
}

export class StorageError extends ApplicationError {
  constructor(message: string, cause?: unknown) {
    super(message, "STORAGE_ERROR", 500, cause);
  }
}

export class PaymentError extends ApplicationError {
  constructor(message: string, code = "PAYMENT_ERROR", cause?: unknown) {
    super(message, code, 402, cause);
  }
}

export class InventoryError extends ApplicationError {
  constructor(message: string, cause?: unknown) {
    super(message, "INVENTORY_ERROR", 409, cause);
  }
}

export class AuthenticationError extends ApplicationError {
  constructor(message = "Unauthorized") {
    super(message, "AUTHENTICATION_ERROR", 401);
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message = "Not found") {
    super(message, "NOT_FOUND", 404);
  }
}
