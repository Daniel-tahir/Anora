export {
  ErrorCodes,
  clampStock,
  normalizeSizeStock,
  isSizeTracked,
  getAvailableStock,
  validatePrice,
  isStockOnlyError,
  isStructuralError,
  validateProductStatus,
  validateVariant,
  validateSizeInList,
  validateSizeStock,
  validateQuantity,
  isSizeTrackedJsonb,
} from "./inventory-engine";

export type { ErrorCode, InventoryError, StockQuery } from "./inventory-engine";
