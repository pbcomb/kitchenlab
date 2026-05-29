const express = require('express');
const { pool } = require('../server/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user profile
router.get('/:username', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, bio, avatar_url, created_at FROM users WHERE username = $1',
      [req.params.username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get user's repos
    const repos = await pool.query(`
      SELECT r.*, db.name as default_branch_name,
        (SELECT COUNT(*) FROM recipe_likes WHERE repo_id = r.id) as like_count,
        (SELECT COUNT(*) FROM recipe_repos WHERE forked_from_id = r.id) as fork_count
      FROM recipe_repos r
      LEFT JOIN recipe_branches db ON r.default_branch_id = db.id
      WHERE r.author_id = $1
      ORDER BY r.created_at DESC
    `, [user.id]);

    // Count stars received across all repos
    const starsReceived = await pool.query(
      'SELECT COUNT(*) as count FROM recipe_likes l JOIN recipe_repos r ON l.repo_id = r.id WHERE r.author_id = $1',
      [user.id]
    );
    user.star_count = parseInt(starsReceived.rows[0].count);

    res.json({ user, repos: repos.rows });
  } catch (err) {
    console.error('Get user profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
router.put('/:username', authenticateToken, async (req, res) => {
  try {
    if (req.user.username !== req.params.username) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { bio, avatar_url } = req.body;
    const result = await pool.query(
      'UPDATE users SET bio = COALESCE($1, bio), avatar_url = COALESCE($2, avatar_url) WHERE username = $3 RETURNING id, username, email, bio, avatar_url, created_at',
      [bio, avatar_url, req.params.username]
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's liked repos
router.get('/:username/likes', async (req, res) => {
  try {
    const user = await pool.query('SELECT id FROM users WHERE username = $1', [req.params.username]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const result = await pool.query(`
      SELECT r.*, u.username as author_name, db.name as default_branch_name,
        (SELECT COUNT(*) FROM recipe_likes WHERE repo_id = r.id) as like_count,
        (SELECT COUNT(*) FROM recipe_repos WHERE forked_from_id = r.id) as fork_count
      FROM recipe_likes l
      JOIN recipe_repos r ON l.repo_id = r.id
      JOIN users u ON r.author_id = u.id
      LEFT JOIN recipe_branches db ON r.default_branch_id = db.id
      WHERE l.user_id = $1
      ORDER BY l.created_at DESC
    `, [user.rows[0].id]);

    res.json({ repos: result.rows });
  } catch (err) {
    console.error('Get user likes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;