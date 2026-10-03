import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import { getUserCartAndWishlist, saveUserCartAndWishlist } from "./supabase";
import { toggleProductLike, isProductLiked } from "./recommendations";

const CartContext = createContext(null);

const CART_STORAGE_KEY = "sn_cart_v1";
const WISHLIST_STORAGE_KEY = "sn_wishlist_v1";

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

// Generate distinct key for cart items by ID + selected size + selected color
export function getCartItemKey(productId, size = null, color = null) {
  return `${productId || "item"}_${size || "std"}_${color || "std"}`;
}

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

  // 1. Sync guest cart & wishlist to/from database when user logs in
  useEffect(() => {
    async function syncUserData() {
      if (!isAuthenticated || !user?.id) {
        prevUserId.current = null;
        isInitialSyncDone.current = false;
        return;
      }

      if (prevUserId.current === user.id && isInitialSyncDone.current) {
        return;
      }

      prevUserId.current = user.id;

      try {
        const dbData = await getUserCartAndWishlist(user.id);
        const localCart = getLocalData(CART_STORAGE_KEY, []);
        const localWishlist = getLocalData(WISHLIST_STORAGE_KEY, []);

        // Merge cart: avoid duplicate item keys, favor local or combine quantities
        const cartMap = new Map();
        (dbData.cart || []).forEach((item) => {
          const key = item.itemKey || getCartItemKey(item.id, item.selectedSize, item.selectedColor);
          cartMap.set(key, { ...item, itemKey: key });
        });
        (localCart || []).forEach((item) => {
          const key = item.itemKey || getCartItemKey(item.id, item.selectedSize, item.selectedColor);
          if (cartMap.has(key)) {
            // merge quantity
            const existing = cartMap.get(key);
            cartMap.set(key, { ...existing, quantity: Math.max(existing.quantity, item.quantity) });
          } else {
            cartMap.set(key, { ...item, itemKey: key });
          }
        });
        const mergedCart = Array.from(cartMap.values());

        // Merge wishlist: avoid duplicate product IDs
        const wishlistMap = new Map();
        (dbData.wishlist || []).forEach((item) => {
          if (item?.id) wishlistMap.set(item.id, item);
        });
        (localWishlist || []).forEach((item) => {
          if (item?.id && !wishlistMap.has(item.id)) {
            wishlistMap.set(item.id, item);
          }
        });
        const mergedWishlist = Array.from(wishlistMap.values());

        setCart(mergedCart);
        setWishlist(mergedWishlist);
        setLocalData(CART_STORAGE_KEY, mergedCart);
        setLocalData(WISHLIST_STORAGE_KEY, mergedWishlist);

        // Update database with the merged set
        await saveUserCartAndWishlist(user.id, mergedCart, mergedWishlist);
        isInitialSyncDone.current = true;
      } catch (err) {
        console.warn("Failed to sync cart/wishlist with user profile:", err);
      }
    }

    syncUserData();
  }, [isAuthenticated, user?.id]);

  // 2. Persist cart & wishlist changes locally and to DB (if logged in)
  useEffect(() => {
    setLocalData(CART_STORAGE_KEY, cart);
    setLocalData(WISHLIST_STORAGE_KEY, wishlist);
    if (isAuthenticated && user?.id && isInitialSyncDone.current) {
      const timer = setTimeout(() => {
        saveUserCartAndWishlist(user.id, cart, wishlist);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [cart, wishlist, isAuthenticated, user?.id]);

  // --- Cart Operations ---
  const addToCart = useCallback((product, options = {}) => {
    if (!product || !product.id) return;

    const {
      quantity = 1,
      selectedSize = null,
      selectedColor = null,
      specifications = "",
      openDrawer = true,
    } = options;

    // Strict preservation of the exact original product image selected
    const exactImage =
      options.selectedImage ||
      (Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null) ||
      product.image ||
      null;

    const itemKey = getCartItemKey(product.id, selectedSize, selectedColor);

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
        price: product.price || "Price on Request",
        image: exactImage,
        quantity: Math.max(1, Number(quantity || 1)),
        selectedSize: selectedSize || null,
        selectedColor: selectedColor || null,
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

  const clearCart = useCallback(() => {
    setCart([]);
    setLocalData(CART_STORAGE_KEY, []);
    if (isAuthenticated && user?.id) {
      saveUserCartAndWishlist(user.id, [], wishlist);
    }
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
