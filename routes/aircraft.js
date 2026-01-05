// Aircraft Management Routes

const express = require('express');
const db = require('../database/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/user/aircraft
 * Get all aircraft for the current user
 */
router.get('/aircraft', async (req, res) => {
  try {
    const aircraft = await db.getUserAircraft(req.session.userId);
    res.json(aircraft);
  } catch (error) {
    console.error('Error getting user aircraft:', error);
    res.status(500).json({ error: 'Failed to get aircraft' });
  }
});

/**
 * POST /api/user/aircraft
 * Add an aircraft to the user's fleet
 */
router.post('/aircraft', async (req, res) => {
  try {
    const { icao24, registration, aircraft_type } = req.body;

    // Validation
    if (!icao24) {
      return res.status(400).json({ error: 'ICAO24 hex code is required' });
    }

    // Validate ICAO24 format (6 hex characters)
    if (!/^[a-fA-F0-9]{6}$/.test(icao24)) {
      return res.status(400).json({ error: 'Invalid ICAO24 format (must be 6 hex characters)' });
    }

    const icao24Lower = icao24.toLowerCase();

    // Check if aircraft exists in database, if not create it
    const existingAircraft = await db.getCurrentState(icao24Lower);
    if (!existingAircraft) {
      // Create aircraft entry
      await db.upsertAircraft(
        icao24Lower,
        registration || icao24Lower.toUpperCase(),
        aircraft_type || 'Unknown'
      );
    }

    // Add aircraft to user's fleet
    const success = await db.addAircraftToUser(req.session.userId, icao24Lower);

    if (success) {
      // Get the updated aircraft info
      const aircraft = await db.getUserAircraft(req.session.userId);
      const addedAircraft = aircraft.find(a => a.icao24 === icao24Lower);

      res.status(201).json(addedAircraft || { icao24: icao24Lower, registration, aircraft_type });
    } else {
      res.status(500).json({ error: 'Failed to add aircraft' });
    }

  } catch (error) {
    console.error('Error adding aircraft:', error);
    res.status(500).json({ error: 'Failed to add aircraft' });
  }
});

/**
 * DELETE /api/user/aircraft/:icao24
 * Remove an aircraft from the user's fleet
 */
router.delete('/aircraft/:icao24', async (req, res) => {
  try {
    const { icao24 } = req.params;

    const success = await db.removeAircraftFromUser(req.session.userId, icao24);

    if (success) {
      res.json({ message: 'Aircraft removed successfully' });
    } else {
      res.status(404).json({ error: 'Aircraft not found in your fleet' });
    }

  } catch (error) {
    console.error('Error removing aircraft:', error);
    res.status(500).json({ error: 'Failed to remove aircraft' });
  }
});

module.exports = router;
