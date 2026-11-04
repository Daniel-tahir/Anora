-- Automatic emails: order shipped / delivered / cancelled, contact form, newsletter welcome.
-- Each trigger only adds a row to background_jobs; the job runner (/api/cron/process-jobs) sends the email.
-- Existing behaviour is unchanged (the 2-day review email trigger is not touched).

ALTER TABLE public.newsletters ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletters_unsubscribe_token ON public.newsletters (unsubscribe_token);

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.enqueue_email_job(p_type text, p_order_id uuid, p_payload jsonb, p_dedupe text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.background_jobs WHERE job_type = p_type AND payload ->> 'dedupe' = p_dedupe) THEN
    RETURN;
  END IF;
  INSERT INTO public.background_jobs (job_type, order_id, status, scheduled_at, payload)
  VALUES (p_type, p_order_id, 'pending', now(), coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('dedupe', p_dedupe));
END;
$$;
REVOKE ALL ON FUNCTION app_private.enqueue_email_job(text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.trg_order_status_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status::text IN ('shipped', 'delivered', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app_private.enqueue_email_job(
      'send_order_status_email', NEW.id,
      jsonb_build_object('status', NEW.status::text),
      NEW.id::text || ':' || NEW.status::text);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.trg_order_status_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_order_status_email ON public.orders;
CREATE TRIGGER trg_order_status_email AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION app_private.trg_order_status_email();

CREATE OR REPLACE FUNCTION app_private.trg_contact_message_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.enqueue_email_job(
    'send_contact_emails', NULL, jsonb_build_object('contact_id', NEW.id), NEW.id::text);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.trg_contact_message_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_contact_message_email ON public.contact_messages;
CREATE TRIGGER trg_contact_message_email AFTER INSERT ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION app_private.trg_contact_message_email();

CREATE OR REPLACE FUNCTION app_private.trg_newsletter_welcome_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.enqueue_email_job(
    'send_newsletter_welcome', NULL, jsonb_build_object('newsletter_id', NEW.id), NEW.id::text);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.trg_newsletter_welcome_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_newsletter_welcome_email ON public.newsletters;
CREATE TRIGGER trg_newsletter_welcome_email AFTER INSERT ON public.newsletters
  FOR EACH ROW EXECUTE FUNCTION app_private.trg_newsletter_welcome_email();

NOTIFY pgrst, 'reload schema';
