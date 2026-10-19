import { Router } from 'express'

import Content from '../models/CMS.js'
import Product from '../models/Product.js'

import {
  asyncHandler,
  adminOnly,
  protect
} from '../middleware/index.js'

const router = Router()

// ==========================================================
// ACTIVE CONTENT FILTER
// ==========================================================

const activeFilter = {
  isActive: true,
  $and: [
    {
      $or: [
        { startsAt: null },
        { startsAt: { $lte: new Date() } }
      ]
    },
    {
      $or: [
        { endsAt: null },
        { endsAt: { $gte: new Date() } }
      ]
    }
  ]
}

// ==========================================================
// ANNOUNCEMENT - PUBLIC GET
// GET /api/cms/announcement
// ==========================================================

router.get(
  '/announcement',
  asyncHandler(async (_req, res) => {
    const announcement = await Content.findOne({
      type: 'announcement'
    }).sort({
      updatedAt: -1
    })

    if (!announcement) {
      return res.json({
        success: true,
        data: {
          text: '',
          enabled: false
        }
      })
    }

    res.json({
      success: true,
      data: {
        id: announcement._id,

        text:
          announcement.text ||
          announcement.message ||
          '',

        enabled: Boolean(
          announcement.enabled !== undefined
            ? announcement.enabled
            : announcement.isActive
        )
      }
    })
  })
)

// ==========================================================
// ANNOUNCEMENT - ADMIN UPDATE
// PUT /api/cms/announcement
// ==========================================================

router.put(
  '/announcement',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const text = String(
      req.body?.text ||
      req.body?.message ||
      ''
    ).trim()

    const enabled = req.body?.enabled !== false

    if (!text) {
      return res.status(422).json({
        success: false,
        message: 'Announcement message is required.'
      })
    }

    if (text.length > 200) {
      return res.status(422).json({
        success: false,
        message:
          'Announcement message cannot exceed 200 characters.'
      })
    }

    const announcement =
      await Content.findOneAndUpdate(
        {
          type: 'announcement'
        },
        {
          $set: {
            type: 'announcement',
            text,
            enabled,
            isActive: enabled,
            order: 0,
            startsAt: null,
            endsAt: null
          }
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true
        }
      )

    res.json({
      success: true,
      message:
        'Announcement updated successfully.',
      data: {
        id: announcement._id,

        text:
          announcement.text || text,

        enabled: Boolean(
          announcement.enabled !== undefined
            ? announcement.enabled
            : announcement.isActive
        )
      }
    })
  })
)

// ==========================================================
// HERO SLIDER - PUBLIC GET
// GET /api/cms/hero
//
// Website ko sirf active hero slides milengi.
// ==========================================================

router.get(
  '/hero',
  asyncHandler(async (_req, res) => {
    const slides = await Content.find({
      type: 'hero',
      ...activeFilter
    })
      .sort({
        order: 1,
        createdAt: 1
      })
      .lean()

    res.json({
      success: true,
      data: {
        slides: slides.map(slide => ({
          id: slide._id,

          // Image URL OR Video URL
          image:
            slide.image || '',

          // New field:
          // image / video
          mediaType:
            slide.mediaType === 'video'
              ? 'video'
              : 'image',

          mobileImage:
            slide.mobileImage ||
            slide.image ||
            '',

          alt:
            slide.metadata?.alt ||
            slide.title ||
            'XAAJ Crockery',

          order:
            Number.isFinite(slide.order)
              ? slide.order
              : 0,

          enabled:
            slide.enabled !== false &&
            slide.isActive !== false
        }))
      }
    })
  })
)

// ==========================================================
// HERO SLIDER - ADMIN GET
// GET /api/cms/hero/admin
//
// Admin ko active + inactive dono slides milengi.
// Isse inactive slide refresh ke baad gayab nahi hogi.
// ==========================================================

router.get(
  '/hero/admin',
  protect,
  adminOnly,
  asyncHandler(async (_req, res) => {
    const slides = await Content.find({
      type: 'hero'
    })
      .sort({
        order: 1,
        createdAt: 1
      })
      .lean()

    res.json({
      success: true,
      data: {
        slides: slides.map(slide => ({
          id: slide._id,

          // Image URL OR Video URL
          image:
            slide.image || '',

          // New field
          mediaType:
            slide.mediaType === 'video'
              ? 'video'
              : 'image',

          mobileImage:
            slide.mobileImage ||
            slide.image ||
            '',

          alt:
            slide.metadata?.alt ||
            slide.title ||
            'XAAJ Crockery',

          order:
            Number.isFinite(slide.order)
              ? slide.order
              : 0,

          enabled:
            slide.enabled !== false &&
            slide.isActive !== false
        }))
      }
    })
  })
)

