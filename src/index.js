import app from './app.js'
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://sthaushab4_db_user:<password>@cluster0.yyyqan4.mongodb.net/scrc'
const PORT = Number(process.env.PORT) || 8080
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`)
})
