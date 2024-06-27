const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const config = require('./config');
const path = require('path');
const { title } = require('process');

const app = express();
const bot = new TelegramBot(config.telegram.token);

//Function to generate random temporary password
function generateTempPassword() {
    return Math.random().toString(36).slice(-8); // Generates an 8-character password
}

// Function to update user's password in database
function updateUserPassword(email, newPassword, callback) {
    const hashedPassword = bcrypt.hashSync(newPassword, 8);
    const query = 'UPDATE users SET password = ? WHERE email = ?';
  
    db.query(query, [hashedPassword, email], (err, results) => {
      if (err) {
        return callback(err);
      }
      callback(null);
    });
  }

// View engine setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname,'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: true
}));

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: false,
  auth: {
    user: config.email.user,
    pass: config.email.pass
  }
});

// Middleware to check if admin exists
const checkAdminExists = (req, res, next) => {
  const query = 'SELECT * FROM admins';

  db.query(query, (err, results) => {
    if (err) throw err;
    if (results.length > 0) {
      res.redirect('/admin/login');
    } else {
      next();
    }
  });
};

// Middleware for serving static files
app.use(express.static(path.join(__dirname, 'public')));

// Custom middleware to render views with layout
app.use((req, res, next) => {
  res.renderWithLayout = (view, options = {}) => {
    res.render(view, (err, html) => {
      if (err) return next(err);
      options.content = html;
      res.render('layouts/main-layout', options);
    });
  };
  next();
});

// Routes

// Route for the index page
app.get('/', (req, res) => {
  res.renderWithLayout('index', { title: 'Home' });
});

// Forgot Password Page
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password', {title: 'Forgot Password'});
});

// Handle Forgot Password Form Submission
app.post('/admin/edit-user/:id', (req, res) => {
    const userId = req.params.id;
    const { username, surname, contact, email, area } = req.body;
    const query = 'UPDATE users SET username = ?, surname = ?, contact = ?, email = ?, area = ? WHERE id = ?';
  
    db.query(query, [username, surname, contact, email, area, userId], (err, results) => {
      if (err) throw err;
      res.redirect('/admin/edit-user/' + userId); // Redirect to the same page after updating
    });
});

// Admin Registration
app.get('/admin/register', checkAdminExists, (req, res) => {
  res.render('admin-register');
});

app.post('/admin/register', checkAdminExists, (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 8);
  const query = 'INSERT INTO admins (username, password) VALUES (?, ?)';

  db.query(query, [username, hashedPassword], (err, results) => {
    if (err) throw err;
    res.redirect('/admin/login');
  });
});

// Admin Login
app.get('/admin/login', (req, res) => {
  res.render('admin-login');
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const adminQuery = 'SELECT * FROM admins WHERE username = ?';

  db.query(adminQuery, [username], (err, results) => {
    if (err) throw err;
    if (results.length > 0) {
      const admin = results[0];
      if (bcrypt.compareSync(password, admin.password)) {
        req.session.admin = admin;
        res.redirect('/admin/dashboard');
      } else {
        res.send('Invalid username or password');
      }
    } else {
      res.send('Invalid username or password');
    }
  });
});

// Delete Admin Profile
app.post('/admin/delete-profile', (req, res) => {
    const adminId = req.session.admin.id;
    const query = 'DELETE FROM admins WHERE id = ?';
  
    db.query(query, [adminId], (err, results) => {
      if (err) throw err;
      req.session.destroy();
      res.redirect('/admin/login');
    });
  });

// Delete User by Admin
app.post('/admin/delete-user/:id', (req, res) => {
    const userId = req.params.id;
    const query = 'DELETE FROM users WHERE id = ?';
  
    db.query(query, [userId], (err, results) => {
      if (err) throw err;
      res.redirect('/admin/search-user'); // Redirect to search page or dashboard as needed
    });
  });

// Generate and Send Temporary Password to User
app.post('/admin/send-temp-password/:id', (req, res) => {
    const userId = req.params.id;
    const query = 'SELECT email FROM users WHERE id = ?';
  
    db.query(query, [userId], (err, results) => {
      if (err) throw err;
  
      if (results.length > 0) {
        const email = results[0].email;
        const tempPassword = generateTempPassword();
  
        updateUserPassword(email, tempPassword, (err) => {
          if (err) throw err;
  
          // Send temporary password to user via email
          const mailOptions = {
            from: 'config.email.user',
            to: email,
            subject: 'Temporary Password for Account Recovery',
            text: `Your temporary password is: ${tempPassword}. Please login with this password and change it immediately.`
          };
  
          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.log(error);
            } else {
              console.log('Email sent: ' + info.response);
              res.redirect('/admin/edit-user/' + userId); // Redirect to the edit user page after sending email
            }
          });
        });
      } else {
        res.send('User not found');
      }
    });
});
  

// Admin Dashboard
app.get('/admin/dashboard', (req, res) => {
  if (!req.session.admin) {
    res.redirect('/admin/login');
  } else {
    res.render('admin-dashboard');
  }
});

