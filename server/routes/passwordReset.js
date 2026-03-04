const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

// User Model load karein
const User = mongoose.model('User');

// 1. FORGOT PASSWORD - Link bhejane ke liye
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    console.log(`📩 Forgot Password Request: ${email}`);

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "Is email se koi account nahi mila." });
        }

        // Secret Token generate karo
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 ghante ki validity
        await user.save();

        // Email transporter setup
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const resetUrl = `http://localhost:5000/reset-password.html?token=${resetToken}`;

        const mailOptions = {
            to: user.email,
            from: process.env.EMAIL_USER,
            subject: 'Password Reset Request | BigFrench',
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
                    <h2>Password Reset</h2>
                    <p>Aapne password reset ki request ki hai.</p>
                    <p>Niche diye gaye link par click karke naya password set karein:</p>
                    <a href="${resetUrl}" style="background: #f25c05; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
                    <p>Yeh link 1 ghante tak valid hai.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "Reset link aapke email par bhej diya gaya hai!" });

    } catch (err) {
        console.error("❌ Reset Email Error:", err);
        res.status(500).json({ message: "Email bhejane mein problem hui." });
    }
});

// 2. RESET PASSWORD - Naya password update karne ke liye
router.post('/reset-password/:token', async (req, res) => {
    const { password } = req.body; 
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: "Link expire ho gaya hai ya invalid hai." });
        }

        // Naya password hash karke save karo
        user.password = await bcrypt.hash(password, 10);
        
        // 🔥 NETFLIX SECURITY: Naya password aate hi purana session expire kardo
        user.loginSessionId = crypto.randomBytes(16).toString('hex'); 
        
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ success: true, message: "Password update ho gaya! Ab login karein." });
    } catch (err) {
        res.status(500).json({ message: "Update fail ho gaya." });
    }
});

module.exports = router;