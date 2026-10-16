import express from 'express'
import Blog from '../models/Blog.js'
import { protect, adminOnly } from '../middleware/index.js'

const router = express.Router()


// ============================================================
// PUBLIC — GET ALL PUBLISHED BLOGS
// GET /api/blogs
// ============================================================

router.get('/', async (req, res, next) => {
  try {
    const {
      category,
      page = 1,
      limit = 12
    } = req.query

    const pageNumber = Math.max(
      Number(page) || 1,
      1
    )

    const limitNumber = Math.min(
      Math.max(Number(limit) || 12, 1),
      50
    )

    const filter = {
      isPublished: true,
      publishDate: {
        $lte: new Date()
      }
    }

    if (
      typeof category === 'string' &&
      category.trim()
    ) {
      filter.category = category.trim()
    }

    const [blogs, total] = await Promise.all([
      Blog.find(filter)
        .sort({
          publishDate: -1,
          createdAt: -1
        })
        .skip(
          (pageNumber - 1) * limitNumber
        )
        .limit(limitNumber)
        .lean(),

      Blog.countDocuments(filter)
    ])

    res.json({
      success: true,
      data: blogs,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        pages: Math.ceil(
          total / limitNumber
        )
      }
    })
  } catch (error) {
    next(error)
  }
})


// ============================================================
// ADMIN — GET ALL BLOGS
// GET /api/blogs/admin
//
// IMPORTANT:
// This route MUST come before /:slug
// ============================================================

router.get(
  '/admin',
  protect,
  adminOnly,
  async (_req, res, next) => {
    try {
      const blogs = await Blog.find({})
        .sort({
          createdAt: -1,
          publishDate: -1
        })
        .lean()

      res.json({
        success: true,
        data: blogs
      })
    } catch (error) {
      next(error)
    }
  }
)


// ============================================================
// ADMIN — GET ALL BLOGS (ALTERNATIVE ENDPOINT)
// GET /api/blogs/admin/all
// ============================================================

router.get(
  '/admin/all',
  protect,
  adminOnly,
  async (_req, res, next) => {
    try {
      const blogs = await Blog.find({})
        .sort({
          createdAt: -1,
          publishDate: -1
        })
        .lean()

      res.json({
        success: true,
        data: blogs
      })
    } catch (error) {
      next(error)
    }
  }
)


// ============================================================
// PUBLIC — GET SINGLE PUBLISHED BLOG
// GET /api/blogs/:slug
// ============================================================

router.get(
  '/:slug',
  async (req, res, next) => {
    try {
      const slug = String(
        req.params.slug || ''
      )
        .trim()
        .toLowerCase()

      const blog = await Blog.findOne({
        slug,
        isPublished: true,
        publishDate: {
          $lte: new Date()
        }
      }).lean()

      if (!blog) {
        return res.status(404).json({
          success: false,
          message: 'Blog not found.'
        })
      }

      res.json({
        success: true,
        data: blog
      })
    } catch (error) {
      next(error)
    }
  }
)


// ============================================================
// ADMIN — CREATE BLOG
// POST /api/blogs
// ============================================================

router.post(
  '/',
  protect,
  adminOnly,
  async (req, res, next) => {
    try {
      const {
        title,
        slug,
        coverImage,
        category,
        excerpt,
        content,
        author,
        publishDate,
        isPublished
      } = req.body


      // -------------------------
      // Required field validation
      // -------------------------

      if (
        typeof title !== 'string' ||
        !title.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: 'Blog title is required.'
        })
      }

      if (
        typeof slug !== 'string' ||
        !slug.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: 'Blog slug is required.'
        })
      }

      if (
        typeof coverImage !== 'string' ||
        !coverImage.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: 'Cover image is required.'
        })
      }

      if (
        typeof category !== 'string' ||
        !category.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: 'Blog category is required.'
        })
      }

      if (
        typeof excerpt !== 'string' ||
        !excerpt.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: 'Blog excerpt is required.'
        })
      }

      if (
        typeof content !== 'string' ||
        !content.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: 'Blog content is required.'
        })
      }


      // -------------------------
      // Normalize slug
      // -------------------------

      const normalizedSlug = slug
        .trim()
        .toLowerCase()


      // -------------------------
      // Check duplicate slug
      // -------------------------

      const existingBlog = await Blog.findOne({
        slug: normalizedSlug
      })

      if (existingBlog) {
        return res.status(409).json({
          success: false,
          message:
            'A blog with this slug already exists.'
        })
      }


      // -------------------------
      // Validate publish date
      // -------------------------

      let finalPublishDate = new Date()

      if (publishDate) {
        const parsedDate = new Date(
          publishDate
        )

        if (
          Number.isNaN(
            parsedDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Invalid publish date.'
          })
        }

        finalPublishDate = parsedDate
      }


      // -------------------------
      // Create blog
      // -------------------------

      const blog = await Blog.create({
        title: title.trim(),

        slug: normalizedSlug,

        coverImage:
          coverImage.trim(),

        category:
          category.trim(),

        excerpt:
          excerpt.trim(),

        content:
          content.trim(),

        author:
          typeof author === 'string' &&
          author.trim()
            ? author.trim()
            : 'XAAJ Editorial',

        publishDate:
          finalPublishDate,

        isPublished:
          Boolean(isPublished)
      })


      res.status(201).json({
        success: true,
        message:
          'Blog created successfully.',
        data: blog
      })
    } catch (error) {

      if (
        error?.code === 11000
      ) {
        return res.status(409).json({
          success: false,
          message:
            'A blog with this slug already exists.'
        })
      }

      next(error)
    }
  }
)


