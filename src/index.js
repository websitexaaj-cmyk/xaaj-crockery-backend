// ============================================================
// XAAJ Backend - Main Server File
// ============================================================

// -------------------------
// 1. External Packages
// -------------------------
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import morgan from 'morgan'

// -------------------------
// 2. Configuration
// -------------------------
import {
  env,
  assertProductionConfig
} from './config/env.js'

// -------------------------
// 3. Database
// -------------------------
import {
  connectDatabase,
  disconnectDatabase
} from './config/db.js'

// -------------------------
// 4. Routes
// -------------------------
import authRoutes from './routes/auth.js'
import productRoutes from './routes/products.js'
import commerceRoutes from './routes/commerce.js'
import orderRoutes from './routes/orders.js'
import velocityTestRoutes from './routes/velocityTest.js'
import cmsRoutes from './routes/cms.js'
import blogRoutes from './routes/blogs.js'
import newsletterRoutes from './routes/newsletter.js'
import contactRoutes from './routes/contact.js'
import adminRoutes from './routes/admin.js'
import paymentRoutes from './routes/payments.js'
import uploadRoutes from './routes/uploads.js'
import reviewRoutes from './routes/reviews.js'

// -------------------------
// 5. Middleware
// -------------------------
import {
  notFound,
  errorHandler
} from './middleware/index.js'


// ============================================================
// 6. Validate Environment Configuration
// ============================================================

assertProductionConfig()


// ============================================================
// 7. Create Express Application
// ============================================================

const app = express()


// ============================================================
// 8. Basic Security
// ============================================================

app.disable('x-powered-by')

app.use(helmet())


// ============================================================
// 9. CORS Configuration
// ============================================================

app.use(
  cors({
    origin: env.clientUrl,
    credentials: true
  })
)


// ============================================================
// 10. Reverse Proxy / Real Client IP
// ============================================================
//
// Production mein backend aksar reverse proxy ke peeche hota hai.
// Rate limiter ko actual client IP pata hona chahiye.
//
// Agar production proxy use ho raha hai to 1 proxy hop trust karte hain.

if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1)
}


// ============================================================
// 11. RATE LIMITING
// ============================================================
//
// IMPORTANT:
// Global low rate-limit nahi lagaya gaya hai.
//
// Homepage ek saath multiple GET requests karta hai:
// products
// blogs
// announcement
// category hero
// brand story
// horeca
// hero CMS
//
// Isliye public read APIs ka separate generous limit hai.
//
// Auth / Order / Payment jaise sensitive endpoints par tighter
// limits hain.
//

const rateLimitOptions = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,

  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.'
    })
  }
}


// ============================================================
// 11.1 Public Read Limiter
// ============================================================
//
// Products / CMS / Blogs jaise GET requests ke liye.
// Sirf GET count hoga.
//
// 1000 requests / 15 minutes / IP

const publicReadLimiter = rateLimit({
  ...rateLimitOptions,

  windowMs: 15 * 60 * 1000,

  limit: 1000,

  skip: req => {
    return req.method !== 'GET'
  }
})


// ============================================================
// 11.2 Authentication Limiter
// ============================================================
//
// Login/register/verification etc.
// Auth routes ke andar API endpoints ke hisaab se apply hoga.
//
// 20 requests / 15 minutes / IP

const authLimiter = rateLimit({
  ...rateLimitOptions,

  windowMs: 15 * 60 * 1000,

  limit: 20,

  skip: req => {
    return req.method === 'OPTIONS'
  }
})


// ============================================================
// 11.3 Normal Write Limiter
// ============================================================
//
// Contact
// Newsletter
// Reviews
// Commerce
// Admin
// Uploads
//
// 120 requests / 15 minutes / IP

const writeLimiter = rateLimit({
  ...rateLimitOptions,

  windowMs: 15 * 60 * 1000,

  limit: 120,

  skip: req => {
    return req.method === 'OPTIONS'
  }
})


// ============================================================
// 11.4 Sensitive Limiter
// ============================================================
//
// Orders + Payment.
//
// 40 requests / 15 minutes / IP

const sensitiveLimiter = rateLimit({
  ...rateLimitOptions,

  windowMs: 15 * 60 * 1000,

  limit: 40,

  skip: req => {
    return req.method === 'OPTIONS'
  }
})


