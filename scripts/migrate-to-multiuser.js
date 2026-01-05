// Migration script to create admin user and assign existing aircraft
// Run this ONCE after deploying the multi-user update

const bcrypt = require('bcrypt');
const db = require('../database/db');
const config = require('../config');

async function migrate() {
  console.log('Starting migration to multi-user system...\n');

  try {
    // Get admin credentials from environment variables
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';

    console.log(`Admin email: ${adminEmail}`);
    console.log('Admin password: (from ADMIN_PASSWORD env var)\n');

    // Check if user already exists
    const existingUser = await db.getUserByEmail(adminEmail);

    let userId;
    if (existingUser) {
      console.log('✓ Admin user already exists');
      userId = existingUser.id;
    } else {
      // Create admin user
      console.log('Creating admin user...');
      const passwordHash = await bcrypt.hash(adminPassword, config.auth.bcryptRounds);
      const user = await db.createUser(adminEmail, passwordHash);
      userId = user.id;
      console.log(`✓ Admin user created: ${user.email} (ID: ${user.id})`);
    }

    // Ensure aircraft exist in database
    console.log('\nEnsuring aircraft exist in database...');
    for (const aircraft of config.aircraft) {
      await db.upsertAircraft(aircraft.icao24, aircraft.registration, aircraft.type);
      console.log(`✓ Aircraft: ${aircraft.registration} (${aircraft.icao24})`);
    }

    // Assign aircraft to admin user
    console.log('\nAssigning aircraft to admin user...');
    for (const aircraft of config.aircraft) {
      const success = await db.addAircraftToUser(userId, aircraft.icao24);
      if (success) {
        console.log(`✓ Added ${aircraft.registration} to admin fleet`);
      } else {
        console.log(`  (${aircraft.registration} already in admin fleet)`);
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log(`\nYou can now login with:`);
    console.log(`  Email: ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(`\n⚠️  IMPORTANT: Change your password after first login!\n`);

    await db.closePool();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    await db.closePool();
    process.exit(1);
  }
}

// Run migration
migrate();
