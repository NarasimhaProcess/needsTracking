ALTER TABLE public.profiles
ADD COLUMN latitude double precision,
ADD COLUMN longitude double precision,
ADD COLUMN address_line_1 text,
ADD COLUMN address_line_2 text,
ADD COLUMN city text,
ADD COLUMN state text,
ADD COLUMN zip_code text;