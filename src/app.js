import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import Member from './models/Member.js'
import News from './models/News.js'
import GalleryItem from './models/GalleryItem.js'
import Notice from './models/Notice.js'

dotenv.config()
const app = express()
app.use(cors())
app.use(express.json())

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/scrc'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme'
const ADMIN_USER = process.env.ADMIN_USER || 'vihaan'
const ADMIN_PASS = process.env.ADMIN_PASS || 'doramon12'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '../public')

const isVercel = !!process.env.VERCEL
const memDir = isVercel ? path.join('/tmp', 'memories') : path.join(publicDir, 'memories')
const uploadsDir = isVercel ? path.join('/tmp', 'uploads') : path.join(publicDir, 'uploads')

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}
if (!isVercel) ensureDir(publicDir)
ensureDir(memDir)
ensureDir(uploadsDir)

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const album = (req.params.album || '').toString()
    const safe = album.replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
    const target = path.join(memDir, safe)
    ensureDir(target)
    cb(null, target)
  },
  filename: (_req, file, cb) => {
    const ts = Date.now()
    const ext = path.extname(file.originalname)
    cb(null, `${ts}${ext}`)
  }
})
const upload = multer({ storage })

const generalStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(uploadsDir)
    cb(null, uploadsDir)
  },
  filename: (_req, file, cb) => {
    const ts = Date.now()
    const ext = path.extname(file.originalname)
    cb(null, `${ts}${ext}`)
  }
})
const generalUpload = multer({ storage: generalStorage })

mongoose.connect(MONGODB_URI).then(() => {
  console.log('MongoDB connected')
}).catch(err => {
  console.error('MongoDB connection error', err)
  // In serverless, avoid exiting; just return health errors if needed
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/static', express.static(publicDir))
app.use('/static/uploads', express.static(uploadsDir))
app.use('/static/memories', express.static(memDir))

app.get('/api/memories', (_req, res) => {
  try {
    if (!fs.existsSync(memDir)) return res.json([])
    const files = fs.readdirSync(memDir)
      .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
      .map(f => `/static/memories/${f}`)
    return res.json(files)
  } catch {
    return res.status(500).json({ error: 'Failed to list memories' })
  }
})
app.get('/api/memories/albums', (_req, res) => {
  try {
    ensureDir(memDir)
    const albums = fs.readdirSync(memDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const dir = path.join(memDir, d.name)
        const imgs = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f)) : []
        const cover = imgs[0] ? `/static/memories/${d.name}/${imgs[0]}` : undefined
        return { name: d.name, count: imgs.length, cover }
      })
    return res.json(albums)
  } catch {
    return res.status(500).json({ error: 'Failed to list albums' })
  }
})
app.post('/api/memories/albums', requireAdmin, (req, res) => {
  try {
    const { name } = req.body || {}
    const safe = (name || '').toString().replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
    if (!safe) return res.status(400).json({ error: 'Invalid name' })
    const dir = path.join(memDir, safe)
    ensureDir(dir)
    return res.status(201).json({ name: safe })
  } catch {
    return res.status(500).json({ error: 'Failed to create album' })
  }
})
app.delete('/api/memories/albums/:album', requireAdmin, (req, res) => {
  try {
    const album = (req.params.album || '').toString()
    const safe = album.replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
    const dir = path.join(memDir, safe)
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Not found' })
    fs.rmSync(dir, { recursive: true, force: true })
    return res.json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Failed to delete album' })
  }
})
app.get('/api/memories/:album', (req, res) => {
  try {
    const album = (req.params.album || '').toString()
    const safe = album.replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
    const dir = path.join(memDir, safe)
    if (!fs.existsSync(dir)) return res.json([])
    const files = fs.readdirSync(dir)
      .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
      .map(f => `/static/memories/${safe}/${f}`)
    return res.json(files)
  } catch {
    return res.status(500).json({ error: 'Failed to list album images' })
  }
})
app.post('/api/memories/:album/upload', requireAdmin, upload.array('images', 12), (req, res) => {
  try {
    const album = (req.params.album || '').toString().replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
    const files = (req.files || []).map(f => `/static/memories/${album}/${path.basename(f.path)}`)
    return res.status(201).json({ uploaded: files })
  } catch {
    return res.status(500).json({ error: 'Upload failed' })
  }
})
app.delete('/api/memories/:album/:filename', requireAdmin, (req, res) => {
  try {
    const album = (req.params.album || '').toString().replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
    const filename = (req.params.filename || '').toString()
    const filePath = path.join(memDir, album, filename)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' })
    fs.rmSync(filePath, { force: true })
    return res.json({ ok: true })
  } catch {
    return res.status(500).json({ error: 'Failed to delete image' })
  }
})

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {}
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ token: ADMIN_TOKEN })
  }
  return res.status(401).json({ error: 'Invalid credentials' })
})