// ==========================================================
// HERO SLIDER - ADMIN UPDATE
// PUT /api/cms/hero
//
// Admin panel se complete hero slider save hoga.
// ==========================================================

router.put(
  '/hero',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const incomingSlides =
      Array.isArray(req.body?.slides)
        ? req.body.slides
        : null

    if (!incomingSlides) {
      return res.status(422).json({
        success: false,
        message:
          'Hero slides must be provided as an array.'
      })
    }

    // --------------------------------------------------------
    // Clean + validate slides
    // --------------------------------------------------------

    const slides = incomingSlides
      .map((slide, index) => {
        // Same field is used for image URL
        // OR video URL
        const image = String(
          slide?.image || ''
        ).trim()

        // New media type
        const mediaType =
          slide?.mediaType === 'video'
            ? 'video'
            : 'image'

        const mobileImage = String(
          slide?.mobileImage ||
          image
        ).trim()

        const alt = String(
          slide?.alt ||
          `XAAJ Crockery Hero ${index + 1}`
        ).trim()

        return {
          image,

          mediaType,

          mobileImage,

          alt,

          enabled:
            slide?.enabled !== false,

          order: index
        }
      })
      .filter(slide => slide.image)

    // --------------------------------------------------------
    // Maximum 10 hero slides
    // --------------------------------------------------------

    if (slides.length > 10) {
      return res.status(422).json({
        success: false,
        message:
          'Maximum 10 hero slides are allowed.'
      })
    }

    // --------------------------------------------------------
    // If slides were submitted but none has media URL
    // --------------------------------------------------------

    if (
      incomingSlides.length > 0 &&
      slides.length === 0
    ) {
      return res.status(422).json({
        success: false,
        message:
          'At least one valid hero media URL is required.'
      })
    }

    // --------------------------------------------------------
    // Remove old hero slides
    //
    // Only hero content is affected.
    // Announcement/product/other CMS content remains safe.
    // --------------------------------------------------------

    await Content.deleteMany({
      type: 'hero'
    })

    // --------------------------------------------------------
    // Insert new hero slides
    // --------------------------------------------------------

    let savedSlides = []

    if (slides.length > 0) {
      savedSlides =
        await Content.insertMany(
          slides.map(slide => ({
            type: 'hero',

            // URL can be image OR video
            image:
              slide.image,

            // image / video
            mediaType:
              slide.mediaType,

            mobileImage:
              slide.mobileImage,

            title:
              slide.alt,

            enabled:
              slide.enabled,

            isActive:
              slide.enabled,

            order:
              slide.order,

            startsAt:
              null,

            endsAt:
              null,

            metadata: {
              alt:
                slide.alt
            }
          }))
        )
    }

    // --------------------------------------------------------
    // Return saved slides
    // --------------------------------------------------------

    res.json({
      success: true,
      message:
        'Hero slides updated successfully.',

      data: {
        slides:
          savedSlides
            .sort(
              (a, b) =>
                a.order - b.order
            )
            .map(slide => ({
              id:
                slide._id,

              image:
                slide.image || '',

              mediaType:
                slide.mediaType === 'video'
                  ? 'video'
                  : 'image',

              mobileImage:
                slide.mobileImage ||
                slide.image ||
                '',

              alt:
                slide.metadata?.alt ||
                slide.title ||
                'XAAJ Crockery',

              order:
                slide.order,

              enabled:
                slide.enabled !== false &&
                slide.isActive !== false
            }))
      }
    })
  })
)

// ==========================================================
// CATEGORY HERO MEDIA - PUBLIC GET
// GET /api/cms/category-hero
//
// Homepage category associations use stable slugs.
// ==========================================================

const CATEGORY_HEROES = [
  { categorySlug: 'drinkware', categoryName: 'Drinkware', order: 0 },
  { categorySlug: 'gifting', categoryName: 'Gifting', order: 1 },
  { categorySlug: 'dinnerware', categoryName: 'Dinnerware', order: 2 },
  { categorySlug: 'serveware', categoryName: 'Serveware', order: 3 },
  { categorySlug: 'b2b', categoryName: 'B2B', order: 4 }
]

const normalizeCategoryHero = (content, fallback) => ({
  id: content?._id || null,
  categorySlug:
    content?.metadata?.categorySlug ||
    fallback?.categorySlug ||
    '',
  categoryName:
    content?.metadata?.categoryName ||
    content?.title ||
    fallback?.categoryName ||
    '',
  mediaUrl: content?.image || '',
  mobileMediaUrl:
    content?.mobileImage ||
    content?.image ||
    '',
  mediaType:
    content?.mediaType === 'video'
      ? 'video'
      : 'image',
  alt:
    content?.metadata?.alt ||
    content?.title ||
    fallback?.categoryName ||
    'XAAJ category',
  enabled:
    content?.enabled !== undefined
      ? Boolean(content.enabled)
      : content?.isActive !== false,
  order:
    Number.isFinite(content?.order)
      ? content.order
      : Number(fallback?.order || 0)
})

