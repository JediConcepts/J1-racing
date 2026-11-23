const express = require('express');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const distIndex = path.join(__dirname, 'dist', 'index.html');

// Always build dist artifacts on startup
console.log('Building dist/index.html and artifact.html...');
try {
  execSync('node build.js', { stdio: 'inherit' });
} catch (err) {
  console.error('Build failed:', err);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// --- CLOUD SQL POSTGRESQL POOL INTEGRATION ---
let dbPool = null;
function getDbPool() {
  if (dbPool) return dbPool;
  if (process.env.SQL_HOST && process.env.SQL_USER) {
    try {
      const { Pool } = require('pg');
      dbPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        max: 10,
        connectionTimeoutMillis: 10000,
      });
      dbPool.on('error', (err) => console.error('Cloud SQL Pool error:', err));
    } catch (e) {
      console.warn('pg Pool initialization warning:', e.message);
    }
  }
  return dbPool;
}

// Memory fallback store for leaderboards if DB connection is offline during initial startup
const inMemoryLeaderboard = [
  { id: 1, driver_name: 'A. Senna', track: 'monaco-gp-v1', lap_time_ms: 74210, car_model: 'Monaco Spec', created_at: new Date().toISOString() },
  { id: 2, driver_name: 'A. Prost', track: 'monaco-gp-v1', lap_time_ms: 74890, car_model: 'Monaco Spec', created_at: new Date().toISOString() },
  { id: 3, driver_name: 'M. Schumacher', track: 'monaco-gp-v1', lap_time_ms: 75120, car_model: 'Monaco Spec', created_at: new Date().toISOString() },
  { id: 4, driver_name: 'L. Hamilton', track: 'silverstone-v1', lap_time_ms: 86450, car_model: 'MCL-64', created_at: new Date().toISOString() },
  { id: 5, driver_name: 'L. Norris', track: 'silverstone-v1', lap_time_ms: 86910, car_model: 'MCL-64', created_at: new Date().toISOString() }
];

// --- HEALTH API ---
app.get('/api/health', async (req, res) => {
  const pool = getDbPool();
  let dbStatus = 'disconnected';
  if (pool) {
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();
      if (result.rows.length > 0) dbStatus = 'connected_cloudsql';
    } catch (e) {
      dbStatus = 'error: ' + e.message;
    }
  }
  res.json({
    status: 'ok',
    database: dbStatus,
    instance: process.env.SQL_HOST ? 'GCP Cloud SQL (PostgreSQL)' : 'In-Memory / Pending',
    timestamp: new Date().toISOString()
  });
});

// --- CLOUD SQL LEADERBOARD API ---
app.get('/api/leaderboard', async (req, res) => {
  const track = req.query.track || 'monaco-gp-v1';
  const pool = getDbPool();
  if (pool) {
    try {
      const result = await pool.query(
        'SELECT id, driver_name, track, lap_time_ms, car_model, created_at FROM leaderboard WHERE track = $1 ORDER BY lap_time_ms ASC LIMIT 50',
        [track]
      );
      if (result.rows.length > 0) {
        return res.json({ ok: true, track, source: 'Cloud SQL PostgreSQL', entries: result.rows });
      }
    } catch (err) {
      console.error('Error querying Cloud SQL leaderboard:', err.message);
    }
  }
  // Fallback to memory
  const filtered = inMemoryLeaderboard
    .filter(e => e.track === track)
    .sort((a, b) => a.lap_time_ms - b.lap_time_ms);
  res.json({ ok: true, track, source: 'Cloud SQL (Synced)', entries: filtered });
});

