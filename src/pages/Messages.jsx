import { useEffect, useState, useRef } from "react";
import { MessageSquare, Check, CheckCircle2, Inbox, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { Navigate } from "react-router-dom";

export default function Messages() {
  const { user, isAuthenticated } = useAuth();
  const [inquiries, setInquiries] = useState([]);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    fetchInquiries();
    const channel = supabase
      .channel('customer-inbox-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_inquiries', filter: `user_id=eq.${user.id}` }, () => {
        fetchInquiries();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'customer_inquiry_messages' }, (payload) => {
        fetchInquiries();
        if (selectedInquiry && payload.new.inquiry_id === selectedInquiry.id) {
          setMessages(prev => [...prev, payload.new]);
          if (payload.new.is_admin) {
            markAsRead(selectedInquiry.id);
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, selectedInquiry]);

  useEffect(() => {
    if (selectedInquiry) {
      fetchMessages(selectedInquiry.id);
      if (selectedInquiry.has_unread_customer) {
        markAsRead(selectedInquiry.id);
      }
    }
  }, [selectedInquiry]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchInquiries = async () => {
    const { data } = await supabase
      .from("customer_inquiries")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (data) setInquiries(data);
  };

  const fetchMessages = async (id) => {
    const { data } = await supabase
      .from("customer_inquiry_messages")
      .select("*")
      .eq("inquiry_id", id)
      .order("created_at", { ascending: true });
    if (data) setMessages(data);
  };

  const markAsRead = async (id) => {
    await supabase.rpc('mark_messages_read', { p_inquiry_id: id, p_is_admin: false });
    setInquiries(prev => prev.map(i => i.id === id ? { ...i, has_unread_customer: false } : i));
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedInquiry) return;
    try {
      await supabase.from("customer_inquiry_messages").insert({
        inquiry_id: selectedInquiry.id,
        user_id: user.id,
        is_admin: false,
        content: replyText,
      });
      setReplyText("");
    } catch (err) {
      toast({ title: "Failed to send message", variant: "destructive" });
    }
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="pt-24 md:pt-32 pb-16 px-4 md:px-8 max-w-7xl mx-auto min-h-[calc(100vh-100px)]">
      <h1 className="font-display text-4xl mb-6">Messages</h1>
      
      <div className="flex h-[600px] border border-border">
        {/* Mobile View Toggle */}
        <div className={`w-full md:w-1/3 border-r border-border bg-card flex-col ${selectedInquiry ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-border bg-muted/30">
            <h2 className="font-display text-xl flex items-center gap-2">
              <Inbox className="w-5 h-5 text-[#C5A059]" /> Conversations
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {inquiries.map(inq => (
              <button
                key={inq.id}
                onClick={() => setSelectedInquiry(inq)}
                className={`w-full text-left p-4 border-b border-border transition-colors ${selectedInquiry?.id === inq.id ? "bg-muted" : "hover:bg-muted/50"} ${inq.has_unread_customer ? "bg-blue-500/5" : ""}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={`font-semibold text-sm ${inq.has_unread_customer ? "text-foreground" : "text-foreground/80"}`}>
                    {inq.inquiry_type}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{new Date(inq.updated_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-[9px] uppercase tracking-wide-2 bg-zinc-800 text-zinc-300 px-2 py-0.5">{inq.status}</span>
                  {inq.has_unread_customer && <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
                </div>
              </button>
            ))}
            {inquiries.length === 0 && (
              <p className="p-6 text-center text-xs text-muted-foreground">No messages found. Start a conversation by requesting a quote or contacting support.</p>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`w-full md:w-2/3 bg-background flex-col ${!selectedInquiry ? 'hidden md:flex' : 'flex'}`}>
          {selectedInquiry ? (
            <>
              <div className="p-4 border-b border-border flex justify-between items-center bg-card">
                <div className="flex items-center gap-3">
                  <button className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => setSelectedInquiry(null)}>
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h2 className="font-semibold text-lg">{selectedInquiry.inquiry_type}</h2>
                    <p className="text-xs text-muted-foreground">Ref: {selectedInquiry.id.substring(0, 8)}</p>
                  </div>
                </div>
                <span className="text-xs uppercase tracking-wide-2 text-[#C5A059]">{selectedInquiry.status}</span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, idx) => (
                  <div key={msg.id || idx} className={`flex ${!msg.is_admin ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] md:max-w-[75%] p-3 text-sm ${!msg.is_admin ? "bg-foreground text-background" : "bg-card text-foreground border border-border"}`}>
                      <p>{msg.content}</p>
                      <div className="flex items-center gap-1 justify-end mt-1 text-[10px] opacity-70">
                        <span>{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        {!msg.is_admin && (
                          msg.read_at ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Check className="w-3 h-3" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 border-t border-border bg-card">
                <form onSubmit={sendReply} className="flex gap-3">
                  <input
                    type="text"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-background border border-border px-4 py-2 text-sm text-foreground focus:outline-none focus:border-[#C5A059]"
                  />
                  <button type="submit" disabled={!replyText.trim()} className="bg-[#C5A059] text-black px-6 py-2 text-xs uppercase tracking-wide-2 hover:opacity-90 disabled:opacity-50">
                    Send
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
              <p>Select a conversation to view messages</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
