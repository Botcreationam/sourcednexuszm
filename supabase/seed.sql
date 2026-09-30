-- ============================================================================
-- SOURCED NEXUS — SEED DATA
-- Default Categories & Curated Catalog Data
-- ============================================================================

-- Categories
insert into public.categories (name, slug, image, description, display_order)
values
    ('Dresses', 'dresses', 'https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/d51d95ee0_IMG_7842.jpeg', 'Curated cocktail, evening, and statement dresses', 1),
    ('Suits', 'suits', 'https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/cd6535153_IMG_7593.jpeg', 'Precision-tailored two and three-piece formal suits', 2),
    ('Heels', 'heels', 'https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/54f2cdec4_IMG_7898.jpeg', 'Stilettos, strappy sandals, and crystal-embellished heels', 3),
    ('Shoes', 'shoes', 'https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/45ca4d997_IMG_7913.jpeg', 'Gentlemen''s oxfords, brogues, and luxury dress shoes', 4)
on conflict (name) do nothing;

-- Products
insert into public.products (name, category, price, description, images, sizes, colors, status, is_new_arrival, is_popular, delivery_info)
values
    (
        'Black Three-Piece Suit',
        'Suits',
        null,
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
        null,
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
        null,
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
        null,
        'A heathered grey three-piece suit with structured jacket, waistcoat, and neatly draped trousers.',
        array['https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/0f953e1f8_IMG_7894.jpeg'],
        array['38R', '40R', '42R', '44R'],
        array['Heather Grey'],
        'available',
        false,
        false,
        '7–14 working days'
    ),
    (
        'Two-Tone Button Slip-On Dress Shoe',
        'Shoes',
        null,
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
        null,
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
        null,
        'Wingtip oxford shoes in polished tan-brown and midnight navy with classic broguing detail.',
        array['https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/71d447b50_IMG_7907.jpeg'],
        array['41', '42', '43', '44'],
        array['Tan & Navy'],
        'available',
        false,
        false,
        '7–14 working days'
    ),
    (
        'Beige Crystal Strappy Heels',
        'Heels',
        null,
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
        null,
        'Beige crystal-studded stiletto sandals with a slim platform — an elegant evening heel.',
        array['https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/39d5bba01_IMG_7899.jpeg'],
        array['37', '38', '39'],
        array['Beige'],
        'available',
        false,
        true,
        '7–14 working days'
    ),
    (
        'Olive Green Ring-Waist Dress',
        'Dresses',
        null,
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
