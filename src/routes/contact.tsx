import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — ANORA" },
      {
        name: "description",
        content: "Reach the ANORA atelier — WhatsApp, email, and our flagship address.",
      },
    ],
  }),
  component: Contact,
});

function Contact() {
  return (
    <div className="px-5 lg:px-10 py-16 max-w-6xl mx-auto">
      <div className="text-center mb-14">
        <span className="eyebrow">Get in Touch</span>
        <h1 className="font-serif text-5xl md:text-6xl mt-3">Contact Us</h1>
        <p className="mt-5 text-muted-foreground max-w-md mx-auto">
          We answer every message personally, usually within a day.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-14">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            (e.target as HTMLFormElement).reset();
            toast.success("Message sent", { description: "We'll reply within a day." });
          }}
          className="space-y-4"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Name" required />
            <Input label="Email" type="email" required />
          </div>
          <Input label="Phone" type="tel" />
          <label className="block">
            <span className="block text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
              Message
            </span>
            <textarea
              required
              rows={6}
              className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors resize-none"
            />
          </label>
          <button className="bg-foreground text-background px-8 py-3.5 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-colors">
            Send Message
          </button>
        </form>

        <div className="space-y-8">
          <Info
            icon={<MessageCircle className="h-4 w-4" />}
            label="WhatsApp"
            value="+1 (347) 325-6525"
            href="https://wa.me/15555555555"
          />
          <Info
            icon={<Mail className="h-4 w-4" />}
            label="Email"
            value="care@anora.com"
            href="mailto:care@anora.com"
          />
          <Info
            icon={<Phone className="h-4 w-4" />}
            label="Phone"
            value="+1 (212) 555-0199"
            href="tel:+12125550199"
          />
          <Info
            icon={<MapPin className="h-4 w-4" />}
            label="Atelier"
            value="12 Atelier Lane, SoHo, New York, NY 10012"
          />

          <div className="overflow-hidden">
            <iframe
              title="ANORA atelier on map"
              src="https://www.openstreetmap.org/export/embed.html?bbox=-74.005%2C40.720%2C-73.995%2C40.728&layer=mapnik"
              className="w-full aspect-[16/10] border-0"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
        {label}
      </span>
      <input
        {...rest}
        className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors"
      />
    </label>
  );
}

function Info({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <div className="flex items-start gap-4">
      <span className="h-9 w-9 grid place-items-center border border-border shrink-0">{icon}</span>
      <div>
        <p className="eyebrow mb-1">{label}</p>
        <p className="font-serif text-lg">{value}</p>
      </div>
    </div>
  );
  return href ? (
    <a href={href} className="block hover:text-gold transition-colors">
      {inner}
    </a>
  ) : (
    inner
  );
}
