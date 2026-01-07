/**
 * Ban multiple Clerk users by ID
 *
 * Usage: node scripts/ban-users.js
 *
 * BEFORE RUNNING: Update userIdsToBan below
 * with values from find-related-accounts.js output
 */

const { createClerkClient } = require('@clerk/backend');
require('dotenv').config();

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// ============================================================
// UPDATE THESE VALUES from find-related-accounts.js output
// ============================================================
const userIdsToBan = [
  // Paste user IDs here, e.g.:
  // "user_2abc123...",
  // "user_2def456...",
];

const banReason = 'Burner account abuse - multiple accounts from same IP/device';
const abuseCluster = 'germany-burner-2024';
// ============================================================

async function banUsers() {
  if (userIdsToBan.length === 0) {
    console.log('ERROR: No user IDs specified.');
    console.log('Run find-related-accounts.js first and copy the user IDs here.');
    process.exit(1);
  }

  console.log(`Preparing to ban ${userIdsToBan.length} users...`);
  console.log(`Reason: ${banReason}`);
  console.log('');

  const results = {
    banned: [],
    alreadyBanned: [],
    failed: []
  };

  for (const userId of userIdsToBan) {
    process.stdout.write(`Processing ${userId}... `);

    try {
      // Check current status
      const user = await clerkClient.users.getUser(userId);

      if (user.banned) {
        console.log('already banned');
        results.alreadyBanned.push(userId);
        continue;
      }

      // Add metadata before banning (for audit trail)
      await clerkClient.users.updateUserMetadata(userId, {
        privateMetadata: {
          banned_reason: banReason,
          banned_at: new Date().toISOString(),
          abuse_cluster: abuseCluster,
          original_email: user.emailAddresses[0]?.emailAddress
        }
      });

      // Ban the user - this revokes all sessions
      await clerkClient.users.banUser(userId);
      console.log('BANNED');
      results.banned.push({
        userId,
        email: user.emailAddresses[0]?.emailAddress
      });

    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      results.failed.push({ userId, error: err.message });
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('BAN OPERATION COMPLETE');
  console.log('='.repeat(50));
  console.log(`\nSuccessfully banned: ${results.banned.length}`);
  for (const u of results.banned) {
    console.log(`  ${u.email} (${u.userId})`);
  }

  if (results.alreadyBanned.length) {
    console.log(`\nAlready banned: ${results.alreadyBanned.length}`);
    for (const id of results.alreadyBanned) {
      console.log(`  ${id}`);
    }
  }

  if (results.failed.length) {
    console.log(`\nFailed: ${results.failed.length}`);
    for (const f of results.failed) {
      console.log(`  ${f.userId}: ${f.error}`);
    }
  }

  return results;
}

banUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\nFatal error:', err.message);
    process.exit(1);
  });
