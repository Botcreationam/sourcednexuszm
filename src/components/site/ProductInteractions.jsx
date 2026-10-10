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
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [experienceDetails, setExperienceDetails] = useState("");
  const [userReview, setUserReview] = useState(null);
  
  // Comment Form
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editingComment, setEditingComment] = useState(null);

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
          setReviewTitle(mine.title || "");
          setReviewText(mine.review_text || "");
          setExperienceDetails(mine.experience_details || "");
        }
      }
    }
    setLoadingReviews(false);
  };

  const fetchComments = async () => {
    const { data } = await supabase.from("product_comments").select("*").eq("product_id", productId).order("created_at", { ascending: true });
    if (data) setComments(data);
    setLoadingComments(false);
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) return toast({ title: "Please login to review" });
    if (rating === 0) return toast({ title: "Please select a rating", variant: "destructive" });
    
    try {
      const { error } = await supabase.rpc("upsert_product_review", {
        p_product_id: productId,
        p_rating: rating,
        p_title: reviewTitle,
        p_review_text: reviewText,
        p_experience_details: experienceDetails
      });
      if (error) throw error;
      toast({ title: userReview ? "Review updated (Pending Approval)" : "Review submitted for moderation" });
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
      setReviewTitle("");
      setReviewText("");
      setExperienceDetails("");
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
      if (editingComment) {
        await supabase.from("product_comments").update({ content: commentText }).eq("id", editingComment.id);
        toast({ title: "Comment updated" });
      } else {
        await supabase.from("product_comments").insert({
          product_id: productId,
          user_id: user.id,
          user_name: user.user_metadata?.name || user.email?.split("@")[0] || "Anonymous",
          content: commentText,
          parent_id: replyTo
        });
        toast({ title: "Comment posted" });
      }
      setCommentText("");
      setReplyTo(null);
      setEditingComment(null);
    } catch (err) {
      toast({ title: "Error posting comment", variant: "destructive" });
    }
  };

  const deleteComment = async (id) => {
    try {
      await supabase.from("product_comments").delete().eq("id", id);
      toast({ title: "Comment deleted" });
    } catch (err) {
      toast({ title: "Error deleting comment", variant: "destructive" });
    }
  };

  const startEditComment = (comment) => {
    setEditingComment(comment);
    setCommentText(comment.content);
    setReplyTo(comment.parent_id);
    document.getElementById("comment-input")?.focus();
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
              <label className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1 block">Your Rating</label>
              {renderStars(rating, setRating, hoverRating, setHoverRating)}
            </div>
            <input 
              type="text"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              placeholder="Review Title"
              className="w-full bg-zinc-950 border border-zinc-800 text-sm p-3 text-white mb-3"
            />
            <textarea 
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Share your thoughts about this product..."
              className="w-full bg-zinc-950 border border-zinc-800 text-sm p-3 text-white mb-3 min-h-[80px]"
            />
            <textarea 
              value={experienceDetails}
              onChange={(e) => setExperienceDetails(e.target.value)}
              placeholder="Optional: Product experience details (e.g., used for 2 weeks, great battery...)"
              className="w-full bg-zinc-950 border border-zinc-800 text-sm p-3 text-zinc-300 mb-3 min-h-[60px]"
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
                <div className="flex items-center gap-3 mb-1">
                  {renderStars(r.rating)}
                  <span className="text-xs text-zinc-500">{new Date(r.created_at).toLocaleDateString()}</span>
                  {r.status === "pending" && <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 ml-auto">Pending Approval</span>}
                </div>
                {r.title && <h4 className="text-sm font-semibold text-white mb-1">{r.title}</h4>}
                <p className="text-sm text-zinc-300">{r.review_text}</p>
                {r.experience_details && (
                  <div className="mt-2 text-xs text-zinc-500 italic bg-zinc-900/50 p-2 border-l-2 border-zinc-700">
                    Experience: {r.experience_details}
                  </div>
                )}
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
              {replyTo && !editingComment && (
                <div className="flex items-center justify-between bg-zinc-900 px-3 py-1 border border-zinc-800">
                  <span className="text-xs text-zinc-400">Replying to comment...</span>
                  <button type="button" onClick={() => setReplyTo(null)} className="text-zinc-500 hover:text-white"><X className="w-3 h-3" /></button>
                </div>
              )}
              {editingComment && (
                <div className="flex items-center justify-between bg-zinc-900 px-3 py-1 border border-zinc-800">
                  <span className="text-xs text-zinc-400">Editing comment...</span>
                  <button type="button" onClick={() => { setEditingComment(null); setCommentText(""); setReplyTo(null); }} className="text-zinc-500 hover:text-white"><X className="w-3 h-3" /></button>
                </div>
              )}
              <input 
                id="comment-input"
                aria-label="Ask a question or leave a comment"
                type="text" 
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Ask a question or leave a comment..." 
                className="w-full bg-zinc-900 border border-zinc-800 text-sm px-4 py-3 text-white" 
              />
            </div>
            <button type="submit" aria-label="Post comment" disabled={!commentText.trim()} className="bg-foreground text-background p-3 hover:opacity-90 disabled:opacity-50 mt-auto">
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
                    <span className="text-xs font-medium text-zinc-400">{comment.user_name || "Anonymous"}</span>
                    <span className="text-[10px] text-zinc-500">{new Date(comment.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-white">{comment.content}</p>
                  <div className="flex gap-4 mt-3">
                    <button onClick={() => setReplyTo(comment.id)} className="text-[10px] uppercase tracking-wide text-zinc-500 hover:text-white">Reply</button>
                    {user?.id === comment.user_id && (
                      <>
                        <button onClick={() => startEditComment(comment)} className="text-[10px] uppercase tracking-wide text-blue-500 hover:text-blue-400">Edit</button>
                        <button onClick={() => deleteComment(comment.id)} className="text-[10px] uppercase tracking-wide text-red-500 hover:text-red-400">Delete</button>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Nested Replies */}
                {comments.filter(c => c.parent_id === comment.id).map(reply => (
                  <div key={reply.id} className="ml-8 bg-zinc-900/10 p-4 border-l border-zinc-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-zinc-400">{reply.user_name || "Anonymous"}</span>
                      <span className="text-[10px] text-zinc-500">{new Date(reply.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-white">{reply.content}</p>
                    {user?.id === reply.user_id && (
                      <div className="flex gap-4 mt-3">
                        <button onClick={() => startEditComment(reply)} className="text-[10px] uppercase tracking-wide text-blue-500 hover:text-blue-400">Edit</button>
                        <button onClick={() => deleteComment(reply.id)} className="text-[10px] uppercase tracking-wide text-red-500 hover:text-red-400">Delete</button>
                      </div>
                    )}
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
