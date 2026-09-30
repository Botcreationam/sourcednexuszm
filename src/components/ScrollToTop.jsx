import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const getHashId = (hash) => {
  const rawId = hash.slice(1);

  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
};

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;

    if (hash) {
      const id = getHashId(hash);
      let attempts = 0;
      const interval = window.setInterval(() => {
        const el = document.getElementById(id);
        attempts += 1;
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
          window.clearInterval(interval);
        } else if (attempts > 15) {
          window.clearInterval(interval);
        }
      }, 80);
      return () => window.clearInterval(interval);
    }

    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType]);

  return null;
}
