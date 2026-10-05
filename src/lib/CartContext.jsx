import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import { getUserCartAndWishlist, saveUserCartAndWishlist } from "./supabase";
import { toggleProductLike, isProductLiked } from "./recommendations";
import {
  getCartItemKey,
  mergeCartItems,
  mergeWishlists,
  normalizeCart,
} from "./cartMerge";

const CartContext = createContext(null);

// v2: renamed from sn_cart_v1 / sn_wishlist_v1 / sn_cart_owner on 2026-10-06.
// A real cross-account cart leak was traced to these exact keys (see
// AuthContext.jsx logout() history + the race fixed below); renaming
// guarantees every browser starts clean under the fixed logic instead of
// inheriting a possibly-contaminated echo from before the fix.
const CART_STORAGE_KEY = "sn_cart_v2";
const WISHLIST_STORAGE_KEY = "sn_wishlist_v2";
// Tracks WHO the locally stored cart belongs to:
//   "guest"  -> genuine anonymous guest cart, safe to merge into an account on login
//   <userId> -> an echo of that authenticated account's cart, NEVER merged into another account
const CART_OWNER_KEY = "sn_cart_owner_v2";

function getLocalData(key, fallback = []) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`Could not read ${key} from localStorage:`, err);
    return fallback;
  }
}

function setLocalData(key, data) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn(`Could not write ${key} to localStorage:`, err);
  }
}

function getLocalOwner() {
  if (typeof window === "undefined") return "guest";
  try {
    return localStorage.getItem(CART_OWNER_KEY) || "guest";
  } catch {
    return "guest";
  }
}

function setLocalOwner(owner) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CART_OWNER_KEY, owner || "guest");
  } catch {}
}

// Re-export for backwards compatibility (used by callers importing from CartContext)
export { getCartItemKey };

