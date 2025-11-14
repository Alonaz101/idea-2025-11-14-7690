# Project Overview

This project implements a mood-based recipe recommendation system with frontend and backend components.

## Features implemented from Jira issues:

- **SCRUM-425**: Mood Input & Recipe Recommendation Engine
  - POST /api/mood endpoint to receive mood input and return matching recipes

- **SCRUM-426**: Recipe Browsing & Detailed View
  - GET /api/recipes/{id} to retrieve detailed recipe data

- **SCRUM-427**: Backend API and Database Setup
  - PostgreSQL database schema for moods, recipes, users, favorites, feedback
  - Express REST API with endpoints for core functionality

- **SCRUM-428**: User Authentication and Profiles
  - User registration and login using bcrypt for password hashing and JWT for authentication
  - User profile retrieval

- **SCRUM-429**: Favorites Management
  - Endpoints to add and retrieve favorite recipes per user

- **SCRUM-430**: User Feedback Collection and Recommendation Tuning
  - Endpoint to collect user ratings and comments on recipes

- **SCRUM-431**: External Recipe API Integration
  - Adapter endpoint to pull and normalize recipes from an external API

## Future and Post-MVP features

- SCRUM-432 AI-Driven Mood Detection
- SCRUM-433 Social Sharing and Mood Journaling Features

## Repository Structure

- `backend/` - backend Node.js code with Express and PostgreSQL setup
- `docs/` - project documentation

## How to Run Backend

1. Set environment variable `DATABASE_URL` for postgres connection
2. Set `ACCESS_TOKEN_SECRET` for JWT signing
3. Run `npm install` in backend folder
4. Start backend with `npm start`

The backend exposes restful API endpoints corresponding to user auth, mood input, recipe fetching, favorites management, feedback, and external recipe integration.

---

*Generated based on Jira issues SCRUM-425 to SCRUM-433.*
