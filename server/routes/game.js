const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Per-game score ceilings, used to reject obviously spoofed submissions.
const GAME_LIMITS = {
  six_hitter: 60,     // 10 balls, 6 runs max per ball
  dino_run: 100000    // distance/time based; generous ceiling
};

function resolveGame(value) {
  return Object.prototype.hasOwnProperty.call(GAME_LIMITS, value) ? value : 'six_hitter';
}

router.get('/leaderboard', (req, res) => {
  const game = resolveGame(req.query.game);

  const rows = db.prepare(`
    SELECT m.member_id, m.name, MAX(g.score) AS bestScore
    FROM game_scores g
    JOIN members m ON m.member_id = g.member_id
    WHERE g.game = ?
    GROUP BY g.member_id
    ORDER BY bestScore DESC
    LIMIT 10
  `).all(game);

  res.json(rows.map(r => ({
    memberId: r.member_id,
    memberName: r.name,
    bestScore: r.bestScore
  })));
});

router.post('/score', (req, res) => {
  const game = resolveGame(req.body.game);
  const score = parseInt(req.body.score, 10);
  if (!Number.isInteger(score) || score < 0 || score > GAME_LIMITS[game]) {
    return res.status(400).json({ error: 'Invalid score' });
  }

  db.prepare('INSERT INTO game_scores (member_id, score, game) VALUES (?, ?, ?)').run(req.user.memberId, score, game);

  const best = db.prepare('SELECT MAX(score) AS bestScore FROM game_scores WHERE member_id = ? AND game = ?').get(req.user.memberId, game).bestScore;

  res.status(201).json({ message: 'Score saved', bestScore: best });
});

module.exports = router;
