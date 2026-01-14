-- Migration to create memory albums and images tables

CREATE TABLE IF NOT EXISTS memory_albums (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_images (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    album_id UUID REFERENCES memory_albums(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    rank INTEGER DEFAULT 0,
    caption TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS (optional, but good practice if you ever use client-side Supabase)
ALTER TABLE memory_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_images ENABLE ROW LEVEL SECURITY;

-- Add policies for public read access
CREATE POLICY "Allow public read on memory_albums" ON memory_albums FOR SELECT USING (true);
CREATE POLICY "Allow public read on memory_images" ON memory_images FOR SELECT USING (true);
