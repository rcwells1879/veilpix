/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { db, supabase } = require('../utils/database');
const router = express.Router();

// Stripe webhook endpoint
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Received webhook event: ${event.type}`);

  try {
    // Handle the event
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

// Handle successful checkout session completion
async function handleCheckoutSessionCompleted(session) {
  const clerkUserId = session.metadata?.clerk_user_id;
  const sessionType = session.metadata?.type;
  
  if (!clerkUserId) {
    console.error('No clerk_user_id found in session metadata');
    return;
  }

  try {
    console.log(`Processing checkout completion for user ${clerkUserId}, type: ${sessionType}`);

    // Handle credit purchase
    if (sessionType === 'credit_purchase') {
      const credits = parseInt(session.metadata.credits);
      const packageType = session.metadata.package_type;
      
      if (!credits || !packageType) {
        console.error('Missing credits or package_type in session metadata');
        return;
      }

      // Add credits to user account
      const creditResult = await db.addUserCredits(clerkUserId, credits);
      
      if (!creditResult.success) {
        console.error('Failed to add credits to user:', creditResult.error);
        
        // Update credit purchase record to failed
        await supabase
          .from('credit_purchases')
          .update({ 
            status: 'failed',
            completed_at: new Date().toISOString(),
            stripe_payment_intent_id: session.payment_intent
          })
          .eq('stripe_checkout_session_id', session.id);
          
        return;
      }

      // Update credit purchase record to completed
      const supabaseClient = supabase;
      await supabaseClient
        .from('credit_purchases')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          stripe_payment_intent_id: session.payment_intent
        })
        .eq('stripe_checkout_session_id', session.id);

      console.log(`Successfully added ${credits} credits to user ${clerkUserId}`);
    } else {
      // Handle regular payment method setup
      const updateData = {
        stripe_customer_id: session.customer,
        payment_status: 'active',
        last_payment_at: new Date().toISOString()
      };

      // If this was a subscription checkout, store subscription ID
      if (session.subscription) {
        updateData.stripe_subscription_id = session.subscription;
      }

      const { error } = await supabase
        .from('users')
        .upsert({
          clerk_user_id: clerkUserId,
          ...updateData
        });

      if (error) {
        console.error('Error updating user after checkout completion:', error);
        return;
      }

      console.log(`Payment setup completed for user ${clerkUserId}`);
    }
  } catch (error) {
    console.error('Error in handleCheckoutSessionCompleted:', error);
  }
}

// Handle subscription creation
async function handleSubscriptionCreated(subscription) {
  try {
    const customerId = subscription.customer;
    
    // Find user by Stripe customer ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('clerk_user_id')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) {
      console.error('User not found for customer:', customerId);
      return;
    }

    // Update user with subscription details
    const { error } = await supabase
      .from('users')
      .update({
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        payment_status: 'active',
        subscription_created_at: new Date(subscription.created * 1000).toISOString()
      })
      .eq('clerk_user_id', user.clerk_user_id);

    if (error) {
      console.error('Error updating subscription:', error);
      return;
    }

    console.log(`Subscription created for user ${user.clerk_user_id}`);
  } catch (error) {
    console.error('Error in handleSubscriptionCreated:', error);
  }
}

// Handle subscription updates
async function handleSubscriptionUpdated(subscription) {
  try {
    const customerId = subscription.customer;
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('clerk_user_id')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) {
      console.error('User not found for customer:', customerId);
      return;
    }

    // Update subscription status
    const { error } = await supabase
      .from('users')
      .update({
        subscription_status: subscription.status,
        payment_status: subscription.status === 'active' ? 'active' : 'inactive'
      })
      .eq('clerk_user_id', user.clerk_user_id);

    if (error) {
      console.error('Error updating subscription status:', error);
      return;
    }

    console.log(`Subscription updated for user ${user.clerk_user_id}: ${subscription.status}`);
  } catch (error) {
    console.error('Error in handleSubscriptionUpdated:', error);
  }
}

// Handle subscription deletion/cancellation
async function handleSubscriptionDeleted(subscription) {
  try {
    const customerId = subscription.customer;
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('clerk_user_id')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) {
      console.error('User not found for customer:', customerId);
      return;
    }

    // Update user to reflect cancelled subscription
    const { error } = await supabase
      .from('users')
      .update({
        subscription_status: 'cancelled',
        payment_status: 'inactive',
        subscription_cancelled_at: new Date().toISOString()
      })
      .eq('clerk_user_id', user.clerk_user_id);

    if (error) {
      console.error('Error updating cancelled subscription:', error);
      return;
    }

    console.log(`Subscription cancelled for user ${user.clerk_user_id}`);
  } catch (error) {
    console.error('Error in handleSubscriptionDeleted:', error);
  }
}

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
  try {
    const customerId = invoice.customer;
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('clerk_user_id')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) {
      console.error('User not found for customer:', customerId);
      return;
    }

    // Update last successful payment timestamp
    const { error } = await supabase
      .from('users')
      .update({
        payment_status: 'active',
        last_payment_at: new Date().toISOString(),
        last_invoice_amount: invoice.amount_paid
      })
      .eq('clerk_user_id', user.clerk_user_id);

    if (error) {
      console.error('Error updating payment success:', error);
      return;
    }

    console.log(`Payment succeeded for user ${user.clerk_user_id}: $${(invoice.amount_paid / 100).toFixed(2)}`);
  } catch (error) {
    console.error('Error in handlePaymentSucceeded:', error);
  }
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
  try {
    const customerId = invoice.customer;
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('clerk_user_id')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) {
      console.error('User not found for customer:', customerId);
      return;
    }

    // Update payment status to reflect failure
    const { error } = await supabase
      .from('users')
      .update({
        payment_status: 'failed',
        last_payment_failed_at: new Date().toISOString()
      })
      .eq('clerk_user_id', user.clerk_user_id);

    if (error) {
      console.error('Error updating payment failure:', error);
      return;
    }

    console.log(`Payment failed for user ${user.clerk_user_id}`);
  } catch (error) {
    console.error('Error in handlePaymentFailed:', error);
  }
}

// Handle successful setup intent (payment method added)
async function handleSetupIntentSucceeded(setupIntent) {
  try {
    const customerId = setupIntent.customer;
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('clerk_user_id')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) {
      console.error('User not found for customer:', customerId);
      return;
    }

    // Update user to reflect payment method added
    const { error } = await supabase
      .from('users')
      .update({
        payment_status: 'active',
        payment_method_added_at: new Date().toISOString()
      })
      .eq('clerk_user_id', user.clerk_user_id);

    if (error) {
      console.error('Error updating setup intent success:', error);
      return;
    }

    console.log(`Payment method added successfully for user ${user.clerk_user_id}`);
  } catch (error) {
    console.error('Error in handleSetupIntentSucceeded:', error);
  }
}

module.exports = router;