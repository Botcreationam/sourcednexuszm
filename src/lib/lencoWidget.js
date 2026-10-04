/**
 * Lenco inline checkout widget loader.
 *
 * Loads the official Lenco inline script (pay.lenco.co / pay.sandbox.lenco.co)
 * on demand, once, and resolves with the global LencoPay object. The widget
 * only ever receives the PUBLIC key; all sensitive verification happens on
 * the backend.
 */

const WIDGET_URLS = {
  production: "https://pay.lenco.co/js/v1/inline.js",
  sandbox: "https://pay.sandbox.lenco.co/js/v1/inline.js",
};

let loadingPromise = null;

export function loadLencoWidget(environment = "production") {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Lenco widget can only load in the browser"));
  }
  if (window.LencoPay) return Promise.resolve(window.LencoPay);
  if (loadingPromise) return loadingPromise;

  const url = WIDGET_URLS[environment] || WIDGET_URLS.production;
  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => {
      if (window.LencoPay) resolve(window.LencoPay);
      else reject(new Error("Lenco widget loaded but was unavailable"));
    };
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error("Could not load the Lenco payment widget"));
    };
    document.head.appendChild(script);
  });
  return loadingPromise;
}
