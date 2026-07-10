import p1 from "@/assets/p1.jpg";
import p2 from "@/assets/p2.jpg";
import p3 from "@/assets/p3.jpg";
import p4 from "@/assets/p4.jpg";
import p5 from "@/assets/p5.jpg";
import p6 from "@/assets/p6.jpg";
import blog1 from "@/assets/blog1.jpg";
import blog2 from "@/assets/blog2.jpg";
import blog3 from "@/assets/blog3.jpg";

export type Category = "clothing" | "jewellery";

export interface ColorVariant {
  color: string;
  images: string[];
  sizes?: string[];
  sizeStock?: Record<string, number>;
  stock: number;
  sku?: string;
  priceOverride?: number;
  attributes?: Record<string, unknown>;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  price: number;
  category: Category;
  subcategory: string;
  description: string;
  fabric?: string;
  material?: string;
  color: string;
  sizes: string[];
  sku: string;
  stock: number;
  sizeStock?: Record<string, number>;
  images: string[];
  badge?: string;
  colorVariants?: ColorVariant[];
  metadata?: Record<string, unknown>;
}

export const subcategories: Record<Category, string[]> = {
  clothing: ["Unstitched", "Pret", "Luxury Pret", "Formal Wear", "Casual Wear"],
  jewellery: ["Rings", "Earrings", "Bracelets", "Necklaces"],
};

export const products: Product[] = [
  {
    id: "1",
    slug: "soft-bloom",
    name: "Soft Bloom",
    price: 149,
    category: "clothing",
    subcategory: "Luxury Pret",
    description:
      "An effortless silhouette in liquid silk, cut on the bias to drape weightlessly through movement. Hand-finished seams and a whisper-soft hand-feel.",
    fabric: "100% Mulberry Silk",
    color: "Ivory",
    sizes: ["XS", "S", "M", "L", "XL", "XXL"],
    sku: "ANR-SB-001",
    stock: 12,
    sizeStock: { XS: 0, S: 3, M: 5, L: 4, XL: 0, XXL: 0 },
    images: [p1, p2, p3],
    badge: "New",
    colorVariants: [
      {
        color: "Ivory",
        images: [p1, p2, p3],
        stock: 12,
        sizeStock: { XS: 0, S: 3, M: 5, L: 4, XL: 0, XXL: 0 },
        sku: "ANR-SB-001",
      },
      {
        color: "Blush",
        images: [p3, p1, p2],
        stock: 8,
        sizeStock: { XS: 2, S: 0, M: 4, L: 0, XL: 1, XXL: 0 },
        sku: "ANR-SB-002",
      },
    ],
    metadata: { low_stock: false },
  },
  {
    id: "2",
    slug: "camel-cashmere-coat",
    name: "Atelier Cashmere Coat",
    price: 689,
    category: "clothing",
    subcategory: "Formal Wear",
    description:
      "A modern interpretation of the heritage wrap coat in pure cashmere, tailored in our atelier with a self-tie belt and tonal horn buttons.",
    fabric: "100% Italian Cashmere",
    color: "Camel",
    sizes: ["XS", "S", "M", "L", "XL", "XXL"],
    sku: "ANR-CC-002",
    stock: 7,
    images: [p2, p1, p3],
    badge: "Best Seller",
    metadata: { low_stock: false },
  },
  {
    id: "3",
    slug: "noor-embroidered-kaftan",
    name: "Noor Embroidered Kaftan",
    price: 429,
    category: "clothing",
    subcategory: "Formal Wear",
    description:
      "A ceremonial silhouette hand-embroidered with antique-gold zardozi. Lined in soft silk for an opulent drape.",
    fabric: "Raw Silk · Hand Zardozi",
    color: "Ivory & Gold",
    sizes: ["XS", "S", "M", "L", "XL", "XXL"],
    sku: "ANR-NK-003",
    stock: 5,
    images: [p3, p1, p2],
    metadata: { low_stock: true },
  },
  {
    id: "4",
    slug: "solitaire-aurelia-ring",
    name: "Aurelia Solitaire Ring",
    price: 1290,
    category: "jewellery",
    subcategory: "Rings",
    description:
      "A six-prong solitaire in 18k recycled gold, set with a brilliant-cut lab-grown diamond. Made to be worn every day, forever.",
    material: "18k Recycled Gold · 0.5ct Diamond",
    color: "Gold",
    sizes: ["5", "6", "7", "8", "9"],
    sku: "ANR-AR-004",
    stock: 3,
    images: [p4, p5, p6],
    badge: "New",
    sizeStock: { "5": 0, "6": 1, "7": 1, "8": 1, "9": 0 },
    metadata: { low_stock: true },
  },
  {
    id: "5",
    slug: "lune-pearl-drops",
    name: "Lune Pearl Drops",
    price: 285,
    category: "jewellery",
    subcategory: "Earrings",
    description:
      "Hand-selected golden South Sea pearls suspended from a delicate 18k gold hook. Quietly luminous.",
    material: "18k Gold · South Sea Pearl",
    color: "Gold · Champagne",
    sizes: ["One Size"],
    sku: "ANR-LP-005",
    stock: 9,
    images: [p5, p4, p6],
    metadata: { low_stock: false },
  },
  {
    id: "6",
    slug: "celeste-diamond-necklace",
    name: "Celeste Diamond Necklace",
    price: 540,
    category: "jewellery",
    subcategory: "Necklaces",
    description:
      "A single diamond suspended on a fine 18k gold chain — the most quietly perfect thing you'll ever own.",
    material: "18k Gold · 0.15ct Diamond",
    color: "Gold",
    sizes: ['16"', '18"', '20"'],
    sku: "ANR-CN-006",
    stock: 14,
    images: [p6, p4, p5],
    badge: "Best Seller",
    sizeStock: { '16"': 5, '18"': 6, '20"': 3 },
    metadata: { low_stock: false },
  },
];

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readTime: string;
  cover: string;
  content: string[];
}

