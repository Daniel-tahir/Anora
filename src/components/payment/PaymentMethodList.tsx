import { type PaymentMethodId } from "./payment-types";
import { PaymentMethodCard } from "./PaymentMethodCard";

export function PaymentMethodList({
  methods,
  selected,
  onSelect,
  disabled,
}: {
  methods: PaymentMethodId[];
  selected: PaymentMethodId | null;
  onSelect: (id: PaymentMethodId) => void;
  disabled?: boolean;
}) {
  if (methods.length === 0) return null;

  return (
    <div className="space-y-2" role="radiogroup" aria-label="Payment methods">
      {methods.map((id) => (
        <PaymentMethodCard
          key={id}
          id={id}
          selected={selected === id}
          onClick={() => onSelect(id)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
