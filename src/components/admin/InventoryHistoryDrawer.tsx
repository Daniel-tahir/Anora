import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { useInventoryHistory } from "@/lib/admin-inventory";

interface Props {
  productId: string | null;
  onClose: () => void;
}

export function InventoryHistoryDrawer({ productId, onClose }: Props) {
  const { movements, loading, error } = useInventoryHistory(productId);

  return (
    <Sheet
      open={!!productId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Inventory History</SheetTitle>
          <SheetDescription>Stock movements for this product</SheetDescription>
        </SheetHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground mt-4">Loading...</p>
        ) : error ? (
          <p className="text-sm text-red-500 mt-4">{error}</p>
        ) : !movements || movements.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-4">No movements recorded</p>
        ) : (
          <div className="mt-4 rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="capitalize">{m.movement_type}</TableCell>
                    <TableCell
                      className={`text-right font-mono ${m.quantity > 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </TableCell>
                    <TableCell className="text-right font-mono">{m.new_stock}</TableCell>
                    <TableCell className="text-sm">{m.reason ?? "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {new Date(m.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
