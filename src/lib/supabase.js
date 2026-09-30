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
 * Upload an image file to Supabase Storage and get the public CDN URL
 * @param {File|Blob} file The file to upload
 * @param {'product-images'|'category-images'|'preorder-uploads'} bucket Bucket name
 * @param {string} [customPath] Optional custom filename / path
 * @returns {Promise<string>} The public URL of the uploaded image
 */
export async function uploadImageToSupabase(file, bucket = 'product-images', customPath) {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const fileExt = file.name ? file.name.split('.').pop() : 'jpg';
  const fileName = customPath || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  const filePath = `${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '31536000',
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
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
 * Submit customer preorder to Supabase
 */
export async function createSupabasePreorder(formData) {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase
    .from('preorders')
    .insert([
      {
        customer_name: formData.customer_name,
        phone: formData.phone,
        whatsapp: formData.whatsapp,
        category: formData.category,
        size: formData.size,
        color: formData.color,
        message: formData.message,
        requested_image: formData.requested_image,
        status: 'new',
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}
