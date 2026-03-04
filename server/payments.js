const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const auth = require('../middleware/authMiddleware');
const Payment = require('../models/Payment');
const User = require('../models/User');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create order (with coupon support)
router.post('/create-order', auth, async (req, res) => {
    try {
        const { plan, exam, region, couponCode, originalAmount, discountAmount, finalAmount } = req.body;
        
        // Prices in smallest currency unit (paise/cents)
        const prices = {
            'IN': { '1month': 249900, '3months': 649900, '6months': 1299900 },
            'CA': { '1month': 3900, '3months': 9900, '6months': 19800 },
            'US': { '1month': 2900, '3months': 7500, '6months': 14900 },
            'GB': { '1month': 2300, '3months': 5900, '6months': 11900 },
            'AU': { '1month': 4500, '3months': 11500, '6months': 22900 },
            'EU': { '1month': 2700, '3months': 6900, '6months': 13900 }
        };
        
        let amount = prices[region]?.[plan];
        if (!amount) {
            return res.status(400).json({ success: false, error: 'Invalid plan or region' });
        }
        
        // Apply discount if provided
        let appliedCoupon = null;
        let actualDiscount = 0;
        
        if (discountAmount && discountAmount > 0) {
            actualDiscount = Math.round(discountAmount * 100); // Convert to paise
            
            // Ensure discount doesn't exceed price (but allow 100%)
            if (actualDiscount > amount) {
                actualDiscount = amount;
            }
            
            amount = amount - actualDiscount;
            
            appliedCoupon = {
                code: couponCode,
                discountAmount: actualDiscount
            };
        }
        
        // Don't create Razorpay order for 0 amount (handled by free-order endpoint)
        if (amount <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Use free-order endpoint for 100% discount',
                freeOrder: true 
            });
        }
        
        // Create Razorpay order
        const order = await razorpay.orders.create({
            amount: amount,
            currency: region === 'IN' ? 'INR' : region === 'CA' ? 'CAD' : 'USD',
            receipt: `order_${Date.now()}`,
            notes: {
                userId: req.user._id.toString(),
                plan: plan,
                exam: exam,
                couponCode: couponCode || '',
                originalAmount: prices[region][plan],
                discountAmount: actualDiscount,
                finalAmount: amount
            }
        });
        
        res.json({
            success: true,
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: process.env.RAZORPAY_KEY_ID,
            user: {
                name: req.user.firstName + ' ' + req.user.lastName,
                email: req.user.email
            },
            couponApplied: appliedCoupon,
            discountAmount: actualDiscount / 100,
            finalAmount: amount / 100
        });
        
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// FREE ORDER - For 100% discount coupons (NO PAYMENT)
router.post('/free-order', auth, async (req, res) => {
    try {
        const { plan, exam, couponCode } = req.body;
        const userId = req.user._id;
        
        // Calculate expiry date based on plan
        const now = new Date();
        const expiryDate = new Date(now);
        
        if (plan === '1month') expiryDate.setMonth(expiryDate.getMonth() + 1);
        else if (plan === '3months') expiryDate.setMonth(expiryDate.getMonth() + 3);
        else if (plan === '6months') expiryDate.setMonth(expiryDate.getMonth() + 6);
        
        // Create payment record for free order
        const payment = new Payment({
            user: userId,
            plan: plan,
            exam: exam || 'tef',
            amount: 0,
            currency: 'INR',
            status: 'paid',
            razorpayOrderId: 'FREE_' + Date.now(),
            razorpayPaymentId: 'FREE_' + Date.now(),
            couponCode: couponCode || null,
            discountApplied: 100
        });
        
        await payment.save();
        
        // Update user's plan
        await User.findByIdAndUpdate(userId, {
            plan: plan,
            planExpiry: expiryDate,
            planActivatedAt: now
        });
        
        res.json({
            success: true,
            message: 'Plan activated with 100% discount',
            plan: plan,
            expiryDate: expiryDate
        });
        
    } catch (error) {
        console.error('Free order error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Verify payment
router.post('/verify', auth, async (req, res) => {
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, couponCode } = req.body;
        
        const crypto = require('crypto');
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');
        
        const isAuthentic = expectedSignature === razorpay_signature;
        
        if (!isAuthentic) {
            return res.status(400).json({ success: false, error: 'Invalid signature' });
        }
        
        // Update payment record
        await Payment.findOneAndUpdate(
            { razorpayOrderId: razorpay_order_id },
            { 
                status: 'paid',
                razorpayPaymentId: razorpay_payment_id,
                razorpaySignature: razorpay_signature,
                couponCode: couponCode || null
            }
        );
        
        // Update user plan
        const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
        if (payment) {
            const expiryDate = new Date();
            if (payment.plan === '1month') expiryDate.setMonth(expiryDate.getMonth() + 1);
            else if (payment.plan === '3months') expiryDate.setMonth(expiryDate.getMonth() + 3);
            else if (payment.plan === '6months') expiryDate.setMonth(expiryDate.getMonth() + 6);
            
            await User.findByIdAndUpdate(payment.user, {
                plan: payment.plan,
                planExpiry: expiryDate,
                planActivatedAt: new Date()
            });
        }
        
        res.json({ success: true, message: 'Payment verified successfully' });
        
    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;