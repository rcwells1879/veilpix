/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { db } = require('../utils/database');
const router = express.Router();

// Create a single Supabase client for this module
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Stripe webhook endpoint
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
  return res.status(400).send(`Webhook Error: ${err.message}`);
  }

console.log(`Received webhook event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      case 'setup_intent.succeeded':
        await handleSetupIntentSucceeded(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    res.json({ received: true });
  } catch (error) {
    console.error(`Error handling webhook event ${event.type}:`, error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handleCheckoutSessionCompleted(session) {
  const clerkUserId = session.metadata?.clerk_user_id;
  const sessionType = session.metadata?.type;

  if (!clerkUserId) {
    console.error('No clerk_user_id found in session metadata');
    return;
  }

  try {
    if (sessionType === 'credit_purchase') {
      const credits = parseInt(session.metadata.credits);
      const creditResult = await db.addUserCredits(clerkUserId, credits);

      if (!creditResult.success) {
        console.error('Failed to add credits to user:', creditResult.error);
        await supabase.from('credit_purchases').update({ status: 'failed', completed_at: new Date().toISOString(),stripe_payment_intent_id: session.payment_intent 
        }).eq('stripe_checkout_session_id', session.id);
        return;
      }

      await supabase.from('credit_purchases').update({ status: 'completed', completed_at: new Date().toISOString(),stripe_payment_intent_id: session.payment_intent 
      }).eq('stripe_checkout_session_id', session.id);

      console.log(`Successfully added ${credits} credits to user ${clerkUserId}`);
    } else {
      const updateData = {
        stripe_customer_id: session.customer,
        payment_status: 'active',
        last_payment_at: new Date().toISOString()
      };
      if (session.subscription) {
        updateData.stripe_subscription_id = session.subscription;
      }
      const { error } = await supabase.from('users').upsert({ clerk_user_id: clerkUserId, ...updateData });
      if (error) throw error;
      console.log(`Payment setup completed for user ${clerkUserId}`);
    }
  } catch (error) {
    console.error('Error in handleCheckoutSessionCompleted:', error);
  }
}

async function handleSubscriptionCreated(subscription) {
  try {
    const { data: user, error: userError } = await supabase.from('users').select('clerk_user_id').eq('stripe_customer_id',subscription.customer).single();
    if (userError || !user) throw new Error('User not found for customer: ' + subscription.customer);

    const { error } = await supabase.from('users').update({
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        payment_status: 'active',
        subscription_created_at: new Date(subscription.created * 1000).toISOString()
      })
      .eq('clerk_user_id', user.clerk_user_id);
    if (error) throw error;
    console.log(`Subscription created for user ${user.clerk_user_id}`);
  } catch (error) {
    console.error('Error in handleSubscriptionCreated:', error);
  }
}

async function handleSubscriptionUpdated(subscription) {
  try {
    const { data: user, error: userError } = await supabase.from('users').select('clerk_user_id').eq('stripe_customer_id',subscription.customer).single();
    if (userError || !user) throw new Error('User not found for customer: ' + subscription.customer);

    const { error } = await supabase.from('users').update({
        subscription_status: subscription.status,
        payment_status: subscription.status === 'active' ? 'active' : 'inactive'
      })
      .eq('clerk_user_id', user.clerk_user_id);
    if (error) throw error;
    console.log(`Subscription updated for user ${user.clerk_user_id}: ${subscription.status}`);
  } catch (error) {
    console.error('Error in handleSubscriptionUpdated:', error);
  }
}

async function handleSubscriptionDeleted(subscription) {
  try {
    const { data: user, error: userError } = await supabase.from('users').select('clerk_user_id').eq('stripe_customer_id',subscription.customer).single();
    if (userError || !user) throw new Error('User not found for customer: ' + subscription.customer);

    const { error } = await supabase.from('users').update({
        subscription_status: 'cancelled',
        payment_status: 'inactive',
        subscription_cancelled_at: new Date().toISOString()
      })
      .eq('clerk_user_id', user.clerk_user_id);
    if (error) throw error;
    console.log(`Subscription cancelled for user ${user.clerk_user_id}`);
  } catch (error) {
    console.error('Error in handleSubscriptionDeleted:', error);
  }
}

async function handlePaymentSucceeded(invoice) {
  try {
    const { data: user, error: userError } = await supabase.from('users').select('clerk_user_id').eq('stripe_customer_id', invoice.customer).single();
    if (userError || !user) throw new Error('User not found for customer: ' + invoice.customer);

    const { error } = await supabase.from('users').update({
        payment_status: 'active',
        last_payment_at: new Date().toISOString(),
        last_invoice_amount: invoice.amount_paid
      })
      .eq('clerk_user_id', user.clerk_user_id);
    if (error) throw error;
    console.log(`Payment succeeded for user ${user.clerk_user_id}: $${(invoice.amount_paid / 100).toFixed(2)}`);
  } catch (error) {
    console.error('Error in handlePaymentSucceeded:', error);
  }
}

async function handlePaymentFailed(invoice) {
  try {
    const { data: user, error: userError } = await supabase.from('users').select('clerk_user_id').eq('stripe_customer_id', invoice.customer).single();
    if (userError || !user) throw new Error('User not found for customer: ' + invoice.customer);

    const { error } = await supabase.from('users').update({
        payment_status: 'failed',
        last_payment_failed_at: new Date().toISOString()
      })
      .eq('clerk_user_id', user.clerk_user_id);
    if (error) throw error;
    console.log(`Payment failed for user ${user.clerk_user_id}`);
  } catch (error) {
    console.error('Error in handlePaymentFailed:', error);
  }
}

async function handleSetupIntentSucceeded(setupIntent) {
  try {
    const { data: user, error: userError } = await supabase.from('users').select('clerk_user_id').eq('stripe_customer_id',setupIntent.customer).single();
    if (userError || !user) throw new Error('User not found for customer: ' +
setupIntent.customer);

    const { error } = await supabase.from('users').update({
        payment_status: 'active',
        payment_method_added_at: new Date().toISOString()
      })
      .eq('clerk_user_id', user.clerk_user_id);
    if (error) throw error;
    console.log(`Payment method added successfully for user ${user.clerk_user_id}`);
  } catch (error) {
    console.error('Error in handleSetupIntentSucceeded:', error);
  }
}

module.exports = router;