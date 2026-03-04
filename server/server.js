const { protect, adminOnly } = require('./middleware/authMiddleware');
const express = require('express'); 

const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const session = require('express-session');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require('dotenv').config();

/* ================================
   ✅ SECURITY IMPORTS
================================ */
const helmetSecurity = require('./security/helmetSecurity');
const limiter = require('./security/rateLimiter');
const deviceFingerprint = require('./security/deviceFingerprint');
const geoBlocker = require('./security/geoIpBlocker');
const singleDevice = require('./security/singleDevice');
const vpnDetector = require('./security/vpnDetector');

const app = express();

/* ================================
   ✅ GLOBAL SECURITY LAYER
================================ */

app.use(helmetSecurity);
//app.use(limiter);
app.use(deviceFingerprint);
app.use(geoBlocker);

/* ✅ FIX 1 — CORS ABOVE STATIC */
/* ✅ FIX — CORS FOR MOBILE TESTING & LOCALHOST */
/* ================================
   ✅ FINAL PRODUCTION SECURITY (LIVE SITE KE LIYE)
================================ */
const allowedOrigins = [
  'https://www.bigfrench.com', // Tumhara Live Domain
  'https://bigfrench.com',     // Bina www wala domain
  'http://localhost:5500',     // Local testing ke liye (Optional)
  'http://localhost:5000'      // Local API testing ke liye
];

