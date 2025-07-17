/**
 * Rutas de autenticación
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { optionalAuth } = require('../middleware/expressAuth');

// Mostrar página de login
router.get('/login', authController.showLogin);

// Iniciar proceso de autorización OAuth
router.get('/authorize', authController.redirectToAuth);

// Callback de autorización de ML
router.get('/callback', authController.handleCallback);

// Cerrar sesión
router.get('/logout', authController.logout);

// Estado de autenticación (API)
router.get('/status', optionalAuth, authController.getAuthStatus);

module.exports = router;