router.get(
  '/category-hero',
  asyncHandler(async (_req, res) => {
    const content = await Content.find({
      type: 'category-hero',
      'metadata.categorySlug': {
        $in: CATEGORY_HEROES.map(item => item.categorySlug)
      }
    })
      .sort({
        order: 1,
        createdAt: 1
      })
      .lean()

    const bySlug = new Map(
      content.map(item => [
        item?.metadata?.categorySlug,
        item
      ])
    )

    const categoryHeroes = CATEGORY_HEROES
      .map(fallback =>
        normalizeCategoryHero(
          bySlug.get(fallback.categorySlug),
          fallback
        )
      )
      .filter(item => item.enabled && item.mediaUrl)

    res.json({
      success: true,
      data: {
        categories: categoryHeroes,
        categoryHeroes
      }
    })
  })
)


// ==========================================================
// CATEGORY HERO MEDIA - ADMIN GET
// GET /api/cms/category-hero/admin
// ==========================================================

router.get(
  '/category-hero/admin',
  protect,
  adminOnly,
  asyncHandler(async (_req, res) => {
    const content = await Content.find({
      type: 'category-hero',
      'metadata.categorySlug': {
        $in: CATEGORY_HEROES.map(item => item.categorySlug)
      }
    })
      .sort({
        order: 1,
        createdAt: 1
      })
      .lean()

    const bySlug = new Map(
      content.map(item => [
        item?.metadata?.categorySlug,
        item
      ])
    )

    const categoryHeroes = CATEGORY_HEROES.map(
      fallback =>
        normalizeCategoryHero(
          bySlug.get(fallback.categorySlug),
          fallback
        )
    )

    res.json({
      success: true,
      data: {
        categories: categoryHeroes,
        categoryHeroes
      }
    })
  })
)


// ==========================================================
// CATEGORY HERO MEDIA - ADMIN UPDATE
// PUT /api/cms/category-hero
// ==========================================================

router.put(
  '/category-hero',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const incoming =
      Array.isArray(req.body?.categoryHeroes)
        ? req.body.categoryHeroes
        : Array.isArray(req.body?.categories)
          ? req.body.categories
          : null

    if (!incoming) {
      return res.status(422).json({
        success: false,
        message:
          'Category hero media must be provided as an array.'
      })
    }

    const allowedSlugs = new Map(
      CATEGORY_HEROES.map(item => [
        item.categorySlug,
        item
      ])
    )

    const updates = []
    const seen = new Set()

    for (const item of incoming) {
      const categorySlug = String(
        item?.categorySlug ||
        item?.slug ||
        ''
      )
        .trim()
        .toLowerCase()

      if (!allowedSlugs.has(categorySlug)) {
        return res.status(422).json({
          success: false,
          message:
            `Unsupported category slug: ${categorySlug || 'missing'}`
        })
      }

      if (seen.has(categorySlug)) {
        continue
      }

      seen.add(categorySlug)

      const fallback = allowedSlugs.get(categorySlug)

      const mediaUrl = String(
        item?.mediaUrl ||
        item?.image ||
        item?.imageUrl ||
        ''
      ).trim()

      const mobileMediaUrl = String(
        item?.mobileMediaUrl ||
        item?.mobileImage ||
        mediaUrl
      ).trim()

      const mediaType =
        item?.mediaType === 'video'
          ? 'video'
          : 'image'

      const alt = String(
        item?.alt ||
        fallback.categoryName
      ).trim()

      const enabled =
        item?.enabled !== false

      updates.push({
        updateOne: {
          filter: {
            type: 'category-hero',
            'metadata.categorySlug': categorySlug
          },
          update: {
            $set: {
              type: 'category-hero',
              title: fallback.categoryName,
              image: mediaUrl,
              mobileImage: mobileMediaUrl,
              mediaType,
              enabled,
              isActive: enabled,
              order: fallback.order,
              startsAt: null,
              endsAt: null,
              metadata: {
                categorySlug,
                categoryName: fallback.categoryName,
                alt
              }
            }
          },
          upsert: true
        }
      })
    }

    if (updates.length > 0) {
      await Content.bulkWrite(updates)
    }

    const content = await Content.find({
      type: 'category-hero',
      'metadata.categorySlug': {
        $in: CATEGORY_HEROES.map(item => item.categorySlug)
      }
    })
      .sort({
        order: 1,
        createdAt: 1
      })
      .lean()

    const bySlug = new Map(
      content.map(item => [
        item?.metadata?.categorySlug,
        item
      ])
    )

    const categoryHeroes = CATEGORY_HEROES.map(
      fallback =>
        normalizeCategoryHero(
          bySlug.get(fallback.categorySlug),
          fallback
        )
    )

    res.json({
      success: true,
      message:
        'Category hero media updated successfully.',
      data: {
        categories: categoryHeroes,
        categoryHeroes
      }
    })
  })
)



