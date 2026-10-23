import { getProductPriceInfo, type Product } from "@/lib/products";

interface ProductPriceProps {
  product: Product;
  size?: "sm" | "md" | "lg";
  activeColor?: string;
  className?: string;
}

export function ProductPrice({ product, size = "md", activeColor, className = "" }: ProductPriceProps) {
  const priceInfo = getProductPriceInfo(product, activeColor);

  let salePriceClass = "";
  let originalPriceClass = "";
  let containerClass = "flex items-baseline gap-2 md:gap-2.5 flex-wrap";

  if (size === "sm") {
    salePriceClass = "font-sans text-xs md:text-sm font-semibold text-black tracking-wide leading-none";
    originalPriceClass = "font-sans text-[10px] md:text-[11px] font-normal text-[#81807f] line-through decoration-[#81807f]/30 decoration-[0.5px] leading-none";
  } else if (size === "lg") {
    salePriceClass = "font-sans text-xl md:text-2xl font-semibold text-black tracking-wide leading-none";
    originalPriceClass = "font-sans text-sm md:text-base font-normal text-[#81807f] line-through decoration-[#81807f]/30 decoration-[0.5px] leading-none";
  } else {
    // Default "md"
    salePriceClass = "font-sans text-sm md:text-base font-semibold text-black tracking-wide leading-none";
    originalPriceClass = "font-sans text-[11px] md:text-xs font-normal text-[#81807f] line-through decoration-[#81807f]/30 decoration-[0.5px] leading-none";
  }

  const formatPrice = (amount: number) => {
    return `$${amount.toLocaleString()}`;
  };

  if (priceInfo.isOnSale) {
    return (
      <div className={`${containerClass} ${className}`}>
        <span className={salePriceClass}>
          {formatPrice(priceInfo.salePrice)}
        </span>
        <span className={originalPriceClass}>
          {formatPrice(priceInfo.originalPrice)}
        </span>
      </div>
    );
  }

  // Not on sale
  let regularClass = "";
  if (size === "sm") {
    regularClass = "font-sans text-xs md:text-sm font-medium text-foreground tracking-wide leading-none";
  } else if (size === "lg") {
    regularClass = "font-sans text-xl md:text-2xl font-medium text-foreground tracking-wide leading-none";
  } else {
    regularClass = "font-sans text-sm md:text-base font-medium text-foreground tracking-wide leading-none";
  }

  const regularPrice = activeColor ? (product.colorVariants?.find((v) => v.color.toLowerCase() === activeColor.toLowerCase())?.priceOverride ?? product.price) : product.price;

  return (
    <div className={`flex items-baseline ${className}`}>
      <span className={regularClass}>
        {formatPrice(regularPrice)}
      </span>
    </div>
  );
}
