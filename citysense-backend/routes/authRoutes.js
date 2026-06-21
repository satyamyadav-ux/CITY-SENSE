const express = require('express');
const router = express.Router();
const { register, login, logout, getMe, updateMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const requireDB = require('../middleware/requireDB');

router.post('/register', requireDB, register);
router.post('/login', requireDB, login);
router.post('/logout', logout); // no DB needed — just clears a cookie
router.get('/me', requireDB, protect, getMe);
router.patch('/me', requireDB, protect, updateMe);

module.exports = router;
