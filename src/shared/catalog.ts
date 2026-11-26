import type {
  Category,
  Coupon,
  Product,
  StoreSettings,
  WebsiteContent,
  WebsiteTheme,
} from './types';

export const HERO_IMAGE_URL = '/src/assets/images/hero_department_store_1795715867008.jpg';
export const CRAFT_IMAGE_URL = '/src/assets/images/editorial_curated_showroom_1795715872561.jpg';

export const DEFAULT_CATEGORIES: Category[] = [
  {
    slug: 'kitchen-appliances',
    name: 'Kitchen Appliances',
    description: 'Precision espresso makers, stand mixers, and smart countertop ovens built for daily cooking.',
    isDefault: true,
  },
  {
    slug: 'dresses',
    name: 'Dresses',
    description: 'Fluid satin midis, breathable cotton-linen maxis, and effortless occasion silhouettes.',
    isDefault: true,
  },
  {
    slug: 'fashion',
    name: 'Fashion & Tailoring',
    description: 'Structured linen-wool blazers, crisp everyday layers, and contemporary wardrobe staples.',
    isDefault: true,
  },
  {
    slug: 'accessories',
    name: 'Bags & Accessories',
    description: 'Full-grain leather totes, tortoiseshell eyewear, and versatile carry essentials.',
    isDefault: true,
  },
];

