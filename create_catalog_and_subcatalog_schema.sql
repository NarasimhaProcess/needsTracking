-- =========================================================================
-- CATALOG & SUBCATALOG (CATEGORIES & SUBCATEGORIES) SCHEMA & MASTER DATA
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create categories table
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    icon VARCHAR(100) DEFAULT 'cube',
    image_url TEXT,
    description TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create subcategories table
CREATE TABLE IF NOT EXISTS public.subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) NOT NULL,
    description TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_category_subcategory_code UNIQUE (category_id, code)
);

-- 3. Add columns to products table if not present
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'category_id') THEN
        ALTER TABLE public.products ADD COLUMN category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'subcategory_id') THEN
        ALTER TABLE public.products ADD COLUMN subcategory_id UUID REFERENCES public.subcategories(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'subcategory') THEN
        ALTER TABLE public.products ADD COLUMN subcategory TEXT;
    END IF;
END $$;

-- 4. Enable Row Level Security
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for categories
DROP POLICY IF EXISTS "Public can view active categories" ON public.categories;
CREATE POLICY "Public can view active categories" ON public.categories
    FOR SELECT USING (
        is_active = true 
        OR (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'superadmin', 'appadmin', 'app_admin')))
    );

DROP POLICY IF EXISTS "Admins can insert categories" ON public.categories;
CREATE POLICY "Admins can insert categories" ON public.categories
    FOR INSERT WITH CHECK (
        auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'superadmin', 'appadmin', 'app_admin'))
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS "Admins can update categories" ON public.categories;
CREATE POLICY "Admins can update categories" ON public.categories
    FOR UPDATE USING (
        auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'superadmin', 'appadmin', 'app_admin'))
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS "Admins can delete categories" ON public.categories;
CREATE POLICY "Admins can delete categories" ON public.categories
    FOR DELETE USING (
        auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'superadmin', 'appadmin', 'app_admin'))
        OR auth.role() = 'service_role'
    );

-- 6. RLS Policies for subcategories
DROP POLICY IF EXISTS "Public can view active subcategories" ON public.subcategories;
CREATE POLICY "Public can view active subcategories" ON public.subcategories
    FOR SELECT USING (
        is_active = true 
        OR (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'superadmin', 'appadmin', 'app_admin')))
    );

DROP POLICY IF EXISTS "Admins can insert subcategories" ON public.subcategories;
CREATE POLICY "Admins can insert subcategories" ON public.subcategories
    FOR INSERT WITH CHECK (
        auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'superadmin', 'appadmin', 'app_admin'))
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS "Admins can update subcategories" ON public.subcategories;
CREATE POLICY "Admins can update subcategories" ON public.subcategories
    FOR UPDATE USING (
        auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'superadmin', 'appadmin', 'app_admin'))
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS "Admins can delete subcategories" ON public.subcategories;
CREATE POLICY "Admins can delete subcategories" ON public.subcategories
    FOR DELETE USING (
        auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'superadmin', 'appadmin', 'app_admin'))
        OR auth.role() = 'service_role'
    );

-- 7. Trigger for automatic updated_at column
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_categories_updated_at ON public.categories;
CREATE TRIGGER trigger_categories_updated_at
    BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS trigger_subcategories_updated_at ON public.subcategories;
CREATE TRIGGER trigger_subcategories_updated_at
    BEFORE UPDATE ON public.subcategories
    FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- =========================================================================
-- 8. MASTER DATA LOAD (Categories & Default Subcategories)
-- =========================================================================

