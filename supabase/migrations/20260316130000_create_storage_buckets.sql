-- Create storage buckets for dish images and restaurant logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('dishes', 'dishes', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for public read access
CREATE POLICY "Allow public read dishes" ON storage.objects
FOR SELECT USING (bucket_id = 'dishes');

CREATE POLICY "Allow public read logos" ON storage.objects
FOR SELECT USING (bucket_id = 'logos');

-- Policies for authenticated upload
CREATE POLICY "Allow authenticated upload dishes" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'dishes' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated upload logos" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'logos' AND auth.role() = 'authenticated');

-- Policies for authenticated update
CREATE POLICY "Allow authenticated update dishes" ON storage.objects
FOR UPDATE USING (bucket_id = 'dishes' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update logos" ON storage.objects
FOR UPDATE USING (bucket_id = 'logos' AND auth.role() = 'authenticated');

-- Policies for authenticated delete
CREATE POLICY "Allow authenticated delete dishes" ON storage.objects
FOR DELETE USING (bucket_id = 'dishes' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated delete logos" ON storage.objects
FOR DELETE USING (bucket_id = 'logos' AND auth.role() = 'authenticated');
