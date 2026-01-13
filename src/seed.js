import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Member from './models/Member.js'

dotenv.config()
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/scrc'

const makeMembers = (count, type, labelPrefix, imgFolder) => {
  return Array.from({ length: count }, (_, i) => ({
    type,
    name: `${labelPrefix} ${i + 1}`,
    img: `/members/${imgFolder}/${i + 1}.jpg`,
    details: {
      phone: `+977-98${(10000000 + i).toString().slice(-8)}`,
      email: `${type}${i + 1}@example.com`,
      address: 'तिलोत्तमा-४, रुपन्देही',
      organization: 'SCRC',
      position: ['अध्यक्ष', 'उपाध्यक्ष', 'सचिव', 'सदस्य'][i % 4],
      since: `${2005 + (i % 20)}`
    }
  }))
}

async function run() {
  await mongoose.connect(MONGODB_URI)
  const count = await Member.countDocuments()
  if (count > 0) {
    console.log('Members already exist, skipping seed')
    process.exit(0)
  }
  const respected = makeMembers(30, 'Founding', 'सदस्य', 'respected')
  const lifetime = makeMembers(30, 'Lifetime', 'आजीवन सदस्य', 'lifetime')
  const helpers = makeMembers(20, 'helper', 'Helping Member', 'helpers')
  await Member.insertMany([...respected, ...lifetime, ...helpers])
  console.log('Seeded members')
  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
