import mongoose from 'mongoose'

const GalleryItemSchema = new mongoose.Schema({
  type: { type: String, enum: ['video', 'image'], default: 'video' },
  img: { type: String },
  videoUrl: { type: String },
  title: { type: String }
}, { timestamps: true })

export default mongoose.model('GalleryItem', GalleryItemSchema)

