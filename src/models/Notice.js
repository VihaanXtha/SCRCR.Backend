import mongoose from 'mongoose'

const NoticeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  text: { type: String, required: true },
  mediaUrl: { type: String },
  active: { type: Boolean, default: true },
  popup: { type: Boolean, default: false }
}, { timestamps: true })

export default mongoose.model('Notice', NoticeSchema)