export const DEFAULT_PRODUCTS: Product[] = [
  {
    slug: 'barista-compact-espresso-machine',
    sku: 'THL-KTC-01',
    title: 'Barista Compact Espresso Machine',
    subtitle: '15-bar thermoblock espresso maker with stainless steam wand',
    category: 'kitchen-appliances',
    priceInr: 18990,
    stock: 11,
    editionNote: '2-Year Appliance Warranty · 230V India Plug',
    description:
      'Engineered with a commercial-grade 58 mm stainless portafilter, rapid 35-second PID heat-up, and an articulating micro-foam steam wand. Designed with a slim matte-black and brushed steel footprint that sits comfortably on compact apartment counters.',
    materials: 'Brushed 304 stainless steel, matte powder-coated chassis, BPA-free 1.8 L tank',
    dimensions: '22 cm W × 31 cm D × 30 cm H · 1350 W (220–240V)',
    care: 'Descale every 60 days; removable drip tray and water tank are hand-wash safe.',
    options: [
      { label: 'Finish', values: ['Matte Black & Steel', 'Brushed Silver'] },
      { label: 'Bundle', values: ['Machine + Milk Pitcher & Tamper', 'Machine Only'] },
    ],
    media: [
      {
        id: 'm-espresso-1',
        kind: 'image',
        url: '/src/assets/images/prod_espresso_maker_1795715868210.jpg',
        alt: 'Matte black and brushed stainless compact espresso machine with portafilter and milk pitcher',
      },
      {
        id: 'm-espresso-2',
        kind: 'image',
        url: HERO_IMAGE_URL,
        alt: 'Espresso machine styled inside sunlit contemporary showroom',
      },
    ],
    featured: true,
  },
  {
    slug: 'emerald-pleated-satin-midi-dress',
    sku: 'THL-DRS-01',
    title: 'Emerald Pleated Satin Midi Dress',
    subtitle: 'Sunburst-pleated wrap silhouette with adjustable waist tie',
    category: 'dresses',
    priceInr: 4850,
    stock: 14,
    editionNote: 'New Season · True to Size',
    description:
      'Cut on the bias from luminous heavy satin with knife-pressed sunburst pleats that move effortlessly from evening dinners to festive gatherings. Features a flattering crossover V-neckline and an attached self-fabric belt.',
    materials: '100% recycled heavy Japanese-weave satin (190 GSM), breathable viscose lining',
    dimensions: 'Midi length: 122 cm from shoulder (Size M) · Sleeveless wrap cut',
    care: 'Dry clean or gentle cold hand wash inside out; steam lightly on low heat.',
    options: [
      { label: 'Size', values: ['XS', 'S', 'M', 'L', 'XL'] },
      { label: 'Color', values: ['Deep Emerald', 'Midnight Ink', 'Champagne'] },
    ],
    media: [
      {
        id: 'm-emerald-1',
        kind: 'image',
        url: '/src/assets/images/prod_emerald_midi_dress_1795715870632.jpg',
        alt: 'Deep emerald pleated satin midi wrap dress in sunlit boutique studio',
      },
      {
        id: 'm-emerald-2',
        kind: 'image',
        url: CRAFT_IMAGE_URL,
        alt: 'Curated dresses rack inside sunlit contemporary showroom',
      },
    ],
    featured: true,
  },
  {
    slug: 'artisan-tilt-head-stand-mixer',
    sku: 'THL-KTC-02',
    title: 'Artisan 5 L Tilt-Head Stand Mixer',
    subtitle: '10-speed die-cast planetary mixer with stainless bowl & 3 attachments',
    category: 'kitchen-appliances',
    priceInr: 14490,
    stock: 8,
    editionNote: '2-Year Motor Warranty · 1000 W',
    description:
      'Built around a quiet direct-drive copper motor and 67-point planetary mixing action for silky meringues, brioche doughs, and cake batters. Includes a 5-litre brushed stainless steel bowl, wire whisk, dough hook, and flat beater.',
    materials: 'Die-cast zinc housing, 304 stainless steel 5 L bowl and accessories',
    dimensions: '35 cm L × 22 cm W × 36 cm H · Weight 8.6 kg · 1000 W',
    care: 'Bowl and stainless attachments are dishwasher safe; wipe mixer body with damp cloth.',
    options: [
      { label: 'Color', values: ['Warm Stone Grey', 'Matte Ivory', 'Obsidian'] },
    ],
    media: [
      {
        id: 'm-mixer-1',
        kind: 'image',
        url: '/src/assets/images/prod_stand_mixer_1795715868564.jpg',
        alt: 'Matte warm grey tilt-head kitchen stand mixer with stainless bowl and whisk',
      },
    ],
    featured: true,
  },
  {
    slug: 'ivory-tiered-cotton-linen-maxi-dress',
    sku: 'THL-DRS-02',
    title: 'Ivory Tiered Cotton-Linen Maxi Dress',
    subtitle: 'Square-neck breathable summer dress with puff sleeves and waist belt',
    category: 'dresses',
    priceInr: 3950,
    stock: 16,
    editionNote: 'Summer Edit · Side Seam Pockets',
    description:
      'Tailored from airy European flax and combed organic cotton for humid afternoons and coastal travel. Designed with a structured square neckline, elasticated puff sleeves, deep hidden pockets, and softly gathered three-tier hem.',
    materials: '55% Belgian linen, 45% combed organic cotton, full cotton voile lining',
    dimensions: 'Ankle-grazing maxi length: 132 cm (Size M)',
    care: 'Cold gentle machine wash; line dry in shade and press while slightly damp.',
    options: [
      { label: 'Size', values: ['XS', 'S', 'M', 'L', 'XL'] },
      { label: 'Shade', values: ['Warm Ivory', 'Soft Oat', 'Sage Olive'] },
    ],
    media: [
      {
        id: 'm-ivory-1',
        kind: 'image',
        url: '/src/assets/images/prod_ivory_maxi_dress_1795715871195.jpg',
        alt: 'Ivory tiered cotton-linen maxi dress with waist tie on brushed brass hanger',
      },
    ],
    featured: true,
  },
  {
    slug: 'digital-convection-air-fryer-oven',
    sku: 'THL-KTC-03',
    title: 'Digital Glass Air Fryer Toaster Oven',
    subtitle: '22 L 10-in-1 countertop convection oven with digital LED presets',
    category: 'kitchen-appliances',
    priceInr: 11250,
    stock: 6,
    editionNote: '2-Year Warranty · 1800 W Convection',
    description:
      'Replaces single-purpose fryers and cramped toasters with high-velocity 360° hot-air circulation inside a spacious 22-litre cavity. Air fry, roast, bake sourdough, dehydrate, or reheat with one-dial digital temperature precision.',
    materials: 'Matte powder-coated steel exterior, satin stainless interior, tempered glass door',
    dimensions: '40 cm W × 36 cm D × 29 cm H · Fits 12-inch pizza or 6 slices',
    care: 'Slide-out crumb tray, wire rack, and air-fry basket are dishwasher safe.',
    options: [
      { label: 'Finish', values: ['Warm White & Steel', 'Graphite & Steel'] },
    ],
    media: [
      {
        id: 'm-airfryer-1',
        kind: 'image',
        url: '/src/assets/images/prod_air_fryer_oven_1795715869251.jpg',
        alt: 'Minimalist matte warm white and steel digital countertop air fryer toaster oven',
      },
    ],
    featured: true,
  },
  {
    slug: 'sand-structured-linen-wool-blazer',
    sku: 'THL-FSH-01',
    title: 'Sand Tailored Linen-Wool Blazer',
    subtitle: 'Half-lined single-breasted jacket with horn buttons',
    category: 'fashion',
    priceInr: 6490,
    stock: 9,
    editionNote: 'Contemporary Tailoring · Breathable Weave',
    description:
      'A softly structured two-button blazer that bridges boardroom tailoring and relaxed weekend layering. Cut with a natural shoulder, breathable Bemberg half-lining, flap pockets, and genuine horn buttons.',
    materials: '62% linen, 38% lightweight tropical wool, cupro half-lining',
    dimensions: 'Tailored regular fit · Back length 73 cm (Size M)',
    care: 'Dry clean only; steam between wears to release natural linen creases.',
    options: [
      { label: 'Size', values: ['S', 'M', 'L', 'XL'] },
      { label: 'Color', values: ['Warm Sand', 'Charcoal Slate', 'Deep Navy'] },
    ],
    media: [
      {
        id: 'm-blazer-1',
        kind: 'image',
        url: '/src/assets/images/prod_tailored_blazer_1795715871733.jpg',
        alt: 'Structured sand-beige linen-wool blazer layered over crisp white crew t-shirt',
      },
    ],
    featured: true,
  },
  {
    slug: 'cognac-full-grain-leather-tote',
    sku: 'THL-ACC-01',
    title: 'Cognac Full-Grain Leather Work Tote',
    subtitle: 'Pebbled leather zip-top tote fitting 15" laptops with brass hardware',
    category: 'accessories',
    priceInr: 5890,
    stock: 12,
    editionNote: 'Everyday Carry · Removable Crossbody Strap',
    description:
      'Crafted from supple full-grain pebbled cowhide with reinforced shoulder straps, a smooth top brass zipper, padded 15-inch laptop sleeve, and twin interior pockets for phone and sunglasses.',
    materials: '100% full-grain pebbled leather, brushed brass hardware, cotton twill lining',
    dimensions: '38 cm W × 28 cm H × 13 cm D · Strap drop 24 cm',
    care: 'Wipe with a soft dry cloth and condition twice a year with neutral leather balm.',
    options: [
      { label: 'Color', values: ['Cognac Tan', 'Espresso Brown', 'Classic Black'] },
      { label: 'Set', values: ['Tote Only', 'Tote + Tortoise Sunglasses'] },
    ],
    media: [
      {
        id: 'm-tote-1',
        kind: 'image',
        url: '/src/assets/images/prod_leather_tote_bag_1795715872827.jpg',
        alt: 'Structured cognac full-grain leather everyday tote bag beside tortoiseshell sunglasses',
      },
    ],
    featured: true,
  },
  {
    slug: 'champagne-silk-slip-evening-dress',
    sku: 'THL-DRS-03',
    title: 'Champagne Bias-Cut Silk Slip Dress',
    subtitle: 'Fluid cowl-neck satin evening dress for effortless layering',
    category: 'dresses',
    priceInr: 5490,
    stock: 4,
    editionNote: 'Limited Run · Bias-Cut Drape',
    description:
      'Draped along the true bias for a liquid silhouette that skims without clinging. Designed with a soft cowl neckline and delicate straps—wear solo for evening occasions or layer under our Sand Tailored Blazer.',
    materials: '100% 22-momme Mulberry silk satin',
    dimensions: 'Midi length: 118 cm from shoulder · Adjustable straps',
    care: 'Dry clean recommended or gentle cold hand wash with silk detergent.',
    options: [
      { label: 'Size', values: ['XS', 'S', 'M', 'L'] },
      { label: 'Color', values: ['Champagne Gold', 'Deep Emerald'] },
    ],
    media: [
      {
        id: 'm-slip-1',
        kind: 'image',
        url: HERO_IMAGE_URL,
        alt: 'Champagne bias-cut silk cowl-neck midi dress hanging on minimalist brass rack',
      },
      {
        id: 'm-slip-2',
        kind: 'image',
        url: '/src/assets/images/prod_emerald_midi_dress_1795715870632.jpg',
        alt: 'Satin evening dress styling detail in sunlit studio',
      },
    ],
    featured: false,
  },
  {
    slug: 'oatmeal-linen-overshirt-trouser-set',
    sku: 'THL-FSH-02',
    title: 'Oatmeal Belgian Linen Overshirt & Pleated Trousers',
    subtitle: 'Relaxed horn-button linen overshirt paired with charcoal-stone tailored trousers',
    category: 'fashion',
    priceInr: 7290,
    stock: 11,
    editionNote: 'Two-Piece Edit · Breathable Linen',
    description:
      'Cut from pre-washed Belgian flax linen for effortless drape and all-day comfort. Wear the oatmeal overshirt open over tees or buttoned as a sharp top, paired with high-rise double-pleated charcoal-stone trousers.',
    materials: '100% 185 GSM Belgian flax linen overshirt; linen-viscose suiting trousers',
    dimensions: 'Relaxed regular fit · Trouser inseam 76 cm (Size M)',
    care: 'Cold gentle machine wash inside out; line dry in shade and steam lightly.',
    options: [
      { label: 'Size', values: ['S', 'M', 'L', 'XL'] },
      { label: 'Purchase', values: ['Complete 2-Piece Set', 'Linen Overshirt Only'] },
    ],
    media: [
      {
        id: 'm-overshirt-1',
        kind: 'image',
        url: '/src/assets/images/prod_linen_overshirt_set_1795718001671.jpg',
        alt: 'Oatmeal Belgian linen button-down overshirt with pleated charcoal-stone trousers',
      },
    ],
    featured: true,
  },
  {
    slug: 'espresso-leather-saddle-crossbody',
    sku: 'THL-ACC-02',
    title: 'Espresso Full-Grain Saddle Crossbody',
    subtitle: 'Structured curved leather crossbody bag with brushed brass lock and silk twill scarf',
    category: 'accessories',
    priceInr: 4650,
    stock: 9,
    editionNote: 'Everyday Carry · Adjustable Strap',
    description:
      'Hand-finished in vegetable-tanned espresso full-grain leather with a curved saddle flap, brushed brass push-lock closure, suede-lined main compartment, and back slip pocket for quick phone access.',
    materials: '100% vegetable-tanned full-grain leather, brushed brass clasp, micro-suede lining',
    dimensions: '23 cm W × 18 cm H × 8 cm D · Strap drop 48–56 cm',
    care: 'Keep away from prolonged rain; buff gently with a soft cotton cloth.',
    options: [
      { label: 'Color', values: ['Espresso Brown', 'Cognac Tan', 'Black'] },
      { label: 'Bundle', values: ['Bag Only', 'Bag + Printed Silk Scarf'] },
    ],
    media: [
      {
        id: 'm-saddle-1',
        kind: 'image',
        url: '/src/assets/images/prod_leather_crossbody_bag_1795717999444.jpg',
        alt: 'Espresso brown full-grain leather saddle crossbody bag with brushed brass clasp beside a folded silk scarf',
      },
    ],
    featured: true,
  },
];

