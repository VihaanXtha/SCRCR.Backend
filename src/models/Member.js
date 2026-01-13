import mongoose from 'mongoose'

const DetailsSchema = new mongoose.Schema({
  phone: String,
  email: String,
  permanentAddress: String,
  temporaryAddress: String,
  address: String,
  organization: String,
  position: String,
  since: String,
  father: String,
  mother: String,
  grandfather: String,
  grandmother: String,
  dateOfBirth: String,
  occupation: String,
  donationAmount: String,
  spouse: String
}, { _id: false })

const MemberSchema = new mongoose.Schema({
  type: { type: String, enum: ['respected', 'lifetime', 'helper', 'Founding', 'Lifetime', 'Senior-Citizen', 'donation'], required: true },
  name: { type: String, required: true },
  img: { type: String, required: true },
  details: DetailsSchema
}, { timestamps: true })

export default mongoose.model('Member', MemberSchema)
