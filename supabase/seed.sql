-- ============================================================================
-- SOURCED NEXUS — SEED DATA
-- Default Categories & Curated Catalog Data (Fashion, Electronics, Watches & Lifestyle)
-- ============================================================================

-- Categories
insert into public.categories (name, slug, image, description, display_order)
values
    ('Electronics', 'electronics', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80', 'Flagship smartphones, laptops, audio gear, and gaming systems', 1),
    ('Watches', 'watches', 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80', 'Luxury Swiss timepieces, chronographs, and smart wearables', 2),
    ('Dresses', 'dresses', 'https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/d51d95ee0_IMG_7842.jpeg', 'Curated cocktail, evening, and statement dresses', 3),
    ('Suits', 'suits', 'https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/cd6535153_IMG_7593.jpeg', 'Precision-tailored two and three-piece formal suits', 4),
    ('Heels', 'heels', 'https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/54f2cdec4_IMG_7898.jpeg', 'Stilettos, strappy sandals, and crystal-embellished heels', 5),
    ('Shoes', 'shoes', 'https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/45ca4d997_IMG_7913.jpeg', 'Gentlemen''s oxfords, brogues, and luxury dress shoes', 6),
    ('Bags & Accessories', 'bags-accessories', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=80', 'Designer leather bags, wallets, sunglasses, and leather belts', 7),
    ('Perfumes', 'perfumes', 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80', 'Niche and luxury designer fragrances for men and women', 8)
on conflict (name) do update set 
    slug = excluded.slug,
    image = excluded.image,
    description = excluded.description,
    display_order = excluded.display_order;

-- Products (Fashion, Electronics, Watches, Lifestyle)
insert into public.products (name, category, price, description, images, sizes, colors, status, is_new_arrival, is_popular, delivery_info)
values
    -- Electronics
    (
        'Apple iPhone 16 Pro Max (1TB)',
        'Electronics',
        'Price on request',
        'Flagship Apple smartphone in Grade 5 Titanium with 6.9-inch Super Retina XDR display, A18 Pro Bionic chip, 48MP Fusion camera system, and Camera Control.',
        array['https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=800&q=80'],
        array['256GB', '512GB', '1TB'],
        array['Desert Titanium', 'Natural Titanium', 'White Titanium', 'Black Titanium'],
        'available',
        true,
        true,
        '7–10 working days'
    ),
    (
        'Apple Watch Ultra 2 (49mm)',
        'Electronics',
        'Price on request',
        'The most rugged and capable Apple Watch. Aerospace-grade 49mm titanium case, precision dual-frequency GPS, up to 36 hours battery life, and 3000-nit display.',
        array['https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=800&q=80'],
        array['49mm'],
        array['Titanium / Alpine Loop', 'Titanium / Trail Loop', 'Titanium / Ocean Band'],
        'available',
        true,
        true,
        '7–10 working days'
    ),
    (
        'Sony WH-1000XM5 Wireless Headphones',
        'Electronics',
        'Price on request',
        'Industry-leading noise canceling headphones with two processors and 8 microphones. Hi-Res Audio, 30-hour battery life, and ultra-comfortable lightweight design.',
        array['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80'],
        array['One Size'],
        array['Midnight Black', 'Platinum Silver', 'Smoky Pink'],
        'available',
        true,
        true,
        '7–10 working days'
    ),
    (
        'Apple MacBook Pro 16" (M3 Max)',
        'Electronics',
        'Price on request',
        'Pro performance laptop with Apple M3 Max chip, 16.2-inch Liquid Retina XDR display, 36GB unified memory, 1TB SSD, and 22-hour battery life.',
        array['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80'],
        array['16-inch'],
        array['Space Black', 'Silver'],
        'available',
        false,
        true,
        '7–10 working days'
    ),
    (
        'Sony PlayStation 5 Pro Console (2TB)',
        'Electronics',
        'Price on request',
        'The next leap in console gaming. Advanced ray tracing, PlayStation Spectral Super Resolution (PSSR), 2TB high-speed NVMe SSD, and 4K 120fps capability.',
        array['https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=800&q=80'],
        array['2TB SSD Edition'],
        array['White / Black'],
        'available',
        true,
        true,
        '7–10 working days'
    ),

    -- Watches
    (
        'Rolex Submariner Date (Oystersteel)',
        'Watches',
        'Price on request',
        'The quintessential reference diver''s watch. 41mm Oystersteel case, unidirectional rotatable Cerachrom bezel in black ceramic, and black dial with large luminescent hour markers.',
        array['https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80'],
        array['41mm'],
        array['Oystersteel / Black'],
        'available',
        true,
        true,
        '7–14 working days'
    ),
    (
        'Omega Speedmaster Moonwatch Professional',
        'Watches',
        'Price on request',
        'The legendary chronograph tested and flight-qualified by NASA. 42mm stainless steel case with Co-Axial Master Chronometer Calibre 3861.',
        array['https://images.unsplash.com/photo-1547996160-71dfa63096aa?auto=format&fit=crop&w=800&q=80'],
        array['42mm'],
        array['Stainless Steel / Black Dial'],
        'available',
        false,
        true,
        '7–14 working days'
    ),

    -- Bags & Accessories
    (
        'Louis Vuitton Monogram Neverfull MM',
        'Bags & Accessories',
        'Price on request',
        'Timeless luxury tote bag crafted in iconic Monogram canvas with natural cowhide leather trim and striped textile lining.',
        array['https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=80'],
        array['MM (31 x 28 x 14 cm)'],
        array['Monogram Canvas'],
        'available',
        true,
        true,
        '7–14 working days'
    ),

    -- Perfumes
    (
        'Tom Ford Oud Wood Eau de Parfum (100ml)',
        'Perfumes',
        'Price on request',
        'A pioneering blend of exotic oud wood, rosewood, cardamom, and tonka bean. An artisanal smoky amber fragrance of rare distinction.',
        array['https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80'],
        array['50ml', '100ml'],
        array['Smoky Amber'],
        'available',
        true,
        true,
        '7–10 working days'
    ),

    -- Suits
    (
        'Black Three-Piece Suit',
        'Suits',
        'Price on request',
        'A timeless black three-piece suit — jacket, waistcoat, and trousers. Tailored for a sharp, formal silhouette.',
        array['https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/48a6da831_IMG_7883.jpeg'],
        array['38R', '40R', '42R', '44R'],
        array['Black'],
        'available',
        true,
        true,
        '7–14 working days'
    ),
    (
        'Classic Black Three-Piece Suit',
        'Suits',
        'Price on request',
        'A slim-fit black three-piece suit with notched lapels and a matching waistcoat over a crisp white shirt.',
        array['https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/6492dae25_IMG_7887.jpeg'],
        array['38R', '40R', '42R'],
        array['Black'],
        'available',
        false,
        true,
        '7–14 working days'
    ),
    (
        'Grey Three-Piece Suit',
        'Suits',
        'Price on request',
        'A medium-grey textured three-piece suit — single-breasted blazer, matching vest, and trousers. A versatile formal staple.',
        array['https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/88ac47da9_IMG_7884.jpeg'],
        array['40R', '42R'],
        array['Grey'],
        'available',
        true,
        false,
        '7–14 working days'
    ),
    (
        'Heathered Grey Three-Piece Suit',
        'Suits',
        'Price on request',
        'A heathered grey three-piece suit with structured jacket, waistcoat, and neatly draped trousers.',
        array['https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/0f953e1f8_IMG_7894.jpeg'],
        array['38R', '40R', '42R', '44R'],
        array['Heather Grey'],
        'available',
        false,
        false,
        '7–14 working days'
    ),

    -- Shoes
    (
        'Two-Tone Button Slip-On Dress Shoe',
        'Shoes',
        'Price on request',
        'A men''s slip-on dress shoe in glossy black and matte tan, finished with a four-button strap detail.',
        array['https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/45ca4d997_IMG_7913.jpeg'],
        array['40', '41', '42', '43', '44'],
        array['Black & Tan'],
        'available',
        true,
        true,
        '7–14 working days'
    ),
    (
        'Black Button-Up Patent Dress Shoes',
        'Shoes',
        'Price on request',
        'Black cap-toe dress shoes with a suede button-up vamp — a refined patent-leather finish.',
        array['https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/23a285c83_IMG_7914.jpeg'],
        array['41', '42', '43'],
        array['Black'],
        'available',
        false,
        false,
        '7–14 working days'
    ),
    (
        'Two-Tone Brogue Oxford Shoes',
        'Shoes',
        'Price on request',
        'Wingtip oxford shoes in polished tan-brown and midnight navy with classic broguing detail.',
        array['https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/71d447b50_IMG_7907.jpeg'],
        array['41', '42', '43', '44'],
        array['Tan & Navy'],
        'available',
        false,
        false,
        '7–14 working days'
    ),

    -- Heels
    (
        'Beige Crystal Strappy Heels',
        'Heels',
        'Price on request',
        'Beige strappy high-heeled sandals adorned with shimmering crystal embellishments and a stiletto heel.',
        array['https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/54f2cdec4_IMG_7898.jpeg'],
        array['36', '37', '38', '39', '40'],
        array['Beige / Gold'],
        'available',
        true,
        true,
        '7–14 working days'
    ),
    (
        'Beige Rhinestone Stiletto Sandals',
        'Heels',
        'Price on request',
        'Beige crystal-studded stiletto sandals with a slim platform — an elegant evening heel.',
        array['https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/39d5bba01_IMG_7899.jpeg'],
        array['37', '38', '39'],
        array['Beige'],
        'available',
        false,
        true,
        '7–14 working days'
    ),

    -- Dresses
    (
        'Olive Green Ring-Waist Dress',
        'Dresses',
        'Price on request',
        'Form-fitting long-sleeve dress in muted olive green with a high round neckline. A sculptural metallic ring gathers the waist, creating a wrap effect with a side slit.',
        array[
            'https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/c5a56b9e0_IMG_7732.jpeg',
            'https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/025f51ff6_IMG_7728.jpeg'
        ],
        array['S', 'M', 'L'],
        array['Olive Green'],
        'soldout',
        true,
        false,
        '7–14 working days'
    );
