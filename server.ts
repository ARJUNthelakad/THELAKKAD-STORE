import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type {
  CouponKind,
  MediaKind,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductMedia,
  ProductOption,
  PublicOrderLookup,
  StaffRole,
  WebsiteContent,
  WebsiteHighlight,
} from './src/shared/types';
import {
  checkRateLimit,
  clearSessionCookie,
  extractSessionToken,
  getAppOrigin,
  getClientIp,
  isMailConfigured,
  isSafeMediaUrl,
  isValidEmail,
  maskEmail,
  sendMail,
  setSessionCookie,
  verifyCsrfRequest,
} from './src/server/auth';
import {
  addNewsletterSubscriber,
  authenticateStaff,
  consumeResetToken,
  consumeVerificationToken,
  createActionToken,
  createCategory,
  createCoupon,
  createFirstAdmin,
  createOrder,
  createProduct,
  createReview,
  createSession,
  createStaffAccount,
  deleteCategory,
  deleteCoupon,
  deleteReview,
  deleteStaffAccount,
  findStaffByEmail,
  findStaffById,
  getAllReviews,
  getAllStaff,
  getCategories,
  getCoupons,
  getMergedProducts,
  getOrderByReference,
  getOrders,
  getReviewsBySlug,
  getReviewStats,
  getSettings,
  getStaffBySessionToken,
  getWebsiteContent,
  hasAnyStaff,
  resetOrDeleteProduct,
  resetWebsiteContent,
  revokeSession,
  setProductArchived,
  slugify,
  toPublicStaff,
  updateCategory,
  updateOrderStatus,
  updateProduct,
  updateSettings,
  updateStaffPassword,
  updateWebsiteContent,
  type StaffRecord,
} from './src/server/db';

const PORT = Number(process.env.PORT) || 3000;
const UPLOADS_DIR = process.env.VERCEL
  ? path.join('/tmp', 'thelakkad-uploads')
  : path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

interface AuthedRequest extends Request {
  staff?: StaffRecord;
}

const ALLOWED_ORDER_STATUSES = new Set<OrderStatus>([
  'confirmed',
  'packed',
  'dispatched',
  'delivered',
  'cancelled',
]);

const ALLOWED_PAYMENT_METHODS = new Set<PaymentMethod>(['upi', 'card', 'cod']);
const ALLOWED_COUPON_KINDS = new Set<CouponKind>(['percent', 'flat', 'shipping']);

const ALLOWED_MEDIA_MIME: Record<
  string,
  { ext: string; kind: MediaKind; maxBytes: number }
> = {
  'image/jpeg': { ext: '.jpg', kind: 'image', maxBytes: 4 * 1024 * 1024 },
  'image/png': { ext: '.png', kind: 'image', maxBytes: 4 * 1024 * 1024 },
  'image/webp': { ext: '.webp', kind: 'image', maxBytes: 4 * 1024 * 1024 },
  'video/mp4': { ext: '.mp4', kind: 'video', maxBytes: 25 * 1024 * 1024 },
  'video/webm': { ext: '.webm', kind: 'video', maxBytes: 25 * 1024 * 1024 },
};

function matchesMagicBytes(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  if (mime === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mime === 'image/png') {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (mime === 'image/webp') {
    return (
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mime === 'video/mp4') {
    return buf.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  if (mime === 'video/webm') {
    return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  }
  return false;
}

function safeDeleteUploadUrl(url: string): void {
  if (!url.startsWith('/uploads/')) return;
  const filename = url.slice('/uploads/'.length);
  if (!/^[a-f0-9-]+\.(jpg|png|webp|mp4|webm)$/i.test(filename)) return;
  const resolved = path.resolve(UPLOADS_DIR, filename);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) return;
  if (fs.existsSync(resolved)) {
    try {
      fs.unlinkSync(resolved);
    } catch {
      // Ignore cleanup errors for missing files
    }
  }
}

function validateMediaList(raw: unknown): ProductMedia[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10) {
    throw new Error('Provide between 1 and 10 media items.');
  }
  let imageCount = 0;
  let videoCount = 0;
  const cleaned: ProductMedia[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid media entry.');
    }
    const rec = item as Record<string, unknown>;
    const kind: MediaKind = rec.kind === 'video' ? 'video' : 'image';
    const url = typeof rec.url === 'string' ? rec.url.trim() : '';
    const alt = typeof rec.alt === 'string' ? rec.alt.trim().slice(0, 180) : '';
    if (!isSafeMediaUrl(url)) {
      throw new Error('Media URL must be a valid studio asset, upload, or HTTPS link.');
    }
    if (kind === 'image') imageCount += 1;
    if (kind === 'video') videoCount += 1;
    cleaned.push({
      id: typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim().slice(0, 64) : `m_${crypto.randomUUID().slice(0, 8)}`,
      kind,
      url,
      alt: alt || 'Thelakkad Store studio piece',
    });
  }

  if (imageCount < 1 || imageCount > 8) {
    throw new Error('Products must include between 1 and 8 photos.');
  }
  if (videoCount > 2) {
    throw new Error('Products can include at most 2 videos.');
  }
  return cleaned;
}