export const blogPosts: BlogPost[] = [
  {
    slug: "the-language-of-gold",
    title: "The Quiet Language of Gold",
    excerpt: "A meditation on why the most precious things we own rarely announce themselves.",
    category: "Editorial",
    date: "March 12, 2026",
    readTime: "6 min read",
    cover: blog1,
    content: [
      "There is a particular kind of luxury that doesn't ask to be noticed. It arrives slowly, in the way a piece of jewellery catches the morning light on a bedside table, in the soft sound of a clasp closing at the back of the neck.",
      "Gold has carried meaning for almost as long as we have made meaning. It has been currency, vow, devotion, inheritance. In our atelier, we think of it less as material and more as memory — something poured carefully into the shape of a life.",
      "The Aurelia solitaire began as a single sketch on tracing paper. The Celeste necklace, as a single sentence. Every ANORA piece begins this way: with restraint, with reverence, with the quiet hope that one day it will be worn so often it disappears into a wardrobe and becomes part of someone.",
    ],
  },
  {
    slug: "inside-the-atelier",
    title: "Inside the Atelier",
    excerpt: "A morning with the artisans behind our Luxury Pret collection.",
    category: "Craft",
    date: "February 28, 2026",
    readTime: "8 min read",
    cover: blog2,
    content: [
      "Light enters our atelier at an angle most rooms never receive. It falls across the cutting tables in long, considered bands, and the day begins.",
      "Every garment we make passes through the same eleven hands. We do not believe in haste. We believe in the time it takes a needle to find the exact right grain of a silk, and in the conversations that happen quietly across a table while it does.",
      "When you receive an ANORA piece, you are also receiving a particular morning of work — a slow, careful morning that is itself a kind of gift.",
    ],
  },
  {
    slug: "fabric-stories-silk",
    title: "Fabric Stories — Mulberry Silk",
    excerpt: "Why our silks are sourced from a single mill in Lyon.",
    category: "Material",
    date: "February 04, 2026",
    readTime: "5 min read",
    cover: blog3,
    content: [
      "A great silk does not lie still. It moves with the body, catches the room, holds heat in winter and releases it in summer. It feels, against the skin, like very little at all — which is exactly the point.",
      "We source our silks from a single mill in Lyon that has been weaving since 1842. The water there is soft. The looms are old enough to remember a slower kind of luxury.",
      "Caring for a fine silk is its own ritual. Cool water. Gentle hands. The patience to lay it flat in the sun. Done well, a piece will outlast its first owner and find a second.",
    ],
  },
];

export const faqs = [
  {
    q: "How long does shipping take?",
    a: "Complimentary express shipping arrives within 3–5 business days. International orders arrive within 7–10 business days, hand-delivered with full tracking.",
  },
  {
    q: "What is your return policy?",
    a: "We offer 14-day returns on unworn pieces in original packaging. Fine jewellery and made-to-order garments are final sale.",
  },
  {
    q: "How does the exchange process work?",
    a: "Request an exchange from your account or email us within 14 days. We arrange complimentary collection and send your new piece as soon as the original is received.",
  },
  {
    q: "Which payment methods do you accept?",
    a: "We accept all major credit cards, debit cards, Apple Pay, Google Pay, and other payment methods supported by Stripe.",
  },
  {
    q: "How can I track my order?",
    a: "A tracking link is sent the moment your piece leaves our atelier. You can also follow its journey from My Orders.",
  },
  {
    q: "How should I care for my jewellery?",
    a: "Store each piece separately in the pouch provided. Avoid contact with perfumes, lotions and chlorine. A soft polishing cloth restores shine in moments.",
  },
];
