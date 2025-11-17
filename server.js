// Main application file: server.js
// This file initializes and runs the Express server, now with Mongoose.
// FINAL VERSION: Merges all 3 apps (Enrollment, Quizzer, and Test Tool) AND serves two login frontends.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const path = require('path'); // <-- NEW: Added path module

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- MongoDB Connection ---
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI is not defined in your .env file');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Successfully connected to MongoDB Atlas'))
  .catch(err => {
    console.error('Error connecting to MongoDB Atlas:', err);
    process.exit(1);
  });

// --- Mongoose Schemas and Models ---
// --- Schemas for ALL apps ---
const candidateSchema = new mongoose.Schema({
  onboardedByTaName: { type: String, required: true },
  onboardedByTaEmail: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  contactNumber: { type: String },
  program: { type: String, required: true },
  project: { type: String },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // This will be a hash
  status: { type: String, default: 'Onboarded' }, // e.g., "Mail Sent", "Pass", "Fail"
  result: { type: String }, // e.g., "15 / 20"
  score: { type: String }, // e.g., "75.0%" (as a string)
  successCount: { type: String },
  videoLink: { type: String }, // Will store failure reason or be empty
  createdAt: { type: Date, default: Date.now }
});
const Candidate = mongoose.model('Candidate', candidateSchema);

const programmeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  projects: [String]
});
const Programme = mongoose.model('Programme', programmeSchema);

// --- Schemas for Enrollment App ---
const enrollmentUserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true }, // This will be a hash
  role: { type: String, required: true, enum: ['TA', 'Manager', 'Owner'] }, 
  createdAt: { type: Date, default: Date.now }
});
const EnrollmentUser = mongoose.model('EnrollmentUser', enrollmentUserSchema);

// --- Schemas for Quizzer App ---
const quizzerUserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  username: { type: String, unique: true, required: true, trim: true }, 
  password: { type: String, required: true }, // This will be a hash
  role: { type: String, required: true, enum: ['Editor', 'Manager', 'Owner'] },
  programme: { type: String }, 
  project: { type: String }, 
  questionBankSheet: { type: String },
  createdAt: { type: Date, default: Date.now }
});
const QuizzerUser = mongoose.model('QuizzerUser', quizzerUserSchema);

const questionBankItemSchema = new mongoose.Schema({
  questionBankName: { type: String, required: true, index: true }, 
  questionId: { type: String, required: true, unique: true }, 
  question: { type: String, required: true },
  referenceUrls: [String], 
  options: String, 
  questionType: { type: String, trim: true, lowercase: true }, // 'easy', 'moderate', 'hard'
  correctAnswer: String,
  createdAt: { type: Date, default: Date.now }
});
const QuestionBankItem = mongoose.model('QuestionBankItem', questionBankItemSchema);

// --- Other Schemas (if needed, e.g., from original setup) ---
const quizSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [String],
  correctAnswer: { type: String, required: true },
  source: String,
  migratedAt: { type: Date, default: Date.now }
});
const Quiz = mongoose.model('Quiz', quizSchema);

const assessmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' }],
  createdAt: { type: Date, default: Date.now }
});
const Assessment = mongoose.model('Assessment', assessmentSchema);

const enrollmentSchema = new mongoose.Schema({
  userId: { type: String, required: true }, 
  courseId: { type: String, required: true },
  status: { type: String, enum: ['enrolled', 'in-progress', 'completed'], default: 'enrolled' },
  enrolledAt: { type: Date, default: Date.now }
});
const Enrollment = mongoose.model('Enrollment', enrollmentSchema);


// --- Nodemailer Transport (for sending emails) ---
const mailTransport = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: false, 
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// --- Helper Functions ---
const generateRandomPassword = (length = 10) => {
  return Math.random().toString(36).slice(-length);
};

const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
};

// --- JWT Authentication Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden: Invalid token' });
    }
    req.user = user; 
    next();
  });
};

