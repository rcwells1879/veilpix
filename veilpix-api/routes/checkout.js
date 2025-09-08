/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { requireAuth } = require('../middleware/auth');
const { supabase } = require('../utils/database');
const router = express.Router();

// Create a Stripe Checkout session for adding payment method
router.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    const { priceId, successUrl, cancelUrl } = req.body;
    const { clerkUserId } = req.auth;

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
    const { clerkUserId } = req.auth;

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
    const { clerkUserId } = req.auth;
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
    if (session.metadata?.clerk_user_id !== req.auth.clerkUserId) {
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

module.exports = router;