// ==========================================================
// HORECA COLLECTION MEDIA - PUBLIC GET
// GET /api/cms/horeca-collection
//
// Homepage Horeca collection ke 3 image slots.
// Empty media URL ka matlab uploaded image remove hai;
// homepage apni original fallback image dikha sakta hai.
// ==========================================================

const HORECA_COLLECTION_SLOTS = [
  {
    slot: 'main',
    title: 'Horeca Main',
    alt: 'XAAJ Horeca collection',
    order: 0
  },
  {
    slot: 'sideOne',
    title: 'Horeca Side One',
    alt: 'XAAJ Horeca tableware',
    order: 1
  },
  {
    slot: 'sideTwo',
    title: 'Horeca Side Two',
    alt: 'XAAJ Horeca serveware',
    order: 2
  }
]

const normalizeHorecaCollection = (content = []) => {
  const list = Array.isArray(content) ? content : []

  return HORECA_COLLECTION_SLOTS.map(slotDefault => {
    const saved = list.find(item => {
      const savedSlot = String(
        item?.metadata?.slot ||
        item?.slot ||
        ''
      )
        .trim()
        .toLowerCase()

      return savedSlot === slotDefault.slot.toLowerCase()
    })

    return {
      id: saved?._id || null,
      slot: slotDefault.slot,
      mediaUrl: saved?.image || '',
      mediaType:
        saved?.mediaType === 'video'
          ? 'video'
          : 'image',
      alt:
        saved?.metadata?.alt ||
        saved?.title ||
        slotDefault.alt,
      enabled:
        saved?.enabled !== undefined
          ? Boolean(saved.enabled)
          : saved?.isActive !== false,
      order: slotDefault.order
    }
  })
}

router.get(
  '/horeca-collection',
  asyncHandler(async (_req, res) => {
    const content = await Content.find({
      type: 'settings',
      'metadata.section': 'horeca-collection'
    })
      .sort({
        order: 1,
        createdAt: 1
      })
      .lean()

    const items = normalizeHorecaCollection(content)

    res.json({
      success: true,
      data: {
        items,
        horeca: items,
        media: items
      }
    })
  })
)

// ==========================================================
// HORECA COLLECTION MEDIA - ADMIN GET
// GET /api/cms/horeca-collection/admin
// ==========================================================

router.get(
  '/horeca-collection/admin',
  protect,
  adminOnly,
  asyncHandler(async (_req, res) => {
    const content = await Content.find({
      type: 'settings',
      'metadata.section': 'horeca-collection'
    })
      .sort({
        order: 1,
        createdAt: 1
      })
      .lean()

    const items = normalizeHorecaCollection(content)

    res.json({
      success: true,
      data: {
        items,
        horeca: items,
        media: items
      }
    })
  })
)

// ==========================================================
// HORECA COLLECTION MEDIA - ADMIN UPDATE
// PUT /api/cms/horeca-collection
//
// Admin panel se 3 Horeca image slots save/remove.
// Empty media URL sirf us slot ka media clear karta hai;
// collection section enabled/visible rehta hai.
// ==========================================================