app.use(cors({
  origin: function (origin, callback) {
    // Agar request browser se nahi hai (jaise Mobile App/Postman) ya allowed list mein hai
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// 🔍 Terminal me har request dekhne ke liye
app.use((req, res, next) => {
    console.log(`\n[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    if (req.headers.authorization) {
        console.log(`📡 Auth Header detected!`);
    } else {
        console.log(`⚠️ No Auth Header found in this request.`);
    }
    next();
});

/* ================================
   TEF FRONTEND (VITE BUILD)
================================ */

const tefPath = path.resolve(__dirname,'..','public','tef');

app.use('/assets',
  express.static(path.join(tefPath,'assets'))
);

app.use('/tef',
  express.static(tefPath)
);

app.get('/tef/*',(req,res)=>{
  res.sendFile(
    path.join(tefPath,'index.html')
  );
});

app.use(express.static(
  path.join(__dirname,'../client')
));

app.use(express.static(
  path.join(__dirname,'../public')
));


/* ================================
   MOCK TEST STATIC SERVING
================================ */

app.use('/data',
 express.static(path.join(__dirname,'../client/data'))
);

app.use('/audio1',
 express.static(path.join(__dirname,'../client/audio1'))
);

app.use('/images',
 express.static(path.join(__dirname,'../client/images'))
);


/* ================================
   BODY SECURITY
================================ */
console.log("KEY:", process.env.RAZORPAY_KEY_ID);

app.use(express.json({limit:"10mb"}));

app.use(express.urlencoded({
  extended:true,
  limit:"10mb"
}));


/* ================================
   ✅ FIX 2 — PRODUCTION SESSION
================================ */

app.use(session({
  secret:
   process.env.SESSION_SECRET ||
   'bigfrenchsecret123',

  resave:false,
  saveUninitialized:false,

  cookie:{
    httpOnly:true,
    secure:
      process.env.NODE_ENV === "production",
    sameSite:"lax",
    maxAge:24*60*60*1000
  }
}));


app.use(passport.initialize());
app.use(passport.session());
app.use(require('./middleware/sessionGuard'));


// ============================================
// 1. SCHEMAS (Database Structure)
// ============================================
const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, default: null },
  googleId: { type: String, unique: true, sparse: true },
  facebookId: { type: String, unique: true, sparse: true },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  provider: { type: String, enum: ['local', 'google', 'facebook', 'apple'], default: 'local' },
  avatar: { type: String, default: null },
  role: { type: String, enum:['student', 'admin'], default: 'student' },
  isAdmin: { type: Boolean, default: false },
  examType: { type: String, default: 'tef' },
  level: { type: String, default: 'A0' },
  status: { type: String, default: 'active' },
  plan: { type: String, default: 'free' },
  planExpiry: { type: Date },
  progress: {
    overall: { type: Number, default: 0 },
    listening: { type: Number, default: 0 },
    reading: { type: Number, default: 0 },
    writing: { type: Number, default: 0 },
    speaking: { type: Number, default: 0 }
  },
  studyTime: { type: Number, default: 0 },
  lessonsCompleted: { type: Number, default: 0 },
  testsTaken: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  lastActive: { type: Date, default: Date.now },
  joinedAt: { type: Date, default: Date.now },
  loginSessionId: { type: String, default: null }, // ✅ For Netflix Security
  payments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }]
});

const testSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, required: true },
  examType: { type: String, required: true },
  duration: Number,
  questions: [{
    question: String,
    options:[String],
    correctAnswer: Number,
    audioUrl: String,
    imageUrl: String,
    explanation: String
  }],
  isActive: { type: Boolean, default: true },
  difficulty: { type: String, default: 'intermediate' },
  createdAt: { type: Date, default: Date.now }
});

const testResultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test' },
  testType: { type: String },
  testTitle: { type: String },
  score: Number,
  maxScore: Number,
  answers: [Number],
  timeSpent: Number,
  completedAt: { type: Date, default: Date.now }
});

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  module: { type: String, required: true },
  examType: { type: String, required: true },
  description: String,
  duration: Number,
  videoUrl: String,
  order: Number,
  isActive: { type: Boolean, default: true }
});

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  razorpayOrderId: { type: String, required: true },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  plan: { type: String, required: true },
  planType: { type: String },
  region: { type: String },
  status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
  receipt: { type: String },
  paidAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

const couponSchema = new mongoose.Schema({
  code: String,
  type: String, 
  value: Number,
  expiry: Date,
  maxUses: Number,
  usedCount: { type: Number, default: 0 },
  active: { type: Boolean, default: true }
});

const activitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String },
  details: { type: Object },
  timestamp: { type: Date, default: Date.now }
});

// ============================================
// 2. MODELS (Registration)
// ============================================
const User = mongoose.model('User', userSchema);
const Course = mongoose.model('Course', courseSchema);
const Test = mongoose.model('Test', testSchema);
const TestResult = mongoose.model('TestResult', testResultSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const Activity = mongoose.model('Activity', activitySchema);
const Coupon = mongoose.model('Coupon', couponSchema);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ============================================
// 3. ROUTES CONFIGURATION (After Models)
// ============================================
// Password Reset Route
app.use('/auth', require('./routes/passwordReset'));

// Extra Auth Route (Passing User model)
const extraAuthRoutes = require('./extraAuth')(User);
app.use('/auth', extraAuthRoutes);

// Contact & IP Routes
app.use('/api/contact', require('./routes/contactRoute'));
app.use("/api", require("./routes/ipRoute"));

// ============================================
// 4. DATABASE CONNECTION
// ============================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bigfrench';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error("❌ MongoDB connection failed");
    console.error(err);
    process.exit(1);
  });

// ============================================
// 5. RAZORPAY & PRICING
// ============================================
console.log("Razorpay ID Length:", process.env.RAZORPAY_KEY_ID ? process.env.RAZORPAY_KEY_ID.length : 'MISSING');
console.log("Razorpay Secret Length:", process.env.RAZORPAY_KEY_SECRET ? process.env.RAZORPAY_KEY_SECRET.length : 'MISSING');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const pricingConfig = {
  'CA': { currency: 'CAD', symbol: 'CA$', rates: { '1month': 3900, '3months': 9900, '6months': 19800 } },
  'US': { currency: 'USD', symbol: '$', rates: { '1month': 2900, '3months': 7500, '6months': 14900 } },
  'GB': { currency: 'GBP', symbol: '£', rates: { '1month': 2300, '3months': 5900, '6months': 11900 } },
  'IN': { currency: 'INR', symbol: '₹', rates: { '1month': 249900, '3months': 649900, '6months': 1299900 } },
  'AU': { currency: 'AUD', symbol: 'A$', rates: { '1month': 4500, '3months': 11500, '6months': 22900 } },
  'EU': { currency: 'EUR', symbol: '€', rates: { '1month': 2700, '3months': 6900, '6months': 13900 } },
  'default': { currency: 'USD', symbol: '$', rates: { '1month': 2900, '3months': 7500, '6months': 14900 } }
};

const planDetails = {
  '1month': { name: '1 Month - 15 Tests', tests: 15, duration: '1 month access', popular: false, planType: 'basic' },
  '3months': { name: '3 Months - 35 Tests', tests: 35, duration: '3 months access', popular: true, planType: 'popular' },
  '6months': { name: '6 Months - 50 Tests', tests: 50, duration: '6 months access', popular: false, planType: 'premium' }
};



/* ==========================================================
   ✅ LOGIN & SESSION SECURITY (NETFLIX STYLE - FULL CODE)
========================================================== */

// 1. LOGIN ROUTE
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // User ko database mein dhundo
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).send("Invalid credentials");
        }

        // Password verify karo
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).send("Invalid credentials");
        }

        // --- 🔥 NETFLIX STYLE LOGIC START 🔥 ---
        
        // A. Naya Unique Session ID generate karo
        const currentSessionId = crypto.randomBytes(16).toString('hex');

        // B. Database mein naya ID save karo (Isse purana session invalid ho jayega)
        user.loginSessionId = currentSessionId;
        user.lastActive = new Date();
        await user.save();

        // C. JWT Token sign karo (Isme Session ID daalna zaroori hai)
        const token = jwt.sign({ 
            id: user._id, 
            role: user.role, 
            isAdmin: user.isAdmin,
            sessionId: currentSessionId 
        }, process.env.JWT_SECRET || 'your-secret-key-change-in-production', { expiresIn: '7d' });

        // --- 🔥 NETFLIX STYLE LOGIC END 🔥 ---

        // Session support (Optional, for extra security)
        req.session.userId = user._id;

        // Single Success Response (Sirf ek baar bhej rahe hain)
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                isAdmin: user.isAdmin,
                plan: user.plan
            }
        });

    } catch (error) {
        console.error("Login Route Error:", error);
        res.status(500).send("Server Error");
    }
});

/* =========================
   ✅ LOGOUT ROUTE
========================= */
app.post('/logout', (req, res) => {
    // Session destroy karo agar use kar rahe ho
    if (req.session) {
        req.session.destroy((err) => {
            if (err) return res.status(500).send("Logout failed");
            res.send("Logged out");
        });
    } else {
        res.send("Logged out");
    }
});

/* =========================
   TEMP ERROR TEST ROUTE
========================= */
app.get('/test-error', (req, res) => {
    throw new Error("Test crash");
});

// ============================================
// PASSPORT CONFIG
// ============================================
passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) { done(err, null); }
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'your-google-client-id',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your-google-client-secret',
    callbackURL: '/api/auth/google/callback',
    proxy: true, 
    scope: ['profile', 'email']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log("✅ Google Auth Data Received for:", profile.emails[0].value);
      
      // 🔒 Netflix Style: Naya Session ID generate karo
      const currentSessionId = crypto.randomBytes(16).toString('hex');

      let user = await User.findOne({ email: profile.emails[0].value });

      if (user) {
        // Agar user pehle se hai (Google ya Local), toh uska Session ID update karo
        user.googleId = profile.id;
        user.provider = 'google';
        user.loginSessionId = currentSessionId; // DB me naya session lock karo
        user.avatar = profile.photos[0]?.value || user.avatar;
        await user.save();
        console.log("✅ Existing user session updated via Google");
      } else {
        // Naya user create karo Session ID ke saath
        const nameParts = profile.displayName ? profile.displayName.split(' ') : ['Google', 'User'];
        user = await User.create({
          firstName: nameParts[0] || 'Google',
          lastName: nameParts.slice(1).join(' ') || 'User',
          email: profile.emails[0].value,
          password: null,
          googleId: profile.id,
          provider: 'google',
          role: 'student',
          plan: 'free',
          loginSessionId: currentSessionId, // DB me naya session lock karo
          avatar: profile.photos[0]?.value || null
        });
        console.log("✅ New Google user created with session");
      }
      
      // User object return karo taaki callback me access kar sakein
      done(null, user);
    } catch (error) { 
      console.error("❌ Google Strategy Error:", error);
      done(error, null); 
    }
  }
));

// ============================================
// AUTH MIDDLEWARE
// ============================================


// ============================================
// OAUTH ROUTES
// ============================================
app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html?error=google_failed' }),
  (req, res) => {
    // 🔥 Netflix Security: Google se login par bhi sessionId bhejni hai
    const token = jwt.sign({ 
        id: req.user._id, 
        role: req.user.role, 
        email: req.user.email,
        sessionId: req.user.loginSessionId // DB se uthao jo strategy ne save kiya
    }, JWT_SECRET, { expiresIn: '7d' });

    res.redirect(`/oauth-callback.html?token=${token}&provider=google`);
  }
);
// ============================================
// APPLE OAUTH SETUP & ROUTES (Naya Code)
// ============================================
const AppleStrategy = require('passport-apple');

passport.use(new AppleStrategy({
    clientID: process.env.APPLE_CLIENT_ID || 'your-service-id',
    teamID: process.env.APPLE_TEAM_ID || 'your-team-id',
    // DHYAN DEIN: Apple callback ke liye hamesha HTTPS domain mangta hai (e.g. https://yourdomain.com/api/auth/apple/callback)
    callbackURL: process.env.APPLE_CALLBACK_URL || '/api/auth/apple/callback', 
    keyID: process.env.APPLE_KEY_ID || 'your-key-id',
    privateKeyString: process.env.APPLE_PRIVATE_KEY || 'your-private-key'
  }, async (req, accessToken, refreshToken, idToken, profile, done) => {
    try {
      // Apple hamesha email profile me nahi bhejta, idToken se nikalna safe hai
      const decodedToken = jwt.decode(idToken);
      const email = decodedToken?.email || `apple_${Date.now()}@privaterelay.appleid.com`;

      let user = await User.findOne({ email: email });
      if (!user) {
        user = await User.create({
          firstName: 'Apple',
          lastName: 'User',
          email: email,
          password: null,
          provider: 'apple',
          role: 'student',
          plan: 'free'
        });
      }
      done(null, user);
    } catch (error) { done(error, null); }
  }
));

app.get('/api/auth/apple', passport.authenticate('apple'));

app.post('/api/auth/apple/callback',
  passport.authenticate('apple', { failureRedirect: '/login.html?error=apple_failed' }),
  (req, res) => {
    // User login successful, redirecting to callback which handles token in your frontend
    const token = jwt.sign({ id: req.user._id, role: req.user.role, email: req.user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.redirect(`/oauth-callback.html?token=${token}&provider=apple`);
  }
);

// ============================================
// AUTH ROUTES
// ============================================
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      firstName, lastName, email, password: hashedPassword, provider: "local", role: "student"
    });

    const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ token, role: user.role, user: { id: user._id, firstName, lastName, email, plan: 'free' } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user || !user.password) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    // 🔥 NETFLIX LOGIC: Generate and Save Session ID
    const currentSessionId = crypto.randomBytes(16).toString('hex');
    user.loginSessionId = currentSessionId;
    user.lastActive = new Date();
    await user.save();

    // 🔥 JWT Sign with SessionID
    const token = jwt.sign({ 
        id: user._id, 
        role: user.role, 
        email: user.email,
        sessionId: currentSessionId // This must match DB
    }, JWT_SECRET, { expiresIn: "7d" });

    res.json({ 
      success: true,
      token, 
      role: user.role,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        plan: user.plan,
        isAdmin: user.isAdmin || user.role === 'admin'
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/auth/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
  
   res.json({ 
  id: user._id, 
  firstName: user.firstName, 
  lastName: user.lastName, 
  email: user.email, 
  role: user.role,
  isAdmin: user.isAdmin || user.role === 'admin',
  examType: user.examType, 
  level: user.level, 
  progress: user.progress, 
  studyTime: user.studyTime,
  lessonsCompleted: user.lessonsCompleted,
  testsTaken: user.testsTaken || 0,
  streak: user.streak,

  // 🔥 IMPORTANT FIX
  plan: user.plan || 'free',

  planExpiry: user.planExpiry,
  provider: user.provider,
  avatar: user.avatar
});
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/auth/verify-admin', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const isAdmin = user && (user.role === 'admin' || user.isAdmin);
    res.json({ isAdmin });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ============================================
// PAYMENT ROUTES
// ============================================

// Create order
app.post('/api/payments/create-order', protect, async (req, res) => {
  try {
    const { 
      plan, 
      region = 'IN', 
      exam = 'tef',
      couponCode,       // coupon code applied (if any)
      originalAmount,   // original price in display units (e.g. 2499 for ₹2499)
      discountAmount,   // discount in display units
      finalAmount       // ✅ actual amount to charge in display units (after discount)
    } = req.body;
    const userId = req.user.id;
    
    if (!plan || !pricingConfig[region]?.rates[plan]) {
      return res.status(400).json({ error: 'Invalid plan or region' });
    }

    const config = pricingConfig[region];
    const fullAmountInPaise = config.rates[plan]; // stored in paise/cents
    const planInfo = planDetails[plan];
    const receipt = `rcpt_${Date.now()}_${userId.toString().slice(-6)}`;

    // ─── COUPON DISCOUNT LOGIC ───────────────────────────────────────────────
    let chargeAmountInPaise = fullAmountInPaise; // default = full price

    if (couponCode && finalAmount !== undefined && finalAmount !== null) {
      const sentFinalDisplay = parseFloat(finalAmount); // e.g. 1249.5 (display units)
      const fullAmountDisplay = fullAmountInPaise / 100; // convert paise → display units

      // Security: finalAmount must be >= 0 and ≤ original price
      if (!isNaN(sentFinalDisplay) && sentFinalDisplay >= 0 && sentFinalDisplay <= fullAmountDisplay) {
        // ✅ Convert display units back to paise/cents for Razorpay
        chargeAmountInPaise = Math.round(sentFinalDisplay * 100);
      } else {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid discount amount. Please re-apply your coupon and try again.' 
        });
      }
    }

    // ─── 100% DISCOUNT → FREE ORDER (no Razorpay needed) ────────────────────
    if (chargeAmountInPaise <= 0) {
      // Activate plan directly without payment
      const planDuration = { '1month': 30, '3months': 90, '6months': 180 };
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + (planDuration[plan] || 30));

      await User.findByIdAndUpdate(userId, { plan, planExpiry: expiryDate });

      // Record as a ₹0 payment for audit trail
      await Payment.create({
        userId,
        razorpayOrderId: `free_${Date.now()}`,
        razorpayPaymentId: `free_coupon_${couponCode || 'unknown'}`,
        amount: 0,
        currency: config.currency,
        plan,
        planType: planInfo.planType,
        region,
        status: 'paid',
        receipt,
        paidAt: new Date()
      });

      await Activity.create({
        userId,
        action: 'free_order_coupon',
        details: { plan, couponCode, exam }
      });

      return res.json({
        success: true,
        free: true,
        message: 'Plan activated for free via 100% discount coupon!'
      });
    }

    // ─── PAID ORDER → Create Razorpay order with DISCOUNTED amount ───────────
    const options = {
      amount: chargeAmountInPaise,   // ✅ discounted amount in paise, NOT full price
      currency: config.currency,
      receipt: receipt,
      notes: {
        userId: userId.toString(),
        plan: plan,
        exam: exam,
        region: region,
        planName: planInfo.name,
        tests: planInfo.tests.toString(),
        duration: planInfo.duration,
        couponCode: couponCode || '',
        originalAmountPaise: fullAmountInPaise.toString(),
        discountAmountPaise: (fullAmountInPaise - chargeAmountInPaise).toString(),
        finalAmountPaise: chargeAmountInPaise.toString()
      }
    };

    const order = await razorpay.orders.create(options);
    
    await Payment.create({
      userId: userId,
      razorpayOrderId: order.id,
      amount: chargeAmountInPaise,   // ✅ store discounted amount
      currency: config.currency,
      plan: plan,
      planType: planInfo.planType,
      region: region,
      status: 'created',
      receipt: receipt
    });

    const user = await User.findById(userId);

    res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID || 'rzp_live_SF8Vw6DzJIj5Zd',
      plan_details: planInfo,
      user: {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Order creation failed:', error);
    res.status(500).json({ success: false, error: 'Failed to create order', message: error.message });
  }
});

// Verify payment
app.post('/api/payments/verify', protect, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '9DT2ginXVGONVBInNKJFbQfO')
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
      if (payment) {
        payment.razorpayPaymentId = razorpay_payment_id;
        payment.razorpaySignature = razorpay_signature;
        payment.status = 'paid';
        payment.paidAt = new Date();
        await payment.save();

        // Update user plan
        const planDuration = { '1month': 30, '3months': 90, '6months': 180 };
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + (planDuration[payment.plan] || 30));
        
        const user = await User.findById(payment.userId);
        user.plan = payment.plan;
        user.planExpiry = expiryDate;
        user.payments.push(payment._id);
        await user.save();

        // Log activity
        await Activity.create({
          userId: user._id,
          action: 'payment_success',
          details: { plan: payment.plan, amount: payment.amount, currency: payment.currency }
        });
      }

      res.json({
        success: true,
        message: 'Payment verified successfully',
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id
      });
    } else {
      res.status(400).json({ success: false, message: 'Invalid signature' });
    }
  } catch (error) {
    console.error('Payment verification failed:', error);
    res.status(500).json({ success: false, message: 'Verification failed', error: error.message });
  }
});

// ─── FREE ORDER (100% coupon - no Razorpay) ─────────────────────────────────
// This route handles the case when frontend calls it directly for 100% discounts
app.post('/api/payments/free-order', protect, async (req, res) => {
  try {
    const { plan, exam = 'tef', couponCode } = req.body;
    const userId = req.user.id;

    if (!plan || !planDetails[plan]) {
      return res.status(400).json({ success: false, error: 'Invalid plan' });
    }

    const planInfo = planDetails[plan];
    const planDuration = { '1month': 30, '3months': 90, '6months': 180 };
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (planDuration[plan] || 30));

    // Activate user plan
    await User.findByIdAndUpdate(userId, { plan, planExpiry: expiryDate });

    // Record ₹0 payment for audit trail
    await Payment.create({
      userId,
      razorpayOrderId: `free_${Date.now()}_${userId.toString().slice(-6)}`,
      razorpayPaymentId: `free_coupon_${couponCode || 'direct'}`,
      amount: 0,
      currency: 'INR',
      plan,
      planType: planInfo.planType,
      region: 'FREE',
      status: 'paid',
      receipt: `free_${Date.now()}`,
      paidAt: new Date()
    });

    await Activity.create({
      userId,
      action: 'free_order_activated',
      details: { plan, couponCode: couponCode || null, exam, expiryDate }
    });

    res.json({
      success: true,
      message: 'Plan activated successfully! Enjoy your free access.',
      plan,
      expiryDate
    });

  } catch (error) {
    console.error('Free order error:', error);
    res.status(500).json({ success: false, error: 'Failed to activate free plan', message: error.message });
  }
});

// Get user's payments
app.get('/api/payments/my-payments', protect, async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TEST ROUTES
// ============================================
app.get('/api/tests', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    // Check if user has active plan
    const hasActivePlan = user.plan !== 'free' && user.plan !== 'expired' && 
      (!user.planExpiry || new Date(user.planExpiry) > new Date());
    
    const tests = await Test.find({ examType: user.examType, isActive: true });
    
    res.json({ 
      tests, 
      hasAccess: hasActivePlan,
      planStatus: user.plan,
      planExpiry: user.planExpiry
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/tests/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    // Check access
    const hasActivePlan = user.plan !== 'free' && user.plan !== 'expired' &&
      (!user.planExpiry || new Date(user.planExpiry) > new Date());
    
    if (!hasActivePlan) {
      return res.status(403).json({ message: 'Active plan required to access tests', code: 'NO_PLAN' });
    }
    
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ message: 'Test not found' });
    
    res.json(test);
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/tests/submit', protect, async (req, res) => {
  try {
    const { testId, answers, score, maxScore, timeSpent, testType, testTitle } = req.body;
    const user = await User.findById(req.user.id);
    
    // Check access
    const hasActivePlan = user.plan !== 'free' && user.plan !== 'expired' &&
      (!user.planExpiry || new Date(user.planExpiry) > new Date());
    
    if (!hasActivePlan) {
      return res.status(403).json({ message: 'Active plan required', code: 'NO_PLAN' });
    }
    
    await TestResult.create({ 
      userId: user._id, 
      testId, 
      testType, 
      testTitle,
      score, 
      maxScore, 
      answers, 
      timeSpent 
    });
    
    user.testsTaken = (user.testsTaken || 0) + 1;
    user.lastActive = new Date();
    await user.save();
    
    res.json({ message: 'Test submitted successfully', score, maxScore });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ============================================
// DASHBOARD STATS
// ============================================
app.get('/api/dashboard/stats', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const testResults = await TestResult.find({ userId: user._id }).sort({ completedAt: -1 });
    
    const testsTaken = testResults.length;
    const averageScore = testsTaken > 0 ? Math.round(testResults.reduce((sum, r) => sum + (r.score / r.maxScore * 100), 0) / testsTaken) : 0;
    const bestScore = testsTaken > 0 ? Math.max(...testResults.map(r => r.score / r.maxScore * 100)) : 0;
    
    // Calculate streak
    const now = new Date();
    const lastActive = user.lastActive;
    let streak = user.streak || 0;
    if (lastActive) {
      const daysSince = Math.floor((now - lastActive) / (1000 * 60 * 60 * 24));
      if (daysSince === 0) streak = streak;
      else if (daysSince === 1) streak += 1;
      else streak = 0;
    }
    
    // Tests this week
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const testsThisWeek = testResults.filter(r => r.completedAt > weekAgo).length;
    
    res.json({
      testsTaken,
      averageScore,
      bestScore: Math.round(bestScore),
      studyTime: user.studyTime || 0,
      streak,
      testsThisWeek,
      testResults,
      progress: user.progress,
      plan: user.plan,
      planExpiry: user.planExpiry
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// Activity tracking
app.post('/api/activity/track', protect, async (req, res) => {
  try {
    const { action, details } = req.body;
    await Activity.create({
      userId: req.user.id,
      action,
      details,
      timestamp: new Date()
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================
app.get('/api/admin/stats', protect, adminOnly, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const paidUsers = await User.countDocuments({ plan: { $ne: 'free' } });
    const totalTests = await TestResult.countDocuments();
    
    const payments = await Payment.find({ status: 'paid' });
    const totalRevenue = payments.reduce((sum, pay) => {
      const rates = { 'INR': 0.016, 'USD': 1.35, 'GBP': 1.68, 'EUR': 1.47, 'AUD': 0.89, 'NGN': 0.0017, 'PKR': 0.0048, 'BDT': 0.012, 'CAD': 1 };
      const rate = rates[pay.currency] || 1;
      return sum + (pay.amount * rate / 100);
    }, 0);
    
    // Revenue by plan
    const revenueByPlan = { '1month': 0, '3months': 0, '6months': 0 };
    const usersByPlan = { '1month': 0, '3months': 0, '6months': 0 };
    
    payments.forEach(p => {
      const rates = { 'INR': 0.016, 'USD': 1.35, 'GBP': 1.68, 'EUR': 1.47, 'AUD': 0.89, 'NGN': 0.0017, 'PKR': 0.0048, 'BDT': 0.012, 'CAD': 1 };
      const rate = rates[p.currency] || 1;
      const amountCAD = (p.amount * rate / 100);
      if (revenueByPlan[p.plan] !== undefined) revenueByPlan[p.plan] += amountCAD;
    });
    
    const users = await User.find({ plan: { $ne: 'free' } });
    users.forEach(u => {
      if (usersByPlan[u.plan] !== undefined) usersByPlan[u.plan]++;
    });
    
    // Recent activity
    const recentActivity = await Activity.find()
      .populate('userId', 'firstName lastName email')
      .sort({ timestamp: -1 })
      .limit(10);
    
    res.json({ 
      totalUsers, 
      paidUsers, 
      totalTests, 
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      revenueByPlan,
      usersByPlan,
      recentActivity: recentActivity.map(a => ({
        user: a.userId ? `${a.userId.firstName} ${a.userId.lastName}` : 'Unknown',
        email: a.userId?.email,
        action: a.action,
        time: a.timestamp
      }))
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/admin/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users.map(u => ({ 
      id: u._id, 
      name: `${u.firstName} ${u.lastName}`, 
      email: u.email, 
      role: u.role,
      isAdmin: u.isAdmin,
      plan: u.plan, 
      status: u.status, 
      joinedAt: u.joinedAt,
      lastActive: u.lastActive,
      testsTaken: u.testsTaken,
      progress: u.progress?.overall || 0
    })));
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/admin/users/:id/stats', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const testResults = await TestResult.find({ userId: user._id });
    const payments = await Payment.find({ userId: user._id, status: 'paid' });
    
    res.json({
      testsTaken: testResults.length,
      averageScore: testResults.length > 0 ? Math.round(testResults.reduce((sum, r) => sum + (r.score / r.maxScore * 100), 0) / testResults.length) : 0,
      studyTime: user.studyTime || 0,
      streak: user.streak || 0,
      payments: payments.map(p => ({
        plan: p.plan,
        amount: p.amount / 100,
        currency: p.currency,
        paidAt: p.paidAt
      }))
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/admin/users/:id/tests', protect, adminOnly, async (req, res) => {
  try {
    const tests = await TestResult.find({ userId: req.params.id })
      .populate('testId', 'title type')
      .sort({ completedAt: -1 });
    res.json(tests.map(t => ({
      testTitle: t.testTitle || t.testId?.title || 'Unknown Test',
      type: t.testType || t.testId?.type || 'unknown',
      score: Math.round((t.score / t.maxScore) * 100),
      completedAt: t.completedAt,
      timeSpent: t.timeSpent
    })));
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/admin/users/:id/activity', protect, adminOnly, async (req, res) => {
  try {
    const activities = await Activity.find({ userId: req.params.id })
      .sort({ timestamp: -1 })
      .limit(20);
    
    const user = await User.findById(req.params.id);
    
    res.json({
      isActive: activities.length > 0 && (new Date() - activities[0].timestamp) < 5 * 60 * 1000,
      currentAction: activities[0]?.action || 'None',
      activities: activities.map(a => ({
        action: a.action,
        details: a.details,
        time: a.timestamp
      }))
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/admin/payments', protect, adminOnly, async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 });
    
    res.json(payments.map(p => ({
      id: p._id,
      user: p.userId ? `${p.userId.firstName} ${p.userId.lastName}` : 'Unknown',
      email: p.userId?.email,
      amount: p.amount / 100,
      currency: p.currency,
      plan: p.plan,
      status: p.status,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
      razorpayOrderId: p.razorpayOrderId,
      razorpayPaymentId: p.razorpayPaymentId
    })));
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.get('/api/admin/live-activity', protect, adminOnly, async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentActivities = await Activity.find({ timestamp: { $gte: fiveMinutesAgo } })
      .populate('userId', 'firstName lastName email')
      .sort({ timestamp: -1 });
    
    // Group by user
    const userMap = new Map();
    recentActivities.forEach(a => {
      if (!userMap.has(a.userId?._id?.toString())) {
        userMap.set(a.userId?._id?.toString(), {
          userId: a.userId?._id,
          userName: a.userId ? `${a.userId.firstName} ${a.userId.lastName}` : 'Unknown',
          email: a.userId?.email,
          action: a.action,
          details: a.details,
          timestamp: a.timestamp
        });
      }
    });
    
    res.json(Array.from(userMap.values()));
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/admin/users/:id/grant', protect, adminOnly, async (req, res) => {
  try {
    const { plan } = req.body;
    const planDuration = { '1month': 30, '3months': 90, '6months': 180 };
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (planDuration[plan] || 30));
    
    await User.findByIdAndUpdate(req.params.id, {
      plan: plan,
      planExpiry: expiryDate
    });
    
    res.json({ message: 'Access granted successfully' });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

app.post('/api/admin/users/:id/revoke', protect, adminOnly, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { plan: 'free', planExpiry: null });
    res.json({ message: 'Access revoked successfully' });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ============================================
// SEED DATA
// ============================================

const seedData = async () => {

  const adminExists =
   await User.findOne({
     email:'admin@bigfrench.com'
   });

  if(!adminExists){
    await User.create({
      firstName:'Admin',
      lastName:'User',
      email:'admin@bigfrench.com',
      password:
        await bcrypt.hash('admin123',10),
      role:'admin',
      isAdmin:true,
      plan:'unlimited'
    });

    console.log(
     'Admin created: admin@bigfrench.com'
    );
  }

};

seedData();


// ============================================
// ROUTES
// ============================================

app.get('/',(req,res)=>{
  res.sendFile(
   path.join(__dirname,'../client/index.html')
  );
});


app.post('/api/coupon/validate', async (req,res)=>{

  const { code, plan, region='IN' } = req.body;

  const coupon =
   await Coupon.findOne({
     code:code?.toUpperCase(),
     active:true
   });

  if(!coupon)
   return res.json({
     valid:false,
     message:'Invalid coupon'
   });

  res.json({ valid:true });

});
/* =========================
   TEMP ERROR TEST
========================= */

app.get('/test-error',(req,res)=>{
   throw new Error("Test crash");
});


/* ===========================================
   ✅ GLOBAL ERROR HANDLER (ADD HERE)
=========================================== */

app.use(require('./middleware/errorHandler'));


/* ===========================================
   ✅ SERVER START (ALWAYS LAST)
=========================================== */

const PORT = process.env.PORT || 5000;

app.listen(PORT,()=>{

  console.log(
   `Server running on port ${PORT}`
  );

  console.log(
   `Admin panel: http://localhost:${PORT}/admin.html`
  );

});