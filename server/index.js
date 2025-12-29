require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xssClean = require('xss-clean');
const hpp = require('hpp');
const app = express();

// Security: remove X-Powered-By header
app.disable('x-powered-by');

// If behind a proxy (Vercel, Heroku, nginx) trust first proxy so secure cookies and x-forwarded-* work
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security middlewares
app.use(helmet());
app.use(mongoSanitize());
app.use(xssClean());
app.use(hpp());

// Quick patch: ensure Content-Security-Policy allows eval-based libs when needed
// NOTE: This weakens CSP by allowing 'unsafe-eval'. Use only if you trust all scripts.
app.use((req, res, next) => {
  // Quick patch: allow inline styles and eval where required (weakens CSP)
  res.setHeader('Content-Security-Policy', "default-src 'self' https: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https: data:; object-src 'none'; frame-ancestors 'none';");
  next();
});

// Rate limiter for API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// Enforce HTTPS in production (redirect HTTP -> HTTPS)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    if (proto && proto !== 'https') {
      return res.redirect('https://' + req.headers.host + req.url);
    }
  }
  return next();
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Import database utilities
const db = require('../api/lib/db');
// Notification emitter for realtime pushes (SSE/WebSocket)
const notify = require('../api/lib/notify');

// User Schema
const userSchema = new mongoose.Schema({
  // Basic Auth
  googleId: { type: String, sparse: true },
  email: { type: String, required: true, unique: true },
  firstName: { type: String, required: true, default: 'User' },
  lastName: { type: String, required: true, default: '' },
  password: String,
  profilePicture: { type: String, default: '' },
  
  // Email Verification
  isEmailVerified: { type: Boolean, default: false },
  verificationOTP: String,
  otpExpires: Date,
  
  // Password Reset
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  
  // Account Verification Fields
  realName: String,
  nationalId: String,
  contactNumber: String,
  homeAddress: String,
  idCardUrl: String,
  isAccountVerified: { type: Boolean, default: false },
  verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  verificationSubmittedAt: Date,
  
  // Additional Profile Information
  dateOfBirth: Date,
  gender: String,
  nationality: String,
  city: String,
  state: String,
  zipCode: String,
  country: String,
  phoneVerified: { type: Boolean, default: false },
  
  // Account Status
  accountStatus: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
  accountCreatedAt: { type: Date, default: Date.now },
  lastLoginAt: Date,
  
  // Account Statistics
  totalDeposits: { type: Number, default: 0 },
  totalWithdrawals: { type: Number, default: 0 },
  currentBalance: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },

  // Affiliate fields
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: String, default: null }, // user id/email who referred this user
  referralsCount: { type: Number, default: 0 },
  referrals: { type: [String], default: [] }, // list of referred user ids/emails
  totalReferralRewards: { type: Number, default: 0 },
  
  // KYC Status
  kycStatus: { type: String, enum: ['not-started', 'pending', 'verified', 'rejected'], default: 'not-started' },
  kycVerifiedAt: Date
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Passport Configuration
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('Google Profile:', JSON.stringify(profile, null, 2));
    
    // Extract user information from profile
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : '';
    const firstName = profile.name ? profile.name.givenName : profile.displayName.split(' ')[0];
    const lastName = profile.name ? profile.name.familyName : profile.displayName.split(' ').slice(1).join(' ');
    const profilePicture = profile.photos && profile.photos[0] ? profile.photos[0].value : '';

    // First check if user exists by Google ID
    let user = await User.findOne({ googleId: profile.id });
    
    if (!user) {
      // If no user found by Google ID, check by email
      user = await User.findOne({ email });
      
      if (user) {
        // If user exists with email, update their Google ID
        user.googleId = profile.id;
        user.firstName = firstName;
        user.lastName = lastName;
        user.profilePicture = profilePicture;
        await user.save();
      } else {
        // Create new user if doesn't exist at all
        user = await User.create({
          googleId: profile.id,
          email,
          firstName,
          lastName,
          profilePicture
        });
      }
    } else {
      // Update existing user's information
      user.firstName = firstName;
      user.lastName = lastName;
      user.profilePicture = profilePicture;
      await user.save();
    }
    
    return done(null, user);
  } catch (err) {
    console.error('Google Auth Error:', err);
    return done(err, null);
  }
}));

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Serve signup page with optional server-side injected referral code
app.get(['/signup', '/signup.html'], (req, res) => {
  try {
    const ref = req.query.ref;
    const filePath = path.join(__dirname, '../signup.html');
    let html = fs.readFileSync(filePath, 'utf8');
    if (ref) {
      // Insert a hidden input inside the signup form so server-rendered pages carry the referral code
      html = html.replace(/(<form[^>]*id=["']signupForm["'][^>]*>)/i, `$1\n  <input type="hidden" name="referralCode" id="serverRef" value="${ref}">`);
      // Also inject a small script to expose it to client JS as fallback
      html = html.replace(/(<script src="js\/auth-shared.js"><\/script>)/i, `$1\n  <script>window.serverReferral = ${JSON.stringify(ref)};</script>`);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('Error serving signup with referral:', err);
    return res.sendFile(path.join(__dirname, '../signup.html'));
  }
});

app.use(express.static(path.join(__dirname, '../')));

// Proxy endpoint to serve vendor/qrcode.min.js from CDN but under same-origin
// This allows CSP 'script-src' 'self' to permit the library while still
// fetching the canonical copy from the CDN.
app.get('/vendor/qrcode.min.js', (req, res) => {
  const https = require('https');
  const cdnUrl = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  https.get(cdnUrl, (cdnRes) => {
    const status = cdnRes.statusCode || 200;
    if (status >= 400) {
      res.status(502).send('/* Failed to fetch qrcode library from CDN */');
      return;
    }
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // cache for 1 day
    cdnRes.pipe(res);
  }).on('error', (err) => {
    console.error('Error proxying qrcode.min.js:', err);
    res.status(502).send('/* Error proxying qrcode library */');
  });
});

// Proxy Chart.js build so pages can load it under same-origin (CSP 'self')
app.get('/vendor/chart.umd.min.js', (req, res) => {
  const https = require('https');
  const cdnUrl = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  https.get(cdnUrl, (cdnRes) => {
    const status = cdnRes.statusCode || 200;
    if (status >= 400) {
      res.status(502).send('/* Failed to fetch Chart.js from CDN */');
      return;
    }
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    cdnRes.pipe(res);
  }).on('error', (err) => {
    console.error('Error proxying Chart.js:', err);
    res.status(502).send('/* Error proxying Chart.js library */');
  });
});

// Proxy Chart.js DataLabels plugin for CSP 'self'
app.get('/vendor/chartjs-plugin-datalabels.min.js', (req, res) => {
  const https = require('https');
  const cdnUrl = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js';
  https.get(cdnUrl, (cdnRes) => {
    const status = cdnRes.statusCode || 200;
    if (status >= 400) {
      res.status(502).send('/* Failed to fetch chartjs-plugin-datalabels from CDN */');
      return;
    }
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    cdnRes.pipe(res);
  }).on('error', (err) => {
    console.error('Error proxying chartjs-plugin-datalabels:', err);
    res.status(502).send('/* Error proxying plugin */');
  });
});

// File upload middleware
const fileUpload = require('express-fileupload');
app.use(fileUpload({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  useTempFiles: true,
  tempFileDir: '/tmp/'
}));

// Session Configuration
const mongoStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  ttl: 24 * 60 * 60, // Session TTL (1 day)
  touchAfter: 24 * 3600 // Lazy session update (touch after 24 hours)
});

// Handle MongoStore errors
mongoStore.on('error', (error) => {
  console.warn('Session store error (non-critical):', error.message);
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: mongoStore,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // Cookie expiry (1 day)
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Auth Routes
const bcrypt = require('bcrypt');
const { generateOTP, sendOTPEmail, sendResetPasswordEmail } = require('../api/lib/email');

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Generate OTP and set expiry
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if email service configured
    const emailConfigured = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

    // Create new user. If email is not configured we will auto-verify to allow local/dev signups.
    user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      verificationOTP: emailConfigured ? otp : undefined,
      otpExpires: emailConfigured ? otpExpires : undefined,
      isEmailVerified: !emailConfigured
    });

    if (emailConfigured) {
      // Send verification email
      const emailSent = await sendOTPEmail(email, otp);

      if (!emailSent) {
        // If we failed to send, keep the user but inform client
        console.error('Failed to send verification email to', email);
        return res.status(500).json({ message: 'Failed to send verification email' });
      }

      return res.json({
        message: 'Please check your email for verification code',
        email: email,
        userId: user._id,
        isEmailVerified: false
      });
    }

    // Email not configured: auto-verified for local/dev convenience
    // Auto-login the user when email is not configured so local/dev flows work
    req.login(user, (err) => {
      if (err) {
        console.error('Auto-login error after signup:', err);
        return res.status(500).json({ message: 'Account created but failed to login' });
      }
      return res.json({
        message: 'Account created. Email service not configured; account auto-verified for local development.',
        email: email,
        userId: user._id,
        isEmailVerified: true
      });
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Error creating account' });
  }
});

// Verify OTP endpoint
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log('[OTP VERIFY] Email:', email, 'OTP entered:', otp);

    // Find user by email (not yet filtering by OTP)
    const user = await User.findOne({ email });
    if (!user) {
      console.warn('[OTP VERIFY] No user found for email:', email);
      return res.status(400).json({ message: 'Invalid or expired verification code' });
    }
    console.log('[OTP VERIFY] User found. Expected OTP:', user.verificationOTP, 'Expires:', user.otpExpires, 'isEmailVerified:', user.isEmailVerified);

    // Check if already verified
    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email already verified. Please log in.' });
    }

    // Check OTP and expiry
    if (!user.verificationOTP || user.verificationOTP !== otp || !user.otpExpires || user.otpExpires < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired verification code' });
    }

    // Mark email as verified
    user.isEmailVerified = true;
    user.verificationOTP = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Log the user in
    req.login(user, (err) => {
      if (err) {
        console.error('Login error:', err);
        return res.status(500).json({ message: 'Error logging in' });
      }
      res.json({ message: 'Email verified successfully' });
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ message: 'Error verifying email' });
  }
});

