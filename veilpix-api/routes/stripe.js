const express = require('express');
const Stripe = require('stripe');
const { getUser, requireAuth, requireAllowedEmail } = require('../middleware/auth');
const { db } = require('../utils/database');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create or get Stripe customer
router.post('/customer', getUser, requireAuth, requireAllowedEmail, async (req, res) => {
    try {
        const { user } = req;

        // Check if user already has a Stripe customer ID
        if (user.stripeCustomerId) {
            const customer = await stripe.customers.retrieve(user.stripeCustomerId);
            return res.json({
                success: true,
                customer: {
                    id: customer.id,
                    email: customer.email,
                    has_payment_method: customer.default_source || customer.invoice_settings?.default_payment_method
                }
            });
        }

        // Create new Stripe customer
        const customer = await stripe.customers.create({
            email: user.email,
            metadata: {
                clerk_user_id: user.userId,
                veilpix_user_id: user.id
            }
        });

        // Update user record with Stripe customer ID
        await db.updateUserStripeCustomerId(user.userId, customer.id);

        res.json({
            success: true,
            customer: {
                id: customer.id,
                email: customer.email,
                has_payment_method: false
            }
        });

    } catch (error) {
        console.error('Error creating/getting Stripe customer:', error);
        res.status(500).json({
            error: 'Failed to create customer account'
        });
    }
});

// Create payment setup intent
router.post('/setup-intent', getUser, requireAuth, requireAllowedEmail, async (req, res) => {
    try {
        const { user } = req;

        // Ensure user has Stripe customer ID
        let customerId = user.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: {
                    clerk_user_id: user.userId,
                    veilpix_user_id: user.id
                }
            });
            customerId = customer.id;
            await db.updateUserStripeCustomerId(user.userId, customerId);
        }

        // Create setup intent for future payments
        const setupIntent = await stripe.setupIntents.create({
            customer: customerId,
            usage: 'off_session',
            payment_method_types: ['card'],
            metadata: {
                type: 'veilpix_payment_setup'
            }
        });

        res.json({
            success: true,
            clientSecret: setupIntent.client_secret
        });

    } catch (error) {
        console.error('Error creating setup intent:', error);
        res.status(500).json({
            error: 'Failed to setup payment method'
        });
    }
});

// Get customer payment methods
router.get('/payment-methods', getUser, requireAuth, requireAllowedEmail, async (req, res) => {
    try {
        const { user } = req;

        if (!user.stripeCustomerId) {
            return res.json({
                success: true,
                paymentMethods: []
            });
        }

        const paymentMethods = await stripe.paymentMethods.list({
            customer: user.stripeCustomerId,
            type: 'card',
        });

        res.json({
            success: true,
            paymentMethods: paymentMethods.data.map(pm => ({
                id: pm.id,
                type: pm.type,
                card: pm.card ? {
                    brand: pm.card.brand,
                    last4: pm.card.last4,
                    exp_month: pm.card.exp_month,
                    exp_year: pm.card.exp_year
                } : null
            }))
        });

    } catch (error) {
        console.error('Error getting payment methods:', error);
        res.status(500).json({
            error: 'Failed to get payment methods'
        });
    }
});

// Create billing meter (run once to set up usage-based billing)
router.post('/create-meter', async (req, res) => {
    try {
        // This should only be run once to create the billing meter
        // In production, you'd run this via a setup script, not an API endpoint
        
        const meter = await stripe.billing.meters.create({
            display_name: 'VeilPix Image Generations',
            event_name: 'veilpix_image_generation',
            default_aggregation: {
                formula: 'sum'
            },
            customer_mapping: {
                event_payload_key: 'stripe_customer_id',
                type: 'by_id'
            },
            value_settings: {
                event_payload_key: 'value'
            }
        });

        res.json({
            success: true,
            meter: {
                id: meter.id,
                display_name: meter.display_name,
                event_name: meter.event_name
            }
        });

    } catch (error) {
        console.error('Error creating billing meter:', error);
        res.status(500).json({
            error: 'Failed to create billing meter'
        });
    }
});

// Report usage to Stripe (called internally after successful API calls)
async function reportUsageToStripe(stripeCustomerId, usageValue = 1) {
    try {
        await stripe.billing.meterEvents.create({
            event_name: 'veilpix_image_generation',
            payload: {
                stripe_customer_id: stripeCustomerId,
                value: usageValue.toString()
            }
        });
        return true;
    } catch (error) {
        console.error('Error reporting usage to Stripe:', error);
        return false;
    }
}

// Webhook handler for Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'invoice.payment_succeeded':
                // Handle successful payment
                const invoice = event.data.object;
                console.log('Payment succeeded for invoice:', invoice.id);
                break;

            case 'invoice.payment_failed':
                // Handle failed payment
                const failedInvoice = event.data.object;
                console.log('Payment failed for invoice:', failedInvoice.id);
                break;

            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                // Handle subscription changes
                const subscription = event.data.object;
                console.log('Subscription event:', event.type, subscription.id);
                break;

            default:
                console.log('Unhandled event type:', event.type);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Export the usage reporting function for use in other routes
module.exports = router;
module.exports.reportUsageToStripe = reportUsageToStripe;