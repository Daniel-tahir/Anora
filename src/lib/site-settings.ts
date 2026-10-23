import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

export interface SiteSettings {
  id: number;
  hero_image: string | null;
  hero_heading: string | null;
  hero_sub_heading: string | null;
  hero_button_1_text: string | null;
  hero_button_1_link: string | null;
  hero_button_2_text: string | null;
  hero_button_2_link: string | null;
  announcement_enabled: boolean;
  announcement_text: string | null;
  announcement_button_text: string | null;
  announcement_button_link: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  whatsapp_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo: string | null;
  favicon: string | null;
  updated_at: string;
}

export const DEFAULT_SITE_SETTINGS: Omit<SiteSettings, "updated_at"> = {
  id: 1,
  hero_image: null,
  hero_heading: "ANORA",
  hero_sub_heading: "Elegance Crafted For Every Moment.",
  hero_button_1_text: "Shop Clothing",
  hero_button_1_link: "/shop/clothing",
  hero_button_2_text: "Shop Jewellery",
  hero_button_2_link: "/shop/jewellery",
  announcement_enabled: true,
  announcement_text: "Complimentary Express Shipping Worldwide",
  announcement_button_text: null,
  announcement_button_link: null,
  instagram_url: "https://instagram.com/anora_ny",
  facebook_url: "#",
  whatsapp_url: "https://wa.me/13473256525?text=Hello%20ANORA",
  phone: "+1 (212) 555-0199",
  email: "care@anora.com",
  address: "12 Atelier Lane, SoHo, New York, NY 10012",
  logo: null,
  favicon: null,
};

export function useSiteSettings() {
  return useQuery<SiteSettings>({
    queryKey: ["site-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data || (DEFAULT_SITE_SETTINGS as SiteSettings);
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    gcTime: 1000 * 60 * 30,  // Garbage collection time (30 minutes)
  });
}
