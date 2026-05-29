const { Pool } = require('pg');

let pool;

function createPool() {
  let connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  // Strip surrounding quotes if present (common when copying from .env)
  connectionString = connectionString.replace(/^['"]|['"]$/g, '');

  // Parse and rebuild the URL to ensure password is properly encoded
  try {
    const url = new URL(connectionString);
    if (url.password) {
      // Encode special characters in password
      url.password = encodeURIComponent(decodeURIComponent(url.password));
      connectionString = url.toString();
    }
  } catch (e) {
    console.warn('Could not parse DATABASE_URL, using as-is');
  }

  const ssl = process.env.NODE_ENV === 'production' || connectionString.includes('render') || connectionString.includes('railway')
    ? { rejectUnauthorized: false }
    : false;

  pool = new Pool({
    connectionString,
    ssl,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected pool error:', err.message);
  });
}

createPool();

async function initDB() {
  let client;
  try {
    client = await pool.connect();
    // Test the connection
    await client.query('SELECT 1');
    console.log('Database connected successfully');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        bio TEXT DEFAULT '',
        avatar_url TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS recipe_repos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT DEFAULT '',
        author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        forked_from_id INTEGER REFERENCES recipe_repos(id) ON DELETE SET NULL,
        default_branch_id INTEGER,
        thumbnail_url TEXT DEFAULT '',
        is_public BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS recipe_branches (
        id SERIAL PRIMARY KEY,
        repo_id INTEGER REFERENCES recipe_repos(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        description TEXT DEFAULT '',
        content_md TEXT DEFAULT '',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(repo_id, name)
      );

      CREATE TABLE IF NOT EXISTS pull_requests (
        id SERIAL PRIMARY KEY,
        repo_id INTEGER REFERENCES recipe_repos(id) ON DELETE CASCADE,
        source_branch_id INTEGER REFERENCES recipe_branches(id) ON DELETE CASCADE,
        target_branch_id INTEGER REFERENCES recipe_branches(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT DEFAULT '',
        status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'merged', 'closed')),
        author_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        merged_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS recipe_likes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        repo_id INTEGER REFERENCES recipe_repos(id) ON DELETE CASCADE,
        UNIQUE(user_id, repo_id)
      );

      CREATE TABLE IF NOT EXISTS recipe_comments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        repo_id INTEGER REFERENCES recipe_repos(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Add default_branch_id column if it doesn't exist (for existing tables)
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'recipe_repos' AND column_name = 'default_branch_id'
        ) THEN
          ALTER TABLE recipe_repos ADD COLUMN default_branch_id INTEGER;
        END IF;
      END $$;
    `);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database error:', err.message);
    throw err;
  } finally {
    if (client) client.release();
  }
}

module.exports = { pool, initDB };