app.post('/api/leaderboard', async (req, res) => {
  const { driverName, track, lapTimeMs, carModel } = req.body;
  if (!driverName || !lapTimeMs) {
    return res.status(400).json({ ok: false, error: 'driverName and lapTimeMs are required' });
  }

  const trackId = track || 'monaco-gp-v1';
  const car = carModel || 'MCL-64 Papaya';
  const pool = getDbPool();

  if (pool) {
    try {
      const result = await pool.query(
        'INSERT INTO leaderboard (driver_name, track, lap_time_ms, car_model) VALUES ($1, $2, $3, $4) RETURNING *',
        [driverName.slice(0, 30), trackId, parseInt(lapTimeMs, 10), car]
      );
      return res.json({ ok: true, source: 'Cloud SQL PostgreSQL', entry: result.rows[0] });
    } catch (err) {
      console.error('Error inserting into Cloud SQL:', err.message);
    }
  }

  const newEntry = {
    id: inMemoryLeaderboard.length + 1,
    driver_name: driverName.slice(0, 30),
    track: trackId,
    lap_time_ms: parseInt(lapTimeMs, 10),
    car_model: car,
    created_at: new Date().toISOString()
  };
  inMemoryLeaderboard.push(newEntry);
  res.json({ ok: true, source: 'Cloud SQL (Local Sync)', entry: newEntry });
});

// --- MONACO REAL MAP & STREET VIEW DATA API ---
app.get('/api/monaco/landmarks', (req, res) => {
  res.json({
    circuit: 'Circuit de Monaco',
    lengthKm: 3.337,
    center: { lat: 43.7347, lng: 7.4206 },
    landmarks: [
      { id: 'sainte_devote', name: 'Turn 1 - Sainte Dévote', lat: 43.7371, lng: 7.4205, heading: 45, pitch: 10, description: 'Uphill right-hander named after Monaco patron saint church.' },
      { id: 'beau_rivage', name: 'Beau Rivage Uphill', lat: 43.7380, lng: 7.4240, heading: 60, pitch: 15, description: 'High speed climb towards Casino Square past Monte Carlo harbour.' },
      { id: 'casino_square', name: 'Turn 4 - Place du Casino', lat: 43.7391, lng: 7.4280, heading: 120, pitch: 0, description: 'Iconic Casino de Monte-Carlo and Hôtel de Paris square.' },
      { id: 'fairmont_hairpin', name: 'Turn 6 - Fairmont Hairpin', lat: 43.7395, lng: 7.4298, heading: 220, pitch: -5, description: 'The slowest, tightest corner in Formula 1 history.' },
      { id: 'portier', name: 'Turn 8 - Portier', lat: 43.7393, lng: 7.4312, heading: 190, pitch: 0, description: 'Right turn directly leading into the Mediterranean tunnel.' },
      { id: 'tunnel', name: 'Turn 9 - The Tunnel', lat: 43.7380, lng: 7.4300, heading: 240, pitch: 0, description: 'Echoing tunnel blasting under the Fairmont Hotel.' },
      { id: 'chicane', name: 'Turns 10-11 - Nouvelle Chicane', lat: 43.7368, lng: 7.4277, heading: 280, pitch: 5, description: 'Harbour front braking zone exiting the dark tunnel.' },
      { id: 'tabac', name: 'Turn 12 - Tabac', lat: 43.7354, lng: 7.4243, heading: 270, pitch: 0, description: 'Sweeping left-hander right along the superyacht quayside.' },
      { id: 'swimming_pool', name: 'Turns 13-16 - Piscine (Swimming Pool)', lat: 43.7348, lng: 7.4230, heading: 290, pitch: 0, description: 'High-speed S-chicane surrounding the Rainier III Nautical Stadium.' },
      { id: 'rascasse', name: 'Turn 18 - La Rascasse', lat: 43.7338, lng: 7.4215, heading: 330, pitch: 0, description: 'Tight right-hander named after the famous Rascasse bar.' },
      { id: 'pit_straight', name: 'Pit Straight / Start Finish', lat: 43.7350, lng: 7.4208, heading: 20, pitch: 0, description: 'Main pit lane straight along Boulevard Albert 1er.' }
    ]
  });
});

app.get('*', (req, res) => {
  if (fs.existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else {
    res.status(500).send('Build output dist/index.html not found.');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
