import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Star, Loader2, CheckCircle2 } from "lucide-react";
import { SITE_URL } from "@/lib/config";
import { resolveReviewToken, submitReview } from "@/lib/reviews-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/review/$token")({
  head: ({ params }) => ({
    meta: [
      { title: "Write a Review | ANORA New York" },
      { name: "description", content: "Share your experience with your recent ANORA purchase." },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/review/${params.token}` }],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const { token } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemData, setItemData] = useState<{
    orderId: string;
    orderItemId: string;
    email: string;
    productId: string;
    productName: string;
    productImage?: string;
  } | null>(null);

  // Form states
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function loadToken() {
      try {
        setLoading(true);
        const res = await resolveReviewToken({ data: { token } });
        if (!res.success || !res.data) {
          setError(res.error || "Invalid link");
        } else {
          setItemData(res.data);
          // Try to get default name from profile or order
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("first_name")
              .eq("id", session.user.id)
              .single();
            if (profile?.first_name) {
              setReviewerName(profile.first_name);
            }
          }
        }
      } catch (err) {
        setError("Failed to verify the review link.");
      } finally {
        setLoading(false);
      }
    }
    void loadToken();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemData) return;
    if (reviewerName.trim().length < 2) {
      toast.error("Please enter your name (minimum 2 characters).");
      return;
    }
    if (body.trim().length < 5) {
      toast.error("Please enter a review message (minimum 5 characters).");
      return;
    }

    try {
      setSubmitting(true);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await submitReview({
        data: {
          token,
          rating,
          title: title.trim() || undefined,
          body: body.trim(),
          reviewerName: reviewerName.trim(),
          accessToken: session?.access_token || undefined,
        }
      });

      if (res.success) {
        setSubmitted(true);
        toast.success("Review submitted successfully!");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center font-sans">
        <Loader2 className="h-8 w-8 animate-spin text-gold mb-4" />
        <p className="text-muted-foreground text-sm">Verifying review request...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center font-sans">
        <div className="max-w-md border border-border/60 bg-neutral/5 p-8 rounded-lg">
          <h2 className="font-serif text-3xl mb-4">Invalid Review Link</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            {error}
          </p>
          <Link
            to="/shop"
            className="inline-block text-[11px] tracking-[0.32em] uppercase bg-foreground text-background px-8 py-3.5 font-bold hover:opacity-90 transition-opacity"
          >
            Explore all pieces
          </Link>
        </div>
      </div>
    );
  }

  if (submitted && itemData) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center font-sans">
        <div className="max-w-md border border-border/40 p-8 rounded-lg animate-fade-up">
          <CheckCircle2 className="h-12 w-12 text-emerald mx-auto mb-4" />
          <h2 className="font-serif text-3xl mb-2">Thank you!</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Your review for <span className="font-medium text-foreground">{itemData.productName}</span> has been received.
          </p>
          <p className="text-xs text-muted-foreground/80 leading-relaxed mb-8">
            New submissions are moderated to ensure high-quality community standards. Approved reviews will appear on the store shortly.
          </p>
          <Link
            to="/shop"
            className="inline-block text-[11px] tracking-[0.32em] uppercase border border-border hover:bg-neutral/20 px-8 py-3.5 transition-colors font-sans"
          >
            Back to store
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 font-sans">
      <div className="text-center mb-10">
        <span className="eyebrow text-gold">Share Your Experience</span>
        <h1 className="mt-4 font-serif text-4xl">Write a Review</h1>
      </div>

      {itemData && (
        <form onSubmit={handleSubmit} className="space-y-8 border border-border/50 p-6 sm:p-10 rounded-lg bg-neutral/5">
          {/* Product card info */}
          <div className="flex items-center gap-4 border-b border-border/20 pb-6">
            {itemData.productImage ? (
              <img
                src={itemData.productImage}
                alt={itemData.productName}
                className="w-16 h-20 object-cover border border-border/80"
              />
            ) : (
              <div className="w-16 h-20 bg-neutral/20 border border-border/80" />
            )}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Item Purchased</p>
              <h3 className="font-serif text-lg text-foreground mt-1">{itemData.productName}</h3>
            </div>
          </div>

          {/* Rating */}
          <div className="space-y-3">
            <Label className="text-xs tracking-wider uppercase font-bold text-foreground">Overall Rating</Label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="p-1 focus:outline-none transition-transform hover:scale-110"
                  aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                >
                  <Star
                    className={`h-7 w-7 transition-colors ${
                      star <= (hoverRating ?? rating)
                        ? "fill-gold text-gold"
                        : "text-muted-foreground/30 fill-transparent"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Reviewer Name */}
          <div className="space-y-2">
            <Label htmlFor="reviewerName" className="text-xs tracking-wider uppercase font-bold text-foreground">
              Your Name
            </Label>
            <Input
              id="reviewerName"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              placeholder="e.g. Sarah J."
              required
              className="bg-background rounded-none border-border/80 focus:border-foreground"
            />
            <p className="text-[10px] text-muted-foreground">Ex. First name + last initial. Your email will not be displayed.</p>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-xs tracking-wider uppercase font-bold text-foreground">
              Review Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Exquisite fabric and perfect tailoring"
              className="bg-background rounded-none border-border/80 focus:border-foreground"
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="body" className="text-xs tracking-wider uppercase font-bold text-foreground">
              Review Message
            </Label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Tell us about the craftsmanship, fit, fabric, and how it feels to wear..."
              required
              rows={6}
              className="w-full bg-background border border-border/80 p-3 text-sm focus:outline-none focus:border-foreground transition-colors resize-none rounded-none font-sans"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Min. 5 characters</span>
              <span>{body.length} characters</span>
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full rounded-none bg-foreground text-background py-6 text-xs tracking-[0.3em] uppercase font-bold hover:opacity-90 transition-opacity"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </span>
            ) : (
              "Submit Review"
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
