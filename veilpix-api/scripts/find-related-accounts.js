/**
 * Find all Clerk accounts that share IP addresses or device fingerprints
 * with a known abuser account.
 *
 * Usage: node scripts/find-related-accounts.js
 *
 * BEFORE RUNNING: Update targetIps and targetFingerprints below
 * with values from investigate-user.js output
 */

const { createClerkClient } = require('@clerk/backend');
require('dotenv').config();

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// ============================================================
// UPDATE THESE VALUES from investigate-user.js output
// ============================================================
const targetIps = [
  // Paste IPs here, e.g.:
  // "188.27.xxx.xxx"
];

const targetFingerprints = [
  // Paste fingerprints here, e.g.:
  // "Chrome|desktop|Germany"
];

const targetCountries = [
  "Germany"  // Known location of abuser
];
// ============================================================

async function findRelatedAccounts() {
  if (targetIps.length === 0 && targetFingerprints.length === 0) {
    console.log('ERROR: No target IPs or fingerprints specified.');
    console.log('Run investigate-user.js first and copy the values here.');
    process.exit(1);
  }

  console.log('Searching for accounts matching:');
  console.log('  Target IPs:', targetIps.length ? targetIps : '(none)');
  console.log('  Target Fingerprints:', targetFingerprints.length ? targetFingerprints : '(none)');
  console.log('  Target Countries:', targetCountries);
  console.log('');

  const relatedAccounts = [];
  let offset = 0;
  const limit = 100;
  let scannedUsers = 0;
  let scannedSessions = 0;

  while (true) {
    const { data: users, totalCount } = await clerkClient.users.getUserList({
      offset,
      limit,
      orderBy: '-created_at'
    });

    if (offset === 0) {
      console.log(`Total users to scan: ${totalCount}\n`);
    }

    for (const user of users) {
      scannedUsers++;
      process.stdout.write(`\rScanning user ${scannedUsers}/${totalCount}...`);

      try {
        const { data: sessions } = await clerkClient.sessions.getSessionList({
          userId: user.id
        });

        for (const session of sessions) {
          scannedSessions++;
          const activity = session.latestActivity;
          if (!activity) continue;

          const fingerprint = `${activity.browserName || 'unknown'}|${activity.deviceType || 'unknown'}|${activity.country || 'unknown'}`;
          const matchesIp = targetIps.includes(activity.ipAddress);
          const matchesFingerprint = targetFingerprints.includes(fingerprint);
          const matchesCountry = targetCountries.includes(activity.country);

          // Match on IP, or fingerprint + country
          if (matchesIp || (matchesFingerprint && matchesCountry)) {
            relatedAccounts.push({
              userId: user.id,
              email: user.emailAddresses[0]?.emailAddress || 'no-email',
              ip: activity.ipAddress,
              city: activity.city,
              country: activity.country,
              browser: `${activity.browserName || 'unknown'} ${activity.browserVersion || ''}`.trim(),
              deviceType: activity.deviceType,
              fingerprint,
              matchType: matchesIp ? 'IP_MATCH' : 'FINGERPRINT_MATCH',
              banned: user.banned,
              locked: user.locked,
              created: new Date(user.createdAt).toISOString(),
              lastSignIn: user.lastSignInAt ? new Date(user.lastSignInAt).toISOString() : null
            });
            break; // Found match, move to next user
          }
        }
      } catch (err) {
        // Skip users with session fetch errors
      }
    }

    if (users.length < limit) break;
    offset += limit;
  }

  // Dedupe by userId
  const unique = [...new Map(relatedAccounts.map(a => [a.userId, a])).values()];
  unique.sort((a, b) => new Date(b.created) - new Date(a.created));

  console.log('\n\n' + '='.repeat(70));
  console.log(`RELATED ACCOUNTS FOUND: ${unique.length}`);
  console.log('='.repeat(70));

  for (const account of unique) {
    console.log(`\n${account.email}`);
    console.log(`  User ID:     ${account.userId}`);
    console.log(`  IP:          ${account.ip}`);
    console.log(`  Location:    ${account.city}, ${account.country}`);
    console.log(`  Browser:     ${account.browser}`);
    console.log(`  Device:      ${account.deviceType}`);
    console.log(`  Match Type:  ${account.matchType}`);
    console.log(`  Banned:      ${account.banned ? 'YES' : 'No'}`);
    console.log(`  Created:     ${account.created}`);
    console.log(`  Last Sign-in: ${account.lastSignIn || 'Never'}`);
  }

  // Output for ban script
  console.log('\n' + '='.repeat(70));
  console.log('USER IDs FOR BAN SCRIPT:');
  console.log('='.repeat(70));
  const userIdsToBan = unique.filter(a => !a.banned).map(a => a.userId);
  console.log(`\nconst userIdsToBan = ${JSON.stringify(userIdsToBan, null, 2)};`);

  console.log(`\n\nSummary:`);
  console.log(`  Users scanned:    ${scannedUsers}`);
  console.log(`  Sessions checked: ${scannedSessions}`);
  console.log(`  Related accounts: ${unique.length}`);
  console.log(`  Already banned:   ${unique.filter(a => a.banned).length}`);
  console.log(`  To be banned:     ${userIdsToBan.length}`);

  return unique;
}

findRelatedAccounts()
  .then(() => {
    console.log('\nSearch complete.');
    process.exit(0);
  })
  .catch(err => {
    console.error('\nError:', err.message);
    process.exit(1);
  });
