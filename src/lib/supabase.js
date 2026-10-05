import { createClient } from '@supabase/supabase-js';

const getEnv = (key) => {
  if (typeof window !== 'undefined' && window.__ENV__ && window.__ENV__[key]) {
    return window.__ENV__[key];
  }
  return import.meta.env[key] || '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL') || 'https://zprzxqdcqeywopwxouzu.supabase.co';
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseAnonKey.trim().length > 0);

// Supabase client instance (or null if not yet configured)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

/**
 * Validate an image file for type, extension, size, and magic bytes
 * Prevents disguised executable / malicious payloads from being uploaded.
 * @param {File|Blob} file
 * @param {object} [options]
 * @param {number} [options.maxSizeMB=5] Max size in megabytes
 * @returns {Promise<boolean>}
 */
export async function validateImageFile(file, { maxSizeMB = 5 } = {}) {
  if (!file) {
    throw new Error('Please select an image file to upload.');
  }

  // 1. Check file size (5MB default limit)
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`The selected image exceeds the maximum allowed size of ${maxSizeMB}MB.`);
  }

  if (file.size === 0) {
    throw new Error('The selected file is empty.');
  }

  // 2. Check file extension
  const fileName = (file.name || '').toLowerCase();
  const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const hasValidExt = validExtensions.some((ext) => fileName.endsWith(ext));
  if (fileName && !hasValidExt) {
    throw new Error('Only JPEG, PNG, and WebP images are allowed.');
  }

  // 3. Check declared MIME type
  const validMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (file.type && !validMimes.includes(file.type.toLowerCase())) {
    throw new Error('Unsupported image format. Please upload a JPG, PNG, or WebP photo.');
  }

  // 4. Verify magic bytes (file signature)
  try {
    const headerSlice = file.slice(0, 16);
    const buffer = await headerSlice.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // JPEG signature: FF D8 FF
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const isPng =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;

    // WebP signature: "RIFF" at offset 0, "WEBP" at offset 8
    const isRiff =
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const isWebp =
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;

    if (!isJpeg && !isPng && !(isRiff && isWebp)) {
      throw new Error('File signature verification failed. The file is not a valid image.');
    }
  } catch (err) {
    if (err.message && err.message.includes('signature')) throw err;
    // If FileReader/slice fails in older environment, log warning but don't hard block
    console.warn('Could not read image magic bytes:', err);
  }

  return true;
}

/**
 * Upload an image file to Supabase Storage and get the public CDN URL (for public catalogs)
 * @param {File|Blob} file The file to upload
 * @param {'product-images'|'category-images'} bucket Bucket name
 * @param {string} [customPath] Optional custom filename / path
 * @returns {Promise<string>} The public URL of the uploaded image
 */
