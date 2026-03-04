/**
 * checkout-fix.js
 * Override initiateCheckout in index.html to redirect to order.html
 * Include this AFTER the main script block in index.html
 */

// Override: redirect to order.html instead of opening Razorpay inline
(function() {
    'use strict';

    // Wait for DOM + scripts to load
    window.initiateCheckout = async function() {
        // authToken, pricingConfig, currentRegion, selectedPlan, appliedCoupon,
        // finalPrice, discountAmount, currentExam are all globals from the main script

        const _token = typeof authToken !== 'undefined' ? authToken : localStorage.getItem('token');
        if (!_token) {
            window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
            return;
        }
        if (typeof selectedPlan === 'undefined' || !selectedPlan) {
            // showToast is a global in index.html
            if (typeof showToast === 'function') showToast('Please select a plan first', 'error');
            return;
        }

        const config     = pricingConfig[currentRegion];
        const amountToPay = (typeof appliedCoupon !== 'undefined' && appliedCoupon) ? finalPrice : config.rates[selectedPlan];
        const originalAmt = config.rates[selectedPlan];

        // Persist order details for order.html
        const orderState = {
            plan:           selectedPlan,
            exam:           typeof currentExam !== 'undefined' ? currentExam : 'tef',
            region:         currentRegion,
            couponCode:     (typeof appliedCoupon !== 'undefined' && appliedCoupon) ? appliedCoupon.code : null,
            originalPrice:  originalAmt,
            discountAmount: (typeof discountAmount !== 'undefined' && appliedCoupon) ? discountAmount : 0,
            finalPrice:     amountToPay,
            isFree:         amountToPay <= 0
        };
        sessionStorage.setItem('orderState', JSON.stringify(orderState));

        // Visual feedback
        const btn = document.getElementById('checkout-btn');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Redirecting to checkout...';
            btn.disabled  = true;
        }

        // Small delay so user sees feedback, then redirect
        setTimeout(() => {
            window.location.href = 'order.html';
        }, 350);
    };

    console.log('[checkout-fix] initiateCheckout overridden → will redirect to order.html');
})();