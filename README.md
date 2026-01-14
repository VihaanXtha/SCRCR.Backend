# SCRCR Backend

This is the backend for the Senior Citizen Recreation Centre website, built with Express and Supabase.

## Production URL

**https://scrcr-backend.vercel.app**

## Environment Variables

For the backend to function correctly on Vercel, set the following environment variables in your Vercel Project Settings:

- `SUPABASE_URL`: Your Supabase Project URL.
- `SUPABASE_SERVICE_KEY`: Your Supabase Service Role Key (Keep this secret!).
- `ADMIN_TOKEN`: A secure token for admin authentication (shared with frontend).
- `ADMIN_USER`: Admin username.
- `ADMIN_PASS`: Admin password.

## API Endpoints

- **Health Check**: `GET /api/health` (Redirected from `/`)
- **Members**: `GET /api/members/:type`
- **News**: `GET /api/news`
- **Notices**: `GET /api/notices`
- **Gallery**: `GET /api/gallery`
- **Uploads**: `POST /api/upload` (Stored in Supabase Storage `scrc-uploads` bucket)

## Deployment

This project is deployed on Vercel as a Serverless Function.

- The entry point for Vercel is `api/index.js`.
- Database: Supabase (PostgreSQL).
- File Storage: Supabase Storage.
