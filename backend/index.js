const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const axios = require('axios');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/moodrecipe'
});

// Basic hello endpoint
app.get('/', (req, res) => {
  res.send('MoodRecipe Backend Running');
});

// Middleware to validate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || 'secretkey', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// SCRUM-427: Initialize database schema function
async function initializeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS moods (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      tags TEXT[],
      instructions TEXT
    );

    CREATE TABLE IF NOT EXISTS recipe_mood_mappings (
      id SERIAL PRIMARY KEY,
      recipe_id INTEGER REFERENCES recipes(id),
      mood_id INTEGER REFERENCES moods(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      preferences JSONB
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      recipe_id INTEGER REFERENCES recipes(id),
      UNIQUE(user_id, recipe_id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      recipe_id INTEGER REFERENCES recipes(id),
      rating INTEGER CHECK (rating >= 1 AND rating <= 5),
      comments TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('Database schema initialized');
}

initializeSchema().catch(console.error);

// SCRUM-425: POST /api/mood - receive mood input and return recipes
app.post('/api/mood', async (req, res) => {
  const { moodName } = req.body;
  if (!moodName) return res.status(400).json({ error: 'Mood name is required' });

  try {
    const moodResult = await pool.query('SELECT id FROM moods WHERE name = $1', [moodName.toLowerCase()]);
    if (moodResult.rows.length === 0) {
      return res.status(404).json({ error: 'Mood not found' });
    }
    const moodId = moodResult.rows[0].id;

    // Find recipes for this mood
    const recipesResult = await pool.query(
      `SELECT recipes.* FROM recipes
      JOIN recipe_mood_mappings rmm ON recipes.id = rmm.recipe_id
      WHERE rmm.mood_id = $1`, [moodId]
    );

    res.json({ recipes: recipesResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SCRUM-426: GET /api/recipes/:id - detailed recipe view
app.get('/api/recipes/:id', async (req, res) => {
  const recipeId = parseInt(req.params.id, 10);
  if (isNaN(recipeId)) return res.status(400).json({ error: 'Invalid recipe ID' });
  try {
    const recipeResult = await pool.query('SELECT * FROM recipes WHERE id = $1', [recipeId]);
    if (recipeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    res.json(recipeResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SCRUM-428: User registration
app.post('/api/users/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const userExists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const insertUser = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, passwordHash]
    );

    res.status(201).json({ user: insertUser.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SCRUM-428: User login
app.post('/api/users/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const userResult = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = userResult.rows[0];

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = jwt.sign({ id: user.id, username: user.username }, process.env.ACCESS_TOKEN_SECRET || 'secretkey', { expiresIn: '1h' });
    res.json({ accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SCRUM-428: User profile management (get user profile)
app.get('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT id, username, preferences FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(userResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SCRUM-429: Favorites management
app.get('/api/users/:id/favorites', authenticateToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' });
  try {
    const favResult = await pool.query(
      `SELECT recipes.* FROM favorites
       JOIN recipes ON favorites.recipe_id = recipes.id
       WHERE favorites.user_id = $1`, [userId]
    );
    res.json({ favorites: favResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users/:id/favorites', authenticateToken, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { recipeId } = req.body;
  if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' });
  if (!recipeId) return res.status(400).json({ error: 'Recipe id required' });
  try {
    await pool.query('INSERT INTO favorites (user_id, recipe_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, recipeId]);
    res.status(201).json({ message: 'Added to favorites' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SCRUM-430: User feedback collection
app.post('/api/feedback', authenticateToken, async (req, res) => {
  const { recipeId, rating, comments } = req.body;
  if (!recipeId || !rating) return res.status(400).json({ error: 'Recipe ID and rating required' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1 to 5' });
  try {
    await pool.query(
      `INSERT INTO feedback (user_id, recipe_id, rating, comments) VALUES ($1, $2, $3, $4)`,
      [req.user.id, recipeId, rating, comments || '']
    );
    res.status(201).json({ message: 'Feedback recorded' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SCRUM-431: External Recipe API Adapter (Example with a generic API)
app.get('/api/external-recipes', async (req, res) => {
  try {
    const response = await axios.get('https://api.example.com/external-recipes');
    // Normalize the external API data to our recipe format
    const normalized = response.data.map(r => ({
      title: r.name,
      description: r.summary || '',
      tags: r.tags || [],
      instructions: r.instructions || ''
    }));
    res.json(normalized);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch external recipes' });
  }
});


app.listen(port, () => {
  console.log(`MoodRecipe backend listening at http://localhost:${port}`);
});
