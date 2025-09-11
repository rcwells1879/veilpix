/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getUser, requireAuth } = require('../middleware/auth');
const { db, supabase } = require('../utils/database');
const router = express.Router();

// Credit packages configuration
const CREDIT_PACKAGES = {
  '50_credits': {
    credits: 50,
    priceUsd: 3.99,
    name: '50 Credits',
    description: 'Perfect for casual editing'
  },
  '100_credits': {
    credits: 100,
    priceUsd: 6.99,
    name: '100 Credits',
    description: 'Great for regular users'
  },
  '200_credits': {
    credits: 200,
    priceUsd: 11.99,
    name: '200 Credits',
    description: 'Best value - Most popular',
    popular: true
  }
};

// Create a Stripe Checkout session for adding payment method
router.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    const { priceId, successUrl, cancelUrl } = req.body;
    const { userId: clerkUserId } = req.clerkAuth || {};

    // Get or create Stripe customer
    let customer;
    const { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (user?.stripe_customer_id) {
      // Use existing customer
      customer = await stripe.customers.retrieve(user.stripe_customer_id);
    } else {
      // Get user details from Clerk for customer creation
      const clerkUser = await req.clerkClient.users.getUser(clerkUserId);
      
      // Create new Stripe customer
      customer = await stripe.customers.create({
        email: clerkUser.primaryEmailAddress?.emailAddress,
        metadata: {
          clerk_user_id: clerkUserId
        }
      });

      // Update user record with Stripe customer ID
      await supabase
        .from('users')
        .upsert({
          clerk_user_id: clerkUserId,
          stripe_customer_id: customer.id,
          email: clerkUser.primaryEmailAddress?.emailAddress
        });
    }

    // Create Checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      mode: 'setup', // For adding payment method without immediate charge
      success_url: successUrl || `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/payment/cancelled`,
      metadata: {
        clerk_user_id: clerkUserId,
        type: 'setup_payment_method'
      }
    });

    res.json({ 
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ 
      error: 'Failed to create checkout session',
      message: error.message 
    });
  }
});

// Create a Checkout session for subscription (usage-based billing)
router.post('/create-subscription-checkout', requireAuth, async (req, res) => {
  try {
    const { successUrl, cancelUrl } = req.body;
    const { userId: clerkUserId } = req.clerkAuth || {};

    // Get or create Stripe customer
    let customer;
    const { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (user?.stripe_customer_id) {
      customer = await stripe.customers.retrieve(user.stripe_customer_id);
    } else {
      const clerkUser = await req.clerkClient.users.getUser(clerkUserId);
      
      customer = await stripe.customers.create({
        email: clerkUser.primaryEmailAddress?.emailAddress,
        metadata: {
          clerk_user_id: clerkUserId
        }
      });

      await supabase
        .from('users')
        .upsert({
          clerk_user_id: clerkUserId,
          stripe_customer_id: customer.id,
          email: clerkUser.primaryEmailAddress?.emailAddress
        });
    }

    // Create subscription checkout session
    // Note: Replace with your actual Price ID for the metered billing
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID, // Your metered price ID
          quantity: 1,
        },
      ],
      success_url: successUrl || `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/payment/cancelled`,
      metadata: {
        clerk_user_id: clerkUserId,
        type: 'subscription'
      }
    });

    res.json({ 
      sessionId: session.id,
      url: session.url 
    });

  } catch (error) {
    console.error('Error creating subscription checkout:', error);
    res.status(500).json({ 
      error: 'Failed to create subscription checkout',
      message: error.message 
    });
  }
});

// Create Customer Portal session for billing management
router.post('/create-portal-session', requireAuth, async (req, res) => {
  try {
    const { userId: clerkUserId } = req.clerkAuth || {};
    const { returnUrl } = req.body;

    // Get user's Stripe customer ID
    const { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (!user?.stripe_customer_id) {
      return res.status(400).json({ 
        error: 'No payment method found. Please add a payment method first.' 
      });
    }

    // Create Customer Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: returnUrl || process.env.FRONTEND_URL
    });

    res.json({ url: session.url });

  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ 
      error: 'Failed to create portal session',
      message: error.message 
    });
  }
});

// Get checkout session details (for success page)
router.get('/checkout-session/:sessionId', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'payment_intent', 'setup_intent']
    });

    // Verify session belongs to the authenticated user
    if (session.metadata?.clerk_user_id !== req.clerkAuth?.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      id: session.id,
      customer: session.customer,
      payment_status: session.payment_status,
      status: session.status,
      metadata: session.metadata
    });

  } catch (error) {
    console.error('Error retrieving checkout session:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve checkout session',
      message: error.message 
    });
  }
});

// Create Checkout session for credit purchases
router.post('/create-credit-checkout', getUser, requireAuth, async (req, res) => {
  try {
    const { packageType, successUrl, cancelUrl } = req.body;
    const { user } = req;

    // Validate package type
    if (!CREDIT_PACKAGES[packageType]) {
      return res.status(400).json({ 
        error: 'Invalid package type',
        availablePackages: Object.keys(CREDIT_PACKAGES)
      });
    }

    const package = CREDIT_PACKAGES[packageType];

    // Get or create Stripe customer
    let customer;
    if (user.stripeCustomerId) {
      customer = await stripe.customers.retrieve(user.stripeCustomerId);
    } else {
      customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          clerk_user_id: user.userId,
          veilpix_user_id: user.id
        }
      });

      // Update user record with Stripe customer ID
      await db.updateUserStripeCustomerId(user.userId, customer.id);
    }

    // Create Checkout session for one-time payment
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: package.name,
              description: package.description,
              metadata: {
                credits: package.credits.toString(),
                package_type: packageType
              }
            },
            unit_amount: Math.round(package.priceUsd * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      success_url: successUrl || `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/payment/cancelled`,
      metadata: {
        clerk_user_id: user.userId,
        user_id: user.id.toString(),
        package_type: packageType,
        credits: package.credits.toString(),
        type: 'credit_purchase'
      }
    });

    // Log the credit purchase as pending
    await db.logCreditPurchase({
      userId: user.id,
      clerkUserId: user.userId,
      stripeCheckoutSessionId: session.id,
      creditsPurchased: package.credits,
      amountUsd: package.priceUsd,
      packageType: packageType,
      status: 'pending'
    });

    res.json({ 
      sessionId: session.id,
      url: session.url,
      package: {
        type: packageType,
        credits: package.credits,
        price: package.priceUsd,
        name: package.name,
        description: package.description
      }
    });

  } catch (error) {
    console.error('Error creating credit checkout session:', error);
    res.status(500).json({ 
      error: 'Failed to create credit checkout session',
      message: error.message 
    });
  }
});

// Get available credit packages
router.get('/credit-packages', async (req, res) => {
  try {
    res.json({
      packages: CREDIT_PACKAGES
    });
  } catch (error) {
    console.error('Error getting credit packages:', error);
    res.status(500).json({
      error: 'Failed to get credit packages'
    });
  }
});

module.exports = router;