import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { X, Bell, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";

export default function NotificationsDrawer({ open, onClose }) {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!open || !isAuthenticated || !user) return;
    
    const fetchNotifications = async () => {
      // Fetch unread inquiries
      const { data, error } = await supabase
        .from("customer_inquiries")
        .select("*")
        .eq("user_id", user.id)
        .eq("has_unread_customer", true)
        .order("updated_at", { ascending: false });
        
      if (!error && data) {
        setNotifications(data.map(inq => ({
          id: inq.id,
          type: "message",
          title: "New Message from Admin",
          body: `Update regarding inquiry: ${inq.status}`,
          date: inq.updated_at,
          link: "/messages"
        })));
      }
    };
    
    fetchNotifications();
    
    const channel = supabase.channel('notifications-drawer')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_inquiries', filter: `user_id=eq.${user.id}` }, () => {
        fetchNotifications();
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [open, isAuthenticated, user]);

  const handleMarkAllAsRead = async () => {
    // Optimistically clear locally
    const unreadIds = notifications.map(n => n.id);
    setNotifications([]);
    
    // Process each unread inquiry (they will be caught by RLS if RPC not updated, but we try our best)
    for (const id of unreadIds) {
      await supabase.rpc('mark_messages_read', { p_inquiry_id: id, p_is_admin: false });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-xs sm:max-w-sm bg-background border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              <h2 className="font-display text-lg tracking-wide uppercase">Notifications</h2>
            </div>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button onClick={handleMarkAllAsRead} className="text-[9px] uppercase tracking-wide-2 text-muted-foreground hover:text-foreground mr-2">
                  Mark all read
                </button>
              )}
              <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-0">
            {notifications.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center h-full text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Bell className="w-8 h-8 opacity-40" />
                </div>
                <p className="font-display text-lg">No Notifications</p>
                <p className="text-xs mt-2 opacity-70 max-w-[200px]">You're all caught up! Important updates will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map(n => (
                  <Link 
                    key={n.id} 
                    to={n.link} 
                    onClick={onClose}
                    className="block p-5 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 bg-blue-500/10 p-2 rounded-full text-blue-500 shrink-0 border border-blue-500/20">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-snug">{n.body}</p>
                        <p className="text-[9px] text-muted-foreground mt-2.5 uppercase tracking-wide-2 opacity-80">
                          {new Date(n.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
