import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Globe, MessageSquare, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSiteSettings, DEFAULT_SITE_SETTINGS } from "@/lib/site-settings";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [{ title: "Website Settings — ANORA" }],
  }),
  component: WebsiteSettingsPage,
});

function WebsiteSettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading, isError } = useSiteSettings();
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  // Form states
  const [heroImage, setHeroImage] = useState("");
  const [heroHeading, setHeroHeading] = useState("");
  const [heroSubHeading, setHeroSubHeading] = useState("");
  const [heroButton1Text, setHeroButton1Text] = useState("");
  const [heroButton1Link, setHeroButton1Link] = useState("");
  const [heroButton2Text, setHeroButton2Text] = useState("");
  const [heroButton2Link, setHeroButton2Link] = useState("");

  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementButtonText, setAnnouncementButtonText] = useState("");
  const [announcementButtonLink, setAnnouncementButtonLink] = useState("");

  const [instagramUrl, setInstagramUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState("");

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [logo, setLogo] = useState("");
  const [favicon, setFavicon] = useState("");

  // Sync form states with loaded settings
  useEffect(() => {
    if (settings) {
      setHeroImage(settings.hero_image || "");
      setHeroHeading(settings.hero_heading || "");
      setHeroSubHeading(settings.hero_sub_heading || "");
      setHeroButton1Text(settings.hero_button_1_text || "");
      setHeroButton1Link(settings.hero_button_1_link || "");
      setHeroButton2Text(settings.hero_button_2_text || "");
      setHeroButton2Link(settings.hero_button_2_link || "");

      setAnnouncementEnabled(settings.announcement_enabled ?? false);
      setAnnouncementText(settings.announcement_text || "");
      setAnnouncementButtonText(settings.announcement_button_text || "");
      setAnnouncementButtonLink(settings.announcement_button_link || "");

      setInstagramUrl(settings.instagram_url || "");
      setFacebookUrl(settings.facebook_url || "");
      setWhatsappUrl(settings.whatsapp_url || "");

      setPhone(settings.phone || "");
      setEmail(settings.email || "");
      setAddress(settings.address || "");

      setLogo(settings.logo || "");
      setFavicon(settings.favicon || "");
    }
  }, [settings]);

  // Handle file uploads
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: "hero_image" | "logo" | "favicon") => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!file.type.startsWith("image/")) {
      toast.error("Invalid file type. Please upload an image.");
      return;
    }

    try {
      setUploadingField(field);
      const fileExt = file.name.split(".").pop();
      const fileName = `${field}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const filePath = `settings/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("banners")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("banners")
        .getPublicUrl(filePath);

      if (field === "hero_image") setHeroImage(publicUrl);
      if (field === "logo") setLogo(publicUrl);
      if (field === "favicon") setFavicon(publicUrl);

      toast.success("Image uploaded successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setUploadingField(null);
      // Reset input element so same file can be uploaded again
      e.target.value = "";
    }
  };

  // Handle Form Submit
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(false);
      setSaving(true);

      const payload = {
        id: 1,
        hero_image: heroImage || null,
        hero_heading: heroHeading || null,
        hero_sub_heading: heroSubHeading || null,
        hero_button_1_text: heroButton1Text || null,
        hero_button_1_link: heroButton1Link || null,
        hero_button_2_text: heroButton2Text || null,
        hero_button_2_link: heroButton2Link || null,
        announcement_enabled: announcementEnabled,
        announcement_text: announcementText || null,
        announcement_button_text: announcementButtonText || null,
        announcement_button_link: announcementButtonLink || null,
        instagram_url: instagramUrl || null,
        facebook_url: facebookUrl || null,
        whatsapp_url: whatsappUrl || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        logo: logo || null,
        favicon: favicon || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("site_settings")
        .upsert(payload, { onConflict: "id" });

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["site-settings"] });
      toast.success("Website settings updated successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save website settings.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </AdminLayout>
    );
  }

  if (isError) {
    return (
      <AdminLayout>
        <div className="text-center py-20">
          <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-serif">Failed to Load Settings</h2>
          <p className="text-sm text-muted-foreground mt-2">
            The database settings could not be retrieved. Default presets will be used on the site.
          </p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl">
        <div className="mb-10">
          <p className="eyebrow">Admin</p>
          <h1 className="font-serif text-4xl mt-2">Website Settings</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Configure default banners, announcement messages, brand logos, and atelier contact links.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-8">
          {/* Hero Section */}
          <div className="bg-background border border-border/60 p-6 rounded-lg space-y-6">
            <h2 className="text-lg font-serif border-b border-border/40 pb-3">1. Hero Section</h2>
            
            <div className="space-y-4">
              <div>
                <span className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                  Hero Image
                </span>
                <div className="flex items-center gap-6">
                  {heroImage ? (
                    <div className="relative h-32 w-52 border border-border overflow-hidden rounded bg-neutral">
                      <img src={heroImage} alt="Hero Preview" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setHeroImage("")}
                        className="absolute top-2 right-2 p-1.5 bg-background/90 text-red-500 rounded-full hover:bg-red-500 hover:text-background transition-colors shadow"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="h-32 w-52 border border-dashed border-border rounded flex flex-col items-center justify-center cursor-pointer hover:border-gold hover:bg-neutral/40 transition-all">
                      <Upload className="h-5 w-5 text-muted-foreground mb-2" />
                      <span className="text-[10px] tracking-wider uppercase text-muted-foreground">
                        {uploadingField === "hero_image" ? "Uploading..." : "Upload Image"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, "hero_image")}
                        className="hidden"
                        disabled={uploadingField !== null}
                      />
                    </label>
                  )}
                  <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                    This is the main image shown on the homepage hero banner. Supported formats: JPG, PNG, WEBP. Max size: 10MB.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                  Hero Sub Heading
                </label>
                <input
                  type="text"
                  value={heroSubHeading}
                  onChange={(e) => setHeroSubHeading(e.target.value)}
                  placeholder="e.g. Slow tailored ceremonial dress..."
                  className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                    Button 1 Text
                  </label>
                  <input
                    type="text"
                    value={heroButton1Text}
                    onChange={(e) => setHeroButton1Text(e.target.value)}
                    placeholder="e.g. Shop Clothing"
                    className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                    Button 1 Link
                  </label>
                  <input
                    type="text"
                    value={heroButton1Link}
                    onChange={(e) => setHeroButton1Link(e.target.value)}
                    placeholder="e.g. /shop/clothing"
                    className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                    Button 2 Text
                  </label>
                  <input
                    type="text"
                    value={heroButton2Text}
                    onChange={(e) => setHeroButton2Text(e.target.value)}
                    placeholder="e.g. Shop Jewellery"
                    className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                    Button 2 Link
                  </label>
                  <input
                    type="text"
                    value={heroButton2Link}
                    onChange={(e) => setHeroButton2Link(e.target.value)}
                    placeholder="e.g. /shop/jewellery"
                    className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Announcement Bar */}
          <div className="bg-background border border-border/60 p-6 rounded-lg space-y-6">
            <h2 className="text-lg font-serif border-b border-border/40 pb-3">2. Announcement Bar</h2>
            
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={announcementEnabled}
                  onChange={(e) => setAnnouncementEnabled(e.target.checked)}
                  className="rounded border-border text-gold focus:ring-gold accent-gold h-4 w-4"
                />
                <span className="text-[10px] tracking-widest uppercase text-muted-foreground">
                  Enable Announcement Bar
                </span>
              </label>

              {announcementEnabled && (
                <>
                  <div>
                    <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                      Announcement Text
                    </label>
                    <input
                      type="text"
                      value={announcementText}
                      onChange={(e) => setAnnouncementText(e.target.value)}
                      placeholder="e.g. Complimentary shipping on orders over $500."
                      className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                      required={announcementEnabled}
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                        Button Text (Optional)
                      </label>
                      <input
                        type="text"
                        value={announcementButtonText}
                        onChange={(e) => setAnnouncementButtonText(e.target.value)}
                        placeholder="e.g. Shop New"
                        className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                        Button Link (Optional)
                      </label>
                      <input
                        type="text"
                        value={announcementButtonLink}
                        onChange={(e) => setAnnouncementButtonLink(e.target.value)}
                        placeholder="e.g. /shop"
                        className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Social Links */}
          <div className="bg-background border border-border/60 p-6 rounded-lg space-y-6">
            <h2 className="text-lg font-serif border-b border-border/40 pb-3">3. Social Links</h2>
            
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                  Instagram Link
                </label>
                <input
                  type="url"
                  value={instagramUrl}
                  onChange={(e) => setInstagramUrl(e.target.value)}
                  placeholder="https://instagram.com/your-username"
                  className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                  Facebook Link
                </label>
                <input
                  type="url"
                  value={facebookUrl}
                  onChange={(e) => setFacebookUrl(e.target.value)}
                  placeholder="https://facebook.com/your-page"
                  className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                  WhatsApp Link
                </label>
                <input
                  type="url"
                  value={whatsappUrl}
                  onChange={(e) => setWhatsappUrl(e.target.value)}
                  placeholder="e.g. https://wa.me/13473256525?text=Hello"
                  className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div className="bg-background border border-border/60 p-6 rounded-lg space-y-6">
            <h2 className="text-lg font-serif border-b border-border/40 pb-3">4. Contact Information</h2>
            
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (212) 555-0199"
                  className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="care@anora.com"
                  className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                  Atelier Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="12 Atelier Lane, SoHo, NY 10012"
                  className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-gold transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Branding */}
          <div className="bg-background border border-border/60 p-6 rounded-lg space-y-6">
            <h2 className="text-lg font-serif border-b border-border/40 pb-3">5. Branding</h2>
            
            <div className="grid sm:grid-cols-2 gap-8">
              {/* Logo */}
              <div>
                <span className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                  Logo
                </span>
                <div className="flex items-center gap-6">
                  {logo ? (
                    <div className="relative h-20 w-32 border border-border overflow-hidden rounded bg-neutral flex items-center justify-center p-2">
                      <img src={logo} alt="Logo Preview" className="max-h-full max-w-full object-contain" />
                      <button
                        type="button"
                        onClick={() => setLogo("")}
                        className="absolute top-1 right-1 p-1 bg-background/90 text-red-500 rounded-full hover:bg-red-500 hover:text-background transition-colors shadow"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="h-20 w-32 border border-dashed border-border rounded flex flex-col items-center justify-center cursor-pointer hover:border-gold hover:bg-neutral/40 transition-all">
                      <Upload className="h-4 w-4 text-muted-foreground mb-1" />
                      <span className="text-[9px] tracking-wider uppercase text-muted-foreground">
                        {uploadingField === "logo" ? "Uploading..." : "Upload Logo"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, "logo")}
                        className="hidden"
                        disabled={uploadingField !== null}
                      />
                    </label>
                  )}
                  <p className="text-xs text-muted-foreground max-w-[180px] leading-relaxed">
                    Replaces brand text in Navbar and Footer. Supported formats: PNG, SVG, WEBP.
                  </p>
                </div>
              </div>

              {/* Favicon */}
              <div>
                <span className="block text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                  Favicon
                </span>
                <div className="flex items-center gap-6">
                  {favicon ? (
                    <div className="relative h-20 w-20 border border-border overflow-hidden rounded bg-neutral flex items-center justify-center p-2">
                      <img src={favicon} alt="Favicon Preview" className="max-h-full max-w-full object-contain" />
                      <button
                        type="button"
                        onClick={() => setFavicon("")}
                        className="absolute top-1 right-1 p-1 bg-background/90 text-red-500 rounded-full hover:bg-red-500 hover:text-background transition-colors shadow"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="h-20 w-20 border border-dashed border-border rounded flex flex-col items-center justify-center cursor-pointer hover:border-gold hover:bg-neutral/40 transition-all">
                      <Upload className="h-4 w-4 text-muted-foreground mb-1" />
                      <span className="text-[9px] tracking-wider uppercase text-muted-foreground">
                        {uploadingField === "favicon" ? "Uploading..." : "Upload"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, "favicon")}
                        className="hidden"
                        disabled={uploadingField !== null}
                      />
                    </label>
                  )}
                  <p className="text-xs text-muted-foreground max-w-[180px] leading-relaxed">
                    Small icon displayed in browser tabs. Supported formats: ICO, PNG.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={saving || uploadingField !== null}
              className="bg-foreground text-background px-10 py-4 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