app.get('/api/members/:type', async (req, res) => {
  try {
    const { type } = req.params
    const items = await Member.find({ type }).sort({ name: 1 }).lean()
    return res.json(items)
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch members' })
  }
})

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token']
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

app.post('/api/members', requireAdmin, async (req, res) => {
  try {
    const created = await Member.create(req.body)
    return res.status(201).json(created)
  } catch (e) {
    res.status(400).json({ error: 'Failed to create member' })
  }
})

app.put('/api/members/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updated = await Member.findByIdAndUpdate(id, req.body, { new: true }).lean()
    if (!updated) return res.status(404).json({ error: 'Not found' })
    return res.json(updated)
  } catch (e) {
    res.status(400).json({ error: 'Failed to update member' })
  }
})

app.delete('/api/members/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const removed = await Member.findByIdAndDelete(id).lean()
    if (!removed) return res.status(404).json({ error: 'Not found' })
    return res.json(removed)
  } catch (e) {
    res.status(400).json({ error: 'Failed to delete member' })
  }
})

app.get('/api/news', async (req, res) => {
  try {
    const active = req.query.active === 'true'
    const popup = req.query.popup === 'true'
    const q = {}
    if (active) q.active = true
    if (popup) q.popup = true
    const items = await News.find(q).sort({ createdAt: -1 }).lean()
    return res.json(items)
  } catch {
    return res.status(500).json({ error: 'Failed to fetch news' })
  }
})
app.post('/api/news', requireAdmin, async (req, res) => {
  try {
    const created = await News.create({ ...req.body, publishedAt: new Date(), active: req.body?.active ?? true, popup: req.body?.popup ?? false })
    return res.status(201).json(created)
  } catch {
    return res.status(400).json({ error: 'Failed to create news' })
  }
})
app.put('/api/news/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updated = await News.findByIdAndUpdate(id, req.body, { new: true }).lean()
    if (!updated) return res.status(404).json({ error: 'Not found' })
    return res.json(updated)
  } catch {
    return res.status(400).json({ error: 'Failed to update news' })
  }
})
app.delete('/api/news/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const removed = await News.findByIdAndDelete(id).lean()
    if (!removed) return res.status(404).json({ error: 'Not found' })
    return res.json(removed)
  } catch {
    return res.status(400).json({ error: 'Failed to delete news' })
  }
})

app.get('/api/gallery', async (_req, res) => {
  try {
    const items = await GalleryItem.find().sort({ createdAt: -1 }).lean()
    return res.json(items)
  } catch {
    return res.status(500).json({ error: 'Failed to fetch gallery' })
  }
})
app.post('/api/gallery', requireAdmin, async (req, res) => {
  try {
    const created = await GalleryItem.create(req.body)
    return res.status(201).json(created)
  } catch {
    return res.status(400).json({ error: 'Failed to create gallery item' })
  }
})
app.put('/api/gallery/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updated = await GalleryItem.findByIdAndUpdate(id, req.body, { new: true }).lean()
    if (!updated) return res.status(404).json({ error: 'Not found' })
    return res.json(updated)
  } catch {
    return res.status(400).json({ error: 'Failed to update gallery item' })
  }
})
app.delete('/api/gallery/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const removed = await GalleryItem.findByIdAndDelete(id).lean()
    if (!removed) return res.status(404).json({ error: 'Not found' })
    return res.json(removed)
  } catch {
    return res.status(400).json({ error: 'Failed to delete gallery item' })
  }
})

app.get('/api/notices', async (req, res) => {
  try {
    const active = req.query.active === 'true'
    const popup = req.query.popup === 'true'
    const q = {}
    if (active) q.active = true
    if (popup) q.popup = true
    const items = await Notice.find(q).sort({ createdAt: -1 }).lean()
    return res.json(items)
  } catch {
    return res.status(500).json({ error: 'Failed to fetch notices' })
  }
})
app.post('/api/notices', requireAdmin, async (req, res) => {
  try {
    const created = await Notice.create(req.body)
    return res.status(201).json(created)
  } catch {
    return res.status(400).json({ error: 'Failed to create notice' })
  }
})
app.put('/api/notices/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updated = await Notice.findByIdAndUpdate(id, req.body, { new: true }).lean()
    if (!updated) return res.status(404).json({ error: 'Not found' })
    return res.json(updated)
  } catch {
    return res.status(400).json({ error: 'Failed to update notice' })
  }
})
app.delete('/api/notices/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const removed = await Notice.findByIdAndDelete(id).lean()
    if (!removed) return res.status(404).json({ error: 'Not found' })
    return res.json(removed)
  } catch {
    return res.status(400).json({ error: 'Failed to delete notice' })
  }
})
app.post('/api/upload', requireAdmin, generalUpload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const fileUrl = `/static/uploads/${path.basename(req.file.path)}`
    return res.status(201).json({ url: fileUrl })
  } catch {
    return res.status(500).json({ error: 'Upload failed' })
  }
})

export default app
