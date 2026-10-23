# UI Design System & Luxury Branding

This document outlines the UI design rules, custom tokens, and layout guidelines that maintain ANORA's luxury styling.

## Design Aesthetics

### Typography
- **Headings**: Elegant serif typefaces (e.g. Playfair Display or custom serif styling) for high contrast and brand premium feel.
- **Labels & CTAs**: High letter-spacing mono/sans fonts (e.g. `tracking-[0.32em] uppercase text-[11px]`) for a clean, minimalist fashion brand aesthetic.

### Color Palette
- **Primary Elements**: Charcoal / Black (`#111111` or `#171717`) and crisp clean whites.
- **Accents**: Subtle metallic Gold (`#D4AF37` / `.text-gold`) representing premium quality.
- **Backgrounds**: Soft Warm Ivory, Champagne, and Translucent glass overlays (`backdrop-blur bg-background/90`).

### Interactive Elements
- Hover transitions are smooth and slow (`transition-all duration-500` or `duration-1000 group-hover:scale-105`).
- Visual states like out-of-stock items use clean semi-transparent white overlays with blurred filters to retain premium styling without feeling broken.

## Mobile Responsiveness & Breakpoint Rules
Supports responsive scales across standard viewport sizes (320px to 430px+):
- **No Viewport Overflows**: Avoid fixed element pixel widths (`width: 320px` etc.) in favor of percentage, flex-wrap, or grid-adjusting systems.
- **Touch-Friendly Buttons**: Heart toggles, close actions, and profile dropdown links use appropriate paddings for easy touch accessibility.
- **Fluid Multi-column Grids**: Adjust grid layouts (`grid-cols-2 lg:grid-cols-3` or `grid-cols-1 md:grid-cols-2`) for elegant element density on small screens.
