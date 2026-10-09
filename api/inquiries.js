import { getAuthUser } from '../lib/payza-shared.mjs';
import { safeImageUrl, isValidEmailAddress, trustedClientIp, createRateLimiter } from '../lib/security-utils.mjs';

// Best-effort per-instance limit: 8 inquiries / 10 min per IP.
const allowInquiry = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 8 });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const clientIp = trustedClientIp(req);
    if (!allowInquiry(clientIp)) {
      res.setHeader('Retry-After', '600');
      return res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
    }
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const customerName = typeof payload.customer_name === 'string' ? payload.customer_name.trim() : '';
    const contactNumber = typeof payload.contact_number === 'string' ? payload.contact_number.trim() : '';
    const rawEmail = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (rawEmail && !isValidEmailAddress(rawEmail)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
    }
    const email = rawEmail || null;
    const inquiryType = ['quote_request', 'preorder', 'product_inquiry'].includes(payload.inquiry_type)
      ? payload.inquiry_type
      : 'quote_request';
    const items = Array.isArray(payload.items) ? payload.items : [];

    // Validation
    if (!customerName || customerName.length < 2 || customerName.length > 100) {
      return res.status(400).json({ success: false, error: 'Please provide a valid customer name (2-100 characters).' });
    }

    if (!contactNumber || contactNumber.length < 6 || contactNumber.length > 35) {
      return res.status(400).json({ success: false, error: 'Please provide a valid contact phone or WhatsApp number.' });
    }

    if (items.length === 0 || items.length > 50) {
      return res.status(400).json({ success: false, error: 'Please select at least 1 product (up to 50).' });
    }

    const sanitizedItems = items.map((item, idx) => ({
      id: String(item.id || `item-${idx + 1}`),
      name: String(item.name || 'Unnamed Product').slice(0, 150),
      category: item.category ? String(item.category).slice(0, 80) : 'General',
      price: item.price ? String(item.price).slice(0, 50) : 'Price on Request',
      image: safeImageUrl(item.image),
      quantity: Math.max(1, Math.min(100, Number(item.quantity) || 1)),
      selectedSize: item.selectedSize ? String(item.selectedSize).slice(0, 30) : null,
      selectedColor: item.selectedColor ? String(item.selectedColor).slice(0, 30) : null,
      selectedGrade: item.selectedGrade && typeof item.selectedGrade === 'object' ? {
        name: item.selectedGrade.name ? String(item.selectedGrade.name).slice(0, 50) : null,
        price: item.selectedGrade.price != null ? String(item.selectedGrade.price).slice(0, 50) : null,
        originalPrice: item.selectedGrade.originalPrice != null ? String(item.selectedGrade.originalPrice).slice(0, 50) : null,
        discount: Number.isFinite(Number(item.selectedGrade.discount)) ? Number(item.selectedGrade.discount) : null,
      } : null,
      specifications: item.specifications ? String(item.specifications).slice(0, 300) : '',
    }));

    // Identity comes ONLY from a verified access token, never from the body.
    // Anonymous quote requests stay allowed (user_id = null).
    const authUser = await getAuthUser(req.headers['authorization']);

    const record = {
      user_id: authUser ? authUser.id : null,
      inquiry_type: inquiryType,
      customer_name: customerName,
      contact_number: contactNumber,
      email: email || null,
      items: sanitizedItems,
      total_items: sanitizedItems.reduce((acc, i) => acc + i.quantity, 0),
      specifications: payload.specifications ? String(payload.specifications).slice(0, 1000) : null,
      additional_instructions: payload.additional_instructions ? String(payload.additional_instructions).slice(0, 2000) : null,
      status: 'Pending',
      source: payload.source === 'whatsapp' ? 'whatsapp' : 'website',
      ip_address: clientIp,
      estimated_total: Number.isFinite(Number(payload.estimated_total)) && payload.estimated_total >= 0 ? Math.min(Number(payload.estimated_total), 10_000_000) : 0,
      preferred_contact: ['whatsapp', 'email', 'phone'].includes(payload.preferred_contact) ? payload.preferred_contact : 'whatsapp',
    };

    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zprzxqdcqeywopwxouzu.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const supaRes = await fetch(`${supabaseUrl}/rest/v1/customer_inquiries`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(record),
        });

        if (supaRes.ok) {
          const inserted = await supaRes.json();
          const row = inserted[0] || record;
          return res.status(201).json({ success: true, inquiry: { id: row.id, status: row.status, created_at: row.created_at } });
        } else {
          console.warn('[inquiries] Supabase insert returned status:', supaRes.status);
        }
      } catch (supaErr) {
        console.warn('[inquiries] Supabase REST error:', supaErr.message);
      }
    }

    return res.status(200).json({ success: true, inquiry: { status: record.status } });
  } catch (err) {
    console.error('[inquiries] error:', err?.message);
    return res.status(500).json({ success: false, error: 'Internal error processing inquiry.' });
  }
}
