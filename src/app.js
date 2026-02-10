import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import multer from 'multer'
import path from 'path'
import { Expo } from 'expo-server-sdk'
import nodemailer from 'nodemailer'
import { v2 as cloudinary } from 'cloudinary'
import stream from 'stream'
import webpush from 'web-push'

// Load environment variables from .env file into process.env
dotenv.config()

/**
 * Express Application Setup
 * -------------------------
 * Initialize the Express app and configure essential middleware.
 */
const app = express()

// Middleware: Enable Cross-Origin Resource Sharing (CORS)
// This allows the frontend (running on a different domain/port) to access this API.
app.use(cors())

// Middleware: Parse incoming JSON payloads
// This converts the JSON body of a request into a JavaScript object available at req.body.
app.use(express.json())

// --- Configuration & Environment Variables ---
// These values are sensitive and should be stored in a .env file, not hardcoded.
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme' // Simple token for admin auth
const ADMIN_USER = process.env.ADMIN_USER || 'vihaan'
const ADMIN_PASS = process.env.ADMIN_PASS || 'doramon12'
const EMAIL_USER = process.env.EMAIL_USER // For sending emails
const EMAIL_PASS = process.env.EMAIL_PASS
const EMAIL_TO = 'scrc.rupandehi@gmail.com' // Destination for contact forms

// VAPID Keys for Web Push
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BHKnV6TV1pUNOtf3yuesnZHzZegXRAMxlVJMtrSUgJKiTvPDwF17XP8pk0ZbSGWBrmYd6CQCuSZVnO-FUrA728c'
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'gwqBjLD3V9AfBKVygQNn4pTWtad3jpZWwlhRzU4CB4Y'
const VAPID_SUBJECT = 'mailto:scrc.rupandehi@gmail.com'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

// --- Cloudinary Configuration ---
// Used for storing images and videos in the cloud.
// It provides a CDN for fast delivery and on-the-fly transformations.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// Check for critical configuration
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials')
}

// --- Nodemailer Transporter ---
// Configured to send emails via Gmail.
// Note: Requires an App Password if using Gmail with 2FA.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
})

// --- Supabase Client ---
// Initialize the connection to the Supabase database (PostgreSQL).
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// --- Expo SDK ---
// Initialize the Expo SDK client for sending push notifications to mobile devices.
const expo = new Expo()

// --- File Upload Middleware (Multer) ---
// Configured to store uploaded files in memory (RAM) as a buffer.
// This allows us to process the file (upload to Cloudinary) without saving it to disk first.
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: Infinity, fieldSize: Infinity } // Allow large files
})

// --- Helper Functions ---

/**
 * mapId
 * -----
 * Transforms a database record to a frontend-friendly format.
 * 1. Renames 'id' to '_id' (common convention).
 * 2. Converts snake_case DB columns (e.g., video_url) to camelCase (videoUrl).
 * 
 * @param item - The raw database record.
 * @returns The transformed object.
 */
const mapId = (item) => {
  if (!item) return null
  const { id, published_at, video_url, media_url, ...rest } = item
  return { 
      _id: id, 
      ...(published_at && { publishedAt: published_at }),
      ...(video_url && { videoUrl: video_url }),
      ...(media_url && { mediaUrl: media_url }),
      ...rest 
  }
}

// Helper to map a list of items
const mapList = (items) => (items || []).map(mapId)

/**
 * toSnake
 * -------
 * Converts frontend camelCase properties back to snake_case for database insertion.
 * 
 * @param o - The input object with camelCase keys.
 * @returns A new object with snake_case keys.
 */
const toSnake = (o) => {
    const newO = {}
    for (const k in o) {
        if (k === 'videoUrl') newO.video_url = o[k]
        else if (k === 'mediaUrl') newO.media_url = o[k]
        else if (k === 'publishedAt') newO.published_at = o[k]
        else newO[k] = o[k]
    }
    return newO
}