// Resend OTP endpoint
app.post('/api/auth/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email, isEmailVerified: false });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or already verified' });
    }

    // Generate new OTP
    const otp = generateOTP();
    user.verificationOTP = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Send new verification email
    const emailSent = await sendOTPEmail(email, otp);
    if (!emailSent) {
      return res.status(500).json({ message: 'Failed to send verification email' });
    }

    res.json({ message: 'New verification code sent' });
  } catch (error) {
    console.error('Resend error:', error);
    res.status(500).json({ message: 'Error resending verification code' });
  }
});

app.get('/api/auth/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

app.get('/api/auth/google/callback',
  passport.authenticate('google', {
    // All users go to dashboard after OAuth login
    successRedirect: '/dashboard',
    failureRedirect: '/index.html'
  })
);

// Dashboard Page
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    if (!user.isEmailVerified) {
      return res.status(400).json({ 
        message: 'Please verify your email first',
        needsVerification: true,
        email: email
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    req.login(user, (err) => {
      if (err) {
        console.error('Login error:', err);
        return res.status(500).json({ message: 'Error logging in' });
      }
      res.json({ message: 'Login successful' });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// Check Auth Status
app.get('/api/auth/status', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ 
      isAuthenticated: true, 
      user: {
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        profilePicture: req.user.profilePicture,
        isEmailVerified: req.user.isEmailVerified
      } 
    });
  } else {
    res.json({ isAuthenticated: false });
  }
});

// Get Complete User Profile Data
app.get('/api/user/profile', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await User.findById(req.user.id).select('-password -verificationOTP -resetPasswordToken');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Ensure every user has a referral code (generated on-demand)
    if (!user.referralCode) {
      try {
        user.referralCode = crypto.randomBytes(4).toString('hex');
        await user.save();
      } catch (e) {
        // ignore potential duplicate key collision - leave blank if failed
        console.warn('Failed to generate referralCode for user', user._id, e.message);
      }
    }

    res.json({
      success: true,
      user: {
        // Basic Info
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture,
        
        // Contact Info
        contactNumber: user.contactNumber,
        
        // Verification Status
        isEmailVerified: user.isEmailVerified,
        isAccountVerified: user.isAccountVerified,
        verificationStatus: user.verificationStatus,
        kycStatus: user.kycStatus,
        
        // KYC Information (if verified)
        realName: user.realName,
        nationalId: user.nationalId,
        homeAddress: user.homeAddress,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        nationality: user.nationality,
        city: user.city,
        state: user.state,
        zipCode: user.zipCode,
        country: user.country,
        
        // Account Status
        accountStatus: user.accountStatus,
        accountCreatedAt: user.accountCreatedAt,
        lastLoginAt: user.lastLoginAt,
        
        // Financial Info
        totalDeposits: user.totalDeposits,
        totalWithdrawals: user.totalWithdrawals,
        currentBalance: user.currentBalance,
        totalEarnings: user.totalEarnings,
        // Affiliate fields
        referralCode: user.referralCode,
        referredBy: user.referredBy,
        referralsCount: user.referralsCount,
        referrals: user.referrals || [],
        totalReferralRewards: user.totalReferralRewards || 0,
        
        // Timestamps
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// Update User Profile
app.put('/api/user/profile', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { firstName, lastName, dateOfBirth, gender, nationality, city, state, zipCode, country } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update allowed fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (dateOfBirth) user.dateOfBirth = new Date(dateOfBirth);
    if (gender) user.gender = gender;
    if (nationality) user.nationality = nationality;
    if (city) user.city = city;
    if (state) user.state = state;
    if (zipCode) user.zipCode = zipCode;
    if (country) user.country = country;

    await user.save();

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// Affiliate info - returns referral link, counts and recent referral transactions
app.get('/api/affiliate/info', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
    const user = await User.findById(req.user.id).select('-password -verificationOTP -resetPasswordToken');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // ensure referralCode exists
    if (!user.referralCode) {
      try { user.referralCode = crypto.randomBytes(4).toString('hex'); await user.save(); } catch(e){}
    }

    // compute stage and reward
    const count = Number(user.referralsCount || 0);
    let stage = 'Bronze'; let reward = 2;
    if (count > 25) { stage = 'Platinum'; reward = 10; }
    else if (count === 25) { stage = 'Gold'; reward = 8; }
    else if (count >= 10) { stage = 'Silver'; reward = 5; }

    // fetch recent referral-related transactions for this user
    const txs = await db.TransactionHistory.find({ userId: user.email, type: 'earnings', 'details.planName': 'referral' })
      .sort({ submittedAt: -1 }).limit(8).lean();

    // also fetch recent referral earnings where this user is the referrer (for referred users list)
    const recentReferrals = txs.map(t => ({ amount: t.amount, description: t.description, submittedAt: t.submittedAt }));

    res.json({
      success: true,
      referralCode: user.referralCode,
      referralLink: `${req.protocol}://${req.get('host')}/?ref=${user.referralCode}`,
      referralsCount: user.referralsCount || 0,
      referrals: user.referrals || [],
      totalReferralRewards: user.totalReferralRewards || 0,
      currentBalance: user.currentBalance || 0,
      stage,
      reward,
      recentReferrals
    });
  } catch (error) {
    console.error('Affiliate info error', error);
    res.status(500).json({ message: 'Error fetching affiliate info' });
  }
});

// Register a referral (called during signup flow when a new user registers with ref code)
app.post('/api/affiliate/register', async (req, res) => {
  try {
    const { refCode, referredUserId } = req.body;
    if (!refCode || !referredUserId) return res.status(400).json({ message: 'Missing refCode or referredUserId' });

    const referrer = await User.findOne({ referralCode: refCode });
    if (!referrer) return res.status(404).json({ message: 'Referrer not found' });

    const referred = await User.findById(referredUserId);
    if (!referred) return res.status(404).json({ message: 'Referred user not found' });

    // prevent double registration
    if (referred.referredBy) return res.status(400).json({ message: 'User already has a referrer' });

    // mark referral
    referred.referredBy = referrer._id.toString();
    await referred.save();

    referrer.referrals = referrer.referrals || [];
    referrer.referrals.push(referred._id.toString());
    referrer.referralsCount = (referrer.referralsCount || 0) + 1;

    // determine reward per referral based on new count
    let reward = 2;
    const c = referrer.referralsCount;
    if (c > 25) reward = 10;
    else if (c === 25) reward = 8;
    else if (c >= 10) reward = 5;

    // credit both users via db.addEarnings (uses userId as email)
    try {
      await db.addEarnings(referrer.email, reward, 'referral', null);
    } catch (e) { console.error('Failed to credit referrer', e); }
    try {
      await db.addEarnings(referred.email, reward, 'referral', null);
    } catch (e) { console.error('Failed to credit referred user', e); }

    referrer.totalReferralRewards = (referrer.totalReferralRewards || 0) + reward;
    await referrer.save();

    res.json({ success: true, reward, referralsCount: referrer.referralsCount });
  } catch (error) {
    console.error('Register referral error', error);
    res.status(500).json({ message: 'Error registering referral' });
  }
});

// Logout Route
app.get('/api/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Change Password Route
app.post('/api/auth/change-password', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Missing password fields' });
    }

    const user = await User.findById(req.user.id);
    if (!user || !user.password) {
      return res.status(400).json({ message: 'Unable to change password for OAuth users' });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
});

// Submit Account Verification
app.post('/api/account/verify', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const { realName, nationalId, contactNumber, homeAddress } = req.body;
    if (!realName || !nationalId || !contactNumber || !homeAddress) {
      return res.status(400).json({ message: 'Missing required verification fields' });
    }

    if (!req.files || !req.files.idUpload) {
      return res.status(400).json({ message: 'ID document is required' });
    }

    // Save file temporarily or upload to cloud storage
    const idFile = req.files.idUpload;
    const uploadPath = path.join(__dirname, '../uploads/verifications/', req.user.email + '_' + Date.now() + path.extname(idFile.name));
    
    // Create directory if it doesn't exist
    const uploadDir = path.dirname(uploadPath);
    if (!require('fs').existsSync(uploadDir)) {
      require('fs').mkdirSync(uploadDir, { recursive: true });
    }

    await idFile.mv(uploadPath);

    // Update user with verification info
    const user = await User.findById(req.user.id);
    user.realName = realName;
    user.nationalId = nationalId;
    user.contactNumber = contactNumber;
    user.homeAddress = homeAddress;
    user.idCardUrl = uploadPath;
    user.verificationStatus = 'pending';
    user.verificationSubmittedAt = new Date();
    await user.save();

    // Do NOT auto-verify: verification should be performed by staff or a separate validation process.
    res.json({ message: 'Verification submitted successfully. Your account is pending review.' });
  } catch (error) {
    console.error('Account verification error:', error);
    res.status(500).json({ message: 'Error submitting verification' });
  }
});

// Get Account Verification Status
app.get('/api/account/verification-status', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await User.findById(req.user.id);
    res.json({
      verified: user.isAccountVerified,
      status: user.verificationStatus,
      submittedAt: user.verificationSubmittedAt
    });
  } catch (error) {
    console.error('Verification status error:', error);
    res.status(500).json({ message: 'Error fetching verification status' });
  }
});

// Dashboard Page
app.get('/dashboard', (req, res) => {
  if (req.isAuthenticated()) {
    res.sendFile(path.join(__dirname, '../dashboard.html'));
  } else {
    res.redirect('/login');
  }
});



// Test email endpoint (remove in production)
app.get('/api/test-email', async (req, res) => {
  try {
    const nodemailer = require('nodemailer');
    // Create test account
    const testAccount = await nodemailer.createTestAccount();
    console.log('Test account created:', testAccount);

    const { sendOTPEmail } = require('../api/lib/email');
    const testOTP = '123-456';
    console.log('Attempting to send email to:', process.env.GMAIL_USER);
    const result = await sendOTPEmail(process.env.GMAIL_USER, testOTP);
    res.json({ 
      success: result, 
      message: 'Check your email for test OTP',
      testAccount: testAccount 
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
});

// Deposit Schema
const depositSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  planType: { type: String, required: true },
  planName: { type: String, required: true },
  amount: { type: Number, required: true },
  depositAddress: { type: String, required: true },
  transactionId: { type: String, default: '' },
  notes: { type: String, default: '' },
  proofFileName: { type: String, required: true },
  proofUrl: { type: String, default: '' }, // Cloudinary URL
  status: { type: String, default: 'pending' }, // pending, approved, rejected
  approvalStatus: { type: String, default: 'pending' }, // pending, approved, rejected
  approvedBy: { type: String, default: '' }, // admin email
  submittedAt: { type: Date, default: Date.now },
  approvedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' }
});

const Deposit = mongoose.model('Deposit', depositSchema);

// Plan Enrollment Schema (for tracking active plans)
const planEnrollmentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  planType: { type: String, required: true },
  planName: { type: String, required: true },
  amount: { type: Number, required: true },
  depositId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deposit' },
  enrolledAt: { type: Date, default: Date.now },
  approvalStatus: { type: String, default: 'pending' }, // pending, approved, rejected
  approvedAt: { type: Date, default: null },
  status: { type: String, default: 'active' } // active, expired, cancelled
});

