# SCRCR Backend

This is the backend for the Senior Citizen Recreation Centre website, built with Express and MongoDB.

## Production URL

**https://scrcr-backend.vercel.app**

## Environment Variables

For the backend to function correctly on Vercel or locally, set the following environment variables:

- `MONGODB_URI`: Connection string for MongoDB Atlas.
  - Format: `mongodb+srv://<user>:<password>@cluster0.yyyqan4.mongodb.net/scrc?retryWrites=true&w=majority`
- `ADMIN_TOKEN`: A secure token for admin authentication.
- `ADMIN_USER`: Admin username.
- `ADMIN_PASS`: Admin password.

## API Endpoints

- **Health Check**: `GET /api/health` (Redirected from `/`)
- **Members**: `GET /api/members/:type`
- **News**: `GET /api/news`
- **Notices**: `GET /api/notices`
- **Gallery**: `GET /api/gallery`
- **Uploads**: `POST /api/upload` (Ephemeral on Vercel)

## Deployment

This project is deployed on Vercel as a Serverless Function.

- The entry point for Vercel is `api/index.js`.
- Static files (uploads) are stored in `/tmp` on Vercel and are not persistent. For production storage, consider integrating an external service like Cloudinary or AWS S3.