/**
 * sendPushNotifications
 * ---------------------
 * Sends push notifications to all registered devices using Expo's push service (Mobile)
 * AND Web Push (Browser).
 * 
 * @param {string} title - Notification title.
 * @param {string} body - Notification body text.
 * @param {object} data - Additional JSON data to send with the notification.
 */
const sendPushNotifications = async (title, body, data = {}) => {
  try {
    // 1. Fetch all registered push tokens from the database
    const { data: tokens, error } = await supabase.from('push_tokens').select('token')
    if (error) {
      console.error('Error fetching push tokens:', error)
      return
    }

    if (!tokens || tokens.length === 0) return

    let expoMessages = []
    let webPushPromises = []

    for (const { token } of tokens) {
      // Check if it's a Web Push Subscription (JSON object)
      if (token.startsWith('{')) {
         try {
           const subscription = JSON.parse(token)
           const payload = JSON.stringify({ title, body, data })
           webPushPromises.push(
             webpush.sendNotification(subscription, payload).catch(err => {
               if (err.statusCode === 410 || err.statusCode === 404) {
                 // Subscription expired, remove from DB
                 console.log('Subscription expired, deleting...', token.substring(0, 20))
                 supabase.from('push_tokens').delete().eq('token', token).then(() => {})
               } else {
                 console.error('Web Push Error:', err)
               }
             })
           )
         } catch (e) {
           console.error('Failed to parse web push token', e)
         }
      } 
      // Check if it's an Expo Push Token
      else if (Expo.isExpoPushToken(token)) {
        expoMessages.push({
          to: token,
          sound: 'default',
          title,
          body,
          data,
        })
      }
    }

    // Send Expo Notifications
    if (expoMessages.length > 0) {
      let chunks = expo.chunkPushNotifications(expoMessages)
      for (let chunk of chunks) {
        try {
          let ticketChunk = await expo.sendPushNotificationsAsync(chunk)
          console.log('Expo Notification sent:', ticketChunk)
        } catch (error) {
          console.error(error)
        }
      }
    }

    // Send Web Push Notifications
    if (webPushPromises.length > 0) {
      await Promise.all(webPushPromises)
      console.log(`Sent ${webPushPromises.length} web push notifications`)
    }

  } catch (error) {
    console.error('Error sending push notifications:', error)
  }
}


// --- API Routes ---

/**
 * Health Check
 * ------------
 * Simple endpoint to verify the server is running.
 */
app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/', (_req, res) => res.redirect('/api/health'))

/**
 * Contact Form Submission
 * -----------------------
 * Receives contact details and sends an email to the admin.
 */
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body
    
    if (!EMAIL_USER || !EMAIL_PASS) {
      console.warn('Email credentials not configured')
      return res.status(500).json({ error: 'Email service not configured' })
    }

    const mailOptions = {
      from: EMAIL_USER,
      to: EMAIL_TO,
      subject: `New Contact Form Submission from ${name}`,
      text: `
        Name: ${name}
        Email: ${email}
        Phone: ${phone}
        
        Message:
        ${message}
      `
    }

    await transporter.sendMail(mailOptions)
    return res.json({ ok: true })
  } catch (e) {
    console.error('Email error:', e)
    return res.status(500).json({ error: 'Failed to send email' })
  }
})

/**
 * Membership Application Submission
 * ---------------------------------
 * Handles form data + file attachments (photo, citizenship).
 * Sends an email with attachments to the admin.
 */
app.post('/api/membership', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'citizenship', maxCount: 1 }]), async (req, res) => {
  try {
    const { fname, mname, lname, dob, citizenship_no, gender, address, phone, email } = req.body
    const files = req.files
    
    if (!EMAIL_USER || !EMAIL_PASS) {
      console.warn('Email credentials not configured')
      return res.status(500).json({ error: 'Email service not configured' })
    }

    // Process attachments for Nodemailer
    const attachments = []
    if (files['photo']) {
      attachments.push({
        filename: files['photo'][0].originalname,
        content: files['photo'][0].buffer
      })
    }
    if (files['citizenship']) {
      attachments.push({
        filename: files['citizenship'][0].originalname,
        content: files['citizenship'][0].buffer
      })
    }

    const mailOptions = {
      from: EMAIL_USER,
      to: EMAIL_TO,
      subject: `New Membership Application: ${fname} ${lname}`,
      text: `
        New Membership Application Received.
        
        Full Name: ${fname} ${mname || ''} ${lname}
        Date of Birth: ${dob}
        Citizenship No: ${citizenship_no}
        Gender: ${gender}
        Address: ${address}
        Phone: ${phone}
        Email: ${email}
        
        Please find attached documents.
      `,
      attachments
    }

    await transporter.sendMail(mailOptions)
    return res.json({ ok: true })
  } catch (e) {
    console.error('Membership email error:', e)
    return res.status(500).json({ error: 'Failed to submit application' })
  }
})