const PlanEnrollment = mongoose.model('PlanEnrollment', planEnrollmentSchema);

// Withdrawal Schema
const withdrawalSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  withdrawalAddress: { type: String, required: true },
  network: { type: String, default: 'ERC20' },
  status: { type: String, default: 'pending' }, // pending, approved, completed, rejected
  approvalStatus: { type: String, default: 'pending' }, // pending, approved, rejected
  transactionId: { type: String, default: '' },
  notes: { type: String, default: '' },
  approvedBy: { type: String, default: '' }, // admin email
  submittedAt: { type: Date, default: Date.now },
  approvedAt: { type: Date, default: null },
  processedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' }
});

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

// Deposit submission endpoint
app.post('/api/deposits/submit', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { planType, planName, transactionId, notes, depositAddress, proofUrl } = req.body;
    const proofFile = req.files?.proofFile;

    // Validate required fields
    if (!planType || !planName) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    let proofFileUrl = proofUrl;
    let proofFileName = '';

    // If file is provided directly, upload to Cloudinary
    if (proofFile) {
      try {
        const cloudinary = require('cloudinary').v2;
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET
        });

        console.log('Uploading proof to Cloudinary...');
        
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              resource_type: 'auto',
              folder: 'black-rock-deposits',
              public_id: `deposit_${req.user._id}_${Date.now()}`,
              overwrite: true
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          
          const fs = require('fs');
          fs.createReadStream(proofFile.tempFilePath)
            .on('error', reject)
            .pipe(stream);
        });

        proofFileUrl = uploadResult.secure_url;
        proofFileName = uploadResult.public_id;

        // Clean up temp file
        try {
          require('fs').unlinkSync(proofFile.tempFilePath);
        } catch (cleanupError) {
          console.warn('Could not delete temp file:', cleanupError.message);
        }
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ message: 'Failed to upload proof to Cloudinary' });
      }
    }

    if (!proofFileUrl && !proofUrl) {
      return res.status(400).json({ message: 'Proof file is required' });
    }

    // Create deposit record with Cloudinary URL
    const deposit = await Deposit.create({
      userId: req.user.email,
      planType,
      planName,
      amount: getPlanAmount(planType),
      depositAddress,
      transactionId: transactionId || '',
      notes: notes || '',
      proofFileName: proofFileName || 'cloudinary-upload',
      proofUrl: proofFileUrl
    });

    // Create plan enrollment record
    const enrollment = await PlanEnrollment.create({
      userId: req.user.email,
      planType,
      planName,
      amount: getPlanAmount(planType),
      depositId: deposit._id
    });

    // Record transaction in history database
    await db.recordTransaction(req.user.email, {
      type: 'deposit',
      amount: getPlanAmount(planType),
      description: `Deposit for ${planName} plan`,
      details: {
        planName,
        planType,
        depositAddress,
        proofUrl: proofFileUrl,
        depositId: deposit._id.toString()
      }
    });

    res.json({
      message: 'Deposit submitted successfully',
      depositId: deposit._id,
      enrollment: enrollment,
      proofUrl: proofFileUrl
    });

  } catch (error) {
    console.error('Deposit submission error:', error);
    res.status(500).json({ message: 'Error submitting deposit' });
  }
});

