import { useEffect, useState, useRef } from "react";
import { MessageSquare, Check, CheckCircle2, Clock, Inbox, MailOpen, AlertCircle, Archive, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/use-toast";
export default function AdminInbox() {
  const [inquiries, setInquiries] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [customerTyping, setCustomerTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const broadcastChannelRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchInquiries();
    const channel = supabase
      .channel('admin-inbox-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_inquiries' }, () => {
        fetchInquiries();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'customer_inquiry_messages' }, (payload) => {
        fetchInquiries();
        if (selectedInquiry && payload.new.inquiry_id === selectedInquiry.id) {
          setMessages(prev => [...prev, payload.new]);
          if (!payload.new.is_admin) {
            markAsRead(selectedInquiry.id);
          }
        }
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (selectedInquiry && payload.payload.inquiry_id === selectedInquiry.id) {
          if (!payload.payload.is_admin) {
            setCustomerTyping(true);
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setCustomerTyping(false), 3000);
          }
        }
      })
      .subscribe();
      
    broadcastChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [selectedInquiry]);

  useEffect(() => {
    if (selectedInquiry) {
      fetchMessages(selectedInquiry.id);
      if (selectedInquiry.has_unread_admin) {
        markAsRead(selectedInquiry.id);
      }
    }
  }, [selectedInquiry]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchInquiries = async () => {
    const { data } = await supabase.from("customer_inquiries").select("*").order("updated_at", { ascending: false });
    if (data) setInquiries(data);
  };

  const fetchMessages = async (id) => {
    const { data } = await supabase.from("customer_inquiry_messages").select("*").eq("inquiry_id", id).order("created_at", { ascending: true });
    if (data) setMessages(data);
  };

  const markAsRead = async (id) => {
    await supabase.rpc('mark_messages_read', { p_inquiry_id: id, p_is_admin: true });
    setInquiries(prev => prev.map(i => i.id === id ? { ...i, has_unread_admin: false } : i));
  };

  const handleTyping = (e) => {
    setReplyText(e.target.value);
    if (selectedInquiry && broadcastChannelRef.current) {
      broadcastChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { is_admin: true, inquiry_id: selectedInquiry.id }
      });
    }
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedInquiry) return;
    try {
      await supabase.from("customer_inquiry_messages").insert({
        inquiry_id: selectedInquiry.id,
        is_admin: true,
        content: replyText,
      });
      setReplyText("");
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to send message", variant: "destructive" });
    }
  };

  const updateStatus = async (id, status) => {
    await supabase.from("customer_inquiries").update({ status }).eq("id", id);
    fetchInquiries();
    if (selectedInquiry?.id === id) setSelectedInquiry({ ...selectedInquiry, status });
  };

  const filteredInquiries = inquiries.filter(i => {
    if (activeTab === "unread") return i.has_unread_admin;
    if (activeTab === "active") return !["Completed", "Cancelled"].includes(i.status);
    if (activeTab === "archived") return ["Completed", "Cancelled"].includes(i.status);
    if (activeTab === "recent") return new Date(i.updated_at) > new Date(Date.now() - 86400000 * 3); // 3 days
    return true;
  });

  return (
    <div className="flex h-[calc(100vh-80px)] border border-border mt-4 mx-6 md:mx-10 max-w-7xl">
      {/* Sidebar / Inbox List */}
      <div className={`w-full md:w-1/3 border-r border-border bg-card flex-col ${selectedInquiry ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-border">
          <h1 className="font-display text-2xl mb-4">Admin Inbox</h1>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "All Conversations", icon: Inbox },
              { id: "unread", label: "Unread", icon: AlertCircle },
              { id: "active", label: "Active", icon: Clock },
              { id: "archived", label: "Archived", icon: Archive },
              { id: "recent", label: "Recent", icon: MailOpen },
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`text-[10px] uppercase tracking-wide px-3 py-1.5 flex items-center gap-1.5 border border-border ${activeTab === tab.id ? "bg-foreground text-background" : "hover:bg-muted text-muted-foreground"}`}
              >
                <tab.icon className="w-3 h-3" /> {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredInquiries.map(inq => (
            <button
              key={inq.id}
              onClick={() => setSelectedInquiry(inq)}
              className={`w-full text-left p-4 border-b border-border transition-colors ${selectedInquiry?.id === inq.id ? "bg-muted" : "hover:bg-muted/50"} ${inq.has_unread_admin ? "bg-blue-500/5" : ""}`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className={`font-semibold ${inq.has_unread_admin ? "text-foreground" : "text-muted-foreground"}`}>
                  {inq.customer_name || "Anonymous"}
                </span>
                <span className="text-[10px] text-muted-foreground">{new Date(inq.updated_at).toLocaleDateString()}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">{inq.email || inq.contact_number}</p>
              <div className="flex justify-between items-center mt-2">
                <span className="text-[9px] uppercase bg-zinc-800 text-zinc-300 px-2 py-0.5">{inq.status}</span>
                {inq.has_unread_admin && <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
              </div>
            </button>
          ))}
          {filteredInquiries.length === 0 && (
            <p className="p-6 text-center text-xs text-muted-foreground">No conversations found.</p>
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
                  <h2 className="font-semibold text-lg">{selectedInquiry.customer_name || "Anonymous"}</h2>
                  <p className="text-xs text-muted-foreground">Ref: {selectedInquiry.id.substring(0, 8)} • {selectedInquiry.inquiry_type}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <select 
                  value={selectedInquiry.status} 
                  onChange={e => updateStatus(selectedInquiry.id, e.target.value)}
                  className="bg-background border border-border text-xs px-2 py-1"
                >
                  {["Pending", "Reviewing", "Quoted", "Confirmed", "Completed", "Cancelled"].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, idx) => (
                <div key={msg.id || idx} className={`flex ${msg.is_admin ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] md:max-w-[75%] p-3 text-sm ${msg.is_admin ? "bg-[#C5A059]/20 text-[#E5C07B] border border-[#C5A059]/30" : "bg-muted text-foreground border border-border"}`}>
                    <p>{msg.content}</p>
                    <div className="flex items-center gap-1 justify-end mt-1 text-[10px] opacity-70">
                      <span>{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      {msg.is_admin && (
                        msg.read_at ? <CheckCircle2 className="w-3 h-3 text-blue-400" /> : <Check className="w-3 h-3" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {customerTyping && (
                <div className="flex justify-start">
                  <div className="max-w-[75%] p-3 text-sm bg-muted text-foreground border border-border flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-border bg-card">
              <form onSubmit={sendReply} className="flex gap-3">
                <input
                  type="text"
                  value={replyText}
                  onChange={handleTyping}
                  placeholder="Type a message to the customer..."
                  className="flex-1 bg-background border border-border px-4 py-2 text-sm text-foreground focus:outline-none focus:border-[#C5A059]"
                />
                <button type="submit" disabled={!replyText.trim()} className="bg-foreground text-background px-6 py-2 text-xs uppercase tracking-wide-2 hover:opacity-90 disabled:opacity-50">
                  Send
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
            <p>Select a conversation to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
}
