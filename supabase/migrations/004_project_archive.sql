-- Add archived column to projects table
ALTER TABLE projects ADD COLUMN archived boolean NOT NULL DEFAULT false;