router.put(
  '/horeca-collection',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const incoming = Array.isArray(req.body?.items)
      ? req.body.items
      : Array.isArray(req.body?.horeca)
        ? req.body.horeca
        : Array.isArray(req.body?.media)
          ? req.body.media
          : null

    if (!incoming) {
      return res.status(422).json({
        success: false,
        message:
          'Horeca collection media must be provided as an array.'
      })
    }

    const allowedSlots = new Map(
      HORECA_COLLECTION_SLOTS.map(item => [
        item.slot,
        item
      ])
    )

    const updates = []
    const seen = new Set()

    for (const item of incoming) {
      const rawSlot = String(
        item?.slot ||
        item?.key ||
        item?.position ||
        ''
      )
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '')

      const slot =
        rawSlot === 'main' ||
        rawSlot === 'primary' ||
        rawSlot === 'left'
          ? 'main'
          : rawSlot === 'sideone' ||
              rawSlot === 'side1' ||
              rawSlot === 'top' ||
              rawSlot === 'righttop'
            ? 'sideOne'
            : rawSlot === 'sidetwo' ||
                rawSlot === 'side2' ||
                rawSlot === 'bottom' ||
                rawSlot === 'rightbottom'
              ? 'sideTwo'
              : null

      if (!slot || seen.has(slot)) {
        continue
      }

      seen.add(slot)

      const fallback = allowedSlots.get(slot)

      const mediaUrl = String(
        item?.mediaUrl ||
        item?.image ||
        item?.imageUrl ||
        ''
      ).trim()

      const mediaType =
        item?.mediaType === 'video'
          ? 'video'
          : 'image'

      const alt = String(
        item?.alt ||
        fallback.alt
      ).trim()

      const enabled =
        item?.enabled !== false

      updates.push({
        updateOne: {
          filter: {
            type: 'settings',
            'metadata.section': 'horeca-collection',
            'metadata.slot': slot
          },
          update: {
            $set: {
              type: 'settings',
              title: fallback.title,
              image: mediaUrl,
              mediaType,
              enabled,
              isActive: enabled,
              order: fallback.order,
              startsAt: null,
              endsAt: null,
              metadata: {
                section: 'horeca-collection',
                slot,
                alt
              }
            }
          },
          upsert: true
        }
      })
    }

    if (updates.length > 0) {
      await Content.bulkWrite(updates)
    }

    const content = await Content.find({
      type: 'settings',
      'metadata.section': 'horeca-collection'
    })
      .sort({
        order: 1,
        createdAt: 1
      })
      .lean()

    const items = normalizeHorecaCollection(content)

    res.json({
      success: true,
      message: 'Horeca collection media updated successfully.',
      data: {
        items,
        horeca: items,
        media: items
      }
    })
  })
)


// ==========================================================
// BRAND STORY MEDIA - PUBLIC GET
// GET /api/cms/brand-story
//
// Homepage Brand Story section ke liye image/video.
// ==========================================================

const normalizeBrandStory = (content) => ({
  id: content?._id || null,
  mediaUrl: content?.image || '',
  mediaType: content?.mediaType === 'video' ? 'video' : 'image',
  alt:
    content?.metadata?.alt ||
    content?.title ||
    'XAAJ handcrafted tableware arranged on a linen table',
  enabled:
    content?.enabled !== undefined
      ? Boolean(content.enabled)
      : content?.isActive !== false
})

router.get(
  '/brand-story',
  asyncHandler(async (_req, res) => {
    const content = await Content.findOne({
      type: 'settings',
      'metadata.section': 'brand-story'
    })
      .sort({ updatedAt: -1 })
      .lean()

    const brandStory = normalizeBrandStory(content)

    res.json({
      success: true,
      data: {
        brandStory
      }
    })
  })
)

// ==========================================================
// BRAND STORY MEDIA - ADMIN GET
// GET /api/cms/brand-story/admin
// ==========================================================

router.get(
  '/brand-story/admin',
  protect,
  adminOnly,
  asyncHandler(async (_req, res) => {
    const content = await Content.findOne({
      type: 'settings',
      'metadata.section': 'brand-story'
    })
      .sort({ updatedAt: -1 })
      .lean()

    const brandStory = normalizeBrandStory(content)

    res.json({
      success: true,
      data: {
        brandStory
      }
    })
  })
)

// ==========================================================
// BRAND STORY MEDIA - ADMIN UPDATE
// PUT /api/cms/brand-story
//
// Admin panel se Brand Story ka image/video + enabled state save.
// ==========================================================

router.put(
  '/brand-story',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const mediaUrl = String(
      req.body?.mediaUrl ||
      req.body?.image ||
      req.body?.imageUrl ||
      req.body?.videoUrl ||
      ''
    ).trim()

    const mediaType =
      req.body?.mediaType === 'video'
        ? 'video'
        : 'image'

    const alt = String(
      req.body?.alt ||
      'XAAJ handcrafted tableware arranged on a linen table'
    ).trim()

    const enabled = req.body?.enabled !== false

    // Empty media URL means only the current Brand Story media is removed.
    // The Brand Story section itself stays enabled on the homepage.

    const content = await Content.findOneAndUpdate(
      {
        type: 'settings',
        'metadata.section': 'brand-story'
      },
      {
        $set: {
          type: 'settings',
          title: 'Brand Story',
          image: mediaUrl,
          mediaType,
          enabled,
          isActive: enabled,
          order: 0,
          startsAt: null,
          endsAt: null,
          metadata: {
            section: 'brand-story',
            alt
          }
        }
      },
      {
        returnDocument: 'after',
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    )

    res.json({
      success: true,
      message: mediaUrl
        ? 'Brand Story updated successfully.'
        : 'Brand Story media removed successfully.',
      data: {
        brandStory: normalizeBrandStory(content)
      }
    })
  })
)