// --- Role + Scope Authorization Middleware ---
const authorize = (allowedRoles, allowedScope) => {
  return (req, res, next) => {
    const { role, scope } = req.user; 

    if (scope !== allowedScope) {
      return res.status(403).json({ error: 'Forbidden: Invalid token scope for this action' });
    }

    if (allowedRoles && !allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission for this action' });
    }
    next();
  };
};

// --- Routes ---

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// --- AUTH ROUTES (SEPARATED) ---

// Enrollment App Login
app.post('/api/enrollment/auth/login', async (req, res) => {
  // ... (existing code)
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const user = await EnrollmentUser.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const payload = {
      id: user._id,
      email: user.email,
      role: user.role,
      fullName: `${user.firstName} ${user.lastName}`,
      scope: 'enrollment'
    };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ accessToken, user: payload });
  } catch (error) {
    console.error('Enrollment Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Quizzer App Login
app.post('/api/quizzer/auth/login', async (req, res) => {
  // ... (existing code)
  const { username, password } = req.body; 
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const loginIdentifier = username.toLowerCase();
    const user = await QuizzerUser.findOne({ 
      $or: [{ email: loginIdentifier }, { username: loginIdentifier }] 
    });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const payload = {
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
      fullName: `${user.firstName} ${user.lastName}`,
      programme: user.programme, 
      project: user.project, 
      questionBankSheet: user.questionBankSheet,
      scope: 'quizzer' 
    };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ accessToken, user: payload });
  } catch (error) {
    console.error('Quizzer Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// --- NEW: Test Taker Login Route ---
app.post('/api/test/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const candidate = await Candidate.findOne({ username: username.toLowerCase() });
    if (!candidate) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const isMatch = await bcrypt.compare(password, candidate.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Check if test was already attempted
    if (candidate.result || candidate.status === 'Pass' || candidate.status === 'Fail') {
       return res.status(403).json({ error: 'The test has already been attempted with these credentials.' });
    }

    // Generate question bank name
    const questionBankName = `${candidate.program} ${candidate.project}`.trim();

    // Create JWT with 'test-taker' scope
    const payload = {
      id: candidate._id, // Candidate's database ID
      username: candidate.username,
      questionBankName: questionBankName,
      scope: 'test-taker' // CRITICAL: Add new scope
    };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '3h' }); // Test duration
    res.json({ success: true, accessToken, page: `${questionBankName.replace(/&/g, 'and').replace(/\s+/g, '_')}_test` });

  } catch (error) {
    console.error('Test Taker Login error:', error);
    res.status(500).json({ error: 'An error occurred during verification.' });
  }
});


