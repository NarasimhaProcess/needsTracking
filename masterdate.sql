

INSERT INTO public.repayment_plans (
    id, name, frequency, periods, base_amount, 
    repayment_per_period, advance_amount, late_fee_per_period, 
    description, created_at, updated_at
) VALUES 
-- Set 1 Records (IDs 1-5)
(1, 'Weekly Micro Plan', 'weekly', 4, 1000.00, 250.00, 0.00, 10.00, 'Short term weekly entry plan', NOW(), NOW()),
(2, 'Standard Monthly 12x', 'monthly', 12, 12000.00, 1000.00, 500.00, 50.00, '12 month standard plan with deposit', NOW(), NOW()),
(3, 'Bi-Weekly Growth', 'bi-weekly', 6, 3000.00, 500.00, 0.00, 25.00, 'Bi-weekly business acceleration scale', NOW(), NOW()),
(4, 'Quarterly Corporate', 'quarterly', 4, 40000.00, 10000.00, 2000.00, 250.00, 'Enterprise tier quarterly payout cycle', NOW(), NOW()),
(5, 'Custom Flexible Tier', 'monthly', 24, 24000.00, 1000.00, 1000.00, 75.00, 'Extended runtime flexible financing option', NOW(), NOW()),

-- Set 2 Records (IDs 6-11)
(6, 'Daily Micro Plan', 'daily', 30, 1500.00, 50.00, 0.00, 5.00, 'Short term daily retail financing tier', NOW(), NOW()),
(7, 'Semi-Monthly Enterprise', 'semi-monthly', 24, 48000.00, 2000.00, 4000.00, 100.00, 'B2B twice-monthly executive repayment program', NOW(), NOW()),
(8, 'Bi-Weekly Pilot', 'bi-weekly', 10, 5000.00, 500.00, 250.00, 30.00, 'Intermediate evaluation structure for standard accounts', NOW(), NOW()),
(9, 'Annual Legacy Payout', 'annually', 1, 10000.00, 10000.00, 1000.00, 500.00, 'Single settlement plan option for long term contracts', NOW(), NOW()),
(10, 'Bi-Monthly Venture', 'bi-monthly', 6, 18000.00, 3000.00, 0.00, 150.00, 'Alternative corporate operational support cycle', NOW(), NOW()),
(11, 'Custom Seasonal Plan', 'monthly', 3, 9000.00, 3000.00, 500.00, 40.00, 'Short interval holiday cycle support financing', NOW(), NOW());



INSERT INTO public.customer_types (status_name, description) 
VALUES 
('Retail', 'Standard individual retail consumer account'),
('Wholesale', 'Business-to-business bulk purchase tier'),
('Premium', 'High-volume user with dedicated support'),
('VIP', 'Invite-only early access account category'),
('Enterprise', 'Corporate clients with custom contract agreements');



-- Master Categories & Subcategories
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