// ============================================================
// ADMIN — UPDATE BLOG
// PATCH /api/blogs/:id
// ============================================================

router.patch(
  '/:id',
  protect,
  adminOnly,
  async (req, res, next) => {
    try {

      const blog =
        await Blog.findById(
          req.params.id
        )

      if (!blog) {
        return res.status(404).json({
          success: false,
          message:
            'Blog not found.'
        })
      }


      // -------------------------
      // Allowed fields only
      // -------------------------

      const allowedFields = [
        'title',
        'slug',
        'coverImage',
        'category',
        'excerpt',
        'content',
        'author',
        'publishDate',
        'isPublished'
      ]


      for (
        const field of allowedFields
      ) {

        if (
          req.body[field] !== undefined
        ) {

          blog[field] =
            req.body[field]

        }

      }


      // -------------------------
      // Normalize strings
      // -------------------------

      if (
        typeof blog.title ===
        'string'
      ) {
        blog.title =
          blog.title.trim()
      }


      if (
        typeof blog.slug ===
        'string'
      ) {
        blog.slug =
          blog.slug
            .trim()
            .toLowerCase()
      }


      if (
        typeof blog.coverImage ===
        'string'
      ) {
        blog.coverImage =
          blog.coverImage.trim()
      }


      if (
        typeof blog.category ===
        'string'
      ) {
        blog.category =
          blog.category.trim()
      }


      if (
        typeof blog.excerpt ===
        'string'
      ) {
        blog.excerpt =
          blog.excerpt.trim()
      }


      if (
        typeof blog.content ===
        'string'
      ) {
        blog.content =
          blog.content.trim()
      }


      if (
        typeof blog.author ===
        'string'
      ) {
        blog.author =
          blog.author.trim()
      }


      // -------------------------
      // Validate publish date
      // -------------------------

      if (
        req.body.publishDate !==
        undefined
      ) {

        const parsedDate =
          new Date(
            req.body.publishDate
          )

        if (
          Number.isNaN(
            parsedDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Invalid publish date.'
          })
        }

        blog.publishDate =
          parsedDate
      }


      await blog.save()


      res.json({
        success: true,
        message:
          'Blog updated successfully.',
        data: blog
      })

    } catch (error) {

      if (
        error?.code === 11000
      ) {
        return res.status(409).json({
          success: false,
          message:
            'A blog with this slug already exists.'
        })
      }

      next(error)
    }
  }
)


// ============================================================
// ADMIN — DELETE BLOG
// DELETE /api/blogs/:id
// ============================================================

router.delete(
  '/:id',
  protect,
  adminOnly,
  async (req, res, next) => {
    try {

      const blog =
        await Blog.findByIdAndDelete(
          req.params.id
        )

      if (!blog) {
        return res.status(404).json({
          success: false,
          message:
            'Blog not found.'
        })
      }


      res.json({
        success: true,
        message:
          'Blog deleted successfully.'
      })

    } catch (error) {
      next(error)
    }
  }
)


// ============================================================
// ADMIN — PUBLISH / UNPUBLISH
// PATCH /api/blogs/:id/publish
// ============================================================

router.patch(
  '/:id/publish',
  protect,
  adminOnly,
  async (req, res, next) => {
    try {

      const blog =
        await Blog.findById(
          req.params.id
        )

      if (!blog) {
        return res.status(404).json({
          success: false,
          message:
            'Blog not found.'
        })
      }


      // -------------------------
      // Validate boolean
      // -------------------------

      if (
        typeof req.body.isPublished !==
        'boolean'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'isPublished must be true or false.'
        })
      }


      blog.isPublished =
        req.body.isPublished


      // -------------------------
      // If publishing a future blog,
      // make it live immediately
      // -------------------------

      if (
        blog.isPublished &&
        (
          !blog.publishDate ||
          blog.publishDate >
            new Date()
        )
      ) {
        blog.publishDate =
          new Date()
      }


      await blog.save()


      res.json({
        success: true,
        message:
          blog.isPublished
            ? 'Blog published successfully.'
            : 'Blog unpublished successfully.',
        data: blog
      })

    } catch (error) {
      next(error)
    }
  }
)


export default router