// ==========================================================
// HOME CMS DATA
// GET /api/cms/home
// ==========================================================

router.get(
  '/home',
  asyncHandler(async (_req, res) => {
    const [
      content,
      categories,
      featured,
      bestsellers,
      newArrivals
    ] = await Promise.all([
      Content.find(activeFilter)
        .sort({
          order: 1
        }),

      Product.distinct(
        'category',
        {
          isActive: true
        }
      ),

      Product.find({
        isActive: true,
        tags: 'featured'
      })
        .sort({
          createdAt: -1
        })
        .limit(8),

      Product.find({
        isActive: true,
        tags: 'bestseller'
      })
        .sort({
          createdAt: -1
        })
        .limit(8),

      Product.find({
        isActive: true,
        tags: 'new'
      })
        .sort({
          createdAt: -1
        })
        .limit(8)
    ])

    res.json({
      success: true,

      data: {
        content,
        categories,
        featured,
        bestsellers,
        newArrivals
      }
    })
  })
)

// ==========================================================
// ADMIN - GET ALL CMS CONTENT
// GET /api/cms
// ==========================================================

router.get(
  '/',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const filter =
      req.query.type
        ? {
            type: req.query.type
          }
        : {}

    const content =
      await Content.find(filter)
        .sort({
          order: 1
        })

    res.json({
      success: true,
      data: content
    })
  })
)

// ==========================================================
// ADMIN - CREATE CMS CONTENT
// POST /api/cms
// ==========================================================

router.post(
  '/',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const content =
      await Content.create(req.body)

    res.status(201).json({
      success: true,
      data: content
    })
  })
)

// ==========================================================
// ADMIN - UPDATE CMS CONTENT
// PATCH /api/cms/:id
// ==========================================================

router.patch(
  '/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const content =
      await Content.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
          new: true,
          runValidators: true
        }
      )

    if (!content) {
      return res.status(404).json({
        success: false,
        message:
          'CMS content not found.'
      })
    }

    res.json({
      success: true,
      data: content
    })
  })
)

// ==========================================================
// ADMIN - DELETE CMS CONTENT
// DELETE /api/cms/:id
// ==========================================================

router.delete(
  '/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const content =
      await Content.findByIdAndDelete(
        req.params.id
      )

    if (!content) {
      return res.status(404).json({
        success: false,
        message:
          'CMS content not found.'
      })
    }

    res.json({
      success: true,
      message:
        'CMS content deleted successfully.'
    })
  })
)

// ==========================================================
// HORECA CATALOGUE - COLLECTIONS + PRODUCTS CRUD
//
// These records are stored in the existing CMS collection using
// dedicated metadata.section values. This keeps the existing
// ecommerce Product model and checkout logic untouched.
//
// Public:
// GET /api/cms/horeca/catalogue
// GET /api/cms/horeca/catalogue/collections
// GET /api/cms/horeca/catalogue/products
//
// Admin (protect + adminOnly):
// GET    /api/cms/horeca/catalogue/admin
// POST   /api/cms/horeca/catalogue/collections
// PATCH  /api/cms/horeca/catalogue/collections/:id
// DELETE /api/cms/horeca/catalogue/collections/:id
// POST   /api/cms/horeca/catalogue/products
// PATCH  /api/cms/horeca/catalogue/products/:id
// DELETE /api/cms/horeca/catalogue/products/:id
// ==========================================================

const HORECA_COLLECTION_SECTION = 'horeca-catalogue-collection'
const HORECA_PRODUCT_SECTION = 'horeca-catalogue-product'

const cleanText = (value, maxLength = 250) =>
  String(value ?? '').trim().slice(0, maxLength)

