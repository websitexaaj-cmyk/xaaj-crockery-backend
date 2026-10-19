import jwt from 'jsonwebtoken'

import { z } from 'zod'

import { env } from '../config/env.js'

// ============================================================

// ASYNC HANDLER

// ============================================================

export function asyncHandler(fn) {

  return (req, res, next) =>

    Promise.resolve(fn(req, res, next)).catch(next)

}

// ============================================================

// AUTH PROTECTION

// ============================================================

export function protect(req, res, next) {

  const token =

    req.cookies?.token ||

    req.headers.authorization?.replace(/^Bearer\s+/i, '')

  if (!token) {

    return res.status(401).json({

      success: false,

      message: 'Authentication required'

    })

  }

  try {

    req.user = jwt.verify(token, env.jwtSecret)

    next()

  } catch {

    return res.status(401).json({

      success: false,

      message: 'Invalid or expired token'

    })

  }

}

// ============================================================

// ADMIN PROTECTION

// ============================================================

export function adminOnly(req, res, next) {

  if (req.user?.role !== 'admin') {

    return res.status(403).json({

      success: false,

      message: 'Admin access required'

    })

  }

  next()

}

// ============================================================

// VALIDATION MIDDLEWARE

// ============================================================

export function validate(schema) {

  return (req, res, next) => {

    const result = schema.safeParse({

      body: req.body,

      params: req.params,

      query: req.query

    })

    if (!result.success) {

      return res.status(422).json({

        success: false,

        message: 'Validation failed',

        errors: result.error.flatten()

      })

    }

    req.validated = result.data

    next()

  }

}

// ============================================================

// REGISTER VALIDATION

// ============================================================

export const registerSchema = z.object({

  body: z.object({

    name: z

      .string()

      .trim()

      .min(2, 'Name must be at least 2 characters')

      .max(80, 'Name cannot exceed 80 characters'),

    email: z

      .string()

      .trim()

      .email('Please enter a valid email address'),

    password: z

      .string()

      .min(8, 'Password must be at least 8 characters'),

    phone: z

      .string()

      .trim()

      .min(10, 'Please enter a valid phone number')

      .max(15, 'Please enter a valid phone number'),

    address: z

      .string()

      .trim()

      .min(5, 'Please enter your full address')

      .max(250, 'Address is too long'),

    city: z

      .string()

      .trim()

      .min(2, 'Please enter your city')

      .max(80, 'City name is too long'),

    state: z

      .string()

      .trim()

      .min(2, 'Please enter your state')

      .max(80, 'State name is too long'),

    pin: z

      .string()

      .trim()

      .regex(/^\d{6}$/, 'PIN code must be 6 digits')

  }),

  params: z.object({}),

  query: z.object({})

})

// ============================================================

// LOGIN VALIDATION

// ============================================================

export const loginSchema = z.object({

  body: z.object({

    email: z

      .string()

      .trim()

      .email('Please enter a valid email address'),

    password: z

      .string()

      .min(1, 'Password is required')

  }),

  params: z.object({}),

  query: z.object({})

})

// ============================================================

// PRODUCT VALIDATION

// ============================================================