function validateOptions(raw: unknown): ProductOption[] {
  if (!Array.isArray(raw)) return [];
  const result: ProductOption[] = [];
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const label = typeof rec.label === 'string' ? rec.label.trim().slice(0, 48) : '';
    const values = Array.isArray(rec.values)
      ? rec.values
          .map((v) => (typeof v === 'string' ? v.trim().slice(0, 48) : ''))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    if (label && values.length > 0) {
      result.push({ label, values });
    }
  }
  return result;
}

function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (!verifyCsrfRequest(req)) {
    res.status(403).json({ error: 'Cross-origin mutation blocked.' });
    return;
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const staff = getStaffBySessionToken(token);
  if (!staff) {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }
  req.staff = staff;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.staff) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.staff.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges required.' });
    return;
  }
  next();
}

const app = express();
app.set('trust proxy', 1);

  // Basic security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Safe uploaded media static serving with strict confinement
  app.get('/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!/^[a-f0-9-]+\.(jpg|png|webp|mp4|webm)$/i.test(filename)) {
      res.status(400).send('Invalid file name');
      return;
    }
    const resolved = path.resolve(UPLOADS_DIR, filename);
    if (!resolved.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).send('Not found');
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(resolved);
  });

  // Larger JSON body limit strictly for the authenticated media upload route
  app.use('/api/admin/products/media-uploads', express.json({ limit: '36mb' }));
  app.use(express.json({ limit: '1mb' }));

  // =========================================================================
  // PUBLIC STOREFRONT & ORDER ROUTES
  // =========================================================================

  app.get('/api/store', (req, res) => {
    const includeArchived = req.query.includeArchived === 'true';
    let allowArchived = false;
    if (includeArchived) {
      const token = extractSessionToken(req);
      if (token && getStaffBySessionToken(token)) {
        allowArchived = true;
      }
    }
    res.json({
      products: getMergedProducts(allowArchived),
      categories: getCategories(),
      coupons: getCoupons().filter((c) => c.active),
      settings: getSettings(),
      website: getWebsiteContent(),
      reviewStats: getReviewStats(),
    });
  });

  app.get('/api/products/:slug/reviews', (req, res) => {
    const reviews = getReviewsBySlug(req.params.slug);
    const count = reviews.length;
    const average =
      count > 0
        ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10
        : 0;
    const distribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of reviews) {
      if (distribution[r.rating] !== undefined) {
        distribution[r.rating] += 1;
      }
    }
    res.json({ reviews, average, count, distribution });
  });

  app.post('/api/products/:slug/reviews', requireCsrf, (req, res) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(`review:${ip}`, 12, 15 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many review submissions. Please wait a few minutes.' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const authorName = typeof body.authorName === 'string' ? body.authorName.trim() : '';
    const rating = Number(body.rating);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    const orderReference =
      typeof body.orderReference === 'string' ? body.orderReference.trim().slice(0, 32) : undefined;

    if (authorName.length < 2 || authorName.length > 60) {
      res.status(400).json({ error: 'Please enter your name (2–60 characters).' });
      return;
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'Select a star rating between 1 and 5.' });
      return;
    }
    if (title.length > 100) {
      res.status(400).json({ error: 'Review title must be 100 characters or fewer.' });
      return;
    }
    if (comment.length < 5 || comment.length > 1000) {
      res.status(400).json({ error: 'Please write a review comment (5–1000 characters).' });
      return;
    }

    try {
      const review = createReview({
        slug: req.params.slug,
        authorName,
        rating,
        title,
        comment,
        orderReference,
      });
      res.status(201).json({ review });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Unable to submit review.' });
    }
  });

  app.post('/api/newsletter', requireCsrf, (req, res) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(`newsletter:${ip}`, 10, 15 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return;
    }
    const email =
      typeof (req.body as Record<string, unknown>)?.email === 'string'
        ? ((req.body as Record<string, unknown>).email as string).trim()
        : '';
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    const { alreadySubscribed } = addNewsletterSubscriber(email);
    res.status(alreadySubscribed ? 200 : 201).json({
      ok: true,
      alreadySubscribed,
      message: alreadySubscribed
        ? 'You are already on our updates list.'
        : 'Subscribed! Watch your inbox for seasonal drops & restocks.',
    });
  });

  app.post('/api/orders', requireCsrf, (req, res) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(`order:${ip}`, 20, 10 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many order attempts. Please wait a few minutes.' });
      return;
    }

    try {
      const body = req.body as Record<string, unknown>;
      const customer = (body.customer ?? {}) as Record<string, unknown>;
      const name = typeof customer.name === 'string' ? customer.name.trim() : '';
      const email = typeof customer.email === 'string' ? customer.email.trim() : '';
      const phone = typeof customer.phone === 'string' ? customer.phone.trim() : '';
      const addressLine1 = typeof customer.addressLine1 === 'string' ? customer.addressLine1.trim() : '';
      const addressLine2 = typeof customer.addressLine2 === 'string' ? customer.addressLine2.trim() : '';
      const city = typeof customer.city === 'string' ? customer.city.trim() : '';
      const state = typeof customer.state === 'string' ? customer.state.trim() : '';
      const pincode = typeof customer.pincode === 'string' ? customer.pincode.trim() : '';
      const paymentMethod = body.paymentMethod as PaymentMethod;

      if (name.length < 2 || name.length > 120) {
        res.status(400).json({ error: 'Please provide your full name.' });
        return;
      }
      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'Please provide a valid email address.' });
        return;
      }
      if (phone.length < 8 || phone.length > 24) {
        res.status(400).json({ error: 'Please provide a valid phone number.' });
        return;
      }
      if (addressLine1.length < 4 || city.length < 2 || state.length < 2 || !/^[0-9A-Za-z -]{4,12}$/.test(pincode)) {
        res.status(400).json({ error: 'Please complete the shipping address and pincode.' });
        return;
      }
      if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
        res.status(400).json({ error: 'Please choose a valid payment method.' });
        return;
      }

      const rawItems = Array.isArray(body.items) ? body.items : [];
      const items = rawItems.map((it) => {
        const rec = (it ?? {}) as Record<string, unknown>;
        return {
          slug: typeof rec.slug === 'string' ? rec.slug : '',
          quantity: Number(rec.quantity),
          selectedOptions:
            rec.selectedOptions && typeof rec.selectedOptions === 'object'
              ? (rec.selectedOptions as Record<string, string>)
              : undefined,
        };
      });

      const order = createOrder({
        customer: { name, email, phone, addressLine1, addressLine2, city, state, pincode },
        paymentMethod,
        items,
        couponCode: typeof body.couponCode === 'string' ? body.couponCode : null,
        note: typeof body.note === 'string' ? body.note.slice(0, 300) : undefined,
      });

      res.status(201).json({ order });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to place order.' });
    }
  });

  app.get('/api/orders/:reference', (req, res) => {
    const order = getOrderByReference(req.params.reference);
    if (!order) {
      res.status(404).json({ error: 'Order reference not found.' });
      return;
    }
    const lookup: PublicOrderLookup = {
      reference: order.reference,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      status: order.status,
      paymentMethod: order.paymentMethod,
      maskedEmail: maskEmail(order.customer.email),
      customerFirstName: order.customer.name.split(' ')[0] || 'Guest',
      city: order.customer.city,
      state: order.customer.state,
      items: order.items,
      subtotalInr: order.subtotalInr,
      discountInr: order.discountInr,
      shippingInr: order.shippingInr,
      totalInr: order.totalInr,
      couponCode: order.couponCode,
    };
    res.json({ order: lookup });
  });

  // =========================================================================
  // AUTH ROUTES
  // =========================================================================

  app.get('/api/auth/status', (_req, res) => {
    res.json({
      needsSetup: !hasAnyStaff(),
      mailConfigured: isMailConfigured(),
    });
  });

  app.post('/api/auth/setup', requireCsrf, (req, res) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(`setup:${ip}`, 10, 15 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many setup attempts. Please try again shortly.' });
      return;
    }
    if (hasAnyStaff()) {
      res.status(409).json({ error: 'Admin account is already configured.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'Name must be 2–80 characters.' });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    try {
      const admin = createFirstAdmin({ name, email, password });
      const token = createSession(admin.id);
      setSessionCookie(req, res, token);
      res.status(201).json({ staff: toPublicStaff(admin), token });
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Setup failed.' });
    }
  });

  app.post('/api/auth/login', requireCsrf, (req, res) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(`login:${ip}`, 15, 15 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many sign-in attempts. Please wait 15 minutes.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!isValidEmail(email) || !password) {
      res.status(400).json({ error: 'Enter both email and password.' });
      return;
    }

    const staff = authenticateStaff(email, password);
    if (!staff) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!staff.verified) {
      res.status(403).json({
        error: 'Email verification is required before signing in. Use "Resend verification" below.',
        unverified: true,
      });
      return;
    }

    const token = createSession(staff.id);
    setSessionCookie(req, res, token);
    res.json({ staff: toPublicStaff(staff), token });
  });

  app.post('/api/auth/logout', requireCsrf, (req, res) => {
    const token = extractSessionToken(req);
    if (token) {
      revokeSession(token);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ staff: toPublicStaff(req.staff!) });
  });

  app.post('/api/auth/verify', requireCsrf, (req, res) => {
    const body = req.body as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token || token.length < 16) {
      res.status(400).json({ error: 'Verification token is missing or invalid.' });
      return;
    }
    const verified = consumeVerificationToken(token);
    if (!verified) {
      res.status(400).json({ error: 'This verification link is invalid or has expired.' });
      return;
    }
    res.json({ ok: true, email: verified.email });
  });

  app.post('/api/auth/forgot', requireCsrf, async (req, res) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(`forgot:${ip}`, 8, 15 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many reset requests. Please try again shortly.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    const staff = findStaffByEmail(email);
    if (!staff) {
      res.json({
        ok: true,
        message: 'If that staff email exists, a reset link has been prepared.',
      });
      return;
    }

    const rawToken = createActionToken(staff.id, 'reset', 1000 * 60 * 60);
    const resetLink = `${getAppOrigin(req)}/reset?token=${encodeURIComponent(rawToken)}`;
    const mail = await sendMail({
      to: staff.email,
      subject: 'Reset your Thelakkad Store staff password',
      text: `Hello ${staff.name},\n\nReset your password using this one-hour link:\n${resetLink}\n`,
      html: `<p>Hello ${staff.name},</p><p><a href="${resetLink}">Reset your Thelakkad Store password</a> (valid for 1 hour).</p>`,
    });

    res.json({
      ok: true,
      mailSent: mail.sent,
      message: mail.sent
        ? 'Reset link sent to your email.'
        : 'Email provider not configured — copy the one-hour reset link below.',
      previewLink: mail.sent ? undefined : resetLink,
    });
  });

  app.post('/api/auth/reset', requireCsrf, (req, res) => {
    const body = req.body as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!token || token.length < 16) {
      res.status(400).json({ error: 'Reset token is invalid.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }

    const updated = consumeResetToken(token, password);
    if (!updated) {
      res.status(400).json({ error: 'This reset link is invalid or has expired.' });
      return;
    }
    res.json({ ok: true, email: updated.email });
  });

  app.post('/api/auth/resend', requireCsrf, async (req, res) => {
    const ip = getClientIp(req);
    if (!checkRateLimit(`resend:${ip}`, 8, 15 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many verification requests. Please wait a bit.' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    const staff = findStaffByEmail(email);
    if (!staff || staff.verified) {
      res.json({ ok: true, message: 'If an unverified account exists, a link has been prepared.' });
      return;
    }

    const rawToken = createActionToken(staff.id, 'verify');
    const verifyLink = `${getAppOrigin(req)}/verify?token=${encodeURIComponent(rawToken)}`;
    const mail = await sendMail({
      to: staff.email,
      subject: 'Verify your Thelakkad Store staff email',
      text: `Hello ${staff.name},\n\nVerify your email using this link:\n${verifyLink}\n`,
      html: `<p>Hello ${staff.name},</p><p><a href="${verifyLink}">Verify your Thelakkad Store staff email</a>.</p>`,
    });

    res.json({
      ok: true,
      mailSent: mail.sent,
      message: mail.sent
        ? 'Verification email sent.'
        : 'Email provider not configured — copy the verification link below.',
      previewLink: mail.sent ? undefined : verifyLink,
    });
  });

  // =========================================================================
  // ADMIN ROUTES (AUTHENTICATED STAFF)
  // =========================================================================

  app.get('/api/admin/orders', requireAuth, (_req, res) => {
    res.json({ orders: getOrders() });
  });

  app.patch('/api/admin/orders/:reference', requireCsrf, requireAuth, (req, res) => {
    const status = (req.body as Record<string, unknown>).status as OrderStatus;
    if (!ALLOWED_ORDER_STATUSES.has(status)) {
      res.status(400).json({ error: 'Invalid order status.' });
      return;
    }
    try {
      const order = updateOrderStatus(req.params.reference, status);
      res.json({ order });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Order not found.' });
    }
  });

  // --- Categories ---

  app.get('/api/admin/categories', requireAuth, (_req, res) => {
    res.json({ categories: getCategories() });
  });

  app.post('/api/admin/categories', requireCsrf, requireAuth, (req, res) => {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';

    if (name.length < 2 || name.length > 60) {
      res.status(400).json({ error: 'Category name must be 2–60 characters.' });
      return;
    }

    try {
      const category = createCategory({ name, slug, description: description.slice(0, 220) });
      res.status(201).json({ category });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create category.' });
    }
  });

  app.put('/api/admin/categories/:slug', requireCsrf, requireAuth, (req, res) => {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (name.length < 2 || name.length > 60) {
      res.status(400).json({ error: 'Category name must be 2–60 characters.' });
      return;
    }
    try {
      const category = updateCategory(req.params.slug, { name, description: description.slice(0, 220) });
      res.json({ category });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Category not found.' });
    }
  });

  app.delete('/api/admin/categories/:slug', requireCsrf, requireAuth, requireAdmin, (req, res) => {
    try {
      deleteCategory(req.params.slug);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to delete category.' });
    }
  });

  // --- Product Media Upload & Cleanup ---

  app.post('/api/admin/products/media-uploads', requireCsrf, requireAuth, (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const mimeType = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase().trim() : '';
      const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : '';
      const alt = typeof body.alt === 'string' ? body.alt.trim().slice(0, 160) : '';

      const spec = ALLOWED_MEDIA_MIME[mimeType];
      if (!spec) {
        res.status(400).json({
          error: 'Unsupported file type. Upload JPEG, PNG, WebP images or MP4, WebM videos.',
        });
        return;
      }

      const rawBase64 = dataBase64.includes(',') ? dataBase64.split(',').pop() || '' : dataBase64;
      const buffer = Buffer.from(rawBase64, 'base64');

      if (!buffer.length || buffer.length > spec.maxBytes) {
        const limitMb = Math.round(spec.maxBytes / (1024 * 1024));
        res.status(400).json({ error: `File exceeds the ${limitMb} MB size limit.` });
        return;
      }

      if (!matchesMagicBytes(buffer, mimeType)) {
        res.status(400).json({ error: 'File contents do not match its declared media type.' });
        return;
      }

      const filename = `${crypto.randomUUID()}${spec.ext}`;
      const destination = path.resolve(UPLOADS_DIR, filename);
      if (!destination.startsWith(UPLOADS_DIR + path.sep)) {
        res.status(400).json({ error: 'Invalid upload path.' });
        return;
      }

      fs.writeFileSync(destination, buffer);
      const media: ProductMedia = {
        id: `m_${crypto.randomUUID().slice(0, 8)}`,
        kind: spec.kind,
        url: `/uploads/${filename}`,
        alt: alt || 'Uploaded studio media',
      };
      res.status(201).json({ media });
    } catch {
      res.status(400).json({ error: 'Failed to process uploaded media file.' });
    }
  });

  app.post('/api/admin/products/media-cleanup', requireCsrf, requireAuth, (req, res) => {
    const body = req.body as Record<string, unknown>;
    const urls = Array.isArray(body.urls) ? body.urls : [];
    for (const u of urls.slice(0, 20)) {
      if (typeof u === 'string') {
        safeDeleteUploadUrl(u);
      }
    }
    res.json({ ok: true });
  });

  // --- Products CRUD ---

  app.post('/api/admin/products', requireCsrf, requireAuth, (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const subtitle = typeof body.subtitle === 'string' ? body.subtitle.trim() : '';
      const category = typeof body.category === 'string' ? body.category.trim() : '';
      const priceInr = Math.round(Number(body.priceInr));
      const stock = Math.round(Number(body.stock));

      if (title.length < 2 || title.length > 120) {
        res.status(400).json({ error: 'Product title must be 2–120 characters.' });
        return;
      }
      if (!getCategories().some((c) => c.slug === category)) {
        res.status(400).json({ error: 'Select a valid category.' });
        return;
      }
      if (!Number.isFinite(priceInr) || priceInr < 100 || priceInr > 500000) {
        res.status(400).json({ error: 'Price must be between ₹100 and ₹5,00,000.' });
        return;
      }
      if (!Number.isFinite(stock) || stock < 0 || stock > 5000) {
        res.status(400).json({ error: 'Stock must be between 0 and 5,000.' });
        return;
      }

      const media = validateMediaList(body.media);
      const options = validateOptions(body.options);
      const slug = slugify(typeof body.slug === 'string' && body.slug.trim() ? body.slug : title);
      const sku =
        typeof body.sku === 'string' && body.sku.trim()
          ? body.sku.trim().toUpperCase().slice(0, 24)
          : `THL-${slug.slice(0, 4).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`;

      const product: Product = {
        slug,
        sku,
        title,
        subtitle: subtitle.slice(0, 160),
        category,
        priceInr,
        stock,
        editionNote:
          typeof body.editionNote === 'string' && body.editionNote.trim()
            ? body.editionNote.trim().slice(0, 80)
            : 'Studio Small Run',
        description:
          typeof body.description === 'string' ? body.description.trim().slice(0, 1400) : '',
        materials: typeof body.materials === 'string' ? body.materials.trim().slice(0, 240) : '',
        dimensions: typeof body.dimensions === 'string' ? body.dimensions.trim().slice(0, 240) : '',
        care: typeof body.care === 'string' ? body.care.trim().slice(0, 240) : '',
        options,
        media,
        featured: Boolean(body.featured),
      };

      const created = createProduct(product);
      res.status(201).json({ product: created });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to create product.' });
    }
  });

  app.put('/api/admin/products/:slug', requireCsrf, requireAuth, (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const category = typeof body.category === 'string' ? body.category.trim() : '';
      const priceInr = Math.round(Number(body.priceInr));
      const stock = Math.round(Number(body.stock));

      if (title.length < 2 || title.length > 120) {
        res.status(400).json({ error: 'Product title must be 2–120 characters.' });
        return;
      }
      if (!getCategories().some((c) => c.slug === category)) {
        res.status(400).json({ error: 'Select a valid category.' });
        return;
      }
      if (!Number.isFinite(priceInr) || priceInr < 100 || priceInr > 500000) {
        res.status(400).json({ error: 'Price must be between ₹100 and ₹5,00,000.' });
        return;
      }
      if (!Number.isFinite(stock) || stock < 0 || stock > 5000) {
        res.status(400).json({ error: 'Stock must be between 0 and 5,000.' });
        return;
      }

      const media = validateMediaList(body.media);
      const options = validateOptions(body.options);

      const updated = updateProduct(req.params.slug, {
        title,
        subtitle: typeof body.subtitle === 'string' ? body.subtitle.trim().slice(0, 160) : '',
        category,
        priceInr,
        stock,
        editionNote:
          typeof body.editionNote === 'string' ? body.editionNote.trim().slice(0, 80) : '',
        description:
          typeof body.description === 'string' ? body.description.trim().slice(0, 1400) : '',
        materials: typeof body.materials === 'string' ? body.materials.trim().slice(0, 240) : '',
        dimensions: typeof body.dimensions === 'string' ? body.dimensions.trim().slice(0, 240) : '',
        care: typeof body.care === 'string' ? body.care.trim().slice(0, 240) : '',
        options,
        media,
        featured: Boolean(body.featured),
      });
      res.json({ product: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update product.' });
    }
  });

  app.patch('/api/admin/products/:slug', requireCsrf, requireAuth, (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const patch: { priceInr?: number; stock?: number } = {};
      if (body.priceInr !== undefined) {
        const priceInr = Math.round(Number(body.priceInr));
        if (!Number.isFinite(priceInr) || priceInr < 100 || priceInr > 500000) {
          res.status(400).json({ error: 'Price must be between ₹100 and ₹5,00,000.' });
          return;
        }
        patch.priceInr = priceInr;
      }
      if (body.stock !== undefined) {
        const stock = Math.round(Number(body.stock));
        if (!Number.isFinite(stock) || stock < 0 || stock > 5000) {
          res.status(400).json({ error: 'Stock must be between 0 and 5,000.' });
          return;
        }
        patch.stock = stock;
      }
      const updated = updateProduct(req.params.slug, patch);
      res.json({ product: updated });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Product not found.' });
    }
  });

  app.patch('/api/admin/products/:slug/archive', requireCsrf, requireAuth, (req, res) => {
    try {
      const archived = Boolean((req.body as Record<string, unknown>).archived);
      const updated = setProductArchived(req.params.slug, archived);
      res.json({ product: updated });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Product not found.' });
    }
  });

  app.delete('/api/admin/products/:slug', requireCsrf, requireAuth, (req, res) => {
    try {
      const result = resetOrDeleteProduct(req.params.slug);
      for (const u of result.removedMediaUrls) {
        safeDeleteUploadUrl(u);
      }
      res.json({ ok: true, action: result.action });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Product not found.' });
    }
  });

  // --- Coupons ---

  app.get('/api/admin/coupons', requireAuth, (_req, res) => {
    res.json({ coupons: getCoupons() });
  });

  app.post('/api/admin/coupons', requireCsrf, requireAuth, requireAdmin, (req, res) => {
    const body = req.body as Record<string, unknown>;
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    const kind = body.kind as CouponKind;
    const value = Math.round(Number(body.value ?? 0));
    const minSubtotalInr = Math.max(0, Math.round(Number(body.minSubtotalInr ?? 0)));
    const description = typeof body.description === 'string' ? body.description.trim() : '';

    if (!ALLOWED_COUPON_KINDS.has(kind)) {
      res.status(400).json({ error: 'Invalid coupon type.' });
      return;
    }
    if (kind === 'percent' && (value < 1 || value > 80)) {
      res.status(400).json({ error: 'Percent discount must be between 1% and 80%.' });
      return;
    }
    if (kind === 'flat' && (value < 50 || value > 50000)) {
      res.status(400).json({ error: 'Flat discount must be between ₹50 and ₹50,000.' });
      return;
    }

    try {
      const coupon = createCoupon({
        code,
        kind,
        value: kind === 'shipping' ? 0 : value,
        minSubtotalInr,
        description: description.slice(0, 140) || `${code} studio promotion`,
        active: true,
      });
      res.status(201).json({ coupon });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create coupon.' });
    }
  });

  app.delete('/api/admin/coupons/:code', requireCsrf, requireAuth, requireAdmin, (req, res) => {
    try {
      deleteCoupon(req.params.code);
      res.json({ ok: true });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Coupon not found.' });
    }
  });

  // --- Staff Management ---

  app.get('/api/admin/staff', requireAuth, requireAdmin, (_req, res) => {
    res.json({ staff: getAllStaff() });
  });

  app.post('/api/admin/staff', requireCsrf, requireAuth, requireAdmin, async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const role: StaffRole = body.role === 'admin' ? 'admin' : 'staff';
    const password = typeof body.password === 'string' ? body.password : '';

    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'Name must be 2–80 characters.' });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Temporary password must be at least 8 characters.' });
      return;
    }

    try {
      const staff = createStaffAccount({ name, email, role, password });
      const rawToken = createActionToken(staff.id, 'verify');
      const verifyLink = `${getAppOrigin(req)}/verify?token=${encodeURIComponent(rawToken)}`;
      const mail = await sendMail({
        to: staff.email,
        subject: 'You have been invited to Thelakkad Store Admin',
        text: `Hello ${staff.name},\n\nVerify your staff email to activate access:\n${verifyLink}\n`,
        html: `<p>Hello ${staff.name},</p><p><a href="${verifyLink}">Verify your staff email</a> to activate your Thelakkad Store admin account.</p>`,
      });

      res.status(201).json({
        staff: toPublicStaff(staff),
        mailSent: mail.sent,
        verifyLink: mail.sent ? undefined : verifyLink,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to add staff.' });
    }
  });

  app.post(
    '/api/admin/staff/:id/verification',
    requireCsrf,
    requireAuth,
    requireAdmin,
    async (req, res) => {
      const target = findStaffById(req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Staff account not found.' });
        return;
      }
      const rawToken = createActionToken(target.id, 'verify');
      const verifyLink = `${getAppOrigin(req)}/verify?token=${encodeURIComponent(rawToken)}`;
      const mail = await sendMail({
        to: target.email,
        subject: 'Verify your Thelakkad Store staff email',
        text: `Hello ${target.name},\n\nVerify your email:\n${verifyLink}\n`,
        html: `<p>Hello ${target.name},</p><p><a href="${verifyLink}">Verify your email</a>.</p>`,
      });
      res.json({
        ok: true,
        mailSent: mail.sent,
        verifyLink: mail.sent ? undefined : verifyLink,
      });
    }
  );

  app.delete('/api/admin/staff/:id', requireCsrf, requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    try {
      deleteStaffAccount(req.params.id, req.staff!.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to delete staff.' });
    }
  });

  app.post('/api/admin/password', requireCsrf, requireAuth, (req: AuthedRequest, res) => {
    const body = req.body as Record<string, unknown>;
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    try {
      updateStaffPassword(req.staff!.id, currentPassword, newPassword);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not change password.' });
    }
  });

  // --- Settings & Mail Diagnostic ---

  app.get('/api/admin/settings', requireAuth, (_req, res) => {
    res.json({ settings: getSettings(), mailConfigured: isMailConfigured() });
  });

  app.put('/api/admin/settings', requireCsrf, requireAuth, requireAdmin, (req, res) => {
    const body = req.body as Record<string, unknown>;
    const freeShippingThresholdInr = Math.max(
      0,
      Math.round(Number(body.freeShippingThresholdInr ?? 6000))
    );
    const flatShippingInr = Math.max(0, Math.round(Number(body.flatShippingInr ?? 250)));

    const updated = updateSettings({
      storeName:
        typeof body.storeName === 'string' && body.storeName.trim()
          ? body.storeName.trim().slice(0, 80)
          : undefined,
      tagline:
        typeof body.tagline === 'string' ? body.tagline.trim().slice(0, 220) : undefined,
      studioAddress:
        typeof body.studioAddress === 'string' ? body.studioAddress.trim().slice(0, 220) : undefined,
      supportEmail:
        typeof body.supportEmail === 'string' && isValidEmail(body.supportEmail.trim())
          ? body.supportEmail.trim()
          : undefined,
      supportPhone:
        typeof body.supportPhone === 'string' ? body.supportPhone.trim().slice(0, 40) : undefined,
      freeShippingThresholdInr,
      flatShippingInr,
      dispatchWindow:
        typeof body.dispatchWindow === 'string'
          ? body.dispatchWindow.trim().slice(0, 220)
          : undefined,
      announcement:
        typeof body.announcement === 'string' ? body.announcement.trim().slice(0, 220) : undefined,
    });
    res.json({ settings: updated });
  });

  // --- Full Website Editor ---

  app.get('/api/admin/website', requireAuth, (_req, res) => {
    res.json({ website: getWebsiteContent() });
  });

  app.put('/api/admin/website', requireCsrf, requireAuth, requireAdmin, (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const current = getWebsiteContent();
    const isHex = (v: unknown): v is string =>
      typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());
    const cleanText = (v: unknown, fallback: string, maxLen: number): string =>
      typeof v === 'string' ? v.trim().slice(0, maxLen) : fallback;

    const rawTheme = (body.theme ?? {}) as Record<string, unknown>;
    const rawHeader = (body.header ?? {}) as Record<string, unknown>;
    const rawHero = (body.hero ?? {}) as Record<string, unknown>;
    const rawCollection = (body.collection ?? {}) as Record<string, unknown>;
    const rawAbout = (body.about ?? {}) as Record<string, unknown>;
    const rawFooter = (body.footer ?? {}) as Record<string, unknown>;

    const heroImageUrl =
      typeof rawHero.imageUrl === 'string' && isSafeMediaUrl(rawHero.imageUrl)
        ? rawHero.imageUrl.trim()
        : current.hero.imageUrl;
    const aboutImageUrl =
      typeof rawAbout.imageUrl === 'string' && isSafeMediaUrl(rawAbout.imageUrl)
        ? rawAbout.imageUrl.trim()
        : current.about.imageUrl;

    const highlights: WebsiteHighlight[] = Array.isArray(rawAbout.highlights)
      ? rawAbout.highlights
          .slice(0, 4)
          .map((item) => {
            const rec = (item ?? {}) as Record<string, unknown>;
            return {
              title: typeof rec.title === 'string' ? rec.title.trim().slice(0, 40) : '',
              description:
                typeof rec.description === 'string' ? rec.description.trim().slice(0, 140) : '',
            };
          })
          .filter((h) => h.title.length > 0 || h.description.length > 0)
      : current.about.highlights;

    const nextWebsite: WebsiteContent = {
      theme: {
        bgColor: isHex(rawTheme.bgColor) ? rawTheme.bgColor.trim() : current.theme.bgColor,
        surfaceColor: isHex(rawTheme.surfaceColor)
          ? rawTheme.surfaceColor.trim()
          : current.theme.surfaceColor,
        inkColor: isHex(rawTheme.inkColor) ? rawTheme.inkColor.trim() : current.theme.inkColor,
        accentColor: isHex(rawTheme.accentColor)
          ? rawTheme.accentColor.trim()
          : current.theme.accentColor,
      },
      showAnnouncement:
        typeof body.showAnnouncement === 'boolean'
          ? body.showAnnouncement
          : current.showAnnouncement,
      header: {
        shopLabel: cleanText(rawHeader.shopLabel, current.header.shopLabel, 24) || 'Shop',
        aboutLabel: cleanText(rawHeader.aboutLabel, current.header.aboutLabel, 24) || 'About',
        trackLabel: cleanText(rawHeader.trackLabel, current.header.trackLabel, 24) || 'Track Order',
        bagLabel: cleanText(rawHeader.bagLabel, current.header.bagLabel, 20) || 'Bag',
      },
      hero: {
        visible: typeof rawHero.visible === 'boolean' ? rawHero.visible : current.hero.visible,
        eyebrow: cleanText(rawHero.eyebrow, current.hero.eyebrow, 80),
        headline: cleanText(rawHero.headline, current.hero.headline, 120) || current.hero.headline,
        subheadline: cleanText(rawHero.subheadline, current.hero.subheadline, 320),
        primaryCtaLabel:
          cleanText(rawHero.primaryCtaLabel, current.hero.primaryCtaLabel, 40) || 'Shop Now',
        secondaryCtaLabel: cleanText(
          rawHero.secondaryCtaLabel,
          current.hero.secondaryCtaLabel,
          40
        ),
        imageUrl: heroImageUrl,
        imageAlt: cleanText(rawHero.imageAlt, current.hero.imageAlt, 180),
      },
      collection: {
        eyebrow: cleanText(rawCollection.eyebrow, current.collection.eyebrow, 80),
        heading:
          cleanText(rawCollection.heading, current.collection.heading, 80) ||
          current.collection.heading,
        searchPlaceholder: cleanText(
          rawCollection.searchPlaceholder,
          current.collection.searchPlaceholder,
          80
        ),
        showSearch:
          typeof rawCollection.showSearch === 'boolean'
            ? rawCollection.showSearch
            : current.collection.showSearch,
        showCategoryTabs:
          typeof rawCollection.showCategoryTabs === 'boolean'
            ? rawCollection.showCategoryTabs
            : current.collection.showCategoryTabs,
      },
      about: {
        visible: typeof rawAbout.visible === 'boolean' ? rawAbout.visible : current.about.visible,
        eyebrow: cleanText(rawAbout.eyebrow, current.about.eyebrow, 80),
        heading: cleanText(rawAbout.heading, current.about.heading, 120) || current.about.heading,
        body: cleanText(rawAbout.body, current.about.body, 800),
        imageUrl: aboutImageUrl,
        imageAlt: cleanText(rawAbout.imageAlt, current.about.imageAlt, 180),
        highlights: highlights.length > 0 ? highlights : current.about.highlights,
      },
      footer: {
        linksHeading: cleanText(rawFooter.linksHeading, current.footer.linksHeading, 40) || 'Store',
        shippingHeading:
          cleanText(rawFooter.shippingHeading, current.footer.shippingHeading, 40) ||
          'Shipping & Exchanges',
        copyrightNote: cleanText(rawFooter.copyrightNote, current.footer.copyrightNote, 140),
        showFreeShippingNote:
          typeof rawFooter.showFreeShippingNote === 'boolean'
            ? rawFooter.showFreeShippingNote
            : current.footer.showFreeShippingNote,
      },
    };

    const updated = updateWebsiteContent(nextWebsite);
    res.json({ website: updated });
  });

  app.post('/api/admin/website/reset', requireCsrf, requireAuth, requireAdmin, (_req, res) => {
    const website = resetWebsiteContent();
    res.json({ website });
  });

  // --- Admin Review Moderation ---

  app.get('/api/admin/reviews', requireAuth, (_req, res) => {
    res.json({ reviews: getAllReviews() });
  });

  app.delete('/api/admin/reviews/:id', requireCsrf, requireAuth, requireAdmin, (req, res) => {
    try {
      deleteReview(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Review not found.' });
    }
  });

  app.post('/api/admin/mail-test', requireCsrf, requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const targetEmail =
      typeof (req.body as Record<string, unknown>).to === 'string' &&
      isValidEmail(((req.body as Record<string, unknown>).to as string).trim())
        ? ((req.body as Record<string, unknown>).to as string).trim()
        : req.staff!.email;

    const mail = await sendMail({
      to: targetEmail,
      subject: 'Thelakkad Store — Email delivery check',
      text: `This is a test message from Thelakkad Store Admin sent to ${targetEmail}.`,
      html: `<p>This is a test message from <strong>Thelakkad Store Admin</strong> sent to ${targetEmail}.</p>`,
    });

    res.json({
      ok: mail.sent,
      provider: mail.provider,
      to: targetEmail,
      message: mail.sent
        ? `Test email delivered via Resend to ${targetEmail}.`
        : mail.error
          ? `Resend delivery failed: ${mail.error}`
          : 'RESEND_API_KEY is not configured. Verification and reset links will display in the admin UI instead.',
    });
  });

  // Catch-all for unknown API routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // =========================================================================
  // VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVING
  // =========================================================================

  function mountStaticFrontend(): void {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(path.join(distDir, 'index.html'))) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  async function startServer(): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      mountStaticFrontend();
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.info(`Thelakkad Store server listening on http://localhost:${PORT}`);
    });
  }

  if (process.env.VERCEL) {
    mountStaticFrontend();
  } else {
    startServer().catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
  }

  export default app;