// Helper function to get plan amount
function getPlanAmount(planType) {
  const amounts = {
    basic: 50,
    standard: 100,
    premium: 500
  };
  return amounts[planType] || 0;
}

// Helper: plan ROI rates (daily %)
function getPlanDailyROI(planType) {
  const rates = {
    basic: 0.5,      // 0.5% daily
    standard: 0.75,  // 0.75% daily
    premium: 1.0     // 1% daily
  };
  return (rates[planType] || 0) / 100;
}

// Get user's deposits
app.get('/api/deposits/my', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const deposits = await Deposit.find({ userId: req.user.email })
      .sort({ submittedAt: -1 });

    res.json(deposits);
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({ message: 'Error fetching deposits' });
  }
});

// Get user's active plans
app.get('/api/plans/my', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const activePlans = await PlanEnrollment.find({ 
      userId: req.user.email,
      status: 'active'
    }).populate('depositId');

    res.json(activePlans);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ message: 'Error fetching plans' });
  }
});

// Cloudinary Configuration Endpoint
app.get('/api/cloudinary/config', (req, res) => {
  try {
    // Return Cloudinary configuration for client-side uploads
    const cloudinaryConfig = {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET,
      apiKey: process.env.CLOUDINARY_API_KEY // Only send public API key
    };

    // Validate that Cloudinary is configured
    if (!cloudinaryConfig.cloudName || !cloudinaryConfig.uploadPreset) {
      return res.status(500).json({ 
        message: 'Cloudinary is not properly configured. Please check .env file.',
        configured: false
      });
    }

    res.json({
      ...cloudinaryConfig,
      configured: true
    });
  } catch (error) {
    console.error('Cloudinary config error:', error);
    res.status(500).json({ message: 'Error fetching Cloudinary configuration' });
  }
});

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    server: 'running'
  });
});

// Cloudinary Upload Endpoint (Server-side proxy)
// This endpoint receives the file from the client and uploads it to Cloudinary using the API key/secret
// This is more secure and reliable than unsigned direct uploads
app.post('/api/cloudinary/upload', async (req, res) => {
  try {
    console.log('=== Cloudinary Upload Request ===');
    
    // Check if user is authenticated
    if (!req.isAuthenticated()) {
      console.warn('Upload request from unauthenticated user');
      return res.status(401).json({ message: 'Please log in to upload', success: false });
    }
    
    const user = req.user;
    console.log('User:', user.email);
    
    // Get the file from request
    if (!req.files || !req.files.file) {
      console.error('No file provided');
      return res.status(400).json({ message: 'No file provided', success: false });
    }
    
    const file = req.files.file;
    console.log('File received:', {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype
    });
    
    // Validate file size (max 5MB)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      console.error('File too large:', file.size);
      return res.status(400).json({ message: 'File size exceeds 5MB limit', success: false });
    }
    
    // Validate file type
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      console.error('Invalid file type:', file.mimetype);
      return res.status(400).json({ message: 'Invalid file type. Allowed: JPG, PNG, PDF', success: false });
    }
    
    // Import Cloudinary at runtime to avoid startup issues if not configured
    const cloudinary = require('cloudinary').v2;
    
    // Configure Cloudinary with API credentials
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    
    // Verify Cloudinary is configured
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('Cloudinary not configured');
      return res.status(500).json({ message: 'Cloudinary not configured on server', success: false });
    }
    
    console.log('Uploading to Cloudinary...');
    
    // Import fs to read the temp file
    const fs = require('fs');
    
    // Since useTempFiles: true is configured, file is stored at tempFilePath
    // Read the temp file and upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          folder: 'black-rock-deposits',
          public_id: `deposit_${user._id}_${Date.now()}`,
          overwrite: true
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      // Create read stream from the temp file and pipe to Cloudinary upload stream
      fs.createReadStream(file.tempFilePath)
        .on('error', reject)
        .pipe(stream);
    });
    
    console.log('Cloudinary upload successful');
    console.log('Secure URL:', uploadResult.secure_url);
    
    // Clean up the temp file
    try {
      fs.unlinkSync(file.tempFilePath);
    } catch (cleanupError) {
      console.warn('Could not delete temp file:', cleanupError.message);
    }
    
    // Return the URL to the client
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    res.write(JSON.stringify({
      message: 'File uploaded successfully',
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      success: true
    }));
    
    res.end();
    console.log('Upload response sent');

  } catch (error) {
    console.error('Cloudinary upload error:', error);
    console.error('Error message:', error.message);
    console.error('Error details:', error);
    
    if (!res.headersSent) {
      res.writeHead(500, {
        'Content-Type': 'application/json'
      });
    }
    
    res.write(JSON.stringify({ 
      message: 'Upload failed: ' + error.message,
      success: false
    }));
    
    res.end();
  }
});


// Custom Deposit Submit Endpoint
app.post('/api/deposits/custom-submit', async (req, res) => {
  try {
    console.log('=== Custom Deposit Request ===');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('Session ID:', req.sessionID);
    console.log('Is Authenticated:', req.isAuthenticated());
    console.log('User:', req.user);
    
    // Check if user is authenticated
    // Note: If not authenticated, still allow the deposit but mark as unverified
    const isAuthenticated = req.isAuthenticated();
    const user = req.user;
    
    if (!isAuthenticated || !user) {
      console.warn('User not authenticated for custom deposit');
      // For now, we'll require authentication
      // In production, you might allow unauthenticated deposits with verification
      return res.status(401).json({ message: 'Please log in to submit a deposit' });
    }

    const { amount, depositAddress, proofUrl, fileName, fileSize } = req.body;

    // Validate required fields
    if (!amount || !depositAddress || !proofUrl) {
      console.error('Missing required fields:', { amount, depositAddress, proofUrl });
      return res.status(400).json({ message: 'Missing required fields: amount, depositAddress, or proofUrl' });
    }

    // Validate amount is a positive number
    if (typeof amount !== 'number' || amount <= 0) {
      console.error('Invalid amount:', amount);
      return res.status(400).json({ message: 'Invalid amount' });
    }

    // Validate amount is within reasonable range
    if (amount > 1000000) {
      return res.status(400).json({ message: 'Amount exceeds maximum limit' });
    }

    // Persist custom deposit to the database using the existing Deposit model
    // Use planType 'custom' and planName 'Custom Deposit' so it behaves like normal deposits
    const depositDoc = await Deposit.create({
      userId: user.email,
      planType: 'custom',
      planName: 'Custom Deposit',
      amount: amount,
      depositAddress: depositAddress,
      transactionId: '',
      notes: '',
      proofFileName: fileName || 'proof_document',
      proofUrl: proofUrl,
      status: 'pending',
      approvalStatus: 'pending',
      submittedAt: new Date()
    });

    // Optionally create a PlanEnrollment if your business logic requires it. For custom deposits
    // we do not auto-create a plan enrollment by default. If you want an enrollment, uncomment below.
    // const enrollment = await PlanEnrollment.create({ userId: user.email, planType: 'custom', planName: 'Custom Deposit', amount, depositId: depositDoc._id });

    // Record transaction in transaction history so admin panel (and database-driven flows) see it
    const recordedTx = await db.recordTransaction(user.email, {
      type: 'deposit',
      amount: amount,
      description: `Custom deposit of ${amount} USDT`,
      details: {
        depositAddress,
        proofUrl,
        fileName,
        depositId: depositDoc._id.toString()
      }
    });
    console.log('Recorded transaction id:', recordedTx?._id);

    // Return persisted deposit info
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    res.write(JSON.stringify({
      message: 'Deposit submitted successfully',
      depositId: depositDoc._id,
      transactionId: recordedTx?._id,
      deposit: depositDoc,
      success: true
    }));

    res.end();
    console.log('Custom deposit persisted and response completed successfully:', depositDoc._id);

  } catch (error) {
    console.error('Custom deposit submission error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    if (!res.headersSent) {
      res.writeHead(500, {
        'Content-Type': 'application/json'
      });
    }
    
    res.write(JSON.stringify({ 
      message: 'Error submitting deposit: ' + error.message,
      success: false
    }));
    
    res.end();
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Schedule daily earnings processing at server-local midnight (00:00) daily.
try {
  // Run once at startup to catch up
  db.processDailyEarnings().catch(err => console.error('Initial processDailyEarnings error:', err));
  // Ensure today's per-transaction rewards exist (in case a run was missed)
  db.ensureDailyRewardsForToday && db.ensureDailyRewardsForToday().catch(err => console.error('ensureDailyRewardsForToday error:', err));

  // compute milliseconds until next local midnight
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setDate(now.getDate() + 1);
  nextMidnight.setHours(0,0,0,0);
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  // Set a timeout to run at the next midnight, then run every 24 hours
  setTimeout(() => {
    db.processDailyEarnings().catch(err => console.error('processDailyEarnings (midnight) error:', err));
    setInterval(() => {
      db.processDailyEarnings().catch(err => console.error('processDailyEarnings (midnight) error:', err));
    }, 24 * 60 * 60 * 1000);
    console.log('⏱️ processDailyEarnings scheduled to run nightly at 00:00');
  }, msUntilMidnight);

  console.log(`⏱️ processDailyEarnings will run in ${Math.round(msUntilMidnight/1000/60)} minutes at local midnight`);
} catch (err) {
  console.error('Error scheduling processDailyEarnings:', err);
}

// Forgot password - send reset link
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email });

    // Always respond with success to avoid leaking which emails exist
    if (!user) {
      console.log('Forgot password request for non-existent email:', email);
      return res.json({ message: 'If that account exists, we have sent a reset link to the email.' });
    }

    // Validate Gmail credentials are configured
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.error('Gmail credentials not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD env vars.');
      return res.status(500).json({ message: 'Email service is not configured. Please contact support.' });
    }

    // Generate token and hashed token to store
    const token = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(token).digest('hex');

    user.resetPasswordToken = hashed;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const link = `${base}/reset-password.html?token=${token}&email=${encodeURIComponent(email)}`;

    console.log('Sending reset password email to:', email);
    console.log('Reset link:', link);
    
    const sent = await sendResetPasswordEmail(email, link);
    if (!sent) {
      // don't reveal too much; remove token
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      console.error('Failed to send reset email to:', email);
      return res.status(500).json({ message: 'Unable to send reset email. Please try again later.' });
    }

    console.log('Reset password email sent successfully to:', email);
    res.json({ message: 'If that account exists, we have sent a reset link to the email.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Error processing request. Please try again later.' });
  }
});