// --- ENROLLMENT APP ROUTES ---
// (Protected with 'enrollment' scope)
app.get('/api/enrollment/me', authenticateToken, authorize(['TA', 'Manager', 'Owner'], 'enrollment'), async (req, res) => {
  // ... (existing code)
  try {
    const user = await EnrollmentUser.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ 
      success: true, 
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
      role: user.role
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/enrollment/tas/onboard', authenticateToken, authorize(['Owner', 'Manager'], 'enrollment'), async (req, res) => {
  // ... (existing code)
  const { firstName, lastName, email, role } = req.body;
  if (!firstName || !lastName || !email || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!['TA', 'Manager', 'Owner'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role for this application' });
  }
  try {
    let user = await EnrollmentUser.findOne({ email: email.toLowerCase() });
    if (user) return res.status(409).json({ error: 'User with this email already exists' });
    
    const password = generateRandomPassword(8);
    const hashedPassword = await bcrypt.hash(password, 10);
    
    user = new EnrollmentUser({
      firstName, lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      role
    });
    await user.save();

    const fullName = `${firstName} ${lastName}`.trim();
    const subject = "Your Onboarding Portal Credentials";
    const emailBody = `... (HTML from your Code.gs 'onboardNewTA') ...`; 
    
    await mailTransport.sendMail({
      to: email, subject: subject,
      html: emailBody.replace('${fullName}', fullName).replace('${taData.role}', role).replace('${username}', email).replace('${password}', password),
      from: `"Highspring Recruitment" <${process.env.MAIL_USER}>`,
    });
    res.status(201).json({ success: true, message: 'New user onboarded and credential email sent successfully!' });
  } catch (error) {
    console.error('Onboard TA error:', error);
    res.status(500).json({ success: false, message: 'Onboarding failed: ' + error.message });
  }
});

app.post('/api/enrollment/candidates/onboard', authenticateToken, authorize(['TA', 'Manager', 'Owner'], 'enrollment'), async (req, res) => {
  // ... (existing code)
  const { firstName, lastName, email, contactNumber, program, project } = req.body;
  const ta = req.user; 
  try {
    let candidate = await Candidate.findOne({ email: email.toLowerCase() });
    if (candidate) return res.status(409).json({ error: 'Candidate with this email already exists' });

    const username = email.toLowerCase();
    const password = generateRandomPassword(8);
    const hashedPassword = await bcrypt.hash(password, 10);
    candidate = new Candidate({
      onboardedByTaName: ta.fullName, 
      onboardedByTaEmail: ta.email,
      firstName, lastName,
      email: email.toLowerCase(),
      contactNumber, program, project,
      username,
      password: hashedPassword,
      status: 'Mail Sent'
    });
    await candidate.save();
    
    const subject = "Candidate Assessment Test | Highspring India";
    const htmlBody = `... (HTML from your Code.gs 'onboardNewCandidate') ...`;
    await mailTransport.sendMail({
      to: email, subject: subject,
      html: htmlBody.replace('${firstName} ${lastName}', `${firstName} ${lastName}`).replace('${username}', username).replace('${password}', password),
      from: `"Highspring Recruitment" <${process.env.MAIL_USER}>`,
    });
    res.status(201).json({ success: true, message: "Candidate onboarded and assessment email sent successfully!" });
  } catch (error) {
    console.error('Onboard Candidate error:', error);
    res.status(500).json({ success: false, message: 'Onboarding failed: ' + error.message });
  }
});


// --- QUIZZER APP ROUTES ---
// (Protected with 'quizzer' scope)
app.post('/api/quizzer/users/register', authenticateToken, authorize(['Owner', 'Manager'], 'quizzer'), async (req, res) => {
  // ... (existing code)
  const { firstName, lastName, email, role, programme, project } = req.body;
  if (!['Editor', 'Manager', 'Owner'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role for this application' });
  }
  try {
    if (programme && project) {
      await Programme.findOneAndUpdate(
        { name: programme },
        { $addToSet: { projects: project } }, 
        { upsert: true } 
      );
    }
    let user = await QuizzerUser.findOne({ email: email.toLowerCase() });
    if (user) return res.status(409).json({ error: 'User with this email already exists' });
    
    const password = generateRandomPassword(8);
    const hashedPassword = await bcrypt.hash(password, 10);
    const username = `${firstName.toLowerCase()}.${lastName.toLowerCase().charAt(0)}`;

    user = new QuizzerUser({
      firstName, lastName,
      email: email.toLowerCase(),
      username: username, 
      password: hashedPassword,
      role, programme, project
    });
    await user.save();

    const fullName = `${firstName} ${lastName}`.trim();
    const subject = "Your Question Bank Credentials";
    const emailBody = `... (HTML from your Code.gs 'sendWelcomeEmail') ...`;
    
    await mailTransport.sendMail({
      to: email, subject: subject,
      html: emailBody.replace('${fullName}', fullName).replace('${role}', role).replace('${username}', username).replace('${password}', password),
      from: `"Highspring Management Team" <${process.env.MAIL_USER}>`,
    });
    res.status(201).json({ success: true, message: 'New user registered successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to register user: ' + error.message });
  }
});

app.get('/api/quizzer/users/search', authenticateToken, authorize(['Owner', 'Manager'], 'quizzer'), async (req, res) => {
  // ... (existing code)
  const { searchTerm, roleFilter } = req.query;
  let query = {};
  if (roleFilter) query.role = roleFilter;
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    query.$or = [
      { firstName: { $regex: term, $options: 'i' } },
      { lastName: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } }
    ];
  }
  try {
    const users = await QuizzerUser.find(query).select('-password');
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/quizzer/users/resend-credentials', authenticateToken, authorize(['Owner', 'Manager'], 'quizzer'), async (req, res) => {
  // ... (existing code)
  const { email } = req.body;
  try {
    const user = await QuizzerUser.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, message: 'Member not found' });
    
    const newPassword = generateRandomPassword(8);
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    
    const subject = "Your Question Bank Credentials (Resent)";
    const emailBody = `... (HTML from your Code.gs 'resendMemberCredentials') ...`;
    await mailTransport.sendMail({
      to: email, subject: subject,
      html: emailBody.replace('${fullName}', `${user.firstName} ${user.lastName}`).replace('${role}', user.role).replace('${username}', user.username).replace('${password}', newPassword),
      from: `"Highspring Management Team" <${process.env.MAIL_USER}>`,
    });
    res.json({ success: true, message: `New credentials sent to ${email}.` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/quizzer/questions/:questionBankName', authenticateToken, authorize(['Owner', 'Manager', 'Editor'], 'quizzer'), async (req, res) => {
  // ... (existing code)
  try {
    const { questionBankName } = req.params;
    const questions = await QuestionBankItem.find({ questionBankName: questionBankName });
    res.json(questions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/quizzer/questions/:questionBankName', authenticateToken, authorize(['Owner', 'Manager', 'Editor'], 'quizzer'), async (req, res) => {
  // ... (existing code)
  try {
    const { questionBankName } = req.params;
    const qData = req.body;

    const nameParts = questionBankName.split(' ');
    const firstInitial = nameParts[0] ? nameParts[0].charAt(0) : '';
    const lastInitial = nameParts.length > 1 ? nameParts[nameParts.length - 1].charAt(0) : '';
    const prefix = (firstInitial + lastInitial).toUpperCase();
    
    const count = await QuestionBankItem.countDocuments({ questionBankName: questionBankName });
    const paddedNumber = String(count + 1).padStart(3, '0');
    const newId = prefix + paddedNumber;

    const newQuestion = new QuestionBankItem({
      questionBankName: questionBankName,
      questionId: newId,
      question: qData.question,
      referenceUrls: [qData.ref1, qData.ref2, qData.ref3, qData.ref4].filter(String), 
      options: qData.options,
      questionType: (qData.type || '').trim().toLowerCase(),
      correctAnswer: qData.answer
    });
    
    await newQuestion.save();
    res.status(201).json({ success: true, message: 'Question added successfully!' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.put('/api/quizzer/questions/:questionBankName/:questionId', authenticateToken, authorize(['Owner', 'Manager', 'Editor'], 'quizzer'), async (req, res) => {
  // ... (existing code)
  try {
    const { questionId } = req.params;
    const qData = req.body;
    const updatedQuestion = await QuestionBankItem.findOneAndUpdate(
      { questionId: questionId },
      {
        question: qData.question,
        referenceUrls: [qData.ref1, qData.ref2, qData.ref3, qData.ref4].filter(String),
        options: qData.options,
        questionType: (qData.type || '').trim().toLowerCase(),
        correctAnswer: qData.answer
      },
      { new: true } 
    );
    if (!updatedQuestion) {
      return res.status(404).json({ success: false, message: 'Question ID not found.' });
    }
    res.json({ success: true, message: 'Question updated successfully!' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/quizzer/questions/:questionBankName/:questionId', authenticateToken, authorize(['Owner', 'Manager', 'Editor'], 'quizzer'), async (req, res) => {
  // ... (existing code)
  try {
    const { questionId } = req.params;
    const result = await QuestionBankItem.deleteOne({ questionId: questionId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Question ID not found.' });
    }
    res.json({ success: true, message: 'Question deleted successfully!' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/quizzer/access-data', authenticateToken, authorize(['Owner', 'Manager'], 'quizzer'), async (req, res) => {
  // ... (existing code)
  try {
    const { role, programme: programmeFromManager } = req.user; 
    const programmes = await Programme.find();
    if (role === 'Owner') {
      const allProgrammes = {};
      programmes.forEach(p => {
        allProgrammes[p.name] = p.projects.map(proj => ({
          project: proj,
          sheetName: `${p.name} ${proj}`
        }));
      });
      return res.json(allProgrammes);
    } 
    else if (role === 'Manager') {
      const projectsInProgramme = [];
      const managerProgramme = programmes.find(p => p.name === programmeFromManager);
      if (managerProgramme) {
        managerProgramme.projects.forEach(proj => {
          projectsInProgramme.push({
            project: proj,
            sheetName: `${managerProgramme.name} ${proj}`
          });
        });
      }
      return res.json(projectsInProgramme);
    }
    res.status(403).json({ error: "Invalid role for access data." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- NEW TEST TAKER ROUTES ---
// (Protected with 'test-taker' scope)

app.get('/api/test/setup', authenticateToken, authorize(null, 'test-taker'), async (req, res) => {
  // ... (existing code)
  const { questionBankName, username } = req.user;

  try {
    // Re-check if test was attempted, just in case
    const candidate = await Candidate.findById(req.user.id);
    if (candidate.result) {
      return res.status(403).json({ success: false, message: 'Test has already been submitted.' });
    }
    
    // Find all questions for this bank
    const allQuestions = await QuestionBankItem.find({ questionBankName: questionBankName });
    if (allQuestions.length === 0) {
      return res.status(404).json({ success: false, message: `Question bank '${questionBankName}' not found or is empty.` });
    }

    // Separate by type
    const easyQuestions = allQuestions.filter(q => q.questionType === 'easy');
    const moderateQuestions = allQuestions.filter(q => q.questionType === 'moderate');
    const hardQuestions = allQuestions.filter(q => q.questionType === 'hard');

    // Shuffle each array
    shuffleArray(easyQuestions);
    shuffleArray(moderateQuestions);
    shuffleArray(hardQuestions);

    // Create shuffled triplets
    const finalQuestions = [];
    const minCount = Math.min(easyQuestions.length, moderateQuestions.length, hardQuestions.length);

    for (let i = 0; i < minCount; i++) {
      const triplet = [ easyQuestions[i], moderateQuestions[i], hardQuestions[i] ];
      shuffleArray(triplet);
      finalQuestions.push(...triplet);
    }
    
    // Convert Mongoose docs to plain objects
    const finalQuestionsCleaned = finalQuestions.map(q => {
      return {
        id: q.questionId,
        question: q.question,
        options: q.options ? q.options.split(',').map(item => item.trim()) : [],
        answer: q.correctAnswer, // Send answer to client? (App script did)
        time: (q.questionType === 'hard') ? 2 : 1,
        type: q.questionType
      }
    });

    res.json({ 
      success: true,
      userDetails: { level: questionBankName, username: username },
      questions: finalQuestionsCleaned
    });

  } catch (error) {
    console.error('Test Setup error:', error);
    res.status(500).json({ success: false, message: 'An error occurred while fetching questions.' });
  }
});

// Submit Test (replaces recordInitialScore and updateVideoUrl)
app.post('/api/test/submit', authenticateToken, authorize(null, 'test-taker'), async (req, res) => {
  // ... (existing code)
  const { percentage, scoreString } = req.body;
  const candidateId = req.user.id;
  
  try {
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) return res.status(404).json({ success: false, message: 'User not found.' });
    if (candidate.result) return res.status(403).json({ success: false, message: 'Test already submitted.' });

    // Calculate final status
    const numericPercentage = parseFloat(percentage) || 0;
    const attemptedQuestions = parseInt(scoreString.split('/')[1].trim()) || 0;
    let candidateStatus = '';

    if (attemptedQuestions < 15) candidateStatus = 'Not Qualified';
    else if (numericPercentage >= 0.75) candidateStatus = 'Pass';
    else candidateStatus = 'Fail';

    // Update candidate
    candidate.score = (numericPercentage * 100).toFixed(1) + "%";
    candidate.result = scoreString;
    candidate.status = candidateStatus;
    // We are NOT uploading video, so videoLink remains empty
    await candidate.save();

    // Send email to TA
    const subject = `Assessment Result for ${candidate.firstName} ${candidate.lastName}`;
    const formattedCompletionTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    
    const htmlBody = `... (HTML from your Code.gs 'updateVideoUrl') ...`; // Use the final email template
    
    if (candidate.onboardedByTaEmail) {
      await mailTransport.sendMail({
        to: candidate.onboardedByTaEmail,
        subject: subject,
        html: htmlBody.replace('${taName}', candidate.onboardedByTaName)
                       .replace('${candidateFullName}', `${candidate.firstName} ${candidate.lastName}`)
                       .replace('${username}', candidate.username)
                       .replace('${scoreString}', candidate.result)
                       .replace('${numericPercentage}', candidate.score)
                       .replace('${candidateStatus}', candidate.status)
                       .replace('${formattedCompletionTime}', formattedCompletionTime),
        from: `"Highspring Assessment" <${process.env.MAIL_USER}>`,
      });
    }
    
    res.json({ success: true, message: 'Test submitted and email sent.' });
  } catch (error) {
    console.error(`Test Submit error: ${error.toString()}`);
    res.status(500).json({ success: false, message: 'An error occurred.' });
  }
});

// Record Test Failure (e.g., Tab Switch)
app.post('/api/test/fail', authenticateToken, authorize(null, 'test-taker'), async (req, res) => {
  // ... (existing code)
  const { failureReason } = req.body;
  const candidateId = req.user.id;
  
  try {
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) return res.status(404).json({ success: false, message: 'User not found.' });
    if (candidate.result) return res.status(403).json({ success: false, message: 'Test already submitted.' });

    // Update candidate with failure
    candidate.score = "0.0%";
    candidate.result = "0 / 0";
    candidate.status = failureReason;
    candidate.videoLink = failureReason; // Store reason here
    await candidate.save();

    // Send email to TA
    const subject = `Assessment Result for ${candidate.firstName} ${candidate.lastName}`;
    const formattedCompletionTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/KKolkata' });
    
    const htmlBody = `... (HTML from your Code.gs 'recordFailure') ...`; // Use the failure email template
    
    if (candidate.onboardedByTaEmail) {
      await mailTransport.sendMail({
        to: candidate.onboardedByTaEmail,
        subject: subject,
        html: htmlBody.replace('${taName}', candidate.onboardedByTaName)
                       .replace('${candidateFullName}', `${candidate.firstName} ${candidate.lastName}`)
                       .replace('${username}', candidate.username)
                       .replace('${failureReason}', failureReason)
                       .replace('${formattedCompletionTime}', formattedCompletionTime),
        from: `"Highspring Assessment" <${process.env.MAIL_USER}>`,
      });
    }
    
    res.json({ success: true, message: 'Failure recorded and email sent.' });
  } catch (error) {
    console.error(`Test Fail error: ${error.toString()}`);
    res.status(500).json({ success: false, message: 'An error occurred.' });
  }
});


// --- SHARED ROUTES (Can be called by any admin scope) ---

// Search Candidates
app.get('/api/candidates/search', authenticateToken, async (req, res) => {
  // ... (existing code)
  const { searchTerm, taName, programme, date, resultFilter } = req.query; 
  let query = {};
  if (taName) query.onboardedByTaName = taName;
  if (programme) query.program = programme;
  if (resultFilter) query.result = resultFilter;
  if (date) {
    const startDate = new Date(date); startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date); endDate.setHours(23, 59, 59, 999);
    query.createdAt = { $gte: startDate, $lte: endDate };
  }
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    query.$or = [
      { firstName: { $regex: term, $options: 'i' } },
      { lastName: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } }
    ];
  }
  try {
    const candidates = await Candidate.find(query).select('-password').sort({ createdAt: -1 });
    const uniqueTAs = await Candidate.distinct('onboardedByTaName');
    const uniqueProgs = await Candidate.distinct('program');
    const uniqueResults = await Candidate.distinct('result');
    res.json({ 
      success: true, 
      data: candidates, 
      uniqueTAs: uniqueTAs.sort(), 
      uniqueProgs: uniqueProgs.sort(),
      uniqueResults: uniqueResults.filter(String).sort()
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Search failed: " + error.message });
  }
});

// Get all programmes and their projects
app.get('/api/programmes', authenticateToken, async (req, res) => {
  // ... (existing code)
  try {
    const programmes = await Programme.find();
    const programmeData = {};
    programmes.forEach(p => {
      programmeData[p.name] = p.projects;
    });
    res.json({ success: true, data: programmeData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, data: {} });
  }
});

// Resend Candidate Credentials
app.post('/api/candidates/resend-credentials', authenticateToken, async (req, res) => {
  // ... (existing code)
  const { email } = req.body;
  try {
    const candidate = await Candidate.findOne({ email: email.toLowerCase() });
    if (!candidate) return res.status(404).json({ success: false, message: 'Candidate not found' });
    
    const newPassword = generateRandomPassword(8);
    candidate.password = await bcrypt.hash(newPassword, 10);
    await candidate.save();
    
    const subject = "Candidate Assessment Test | Highspring India (Resent)";
    const htmlBody = `... (HTML from your Code.gs 'resendCandidateCredentials') ...`;
    await mailTransport.sendMail({
      to: email, subject: subject,
      html: htmlBody.replace('${firstName} ${lastName}', `${candidate.firstName} ${candidate.lastName}`).replace('${username}', candidate.username).replace('${password}', newPassword),
      from: `"Highspring Recruitment" <${process.env.MAIL_USER}>`,
    });
    res.json({ success: true, message: `New assessment credentials sent to ${email}.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// --- LEGACY/UNUSED ROUTES (from original setup) ---
app.get('/api/assessments', authenticateToken, async (req, res) => {
  // ... (existing code)
  try {
    const assessments = await Assessment.find().populate('questions');
    res.status(200).json(assessments);
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
});

app.post('/api/enrollments', authenticateToken, async (req, res) => {
  // ... (existing code)
  try {
    const { userId, courseId, status } = req.body;
    if (!userId || !courseId || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const newEnrollment = new Enrollment({ userId, courseId, status });
    await newEnrollment.save();
    res.status(201).json(newEnrollment);
  } catch (error) {
    console.error('Error creating enrollment:', error);
    res.status(500).json({ error: 'Failed to create enrollment' });
  }
});

app.get('/api/quizzes', authenticateToken, async (req, res) => {
    // ... (existing code)
    try {
      const quizzes = await Quiz.find();
      res.status(200).json(quizzes);
    } catch (error) {
      console.error('Error fetching quizzes:', error);
      res.status(500).json({ error: 'Failed to fetch quizzes' });
    }
  });

// --- Server Routes for HTML ---
// CRITICAL: We need this to serve the files

app.get('/enrollment', (req, res) => {
    res.sendFile(path.join(__dirname, 'enrollment_login.html'));
});

app.get('/quizzer', (req, res) => {
    res.sendFile(path.join(__dirname, 'quizzer_login.html'));
});

// Default root path should redirect to the Enrollment App
app.get('/', (req, res) => {
    res.redirect('/enrollment');
});

// --- Server Initialization ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});