// ============================================================
// 12. Body Parsers
// ============================================================

app.use(
  express.json({
    limit: '1mb'
  })
)

app.use(
  express.urlencoded({
    extended: true,
    limit: '1mb'
  })
)


// ============================================================
// 13. Cookie Parser
// ============================================================

app.use(
  cookieParser(env.cookieSecret)
)


// ============================================================
// 14. Request Data Sanitization
// ============================================================

app.use((req, _res, next) => {

  for (const source of [
    req.body,
    req.params,
    req.query
  ]) {

    if (
      source &&
      typeof source === 'object'
    ) {

      for (
        const key of Object.keys(source)
      ) {

        if (
          key.startsWith('$') ||
          key.includes('.')
        ) {
          delete source[key]
        }

      }
    }
  }

  next()
})


// ============================================================
// 15. HTTP Request Logger
// ============================================================

app.use(
  morgan(
    env.nodeEnv === 'production'
      ? 'combined'
      : 'dev'
  )
)


// ============================================================
// 16. Health Check
// ============================================================

app.get(
  '/api/health',
  (_req, res) => {

    res.json({
      success: true,
      service: 'xaaj-api',
      timestamp: new Date().toISOString()
    })

  }
)


// ============================================================
// 17. API Routes
// ============================================================


// ============================================================
// Authentication
// ============================================================

app.use(
  '/api/auth',
  authLimiter,
  authRoutes
)


// ============================================================
// Products
// ============================================================

app.use(
  '/api/products',
  publicReadLimiter,
  productRoutes
)


// ============================================================
// Commerce
// ============================================================

app.use(
  '/api/commerce',
  writeLimiter,
  commerceRoutes
)


// ============================================================
// Orders
// ============================================================

app.use(
  '/api/orders',
  sensitiveLimiter,
  orderRoutes
)


// ============================================================
// Velocity Test
// ============================================================

app.use(
  '/api/velocity',
  writeLimiter,
  velocityTestRoutes
)


// ============================================================
// Reviews
// ============================================================

app.use(
  '/api/reviews',
  writeLimiter,
  reviewRoutes
)


// ============================================================
// CMS
// ============================================================
//
// Homepage ke CMS GET requests publicReadLimiter use karenge.
//
// Example:
// GET /api/cms/announcement
// GET /api/cms/category-hero
// GET /api/cms/brand-story
// GET /api/cms/horeca-collection
// GET /api/cms/hero
//
// Sirf GET requests count hongi.

app.use(
  '/api/cms',
  publicReadLimiter,
  cmsRoutes
)


// ============================================================
// Blogs
// ============================================================

app.use(
  '/api/blogs',
  publicReadLimiter,
  blogRoutes
)


// ============================================================
// Newsletter
// ============================================================

app.use(
  '/api/newsletter',
  writeLimiter,
  newsletterRoutes
)


// ============================================================
// Contact / B2B Enquiry
// ============================================================

app.use(
  '/api/contact',
  writeLimiter,
  contactRoutes
)


// ============================================================
// Admin
// ============================================================

app.use(
  '/api/admin',
  writeLimiter,
  adminRoutes
)


// ============================================================
// Payments
// ============================================================

app.use(
  '/api/payment',
  sensitiveLimiter,
  paymentRoutes
)


// ============================================================
// Uploads
// ============================================================

app.use(
  '/api/uploads',
  writeLimiter,
  uploadRoutes
)


// ============================================================
// 18. 404 Handler
// ============================================================

app.use(notFound)


// ============================================================
// 19. Global Error Handler
// ============================================================

app.use(errorHandler)


// ============================================================
// 20. Connect Database & Start Server
// ============================================================

await connectDatabase()

const server = app.listen(
  env.port,
  () => {
    console.log(
      '[XAAJ] API listening on port',
      env.port
    )
  }
)


// ============================================================
// 21. Graceful Shutdown
// ============================================================

async function shutdown(signal) {

  console.log(
    `[XAAJ] ${signal} received`
  )

  if (server) {

    server.close(
      async () => {

        await disconnectDatabase()

        process.exit(0)

      }
    )

  } else {

    await disconnectDatabase()

    process.exit(0)

  }

}


// ============================================================
// 22. Process Signals
// ============================================================

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
)

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
)


// ============================================================
// 23. Export App
// ============================================================

export default app