const cleanSlug = value =>
  cleanText(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const normalizeHorecaRecord = (doc, kind) => {
  const metadata = doc?.metadata || {}
  return {
    id: String(doc?._id || ''),
    name: doc?.title || metadata.name || '',
    title: doc?.title || metadata.name || '',
    slug: metadata.slug || cleanSlug(doc?.title || ''),
    description: doc?.description || metadata.description || '',
    image: doc?.image || metadata.image || '',
    imageUrl: doc?.image || metadata.image || '',
    code: metadata.code || '',
    size: metadata.size || '',
    category: metadata.category || '',
    collection: metadata.collection || '',
    collectionSlug: metadata.collectionSlug || '',
    enabled: doc?.enabled !== false && doc?.isActive !== false,
    isActive: doc?.isActive !== false && doc?.enabled !== false,
    order: Number.isFinite(doc?.order) ? doc.order : 0,
    type: kind
  }
}

const horecaCollectionFilter = {
  type: 'settings',
  'metadata.section': HORECA_COLLECTION_SECTION
}

const horecaProductFilter = {
  type: 'settings',
  'metadata.section': HORECA_PRODUCT_SECTION
}

const validateHorecaRecord = (body, kind) => {
  const name = cleanText(body?.name || body?.title, 150)
  const description = cleanText(body?.description, 2000)
  const image = cleanText(body?.image || body?.imageUrl, 1000)
  const slug = cleanSlug(body?.slug || name)

  if (!name || name.length < 2) {
    const error = new Error(`${kind} name must contain at least 2 characters.`)
    error.statusCode = 422
    throw error
  }

  if (!slug) {
    const error = new Error(`${kind} slug is required.`)
    error.statusCode = 422
    throw error
  }

  if (image) {
    let parsed
    try {
      parsed = new URL(image)
    } catch {
      const error = new Error('Image URL must be a valid http(s) URL.')
      error.statusCode = 422
      throw error
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      const error = new Error('Image URL must use http or https.')
      error.statusCode = 422
      throw error
    }
  }

  return {
    name,
    title: name,
    slug,
    description,
    image,
    code: cleanText(body?.code, 80),
    size: cleanText(body?.size, 80),
    category: cleanText(body?.category, 100),
    collection: cleanText(body?.collection, 150),
    collectionSlug: cleanSlug(body?.collectionSlug || body?.collection || ''),
    enabled: body?.enabled !== false && body?.isActive !== false,
    order: Number.isFinite(Number(body?.order)) ? Number(body.order) : 0
  }
}

const saveHorecaRecord = async ({ kind, body, existingId = null }) => {
  const section = kind === 'collection'
    ? HORECA_COLLECTION_SECTION
    : HORECA_PRODUCT_SECTION
  const filter = { type: 'settings', 'metadata.section': section }
  const data = validateHorecaRecord(body, kind)
  const duplicate = await Content.findOne({
    ...filter,
    'metadata.slug': data.slug,
    ...(existingId ? { _id: { $ne: existingId } } : {})
  }).lean()

  if (duplicate) {
    const error = new Error(`A ${kind} with this slug already exists.`)
    error.statusCode = 409
    throw error
  }

  const update = {
    $set: {
      type: 'settings',
      title: data.name,
      description: data.description,
      image: data.image,
      enabled: data.enabled,
      isActive: data.enabled,
      order: data.order,
      startsAt: null,
      endsAt: null,
      metadata: {
        section,
        slug: data.slug,
        name: data.name,
        description: data.description,
        image: data.image,
        code: data.code,
        size: data.size,
        category: data.category,
        collection: data.collection,
        collectionSlug: data.collectionSlug
      }
    }
  }

  if (existingId) {
    return Content.findOneAndUpdate(
      { ...filter, _id: existingId },
      update,
      { new: true, runValidators: true }
    )
  }

  return Content.create(update.$set)
}

// Public catalogue response: only active records are visible on the website.
router.get(
  '/horeca/catalogue',
  asyncHandler(async (_req, res) => {
    const [collections, products] = await Promise.all([
      Content.find({ ...horecaCollectionFilter, isActive: true, enabled: { $ne: false } })
        .sort({ order: 1, createdAt: 1 }).lean(),
      Content.find({ ...horecaProductFilter, isActive: true, enabled: { $ne: false } })
        .sort({ order: 1, createdAt: 1 }).lean()
    ])

    res.json({
      success: true,
      data: {
        collections: collections.map(item => normalizeHorecaRecord(item, 'collection')),
        products: products.map(item => normalizeHorecaRecord(item, 'product'))
      }
    })
  })
)

router.get(
  '/horeca/catalogue/collections',
  asyncHandler(async (_req, res) => {
    const items = await Content.find({
      ...horecaCollectionFilter,
      isActive: true,
      enabled: { $ne: false }
    }).sort({ order: 1, createdAt: 1 }).lean()

    res.json({ success: true, data: items.map(item => normalizeHorecaRecord(item, 'collection')) })
  })
)

router.get(
  '/horeca/catalogue/products',
  asyncHandler(async (req, res) => {
    const filter = {
      ...horecaProductFilter,
      isActive: true,
      enabled: { $ne: false }
    }
    const collectionSlug = cleanSlug(req.query?.collection || '')
    if (collectionSlug) filter['metadata.collectionSlug'] = collectionSlug

    const items = await Content.find(filter).sort({ order: 1, createdAt: 1 }).lean()
    res.json({ success: true, data: items.map(item => normalizeHorecaRecord(item, 'product')) })
  })
)

// Admin can see both active and inactive records.
router.get(
  '/horeca/catalogue/admin',
  protect,
  adminOnly,
  asyncHandler(async (_req, res) => {
    const [collections, products] = await Promise.all([
      Content.find(horecaCollectionFilter).sort({ order: 1, createdAt: 1 }).lean(),
      Content.find(horecaProductFilter).sort({ order: 1, createdAt: 1 }).lean()
    ])

    res.json({
      success: true,
      data: {
        collections: collections.map(item => normalizeHorecaRecord(item, 'collection')),
        products: products.map(item => normalizeHorecaRecord(item, 'product'))
      }
    })
  })
)

router.post(
  '/horeca/catalogue/collections',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const item = await saveHorecaRecord({ kind: 'collection', body: req.body || {} })
    res.status(201).json({
      success: true,
      message: 'HoReCa collection created successfully.',
      data: normalizeHorecaRecord(item, 'collection')
    })
  })
)