export const DEFAULT_COUPONS: Coupon[] = [
  {
    code: 'WELCOME10',
    kind: 'percent',
    value: 10,
    minSubtotalInr: 2000,
    description: '10% off orders above ₹2,000',
    active: true,
    isDefault: true,
  },
  {
    code: 'SAVE500',
    kind: 'flat',
    value: 500,
    minSubtotalInr: 4500,
    description: '₹500 off orders above ₹4,500',
    active: true,
    isDefault: true,
  },
  {
    code: 'FREESHIP',
    kind: 'shipping',
    value: 0,
    minSubtotalInr: 0,
    description: 'Complimentary express delivery across India',
    active: true,
    isDefault: true,
  },
];

export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'Thelakkad Store',
  tagline: 'Modern kitchen appliances, contemporary fashion, dresses, and everyday essentials curated under one roof.',
  studioAddress: 'Flagship Showroom, 12th Road, Bandra West, Mumbai 400050',
  supportEmail: 'support@thelakkadstore.in',
  supportPhone: '+91 22 4890 3142',
  freeShippingThresholdInr: 4999,
  flatShippingInr: 199,
  dispatchWindow: 'Express dispatch within 24–48 hours across India with easy 14-day size exchanges.',
  announcement: 'New Season Live — Use WELCOME10 for 10% off kitchen appliances, fashion & dresses.',
};

