import { useState, useEffect, useRef } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/use-toast";

export default function AdminChatModal({ inquiry, open, onClose }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (open && inquiry) {
      fetchMessages();
      
      const channel = supabase
        .channel(`admin-chat-${inquiry.id}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "customer_inquiry_messages",
          filter: `inquiry_id=eq.${inquiry.id}`
        }, (payload) => {
          setMessages(prev => [...prev, payload.new]);
          setTimeout(scrollToBottom, 100);
        })
        .subscribe();
        
      return () => {
        supabase.removeChannel(channel);
      }
    }
  }, [open, inquiry]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = async () => {
    setLoading(true);
    const { data } = await supabase.from("customer_inquiry_messages")
      .select("*")
      .eq("inquiry_id", inquiry.id)
      .order("created_at", { ascending: true });
    if (data) {
      setMessages(data);
      setTimeout(scrollToBottom, 100);
    }
    setLoading(false);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !inquiry.id) return;
    
    const text = inputText;
    setInputText("");
    
    try {
      await supabase.from("customer_inquiry_messages").insert({
        inquiry_id: inquiry.id,
        user_id: null, // admin action
        is_admin: true,
        content: text
      });
    } catch (err) {
      console.error("Failed to send message:", err);
      setInputText(text); // revert
      toast({ title: "Error", description: "Could not send message.", variant: "destructive" });
    }
  };

  if (!open || !inquiry) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-[100] w-full max-w-sm bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div>
          <h3 className="font-medium text-sm text-white">Chat with {inquiry.customer_name || "Customer"}</h3>
          <p className="text-[10px] text-zinc-400 font-mono">{inquiry.id}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {loading ? (
          <div className="m-auto flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center text-xs text-zinc-600 my-4">
              Chat started for inquiry/quote
            </div>
            {messages.map((msg) => {
              const isAdmin = msg.is_admin;
              return (
                <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isAdmin ? "bg-blue-500/20 border border-blue-500/30 text-white" : "bg-zinc-800 border border-zinc-700 text-white"}`}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form onSubmit={sendMessage} className="p-3 border-t border-zinc-800 bg-zinc-900/50 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder="Reply as Admin..."
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
        />
        <button 
          type="submit" 
          disabled={!inputText.trim()}
          className="bg-blue-600 text-white p-2 rounded hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