export async function uploadImageToSupabase(file, bucket = 'product-images', customPath) {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  await validateImageFile(file);

  const fileExt = file.name ? file.name.split('.').pop().toLowerCase() : 'jpg';
  const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(fileExt) ? fileExt : 'jpg';
  const randomSuffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const fileName = customPath || `${randomSuffix}.${cleanExt}`;
  const filePath = `${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '31536000',
      contentType: file.type || 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Securely upload customer pre-order photo into the private 'preorder-uploads' bucket.
 * Files are isolated in per-user or randomized folders and never publicly exposed.
 * @param {File|Blob} file
 * @param {string} [userId]
 * @returns {Promise<string>} The storage path within 'preorder-uploads'
 */
export async function uploadSecurePreorderImage(file, userId) {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  await validateImageFile(file, { maxSizeMB: 5 });

  const fileExt = file.name ? file.name.split('.').pop().toLowerCase() : 'jpg';
  const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(fileExt) ? fileExt : 'jpg';
  const randomId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

  const folder = userId || 'authenticated';
  const storagePath = `${folder}/${randomId}.${cleanExt}`;

  const { error } = await supabase.storage
    .from('preorder-uploads')
    .upload(storagePath, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });

  if (error) {
    throw error;
  }

  // Return the relative storage path inside the private bucket
  return storagePath;
}

/**
 * Generate a short-lived signed URL for a private preorder image.
 * Falls back to returning original string if it is already an external HTTP URL.
 * @param {string} storagePath
 * @param {number} [expiresInSeconds=3600]
 * @returns {Promise<string>}
 */
export async function getSecurePreorderImageUrl(storagePath, expiresInSeconds = 3600) {
  if (!storagePath) return '';
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
    return storagePath;
  }
  if (!supabase) return storagePath;

  try {
    const { data, error } = await supabase.storage
      .from('preorder-uploads')
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.warn('Could not generate signed URL for preorder image:', error);
      return storagePath;
    }
    return data.signedUrl;
  } catch (err) {
    console.warn('Error signing preorder image URL:', err);
    return storagePath;
  }
}

/**
 * Fetch products from Supabase
 */
export async function getSupabaseProducts({ category, status = 'all', limit = 100 } = {}) {
  if (!supabase) return [];

  let query = supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (category && category !== 'All') {
    query = query.eq('category', category);
  }
  if (status && status !== 'all') {
    query = query.eq('status', status);
  } else if (status === 'all') {
    query = query.neq('status', 'hidden');
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Fetch categories from Supabase
 */
export async function getSupabaseCategories() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Submit customer preorder to Supabase with authenticated user_id
 */
export async function createSupabasePreorder(formData, user = null) {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const payload = {
    customer_name: formData.customer_name?.trim(),
    phone: formData.phone?.trim() || null,
    whatsapp: formData.whatsapp?.trim() || null,
    category: formData.category || 'Other',
    size: formData.size || null,
    color: formData.color || null,
    message: formData.message?.trim() || null,
    requested_image: formData.requested_image || null,
    status: 'new',
    user_id: user?.id || null,
  };

  const { data, error } = await supabase
    .from('preorders')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Submit a customer quote request / product inquiry to Supabase
 */
export async function submitCustomerInquiry(inquiryData, user = null) {
  if (!supabase) {
    // Submit via backend API endpoint if supabase is not direct
    const response = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...inquiryData, user_id: user?.id || null }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to submit inquiry.');
    }
    return response.json();
  }

  const payload = {
    user_id: user?.id || null,
    inquiry_type: inquiryData.inquiry_type || 'quote_request',
    customer_name: inquiryData.customer_name?.trim(),
    contact_number: inquiryData.contact_number?.trim(),
    email: inquiryData.email?.trim() || user?.email || null,
    items: Array.isArray(inquiryData.items) ? inquiryData.items : [],
    total_items: inquiryData.items?.length || 1,
    specifications: inquiryData.specifications?.trim() || null,
    additional_instructions: inquiryData.additional_instructions?.trim() || null,
    status: 'Pending',
    source: inquiryData.source || 'website',
  };

  const { data, error } = await supabase
    .from('customer_inquiries')
    .insert([payload])
    .select()
    .single();

  if (error) {
    // If the table doesn't exist yet, attempt backend fallback API
    console.warn('Supabase customer_inquiries insert error, attempting backend API fallback:', error);
    try {
      const resp = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) return await resp.json();
    } catch {}
    throw error;
  }
  return data;
}

/**
 * Fetch customer cart and wishlist from user_profiles table in Supabase
 */
export async function getUserCartAndWishlist(userId) {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('cart, wishlist')
      .eq('id', userId)
      .maybeSingle();

    // Distinguish "genuinely no profile/cart" (safe empty) from a FAILED read
    // (network error, expired token, RLS hiccup). Returning null on failure
    // lets CartContext keep the local echo instead of replacing a user's cart
    // with an empty one just because one request failed.
    if (error) {
      console.warn('Could not read user cart/wishlist from user_profiles:', error);
      return null;
    }
    if (!data) return { cart: [], wishlist: [] };
    return {
      cart: Array.isArray(data.cart) ? data.cart : [],
      wishlist: Array.isArray(data.wishlist) ? data.wishlist : [],
    };
  } catch (err) {
    console.warn('Error fetching user cart/wishlist:', err);
    return null;
  }
}

/**
 * Persist customer cart and wishlist to user_profiles table in Supabase.
 *
 * Returns { success, error } so callers (e.g. "Clear Cart") can tell a real
 * persisted write from a silent no-op and show an honest result instead of
 * always claiming success.
 *
 * Self-healing: a plain .update() affects ZERO rows (no error!) if the
 * user's profile row doesn't exist yet, which would silently drop the
 * cart/wishlist write entirely. We detect that with .select() and fall back
 * to an upsert so the write always actually lands somewhere.
 */
export async function saveUserCartAndWishlist(userId, cart = [], wishlist = []) {
  if (!supabase || !userId) {
    return { success: false, error: 'Not signed in or storage unavailable.' };
  }
  const payload = {
    cart: Array.isArray(cart) ? cart : [],
    wishlist: Array.isArray(wishlist) ? wishlist : [],
    updated_at: new Date().toISOString(),
  };
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .update(payload)
      .eq('id', userId)
      .select('id');

    if (error) {
      console.warn('Could not sync cart/wishlist to user_profiles:', error);
      return { success: false, error };
    }

    if (!data || data.length === 0) {
      // No profile row matched — create it instead of silently losing the write.
      const { error: upsertError } = await supabase
        .from('user_profiles')
        .upsert({ id: userId, ...payload });

      if (upsertError) {
        console.warn('Could not create user_profiles row for cart/wishlist:', upsertError);
        return { success: false, error: upsertError };
      }
    }

    return { success: true, error: null };
  } catch (err) {
    console.warn('Error saving user cart/wishlist:', err);
    return { success: false, error: err };
  }
}

/**
 * Fetch customer inquiries for Admin Dashboard
 */
export async function getCustomerInquiries({ limit = 100, status } = {}) {
  if (!supabase) return [];
  try {
    let query = supabase
      .from('customer_inquiries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to get customer inquiries:', err);
    return [];
  }
}

/**
 * Update an inquiry status in Supabase (Admin)
 */
export async function updateCustomerInquiryStatus(inquiryId, status) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('customer_inquiries')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', inquiryId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete inquiries by ID array (Admin)
 */
export async function deleteCustomerInquiries(ids = []) {
  if (!supabase || !ids.length) return;
  const { error } = await supabase
    .from('customer_inquiries')
    .delete()
    .in('id', ids);

  if (error) throw error;
}