// Add User
app.get('/admin/add-user', (req, res) => {
  if (!req.session.admin) {
    res.redirect('/admin/login');
  } else {
    res.render('add-user');
  }
});

app.post('/admin/add-user', (req, res) => {
  const { username, surname, contact, email, area } = req.body;
  const query = 'INSERT INTO users (username, surname, contact, email, area) VALUES (?, ?, ?, ?, ?)';

  db.query(query, [username, surname, contact, email, area], (err, results) => {
    if (err) throw err;

    const mailOptions = {
      from: config.email.user,
      to: email,
      subject: 'Welcome to User Management System',
      text: `Hello ${username}, your account has been created. Username: ${username}, Password: your_password`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    });

    bot.sendMessage(config.telegram.chatId, `New user registered:
        Name: ${username},
        Surname: ${surname},
        Email: ${email},
        Area: ${area},
        Contact: ${contact}`);

    res.redirect('/admin/dashboard');
  });
});

// Search User
app.get('/admin/search-user', (req, res) => {
  if (!req.session.admin) {
    res.redirect('/admin/login');
  } else {
    res.render('search-user');
  }
});

app.post('/admin/search-user', (req, res) => {
  const { query } = req.body;
  const searchQuery = 'SELECT * FROM users WHERE username LIKE ? OR surname LIKE ? OR email LIKE ?';

  db.query(searchQuery, [`%${query}%`, `%${query}%`, `%${query}%`], (err, results) => {
    if (err) throw err;
    res.render('search-user', { users: results });
  });
});

// Edit User
app.get('/admin/edit-user/:id', (req, res) => {
    const userId = req.params.id;
    const query = 'SELECT * FROM users WHERE id = ?';
  
    db.query(query, [userId], (err, results) => {
      if (err) throw err;
  
      if (results.length > 0) {
        res.render('edit-user', { title: 'Edit User', user: results[0] });
      } else {
        res.send('User not found');
      }
    });
});

app.post('/admin/edit-user/:id', (req, res) => {
  if (!req.session.admin) {
    res.redirect('/admin/login');
  } else {
    const { id } = req.params;
    const { username, surname, contact, email, area } = req.body;
    const query = 'UPDATE users SET username = ?, surname = ?, contact = ?, email = ?, area = ? WHERE id = ?';

    db.query(query, [username, surname, contact, email, area, id], (err, results) => {
      if (err) throw err;
      res.redirect('/admin/dashboard');
    });
  }
});

// User Registration
app.get('/register', (req, res) => {
  res.render('user-register');
});

app.post('/register', (req, res) => {
    const { username, surname, contact, email, area, password } = req.body;
  
    // Check if user already exists
    checkIfUserExists(username, surname, email, (err, userExists) => {
      if (err) throw err;
  
      if (userExists) {
        res.send('User with this name, surname, and email already exists');
      } else {
        // Proceed with user registration
        const hashedPassword = bcrypt.hashSync(password, 8);
        const query = 'INSERT INTO users (username, surname, contact, email, area, password) VALUES (?, ?, ?, ?, ?, ?)';
  
        db.query(query, [username, surname, contact, email, area, hashedPassword], (err, results) => {
          if (err) throw err;
  
          // Optionally, send registration confirmation email
          const mailOptions = {
            from: config.email.user,
            to: email,
            subject: 'Registration Successful',
            text: `Hello ${username}, your account has been created. Username: ${username}, Password: ${password}`
          };
  
          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.log(error);
            } else {
              console.log('Email sent: ' + info.response);
            }
          });
  
          // Optionally, send Telegram notification
          bot.sendMessage(config.telegram.chatId, `New user registered: 
            Name: ${username},
            Surname: ${surname},
            Email: ${email},
            Area: ${area},
            Contact: ${contact}`);
  
          res.redirect('/login');
        });
      }
    });
  });

// User Login
app.get('/login', (req, res) => {
  res.render('user-login');
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const query = 'SELECT * FROM users WHERE email = ?';

  db.query(query, [email], (err, results) => {
    if (err) throw err;
    if (results.length > 0 && bcrypt.compareSync(password, results[0].password)) {
      req.session.user = results[0];
      res.redirect('/profile');
    } else {
      res.send('Invalid email or password');
    }
  });
});

// User Profile
app.get('/profile', (req, res) => {
  if (!req.session.user) {
    res.redirect('/login');
  } else {
    res.render('user-profile', { user: req.session.user });
  }
});

// Update User Details
app.post('/profile', (req, res) => {
  const { username, surname, contact, email, area } = req.body;
  const userId = req.session.user.id;
  const query = 'UPDATE users SET username = ?, surname = ?, contact = ?, email = ?, area = ? WHERE id = ?';

  db.query(query, [username, surname, contact, email, area, userId], (err, results) => {
    if (err) throw err;
    res.redirect('/profile');
  });
});

// Delete User Profile
app.post('/delete-profile', (req, res) => {
    const userId = req.session.user.id;
    const query = 'DELETE FROM users WHERE id = ?';
  
    db.query(query, [userId], (err, results) => {
      if (err) throw err;
      req.session.destroy();
      res.redirect('/login');
    });
  });
  

// Server
app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
