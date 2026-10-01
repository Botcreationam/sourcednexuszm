import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Supabase client instance (or null if not yet configured)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
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
export async function getSupabaseProducts({ category, status = 'available', limit = 100 } = {}) {
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