// Reset password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) return res.status(400).json({ message: 'Missing parameters' });
    if (newPassword.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

    console.log('Reset password attempt for:', email);
    
    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({ email, resetPasswordToken: hashed, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) {
      console.warn('Invalid or expired reset token for:', email);
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Hash and set new password
    const newHashed = await bcrypt.hash(newPassword, 10);
    user.password = newHashed;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    console.log('Password reset successful for:', email);
    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Error resetting password' });
  }
});

// Dashboard: SSE endpoint for real-time balance updates
app.get('/api/dashboard/balance-stream', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const userId = req.user.email;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // FIX: Send actual balance from UserBalance collection (includes earnings)
  const sendBalance = async () => {
    try {
      const balanceSummary = await db.getBalanceSummary(userId);
      const balance = balanceSummary.currentBalance || 0;
      res.write(`data: ${JSON.stringify({ balance, updatedAt: new Date() })}\n\n`);
    } catch (err) {
      console.error('SSE balance error:', err);
      res.write(`data: ${JSON.stringify({ error: 'Failed to fetch balance' })}\n\n`);
    }
  };

  sendBalance();

  // Send updates every 5 seconds
  const interval = setInterval(() => {
    sendBalance().catch(err => console.error('SSE sendBalance error:', err));
  }, 5000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// Dashboard: return current balance for authenticated user
app.get('/api/dashboard/balance', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });

    // FIX: Get actual balance from UserBalance collection (includes earnings)
    const balanceSummary = await db.getBalanceSummary(req.user.email);
    const balance = balanceSummary.currentBalance || 0;

    res.json({ balance, currency: 'USD', updatedAt: new Date() });
  } catch (err) {
    console.error('Dashboard balance error:', err);
    res.status(500).json({ message: 'Error fetching balance' });
  }
});

// Dashboard: daily growth series based on plan enrollments with expected ROI
app.get('/api/dashboard/growth', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });

    const days = parseInt(req.query.days, 10) || 30;
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));

    // Prefer actual credited earnings for growth chart: aggregate 'earnings' transactions per day
    const txs = await db.TransactionHistory.find({
      userId: req.user.email,
      type: 'earnings',
      approvalStatus: 'approved',
      submittedAt: { $gte: start, $lte: end }
    }).lean();

    // Build a date -> amount map initialized to zero for the range
    const growthMap = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      growthMap[key] = 0;
    }

    txs.forEach(t => {
      // Prefer approvedAt (when earnings were actually credited), fall back to submittedAt
      const dateSource = t.approvedAt || t.submittedAt || t.createdAt || new Date();
      const key = new Date(dateSource).toISOString().slice(0, 10);
      if (growthMap[key] !== undefined) {
        const amt = Number(t.amount || 0);
        // keep sums precise to cents
        growthMap[key] = Math.round(((growthMap[key] || 0) + amt) * 100) / 100;
      }
    });

    // If there are no earnings transactions (e.g., before any credits), fallback to expected enrollments
    const hasEarnings = txs && txs.length > 0;
    if (!hasEarnings) {
      const enrollments = await PlanEnrollment.find({ userId: req.user.email, status: 'active' }).populate('depositId');
      enrollments.forEach(enr => {
        const enrollDate = new Date(enr.enrolledAt);
        const deposit = enr.depositId;
        if (!deposit || !deposit.amount) return;
        const roi = getPlanDailyROI(enr.planType);
        const dailyReturn = deposit.amount * roi;
        for (let i = 0; i < days; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const key = d.toISOString().slice(0, 10);
          if (d >= enrollDate) growthMap[key] += dailyReturn;
        }
      });
    }

    const series = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      series.push({ date: key, amount: Math.round((growthMap[key] || 0) * 100) / 100 });
    }

    res.json({ series, currency: 'USD', note: 'Daily credited earnings (computed from approved earnings transactions; fallback: expected returns)' });
  } catch (err) {
    console.error('Dashboard growth error:', err);
    res.status(500).json({ message: 'Error fetching growth data' });
  }
});

// Dashboard: SSE endpoint for real-time growth updates (sends daily series)
app.get('/api/dashboard/growth-stream', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
  const userId = req.user.email;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  async function sendGrowth() {
    try {
      const days = 30;
      const end = new Date();
      const start = new Date(end);
      start.setDate(end.getDate() - (days - 1));

      const txs = await db.TransactionHistory.find({
        userId,
        type: 'earnings',
        approvalStatus: 'approved',
        submittedAt: { $gte: start, $lte: end }
      }).lean();

      const growthMap = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        growthMap[key] = 0;
      }

      txs.forEach(t => {
        const dateSource = t.approvedAt || t.submittedAt || t.createdAt || new Date();
        const key = new Date(dateSource).toISOString().slice(0, 10);
        if (growthMap[key] !== undefined) {
          const amt = Number(t.amount || 0);
          growthMap[key] = Math.round(((growthMap[key] || 0) + amt) * 100) / 100;
        }
      });

      const series = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        series.push({ date: key, amount: Math.round((growthMap[key] || 0) * 100) / 100 });
      }

      res.write(`data: ${JSON.stringify({ series, updatedAt: new Date() })}\n\n`);
    } catch (err) {
      console.error('SSE growth send error:', err);
      res.write(`data: ${JSON.stringify({ error: 'Failed to fetch growth' })}\n\n`);
    }
  }

  sendGrowth();
  const interval = setInterval(() => sendGrowth().catch(e => console.error(e)), 60000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// Dashboard: balance history series for charts (returns array of {date, action, amount, balance})
app.get('/api/dashboard/balance-history', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });

    // Accept either `days` or `hours` to support hourly charts. hours takes precedence when provided.
    const hours = req.query.hours ? parseInt(req.query.hours, 10) : null;
    if (hours && hours > 0) {
      const history = await db.getBalanceHistoryHours(req.user.email, hours);
      return res.json({ series: history, currency: 'USD', hoursRequested: hours });
    }

    const days = parseInt(req.query.days, 10) || 365; // default to 365 days
    const history = await db.getBalanceHistory(req.user.email, days);

    // Return as-is (db.getBalanceHistory already formats date and amounts)
    res.json({ series: history, currency: 'USD', daysRequested: days });
  } catch (err) {
    console.error('Dashboard balance-history error:', err);
    res.status(500).json({ message: 'Error fetching balance history' });
  }
});

