
const path = require('path');
// Вказуємо шлях до .env, який лежить на рівень вище (..)
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const { Pool } = require('pg'); // Клієнт для роботи з PostgreSQL
const bcrypt = require('bcrypt'); // Інструмент для шифрування паролів
const cors = require('cors'); // Дозволяє запити з інших адрес (з вашого телефону)
const jwt = require('jsonwebtoken'); // Для створення токенів 

const app = express();
const PORT = 3000;

// Вбудовані модулі Node.js для роботи з файлами та шляхами
const fs = require('fs').promises;


const multer = require('multer');

// Налаштування Multer: куди зберігати і як називати файли
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, STORAGE_PATH); // Зберігаємо у нашу папку storage
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname); // Залишаємо оригінальну назву файлу
  }
});
const upload = multer({ storage: storage });

// Це папка на вашому сервері, де будуть лежати всі файли користувачів.
// __dirname - це поточна папка бекенду. Тобто файли будуть у api-server/storage
const STORAGE_PATH = path.join(__dirname, 'storage');

// --- ОХОРОНЕЦЬ (Middleware для перевірки JWT токена) ---
const authenticateToken = (req, res, next) => {
  // Шукаємо заголовок Authorization (формат: "Bearer <ваш_токен>")
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Доступ заборонено (немає перепустки)' });
  }

  // Перевіряємо, чи токен справжній і чи не закінчився його час
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Перепустка недійсна або прострочена' });
    
    // Якщо все добре, записуємо дані юзера (id, role) в req, щоб інші функції могли їх читати
    req.user = user; 
    next(); // Пропускаємо далі!
  });
};

// 2. Налаштування (Middleware)
app.use(cors());
app.use(express.json()); // Вчить сервер розуміти формат JSON, який пришле телефон

// 3. Підключення до бази даних PostgreSQL
const pool = new Pool({
  user: process.env.POSTGRES_USER, // Користувач для доступу до БД
  password: process.env.POSTGRES_PASSWORD, // Пароль для доступу до БД
  database: process.env.POSTGRES_DB, // Назва БД
  host: process.env.POSTGRES_HOST || 'localhost', // Ip БД
  port: 5432,
});

// 4. Ініціалізація бази: Створюємо таблицю користувачів, якщо її ще немає
const initDB = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user', -- НОВЕ: За замовчуванням всі 'user'
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(createTableQuery);
    console.log('✅ База даних готова: таблиця users перевірена.');
  } catch (err) {
    console.error('❌ Помилка створення таблиці:', err);
  }
};

// Запускаємо перевірку БД при старті сервера
initDB();

// --- АПІ МАРШРУТИ (ENDPOINTS) ---

// 5. Маршрут для РЕЄСТРАЦІЇ (POST /register)
app.post('/register', async (req, res) => {
  // Витягуємо email та пароль з того, що прислав телефон
  const { email, password } = req.body;

  // Базова перевірка
  if (!email || !password) {
    return res.status(400).json({ error: 'Email та пароль є обов\'язковими' });
  }

  try {
    // Перевіряємо, чи немає вже такого email в базі
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Користувач з таким email вже існує' });
    }

    // ШИФРУВАННЯ: Ніколи не зберігаємо чистий пароль!
    // 10 - це "вартість" шифрування (чим більше, тим безпечніше, але повільніше)
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Зберігаємо зашифровані дані в базу
    // $1 та $2 - це захист від SQL-ін'єкцій (хакерських атак)
    const insertQuery = 'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email';
    const newUser = await pool.query(insertQuery, [email, hashedPassword]);

    // Відповідаємо телефону, що все пройшло успішно
    res.status(201).json({ 
      message: 'Користувача успішно створено!',
      user: newUser.rows[0] // Повертаємо дані створеного юзера (без пароля!)
    });

  } catch (err) {
    console.error('Помилка реєстрації:', err);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

// Маршрут для ВХОДУ (POST /login)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email та пароль є обов\'язковими' });
  }

  try {
    // 1. Шукаємо користувача в базі
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Користувача з таким email не знайдено' });
    }
    const user = userResult.rows[0];

    // 2. Перевіряємо пароль (порівнюємо хеші)
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Неправильний пароль' });
    }

    // 3. Генеруємо JWT "перепустку" (вказуємо id та role)
    const token = jwt.sign(
      { id: user.id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' } // Перепустка діє 24 години
    );

    // 4. Відправляємо токен і дані користувача на телефон
    res.json({ 
      message: 'Успішний вхід!', 
      token: token,
      user: { email: user.email, role: user.role } 
    });

  } catch (err) {
    console.error('Помилка входу:', err);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

// --- Маршрут: Читання файлів (GET /files) ---
// Зверніть увагу: ми передаємо authenticateToken ДРУГИМ аргументом!
app.get('/files', authenticateToken, async (req, res) => {
  try {
    // 1. Створюємо папку storage, якщо її ще немає (щоб сервер не впав з помилкою)
    await fs.mkdir(STORAGE_PATH, { recursive: true });

    // 2. Читаємо вміст папки
    // withFileTypes: true дозволяє нам знати, чи це папка, чи файл
    const items = await fs.readdir(STORAGE_PATH, { withFileTypes: true });
    
    // 3. Формуємо гарний список для телефону
    const filesList = items.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory(),
    }));

    // Відправляємо список
    res.json({ files: filesList, role: req.user.role });
  } catch (err) {
    console.error('Помилка читання директорії:', err);
    res.status(500).json({ error: 'Не вдалося прочитати файли сервера' });
  }
});

// --- Маршрут: ЗАВАНТАЖЕННЯ файлу (POST /upload) ---
app.post('/upload', authenticateToken, upload.single('document'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не отримано' });
  }
  res.status(201).json({ message: 'Файл успішно завантажено!', filename: req.file.originalname });
});

// --- Маршрут: ВИДАЛЕННЯ файлу (DELETE /files/:filename) ---
app.delete('/files/:filename', authenticateToken, async (req, res) => {
  // 1. ПЕРЕВІРКА РОЛІ: Видаляти може ТІЛЬКИ admin!
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'У вас немає прав для видалення файлів' });
  }

  try {
    const fileName = req.params.filename;
    const filePath = path.join(STORAGE_PATH, fileName);

    // Видаляємо файл з жорсткого диска вашого Debian-сервера
    await fs.unlink(filePath);
    res.json({ message: 'Файл успішно видалено' });
  } catch (err) {
    console.error('Помилка видалення:', err);
    res.status(500).json({ error: 'Не вдалося видалити файл (можливо, він не існує)' });
  }
});

// --- Маршрут: ЗАВАНТАЖЕННЯ файлу НА ТЕЛЕФОН (GET /download/:filename) ---
app.get('/download/:filename', authenticateToken, (req, res) => {
  const fileName = req.params.filename;
  // Формуємо повний шлях до файлу на жорсткому диску
  const filePath = path.join(STORAGE_PATH, fileName);

  // Функція download сама перевіряє, чи є файл, і відправляє його
  res.download(filePath, fileName, (err) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: 'Файл не знайдено на сервері' });
      } else if (!res.headersSent) {
        res.status(500).json({ error: 'Помилка під час відправки файлу' });
      }
    }
  });
});

// 6. Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущено на порту ${PORT}`);
});