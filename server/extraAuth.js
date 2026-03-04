const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');

module.exports = function(User) {
    const router = express.Router();

    // 1. PASSPORT GOOGLE SETUP (Fixed Callback URL & added logs)
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "http://localhost:5000/auth/google/callback" // YEH ABSOLUTE HONA CHAHIYE
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
            console.log("➡️ Google Profile Received for:", profile.emails[0].value);
            
            let user = await User.findOne({ email: profile.emails[0].value });
            
            if (user) {
                console.log("✅ User already exists in DB. Logging in...");
                if(!user.googleId) {
                    user.googleId = profile.id;
                    await user.save();
                }
                return done(null, user);
            } else {
                console.log("🆕 Creating new Google user in DB...");
                const nameParts = profile.displayName ? profile.displayName.split(' ') : ['User', ''];
                const firstName = nameParts[0] || 'Google';
                const lastName = nameParts.slice(1).join(' ') || 'User';

                user = await User.create({
                    googleId: profile.id,
                    firstName: firstName,
                    lastName: lastName,
                    email: profile.emails[0].value,
                    provider: 'google',
                    password: await bcrypt.hash(crypto.randomBytes(8).toString('hex'), 10)
                });
                console.log("✅ New Google user created successfully!");
                return done(null, user);
            }
        } catch (err) {
            // AGAR KOI BHI ERROR AAYA TOH TERMINAL MEIN PRINT HOGA
            console.error("❌ GOOGLE AUTH DB ERROR:", err); 
            return done(err, null);
        }
      }
    ));

    // 2. EMAIL SENDER SETUP
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    // 3. FORGOT PASSWORD ROUTE
    router.post('/forgot-password', async (req, res) => {
        try {
            const user = await User.findOne({ email: req.body.email });
            if (!user) return res.status(404).json({ message: 'User not found' });

            const resetToken = crypto.randomBytes(20).toString('hex');
            user.resetPasswordToken = resetToken;
            user.resetPasswordExpires = Date.now() + 3600000;
            await user.save();

            const resetUrl = `http://localhost:5000/reset-password.html?token=${resetToken}`;
            await transporter.sendMail({
                to: user.email,
                from: process.env.EMAIL_USER,
                subject: 'BigFrench - Password Reset',
                text: `Apna password reset karne ke liye is link par click karein: \n\n ${resetUrl}`
            });

            res.json({ message: 'Password reset link aapki email par bhej diya gaya hai!' });
        } catch (error) {
            res.status(500).json({ message: 'Email bhejne mein error aaya.' });
        }
    });

    // 4. RESET PASSWORD ROUTE
    router.post('/reset-password/:token', async (req, res) => {
        try {
            const user = await User.findOne({
                resetPasswordToken: req.params.token,
                resetPasswordExpires: { $gt: Date.now() }
            });

            if (!user) return res.status(400).json({ message: 'Token invalid ya expire ho chuka hai.' });

            user.password = await bcrypt.hash(req.body.newPassword, 10);
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();

            res.json({ message: 'Password successfully changed! Ab aap login kar sakte hain.' });
        } catch (error) {
            res.status(500).json({ message: 'Error resetting password' });
        }
    });

    // 5. GOOGLE ROUTES (Fixed session issue)
    // Add session: false here as well
    router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

    router.get('/google/callback', 
      passport.authenticate('google', { session: false, failureRedirect: '/login.html' }),
      (req, res) => {
        console.log("✅ Google Auth Callback Success! Redirecting to dashboard...");
        
        // Generate Token
        const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        
        const userObj = {
            _id: req.user._id,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            email: req.user.email,
            role: req.user.role,
            isAdmin: req.user.isAdmin
        };
        
        const encodedUser = encodeURIComponent(JSON.stringify(userObj));
        // Redirecting to OAuth callback page
        res.redirect(`/oauth-callback.html?token=${token}&user=${encodedUser}`);
      }
    );

    return router;
};