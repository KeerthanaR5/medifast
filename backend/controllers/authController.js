// controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

// Configure email transporter
// Configure email transporter with SMTP settings
const createEmailTransporter = () => {
  try {
    console.log('📧 Configuring email transporter...');
    console.log('📧 SMTP Host:', process.env.SMTP_HOST || 'smtp.gmail.com');
    console.log('📧 SMTP Port:', process.env.SMTP_PORT || 587);
    console.log('📧 Email user:', process.env.EMAIL_USER ? 'Found ✅' : 'Missing ❌');
    console.log('📧 Email password:', process.env.EMAIL_PASSWORD ? 'Found ✅' : 'Missing ❌');
    console.log('📧 SMTP Secure:', process.env.SMTP_SECURE === 'true' ? 'Yes' : 'No');

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error('❌ Email credentials are missing in environment variables');
      return null;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true', // Convert string to boolean
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      },
      tls: {
        rejectUnauthorized: false // Only for development/testing
      }
    });

    // Verify transporter configuration
    transporter.verify((error, success) => {
      if (error) {
        console.error('❌ Email transporter verification failed:', error);
      } else {
        console.log('✅ Email transporter verified successfully');
      }
    });

    return transporter;
  } catch (error) {
    console.error('❌ Error creating email transporter:', error);
    return null;
  }
};

// Generate JWT Access Token (short-lived)
const generateAccessToken = (userId, userRole) => {
  return jwt.sign(
    { 
      id: userId,
      role: userRole,
      type: 'access'
    }, 
    process.env.JWT_ACCESS_SECRET, 
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m', // Short lived
      issuer: 'medifast',
      audience: 'medifast-users'
    }
  );
};

// Generate JWT Refresh Token (long-lived)
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { 
      id: userId,
      type: 'refresh'
    }, 
    process.env.JWT_REFRESH_SECRET, 
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d', // Long lived
      issuer: 'medifast',
      audience: 'medifast-users'
    }
  );
};

// Generate Password Reset Token
const generatePasswordResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Hash password
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Validate password strength
const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  const errors = [];
  
  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }
  if (!hasUpperCase) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!hasLowerCase) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!hasNumbers) {
    errors.push('Password must contain at least one number');
  }
  if (!hasSpecialChar) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Send Welcome Email
