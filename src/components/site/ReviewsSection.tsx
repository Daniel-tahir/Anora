import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface ReviewsSectionProps {
  productId: string;
}

export function useProductReviews(productId: string) {
  return useQuery({
    queryKey: ["reviews", "product", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, rating, title, review_text, reviewer_name, is_verified, created_at")
        .eq("product_id", productId)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!productId,
  });
}

export function ReviewsSection({ productId }: ReviewsSectionProps) {
  const { data: reviews = [], isLoading } = useProductReviews(productId);

  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground animate-pulse font-sans">
        Loading product reviews...
      </div>
    );
  }

  const totalReviews = reviews.length;
  
  // Calculate average rating
  const averageRating = totalReviews > 0 
    ? Number((reviews.reduce((acc, curr) => acc + curr.rating, 0) / totalReviews).toFixed(1))
    : 0;

  // Calculate star counts distribution
  const distribution = [0, 0, 0, 0, 0]; // 1, 2, 3, 4, 5 stars
  reviews.forEach(r => {
    if (r.rating >= 1 && r.rating <= 5) {
      distribution[r.rating - 1]++;
    }
  });

  return (
    <div className="max-w-7xl mx-auto px-5 lg:px-10 py-16">
      <div className="border-t border-border/20 pt-16">
        <h2 className="font-serif text-2xl md:text-3xl tracking-[0.2em] uppercase text-center mb-12 text-foreground">
          Customer Reviews
        </h2>

        {totalReviews === 0 ? (
          <div className="text-center py-10 max-w-sm mx-auto font-sans">
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              Be the first to share your ANORA experience. We value your feedback on our tailoring, fabric, and craftsmanship.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-16 items-start font-sans">
            
            {/* Rating Summary column */}
            <div className="space-y-6 lg:border-r lg:border-border/10 lg:pr-12">
              <div>
                <p className="text-5xl font-serif text-foreground leading-none">{averageRating.toFixed(1)}</p>
                <div className="flex items-center gap-1 mt-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={cn(
                        "h-4.5 w-4.5",
                        star <= Math.round(averageRating)
                          ? "text-gold fill-gold"
                          : "text-muted-foreground/20 fill-transparent"
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2.5">
                  Based on {totalReviews} {totalReviews === 1 ? "review" : "reviews"}
                </p>
              </div>

              {/* Star distribution bars */}
              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = distribution[stars - 1] || 0;
                  const percent = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                  return (
                    <div key={stars} className="flex items-center gap-3 text-xs">
                      <span className="w-3 text-muted-foreground text-right">{stars}</span>
                      <Star className="h-3 w-3 fill-muted-foreground/35 text-transparent shrink-0" />
                      <div className="flex-1 h-1.5 bg-neutral/30 overflow-hidden">
                        <div 
                          className="h-full bg-gold/90 transition-all duration-500" 
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="w-8 text-muted-foreground text-right">
                        {percent.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Individual Reviews list column */}
            <div className="lg:col-span-2 space-y-10 divide-y divide-border/10 lg:max-h-[600px] lg:overflow-y-auto scrollbar-thin scrollbar-thumb-border/20 pr-2">
              {reviews.map((review, index) => (
                <div 
                  key={review.id} 
                  className={cn("space-y-3", index > 0 && "pt-8")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={cn(
                            "h-3.5 w-3.5",
                            star <= review.rating
                              ? "text-gold fill-gold"
                              : "text-muted-foreground/20 fill-transparent"
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(review.created_at).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  {review.title && (
                    <h4 className="font-serif font-semibold text-[15px] text-foreground tracking-wide">
                      {review.title}
                    </h4>
                  )}

                  <p className="text-[13px] text-muted-foreground/90 leading-relaxed font-sans whitespace-pre-line">
                    {review.review_text}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-sans">
                    <span className="font-medium text-foreground">{review.reviewer_name}</span>
                    {review.is_verified && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gold bg-gold/5 border border-gold/15 px-2 py-0.5 rounded-full leading-none antialiased">
                        <Check className="h-2.5 w-2.5" />
                        Verified Purchase
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
