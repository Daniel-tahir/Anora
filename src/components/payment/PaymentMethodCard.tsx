import { type PaymentMethodId, PAYMENT_METHODS } from "./payment-types";
import { StripeIcon, PayPalIcon } from "./payment-icons";
import { CheckCircle } from "lucide-react";

const PAYMENT_ICONS: Record<string, React.ComponentType> = {
  stripe: StripeIcon,
  paypal: PayPalIcon,
};

export function PaymentMethodCard({
  id,
  selected,
  onClick,
  disabled,
}: {
  id: PaymentMethodId;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const config = PAYMENT_METHODS[id];
  const Icon = PAYMENT_ICONS[id];

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={config.title}
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${
        selected
          ? "border-foreground shadow-soft bg-background"
          : "border-border bg-background hover:border-foreground/40"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <Icon />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{config.title}</span>
            {selected && <CheckCircle className="h-4 w-4 text-foreground flex-shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{config.subtitle}</p>
        </div>
      </div>
    </button>
  );
}