-- Insert Master Categories
INSERT INTO public.categories (name, code, icon, display_order, description, is_active)
VALUES
    ('Grocery & Essentials', 'grocery', 'shopping-basket', 1, 'Daily grocery staples, pulses, grains and cooking essentials', true),
    ('Fruits & Vegetables', 'fruits_vegetables', 'lemon-o', 2, 'Fresh seasonal fruits, greens and vegetables', true),
    ('Dairy & Bakery', 'dairy_bakery', 'birthday-cake', 3, 'Milk, butter, curd, bread and fresh bakery items', true),
    ('Snacks & Beverages', 'snacks_beverages', 'coffee', 4, 'Biscuits, chips, namkeen, cold drinks, tea and coffee', true),
    ('Clothing & Fashion', 'clothing', 'tag', 5, 'Men, women and kids apparel and fashion accessories', true),
    ('Electronics & Gadgets', 'electronics', 'laptop', 6, 'Mobile accessories, small electronics and gadgets', true),
    ('Beauty & Personal Care', 'beauty_personal_care', 'heart', 7, 'Skincare, haircare, oral care and personal grooming', true),
    ('Home & Kitchen', 'home_kitchen', 'home', 8, 'Cleaning supplies, kitchen utilities and home storage', true),
    ('Pharmacy & Health', 'pharmacy', 'medkit', 9, 'Over-the-counter medicine, first aid and wellness products', true),
    ('Other / General', 'other', 'cube', 10, 'General merchandise and miscellaneous items', true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    display_order = EXCLUDED.display_order,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- Insert Master Subcategories
-- Grocery & Essentials
INSERT INTO public.subcategories (category_id, name, code, display_order, description, is_active)
SELECT id, s.name, s.code, s.display_order, s.description, true
FROM public.categories,
(VALUES
    ('Atta, Flours & Grains', 'atta_flours', 1, 'Wheat flour, maida, sooji, besan and grains'),
    ('Rice & Rice Products', 'rice_products', 2, 'Basmati, sona masoori, poha and murmura'),
    ('Dals & Pulses', 'dals_pulses', 3, 'Toor dal, moong dal, chana dal, urad dal and beans'),
    ('Edible Oils & Ghee', 'oils_ghee', 4, 'Mustard, sunflower, groundnut oil and pure ghee'),
    ('Spices & Masalas', 'spices_masalas', 5, 'Whole and powdered spices, blended masalas'),
    ('Salt, Sugar & Jaggery', 'salt_sugar', 6, 'Iodized salt, white sugar, brown sugar and jaggery')
) AS s(name, code, display_order, description)
WHERE public.categories.code = 'grocery'
ON CONFLICT (category_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    description = EXCLUDED.description;

-- Fruits & Vegetables
INSERT INTO public.subcategories (category_id, name, code, display_order, description, is_active)
SELECT id, s.name, s.code, s.display_order, s.description, true
FROM public.categories,
(VALUES
    ('Fresh Vegetables', 'fresh_vegetables', 1, 'Daily vegetables like potato, onion, tomato, carrots'),
    ('Fresh Fruits', 'fresh_fruits', 2, 'Apples, bananas, citrus, mangoes and seasonal fruits'),
    ('Leafy Greens & Herbs', 'leafy_greens', 3, 'Spinach, coriander, mint and fresh herbs'),
    ('Organic & Exotic', 'organic_exotic', 4, 'Avocado, broccoli, bell peppers and organic produce')
) AS s(name, code, display_order, description)
WHERE public.categories.code = 'fruits_vegetables'
ON CONFLICT (category_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    description = EXCLUDED.description;

-- Dairy & Bakery
INSERT INTO public.subcategories (category_id, name, code, display_order, description, is_active)
SELECT id, s.name, s.code, s.display_order, s.description, true
FROM public.categories,
(VALUES
    ('Milk & Cream', 'milk_cream', 1, 'Fresh pouch milk, tetra pack, cow milk and fresh cream'),
    ('Curd & Yogurt', 'curd_yogurt', 2, 'Dahi, lassi, flavored yogurts'),
    ('Paneer, Butter & Cheese', 'paneer_cheese', 3, 'Fresh cottage cheese, butter blocks and slices'),
    ('Breads & Pav', 'breads_pav', 4, 'White bread, brown bread, pav and burger buns'),
    ('Cakes & Rusk', 'cakes_rusk', 5, 'Tea cakes, muffins, bakery biscuits and rusks')
) AS s(name, code, display_order, description)
WHERE public.categories.code = 'dairy_bakery'
ON CONFLICT (category_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    description = EXCLUDED.description;

-- Snacks & Beverages
INSERT INTO public.subcategories (category_id, name, code, display_order, description, is_active)
SELECT id, s.name, s.code, s.display_order, s.description, true
FROM public.categories,
(VALUES
    ('Biscuits & Cookies', 'biscuits_cookies', 1, 'Sweet biscuits, cookies, cream wafers'),
    ('Chips & Namkeen', 'chips_namkeen', 2, 'Potato chips, bhujia, mixtures, roasted nuts'),
    ('Tea & Coffee', 'tea_coffee', 3, 'Tea leaves, green tea, instant and filter coffee'),
    ('Cold Drinks & Juices', 'cold_drinks_juices', 4, 'Carbonated drinks, fruit juices, energy drinks'),
    ('Noodles & Instant Food', 'instant_food', 5, 'Instant noodles, pasta, ready mixes and soups')
) AS s(name, code, display_order, description)
WHERE public.categories.code = 'snacks_beverages'
ON CONFLICT (category_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    description = EXCLUDED.description;

-- Clothing & Fashion
INSERT INTO public.subcategories (category_id, name, code, display_order, description, is_active)
SELECT id, s.name, s.code, s.display_order, s.description, true
FROM public.categories,
(VALUES
    ('Men''s Wear', 'mens_wear', 1, 'Shirts, T-shirts, trousers and jeans'),
    ('Women''s Wear', 'womens_wear', 2, 'Sarees, kurtis, dresses and tops'),
    ('Kids'' Clothing', 'kids_clothing', 3, 'Boys and girls apparel'),
    ('Footwear', 'footwear', 4, 'Slippers, sandals and casual shoes'),
    ('Fashion Accessories', 'fashion_accessories', 5, 'Belts, caps, socks, scarves and bags')
) AS s(name, code, display_order, description)
WHERE public.categories.code = 'clothing'
ON CONFLICT (category_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    description = EXCLUDED.description;

-- Electronics & Gadgets
INSERT INTO public.subcategories (category_id, name, code, display_order, description, is_active)
SELECT id, s.name, s.code, s.display_order, s.description, true
FROM public.categories,
(VALUES
    ('Mobile Accessories', 'mobile_accessories', 1, 'Cables, chargers, phone covers, screen guards'),
    ('Audio & Earphones', 'audio_earphones', 2, 'Headphones, neckbands, earbuds and bluetooth speakers'),
    ('Smart Wearables', 'smart_wearables', 3, 'Smartwatches, fitness bands'),
    ('Small Appliances', 'small_appliances', 4, 'Electric kettles, trimmers, irons, table fans')
) AS s(name, code, display_order, description)
WHERE public.categories.code = 'electronics'
ON CONFLICT (category_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    description = EXCLUDED.description;

-- Beauty & Personal Care
INSERT INTO public.subcategories (category_id, name, code, display_order, description, is_active)
SELECT id, s.name, s.code, s.display_order, s.description, true
FROM public.categories,
(VALUES
    ('Skin & Face Care', 'skincare', 1, 'Face washes, moisturizers, sunscreens and lotions'),
    ('Hair Care', 'haircare', 2, 'Shampoos, conditioners, hair oils'),
    ('Bath & Body', 'bath_body', 3, 'Soaps, body washes, deodorants and perfumes'),
    ('Oral Care', 'oral_care', 4, 'Toothpastes, toothbrushes, mouthwashes')
) AS s(name, code, display_order, description)
WHERE public.categories.code = 'beauty_personal_care'
ON CONFLICT (category_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    description = EXCLUDED.description;

-- Home & Kitchen
INSERT INTO public.subcategories (category_id, name, code, display_order, description, is_active)
SELECT id, s.name, s.code, s.display_order, s.description, true
FROM public.categories,
(VALUES
    ('Cleaning & Detergents', 'cleaning_detergents', 1, 'Dishwash, floor cleaners, detergent powder and liquid'),
    ('Cookware & Utensils', 'cookware_utensils', 2, 'Pans, pots, spoons, knives and containers'),
    ('Pooja Needs', 'pooja_needs', 3, 'Incense sticks, diyas, camphor, pooja oil'),
    ('Disposables & Trash Bags', 'disposables', 4, 'Garbage bags, foil, tissues and kitchen rolls')
) AS s(name, code, display_order, description)
WHERE public.categories.code = 'home_kitchen'
ON CONFLICT (category_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    description = EXCLUDED.description;

-- Pharmacy & Health
INSERT INTO public.subcategories (category_id, name, code, display_order, description, is_active)
SELECT id, s.name, s.code, s.display_order, s.description, true
FROM public.categories,
(VALUES
    ('First Aid & Antiseptics', 'first_aid', 1, 'Bandages, cotton, antiseptic liquid and balms'),
    ('Vitamins & Supplements', 'vitamins_supplements', 2, 'Vitamin C, calcium, protein powders'),
    ('Healthcare Devices', 'healthcare_devices', 3, 'Thermometers, pulse oximeters, BP monitors'),
    ('Digestives & Pain Relief', 'digestives_pain', 4, 'Antacids, digestive churan, pain relief sprays')
) AS s(name, code, display_order, description)
WHERE public.categories.code = 'pharmacy'
ON CONFLICT (category_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    description = EXCLUDED.description;

-- Other / General
INSERT INTO public.subcategories (category_id, name, code, display_order, description, is_active)
SELECT id, s.name, s.code, s.display_order, s.description, true
FROM public.categories,
(VALUES
    ('Stationery & School', 'stationery', 1, 'Notebooks, pens, adhesives, art supplies'),
    ('Hardware & Electricals', 'hardware_electricals', 2, 'Bulbs, batteries, tapes, tools'),
    ('General Miscellaneous', 'general_misc', 3, 'General items and uncategorized goods')
) AS s(name, code, display_order, description)
WHERE public.categories.code = 'other'
ON CONFLICT (category_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    description = EXCLUDED.description;

-- 9. Migrate existing products to map their category_id based on product_type
UPDATE public.products p
SET category_id = c.id
FROM public.categories c
WHERE p.category_id IS NULL
  AND LOWER(TRIM(p.product_type)) = LOWER(TRIM(c.code));
