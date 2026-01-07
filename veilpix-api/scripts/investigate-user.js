/**
 * Investigate a Clerk user by email address
 * Extracts IP addresses, location, and device fingerprints from session data
 *
 * Usage: node scripts/investigate-user.js <email>
 * Example: node scripts/investigate-user.js jomefar.it14@gmail.com
 */

const { createClerkClient } = require('@clerk/backend');
require('dotenv').config();

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function investigateUser(email) {
  console.log(`\nInvestigating: ${email}`);
  console.log('='.repeat(60));

  // Find user by email
  const { data: users } = await clerkClient.users.getUserList({
    emailAddress: [email]
  });

  if (!users.length) {
    console.log('\nUser not found with email:', email);
    return null;
  }

  const user = users[0];

  console.log('\n--- USER DETAILS ---');
  console.log('User ID:       ', user.id);
  console.log('Email:         ', user.emailAddresses[0]?.emailAddress);
  console.log('Created:       ', new Date(user.createdAt).toISOString());
  console.log('Last Sign-in:  ', user.lastSignInAt ? new Date(user.lastSignInAt).toISOString() : 'Never');
  console.log('Banned:        ', user.banned ? 'YES' : 'No');
  console.log('Locked:        ', user.locked ? 'YES' : 'No');

  // Get all sessions with activity data
  const { data: sessions } = await clerkClient.sessions.getSessionList({
    userId: user.id
  });

  console.log(`\n--- SESSION ACTIVITY (${sessions.length} sessions) ---`);

  const ips = new Set();
  const locations = new Map();
  const fingerprints = new Set();
  const deviceDetails = [];

  for (const session of sessions) {
    const activity = session.latestActivity;
    if (activity) {
      const ip = activity.ipAddress || 'unknown';
      const city = activity.city || 'unknown';
      const country = activity.country || 'unknown';
      const browser = activity.browserName || 'unknown';
      const browserVersion = activity.browserVersion || '';
      const deviceType = activity.deviceType || 'unknown';
      const isMobile = activity.isMobile;

      ips.add(ip);
      locations.set(ip, `${city}, ${country}`);
      fingerprints.add(`${browser}|${deviceType}|${country}`);

      deviceDetails.push({
        sessionId: session.id,
        status: session.status,
        ip,
        location: `${city}, ${country}`,
        browser: `${browser} ${browserVersion}`.trim(),
        deviceType,
        isMobile,
        lastActive: new Date(session.lastActiveAt).toISOString()
      });

      console.log(`\nSession: ${session.id}`);
      console.log(`  Status:      ${session.status}`);
      console.log(`  IP Address:  ${ip}`);
      console.log(`  Location:    ${city}, ${country}`);
      console.log(`  Browser:     ${browser} ${browserVersion}`);
      console.log(`  Device:      ${deviceType}${isMobile ? ' (mobile)' : ''}`);
      console.log(`  Last Active: ${new Date(session.lastActiveAt).toISOString()}`);
    }
  }

  // Summary for cross-referencing
  const summary = {
    userId: user.id,
    email: user.emailAddresses[0]?.emailAddress,
    ips: [...ips],
    locations: Object.fromEntries(locations),
    fingerprints: [...fingerprints],
    banned: user.banned,
    created: new Date(user.createdAt).toISOString()
  };

  console.log('\n--- SUMMARY FOR CROSS-REFERENCING ---');
  console.log('\nUnique IPs:');
  for (const ip of ips) {
    console.log(`  ${ip} -> ${locations.get(ip)}`);
  }

  console.log('\nDevice Fingerprints:');
  for (const fp of fingerprints) {
    console.log(`  ${fp}`);
  }

  console.log('\n--- COPY/PASTE FOR find-related-accounts.js ---');
  console.log(`\nconst targetIps = ${JSON.stringify([...ips], null, 2)};`);
  console.log(`\nconst targetFingerprints = ${JSON.stringify([...fingerprints], null, 2)};`);

  return summary;
}

// Main execution
const email = process.argv[2] || 'jomefar.it14@gmail.com';
investigateUser(email)
  .then(result => {
    if (result) {
      console.log('\n' + '='.repeat(60));
      console.log('Investigation complete.');
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('\nError:', err.message);
    if (err.message.includes('Invalid API Key')) {
      console.error('Make sure CLERK_SECRET_KEY is set in your .env file');
    }
    process.exit(1);
  });
