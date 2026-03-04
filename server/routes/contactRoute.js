const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

router.post('/', async (req, res) => {
    const { firstName, lastName, email, message } = req.body;

    // Basic validation
    if (!firstName || !lastName || !email || !message) {
        return res.status(400).json({ error: 'Please fill all fields.' });
    }

    try {
        // 1. Nodemailer Transporter Setup
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // 2. Email Template (Professional Look)
        const mailOptions = {
            from: `"${firstName} ${lastName}" <${process.env.EMAIL_USER}>`,
            to: 'ss2818266@gmail.com', 
            replyTo: email, // Isse tum seedha student ko reply kar paoge
            subject: `📩 New Website Inquiry: ${firstName} ${lastName}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px;">New Contact Message</h2>
                    <p><strong>From:</strong> ${firstName} ${lastName}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p style="background: #f9f9f9; padding: 15px; border-radius: 5px; border-left: 4px solid #1e40af;">
                        <strong>Message:</strong><br>
                        ${message.replace(/\n/g, '<br>')}
                    </p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #777;">This message was sent from the BigFrench.com contact form.</p>
                </div>
            `
        };

        // 3. Send Email
        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent from: ${email}`);
        
        res.status(200).json({ success: true, message: 'Your message has been sent!' });

    } catch (error) {
        console.error("❌ Nodemailer Error:", error);
        res.status(500).json({ error: 'Internal Server Error. Could not send email.' });
    }
});

module.exports = router;