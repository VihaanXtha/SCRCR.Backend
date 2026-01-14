
import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import multer from 'multer'
import path from 'path'

dotenv.config()
const app = express()
app.use(cors())
app.use(express.json())

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme'
const ADMIN_USER = process.env.ADMIN_USER || 'vihaan'
const ADMIN_PASS = process.env.ADMIN_PASS || 'doramon12'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Memory storage for uploads
const upload = multer({ storage: multer.memoryStorage() })

// Helper to map id to _id and snake_case to camelCase for frontend compatibility
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

const mapList = (items) => (items || []).map(mapId)

// Helper to map camelCase to snake_case for Supabase
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

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/', (_req, res) => res.redirect('/api/health'))

// Static files are no longer served from local FS in production/Supabase mode
// But we keep the route for backward compatibility if any static assets remain? 
// No, we should rely on public URLs.

// --- Memories (Storage) ---

app.get('/api/memories', async (_req, res) => {
  try {
    const { data, error } = await supabase.storage.from('scrc-uploads').list('memories')
    if (error) throw error
    
    // Filter for files (files have metadata)
    const files = data
      .filter(item => item.metadata)
      .map(item => supabase.storage.from('scrc-uploads').getPublicUrl(`memories/${item.name}`).data.publicUrl)
      
    return res.json(files)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to list memories' })
  }
})

app.get('/api/memories/albums', async (_req, res) => {
  try {
    const { data, error } = await supabase.storage.from('scrc-uploads').list('memories')
    if (error) throw error

    // Folders usually don't have metadata (or specific mimetype logic)
    // In Supabase Storage, folders are just prefixes. But list() returns them as items.
    const folders = data.filter(item => !item.metadata)

    const albums = await Promise.all(folders.map(async (folder) => {
      const { data: files } = await supabase.storage.from('scrc-uploads').list(`memories/${folder.name}`, { limit: 1 })
      const images = files ? files.filter(f => f.metadata) : []
      // We need count. list() has limit.
      // To get full count we might need a larger limit or another approach. 
      // For now, let's just list with a higher limit or accept partial count if many files.
      // Actually, let's list up to 1000.
      const { data: allFiles } = await supabase.storage.from('scrc-uploads').list(`memories/${folder.name}`, { limit: 1000 })
      const count = allFiles ? allFiles.filter(f => f.metadata).length : 0
      
      const cover = images.length > 0 
        ? supabase.storage.from('scrc-uploads').getPublicUrl(`memories/${folder.name}/${images[0].name}`).data.publicUrl
        : undefined
        
      return { name: folder.name, count, cover }
    }))
    
    return res.json(albums)
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Failed to list albums' })
  }
})

app.post('/api/memories/albums', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {}
    const safe = (name || '').toString().replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
    if (!safe) return res.status(400).json({ error: 'Invalid name' })
    
    // Create a placeholder file to establish the folder
    const { error } = await supabase.storage.from('scrc-uploads').upload(`memories/${safe}/.keep`, '')
    if (error) throw error
    
    return res.status(201).json({ name: safe })
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create album' })
  }
})

app.delete('/api/memories/albums/:album', requireAdmin, async (req, res) => {
  try {
    const album = (req.params.album || '').toString().replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
    
    // List all files in album
    const { data: files } = await supabase.storage.from('scrc-uploads').list(`memories/${album}`, { limit: 1000 })
    if (files && files.length > 0) {
        const paths = files.map(f => `memories/${album}/${f.name}`)
        await supabase.storage.from('scrc-uploads').remove(paths)
    }
    // Remove the folder itself? Supabase removes folder if empty.
    return res.json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete album' })
  }
})

app.get('/api/memories/:album', async (req, res) => {
  try {
    const album = (req.params.album || '').toString().replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
    const { data, error } = await supabase.storage.from('scrc-uploads').list(`memories/${album}`, { limit: 1000 })
    if (error) throw error
    
    const files = data
      .filter(f => f.metadata) // Only files
      .filter(f => f.name !== '.keep') // Ignore keep file
      .map(f => supabase.storage.from('scrc-uploads').getPublicUrl(`memories/${album}/${f.name}`).data.publicUrl)
      
    return res.json(files)
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list album images' })
  }
})

app.post('/api/memories/:album/upload', requireAdmin, upload.array('images', 12), async (req, res) => {
  try {
    const album = (req.params.album || '').toString().replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
    const files = req.files || []
    const uploadedUrls = []

    for (const file of files) {
        const ext = path.extname(file.originalname)
        const name = `${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`
        const { error } = await supabase.storage.from('scrc-uploads').upload(`memories/${album}/${name}`, file.buffer, {
            contentType: file.mimetype
        })
        if (!error) {
            uploadedUrls.push(supabase.storage.from('scrc-uploads').getPublicUrl(`memories/${album}/${name}`).data.publicUrl)
        }
    }
    return res.status(201).json({ uploaded: uploadedUrls })
  } catch (e) {
    return res.status(500).json({ error: 'Upload failed' })
  }
})

app.delete('/api/memories/:album/:filename', requireAdmin, async (req, res) => {
    // This might be tricky because filename in URL is the full filename, but we need to match it.
    // The frontend sends the filename.
    // Note: Frontend likely sends just the filename, not the full URL.
    // Let's check original code: 
    // const filename = (req.params.filename || '').toString()
    // const filePath = path.join(memDir, album, filename)
    // So yes, it's just the filename.
    try {
        const album = (req.params.album || '').toString().replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
        const filename = (req.params.filename || '').toString()
        const { error } = await supabase.storage.from('scrc-uploads').remove([`memories/${album}/${filename}`])
        if (error) throw error
        return res.json({ ok: true })
    } catch {
        return res.status(500).json({ error: 'Failed to delete image' })
    }
})


// --- Auth ---

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {}
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ token: ADMIN_TOKEN })
  }
  return res.status(401).json({ error: 'Invalid credentials' })
})

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token']
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// --- Members ---

app.get('/api/members/:type', async (req, res) => {
  try {
    const { type } = req.params
    const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('type', type)
        .order('name', { ascending: true })
    
    if (error) throw error
    return res.json(mapList(data))
  } catch (e) {
    res.json([])
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
    const { _id, ...updateData } = req.body // Remove _id if present in body
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

// --- News ---

app.get('/api/news', async (req, res) => {
  try {
    const active = req.query.active === 'true'
    const popup = req.query.popup === 'true'
    
    let query = supabase.from('news').select('*').order('created_at', { ascending: false })
    
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

// --- Gallery ---

app.get('/api/gallery', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('gallery_items').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return res.json(mapList(data))
  } catch {
    return res.json([])
  }
})

app.post('/api/gallery', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from('gallery_items').insert(toSnake(req.body)).select().single()
    if (error) throw error
    return res.status(201).json(mapId(data))
  } catch {
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

// --- Notices ---

app.get('/api/notices', async (req, res) => {
  try {
    const active = req.query.active === 'true'
    const popup = req.query.popup === 'true'
    
    let query = supabase.from('notices').select('*').order('created_at', { ascending: false })
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

// --- General Upload ---

app.post('/api/upload', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    
    const ext = path.extname(req.file.originalname)
    const name = `uploads/${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`
    
    const { error } = await supabase.storage.from('scrc-uploads').upload(name, req.file.buffer, {
        contentType: req.file.mimetype
    })
    
    if (error) throw error
    
    const url = supabase.storage.from('scrc-uploads').getPublicUrl(name).data.publicUrl
    return res.status(201).json({ url })
  } catch (e) {
    return res.status(500).json({ error: 'Upload failed' })
  }
})

export default app
