import { useState, useEffect } from "react";
import { Star, MessageSquare, Send, Trash2, Edit2, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";

export default function ProductInteractions({ productId }) {
  const { user, isAuthenticated } = useAuth();
  
  const [reviews, setReviews] = useState([]);
  const [comments, setComments] = useState([]);
  
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);

  // Review Form
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [userReview, setUserReview] = useState(null);
  
  // Comment Form
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState(null);

  useEffect(() => {
    fetchReviews();
    fetchComments();
    
    const commentsChannel = supabase
      .channel(`comments-${productId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_comments", filter: `product_id=eq.${productId}` }, () => {
        fetchComments();
      }).subscribe();
      
    const reviewsChannel = supabase
      .channel(`reviews-${productId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_reviews", filter: `product_id=eq.${productId}` }, () => {
        fetchReviews();
      }).subscribe();

    return () => {
      supabase.removeChannel(commentsChannel);
      supabase.removeChannel(reviewsChannel);
    };
  }, [productId]);

  const fetchReviews = async () => {
    const { data } = await supabase.from("product_reviews").select("*").eq("product_id", productId).order("created_at", { ascending: false });
    if (data) {
      setReviews(data);
      if (user) {
        const mine = data.find(r => r.user_id === user.id);
        if (mine) {
          setUserReview(mine);
          setRating(mine.rating);
          setReviewText(mine.review_text || "");
        }
      }
    }
    setLoadingReviews(false);
  };

  const fetchComments = async () => {
    const { data } = await supabase.from("product_comments").select("*, auth.users(raw_user_meta_data)").eq("product_id", productId).order("created_at", { ascending: true });
    if (data) setComments(data);
    setLoadingComments(false);
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) return toast({ title: "Please login to review" });
    if (rating === 0) return toast({ title: "Please select a rating", variant: "destructive" });
    
    try {
      const payload = { product_id: productId, user_id: user.id, rating, review_text: reviewText };
      if (userReview) {
        await supabase.from("product_reviews").update(payload).eq("id", userReview.id);
        toast({ title: "Review updated" });
      } else {
        await supabase.from("product_reviews").insert(payload);
        toast({ title: "Review submitted" });
      }
      fetchReviews();
    } catch (err) {
      console.error(err);
      toast({ title: "Error submitting review", variant: "destructive" });
    }
  };

  const deleteReview = async () => {
    if (!userReview) return;
    try {
      await supabase.from("product_reviews").delete().eq("id", userReview.id);
      setUserReview(null);
      setRating(0);
      setReviewText("");
      toast({ title: "Review deleted" });
      fetchReviews();
    } catch (err) {
      toast({ title: "Error deleting review", variant: "destructive" });
    }
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) return toast({ title: "Please login to comment" });
    if (!commentText.trim()) return;
    
    try {
      await supabase.from("product_comments").insert({
        product_id: productId,
        user_id: user.id,
        content: commentText,
        parent_id: replyTo
      });
      setCommentText("");
      setReplyTo(null);
      toast({ title: "Comment posted" });
    } catch (err) {
      toast({ title: "Error posting comment", variant: "destructive" });
    }
  };

  const renderStars = (value, setVal = null, hoverVal = null, setHoverVal = null) => {
    return (
      <div className="flex gap-1">
        {[1,2,3,4,5].map(i => (
          <Star 
            key={i} 
            className={`w-5 h-5 ${setVal ? "cursor-pointer" : ""} ${(hoverVal || value) >= i ? "fill-[#C5A059] text-[#C5A059]" : "text-zinc-600"}`}
            onMouseEnter={() => setHoverVal && setHoverVal(i)}
            onMouseLeave={() => setHoverVal && setHoverVal(0)}
            onClick={() => setVal && setVal(i)}
          />
        ))}
      </div>
    );
  };

  const topLevelComments = comments.filter(c => !c.parent_id);

  return (
    <div className="mt-16 border-t border-zinc-800 pt-10 space-y-16">
      
      {/* Ratings & Reviews Section */}
      <div>
        <h2 className="font-display text-2xl mb-6 flex items-center gap-2">
          <Star className="w-5 h-5 text-[#C5A059] fill-[#C5A059]" /> Ratings & Reviews
        </h2>
        
        {isAuthenticated ? (
          <form onSubmit={submitReview} className="mb-10 bg-zinc-900/40 border border-zinc-800 p-6">
            <h3 className="text-sm font-medium text-white mb-4">{userReview ? "Update your review" : "Write a review"}</h3>
            <div className="mb-4">
              {renderStars(rating, setRating, hoverRating, setHoverRating)}
            </div>
            <textarea 
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Share your thoughts about this product..."
              className="w-full bg-zinc-950 border border-zinc-800 text-sm p-3 text-white mb-3 min-h-[80px]"
            />
            <div className="flex gap-3">
              <button type="submit" className="bg-[#C5A059] text-black px-4 py-2 text-xs uppercase tracking-wide font-medium">
                {userReview ? "Update" : "Submit"}
              </button>
              {userReview && (
                <button type="button" onClick={deleteReview} className="border border-red-500/50 text-red-400 px-4 py-2 text-xs uppercase tracking-wide">
                  Delete
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="mb-10 p-4 border border-zinc-800 text-sm text-zinc-400">
            Please log in to write a review.
          </div>
        )}

        <div className="space-y-4">
          {reviews.length === 0 && !loadingReviews ? (
            <p className="text-zinc-500 text-sm">No reviews yet. Be the first to review!</p>
          ) : (
            reviews.map(r => (
              <div key={r.id} className="border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-3 mb-2">
                  {renderStars(r.rating)}
                  <span className="text-xs text-zinc-500">{new Date(r.created_at).toLocaleDateString()}</span>
                  {r.status === "pending" && <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 ml-auto">Pending Approval</span>}
                </div>
                <p className="text-sm text-zinc-300">{r.review_text}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Community Comments Section */}
      <div>
        <h2 className="font-display text-2xl mb-6 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-foreground" /> Community Comments
        </h2>
        
        {isAuthenticated ? (
          <form onSubmit={submitComment} className="mb-10 flex gap-3 items-start">
            <div className="flex-1 space-y-2">
              {replyTo && (
                <div className="flex items-center justify-between bg-zinc-900 px-3 py-1 border border-zinc-800">
                  <span className="text-xs text-zinc-400">Replying to comment...</span>
                  <button type="button" onClick={() => setReplyTo(null)} className="text-zinc-500 hover:text-white"><X className="w-3 h-3" /></button>
                </div>
              )}
              <input 
                type="text" 
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Ask a question or leave a comment..." 
                className="w-full bg-zinc-900 border border-zinc-800 text-sm px-4 py-3 text-white" 
              />
            </div>
            <button type="submit" disabled={!commentText.trim()} className="bg-foreground text-background p-3 hover:opacity-90 disabled:opacity-50 mt-auto">
              <Send className="w-5 h-5" />
            </button>
          </form>
        ) : (
          <div className="mb-10 p-4 border border-zinc-800 text-sm text-zinc-400">
            Please log in to join the conversation.
          </div>
        )}

        <div className="space-y-6">
          {topLevelComments.length === 0 && !loadingComments ? (
            <p className="text-zinc-500 text-sm">No comments yet. Start the conversation!</p>
          ) : (
            topLevelComments.map(comment => (
              <div key={comment.id} className="space-y-3">
                <div className="bg-zinc-900/30 p-4 border border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-zinc-400">User</span>
                    <span className="text-[10px] text-zinc-500">{new Date(comment.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-white">{comment.content}</p>
                  <button onClick={() => setReplyTo(comment.id)} className="text-[10px] uppercase tracking-wide text-zinc-500 hover:text-white mt-3 block">Reply</button>
                </div>
                
                {/* Nested Replies */}
                {comments.filter(c => c.parent_id === comment.id).map(reply => (
                  <div key={reply.id} className="ml-8 bg-zinc-900/10 p-4 border-l border-zinc-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-zinc-400">User</span>
                      <span className="text-[10px] text-zinc-500">{new Date(reply.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-white">{reply.content}</p>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
      
    </div>
  );
}
