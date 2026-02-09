/**
 * Vercel Serverless Function Entry Point
 * --------------------------------------
 * This file serves as the entry point when deploying the backend to Vercel.
 * Vercel's serverless functions expect a default export that is an Express app 
 * (or a request handler function).
 * 
 * We import the configured 'app' from src/app.js and export it.
 * This allows the same code to run both locally (via src/index.js) and on Vercel.
 */
import app from '../src/app.js'

export default app
