import { supabase } from "@/lib/supabase";

/**
 * Robust, privacy-conscious visitor tracking.
 * Generates an anonymous visitor ID (persisted across sessions)
 * and a session ID (resets when tab is closed).
 */

const KEYS = {
  VISITOR_ID: "sn_visitor_id",
  SESSION_ID: "sn_session_id",
};

function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function getVisitorId() {
  if (typeof window === "undefined") return "server";
  let vid = localStorage.getItem(KEYS.VISITOR_ID);
  if (!vid) {
    vid = generateId();
    localStorage.setItem(KEYS.VISITOR_ID, vid);
  }
  return vid;
}

export function getSessionId() {
  if (typeof window === "undefined") return "server";
  let sid = sessionStorage.getItem(KEYS.SESSION_ID);
  if (!sid) {
    sid = generateId();
    sessionStorage.setItem(KEYS.SESSION_ID, sid);
  }
  return sid;
}

let lastTrackedPath = null;

export async function trackWebsiteVisit(location) {
  if (!supabase || typeof window === "undefined") return;
  
  const currentPath = location.pathname;
  
  // Prevent duplicate tracking for the exact same path on rapid renders
  if (lastTrackedPath === currentPath) return;
  lastTrackedPath = currentPath;

  const visitorId = getVisitorId();
  const sessionId = getSessionId();

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;

    // The SQL table unique constraint will not block multiple visits if it's not unique on (session_id, page_path), 
    // but tracking every navigation might be noisy. For now we track all navigations to provide "Customer browsing activity".
    await supabase.from("website_visits").insert({
      visitor_id: visitorId,
      session_id: sessionId,
      page_path: currentPath,
      user_id: userId
    });
  } catch (err) {
    // Silently ignore to prevent disruption to user experience
    console.warn("Analytics tracking failed");
  }
}
