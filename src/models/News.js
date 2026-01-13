import mongoose from 'mongoose'

const NewsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  text: { type: String, required: true },
  img: { type: String, required: true },
  publishedAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true },
  popup: { type: Boolean, default: false }
}, { timestamps: true })

export default mongoose.model('News', NewsSchema)
