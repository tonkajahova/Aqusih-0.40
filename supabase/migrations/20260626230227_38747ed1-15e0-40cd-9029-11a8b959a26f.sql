
-- Restore EXECUTE on has_role for anon so RLS policies that call it don't error out
-- for unauthenticated reads (e.g. discount validation, public storefront paths).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;

-- Editable site content (contact emails, ToS, privacy, etc.)
CREATE TABLE public.site_content (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_content TO anon, authenticated;
GRANT ALL ON public.site_content TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.site_content TO authenticated;

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read site content"
  ON public.site_content FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins manage site content insert"
  ON public.site_content FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage site content update"
  ON public.site_content FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage site content delete"
  ON public.site_content FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER site_content_touch_updated_at
  BEFORE UPDATE ON public.site_content
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed default keys
INSERT INTO public.site_content (key, value) VALUES
  ('contact_general', 'HELLO@AQUISH.COM'),
  ('contact_orders', 'ORDERS@AQUISH.COM'),
  ('contact_press', 'PRESS@AQUISH.COM'),
  ('about_body', 'AQUISH IS A STUDIO PROJECT EXPLORING MINIMAL UTILITY GARMENTS.'),
  ('shipping_body', 'ORDERS SHIP WITHIN 3–5 BUSINESS DAYS. TRACKING PROVIDED VIA EMAIL.'),
  ('returns_body', 'RETURNS ACCEPTED WITHIN 14 DAYS OF DELIVERY. ITEMS MUST BE UNWORN.'),
  ('terms_body', 'BY USING THIS SITE YOU AGREE TO OUR TERMS OF SERVICE.'),
  ('privacy_body', 'WE COLLECT MINIMAL DATA NECESSARY TO FULFILL YOUR ORDERS.')
ON CONFLICT (key) DO NOTHING;
