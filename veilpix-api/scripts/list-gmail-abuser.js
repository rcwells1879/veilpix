/**
 * List all Gmail accounts from the Berlin abuser
 */
const { createClerkClient } = require('@clerk/backend');
require('dotenv').config();

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function getGmailAbusers() {
  const { data: allUsers } = await clerkClient.users.getUserList({ limit: 100, orderBy: '-created_at' });

  console.log('=== GMAIL ACCOUNTS FROM BERLIN ABUSER ===\n');

  const gmailAccounts = [];

  for (const user of allUsers) {
    const email = user.emailAddresses[0]?.emailAddress || '';
    if (!email.endsWith('@gmail.com')) continue;

    const { data: userSessions } = await clerkClient.sessions.getSessionList({ userId: user.id });

    for (const s of userSessions) {
      const a = s.latestActivity;
      if (a && a.country === 'DE' && a.browserName === 'Edge' && a.deviceType === 'Windows') {
        gmailAccounts.push({
          email,
          created: new Date(user.createdAt).toISOString(),
          ip: a.ipAddress,
          city: a.city
        });
        break;
      }
    }
  }

  // Sort by created date
  gmailAccounts.sort((a, b) => new Date(b.created) - new Date(a.created));

  for (const acc of gmailAccounts) {
    console.log('Email:', acc.email);
    console.log('Created:', acc.created);
    console.log('IP:', acc.ip);
    console.log('City:', acc.city);

    // Extract local part and analyze
    const localPart = acc.email.split('@')[0];
    const dotCount = (localPart.match(/\./g) || []).length;
    const normalized = localPart.replace(/\./g, '');
    console.log('Dots:', dotCount, '| Normalized:', normalized);
    console.log('---');
  }

  console.log('\n=== ANALYSIS ===');
  console.log('Total Gmail accounts:', gmailAccounts.length);

  // Group by normalized email to see patterns
  const normalizedGroups = {};
  for (const acc of gmailAccounts) {
    const normalized = acc.email.split('@')[0].replace(/\./g, '');
    if (!normalizedGroups[normalized]) normalizedGroups[normalized] = [];
    normalizedGroups[normalized].push(acc.email);
  }

  console.log('\nNormalized email groups (same underlying Gmail):');
  for (const [norm, emails] of Object.entries(normalizedGroups)) {
    if (emails.length > 1) {
      console.log(`  ${norm}@gmail.com: ${emails.length} variations`);
      emails.forEach(e => console.log(`    - ${e}`));
    }
  }
}

getGmailAbusers().catch(console.error);
