import { Router } from 'express'
import multer from 'multer'

import {
  asyncHandler,
  adminOnly,
  protect
} from '../middleware/index.js'

import {
  uploadImage,
  uploadMedia
} from '../services/integrations.js'

const router = Router()


// ============================================================
// MULTER - IMAGE CONFIGURATION
// ============================================================

const upload = multer({

  storage:
    multer.memoryStorage(),

  limits: {
    // Maximum 5 MB for normal images
    fileSize:
      5 * 1024 * 1024
  },

  fileFilter:
    (_req, file, callback) => {

      // ------------------------------------------------------
      // Only image files allowed
      // ------------------------------------------------------

      if (
        !file.mimetype ||
        !file.mimetype.startsWith(
          'image/'
        )
      ) {
        return callback(
          new Error(
            'Only image files are allowed'
          )
        )
      }

      callback(null, true)
    }
})


// ============================================================
// MULTER - IMAGE / VIDEO MEDIA CONFIGURATION
// ============================================================

const uploadMediaFile = multer({

  storage:
    multer.memoryStorage(),

  limits: {
    // Maximum 50 MB for hero media.
    // This allows practical video uploads while keeping
    // the existing 5 MB image endpoint unchanged.
    fileSize:
      50 * 1024 * 1024
  },

  fileFilter:
    (_req, file, callback) => {

      // ------------------------------------------------------
      // Images and videos allowed
      // ------------------------------------------------------

      const isImage =
        Boolean(
          file.mimetype &&
          file.mimetype.startsWith(
            'image/'
          )
        )

      const isVideo =
        Boolean(
          file.mimetype &&
          file.mimetype.startsWith(
            'video/'
          )
        )

      if (!isImage && !isVideo) {
        return callback(
          new Error(
            'Only image and video files are allowed'
          )
        )
      }

      callback(null, true)
    }
})


// ============================================================
// UPLOAD PRODUCT / CMS IMAGE
//
// POST /api/uploads/image
//
// Field name:
// image
//
// Optional:
// folder
//
// Admin only
//
// Existing image upload endpoint is preserved.
// ============================================================

router.post(
  '/image',

  protect,
  adminOnly,

  upload.single('image'),

  asyncHandler(
    async (req, res) => {

      // ------------------------------------------------------
      // File required
      // ------------------------------------------------------

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            'Image is required'
        })
      }


      // ------------------------------------------------------
      // Convert image to Data URI
      // ------------------------------------------------------

      const dataUri =
        `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`


      // ------------------------------------------------------
      // Safe folder
      // ------------------------------------------------------

      const requestedFolder =
        String(
          req.body?.folder ||
          'xaaj'
        )
          .trim()
          .replace(
            /[^a-zA-Z0-9/_-]/g,
            ''
          )


      const folder =
        requestedFolder ||
        'xaaj'


      // ------------------------------------------------------
      // Upload to Cloudinary
      // ------------------------------------------------------

      const data =
        await uploadImage(
          dataUri,
          folder
        )


      // ------------------------------------------------------
      // Response
      // ------------------------------------------------------

      res.status(201).json({

        success: true,

        message:
          'Image uploaded successfully',

        data
      })
    }
  )
)


// ============================================================
// UPLOAD IMAGE / VIDEO MEDIA
//
// POST /api/uploads/media
//
// Field name:
// media
//
// Optional:
// folder
//
// Optional:
// resourceType = image | video | auto
//
// Admin only
//
// Intended for homepage/category hero media.
// ============================================================

router.post(
  '/media',

  protect,
  adminOnly,

  uploadMediaFile.single('media'),

  asyncHandler(
    async (req, res) => {

      // ------------------------------------------------------
      // File required
      // ------------------------------------------------------

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            'Image or video is required'
        })
      }


      // ------------------------------------------------------
      // Safe folder
      // ------------------------------------------------------

      const requestedFolder =
        String(
          req.body?.folder ||
          'xaaj/category-heroes'
        )
          .trim()
          .replace(
            /[^a-zA-Z0-9/_-]/g,
            ''
          )


      const folder =
        requestedFolder ||
        'xaaj/category-heroes'


      // ------------------------------------------------------
      // Resource type
      // ------------------------------------------------------

      const resourceType =
        req.file.mimetype.startsWith('video/')
          ? 'video'
          : 'image'


      // ------------------------------------------------------
      // Upload buffer directly to Cloudinary
      // ------------------------------------------------------

      const data =
        await uploadMedia(
          req.file.buffer,
          folder,
          resourceType
        )


      // ------------------------------------------------------
      // Response
      // ------------------------------------------------------

      res.status(201).json({

        success: true,

        message:
          `${resourceType === 'video' ? 'Video' : 'Image'} uploaded successfully`,

        data: {
          ...data,

          mediaType:
            resourceType,

          mimeType:
            req.file.mimetype,

          originalName:
            req.file.originalname
        }
      })
    }
  )
)


// ============================================================
// MULTER ERROR HANDLER
// ============================================================

router.use(
  (err, _req, res, next) => {

    if (
      err instanceof
      multer.MulterError
    ) {

      if (
        err.code ===
        'LIMIT_FILE_SIZE'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Media size cannot exceed 50 MB'
        })
      }

      return res.status(400).json({
        success: false,
        message:
          err.message ||
          'Media upload failed'
      })
    }


    if (
      err?.message ===
      'Only image files are allowed'
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Only image files are allowed'
      })
    }


    if (
      err?.message ===
      'Only image and video files are allowed'
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Only image and video files are allowed'
      })
    }


    next(err)
  }
)


// ============================================================
// EXPORT
// ============================================================

export default router