// --- Notifications ---

/**
 * Register Push Token
 * -------------------
 * Saves the Expo push token from the mobile app to the database.
 */
app.post('/api/notifications/register', async (req, res) => {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ error: 'Token is required' })

    // Check if token already exists to prevent duplicates
    const { data: existing } = await supabase
      .from('push_tokens')
      .select('id')
      .eq('token', token)
      .single()

    if (existing) {
      return res.json({ ok: true, message: 'Token already registered' })
    }

    // Insert new token
    const { error } = await supabase
      .from('push_tokens')
      .insert({ token })

    if (error) throw error
    return res.status(201).json({ ok: true })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to register token' })
  }
})


// --- Memories (Albums & Images) ---

/**
 * List Albums
 * -----------
 * Fetches all memory albums along with their cover image (the first image in the album).
 */
app.get('/api/memories/albums', async (_req, res) => {
  try {
    const { data: albums, error } = await supabase
      .from('memory_albums')
      .select(`
        id,
        name,
        memory_images (
          url
        )
      `)
      .order('name', { ascending: true })

    if (error) throw error

    // Transform data to include count and cover image
    const result = albums.map(album => ({
      name: album.name,
      count: album.memory_images.length,
      cover: album.memory_images.length > 0 ? album.memory_images[0].url : undefined
    }))
    
    return res.json(result)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to list albums' })
  }
})

/**
 * Create Album
 * ------------
 * Creates a new album (folder). Admin only.
 */
app.post('/api/memories/albums', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {}
    // Sanitize the album name to be safe for URLs/Folder paths
    const safe = (name || '').toString().replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
    if (!safe) return res.status(400).json({ error: 'Invalid name' })
    
    const { data, error } = await supabase
      .from('memory_albums')
      .insert({ name: safe })
      .select()
      .single()

    if (error) throw error
    
    return res.status(201).json({ name: data.name })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to create album' })
  }
})

/**
 * Delete Album
 * ------------
 * Deletes an album and all its associated images (cascade delete in DB, manual cleanup in storage).
 */
app.delete('/api/memories/albums/:album', requireAdmin, async (req, res) => {
  try {
    const albumName = (req.params.album || '').toString().trim()
    
    // 1. Get album ID
    const { data: album, error: albumErr } = await supabase
      .from('memory_albums')
      .select('id')
      .eq('name', albumName)
      .single()

    if (albumErr || !album) throw new Error('Album not found')

    // 2. Delete files from Supabase Storage (legacy support)
    // Note: Cloudinary images are deleted individually or by folder depending on setup, 
    // here we focus on the legacy bucket cleanup if used.
    const { data: files } = await supabase.storage.from('scrc-uploads').list(`memories/${albumName}`, { limit: 1000 })
    if (files && files.length > 0) {
        const paths = files.map(f => `memories/${albumName}/${f.name}`)
        await supabase.storage.from('scrc-uploads').remove(paths)
    }

    // 3. Delete from DB (Foreign key constraints should cascade delete images)
    const { error } = await supabase.from('memory_albums').delete().eq('id', album.id)
    if (error) throw error

    return res.json({ ok: true })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to delete album' })
  }
})

/**
 * List Album Images
 * -----------------
 * Fetches all images for a specific album.
 */
