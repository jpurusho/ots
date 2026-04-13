-- Storage buckets for images and reports

INSERT INTO storage.buckets (id, name, public) VALUES
  ('offering-images', 'offering-images', false),
  ('reports', 'reports', false);

-- Storage policies: authenticated users can upload/read images
CREATE POLICY "Authenticated users can upload images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'offering-images');

CREATE POLICY "Authenticated users can read images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'offering-images');

CREATE POLICY "Authenticated users can delete images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'offering-images');

-- Reports: authenticated users can read, upload
CREATE POLICY "Authenticated users can upload reports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reports');

CREATE POLICY "Authenticated users can read reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reports');
