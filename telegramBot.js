const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const config = require('./config');

dotenv.config();

// Create a new Telegram bot instance
const bot2 = new TelegramBot(config.telegram.token, { polling: true });

// Set up MySQL connection
const db = mysql.createConnection({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database
});

db.connect((err) => {
  if (err) throw err;
  console.log('Connected to MySQL Database.');
});

// Function to check if user is admin
const isAdmin = (userId) => {
  // You should have a table or a list of admin user IDs
  const adminIds = [6781402998]; // Replace with actual admin Telegram user IDs
  return adminIds.includes(userId);
};

// Handle /start command
bot2.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot2.sendMessage(chatId, 'Welcome to the admin bot. Use /help to see available commands.');
});

// Handle /help command
bot2.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  if (isAdmin(msg.from.id)) {
    bot2.sendMessage(chatId, 'Available commands:\n/search [query]\n/edit [user_id]\n/update [user_id] [field] [value]');
  } else {
    bot2.sendMessage(chatId, 'You are not authorized to use this bot.');
  }
});

// Handle /search command
bot2.onText(/\/search (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];

  if (!isAdmin(msg.from.id)) {
    return bot2.sendMessage(chatId, 'You are not authorized to use this command.');
  }

  const sql = `SELECT * FROM users WHERE name LIKE ? OR surname LIKE ? OR email LIKE ?`;
  const values = [`%${query}%`, `%${query}%`, `%${query}%`];

  db.query(sql, values, (err, results) => {
    if (err) throw err;

    if (results.length > 0) {
      let response = 'Search results:\n';
      results.forEach((user) => {
        response += `ID: ${user.id}, Name: ${user.name}, Surname: ${user.surname}, Email: ${user.email}\n`;
      });
      bot2.sendMessage(chatId, response);
    } else {
      bot.sendMessage(chatId, 'No users found.');
    }
  });
});

// Handle /edit command
bot2.onText(/\/edit (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = match[1];

  if (!isAdmin(msg.from.id)) {
    return bot.sendMessage(chatId, 'You are not authorized to use this command.');
  }

  const sql = `SELECT * FROM users WHERE id = ?`;
  db.query(sql, [userId], (err, results) => {
    if (err) throw err;

    if (results.length > 0) {
      const user = results[0];
      bot.sendMessage(chatId, `Editing user:\nID: ${user.id}, Name: ${user.name}, Surname: ${user.surname}, Email: ${user.email}`);
    } else {
      bot.sendMessage(chatId, 'User not found.');
    }
  });
});

// Handle /update command
bot2.onText(/\/update (\d+) (\w+) (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = match[1];
  const field = match[2];
  const value = match[3];

  if (!isAdmin(msg.from.id)) {
    return bot.sendMessage(chatId, 'You are not authorized to use this command.');
  }

  const validFields = ['name', 'surname', 'email', 'contact_number', 'area'];
  if (!validFields.includes(field)) {
    return bot.sendMessage(chatId, `Invalid field. Valid fields are: ${validFields.join(', ')}`);
  }

  const sql = `UPDATE users SET ?? = ? WHERE id = ?`;
  db.query(sql, [field, value, userId], (err, results) => {
    if (err) throw err;

    if (results.affectedRows > 0) {
      bot.sendMessage(chatId, 'User updated successfully.');
    } else {
      bot.sendMessage(chatId, 'User not found or update failed.');
    }
  });
});

module.exports = bot2;