const sendWelcomeEmail = async (user) => {
  try {
    const transporter = createEmailTransporter();
    if (!transporter) {
      return;
    }

    const mailOptions = {
      from: `"MediFast Team" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Welcome to MediFast - Your Healthcare Journey Begins!',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">🏥 Welcome to MediFast!</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Your Healthcare Partner</p>
          </div>
          
          <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1e293b; margin-top: 0;">Hello ${user.fullName}!</h2>
            <p style="color: #64748b; line-height: 1.6;">
              Thank you for joining MediFast! Your account has been successfully created and you're now part of our healthcare community.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
              <h3 style="color: #1e293b; margin-top: 0;">What you can do now:</h3>
              <ul style="color: #64748b; line-height: 1.8;">
                <li>🔍 Search for medicines across 500+ pharmacies</li>
                <li>📍 Find nearby pharmacies with GPS navigation</li>
                <li>📋 Manage your prescriptions and health records</li>
                <li>🚚 Order medicines with doorstep delivery</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}" style="
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 25px;
                font-weight: bold;
                display: inline-block;
              ">Start Exploring MediFast</a>
            </div>
            
            <p style="color: #9ca3af; font-size: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
              If you have any questions, our support team is here to help!<br>
              Email: support@medifast.com | Phone: 1800-MEDIFAST
            </p>
          </div>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending welcome email:', error);
    // Don't throw error - email failure shouldn't stop registration
  }
};

// User Registration
const register = async (req, res) => {
  try {
    const { fullName, email, password, phone, role, address, pharmacyDetails } = req.body;

    // Enhanced validation
    if (!fullName || !email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, password, and phone are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Validate phone format (10 digits)
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit phone number'
      });
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet requirements',
        errors: passwordValidation.errors
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        { phone }
      ]
    });
    
    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
      if (existingUser.phone === phone) {
        return res.status(409).json({
          success: false,
          message: 'User with this phone number already exists'
        });
      }
    }

    // Create user data object
    const normalizedRole = role === 'pharmacy_owner' ? 'pharmacy' : (role || 'customer');
    const userData = {
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      phone,
      role: normalizedRole,
      userType: normalizedRole === 'pharmacy' ? 'pharmacy' : (normalizedRole === 'admin' ? 'admin' : 'patient'), // Frontend compatibility
      address,
      isActive: true,
      emailVerified: false,
      createdAt: new Date(),
      lastLogin: null
    };

    // Add pharmacy details if role is pharmacy
    if (normalizedRole === 'pharmacy' && pharmacyDetails) {
      userData.pharmacyDetails = {
        ...pharmacyDetails,
        verified: false,
        licenseNumber: pharmacyDetails.licenseNumber,
        address: pharmacyDetails.address,
        contactPerson: pharmacyDetails.contactPerson
      };
    }

    // Create new user
    const user = new User(userData);
    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Store refresh token hash in database (optional security measure)
    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push({
      token: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
    await user.save();

    // Send welcome email asynchronously
    sendWelcomeEmail(user).catch(console.error);

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth'
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: user.toJSON(),
        accessToken,
        expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m'
      },
      // Frontend compatibility
      token: accessToken,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: messages
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email or phone number'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    });
  }
};

// User Login
const login = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    // Enhanced validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user and include password field
    const user = await User.findOne({ 
      email: email.toLowerCase().trim() 
    }).select('+password +refreshTokens');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated. Please contact support.'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Increment failed login attempts (implement rate limiting)
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    
    // Clean up old refresh tokens (older than 7 days)
    user.refreshTokens = user.refreshTokens?.filter(
      token => token.expiresAt > new Date()
    ) || [];

    // Generate new tokens
    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Store refresh token hash
    user.refreshTokens.push({
      token: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000)
    });

    await user.save();

    // Set refresh token as HTTP-only cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth'
    };
    if (rememberMe) {
      cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000;
    }
    res.cookie('refreshToken', refreshToken, cookieOptions);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toJSON(),
        accessToken,
        expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m'
      },
      // Frontend compatibility
      token: accessToken,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
};

// Quick Registration for Modal (uses existing register logic with simplified validation)
const quickRegister = async (req, res) => {
  try {
    // Use the same validation as register but with relaxed password requirements for modal
    const { fullName, email, password, phone, userType } = req.body;

    // Basic validation for quick registration
    if (!fullName || !email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Validate phone format (10 digits)
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit phone number'
      });
    }

    // Relaxed password validation for quick registration (minimum 8 characters to match model)
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        { phone }
      ]
    });
    
    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
      if (existingUser.phone === phone) {
        return res.status(409).json({
          success: false,
          message: 'User with this phone number already exists'
        });
      }
    }

    // Create user data object
    const userData = {
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      phone,
      role: userType === 'pharmacy' ? 'pharmacy' : 'customer',
      userType: userType || 'patient', // For frontend compatibility
      isActive: true,
      emailVerified: false,
      createdAt: new Date(),
      lastLogin: null
    };

    // Create new user
    const user = new User(userData);
    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Store refresh token hash in database
    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push({
      token: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
    await user.save();

    // Send welcome email asynchronously
    sendWelcomeEmail(user).catch(console.error);

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth'
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token: accessToken, // For frontend compatibility
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Quick registration error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: messages
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email or phone number'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    });
  }
};

// Validate Token
const validateToken = async (req, res) => {
  try {
    // Token is already validated by authenticateToken middleware
    const user = req.user;

    res.status(200).json({
      success: true,
      message: 'Token is valid',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating token'
    });
  }
};

// Refresh Token
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token not provided'
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Find user and check if refresh token exists
    const user = await User.findById(decoded.id).select('+refreshTokens');
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    // Check if refresh token exists in user's token list
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const tokenExists = user.refreshTokens?.some(
      token => token.token === tokenHash && token.expiresAt > new Date()
    );

    if (!tokenExists) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user._id, user.role);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
        expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m'
      },
      // Frontend compatibility
      token: newAccessToken
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during token refresh'
    });
  }
};

// Forgot Password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      // Return success even if user doesn't exist (security best practice)
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    }

    if (!user.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Generate reset token and expiry
    const resetToken = generatePasswordResetToken();
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save token to user (hash it for security)
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = resetTokenExpiry;
    await user.save();

    // Create reset URL
    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Send password reset email
    try {
      const transporter = createEmailTransporter();
      
      const mailOptions = {
        from: `"MediFast Security" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'MediFast - Password Reset Request',
        html: `
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">🏥 MediFast</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Password Reset Request</p>
            </div>
            
            <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #1e293b; margin-top: 0;">Reset Your Password</h2>
              <p style="color: #64748b; line-height: 1.6;">
                Hello ${user.fullName},<br><br>
                We received a request to reset your password for your MediFast account. Click the button below to reset your password:
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetURL}" style="
                  background: linear-gradient(135deg, #667eea, #764ba2);
                  color: white;
                  padding: 15px 30px;
                  text-decoration: none;
                  border-radius: 25px;
                  font-weight: bold;
                  display: inline-block;
                  font-size: 16px;
                ">Reset Password</a>
              </div>
              
              <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${resetURL}" style="color: #667eea; word-break: break-all;">${resetURL}</a>
              </p>
              
              <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
                <p style="color: #dc2626; margin: 0; font-size: 14px; font-weight: 500;">
                  ⚠️ Security Notice: This link will expire in 1 hour for your security.
                </p>
              </div>
              
              <p style="color: #9ca3af; font-size: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                If you didn't request this password reset, please ignore this email or contact our support team immediately.<br>
                This link will expire on ${resetTokenExpiry.toLocaleString()}.
              </p>
            </div>
          </div>
        `
      };
      
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Error sending password reset email:', emailError);
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();
      
      return res.status(500).json({
        success: false,
        message: 'Error sending password reset email. Please try again later.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Password reset email sent successfully'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during password reset request'
    });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'New password does not meet requirements',
        errors: passwordValidation.errors
      });
    }

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token is invalid or has expired'
      });
    }

    // Update user password and clear reset token
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = new Date();
    
    // Invalidate all existing refresh tokens for security
    user.refreshTokens = [];
    
    await user.save();

    // Send confirmation email
    try {
      const transporter = createEmailTransporter();
      
      const mailOptions = {
        from: `"MediFast Security" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'MediFast - Password Changed Successfully',
        html: `
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
            <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">🏥 MediFast</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Password Changed Successfully</p>
            </div>
            
            <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #1e293b; margin-top: 0;">✅ Password Updated</h2>
              <p style="color: #64748b; line-height: 1.6;">
                Hello ${user.fullName},<br><br>
                Your password has been successfully changed. You can now log in to your MediFast account with your new password.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL}" style="
                  background: linear-gradient(135deg, #10b981, #059669);
                  color: white;
                  padding: 12px 30px;
                  text-decoration: none;
                  border-radius: 25px;
                  font-weight: bold;
                  display: inline-block;
                ">Login to MediFast</a>
              </div>
              
              <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
                <p style="color: #dc2626; margin: 0; font-size: 14px; font-weight: 500;">
                  ⚠️ If you didn't make this change, please contact our support team immediately.
                </p>
              </div>
              
              <p style="color: #9ca3af; font-size: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                Password changed on ${new Date().toLocaleString()}<br>
                Support: support@medifast.com | 1800-MEDIFAST
              </p>
            </div>
          </div>
        `
      };
      
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Error sending password change confirmation:', emailError);
      // Don't fail the request if email fails
    }

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during password reset'
    });
  }
};

// Logout
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (refreshToken) {
      // Remove refresh token from database
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await User.updateOne(
        { _id: req.user?.id },
        { $pull: { refreshTokens: { token: tokenHash } } }
      );
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth'
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during logout'
    });
  }
};

// Get Current User Profile
const getProfile = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        user: req.user.toJSON()
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user profile'
    });
  }
};

// Get Dashboard Data
const getDashboardData = async (req, res) => {
  try {
    const user = req.user;
    
    // Get basic user data
    let dashboardData = user.toJSON();
    
    // Add role-specific data
    if (user.role === 'pharmacy') {
      dashboardData.pharmacyData = {
        verified: user.pharmacyDetails?.verified || false,
        licenseNumber: user.pharmacyDetails?.licenseNumber,
        pharmacyName: user.pharmacyDetails?.pharmacyName
      };
    }

    // Add profile completion status
    dashboardData.profileComplete = !!(
      user.fullName && 
      user.email && 
      user.phone && 
      user.address?.city && 
      user.address?.state &&
      (user.role !== 'pharmacy' || (
        user.pharmacyDetails?.pharmacyName && 
        user.pharmacyDetails?.licenseNumber
      ))
    );

    res.status(200).json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Get dashboard data error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data'
    });
  }
};

// Update User Profile
const updateProfile = async (req, res) => {
  try {
    const user = req.user;
    const updates = req.body;

    // Allowed update fields
    const allowedUpdates = ['fullName', 'phone', 'address', 'preferences'];
    const updateData = {};

    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });

    // Update user
    Object.assign(user, updateData);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
  }
};

// Update User Preferences
const updatePreferences = async (req, res) => {
  try {
    const user = req.user;
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid preferences data'
      });
    }

    // Initialize preferences if not exists
    if (!user.preferences) {
      user.preferences = {};
    }

    // Update preferences
    user.preferences = { ...user.preferences, ...preferences };
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Preferences updated successfully',
      preferences: user.preferences
    });

  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating preferences'
    });
  }
};
// Get Home Page Statistics
const getHomeStats = async (req, res) => {
  try {
    const Medicine = require('../models/Medicine');

    const [totalUsers, verifiedPharmacies, medicineCount] =
      await Promise.all([
        User.countDocuments({ role: 'customer' }),
        User.countDocuments({
          role: 'pharmacy',
          'pharmacyDetails.verified': true
        }),
        Medicine.countDocuments()
      ]);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        pharmacies: verifiedPharmacies,
        medicines: medicineCount,
        support: '24/7'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get home stats error:', error);

    res.status(500).json({
      success: false,
      message: 'Unable to fetch statistics',
      data: {
        totalUsers: null,
        pharmacies: null,
        medicines: null,
        support: '24/7'
      },
      timestamp: new Date().toISOString()
    });
  }
};

// Verify Email (Placeholder - implement when needed)
const verifyEmail = async (req, res) => {
  try {
    res.status(501).json({
      success: false,
      message: 'Email verification feature will be implemented soon'
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({
      success: false,
      message: 'Error in email verification'
    });
  }
};

// Resend Verification Email (Placeholder - implement when needed)
const resendVerification = async (req, res) => {
  try {
    res.status(501).json({
      success: false,
      message: 'Resend verification feature will be implemented soon'
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error in resend verification'
    });
  }
};

// Get Detailed Admin Statistics (Admin only)
const getDetailedStats = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    // Get comprehensive statistics
    const [
      totalUsers,
      customers, 
      pharmacies,
      verifiedPharmacies,
      activeUsers,
      recentRegistrations
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'pharmacy' }),
      User.countDocuments({ 
        role: 'pharmacy', 
        'pharmacyDetails.verified': true 
      }),
      User.countDocuments({ 
        isActive: true,
        lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      }),
      User.countDocuments({ 
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      })
    ]);

    const stats = {
      totalUsers,
      customers,
      pharmacies,
      verifiedPharmacies,
      unverifiedPharmacies: pharmacies - verifiedPharmacies,
      activeUsers,
      recentRegistrations,
      systemHealth: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      }
    };

    res.status(200).json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get detailed stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching detailed statistics'
    });
  }
};

// Health Check endpoint
const healthCheck = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'MediFast API is running',
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || '1.0.0'
  });
};

// Test Email Endpoint
const testEmail = async (req, res) => {
  try {
    const { to } = req.body;
    
    if (!to) {
      return res.status(400).json({
        success: false,
        message: 'Recipient email is required'
      });
    }

    const transporter = createEmailTransporter();
    
    if (!transporter) {
      return res.status(500).json({
        success: false,
        message: 'Email transporter not configured properly'
      });
    }

    const mailOptions = {
      from: `"MediFast Test" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: to,
      subject: 'MediFast - Test Email',
      text: 'This is a test email from MediFast. If you received this, your email configuration is working!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">MediFast Test Email</h2>
          <p>Hello,</p>
          <p>This is a test email to verify that your email configuration is working correctly.</p>
          <p>If you received this email, your email settings are properly configured!</p>
          <div style="margin-top: 20px; padding: 10px; background-color: #f0f9ff; border-left: 4px solid #3b82f6;">
            <p style="margin: 0;">Server time: ${new Date().toLocaleString()}</p>
          </div>
          <p style="margin-top: 20px; color: #6b7280; font-size: 12px;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    
    res.status(200).json({
      success: true,
      message: 'Test email sent successfully!',
      details: {
        from: mailOptions.from,
        to: mailOptions.to,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  register,
  login,
  quickRegister,          // NEW
  validateToken,          // NEW
  refreshToken,
  forgotPassword,
  resetPassword,
  logout,
  getProfile,
  updateProfile,          // NEW
  getDashboardData,       // NEW
  updatePreferences,      // NEW
  getHomeStats,           // NEW
  verifyEmail,            // NEW
  resendVerification,     // NEW
  getDetailedStats,       // NEW
  healthCheck,
  testEmail
};