export function CartProvider({ children }) {
  const { user, isAuthenticated } = useAuth();

  const [cart, setCart] = useState(() => getLocalData(CART_STORAGE_KEY, []));
  const [wishlist, setWishlist] = useState(() => getLocalData(WISHLIST_STORAGE_KEY, []));

  // Drawer / Modal visibility state
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [inquiryItems, setInquiryItems] = useState([]);

  const isInitialSyncDone = useRef(false);
  const prevUserId = useRef(null);
  // Set while we reset local state on logout so the persist effect doesn't
  // write the previous account's in-memory cart back to localStorage (this
  // was the root cause of removed items resurrecting and carts bleeding
  // between accounts after logout/login).
  const isResettingRef = useRef(false);

  // 1. Sync cart & wishlist with the authenticated account.
  //    - A genuine GUEST cart (owner marker === "guest") is merged into the
  //      account's database cart once, without duplicates, then marked as the
  //      account's echo.
  //    - Local data belonging to any other account is IGNORED (no bleeding).
  //    - On logout, the in-memory state and local echo are cleared so the next
  //      account starts clean.
  useEffect(() => {
    // --- LOGOUT / SIGNED-OUT TRANSITION ---
    if (!isAuthenticated || !user?.id) {
      if (prevUserId.current !== null) {
        // We were signed in and just signed out: wipe local state + echo.
        isResettingRef.current = true;
        prevUserId.current = null;
        isInitialSyncDone.current = false;
        setCart([]);
        setWishlist([]);
        setLocalData(CART_STORAGE_KEY, []);
        setLocalData(WISHLIST_STORAGE_KEY, []);
        setLocalOwner("guest");
        // Clear the guard on a microtask, NOT synchronously. The sibling
        // "persist" effect below shares this same commit's effect-flush and
        // still closes over the PRE-reset cart/wishlist values; if the flag
        // were cleared synchronously (e.g. in a `finally`) it would already
        // read `false` by the time that effect runs and re-persist the
        // stale, about-to-be-replaced cart — undoing the reset we just did.
        // A microtask only runs once this whole synchronous flush finishes.
        queueMicrotask(() => {
          isResettingRef.current = false;
        });
      }
      return;
    }

    // --- LOGIN / SESSION RESTORE ---
    const userId = user.id;
    if (prevUserId.current === userId && isInitialSyncDone.current) {
      return;
    }
    prevUserId.current = userId;

    let cancelled = false;
    (async () => {
      try {
        const owner = getLocalOwner();
        const dbData = await getUserCartAndWishlist(userId);

        if (cancelled) return;

        // Read FAILED (offline / expired token / RLS hiccup): do NOT treat it
        // as "account cart is empty" — that would wipe this device's echo.
        // Keep whatever is locally present (it is this account's own echo, or
        // a yet-to-be-merged guest cart) and stay marked so a later
        // successful sync can reconcile with the database.
        if (dbData === null) {
          setCart((prev) => prev);
          setWishlist((prev) => prev);
          isInitialSyncDone.current = true;
          return;
        }

        let mergedCart;
        let mergedWishlist;
        let guestDataWasMerged = false;

        if (owner === "guest") {
          // Genuine anonymous browsing before login -> merge once, no duplicates.
          const localCart = getLocalData(CART_STORAGE_KEY, []);
          const localWishlist = getLocalData(WISHLIST_STORAGE_KEY, []);
          mergedCart = mergeCartItems(dbData.cart, localCart);
          mergedWishlist = mergeWishlists(dbData.wishlist, localWishlist);
          guestDataWasMerged = localCart.length > 0 || localWishlist.length > 0;
        } else if (owner === userId) {
          // Local data is just this account's echo -> database is authoritative.
          // This is what makes removals stay removed across logout/login,
          // refreshes and devices.
          mergedCart = normalizeCart(dbData.cart);
          mergedWishlist = dbData.wishlist || [];
        } else {
          // Local data belongs to a DIFFERENT account -> discard it entirely.
          mergedCart = normalizeCart(dbData.cart);
          mergedWishlist = dbData.wishlist || [];
        }

        setCart(mergedCart);
        setWishlist(mergedWishlist);
        setLocalData(CART_STORAGE_KEY, mergedCart);
        setLocalData(WISHLIST_STORAGE_KEY, mergedWishlist);
        setLocalOwner(userId);

        if (guestDataWasMerged) {
          // Persist the merged result so the guest items become part of the account.
          await saveUserCartAndWishlist(userId, mergedCart, mergedWishlist);
        }
        isInitialSyncDone.current = true;
      } catch (err) {
        console.warn("Failed to sync cart/wishlist with user profile:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  // 2. Persist cart & wishlist changes locally and to the DB (if logged in).
  //    While signed out, the owner marker is preserved so a previous account's
  //    echo is never mistaken for a new guest cart.
  useEffect(() => {
    if (isResettingRef.current) return;
    setLocalData(CART_STORAGE_KEY, cart);
    setLocalData(WISHLIST_STORAGE_KEY, wishlist);
    if (!isAuthenticated || !user?.id) {
      // Preserve an existing account echo marker; otherwise mark as guest data.
      const owner = getLocalOwner();
      if (owner === "guest") setLocalOwner("guest");
      return;
    }
    setLocalOwner(user.id);
    if (isInitialSyncDone.current) {
      // Save immediately to avoid data loss on page unload/logout
      saveUserCartAndWishlist(user.id, cart, wishlist);
    }
  }, [cart, wishlist, isAuthenticated, user?.id]);

  // --- Cart Operations ---
  const addToCart = useCallback((product, options = {}) => {
    if (!product || !product.id) return;

    const {
      quantity = 1,
      selectedSize = null,
      selectedColor = null,
      selectedGrade = null,
      specifications = "",
      openDrawer = true,
    } = options;

    // Strict preservation of the exact original product image selected
    const exactImage =
      options.selectedImage ||
      (Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null) ||
      product.image ||
      null;

    // Preserve the selected grade exactly: the grade name is part of the line
    // item key so two grades of the same product are two separate lines, and
    // the grade's own price/original price/discount are locked into the item.
    const gradeName = selectedGrade?.name || null;
    const itemKey = getCartItemKey(product.id, selectedSize, selectedColor, gradeName);
    const gradePrice =
      options.price !== undefined && options.price !== null
        ? options.price
        : selectedGrade?.price ?? product.price ?? "Price on Request";
    const gradeOriginalPrice =
      options.originalPrice ?? selectedGrade?.original_price ?? null;
    const gradeDiscount =
      options.discountPercentage ?? selectedGrade?.discount_percentage ?? null;

    setCart((prev) => {
      const index = prev.findIndex((i) => i.itemKey === itemKey);
      if (index > -1) {
        const next = [...prev];
        next[index] = {
          ...next[index],
          quantity: next[index].quantity + Number(quantity || 1),
          specifications: specifications || next[index].specifications || "",
        };
        return next;
      }

      const newItem = {
        itemKey,
        id: product.id,
        name: product.name,
        category: product.category || "General",
        price: gradePrice,
        image: exactImage,
        quantity: Math.max(1, Number(quantity || 1)),
        selectedSize: selectedSize || null,
        selectedColor: selectedColor || null,
        // Grade data (locked at add-to-cart time). selectedGrade is kept as an
        // object so the existing InquiryModal / WhatsApp builders keep working.
        selectedGrade: selectedGrade || null,
        gradeName,
        gradePrice,
        gradeOriginalPrice,
        gradeDiscount,
        gradeStockStatus: selectedGrade?.stock_status || null,
        specifications: specifications || "",
        addedAt: new Date().toISOString(),
      };

      return [...prev, newItem];
    });

    if (openDrawer) {
      setIsCartOpen(true);
    }
  }, []);

  const removeFromCart = useCallback((cartItemKeyOrId) => {
    setCart((prev) => prev.filter((i) => i.itemKey !== cartItemKeyOrId && i.id !== cartItemKeyOrId));
  }, []);

  const updateCartQuantity = useCallback((cartItemKey, newQty) => {
    const qty = Number(newQty);
    if (qty <= 0) {
      removeFromCart(cartItemKey);
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.itemKey === cartItemKey ? { ...item, quantity: qty } : item))
    );
  }, [removeFromCart]);

  const updateCartItemSpecs = useCallback((cartItemKey, specs) => {
    setCart((prev) =>
      prev.map((item) => (item.itemKey === cartItemKey ? { ...item, specifications: specs } : item))
    );
  }, []);

  // Clears the CURRENT user's cart only, and reports whether the clear
  // actually persisted. Guest carts have nothing to verify server-side, so
  // a local-only clear is already the complete, correct operation for them.
  // For a signed-in user, the frontend state is only updated to empty AFTER
  // the database write is confirmed — callers (e.g. the "Clear Cart" button)
  // should wait for this promise before showing a success message, so the
  // UI never claims a clear that didn't actually happen.
  const clearCart = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setCart([]);
      setLocalData(CART_STORAGE_KEY, []);
      return { success: true };
    }

    const result = await saveUserCartAndWishlist(user.id, [], wishlist);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    setCart([]);
    setLocalData(CART_STORAGE_KEY, []);
    return { success: true };
  }, [isAuthenticated, user?.id, wishlist]);

  const isInCart = useCallback((productId) => {
    return cart.some((item) => item.id === productId);
  }, [cart]);

  const cartCount = cart.reduce((acc, item) => acc + (item.quantity || 1), 0);

  // --- Wishlist Operations ---
  const toggleWishlist = useCallback((product) => {
    if (!product || !product.id) return false;

    let nextState = false;
    setWishlist((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) {
        nextState = false;
        return prev.filter((p) => p.id !== product.id);
      } else {
        nextState = true;
        const exactImage =
          (Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null) ||
          product.image ||
          null;
        const savedItem = {
          id: product.id,
          name: product.name,
          category: product.category,
          price: product.price || "Price on Request",
          image: exactImage,
          images: product.images || (exactImage ? [exactImage] : []),
          status: product.status || "available",
          sizes: product.sizes || [],
          colors: product.colors || [],
        };
        return [...prev, savedItem];
      }
    });

    // Mirror to recommendation personalization
    try {
      toggleProductLike(product.id);
    } catch {}

    return nextState;
  }, []);

  const isInWishlist = useCallback((productId) => {
    return wishlist.some((p) => p.id === productId) || isProductLiked(productId);
  }, [wishlist]);

  const removeFromWishlist = useCallback((productId) => {
    setWishlist((prev) => prev.filter((p) => p.id !== productId));
  }, []);

  const clearWishlist = useCallback(() => {
    setWishlist([]);
    setLocalData(WISHLIST_STORAGE_KEY, []);
    if (isAuthenticated && user?.id) {
      saveUserCartAndWishlist(user.id, cart, []);
    }
  }, [isAuthenticated, user?.id, cart]);

  const wishlistCount = wishlist.length;

  // --- Inquiry Modal Trigger ---
  const openInquiryModal = useCallback((customItems = null) => {
    if (Array.isArray(customItems) && customItems.length > 0) {
      setInquiryItems(customItems);
    } else {
      setInquiryItems(cart);
    }
    setIsInquiryModalOpen(true);
  }, [cart]);

  const closeInquiryModal = useCallback(() => {
    setIsInquiryModalOpen(false);
  }, []);

  const value = {
    cart,
    cartCount,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    updateCartItemSpecs,
    clearCart,
    isInCart,
    isCartOpen,
    openCart: () => setIsCartOpen(true),
    closeCart: () => setIsCartOpen(false),

    wishlist,
    wishlistCount,
    toggleWishlist,
    isInWishlist,
    removeFromWishlist,
    clearWishlist,
    isWishlistOpen,
    openWishlist: () => setIsWishlistOpen(true),
    closeWishlist: () => setIsWishlistOpen(false),

    isInquiryModalOpen,
    inquiryItems,
    openInquiryModal,
    closeInquiryModal,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