// Get user's current balance (total deposits - withdrawals)
app.get('/api/user/balance', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = req.user.email;

    // Get balance from database
    const balanceSummary = await db.getBalanceSummary(userId);

    res.json({
      balance: balanceSummary.currentBalance,
      deposits: balanceSummary.totalDeposits,
      earnings: balanceSummary.totalEarnings,
      withdrawals: balanceSummary.totalWithdrawals
    });
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ message: 'Error fetching balance' });
  }
});

// Submit withdrawal request
app.post('/api/withdrawals/submit', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { address, amount, network } = req.body;
    const userId = req.user.email;

    // Validate inputs
    if (!address || !amount || !network) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Validate ERC20 address format
    const erc20Regex = /^0x[a-fA-F0-9]{40}$/;
    if (!erc20Regex.test(address)) {
      return res.status(400).json({ message: 'Invalid ERC20 address format' });
    }

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 50) {
      return res.status(400).json({ message: 'Minimum withdrawal is $50 USDT' });
    }

    // Get user's current balance from the canonical balance store
    // (use db.getBalanceSummary so the calculation is consistent across the app)
    const balanceSummary = await db.getBalanceSummary(userId);
    const balance = Number(balanceSummary.currentBalance || 0);

    // Check if user has sufficient balance
    if (parsedAmount > balance) {
      return res.status(400).json({ message: `Insufficient balance. Available: $${balance.toFixed(2)}` });
    }

    // Create withdrawal record
    const withdrawal = new Withdrawal({
      userId: userId,
      amount: parsedAmount,
      withdrawalAddress: address,
      network: network,
      status: 'pending',
      submittedAt: new Date()
    });

    await withdrawal.save();

    // Record transaction in history database
    await db.recordTransaction(userId, {
      type: 'withdrawal',
      amount: parsedAmount,
      description: `Withdrawal request to ${address}`,
      details: {
        withdrawalAddress: address,
        network: network,
        withdrawalId: withdrawal._id.toString()
      }
    });

    console.log(`Withdrawal submitted: ${userId}, Amount: $${parsedAmount}, Address: ${address}`);

    res.json({
      message: 'Withdrawal submitted successfully',
      withdrawalId: withdrawal._id,
      amount: parsedAmount,
      status: 'pending'
    });
  } catch (error) {
    console.error('Withdrawal submission error:', error);
    res.status(500).json({ message: 'Error submitting withdrawal' });
  }
});

// Get user's withdrawals
app.get('/api/withdrawals/my', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const withdrawals = await Withdrawal.find({ userId: req.user.email })
      .sort({ submittedAt: -1 });

    res.json(withdrawals);
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ message: 'Error fetching withdrawals' });
  }
});

// Dashboard: stats endpoint (total earnings, ROI %, etc.)
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });

    const userId = req.user.email;

    // Use authoritative balance summary (includes credited earnings)
    const balanceSummary = await db.getBalanceSummary(userId);
    const totalDeposited = Number(balanceSummary.totalDeposits || 0);
    const totalEarnings = Number(balanceSummary.totalEarnings || 0);
    const totalWithdrawals = Number(balanceSummary.totalWithdrawals || 0);

    // Calculate ROI percentage from actuals
    const roiPercent = totalDeposited > 0 ? ((totalEarnings / totalDeposited) * 100) : 0;

    res.json({
      totalDeposited: Math.round(totalDeposited * 100) / 100,
      totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      roiPercent: Math.round(roiPercent * 100) / 100,
      currency: 'USD',
      updatedAt: new Date()
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ message: 'Error fetching stats' });
  }
});

// ============= ADMIN ENDPOINTS =============

// Get all pending transactions (deposits, plans, withdrawals)
app.get('/api/admin/pending-transactions', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    // TODO: Add admin role check here
    
    const pendingDeposits = await Deposit.find({ approvalStatus: 'pending' }).sort({ submittedAt: -1 });
    const pendingPlans = await PlanEnrollment.find({ approvalStatus: 'pending' }).sort({ enrolledAt: -1 });
    const pendingWithdrawals = await Withdrawal.find({ approvalStatus: 'pending' }).sort({ submittedAt: -1 });

    console.log('Admin pending counts:', {
      deposits: pendingDeposits.length,
      plans: pendingPlans.length,
      withdrawals: pendingWithdrawals.length
    });

    res.json({
      deposits: pendingDeposits,
      plans: pendingPlans,
      withdrawals: pendingWithdrawals
    });
  } catch (error) {
    console.error('Error fetching pending transactions:', error);
    res.status(500).json({ message: 'Error fetching transactions' });
  }
});

// ============= TRANSACTION APPROVAL ENDPOINTS (Database-driven) =============

// Get all pending transactions for database management
app.get('/api/transactions/pending', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    // NOTE: In production, add admin role check here

    const pendingTransactions = await db.getPendingTransactions();
    res.json(pendingTransactions);
  } catch (error) {
    console.error('Error fetching pending transactions:', error);
    res.status(500).json({ message: 'Error fetching transactions' });
  }
});

// Approve transaction by transaction ID
app.post('/api/transactions/:transactionId/approve', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    // NOTE: In production, add admin role check here

    const transaction = await db.approveTransaction(req.params.transactionId, req.user.email);
    
    // Recalculate balance after approval
    const updatedBalance = await db.recalculateUserBalance(transaction.userId);

    res.json({
      message: 'Transaction approved successfully',
      transaction,
      balance: {
        currentBalance: updatedBalance.currentBalance,
        totalDeposits: updatedBalance.totalDeposits,
        totalEarnings: updatedBalance.totalEarnings,
        totalWithdrawals: updatedBalance.totalWithdrawals
      }
    });
  } catch (error) {
    console.error('Error approving transaction:', error);
    res.status(500).json({ message: 'Error approving transaction' });
  }
});

// Admin debug: trigger earnings processing now (ensures today's rewards and runs daily processor)
app.post('/api/admin/debug/process-earnings', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    // In production, restrict to admin role

    await db.ensureDailyRewardsForToday();
    await db.processDailyEarnings();

    // Return recently created earnings transactions for verification
    const since = new Date(Date.now() - 5 * 60 * 1000); // last 5 minutes
    const recent = await db.TransactionHistory.find({ type: 'earnings', submittedAt: { $gte: since } }).sort({ submittedAt: -1 }).limit(50).lean();

    res.json({ message: 'Earnings processing triggered', recentCount: recent.length, recent });
  } catch (err) {
    console.error('Debug process-earnings error:', err);
    res.status(500).json({ message: 'Error triggering earnings processing' });
  }
});

// Reject transaction by transaction ID
app.post('/api/transactions/:transactionId/reject', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    // NOTE: In production, add admin role check here

    const { reason } = req.body;
    const transaction = await db.rejectTransaction(req.params.transactionId, reason || 'Rejected by admin', req.user.email);

    res.json({
      message: 'Transaction rejected successfully',
      transaction
    });
  } catch (error) {
    console.error('Error rejecting transaction:', error);
    res.status(500).json({ message: 'Error rejecting transaction' });
  }
});

// Get user's balance and transaction stats
app.get('/api/user/stats', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = req.user.email;
    const balanceSummary = await db.getBalanceSummary(userId);
    const transactionStats = await db.getTransactionStats(userId);

    // Also include a short balance history (last 30 days) so the frontend can render charts
    let balanceHistory = [];
    try {
      balanceHistory = await db.getBalanceHistory(userId, 30);
    } catch (err) {
      console.warn('Could not fetch balance history for stats endpoint', err);
    }

    // Attach history to the balance object for compatibility with existing frontend code
    const balanceWithHistory = Object.assign({}, balanceSummary, { history: balanceHistory });

    res.json({
      balance: balanceWithHistory,
      balanceHistory,
      transactions: transactionStats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Error fetching stats' });
  }
});