export const WEBSITE_THEME_PRESETS: Array<{ name: string; theme: WebsiteTheme }> = [
  {
    name: 'Warm Limestone',
    theme: {
      bgColor: '#f6f1ea',
      surfaceColor: '#fcf9f5',
      inkColor: '#1c1917',
      accentColor: '#8c4a2f',
    },
  },
  {
    name: 'Gallery White',
    theme: {
      bgColor: '#f8f9fa',
      surfaceColor: '#ffffff',
      inkColor: '#111827',
      accentColor: '#1d4ed8',
    },
  },
  {
    name: 'Botanical Stone',
    theme: {
      bgColor: '#f3f5f1',
      surfaceColor: '#fafbf9',
      inkColor: '#1a241f',
      accentColor: '#2e4a3d',
    },
  },
  {
    name: 'Evening Linen',
    theme: {
      bgColor: '#f4f0eb',
      surfaceColor: '#fbf9f6',
      inkColor: '#221c29',
      accentColor: '#6d3b5c',
    },
  },
];

export const DEFAULT_WEBSITE: WebsiteContent = {
  theme: {
    bgColor: '#f6f1ea',
    surfaceColor: '#fcf9f5',
    inkColor: '#1c1917',
    accentColor: '#8c4a2f',
  },
  showAnnouncement: true,
  header: {
    shopLabel: 'Shop',
    aboutLabel: 'About',
    trackLabel: 'Track Order',
    bagLabel: 'Bag',
  },
  hero: {
    visible: true,
    eyebrow: 'New Season · Kitchen & Wardrobe',
    headline: 'Kitchen appliances, fashion and dresses.',
    subheadline:
      'Modern kitchen appliances, contemporary fashion, dresses, and everyday essentials curated under one roof.',
    primaryCtaLabel: 'Shop All Departments',
    secondaryCtaLabel: 'Track Order',
    imageUrl: HERO_IMAGE_URL,
    imageAlt:
      'Brushed stainless espresso machine alongside tailored linen apparel and a draped silk dress in our flagship showroom',
  },
  collection: {
    eyebrow: 'Shop by Department',
    heading: 'Featured Arrivals',
    searchPlaceholder: 'Search espresso, dresses, blazers…',
    showSearch: true,
    showCategoryTabs: true,
  },
  about: {
    visible: true,
    eyebrow: 'Curated Everyday Living',
    heading: 'Built for daily kitchens and modern wardrobes.',
    body: 'We pair high-performance countertop kitchen appliances with well-tailored dresses, structured outerwear, and full-grain leather accessories. Every piece is selected for lasting materials, dependable engineering, and straightforward service across India.',
    imageUrl: CRAFT_IMAGE_URL,
    imageAlt:
      'Contemporary showroom displaying curated racks of dresses beside brushed steel kitchen appliances',
    highlights: [
      {
        title: 'Appliances',
        description: '2-year pan-India warranty, BIS-compliant 230V plugs',
      },
      {
        title: 'Apparel',
        description: 'Natural linen, silk satin & easy 14-day size exchanges',
      },
      {
        title: 'Delivery',
        description: 'Dispatched in 24–48 hrs with live order tracking',
      },
    ],
  },
  footer: {
    linksHeading: 'Store',
    shippingHeading: 'Shipping & Exchanges',
    copyrightNote: 'Kitchen Appliances, Fashion & Dresses.',
    showFreeShippingNote: true,
  },
};

