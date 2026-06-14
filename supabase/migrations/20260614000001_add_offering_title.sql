-- Add title field to offerings table for custom offering descriptions
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS title TEXT;

-- Comment explaining the field
COMMENT ON COLUMN offerings.title IS 'Custom title/description extracted from offering slip (e.g., "Operation Kid to Kid", "Building Fund Drive")';