app.get('/api/memories/:album', async (req, res) => {
  try {
    const albumName = (req.params.album || '').toString().trim()
    
    // Find album by name
    const { data: album } = await supabase.from('memory_albums').select('id').eq('name', albumName).single()
    if (!album) return res.json([])

    // Fetch images linked to this album
    const { data: images, error } = await supabase
        .from('memory_images')
        .select('id, url, rank')
        .eq('album_id', album.id)
        .order('rank', { ascending: true })
        .order('created_at', { ascending: false })

    if (error) throw error
      
    return res.json(mapList(images))
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to list album images' })
  }
})

/**
 * Helper: uploadToCloudinary
 * --------------------------
 * Uploads a buffer to Cloudinary using a stream.
 */
const uploadToCloudinary = (buffer, folder) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: folder, resource_type: 'auto' },
            (error, result) => {
                if (error) return reject(error)
                resolve(result)
            }
        )
        const bufferStream = new stream.PassThrough()
        bufferStream.end(buffer)
        bufferStream.pipe(uploadStream)
    })
}

/**
 * Helper: getPublicIdFromUrl
 * --------------------------
 * Extracts the Cloudinary Public ID from a URL, which is needed for deletion.
 */
const getPublicIdFromUrl = (url) => {
    try {
        const parts = url.split('/')
        const uploadIndex = parts.indexOf('upload')
        if (uploadIndex === -1) return null
        
        // Skip 'v1234' version part if present
        let startIndex = uploadIndex + 1
        if (parts[startIndex] && parts[startIndex].startsWith('v')) {
            startIndex++
        }
        
        const publicIdParts = parts.slice(startIndex)
        // Remove extension from last part
        const lastIdx = publicIdParts.length - 1
        publicIdParts[lastIdx] = publicIdParts[lastIdx].split('.')[0]
        
        return publicIdParts.join('/')
    } catch (e) {
        return null
    }
}

/**
 * Upload Images to Album
 * ----------------------
 * Handles multiple file uploads to a specific album.
 */
app.post('/api/memories/:album/upload', requireAdmin, upload.array('images', 50), async (req, res) => {
  try {
    const albumName = (req.params.album || '').toString().trim()
    const files = req.files || []
    const uploadedUrls = []

    const { data: album } = await supabase.from('memory_albums').select('id').eq('name', albumName).single()
    if (!album) return res.status(404).json({ error: 'Album not found' })

    for (const file of files) {
        try {
            // Upload to Cloudinary
            const result = await uploadToCloudinary(file.buffer, `memories/${albumName}`)
            const url = result.secure_url
            uploadedUrls.push(url)
            
            // Insert record into DB
            await supabase.from('memory_images').insert({
                album_id: album.id,
                url: url
            })
        } catch (err) {
            console.error('Upload error for file:', file.originalname, err)
        }
    }
    return res.status(201).json({ uploaded: uploadedUrls })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Upload failed' })
  }
})

/**
 * Delete Image from Album
 * -----------------------
 * Deletes a specific image from DB and Cloudinary.
 */
app.delete('/api/memories/:album/:filename', requireAdmin, async (req, res) => {
    try {
        const albumName = (req.params.album || '').toString().trim()
        const filename = (req.params.filename || '').toString()
        
        // Find the image in DB to get the full URL
        const { data: images } = await supabase.from('memory_images').select('id, url')
        // Match by partial filename (simplistic approach)
        const toDelete = images.find(img => img.url.includes(filename))
        
        if (toDelete) {
            // Delete from DB
            await supabase.from('memory_images').delete().eq('id', toDelete.id)
            
            // Delete from Cloudinary
            if (toDelete.url.includes('cloudinary')) {
                const publicId = getPublicIdFromUrl(toDelete.url)
                if (publicId) {
                    await cloudinary.uploader.destroy(publicId)
                }
            } else {
                // Legacy Supabase Storage delete
                await supabase.storage.from('scrc-uploads').remove([`memories/${albumName}/${filename}`])
            }
        }

        return res.json({ ok: true })
    } catch (e) {
        console.error(e)
        return res.status(500).json({ error: 'Failed to delete image' })
    }
})


// --- Authentication ---

