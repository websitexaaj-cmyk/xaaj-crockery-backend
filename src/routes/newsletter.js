import { Router } from 'express'

import Subscriber from '../models/Subscriber.js'

import {
  asyncHandler
} from '../middleware/index.js'

import { sendEmail } from '../services/integrations.js'

const router = Router()

// ============================================================
// EMAIL VALIDATION
// ============================================================

const isValidEmail = email => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ============================================================
// SEND WELCOME EMAIL
// ============================================================

const sendWelcomeEmail = async email => {
  await sendEmail({
    to: email,

    subject: 'Welcome to XAAJ | Stories Crafted in Earth',

    html: `
      <div style="
        margin:0;
        padding:40px 20px;
        background:#f6f2eb;
        font-family:Arial,Helvetica,sans-serif;
        color:#292824;
      ">

        <div style="
          max-width:600px;
          margin:0 auto;
          background:#ffffff;
          border:1px solid #e8e1d7;
          border-radius:20px;
          overflow:hidden;
        ">

          <!-- CONTENT -->

          <div style="
            padding:50px 40px;
            text-align:center;
          ">

            <!-- MAIN HEADING -->

            <h1 style="
              margin:0 0 30px;
              font-family:Georgia,'Times New Roman',serif;
              font-size:36px;
              line-height:1.2;
              letter-spacing:0.5px;
              font-weight:400;
              color:#292824;
            ">
              WELCOME TO XAAJ
            </h1>


            <!-- OPENING -->

            <p style="
              margin:0 auto 26px;
              max-width:480px;
              font-family:Georgia,'Times New Roman',serif;
              font-size:19px;
              line-height:1.65;
              color:#4f4b45;
            ">
              Some things are simply beautiful.<br />
              Some become beautiful because of the memories they hold.
            </p>


            <!-- DIVIDER -->

            <div style="
              width:50px;
              height:1px;
              margin:32px auto;
              background:#d8d0c5;
            "></div>


            <!-- BRAND STORY -->

            <p style="
              margin:0 auto 26px;
              max-width:480px;
              font-size:15px;
              line-height:1.9;
              color:#68635c;
            ">
              At XAAJ, we are inspired by India — its colours, its craft,
              and the everyday rituals that bring us closer to home.
            </p>

            <p style="
              margin:0 auto 26px;
              max-width:480px;
              font-size:15px;
              line-height:1.9;
              color:#68635c;
            ">
              We create pieces for everyday rituals, shared moments,
              and the stories that unfold around them.
            </p>


            <!-- CLOSING THOUGHT -->

            <p style="
              margin:34px auto 0;
              max-width:470px;
              font-family:Georgia,'Times New Roman',serif;
              font-size:20px;
              line-height:1.6;
              font-weight:400;
              color:#292824;
            ">
              Because someday, these everyday moments become
              the stories we remember.
            </p>


            <!-- SIGN OFF -->

            <div style="
              margin-top:38px;
              padding-top:30px;
              border-top:1px solid #eee8df;
            ">

              <p style="
                margin:0 0 8px;
                font-size:14px;
                line-height:1.7;
                color:#68635c;
              ">
                Thank you for being here.
              </p>

              <p style="
                margin:0;
                font-size:14px;
                line-height:1.7;
                color:#68635c;
              ">
                We’re happy to be a part of your story.
              </p>

            </div>


            <!-- XAAJ SIGNATURE -->

            <div style="
              margin-top:36px;
            ">

              <div style="
                font-family:Georgia,'Times New Roman',serif;
                font-size:24px;
                line-height:1.2;
                letter-spacing:2px;
                color:#292824;
              ">
                XAAJ
              </div>

              <div style="
                margin-top:8px;
                font-size:9px;
                line-height:1.4;
                letter-spacing:3px;
                color:#8a847b;
              ">
                STORIES CRAFTED IN EARTH
              </div>

            </div>

          </div>


          <!-- FOOTER -->

          <div style="
            padding:22px 30px;
            text-align:center;
            background:#f8f5ef;
            border-top:1px solid #eee8df;
          ">

            <p style="
              margin:0;
              font-size:11px;
              line-height:1.7;
              color:#8a857d;
            ">
              You’re receiving this because you subscribed
              to XAAJ updates.
            </p>

          </div>

        </div>

      </div>
    `
  })
}

// ============================================================
// SUBSCRIBE
// ============================================================

router.post(
  '/subscribe',

  asyncHandler(async (req, res) => {

    // --------------------------------------------------------
    // GET EMAIL
    // --------------------------------------------------------

    const email = String(
      req.body.email || ''
    )
      .trim()
      .toLowerCase()

    // --------------------------------------------------------
    // VALIDATE EMAIL
    // --------------------------------------------------------

    if (!email) {
      return res.status(400).json({
        success: false,
        code: 'EMAIL_REQUIRED',
        message: 'Please enter your email address.'
      })
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: 'Please enter a valid email address.'
      })
    }

    // --------------------------------------------------------
    // CHECK EXISTING SUBSCRIBER
    // --------------------------------------------------------

    const existingSubscriber =
      await Subscriber.findOne({ email })

    if (existingSubscriber) {

      // ------------------------------------------------------
      // ALREADY SUBSCRIBED
      // ------------------------------------------------------

      if (existingSubscriber.isSubscribed) {
        return res.status(409).json({
          success: false,
          code: 'ALREADY_SUBSCRIBED',
          message:
            'You’re already subscribed. This email is already part of the XAAJ family.'
        })
      }

      // ------------------------------------------------------
      // RE-SUBSCRIBE
      // ------------------------------------------------------

      existingSubscriber.isSubscribed = true
      existingSubscriber.subscribedAt = new Date()
      existingSubscriber.unsubscribedAt = null

      await existingSubscriber.save()

      // Send welcome email again after re-subscription
      try {
        await sendWelcomeEmail(email)
      } catch (emailError) {
        console.error(
          '[Newsletter] Welcome email failed:',
          emailError
        )
      }

      return res.status(200).json({
        success: true,
        code: 'RESUBSCRIBED',
        message:
          'Welcome back to XAAJ. You’re subscribed again.'
      })
    }

    // --------------------------------------------------------
    // CREATE NEW SUBSCRIBER
    // --------------------------------------------------------

    const subscriber =
      await Subscriber.create({
        email,
        isSubscribed: true,
        subscribedAt: new Date()
      })

    // --------------------------------------------------------
    // SEND WELCOME EMAIL
    // --------------------------------------------------------

    try {

      await sendWelcomeEmail(email)

    } catch (emailError) {

      console.error(
        '[Newsletter] Welcome email failed:',
        emailError
      )

      // Remove subscription if welcome email
      // could not be sent successfully.
      await Subscriber.deleteOne({
        _id: subscriber._id
      })

      return res.status(500).json({
        success: false,
        code: 'WELCOME_EMAIL_FAILED',
        message:
          'We could not complete your subscription right now. Please try again.'
      })
    }

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    return res.status(201).json({
      success: true,
      code: 'SUBSCRIBED',
      message:
        'Welcome to XAAJ! You’re now part of our little circle.'
    })
  })
)

// ============================================================
// EXPORT ROUTER
// ============================================================

export default router