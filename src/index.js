import app from './app.js'

const PORT = Number(process.env.PORT) || 8080

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`)
})