/**
 * Login
 * -----
 * Simple username/password check against environment variables.
 * Returns a static token on success.
 */
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {}
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ token: ADMIN_TOKEN })
  }
  return res.status(401).json({ error: 'Invalid credentials' })
})

/**
 * Admin Middleware
 * ----------------
 * Protects routes by checking for the 'x-admin-token' header.
 */
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token']
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// --- Members API ---

app.get('/api/members/:type', async (req, res) => {
  try {
    const { type } = req.params
    const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('type', type)
        .order('rank', { ascending: true })
        .order('name', { ascending: true })
    
    if (error) throw error
    return res.json(mapList(data))
  } catch (e) {
    res.json([])
  }
})

// Generic reorder endpoint for any resource
app.put('/api/:resource/reorder', requireAdmin, async (req, res) => {
  try {
    const { resource } = req.params
    const { updates } = req.body
    
    // Whitelist allowed resources to prevent SQL injection-like behavior
    const validResources = {
        'members': 'members',
        'news': 'news',
        'gallery': 'gallery_items',
        'notices': 'notices',
        'memories': 'memory_images'
    }
    
    const tableName = validResources[resource]
    if (!tableName) return res.status(400).json({ error: 'Invalid resource' })
    
    if (!updates || !Array.isArray(updates)) return res.status(400).json({ error: 'Invalid updates payload' })
    
    const validUpdates = updates.filter(u => u.id && typeof u.rank === 'number')
    if (validUpdates.length === 0) return res.json({ ok: true })

    // Execute updates in parallel
    const promises = validUpdates.map(u => 
      supabase.from(tableName).update({ rank: u.rank }).eq('id', u.id)
    )
    
    await Promise.all(promises)
    return res.json({ ok: true })
  } catch (e) {
    console.error('Reorder error:', e)
    res.status(500).json({ error: e.message || 'Failed to reorder' })
  }
})

app.post('/api/members', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from('members').insert(req.body).select().single()
    if (error) throw error
    return res.status(201).json(mapId(data))
  } catch (e) {
    res.status(400).json({ error: 'Failed to create member' })
  }
})

app.put('/api/members/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { _id, ...updateData } = req.body // Remove _id if present
    const { data, error } = await supabase
        .from('members')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()
        
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Not found' })
    return res.json(mapId(data))
  } catch (e) {
    res.status(400).json({ error: 'Failed to update member' })
  }
})

app.delete('/api/members/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { data, error } = await supabase.from('members').delete().eq('id', id).select().single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Not found' })
    return res.json(mapId(data))
  } catch (e) {
    res.status(400).json({ error: 'Failed to delete member' })
  }
})

// --- News API ---

app.get('/api/news', async (req, res) => {
  try {
    const active = req.query.active === 'true'
    const popup = req.query.popup === 'true'
    
    let query = supabase.from('news').select('*').order('rank', { ascending: true }).order('created_at', { ascending: false })
    
    if (active) query = query.eq('active', true)
    if (popup) query = query.eq('popup', true)
    
    const { data, error } = await query
    if (error) throw error
    return res.json(mapList(data))
  } catch {
    return res.json([])
  }
})

app.post('/api/news', requireAdmin, async (req, res) => {
  try {
    const payload = {
        ...toSnake(req.body),
        published_at: new Date(),
        active: req.body?.active ?? true,
        popup: req.body?.popup ?? false
    }
    const { data, error } = await supabase.from('news').insert(payload).select().single()
    if (error) throw error
    
    // Trigger push notification for new news
    sendPushNotifications('New Update', data.title || 'New item added', { type: 'news', id: data.id })

    return res.status(201).json(mapId(data))
  } catch {
    return res.status(400).json({ error: 'Failed to create news' })
  }
})

app.put('/api/news/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { _id, ...updateData } = req.body
    const { data, error } = await supabase.from('news').update(toSnake(updateData)).eq('id', id).select().single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Not found' })
    return res.json(mapId(data))
  } catch {
    return res.status(400).json({ error: 'Failed to update news' })
  }
})

