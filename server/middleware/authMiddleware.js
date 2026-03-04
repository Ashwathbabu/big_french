const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer')) {
            return res.status(401).json({ message: "Access denied. No token provided." });
        }

        const token = authHeader.split(' ')[1];
        // Note: Secret wahi use karein jo .env me hai ya server.js me default hai
        const JWT_SECRET = process.env.JWT_SECRET || 'SkySpireSecurityKey_2024_RealScale';
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const User = mongoose.model('User');
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ message: "User not found." });
        }

        // 🔍 DEBUG LOGS (Terminal me mismatch pakadne ke liye)
        console.log(`\n--- 🛡️ SESSION SECURITY CHECK ---`);
        console.log(`👤 User: ${user.email}`);
        console.log(`🔑 Token ID: ${decoded.sessionId || 'NONE'}`);
        console.log(`🗄️ DB ID:    ${user.loginSessionId || 'NULL'}`);

        // 🔥 NETFLIX STYLE: SESSION MISMATCH CHECK 🔥
        if (user.loginSessionId && decoded.sessionId !== user.loginSessionId) {
            console.log("❌ ALERT: Session Mismatch! User logged in elsewhere.");
            return res.status(401).json({ 
                message: "Session expired. You logged in on another device.",
                forceLogout: true 
            });
        }

        console.log("✅ Session Valid.");
        req.user = decoded; // Token data ko request me save karo
        next();
    } catch (error) {
        console.log("❌ JWT Verification Error:", error.message);
        res.status(401).json({ message: "Authentication failed." });
    }
};

// adminOnly ko wapas add kiya hai kyuki server.js isko import kar raha hai
const adminOnly = async (req, res, next) => {
    try {
        const User = mongoose.model('User');
        const user = await User.findById(req.user.id);
        if (!user || (user.role !== 'admin' && !user.isAdmin)) {
            return res.status(403).json({ message: 'Admin access only' });
        }
        next();
    } catch (error) {
        res.status(500).json({ message: 'Server error in admin check' });
    }
};

module.exports = { protect, adminOnly };