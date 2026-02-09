import app from './app.js'

/**
 * Local Server Entry Point
 * ------------------------
 * This file is used to start the backend server locally or in a traditional Node.js environment.
 * It imports the configured Express application from `app.js` and listens on a port.
 */

// Determine the port:
// 1. Try to use the PORT environment variable (common in hosting providers).
// 2. If not set, default to 8080.
const PORT = Number(process.env.PORT) || 8080

// Start the server
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`)
})