app.delete('/api/news/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { data, error } = await supabase.from('news').delete().eq('id', id).select().single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Not found' })
    return res.json(mapId(data))
  } catch {
    return res.status(400).json({ error: 'Failed to delete news' })
  }
})

// --- Gallery API ---

app.get('/api/gallery', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('gallery_items').select('*').order('rank', { ascending: true }).order('created_at', { ascending: false })
    if (error) throw error
    return res.json(mapList(data))
  } catch {
    return res.json([])
  }
})

app.post('/api/gallery', requireAdmin, async (req, res) => {
  try {
    const payload = {
        ...toSnake(req.body),
        type: req.body?.type || 'image',
        img: req.body?.url || req.body?.img,
        title: req.body?.title,
        video_url: req.body?.videoUrl
    }
    // Clean up properties to avoid DB errors
    if (payload.img === undefined) delete payload.img
    if (payload.video_url === undefined) delete payload.video_url
    if (payload.title === undefined) delete payload.title
    delete payload.url
    delete payload.videoUrl

    const { data, error } = await supabase.from('gallery_items').insert(payload).select().single()
    if (error) {
        console.error('Supabase Gallery Insert Error:', error)
        throw error
    }

    // Trigger push notification for new gallery item
    sendPushNotifications('New Gallery Item', data.title || 'New item added to gallery', { type: 'gallery', id: data.id })

    return res.status(201).json(mapId(data))
  } catch (e) {
    console.error('Gallery create error:', e)
    return res.status(400).json({ error: 'Failed to create gallery item' })
  }
})

app.put('/api/gallery/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { _id, ...updateData } = req.body
    const { data, error } = await supabase.from('gallery_items').update(toSnake(updateData)).eq('id', id).select().single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Not found' })
    return res.json(mapId(data))
  } catch {
    return res.status(400).json({ error: 'Failed to update gallery item' })
  }
})

app.delete('/api/gallery/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { data, error } = await supabase.from('gallery_items').delete().eq('id', id).select().single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Not found' })
    return res.json(mapId(data))
  } catch {
    return res.status(400).json({ error: 'Failed to delete gallery item' })
  }
})

// --- Notices API ---

app.get('/api/notices', async (req, res) => {
  try {
    const active = req.query.active === 'true'
    const popup = req.query.popup === 'true'
    
    let query = supabase.from('notices').select('*').order('rank', { ascending: true }).order('created_at', { ascending: false })
    if (active) query = query.eq('active', true)
    if (popup) query = query.eq('popup', true)
    
    const { data, error } = await query
    if (error) throw error
    return res.json(mapList(data))
  } catch {
    return res.json([])
  }
})

app.post('/api/notices', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from('notices').insert(toSnake(req.body)).select().single()
    if (error) throw error

    // Trigger push notification
    sendPushNotifications('New Notice', data.title || 'Important Notice', { type: 'notice', id: data.id })

    return res.status(201).json(mapId(data))
  } catch {
    return res.status(400).json({ error: 'Failed to create notice' })
  }
})

app.put('/api/notices/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { _id, ...updateData } = req.body
    
    const { data, error } = await supabase.from('notices').update(toSnake(updateData)).eq('id', id).select().single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Not found' })
    return res.json(mapId(data))
  } catch {
    return res.status(400).json({ error: 'Failed to update notice' })
  }
})

app.delete('/api/notices/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { data, error } = await supabase.from('notices').delete().eq('id', id).select().single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Not found' })
    return res.json(mapId(data))
  } catch {
    return res.status(400).json({ error: 'Failed to delete notice' })
  }
})

// --- General Upload Endpoint ---

/**
 * Single File Upload
 * ------------------
 * Generic endpoint to upload a file to Cloudinary and get a URL.
 * Useful for profile pictures, etc.
 */
app.post('/api/upload', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    
    const result = await uploadToCloudinary(req.file.buffer, 'uploads')
    return res.status(201).json({ url: result.secure_url })
  } catch (e) {
    console.error('Upload failed:', e)
    return res.status(500).json({ error: 'Upload failed' })
  }
})

export default app
