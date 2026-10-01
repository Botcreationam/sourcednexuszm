import { useState, useEffect, useRef } from "react";
import { X, Send, User, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";

export default function ProductChat({ product, open, onClose }) {
  const { user, isAuthenticated } = useAuth();
  
  const [inquiryId, setInquiryId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef(null);

  // If not authenticated, we need basic details to start a chat
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [needsGuestDetails, setNeedsGuestDetails] = useState(!isAuthenticated);

  useEffect(() => {
    if (open) {
      if (isAuthenticated) {
        setNeedsGuestDetails(false);
        findOrCreateInquiry();
      }
    } else {
      setInquiryId(null);
      setMessages([]);
    }
  }, [open, isAuthenticated]);

  useEffect(() => {
    if (inquiryId) {
      fetchMessages();
      
      const channel = supabase
        .channel(`chat-${inquiryId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "customer_inquiry_messages",
          filter: `inquiry_id=eq.${inquiryId}`
        }, (payload) => {
          setMessages(prev => [...prev, payload.new]);
          setTimeout(scrollToBottom, 100);
        })
        .subscribe();
        
      return () => {
        supabase.removeChannel(channel);
      }
    }
  }, [inquiryId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const findOrCreateInquiry = async () => {
    setLoading(true);
    try {
      // Look for an existing product_inquiry for this product + user
      let query = supabase.from("customer_inquiries")
        .select("id")
        .eq("inquiry_type", "product_inquiry")
        .contains("items", `[{"id":"${product.id}"}]`);
        
      if (user?.id) {
        query = query.eq("user_id", user.id);
      } else {
        query = query.eq("contact_number", guestPhone);
      }
      
      const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      
      if (data?.id) {
        setInquiryId(data.id);
      } else {
        // Create new inquiry thread
        const newInquiry = {
          user_id: user?.id || null,
          inquiry_type: "product_inquiry",
          customer_name: user?.user_metadata?.full_name || guestName || "Guest User",
          contact_number: guestPhone || "No Phone",
          email: user?.email || null,
          items: [{
            id: product.id,
            name: product.name,
            image: product.images?.[0] || null,
            quantity: 1,
            price: product.price
          }],
          status: "Pending",
          source: "website"
        };
        const { data: newRec, error: createErr } = await supabase.from("customer_inquiries").insert(newInquiry).select().single();
        if (createErr) throw createErr;
        setInquiryId(newRec.id);
      }
    } catch (err) {
      console.error("Chat init error:", err);
      toast({ title: "Chat Error", description: "Could not start chat session", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    const { data } = await supabase.from("customer_inquiry_messages")
      .select("*")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: true });
    if (data) {
      setMessages(data);
      setTimeout(scrollToBottom, 100);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !inquiryId) return;
    
    const text = inputText;
    setInputText("");
    
    // Optimistic UI can be handled by the realtime subscription, but we'll insert now
    try {
      await supabase.from("customer_inquiry_messages").insert({
        inquiry_id: inquiryId,
        user_id: user?.id || null,
        is_admin: false,
        content: text
      });
    } catch (err) {
      console.error("Failed to send message:", err);
      setInputText(text); // revert
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-[100] w-full max-w-sm bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-800 rounded overflow-hidden">
            {product.images?.[0] ? (
              <img src={product.images[0]} alt="" className="w-full h-full object-cover" />
            ) : null}
          </div>
          <div>
            <h3 className="font-medium text-sm text-white line-clamp-1">{product.name}</h3>
            <p className="text-[10px] text-zinc-400">Concierge Support</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {needsGuestDetails ? (
          <div className="m-auto w-full space-y-4">
            <h4 className="text-sm font-medium text-white text-center">Start a Chat</h4>
            <p className="text-xs text-zinc-400 text-center">Please provide your details so we can follow up with you.</p>
            <input 
              type="text" 
              placeholder="Your Name" 
              value={guestName} onChange={e => setGuestName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-sm px-3 py-2 text-white" 
            />
            <input 
              type="tel" 
              placeholder="Phone Number" 
              value={guestPhone} onChange={e => setGuestPhone(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-sm px-3 py-2 text-white" 
            />
            <button 
              onClick={() => {
                if (guestName.trim() && guestPhone.trim()) {
                  setNeedsGuestDetails(false);
                  findOrCreateInquiry();
                } else {
                  toast({ title: "Details required", description: "Please fill all fields", variant: "destructive" });
                }
              }}
              className="w-full bg-[#C5A059] text-black text-xs font-bold uppercase tracking-wide py-2"
            >
              Start Chat
            </button>
          </div>
        ) : loading ? (
          <div className="m-auto flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            <p className="text-xs text-zinc-500">Connecting...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center text-xs text-zinc-600 my-4">
              Chat started about {product.name}
            </div>
            {messages.map((msg) => {
              const isMine = !msg.is_admin;
              return (
                <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isMine ? "bg-[#C5A059]/20 border border-[#C5A059]/30 text-white" : "bg-zinc-800 border border-zinc-700 text-white"}`}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      {!needsGuestDetails && (
        <form onSubmit={sendMessage} className="p-3 border-t border-zinc-800 bg-zinc-900/50 flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Ask about this product..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
          />
          <button 
            type="submit" 
            disabled={!inputText.trim()}
            className="bg-[#C5A059] text-black p-2 rounded hover:bg-[#b08e4d] disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}
    </div>
  );
}
