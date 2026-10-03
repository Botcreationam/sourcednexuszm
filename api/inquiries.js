export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const payload = req.body || {};
    const customerName = typeof payload.customer_name === 'string' ? payload.customer_name.trim() : '';
    const contactNumber = typeof payload.contact_number === 'string' ? payload.contact_number.trim() : '';
    const email = typeof payload.email === 'string' ? payload.email.trim() : null;
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
      image: item.image ? String(item.image).slice(0, 1000) : null,
      quantity: Math.max(1, Math.min(100, Number(item.quantity) || 1)),
      selectedSize: item.selectedSize ? String(item.selectedSize).slice(0, 30) : null,
      selectedColor: item.selectedColor ? String(item.selectedColor).slice(0, 30) : null,
      specifications: item.specifications ? String(item.specifications).slice(0, 300) : '',
    }));

    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    const record = {
      user_id: payload.user_id || null,
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
      ip_address: clientIp.split(',')[0].trim(),
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
          return res.status(201).json({ success: true, inquiry: inserted[0] || record });
        } else {
          console.warn('[inquiries] Supabase insert returned status:', supaRes.status);
        }
      } catch (supaErr) {
        console.warn('[inquiries] Supabase REST error:', supaErr.message);
      }
    }

    return res.status(200).json({ success: true, inquiry: record });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal error processing inquiry.' });
  }
}
