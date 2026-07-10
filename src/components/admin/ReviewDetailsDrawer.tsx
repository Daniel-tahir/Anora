import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useReviewDetails, approveReview, rejectReview, deleteReview } from "@/lib/admin-reviews";

interface Props {
  reviewId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

const statusColors: Record<string, "outline" | "secondary" | "default"> = {
  pending: "secondary",
  approved: "default",
  rejected: "outline",
};

export function ReviewDetailsDrawer({ reviewId, open, onClose, onUpdated }: Props) {
  const { details, loading, error, refetch } = useReviewDetails(reviewId);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  async function handleApprove() {
    if (!reviewId) return;
    setActionLoading(true);
    try {
      await approveReview(reviewId);
      refetch();
      onUpdated();
    } catch {
      // error handled by UI
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!reviewId) return;
    setActionLoading(true);
    try {
      await rejectReview(reviewId, rejectNote || undefined);
      refetch();
      onUpdated();
      setShowRejectInput(false);
      setRejectNote("");
    } catch {
      // error handled by UI
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!reviewId) return;
    setActionLoading(true);
    try {
      await deleteReview(reviewId);
      setShowDeleteConfirm(false);
      onUpdated();
      onClose();
    } catch {
      // error handled by UI
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            onClose();
            setShowRejectInput(false);
          }
        }}
      >
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Review Details</SheetTitle>
            <SheetDescription>Review content and moderation actions.</SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-60" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : error ? (
            <div className="border border-red/20 bg-red/5 p-4 text-center">
              <p className="text-sm text-red/80">{error}</p>
              <button onClick={refetch} className="text-sm underline mt-2">
                Retry
              </button>
            </div>
          ) : !details ? (
            <p className="text-sm text-muted-foreground">Review not found.</p>
          ) : (
            <div className="space-y-6">
              {/* Product */}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Product
                </p>
                <p className="font-medium">{details.product_name}</p>
              </div>

              {/* Customer */}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Customer
                </p>
                <p className="font-medium">{details.customer_name}</p>
                <p className="text-sm text-muted-foreground">{details.customer_email}</p>
              </div>

              {/* Rating */}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Rating
                </p>
                <p className="text-lg">{details.rating}/5</p>
              </div>

              {/* Title */}
              {details.title && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Title
                  </p>
                  <p className="font-medium">{details.title}</p>
                </div>
              )}

              {/* Review Text */}
              {details.review_text && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Review
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{details.review_text}</p>
                </div>
              )}

              {/* Status */}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Status
                </p>
                <Badge variant={statusColors[details.status] ?? "outline"} className="capitalize">
                  {details.status}
                </Badge>
              </div>

              {/* Admin Note */}
              {details.admin_note && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                    Admin Note
                  </p>
                  <p className="text-sm">{details.admin_note}</p>
                </div>
              )}

              {/* Date */}
              <div className="text-xs text-muted-foreground">
                <p>Created: {new Date(details.created_at).toLocaleString()}</p>
                {details.approved_at && (
                  <p>Approved: {new Date(details.approved_at).toLocaleString()}</p>
                )}
              </div>

              {/* Moderations Actions */}
              {details.status === "pending" && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-semibold">Moderation</p>
                  <div className="flex gap-2">
                    <Button onClick={handleApprove} disabled={actionLoading}>
                      {actionLoading ? "Processing..." : "Approve"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowRejectInput(true)}
                      disabled={actionLoading}
                    >
                      Reject
                    </Button>
                  </div>
                  {showRejectInput && (
                    <div className="space-y-2">
                      <Label htmlFor="reject-note">Admin note (optional)</Label>
                      <Input
                        id="reject-note"
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Reason for rejection..."
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowRejectInput(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleReject}
                          disabled={actionLoading}
                        >
                          {actionLoading ? "Processing..." : "Confirm Reject"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <SheetFooter className="border-t pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete Review
                </Button>
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Review</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this review? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={actionLoading}>
              {actionLoading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
