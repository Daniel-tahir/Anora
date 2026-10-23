import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useSiteSettings, DEFAULT_SITE_SETTINGS } from "@/lib/site-settings";

const KEY = "anora.wa.hidden";

export function WhatsAppButton() {
  const { data: settings } = useSiteSettings();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    setHidden(localStorage.getItem(KEY) === "1");
  }, []);
  if (hidden) return null;
  return (
    <div className="fixed bottom-20 sm:bottom-5 left-5 z-40 animate-fade-up">
      <div className="relative">
        <a
          href={settings?.whatsapp_url || DEFAULT_SITE_SETTINGS.whatsapp_url || "https://wa.me/13473256525?text=Hello%20ANORA"}
          target="_blank"
          rel="noreferrer"
          aria-label="WhatsApp us"
          className="block h-14 w-14 rounded-full bg-[#25D366] text-white shadow-luxe grid place-items-center hover:scale-105 active:scale-95 transition-transform"
        >
          <svg viewBox="0 0 32 32" className="h-7 w-7" fill="currentColor" aria-hidden>
            <path d="M19.11 17.43c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.62.14-.18.27-.71.88-.87 1.06-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.34-.8-.71-1.34-1.59-1.5-1.86-.16-.27-.02-.41.12-.55.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.62-1.5-.85-2.05-.22-.54-.45-.47-.62-.48l-.53-.01c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.3 0 1.36.99 2.68 1.13 2.86.14.18 1.95 2.98 4.73 4.18.66.29 1.18.46 1.58.59.66.21 1.27.18 1.75.11.53-.08 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.32zM16.02 4C9.4 4 4.04 9.36 4.04 15.98c0 2.11.55 4.17 1.6 5.99L4 28l6.18-1.62a11.95 11.95 0 0 0 5.84 1.5h.01c6.62 0 11.98-5.36 11.98-11.98 0-3.2-1.25-6.21-3.51-8.47A11.93 11.93 0 0 0 16.02 4z" />
          </svg>
        </a>
        <button
          onClick={() => {
            localStorage.setItem(KEY, "1");
            setHidden(true);
          }}
          aria-label="Hide WhatsApp"
          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-foreground text-background grid place-items-center"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
