const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const MAX_SCORE = 60; // 10 balls, 6 runs max per ball

router.get('/leaderboard', (req, res) => {
  const rows = db.prepare(`
    SELECT m.member_id, m.name, MAX(g.score) AS bestScore
    FROM game_scores g
    JOIN members m ON m.member_id = g.member_id
    GROUP BY g.member_id
    ORDER BY bestScore DESC
    LIMIT 10
  `).all();

  res.json(rows.map(r => ({
    memberId: r.member_id,
    memberName: r.name,
    bestScore: r.bestScore
  })));
});

router.post('/score', (req, res) => {
  const score = parseInt(req.body.score, 10);
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return res.status(400).json({ error: 'Invalid score' });
  }

  db.prepare('INSERT INTO game_scores (member_id, score) VALUES (?, ?)').run(req.user.memberId, score);

  const best = db.prepare('SELECT MAX(score) AS bestScore FROM game_scores WHERE member_id = ?').get(req.user.memberId).bestScore;

  res.status(201).json({ message: 'Score saved', bestScore: best });
});

module.exports = router;