router.patch(
  '/horeca/catalogue/collections/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const item = await saveHorecaRecord({ kind: 'collection', body: req.body || {}, existingId: req.params.id })
    if (!item) return res.status(404).json({ success: false, message: 'HoReCa collection not found.' })
    res.json({ success: true, message: 'HoReCa collection updated successfully.', data: normalizeHorecaRecord(item, 'collection') })
  })
)

router.delete(
  '/horeca/catalogue/collections/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const item = await Content.findOneAndDelete({ ...horecaCollectionFilter, _id: req.params.id })
    if (!item) return res.status(404).json({ success: false, message: 'HoReCa collection not found.' })
    res.json({ success: true, message: 'HoReCa collection deleted successfully.' })
  })
)

router.post(
  '/horeca/catalogue/products',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const item = await saveHorecaRecord({ kind: 'product', body: req.body || {} })
    res.status(201).json({
      success: true,
      message: 'HoReCa product created successfully.',
      data: normalizeHorecaRecord(item, 'product')
    })
  })
)

router.patch(
  '/horeca/catalogue/products/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const item = await saveHorecaRecord({ kind: 'product', body: req.body || {}, existingId: req.params.id })
    if (!item) return res.status(404).json({ success: false, message: 'HoReCa product not found.' })
    res.json({ success: true, message: 'HoReCa product updated successfully.', data: normalizeHorecaRecord(item, 'product') })
  })
)

router.delete(
  '/horeca/catalogue/products/:id',
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const item = await Content.findOneAndDelete({ ...horecaProductFilter, _id: req.params.id })
    if (!item) return res.status(404).json({ success: false, message: 'HoReCa product not found.' })
    res.json({ success: true, message: 'HoReCa product deleted successfully.' })
  })
)

// ==========================================================
// BACKWARD-COMPATIBLE HORECA CATALOGUE URL ALIASES
// Supports the frontend URL seen in the browser:
// /api/cms/horeca-catalogue/products
// Existing /horeca/catalogue/* routes remain unchanged.
// ==========================================================

router.get(
  '/horeca-catalogue',
  asyncHandler(async (_req, res) => {
    const [collections, products] = await Promise.all([
      Content.find({ ...horecaCollectionFilter, isActive: true, enabled: { $ne: false } })
        .sort({ order: 1, createdAt: 1 }).lean(),
      Content.find({ ...horecaProductFilter, isActive: true, enabled: { $ne: false } })
        .sort({ order: 1, createdAt: 1 }).lean()
    ])

    res.json({
      success: true,
      data: {
        collections: collections.map(item => normalizeHorecaRecord(item, 'collection')),
        products: products.map(item => normalizeHorecaRecord(item, 'product'))
      }
    })
  })
)

router.get(
  '/horeca-catalogue/collections',
  asyncHandler(async (_req, res) => {
    const items = await Content.find({
      ...horecaCollectionFilter,
      isActive: true,
      enabled: { $ne: false }
    }).sort({ order: 1, createdAt: 1 }).lean()

    res.json({ success: true, data: items.map(item => normalizeHorecaRecord(item, 'collection')) })
  })
)

router.get(
  '/horeca-catalogue/products',
  asyncHandler(async (req, res) => {
    const filter = {
      ...horecaProductFilter,
      isActive: true,
      enabled: { $ne: false }
    }
    const collectionSlug = cleanSlug(req.query?.collection || '')
    if (collectionSlug) filter['metadata.collectionSlug'] = collectionSlug

    const items = await Content.find(filter).sort({ order: 1, createdAt: 1 }).lean()
    res.json({ success: true, data: items.map(item => normalizeHorecaRecord(item, 'product')) })
  })
)

// ==========================================================
// EXPORT ROUTER
// ==========================================================

export default router