export const productSchema = z.object({

  body: z

    .object({

      // ------------------------------------------------------

      // Basic product information

      // ------------------------------------------------------

      name: z

        .string()

        .trim()

        .min(

          2,

          'Product name must be at least 2 characters'

        )

        .max(

          150,

          'Product name cannot exceed 150 characters'

        ),

      slug: z

        .string()

        .trim()

        .min(2, 'Product slug is required')

        .max(

          180,

          'Product slug cannot exceed 180 characters'

        )

        .regex(

          /^[a-z0-9]+(?:-[a-z0-9]+)*$/,

          'Product slug can contain only lowercase letters, numbers and hyphens'

        ),

      description: z

        .string()

        .trim()

        .min(

          10,

          'Product description must be at least 10 characters'

        ),

      // ------------------------------------------------------

      // Product category

      // ------------------------------------------------------

      category: z.enum([

      'Dinnerware',

      'Drinkware',

      'Serveware',

      'Gifting'

    ]),

    // ------------------------------------------------------

    // Product subcategory

    // ------------------------------------------------------

    subcategory: z

      .enum([

        '',

        'Cups',

        'Mugs',

        'Pasta Plate',

        'Serving Bowl',

        'Serving Platter',

        'Tea Set',

        'Tea Cup Set',
            'Serving Set'


      ])

      .optional()

      .default(''),

    // ------------------------------------------------------

    // HSN CODE

    // ------------------------------------------------------

    hsnCode: z

        .string()

        .trim()

        .regex(

          /^\d{4}(?:\d{2})?(?:\d{2})?$/,

          'HSN code must contain 4, 6, or 8 digits'

        ),

      // ------------------------------------------------------

      // PRICING

      // ------------------------------------------------------

      // Maximum Retail Price

      mrp: z

        .coerce

        .number()

        .finite('MRP must be a valid number')

        .positive('MRP must be greater than 0'),

      // Discount percentage

      discountPercent: z

        .coerce

        .number()

        .finite(

          'Discount percentage must be a valid number'

        )

        .min(

          0,

          'Discount cannot be negative'

        )

        .max(

          100,

          'Discount cannot exceed 100%'

        )

        .optional()

        .default(0),

      // Quantity-based discount
      quantityDiscount: z
        .object({
          enabled: z.boolean().default(false),

          minQuantity: z.coerce
            .number()
            .int('Minimum quantity must be a whole number')
            .min(2, 'Minimum quantity must be at least 2')
            .default(2),

          discountPercent: z.coerce
            .number()
            .finite('Quantity discount must be a valid number')
            .min(0, 'Quantity discount cannot be negative')
            .max(100, 'Quantity discount cannot exceed 100%')
            .default(10)
        })
        .optional()
        .default({
          enabled: false,
          minQuantity: 2,
          discountPercent: 10
        }),

      // Selling price

      // Backend calculates this from MRP + discount.

      // It is kept here for backward compatibility.

      price: z

        .coerce

        .number()

        .finite(

          'Selling price must be a valid number'

        )

        .nonnegative(

          'Selling price cannot be negative'

        ),

      // Whether "25% OFF" should be shown

      showDiscountPercent: z

        .boolean()

        .optional()

        .default(true),

      // ------------------------------------------------------

      // Backward compatibility

      // ------------------------------------------------------

      compareAtPrice: z

        .coerce

        .number()

        .finite()

        .nonnegative()

        .optional(),

      // ------------------------------------------------------

      // Stock

      // ------------------------------------------------------

      stock: z

        .coerce

        .number()

        .int('Stock must be a whole number')

        .nonnegative('Stock cannot be negative')

        .optional(),

      // ------------------------------------------------------

      // Multiple product images

      // ------------------------------------------------------

      images: z

        .array(

          z

            .string()

            .trim()

            .url(

              'Each product image must be a valid URL'

            )

        )

        .min(

          1,

          'At least one product image is required'

        )

        .max(

          10,

          'A maximum of 10 product images is allowed'

        )

        .optional(),

      // ------------------------------------------------------

      // Product Details & Care

      // ------------------------------------------------------

      productDetails: z

        .string()

        .trim()

        .max(

          5000,

          'Product details cannot exceed 5000 characters'

        )

        .optional(),

      // ------------------------------------------------------

      // Shipping & Payment

      // ------------------------------------------------------

      shippingPayment: z

        .string()

        .trim()

        .max(

          5000,

          'Shipping & payment information cannot exceed 5000 characters'

        )

        .optional(),

      // ------------------------------------------------------

      // Return & Exchange

      // ------------------------------------------------------

      returnExchange: z

        .string()

        .trim()

        .max(

          5000,

          'Return & exchange information cannot exceed 5000 characters'

        )

        .optional(),

      // ------------------------------------------------------

      // SHIPPING PACKAGE DETAILS

      // Used for Velocity Shipping

      //

      // weight  = KG

      // length  = CM

      // breadth = CM

      // height  = CM

      // ------------------------------------------------------

      shipping: z.object({

        weight: z

          .coerce

          .number()

          .finite(

            'Shipping weight must be a valid number'

          )

          .min(

            0.001,

            'Shipping weight must be greater than 0'

          ),

        length: z

          .coerce

          .number()

          .finite(

            'Shipping length must be a valid number'

          )

          .min(

            0.1,

            'Shipping length must be greater than 0'

          ),

        breadth: z

          .coerce

          .number()

          .finite(

            'Shipping breadth must be a valid number'

          )

          .min(

            0.1,

            'Shipping breadth must be greater than 0'

          ),

        height: z

          .coerce

          .number()

          .finite(

            'Shipping height must be a valid number'

          )

          .min(

            0.1,

            'Shipping height must be greater than 0'

          )

      }),

      // ------------------------------------------------------

      // Product tags

      // ------------------------------------------------------

      tags: z

        .array(

          z

            .string()

            .trim()

            .min(1, 'Tag cannot be empty')

            .max(

              50,

              'Tag cannot exceed 50 characters'

            )

        )

        .max(

          20,

          'Maximum 20 tags are allowed'

        )

        .optional()

    })

    // --------------------------------------------------------

    // PRICE + DINNERWARE VALIDATION

    // --------------------------------------------------------

    .superRefine((data, ctx) => {

      // Selling price cannot exceed MRP

      if (data.price > data.mrp) {

        ctx.addIssue({

          code: z.ZodIssueCode.custom,

          path: ['price'],

          message:

            'Selling price cannot be higher than MRP'

        })

      }

      // Discount cannot be greater than 100%

      if (

        data.discountPercent !== undefined &&

        (

          data.discountPercent < 0 ||

          data.discountPercent > 100

        )

      ) {

        ctx.addIssue({

          code: z.ZodIssueCode.custom,

          path: ['discountPercent'],

          message:

            'Discount percentage must be between 0 and 100'

        })

      }

      // Quantity discount validation
      const quantityDiscount = data.quantityDiscount

      if (
        quantityDiscount?.enabled &&
        quantityDiscount.discountPercent <= 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantityDiscount', 'discountPercent'],
          message:
            'Enabled quantity discount must be greater than 0%'
        })
      }

      // ------------------------------------------------------

    // Category / subcategory validation

    // ------------------------------------------------------

    const allowedSubcategories = {

      Dinnerware: [],

      Drinkware: [

        'Cups',

        'Mugs'

      ],

      Serveware: [

        'Pasta Plate',

        'Serving Bowl',

        'Serving Platter'

      ],

      Gifting: [

        'Tea Set',

        'Tea Cup Set',
          'Serving Set'

      ]

    }

    const subcategory =

      String(data.subcategory || '').trim()

    if (

      data.category === 'Dinnerware' &&

      subcategory

    ) {

      ctx.addIssue({

        code: z.ZodIssueCode.custom,

        path: ['subcategory'],

        message:

          'Dinnerware products cannot have a subcategory'

      })

    }

    if (

      data.category !== 'Dinnerware' &&

      subcategory &&

      !allowedSubcategories[data.category]?.includes(

        subcategory

      )

    ) {

      ctx.addIssue({

        code: z.ZodIssueCode.custom,

        path: ['subcategory'],

        message:

          `Invalid subcategory for ${data.category}`

      })

    }

  }),

  params: z.object({}),

  query: z.object({})

})

// ============================================================

// NOT FOUND

// ============================================================

export function notFound(req, res) {

  res.status(404).json({

    success: false,

    message:

      `Route not found: ${req.method} ${req.originalUrl}`

  })

}

// ============================================================

// ERROR HANDLER

// ============================================================

export function errorHandler(err, req, res, next) {

  console.error('[XAAJ API]', err)

  const status =

    err.name === 'ValidationError'

      ? 422

      : err.code === 11000

        ? 409

        : err.statusCode || 500

  res.status(status).json({

    success: false,

    message:

      status === 500

        ? 'Internal server error'

        : err.message

  })

}