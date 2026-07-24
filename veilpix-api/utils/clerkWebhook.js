async function handleClerkWebhookEvent(event, userStore) {
    if (event?.type !== 'user.deleted') {
        return { handled: false };
    }

    const clerkUserId = event.data?.id;
    if (!clerkUserId || typeof clerkUserId !== 'string') {
        throw new Error('Clerk user.deleted webhook is missing a user ID');
    }

    const result = await userStore.markClerkUserDeleted(clerkUserId);

    return {
        handled: true,
        clerkUserId,
        userFound: Boolean(result?.found)
    };
}

module.exports = {
    handleClerkWebhookEvent
};
