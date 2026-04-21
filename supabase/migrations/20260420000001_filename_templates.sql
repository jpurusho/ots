-- Add filename template settings for admin-customizable PDF filenames
INSERT INTO app_settings (key, value, category, data_type, label, description) VALUES
  ('filename_template_report', '{church}_Report_{period}_{date}', 'general', 'string', 'Report PDF Filename Template', 'Filename template for generated report PDFs. Variables: {church} {period} {date} {year} {month}'),
  ('filename_template_cards', '{church}_Cards_{period}_{date}', 'general', 'string', 'Cards PDF Filename Template', 'Filename template for generated card PDFs. Variables: {church} {period} {date} {year} {month}')
ON CONFLICT (key) DO NOTHING;