// Server-Sent Events endpoint for realtime user updates (balance updates)
app.get('/api/user/stream', (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).end();
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const userId = req.user.email;

  // Helper to send an SSE message
  function sendEvent(event, payload) {
    try {
      const id = Date.now();
      res.write(`event: ${event}\n`);
      res.write(`id: ${id}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (e) {
      console.warn('SSE send failed', e);
    }
  }

  // Send initial snapshot: balance summary + small history
  (async () => {
    try {
      const balance = await db.getBalanceSummary(userId);
      const history = await db.getBalanceHistory(userId, 30);
      sendEvent('init', { balance, history });
    } catch (err) {
      console.error('Error preparing initial SSE payload:', err);
    }
  })();

  // Listener for balance:update events
  const handler = (payload) => {
    if (!payload || payload.userId !== userId) return;
    sendEvent('balance', payload);
  };

  notify.on('balance:update', handler);

  // Cleanup when client disconnects
  req.on('close', () => {
    notify.removeListener('balance:update', handler);
    try { res.end(); } catch (e) { /* ignore */ }
  });
});

// Get user's balance history (days param optional)
app.get('/api/user/balance-history', async (req, res) => {
  try {
    if (!req.isAuthenticated || !req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    const userId = req.user.email;
    const days = Number(req.query.days) || 30;
    const history = await db.getBalanceHistory(userId, days);
    res.json({ history });
  } catch (err) {
    console.error('Error fetching balance history:', err);
    res.status(500).json({ message: 'Error fetching balance history' });
  }
});

// Ensure today's rewards for the authenticated user only
app.get('/api/user/ensure-today-rewards', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });

    const userId = req.user.email;
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);

    // Find approved daily-reward plan transactions for this user
    const txs = await db.TransactionHistory.find({
      userId,
      approvalStatus: 'approved',
      'planDetails.planType': 'daily-reward',
      'planDetails.roiPercentage': { $exists: true }
    });

    const credited = [];

    for (const tx of txs) {
      try {
        const existing = await db.TransactionHistory.findOne({
          userId: tx.userId,
          type: 'earnings',
          'details.sourceTxId': tx._id.toString(),
          submittedAt: { $gte: todayStart, $lt: tomorrowStart }
        });

        if (existing) continue; // already credited today for this tx

        const pd = tx.planDetails || {};
        const roi = Number(pd.roiPercentage) || 0;
        if (roi <= 0) continue;

        const dailyEarning = (tx.amount || 0) * (roi / 100);
        if (dailyEarning <= 0) continue;

        // Credit earnings and record transaction linked to source tx
        await db.addEarnings(tx.userId, dailyEarning, pd.planName || 'daily-reward', tx._id);

        // Update lastEarningAt to today's midnight so subsequent runs don't duplicate
        tx.planDetails = tx.planDetails || {};
        tx.planDetails.lastEarningAt = new Date(todayStart);
        await tx.save();

        credited.push({ txId: tx._id.toString(), amount: Math.round(dailyEarning * 100) / 100 });
      } catch (innerErr) {
        console.error('Error ensuring reward for tx', tx._id, innerErr);
      }
    }

    // Return the updated balance summary
    const balanceSummary = await db.getBalanceSummary(userId);

    res.json({ credited, balance: balanceSummary });
  } catch (err) {
    console.error('Error in ensure-today-rewards:', err);
    res.status(500).json({ message: 'Error ensuring today rewards' });
  }
});

// Refresh user balance and get updated stats
// Call this endpoint after transaction approval to get fresh balance
app.get('/api/user/refresh-balance', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = req.user.email;
    
    // Recalculate balance from all approved transactions
    const balance = await db.recalculateUserBalance(userId);
    
    // Get all transactions (including pending ones to show user status)
    const transactions = await db.getUserTransactions(userId);
    
    res.json({
      message: 'Balance refreshed',
      balance: {
        currentBalance: balance.currentBalance,
        totalDeposits: balance.totalDeposits,
        totalEarnings: balance.totalEarnings,
        totalWithdrawals: balance.totalWithdrawals,
        lastUpdated: balance.lastUpdated
      },
      transactions: transactions.map(tx => ({
        id: tx._id,
        type: tx.type,
        amount: tx.amount,
        status: tx.approvalStatus,
        submittedAt: tx.submittedAt,
        approvedAt: tx.approvedAt,
        description: tx.description
      }))
    });
  } catch (error) {
    console.error('Error refreshing balance:', error);
    res.status(500).json({ message: 'Error refreshing balance' });
  }
});

// ============= LEGACY ADMIN ENDPOINTS (kept for compatibility) =============

// Approve a deposit
app.post('/api/admin/deposits/:depositId/approve', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    // TODO: Add admin role check
    
    const deposit = await Deposit.findByIdAndUpdate(
      req.params.depositId,
      {
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvedBy: req.user.email
      },
      { new: true }
    );

    if (!deposit) {
      return res.status(404).json({ message: 'Deposit not found' });
    }

    // Ensure corresponding TransactionHistory is approved and user balance updated
    try {
      // Try to find an existing transaction record for this deposit
      const tx = await db.TransactionHistory.findOne({
        'details.depositId': deposit._id.toString(),
        type: 'deposit'
      });

      if (tx) {
        // If a history record exists but is not approved, approve it (this will update balances)
        if (tx.approvalStatus !== 'approved') {
          await db.approveTransaction(tx._id, req.user.email);
        }
      } else {
        // No transaction history record found (edge case) - create and approve it immediately
        const recorded = await db.recordTransaction(deposit.userId, {
          type: 'deposit',
          amount: deposit.amount,
          description: `Deposit approved for ${deposit.planName || 'plan'}`,
          details: { depositId: deposit._id.toString() }
        });
        await db.approveTransaction(recorded._id, req.user.email);
      }
      
      // Recalculate balance after approval
      await db.recalculateUserBalance(deposit.userId);
    } catch (innerErr) {
      console.error('Error syncing transaction approval/balance for deposit:', deposit._id, innerErr);
    }

    console.log(`Deposit ${deposit._id} approved by ${req.user.email}`);
    res.json({ message: 'Deposit approved', deposit });
  } catch (error) {
    console.error('Deposit approval error:', error);
    res.status(500).json({ message: 'Error approving deposit' });
  }
});

// Reject a deposit
app.post('/api/admin/deposits/:depositId/reject', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    // TODO: Add admin role check
    
    const { reason } = req.body;
    const deposit = await Deposit.findByIdAndUpdate(
      req.params.depositId,
      {
        approvalStatus: 'rejected',
        rejectionReason: reason || 'No reason provided',
        approvedBy: req.user.email
      },
      { new: true }
    );

    if (!deposit) {
      return res.status(404).json({ message: 'Deposit not found' });
    }

    console.log(`Deposit ${deposit._id} rejected by ${req.user.email}`);
    res.json({ message: 'Deposit rejected', deposit });
  } catch (error) {
    console.error('Deposit rejection error:', error);
    res.status(500).json({ message: 'Error rejecting deposit' });
  }
});

// Approve a plan enrollment
app.post('/api/admin/plans/:planId/approve', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    // TODO: Add admin role check
    
    const plan = await PlanEnrollment.findByIdAndUpdate(
      req.params.planId,
      {
        approvalStatus: 'approved',
        approvedAt: new Date()
      },
      { new: true }
    );

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    // Ensure corresponding transaction (deposit) is approved and balance updated.
    try {
      // If this enrollment references a deposit, try to find the deposit's transaction
      let depositDoc = null;
      if (plan.depositId) {
        depositDoc = await Deposit.findById(plan.depositId);
      }

      let tx = null;
      if (depositDoc) {
        tx = await db.TransactionHistory.findOne({ 'details.depositId': depositDoc._id.toString(), type: 'deposit' });
      }

      if (tx) {
        if (tx.approvalStatus !== 'approved') {
          await db.approveTransaction(tx._id, req.user.email);
        }
      } else {
        // Create a deposit-style transaction for this plan enrollment as an edge case
        const recorded = await db.recordTransaction(plan.userId, {
          type: 'deposit',
          amount: plan.amount || 0,
          description: `Plan enrollment approved: ${plan.planName}`,
          details: { planId: plan._id.toString(), planName: plan.planName }
        });
        await db.approveTransaction(recorded._id, req.user.email);
      }

      // Recalculate balance and trigger earnings processing
      await db.recalculateUserBalance(plan.userId);
      await db.ensureDailyRewardsForToday();
      await db.processDailyEarnings();
    } catch (innerErr) {
      console.error('Error syncing plan approval to transactions/balance:', innerErr);
    }

    console.log(`Plan enrollment ${plan._id} approved`);
    res.json({ message: 'Plan approved', plan });
  } catch (error) {
    console.error('Plan approval error:', error);
    res.status(500).json({ message: 'Error approving plan' });
  }
});

// Reject a plan enrollment
app.post('/api/admin/plans/:planId/reject', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    // TODO: Add admin role check
    
    const plan = await PlanEnrollment.findByIdAndUpdate(
      req.params.planId,
      {
        approvalStatus: 'rejected'
      },
      { new: true }
    );

    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    console.log(`Plan enrollment ${plan._id} rejected`);
    res.json({ message: 'Plan rejected', plan });
  } catch (error) {
    console.error('Plan rejection error:', error);
    res.status(500).json({ message: 'Error rejecting plan' });
  }
});

// Approve a withdrawal
app.post('/api/admin/withdrawals/:withdrawalId/approve', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    // TODO: Add admin role check
    
    const withdrawal = await Withdrawal.findByIdAndUpdate(
      req.params.withdrawalId,
      {
        approvalStatus: 'approved',
        status: 'completed',
        approvedAt: new Date(),
        processedAt: new Date(),
        approvedBy: req.user.email
      },
      { new: true }
    );

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    // Ensure corresponding TransactionHistory is approved and balance updated
    try {
      const tx = await db.TransactionHistory.findOne({
        'details.withdrawalId': withdrawal._id.toString(),
        type: 'withdrawal'
      });

      if (tx) {
        if (tx.approvalStatus !== 'approved') {
          await db.approveTransaction(tx._id, req.user.email);
        }
      } else {
        // Create transaction record if not exists
        const recorded = await db.recordTransaction(withdrawal.userId, {
          type: 'withdrawal',
          amount: withdrawal.amount,
          description: `Withdrawal to ${withdrawal.withdrawalAddress}`,
          details: { withdrawalId: withdrawal._id.toString() }
        });
        await db.approveTransaction(recorded._id, req.user.email);
      }
      
      // Recalculate balance
      await db.recalculateUserBalance(withdrawal.userId);
    } catch (innerErr) {
      console.error('Error syncing withdrawal approval/balance:', innerErr);
    }

    console.log(`Withdrawal ${withdrawal._id} approved by ${req.user.email}`);
    res.json({ message: 'Withdrawal approved', withdrawal });
  } catch (error) {
    console.error('Withdrawal approval error:', error);
    res.status(500).json({ message: 'Error approving withdrawal' });
  }
});

// Reject a withdrawal
app.post('/api/admin/withdrawals/:withdrawalId/reject', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    // TODO: Add admin role check
    
    const { reason } = req.body;
    const withdrawal = await Withdrawal.findByIdAndUpdate(
      req.params.withdrawalId,
      {
        approvalStatus: 'rejected',
        status: 'rejected',
        rejectionReason: reason || 'No reason provided',
        approvedBy: req.user.email
      },
      { new: true }
    );

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    console.log(`Withdrawal ${withdrawal._id} rejected by ${req.user.email}`);
    res.json({ message: 'Withdrawal rejected', withdrawal });
  } catch (error) {
    console.error('Withdrawal rejection error:', error);
    res.status(500).json({ message: 'Error rejecting withdrawal' });
  }
});

// Get all transactions (user history)
app.get('/api/transactions/my', async (req, res) => {
  try {
    console.log('📍 /api/transactions/my called');
    console.log('   Is Authenticated:', req.isAuthenticated());
    console.log('   User:', req.user);
    
    if (!req.isAuthenticated()) {
      console.warn('❌ User not authenticated');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = req.user.email;
    console.log('🔍 Querying transactions for userId:', userId);

    // Get transactions from database
    const transactions = await db.getUserTransactions(userId);
    console.log('✅ Found transactions:', transactions.length);
    console.log('   Transactions:', JSON.stringify(transactions, null, 2));

    // Format for response - include keys the client expects (approvalStatus, submittedAt/createdAt)
    const formattedTransactions = transactions.map(tx => ({
      id: tx._id,
      _id: tx._id,
      type: tx.type,
      amount: tx.amount,
      // keep both 'status' and 'approvalStatus' for compatibility
      status: tx.approvalStatus,
      approvalStatus: tx.approvalStatus,
      // dates: keep original field names the client may use
      submittedAt: tx.submittedAt || tx.submittedAt,
      createdAt: tx.submittedAt || tx.createdAt || tx.createdAt,
      approvedAt: tx.approvedAt,
      rejectionReason: tx.rejectionReason,
      description: tx.description,
      details: tx.details
    }));

    res.json(formattedTransactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Error fetching transactions' });
  }
});

// Get a single transaction by id (for lightweight client updates)
app.get('/api/transactions/:transactionId', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const txId = req.params.transactionId;
    if (!txId) return res.status(400).json({ message: 'Missing transactionId' });

    const tx = await db.TransactionHistory.findById(txId).lean();
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });

    // Allow owner or admin to fetch the transaction
    if (tx.userId !== req.user.email) {
      const isAdmin = req.user && (
        req.user.isAdmin === true ||
        req.user.role === 'admin' ||
        (process.env.ADMIN_EMAIL && req.user.email === process.env.ADMIN_EMAIL)
      );
      if (!isAdmin) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const formatted = {
      id: tx._id,
      _id: tx._id,
      type: tx.type,
      amount: tx.amount,
      status: tx.approvalStatus,
      approvalStatus: tx.approvalStatus,
      submittedAt: tx.submittedAt,
      createdAt: tx.submittedAt || tx.createdAt,
      approvedAt: tx.approvedAt,
      rejectionReason: tx.rejectionReason,
      description: tx.description,
      details: tx.details
    };

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching transaction by id:', error);
    res.status(500).json({ message: 'Error fetching transaction' });
  }
});

// Register balance routes (current balance, history, SSE stream)
try {
  const balanceRoutes = require('../api/balance/routes');
  app.use('/api/user', balanceRoutes);
} catch (e) {
  console.warn('Balance routes not available:', e && e.message);
}

// Background job: reliably auto-verify pending account verifications older than 5 minutes
// This is safer than relying only on in-memory setTimeouts (which are lost when the server restarts
// or when multiple instances are used). Runs every minute and processes any pending submissions.
const AUTO_VERIFY_INTERVAL_MS = 60 * 1000; // 1 minute
const AUTO_VERIFY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

async function processPendingVerifications() {
  try {
    const threshold = new Date(Date.now() - AUTO_VERIFY_THRESHOLD_MS);
    const pendingUsers = await User.find({
      verificationStatus: 'pending',
      verificationSubmittedAt: { $lte: threshold },
      isAccountVerified: false
    });

    if (!pendingUsers || pendingUsers.length === 0) return;

    for (const u of pendingUsers) {
      try {
        u.isAccountVerified = true;
        u.verificationStatus = 'verified';
        u.kycStatus = 'verified';
        u.kycVerifiedAt = new Date();
        await u.save();

        // Send confirmation email (best-effort)
        try {
          const { sendVerificationConfirmationEmail } = require('../api/lib/email');
          await sendVerificationConfirmationEmail(u.email, u.firstName || u.realName || '');
          console.log(`✓ Auto-verified and emailed: ${u.email}`);
        } catch (emailErr) {
          console.error('Failed to send verification confirmation email to', u.email, emailErr);
        }
      } catch (userErr) {
        console.error('Error auto-verifying user', u.email, userErr);
      }
    }
  } catch (err) {
    console.error('Error processing pending verifications:', err);
  }
}

// Run at startup and then every minute
processPendingVerifications();
setInterval(processPendingVerifications, AUTO_VERIFY_INTERVAL_MS);